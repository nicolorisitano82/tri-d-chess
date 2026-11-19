// Network play: peer-to-peer over WebRTC, no game server.
// Trystero finds the other player through public Nostr relays (only to exchange the WebRTC
// connection details, encrypted with the room code); the game itself then flows directly
// between the two browsers. Each side runs its own rules engine and validates every move.
//
// Protocol (one action "msg", JSON):
//   host  → guest  {t:'sync', hostColor, moves:[{from,to,promotion}], resigned}   full game state
//   either → other {t:'move', n, from, to, promotion}                             n = moves before it
//   either → other {t:'resign'}
//   guest → host   {t:'syncreq'}  |  {t:'newgame'}
//   host  → guest  {t:'busy'}     (room already has two players)
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
let role = null;          // 'host' | 'guest'
let code = null;
let myColor = null;
let peer = null;          // connected opponent id
let sent = 0;             // moves of ours already sent (by history length)
let resignSent = false;

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
  for (const id of ['selW', 'selB', 'lvlW', 'lvlB', 'styW', 'styB']) $(id).disabled = on;
}

// Tell the game server a room is open, so it refuses any non human-vs-human game meanwhile.
const setRoomFlag = (open) => T.post('/api/net-room', { open });

const movesOf = (s) => s.history.map((h) => ({ from: h.from, to: h.to, promotion: h.promotion || null }));

function newCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(r, (b) => abc[b % abc.length]).join('');
}

// --- sending ----------------------------------------------------------------------------
function send(data) {
  if (msg && peer) msg.send(data, { target: peer }).catch(() => {});
}

function sendSync() {
  const s = T.getState();
  if (!s) return;
  const resigned = s.status === 'resigned' ? other(s.winner) : null;
  send({ t: 'sync', hostColor: myColor, moves: movesOf(s), resigned });
}

// After every state change: forward our own new moves / resignation to the opponent.
function onState(s) {
  if (!room || !myColor || s.players[myColor] !== 'human' || s.players[other(myColor)] !== 'remote') return;
  if (s.history.length < sent) sent = s.history.length; // new game
  while (sent < s.history.length) {
    const h = s.history[sent];
    if (h.color === myColor) send({ t: 'move', n: sent, from: h.from, to: h.to, promotion: h.promotion || null });
    sent++;
  }
  if (s.status === 'resigned' && s.winner !== myColor && !resignSent) { resignSent = true; send({ t: 'resign' }); }
  if (s.status === 'playing') resignSent = false;
}

