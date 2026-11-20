// Network play: peer-to-peer over WebRTC, no game server.
// Trystero finds the other player through public Nostr relays (only to exchange the WebRTC
// connection details, encrypted with the room code); the game itself then flows directly
// between the two browsers. Each side runs its own rules engine and validates every move.
//
// Protocol (one action "msg", JSON):
//   host  → guest  {t:'sync', hostColor, moves:[{from,to,promotion}], resigned, tc, clocks}   full game state
//   either → other {t:'move', n, from, to, promotion, left}       n = moves before it, left = mover's clock (ms)
//   either → other {t:'flag', color}                              that side ran out of time
//   either → other {t:'rematch-req'} | {t:'rematch-ok'} | {t:'rematch-no'}   rematch, colours swapped
//   either → other {t:'resign'}
//   guest → host   {t:'syncreq'}  |  {t:'newgame'}
//   host  → guest  {t:'busy'}     (room already has two players and the newcomer is an old client)
//   joiner → host  {t:'hello', watch, name}   sent on connecting: play (watch false) or only watch
//   sync also carries names {white, black}: the players' nicknames (may be empty)
//   host  → spectator {t:'sync', spectator:true, ...}   after hello and after every change of the game
//   host  → all    {t:'watchers', n}   number of spectators
// Spectators get the game from the host only; they cannot move, and the players do not wait for them.
//   either → other {t:'chat', text} | {t:'react', r}   chat, see chat.js (rate-limited both ways)
// Public rooms are also announced in a serverless lobby on Nostr relays (lobby.js).
import { joinRoom } from '@trystero-p2p/nostr';
import { createChat } from '/chat.js';
import { schnorr } from '@noble/secp256k1';
import { createLobby } from '/lobby.js';

const T = window.TriD;
const { t, onLangChange } = T;
const $ = (id) => document.getElementById(id);
const APP_ID = 'tri-d-chess-meder-v1';
const IT = new Proxy({}, { get: (_, k) => t(`name.${String(k)}`) });
let statusKey = null;
const other = (c) => (c === 'white' ? 'black' : 'white');

let room = null, msg = null;
let role = null;          // 'host' | 'guest' | 'spectator' (a guest becomes a spectator when the host says so)
let code = null;
let myColor = null;
let peer = null;          // connected opponent id
let sent = 0;             // moves of ours already sent (by history length)
let resignSent = false;
let wantWatch = false;    // we joined to watch
const spectators = new Set(); // host: peer ids of the spectators
const pending = new Map();    // host: peer id -> timer, waiting for its hello
let watchers = 0;             // spectators in the room (shown to everybody)
let oppName = '';             // host: the opponent's nickname
// nicknames: plain text, no control or direction characters, at most 24 characters
const cleanNick = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);
const myNick = () => cleanNick($('netName').value);
function setNames(names) {
  const n = { white: cleanNick(names?.white), black: cleanNick(names?.black) };
  T.setNames(n);
}
const oppNick = () => (myColor ? T.names?.[other(myColor)] || '' : '');

function setStatus(key, cls = '') {
  statusKey = key;
  const el = $('netStatus');
  el.textContent = t(key);
  el.className = cls;
}
onLangChange(() => {
  if (statusKey) $('netStatus').textContent = t(statusKey);
  if (myColor) $('netMe').textContent = IT[myColor];
});

function showActive(on) {
  $('netIdle').hidden = on;
  $('netActive').hidden = !on;
  // network games are human vs human only: lock the player / computer settings while a room is open
  for (const id of ['gameKind', 'selW', 'selB', 'lvlW', 'lvlB', 'styW', 'styB']) $(id).disabled = on;
}

// Tell the game server a room is open, so it refuses any non human-vs-human game meanwhile.
const setRoomFlag = (open) => T.post('/api/net-room', { open });

// draughts captures carry their route in `promotion` ("c3xe5xg7")
const movesOf = (s) => s.history.map((h) => ({ from: h.from, to: h.to, promotion: h.promotion || (h.path && h.path.length > 2 ? h.path.join('x') : null) }));
const knownKind = (k) => ((T.kinds || ['trid', 'chess']).includes(k) ? k : 'trid');

function newCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(r, (b) => abc[b % abc.length]).join('');
}

// --- sending ----------------------------------------------------------------------------
function send(data) {
  if (msg && peer) msg.send(data, { target: peer }).catch(() => {});
}
const sendTo = (id, data) => { if (msg && id) msg.send(data, { target: id }).catch(() => {}); };

function syncMsg() {
  const s = T.getState();
  if (!s) return null;
  const resigned = s.status === 'resigned' ? other(s.winner) : null;
  const flaggedSide = s.status === 'timeout' ? other(s.winner) : s.drawReason === 'time-material' ? s.turn : null;
  return { t: 'sync', kind: s.kind || 'trid', hostColor: myColor, names: { [myColor]: myNick(), [other(myColor)]: oppName }, moves: movesOf(s), resigned, flagged: flaggedSide, tc, clocks: tc ? { white: remaining('white'), black: remaining('black') } : null };
}
function sendSync() {
  const m = syncMsg();
  if (m) send(m);
}
// host: the whole game to one spectator, or to all of them
function syncSpectators(ids = spectators) {
  const m = syncMsg();
  if (m) for (const id of ids) sendTo(id, { ...m, spectator: true, watchers });
}
function setWatchers(n) {
  watchers = n;
  $('netWatchRow').hidden = !(room && n > 0);
  $('netWatchers').textContent = String(n);
}
function broadcastWatchers() {
  setWatchers(spectators.size);
  const m = { t: 'watchers', n: spectators.size };
  send(m);
  for (const id of spectators) sendTo(id, m);
}
// host: a newcomer said hello (or never did, for older versions): seat it or let it watch
function admit(id, watch, legacy = false, name = '') {
  clearTimeout(pending.get(id));
  pending.delete(id);
  if (!room || role !== 'host' || spectators.has(id) || id === peer) return;
  if (!watch && !peer) { oppName = cleanNick(name); return seatOpponent(id); }
  if (legacy) { sendTo(id, { t: 'busy' }); return; }
  spectators.add(id);
  syncSpectators([id]);
  broadcastWatchers();
  chat.system(t('chat.watcherIn'));
}
function seatOpponent(id) {
  peer = id;
  everJoined = true;
  setNames({ [myColor]: myNick(), [other(myColor)]: oppName });
  renderRematch();
  renderShare();
  if (isPublic) announceRoom(true);
  chat.show(true);
  chat.system(oppName ? t('chat.joinedName', { n: oppName }) : t('chat.joined'));
  sendSync();
  send({ t: 'watchers', n: spectators.size });
  setStatus('net.connected', 'ok');
}
// joiner: the host answered for the first time
function firstContact(id, asSpectator, hostName = '') {
  peer = id;
  everJoined = true;
  clearTimeout(joinTimer);
  role = asSpectator ? 'spectator' : 'guest';
  renderRematch();
  renderShare();
  if (!asSpectator) { chat.show(true); chat.system(hostName ? t('chat.joinedName', { n: hostName }) : t('chat.joined')); }
  else if (!wantWatch) T.toast(t('net.fullWatching'));
}

// After every state change: forward our own new moves / resignation to the opponent.
function onState(s) {
  if (!room || !myColor || s.players[myColor] !== 'human' || s.players[other(myColor)] !== 'remote') return;
  if (s.history.length < sent) sent = s.history.length; // new game
  clockOnState(s);
  renderRematch();
  while (sent < s.history.length) {
    const h = s.history[sent];
    if (h.color === myColor) send({ t: 'move', n: sent, from: h.from, to: h.to, promotion: h.promotion || null, left: tc ? clocks[myColor] : null });
    sent++;
  }
  if (s.status === 'resigned' && s.winner !== myColor && !resignSent) { resignSent = true; send({ t: 'resign' }); }
  if (s.status === 'playing') resignSent = false;
}

