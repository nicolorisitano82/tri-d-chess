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
import { joinRoom } from '@trystero-p2p/nostr';
import { createChat } from '/chat.js';

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
}

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
      T.toast(t('net.busy'));
      leave();
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
  await startHostGame();
  open(code);
  $('netRoom').textContent = code;
  $('netMe').textContent = IT[myColor];
  setStatus('net.waiting', 'warn');
  showActive(true);
}

function join() {
  const c = $('netCode').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length < 4) { T.toast(t('net.needCode')); return; }
  role = 'guest';
  code = c;
  myColor = null;
  open(code);
  $('netRoom').textContent = code;
  $('netMe').textContent = '—';
  setStatus('net.searching', 'warn');
  showActive(true);
}

function leave() {
  try { room?.leave(); } catch {}
  room = null; msg = null; peer = null; role = null; code = null; myColor = null; sent = 0;
  showActive(false);
  chat.show(false);
  chat.clear();
  T.toast(t('net.left'));
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

$('netHost').onclick = () => host().catch((e) => T.toast(t('net.unavailable', { e: e.message })));
$('netJoin').onclick = () => { try { join(); } catch (e) { T.toast(t('net.unavailable', { e: e.message })); } };
$('netCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('netJoin').click(); });
$('netLeave').onclick = leave;
$('netCopy').onclick = () => navigator.clipboard?.writeText(code || '').then(() => T.toast(t('net.codeCopied')), () => {});
wrapNewGame('btnNew');
wrapNewGame('vNew');
T.listeners.push((s) => onState(s));
window.addEventListener('beforeunload', () => { try { room?.leave(); } catch {} });