// --- receiving --------------------------------------------------------------------------
async function onMessage(data, peerId) {
  if (peerId !== peer || !data || typeof data !== 'object') return;
  switch (data.t) {
    case 'sync': {
      if (role !== 'guest') return;
      myColor = other(data.hostColor);
      $('netMe').textContent = IT[myColor];
      const body = { [myColor]: 'human', [data.hostColor]: 'remote', moves: Array.isArray(data.moves) ? data.moves : [], resigned: data.resigned || null };
      const r = await T.post('/api/net-sync', body);
      sent = T.getState()?.history.length ?? 0;
      resignSent = !!data.resigned;
      if (r.error) setStatus('net.desync', 'err');
      else setStatus('net.connected', 'ok');
      break;
    }
    case 'move': {
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

// --- rooms --------------------------------------------------------------------------------
function open(roomCode) {
  room = joinRoom({ appId: APP_ID }, roomCode);
  msg = room.makeAction('msg');
  msg.onMessage = (data, { peerId }) => onMessage(data, peerId);
  room.onPeerJoin = (id) => {
    if (peer && peer !== id) { msg.send({ t: 'busy' }, { target: id }).catch(() => {}); return; }
    peer = id;
    clearTimeout(joinTimer);
    if (isPublic) lobby.unannounce().catch(() => {});
    chat.show(true);
    chat.system(t('chat.joined'));
    if (role === 'host') { sendSync(); setStatus('net.connected', 'ok'); }
    else setStatus('net.syncing', 'warn');
  };
  room.onPeerLeave = (id) => {
    if (id !== peer) return;
    peer = null;
    setStatus('net.peerLeft', 'warn');
    chat.system(t('chat.left'));
  };
}

async function startHostGame() {
  await T.post('/api/new', { [myColor]: 'human', [other(myColor)]: 'remote' });
  sent = 0; resignSent = false;
  sendSync();
}

async function host() {
  const pick = $('netColor').value;
  myColor = pick === 'random' ? (crypto.getRandomValues(new Uint8Array(1))[0] % 2 ? 'white' : 'black') : pick;
  role = 'host';
  code = newCode();
  await setRoomFlag(true);
  await startHostGame();
  open(code);
  $('netRoom').textContent = code;
  $('netMe').textContent = IT[myColor];
  showActive(true);
  isPublic = $('netPublic').checked;
  setStatus(isPublic ? 'net.waitingPublic' : 'net.waiting', 'warn');
  if (isPublic) lobby.announce({ code, hostColor: myColor, lang: document.documentElement.lang === 'en' ? 'en' : 'it', name: saveName() }).catch(() => {});
  lobbyView(false);
}

function join() {
  const c = $('netCode').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length < 4) { T.toast(t('net.needCode')); return; }
  role = 'guest';
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
}

function leave(silent = false) {
  try { room?.leave(); } catch {}
  room = null; msg = null; peer = null; role = null; code = null; myColor = null; sent = 0;
  showActive(false);
  setRoomFlag(false);
  if (isPublic) lobby.unannounce().catch(() => {});
  isPublic = false;
  lobbyView(true);
  chat.show(false);
  chat.clear();
  if (!silent) T.toast(t('net.left'));
}

// "Nuova partita" while in a room: the host restarts the network game, the guest asks the host.
function wrapNewGame(id) {
  const btn = $(id);
  const original = btn.onclick;
  btn.onclick = (e) => {
    if (!room) return original?.(e);
    if (role === 'host') return startHostGame();
    if (!peer) return T.toast(t('net.peerAway'));
    send({ t: 'newgame' });
  };
}

const chat = createChat({ t, send, onLangChange });

// --- lobby: open public rooms -------------------------------------------------------------
let isPublic = false;
let joinTimer = null;
let lobbyRooms = [];
let lobbyState = { relays: 0, total: 0 };
let lobbyOn = false;
const NAME_KEY = 'tridchess.name';
try { $('netName').value = localStorage.getItem(NAME_KEY) || ''; } catch {}
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
  const hay = fold([r.name || t('lobby.anon'), r.code, r.lang, IT[mine], mine, t('lobby.youPlay', { c: IT[mine] })].join(' '));
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
    meta.textContent = `${t('lobby.youPlay', { c: IT[other(r.hostColor)] })} · ${r.lang.toUpperCase()} · ${ago(r.since)}`;
    const codeTag = document.createElement('code');
    codeTag.className = 'lc';
    codeTag.textContent = r.code;
    b.append(name, meta, codeTag);
    b.title = t('lobby.join');
    b.onclick = () => { closeLobby(); $('netCode').value = r.code; join(); };
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

$('netHost').onclick = () => host().catch((e) => T.toast(t('net.unavailable', { e: e.message })));
$('netJoin').onclick = () => { try { join(); } catch (e) { T.toast(t('net.unavailable', { e: e.message })); } };
$('netCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('netJoin').click(); });
$('netLeave').onclick = () => leave();
$('netCopy').onclick = () => navigator.clipboard?.writeText(code || '').then(() => T.toast(t('net.codeCopied')), () => {});
wrapNewGame('btnNew');
wrapNewGame('vNew');
T.listeners.push((s) => onState(s));
window.addEventListener('beforeunload', () => {
  try { room?.leave(); } catch {}
  if (isPublic) lobby.unannounce().catch(() => {});
  if (room) { try { navigator.sendBeacon('/api/net-room', new Blob([JSON.stringify({ open: false })], { type: 'application/json' })); } catch {} }
});