// --- receiving --------------------------------------------------------------------------
async function onMessage(data, peerId) {
  if (!data || typeof data !== 'object') return;
  if (role === 'host' && data.t === 'hello') { if (peerId !== peer && !spectators.has(peerId)) admit(peerId, !!data.watch, false, data.name); return; }
  // an older host turns away a third visitor
  if (role !== 'host' && !peer && data.t === 'busy') { leave(true); T.toast(t('net.busy')); return; }
  // a joiner learns who the host is from the first sync it gets
  if (role !== 'host' && !peer && data.t === 'sync') firstContact(peerId, !!data.spectator, cleanNick(data.names?.[data.hostColor]));
  if (peerId !== peer) return;
  if (role === 'spectator') return onSpectatorMessage(data);
  switch (data.t) {
    case 'watchers': if (Number.isInteger(data.n) && data.n >= 0) setWatchers(Math.min(data.n, 999)); break;
    case 'sync': {
      if (role !== 'guest') return;
      if (data.spectator) { role = 'spectator'; return onSpectatorMessage(data); }
      myColor = other(data.hostColor);
      $('netMe').textContent = IT[myColor];
      setNames({ ...data.names, [myColor]: myNick() });
      const body = { kind: knownKind(data.kind), [myColor]: 'human', [data.hostColor]: 'remote', moves: Array.isArray(data.moves) ? data.moves : [], resigned: data.resigned || null };
      setTimeControl(validTc(data.tc));
      const r = await T.post('/api/net-sync', body);
      if (data.flagged === 'white' || data.flagged === 'black') await T.post('/api/flag', { color: data.flagged });
      sent = T.getState()?.history.length ?? 0;
      syncClocks(data.clocks);
      offerFrom = false; rematchAsked = false; renderRematch();
      resignSent = !!data.resigned;
      if (r.error) setStatus('net.desync', 'err');
      else setStatus('net.connected', 'ok');
      break;
    }
    case 'move': {
      if (tc && Number.isFinite(data.left)) incomingLeft = data.left;
      const r = await T.post('/api/remote-move', { n: data.n, from: data.from, to: data.to, promotion: data.promotion });
      if (r.error) {
        // out of step: the host's game is the reference
        if (role === 'guest') send({ t: 'syncreq' });
        else sendSync();
      } else sent = Math.max(sent, data.n + 1);
      break;
    }
    case 'resign': {
      const s = T.getState();
      if (s?.status === 'playing') await T.post('/api/resign', { color: other(myColor) });
      resignSent = true;
      break;
    }
    case 'syncreq': if (role === 'host') sendSync(); break;
    case 'flag': {
      const s = T.getState();
      if (!tc || s?.status !== 'playing' || !['white', 'black'].includes(data.color)) break;
      // a claim against us is accepted only if our own clock agrees (latency margin)
      if (data.color === myColor && remaining(myColor) > 2000) { sendSync(); break; }
      flagged = true;
      await T.post('/api/flag', { color: data.color });
      break;
    }
    case 'rematch-req': {
      const s = T.getState();
      if (!s || s.status === 'playing') break;
      offerFrom = true; renderRematch();
      T.toast(t('rematch.offer'));
      break;
    }
    case 'rematch-ok':
      if (!rematchAsked) break;
      rematchAsked = false;
      if (role === 'host') await doRematch();
      break;
    case 'rematch-no':
      if (rematchAsked) { rematchAsked = false; renderRematch(); T.toast(t('rematch.declined')); }
      break;
    case 'newgame':
      if (role === 'host') { T.toast(t('net.peerNew')); await startHostGame(); }
      break;
    case 'chat':
    case 'react':
      chat.receive(data);
      break;
    case 'busy':
      leave(true);
      T.toast(t('net.busy'));
      break;
  }
}

// spectator: mirror the host's game (a single new move is played, so it animates)
async function onSpectatorMessage(data) {
  if (data.t === 'watchers') { if (Number.isInteger(data.n) && data.n >= 0) setWatchers(Math.min(data.n, 999)); return; }
  if (data.t === 'busy') { leave(true); T.toast(t('net.busy')); return; }
  if (data.t !== 'sync' || !Array.isArray(data.moves)) return;
  myColor = null;
  setNames(data.names);
  $('netMe').textContent = t('net.spectator');
  setStatus('net.watching', 'ok');
  if (Number.isInteger(data.watchers)) setWatchers(Math.min(data.watchers, 999));
  const kind = knownKind(data.kind);
  setTimeControl(validTc(data.tc));
  const s = T.getState(), n = data.moves.length;
  const same = (a, b) => a.from === b.from && a.to === b.to && (a.promotion || null) === (b.promotion || null);
  const oneMore = s && (s.kind || 'trid') === kind && s.status === 'playing' && Object.values(s.players).every((p) => p === 'remote')
    && s.history.length === n - 1 && s.history.every((h, i) => same(h, data.moves[i]));
  let r = null;
  if (oneMore) { const m = data.moves[n - 1]; r = await T.post('/api/remote-move', { n: n - 1, from: m.from, to: m.to, promotion: m.promotion }); }
  if (!oneMore || r?.error) {
    const sameGame = s && (s.kind || 'trid') === kind && s.history.length === n && s.history.every((h, i) => same(h, data.moves[i]));
    if (!sameGame || (data.resigned && s.status === 'playing')) {
      await T.post('/api/net-sync', { kind, white: 'remote', black: 'remote', watch: true, moves: data.moves, resigned: data.resigned || null });
    }
  }
  const after = T.getState();
  if ((data.flagged === 'white' || data.flagged === 'black') && after?.status === 'playing') await T.post('/api/flag', { color: data.flagged });
  syncClocks(data.clocks);
}

// --- rooms --------------------------------------------------------------------------------
function open(roomCode) {
  room = joinRoom({ appId: APP_ID }, roomCode);
  msg = room.makeAction('msg');
  msg.onMessage = (data, { peerId }) => onMessage(data, peerId);
  room.onPeerJoin = (id) => {
    if (role === 'host') {
      // wait for the newcomer's hello (play or watch); older versions never send one
      if (!pending.has(id) && !spectators.has(id) && id !== peer) pending.set(id, setTimeout(() => admit(id, false, true), 2500));
      return;
    }
    // joiner: say hello to everyone; only the host answers
    sendTo(id, { t: 'hello', watch: wantWatch, name: myNick() });
    if (!peer) setStatus('net.syncing', 'warn');
  };
  room.onPeerLeave = (id) => {
    if (role === 'host') {
      clearTimeout(pending.get(id)); pending.delete(id);
      if (spectators.delete(id)) { broadcastWatchers(); return; }
    }
    if (id !== peer) return;
    peer = null;
    renderRematch();
    setStatus('net.peerLeft', 'warn');
    chat.system(oppNick() ? t('chat.leftName', { n: oppNick() }) : t('chat.left'));
  };
}

let hostKind = 'trid'; // game kind of the room we host (chosen in the Game menu before hosting)
async function startHostGame() {
  resetClocks();
  lastN = 0;
  await T.post('/api/new', { kind: hostKind, [myColor]: 'human', [other(myColor)]: 'remote' });
  sent = 0; resignSent = false;
  offerFrom = false; rematchAsked = false;
  sendSync();
  renderRematch();
}

async function host() {
  const pick = $('netColor').value;
  myColor = pick === 'random' ? (crypto.getRandomValues(new Uint8Array(1))[0] % 2 ? 'white' : 'black') : pick;
  role = 'host';
  hostKind = knownKind($('gameKind').value);
  code = newCode();
  setTimeControl(validTc(parseTc($('netTime').value)));
  await setRoomFlag(true);
  await startHostGame();
  open(code);
  $('netRoom').textContent = code;
  $('netMe').textContent = IT[myColor];
  showActive(true);
  isPublic = $('netPublic').checked;
  setStatus(isPublic ? 'net.waitingPublic' : 'net.waiting', 'warn');
  if (isPublic) announceRoom(false);
  lobbyView(false);
  everJoined = false;
  renderShare(); // (no ?room= for the host: a reload would make it join its own room as a guest)
}

// public room in the lobby: "open" while waiting, then "live" (watchable) once the opponent is in
let roomName = '';
function announceRoom(live) {
  if (!live) roomName = saveName();
  lobby.announce({ code, kind: hostKind, hostColor: myColor, lang: document.documentElement.lang === 'en' ? 'en' : 'it', name: roomName, live }).catch(() => {});
}

function join(watch = false) {
  const c = $('netCode').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length < 4) { T.toast(t('net.needCode')); return; }
  role = 'guest';
  wantWatch = !!watch;
  code = c;
  myColor = null;
  setRoomFlag(true);
  lobbyView(false);
  open(code);
  // a room from the lobby may already be full or closed: give up if nobody answers
  clearTimeout(joinTimer);
  joinTimer = setTimeout(() => {
    if (role === 'guest' && !peer && code === c) { lobby.hide(c); leave(true); T.toast(t('lobby.noAnswer')); }
  }, 20000);
  $('netRoom').textContent = code;
  $('netMe').textContent = '—';
  setStatus('net.searching', 'warn');
  showActive(true);
  setRoomInUrl(code, wantWatch);
  renderShare();
}

function leave(silent = false) {
  try { room?.leave(); } catch {}
  room = null; msg = null; peer = null; role = null; code = null; myColor = null; sent = 0; wantWatch = false;
  for (const tm of pending.values()) clearTimeout(tm);
  pending.clear(); spectators.clear(); setWatchers(0);
  oppName = ''; T.setNames({ white: '', black: '' });
  setTimeControl(null);
  offerFrom = false; rematchAsked = false; renderRematch();
  showActive(false);
  setRoomFlag(false);
  if (isPublic) lobby.unannounce().catch(() => {});
  isPublic = false;
  lobbyView(true);
  chat.show(false);
  chat.clear();
  setRoomInUrl(null);
  renderShare();
  if (!silent) T.toast(t('net.left'));
}

// "Nuova partita" while in a room: the host restarts the network game, the guest asks the host.
function wrapNewGame(id) {
  const btn = $(id);
  const original = btn.onclick;
  btn.onclick = (e) => {
    if (!room) return original?.(e);
    if (role === 'spectator') return T.toast(t('net.spectatorNew'));
    if (role === 'host') return startHostGame();
    if (!peer) return T.toast(t('net.peerAway'));
    send({ t: 'newgame' });
  };
}

const chat = createChat({ t, send, onLangChange, themName: oppNick });

// --- lobby: open public rooms -------------------------------------------------------------
let isPublic = false;
let everJoined = false;
let joinTimer = null;
let lobbyRooms = [];
let lobbyState = { relays: 0, total: 0 };
let lobbyOn = false;
const NAME_KEY = 'tridchess.name';
try { $('netName').value = localStorage.getItem(NAME_KEY) || ''; } catch {}
$('netName').addEventListener('change', () => { saveName(); if (role === 'host' && peer) { setNames({ [myColor]: myNick(), [other(myColor)]: oppName }); sendSync(); syncSpectators(); } });
function saveName() {
  const v = $('netName').value.trim().slice(0, 24);
  try { localStorage.setItem(NAME_KEY, v); } catch {}
  return v;
}
const ago = (sec) => { const m = Math.floor(Math.max(0, Date.now() / 1000 - sec) / 60); return m < 1 ? t('lobby.now') : t('lobby.min', { n: m }); };
const fold = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Room matches the search text: name, code, language and the colour *you* would play (as listed)
function matches(r, q) {
  if (!q) return true;
  const mine = other(r.hostColor);
  const hay = fold([r.name || t('lobby.anon'), r.code, t('game.' + r.kind), r.lang, r.live ? t('lobby.live') : '', IT[mine], mine, t('lobby.youPlay', { c: IT[mine] })].join(' '));
  return fold(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}
function renderLobby() {
  const relays = lobbyState.relays ? t('lobby.relays', { n: lobbyState.relays }) : '';
  $('lobbyRelays').textContent = relays;
  $('lobbyCount').textContent = String(lobbyRooms.length);
  $('lobbyCount').hidden = !lobbyRooms.length;
  if ($('lobbyModal').hidden) return;
  $('lobbyModalRelays').textContent = relays;
  const box = $('lobbyList');
  box.textContent = '';
  const q = $('lobbySearch').value.trim();
  const shown = lobbyRooms.filter((r) => matches(r, q));
  if (!shown.length) {
    const p = document.createElement('div');
    p.className = 'lobbyempty';
    p.textContent = !lobbyState.relays ? t('lobby.searching') : lobbyRooms.length ? t('lobby.noMatch') : t('lobby.empty');
    box.append(p);
    return;
  }
  for (const r of shown) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lobbyitem';
    const name = document.createElement('span');
    name.className = 'ln';
    name.textContent = r.name || t('lobby.anon');
    const meta = document.createElement('span');
    meta.className = 'lm';
    meta.textContent = r.live
      ? `${t('game.' + r.kind)} · ${t('lobby.live')} · ${r.lang.toUpperCase()} · ${ago(r.since)}`
      : `${t('game.' + r.kind)} · ${t('lobby.youPlay', { c: IT[other(r.hostColor)] })} · ${r.lang.toUpperCase()} · ${ago(r.since)}`;
    if (r.live) b.classList.add('live');
    const codeTag = document.createElement('code');
    codeTag.className = 'lc';
    codeTag.textContent = r.code;
    b.append(name, meta, codeTag);
    b.title = r.live ? t('lobby.watch') : t('lobby.join');
    b.onclick = () => { closeLobby(); $('netCode').value = r.code; join(!!r.live); };
    box.append(b);
  }
}
let lastFocus = null;
function openLobby() {
  lastFocus = document.activeElement;
  $('lobbyModal').hidden = false;
  renderLobby();
  setTimeout(() => $('lobbySearch').focus(), 30);
}
function closeLobby() {
  if ($('lobbyModal').hidden) return;
  $('lobbyModal').hidden = true;
  lastFocus?.focus?.();
}
$('lobbyOpen').onclick = openLobby;
$('lobbyClose').onclick = closeLobby;
$('lobbyModal').addEventListener('click', (e) => { if (e.target === $('lobbyModal')) closeLobby(); });
$('lobbySearch').addEventListener('input', renderLobby);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('lobbyModal').hidden) { e.stopPropagation(); closeLobby(); } }, true);
const lobby = createLobby({
  schnorr,
  onRooms: (list) => { lobbyRooms = list; renderLobby(); },
  onStatus: (s) => { lobbyState = s; renderLobby(); },
});
function lobbyView(on) {
  if (on === lobbyOn) return;
  lobbyOn = on;
  if (!on) closeLobby();
  if (on) lobby.listen(); else lobby.unlisten();
}
onLangChange(renderLobby);
lobbyView(true);
renderLobby();

// --- chess clock -----------------------------------------------------------------------
// Each side counts the clock of the side to move; a move carries the mover's remaining time.
// Clocks start after both players' first move. Your own flag: you lose. The opponent's flag
// is claimed after a grace period, so a stalled or modified client cannot freeze the game.
let tc = null;                      // { base, inc } in ms, or null = no clock
let clocks = { white: 0, black: 0 };
let clockTurn = null, turnStart = 0, lastN = 0, flagged = false, incomingLeft = null;
const CLOCK_GRACE = 3000;
const parseTc = (v) => { const m = /^(\d+)\+(\d+)$/.exec(String(v || '')); return m && +m[1] > 0 ? { base: +m[1] * 1000, inc: +m[2] * 1000 } : null; };
const validTc = (x) => (x && Number.isFinite(x.base) && x.base >= 60000 && x.base <= 3600000 && Number.isFinite(x.inc) && x.inc >= 0 && x.inc <= 60000 ? { base: x.base, inc: x.inc } : null);
function setTimeControl(x) { tc = x; resetClocks(); renderClock(); }
function resetClocks() { clocks = tc ? { white: tc.base, black: tc.base } : { white: 0, black: 0 }; clockTurn = null; flagged = false; incomingLeft = null; }
const clockLive = (s) => !!(tc && room && s && s.status === 'playing' && s.history.length >= 2);
function remaining(c) {
  let ms = clocks[c];
  if (c === clockTurn && clockLive(T.getState())) ms -= performance.now() - turnStart;
  return ms;
}
function syncClocks(cl) {
  const s = T.getState();
  if (tc && cl && Number.isFinite(cl.white) && Number.isFinite(cl.black)) clocks = { white: Math.max(0, Math.min(cl.white, tc.base * 4)), black: Math.max(0, Math.min(cl.black, tc.base * 4)) };
  lastN = s?.history.length ?? 0; clockTurn = s?.turn ?? null; turnStart = performance.now(); flagged = false;
}
// called on every state: charge the mover's clock when a move appears
function clockOnState(s) {
  if (!tc) return;
  const n = s.history.length;
  if (n === lastN) return;
  if (n < lastN) { resetClocks(); lastN = n; clockTurn = s.turn; turnStart = performance.now(); return; }
  const mover = s.history[n - 1].color;
  const timed = n - 1 >= 2; // the first move of each side is not timed
  if (mover === myColor) { if (timed) clocks[myColor] = Math.max(0, clocks[myColor] - (performance.now() - turnStart)) + tc.inc; }
  else if (incomingLeft != null) { clocks[mover] = Math.max(0, Math.min(incomingLeft, clocks[mover] + tc.inc + 1000)); incomingLeft = null; }
  lastN = n; clockTurn = s.turn; turnStart = performance.now();
}
const fmtClock = (ms) => { ms = Math.max(0, ms); const sec = ms < 10000 ? Math.ceil(ms / 100) / 10 : Math.ceil(ms / 1000); return ms < 10000 ? sec.toFixed(1) : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
function renderClock() {
  const el = $('netClock');
  const on = !!(tc && room);
  el.hidden = !on;
  document.body.classList.toggle('has-clock', on);
  if (!on) return;
  const s = T.getState();
  for (const c of ['white', 'black']) {
    const box = el.querySelector(`[data-c="${c}"]`);
    const ms = remaining(c);
    box.querySelector('.ct').textContent = fmtClock(ms);
    box.querySelector('.cn').textContent = (T.names?.[c] || IT[c]) + (myColor && c === myColor ? ' ★' : '');
    box.classList.toggle('active', clockLive(s) && s.turn === c);
    box.classList.toggle('low', ms < 30000);
  }
}
setInterval(() => {
  renderClock();
  if (role === 'spectator') return;
  const s = T.getState();
  // also when the opponent has left: their clock keeps running and can still run out
  if (!clockLive(s) || flagged) return;
  const c = s.turn, ms = remaining(c);
  if ((c === myColor && ms <= 0) || (c !== myColor && ms <= -CLOCK_GRACE)) {
    flagged = true;
    T.post('/api/flag', { color: c });
    send({ t: 'flag', color: c });
  }
}, 200);

// --- rematch ----------------------------------------------------------------------------
let offerFrom = false;   // the opponent offered a rematch
let rematchAsked = false; // we offered one
function renderRematch() {
  const s = T.getState();
  const over = !!(room && peer && myColor && role !== 'spectator' && s && s.status !== 'playing' && s.players[other(myColor)] === 'remote');
  $('rematchBox').hidden = !over;
  $('vRematch').hidden = !over || offerFrom;
  $('netRematch').hidden = offerFrom;
  $('netRematch').disabled = $('vRematch').disabled = rematchAsked;
  $('rematchOffer').hidden = !(over && offerFrom);
  $('vRematchOffer').hidden = !(over && offerFrom);
}
function askRematch() {
  if (offerFrom) return acceptRematch();
  rematchAsked = true; renderRematch();
  send({ t: 'rematch-req' });
  T.toast(t('rematch.sent'));
}
async function acceptRematch() {
  offerFrom = false; renderRematch();
  send({ t: 'rematch-ok' });
  rematchAsked = role !== 'host'; // the host starts the new game right away
  if (role === 'host') await doRematch();
}
function declineRematch() { offerFrom = false; renderRematch(); send({ t: 'rematch-no' }); }
async function doRematch() {
  myColor = other(myColor);
  setNames({ [myColor]: myNick(), [other(myColor)]: oppName });
  $('netMe').textContent = IT[myColor];
  await startHostGame();
  T.toast(t('rematch.started', { c: IT[myColor] }));
}
for (const id of ['netRematch', 'vRematch']) $(id).onclick = askRematch;
for (const id of ['rmAccept', 'vRmAccept']) $(id).onclick = acceptRematch;
for (const id of ['rmDecline', 'vRmDecline']) $(id).onclick = declineRematch;
onLangChange(() => { renderClock(); renderRematch(); renderShare(); });

// --- invite: room link + dedicated post for each network ------------------------------
// The link always points to the public browser demo, so the invited player needs nothing installed.
const SHARE_BASE = 'https://nicolorisitano82.github.io/tri-d-chess/play/';
const ROOM_RE = /^[A-Z2-9]{8}$/;
const roomLink = () => `${SHARE_BASE}?room=${code}`;
const enc = encodeURIComponent;
// the post names the game of the room: Tri-D, classic chess or the draughts variant
const shareFamily = () => (hostKind.startsWith('dama-') ? 'dama' : hostKind === 'chess' ? 'chess' : 'trid');
function shareText() {
  const f = shareFamily();
  let v = t('game.' + hostKind).replace(/\s*\(.*\)$/, '');      // "Dama inglese (Checkers)" → "Dama inglese"
  if (document.documentElement.lang !== 'en') v = v[0].toLowerCase() + v.slice(1); // "Sfidami a dama italiana"
  const g = t('share.g.' + f, { v });
  return t('share.text', { g, c: IT[myColor], o: IT[other(myColor)], code });
}
function renderShare() {
  const show = role === 'host' && !!code && !peer && !everJoined;
  $('shareBox').hidden = !show;
  if (!show) return;
  const url = roomLink(), text = shareText();
  $('shX').href = `https://x.com/intent/post?text=${enc(text + ' ' + t('share.tag.' + shareFamily()))}&url=${enc(url)}`;
  $('shThreads').href = `https://www.threads.net/intent/post?text=${enc(text + ' ' + url)}`;
  $('shFacebook').href = `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`;
  $('shWhatsApp').href = `https://wa.me/?text=${enc(text + ' ' + url)}`;
  $('shTelegram').href = `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`;
  $('shNative').hidden = typeof navigator.share !== 'function';
}
$('shCopy').onclick = () => navigator.clipboard?.writeText(roomLink()).then(() => T.toast(t('share.copied')), () => {});
$('shNative').onclick = () => navigator.share?.({ title: t('game.' + hostKind), text: shareText(), url: roomLink() }).catch(() => {});
onLangChange(renderShare);
// keep ?room=CODE in the address while in a room, so a reload reconnects
function setRoomInUrl(c, watch = false) {
  try {
    const u = new URL(location.href);
    u.searchParams.delete('room'); u.searchParams.delete('watch');
    if (c) u.searchParams.set(watch ? 'watch' : 'room', c);
    history.replaceState(null, '', u);
  } catch {}
}

$('netHost').onclick = () => host().catch((e) => T.toast(t('net.unavailable', { e: e.message })));
$('netJoin').onclick = () => { try { join(); } catch (e) { T.toast(t('net.unavailable', { e: e.message })); } };
$('netWatch').onclick = () => { try { join(true); } catch (e) { T.toast(t('net.unavailable', { e: e.message })); } };
$('netCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('netJoin').click(); });
$('netLeave').onclick = () => leave();
$('netCopy').onclick = () => navigator.clipboard?.writeText(code || '').then(() => T.toast(t('net.codeCopied')), () => {});
wrapNewGame('btnNew');
wrapNewGame('vNew');
T.listeners.push((s) => onState(s));
let lastSpecV = null;
T.listeners.push((s) => {
  if (role !== 'host' || !spectators.size) return;
  const v = `${s.id}:${s.version}`;
  if (v === lastSpecV) return;
  lastSpecV = v;
  syncSpectators();
});
{
  const qs = new URLSearchParams(location.search);
  const linked = (qs.get('room') || '').toUpperCase(), watching = (qs.get('watch') || '').toUpperCase();
  if (ROOM_RE.test(linked)) { $('netCode').value = linked; setTimeout(() => { try { join(); } catch {} }, 300); }
  else if (ROOM_RE.test(watching)) { $('netCode').value = watching; setTimeout(() => { try { join(true); } catch {} }, 300); }
}
window.addEventListener('beforeunload', () => {
  try { room?.leave(); } catch {}
  if (isPublic) lobby.unannounce().catch(() => {});
  if (room) { try { navigator.sendBeacon('/api/net-room', new Blob([JSON.stringify({ open: false })], { type: 'application/json' })); } catch {} }
});
