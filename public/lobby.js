// Serverless lobby: open rooms are announced as signed Nostr events on public relays.
//
// - Event: kind 30078 (NIP-78 application data, parameterized replaceable), one per room:
//     tags  d = "tri-d-chess/room/<CODE>", t = "tri-d-chess-lobby", expiration = now + TTL (NIP-40)
//     content JSON { v, code, kind ('trid'|'chess'|'xiangqi'|'cinese'|'dama-it'|'dama-int'|'dama-en'|'dama-ru'|'dama-br'), hostColor, lang, name, status: "open" | "closed", live? }
//     live: true marks a game in progress that can be watched; it is sent with status "closed" so
//     older versions, which only list "open" rooms, simply do not show it.
// - A waiting host re-announces every REFRESH_S; when the opponent arrives or the room closes it
//   publishes status "closed". If the app dies, the announcement simply expires.
// - Each session signs with a throwaway key (no persistent identity).
// - Readers verify id + Schnorr signature, schema, freshness and expiry, keep at most
//   MAX_ROOMS_PER_KEY open rooms per key and MAX_ROOMS overall, and never render HTML.
//
// No DOM here: the UI lives in net.js. Dependencies are injected (schnorr from @noble/secp256k1).

export const LOBBY_TAG = 'tri-d-chess-lobby';
const KIND = 30078;
const D_PREFIX = 'tri-d-chess/room/';
const TTL_S = 120;
const REFRESH_S = 40;
const MAX_ROOMS = 30;
const MAX_ROOMS_PER_KEY = 2;
const MAX_CONTENT = 600;
// Public relays checked to accept and store kind 30078 lobby events.
export const LOBBY_RELAYS = [
  'wss://nos.lol', 'wss://relay.primal.net', 'wss://nostr.mom', 'wss://offchain.pub',
  'wss://relay.nostr.net', 'wss://relay.snort.social', 'wss://nostr.bitcoiner.social',
];

const now = () => Math.floor(Date.now() / 1000);
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));
const sha256 = async (str) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)));
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);

export async function signEvent(schnorr, secretKey, { kind, tags, content, created_at = now() }) {
  const pubkey = hex(schnorr.getPublicKey(secretKey));
  const id = await sha256(JSON.stringify([0, pubkey, created_at, kind, tags, content]));
  const sig = await schnorr.signAsync(id, secretKey);
  return { id: hex(id), pubkey, created_at, kind, tags, content, sig: hex(sig) };
}

export async function verifyEvent(schnorr, ev) {
  if (!ev || typeof ev.id !== 'string' || typeof ev.sig !== 'string' || typeof ev.pubkey !== 'string') return false;
  if (!/^[0-9a-f]{64}$/.test(ev.id) || !/^[0-9a-f]{128}$/.test(ev.sig) || !/^[0-9a-f]{64}$/.test(ev.pubkey)) return false;
  const id = await sha256(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]));
  if (hex(id) !== ev.id) return false;
  try { return await schnorr.verifyAsync(unhex(ev.sig), id, unhex(ev.pubkey)); } catch { return false; }
}

const tagOf = (ev, name) => (Array.isArray(ev.tags) ? ev.tags.find((t) => Array.isArray(t) && t[0] === name)?.[1] : undefined);

// Parse and sanity-check an announcement (signature checked separately). Returns a room or null.
export function parseAnnouncement(ev, t = now()) {
  if (ev.kind !== KIND || typeof ev.content !== 'string' || ev.content.length > MAX_CONTENT) return null;
  if (tagOf(ev, 't') !== LOBBY_TAG) return null;
  const d = tagOf(ev, 'd');
  if (typeof d !== 'string' || !d.startsWith(D_PREFIX)) return null;
  const exp = Number(tagOf(ev, 'expiration'));
  if (!Number.isFinite(exp) || exp <= t || exp > t + TTL_S + 120) return null;
  if (typeof ev.created_at !== 'number' || ev.created_at > t + 60 || ev.created_at < t - TTL_S - 120) return null;
  let c;
  try { c = JSON.parse(ev.content); } catch { return null; }
  if (!c || c.v !== 1 || typeof c.code !== 'string' || !/^[A-Z2-9]{8}$/.test(c.code) || d !== D_PREFIX + c.code) return null;
  if (!['white', 'black'].includes(c.hostColor) || !['open', 'closed'].includes(c.status)) return null;
  return {
    key: d, code: c.code, kind: /^(trid|chess|dama-(it|int|en|ru|br))$/.test(c.kind) ? c.kind : 'trid', hostColor: c.hostColor, lang: c.lang === 'en' ? 'en' : 'it',
    name: cleanName(c.name), status: c.status, live: c.status === 'closed' && c.live === true, pubkey: ev.pubkey, createdAt: ev.created_at, expires: exp,
    since: Number.isInteger(c.since) && c.since <= ev.created_at && c.since > ev.created_at - 86400 ? c.since : ev.created_at,
  };
}

export function createLobby({ schnorr, relays = LOBBY_RELAYS, onRooms = () => {}, onStatus = () => {} }) {
  const secretKey = schnorr.utils?.randomSecretKey ? schnorr.utils.randomSecretKey() : crypto.getRandomValues(new Uint8Array(32));
  const myPubkey = hex(schnorr.getPublicKey(secretKey));
  const sockets = new Map();   // url -> { ws, retry, timer }
  const rooms = new Map();     // d -> room (latest per room)
  let wanted = 0;              // reference count: listening and/or hosting
  let hosting = null;          // { code, hostColor, lang, name, timer }
  let sweepTimer = null;
  const subId = 'lobby-' + Math.random().toString(36).slice(2, 10);
  const hidden = new Map(); // code -> until (ms)

  const emit = () => {
    const t = now();
    const list = [...rooms.values()]
      .filter((r) => (r.status === 'open' || r.live) && r.expires > t && r.pubkey !== myPubkey && !((hidden.get(r.code) || 0) > Date.now()))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_ROOMS);
    onRooms(list);
  };
  const connected = () => [...sockets.values()].filter((s) => s.ws?.readyState === 1).length;
  const status = () => onStatus({ relays: connected(), total: relays.length });

  async function handleEvent(ev) {
    const room = parseAnnouncement(ev);
    if (!room) return;
    const prev = rooms.get(room.key);
    // replaceable: keep the newest; on a tie a "closed" wins
    if (prev && (prev.createdAt > room.createdAt || (prev.createdAt === room.createdAt && (prev.status === 'closed' || room.status === 'open')))) return;
    if (!(await verifyEvent(schnorr, ev))) return;
    if (room.status === 'open' || room.live) {
      const sameKey = [...rooms.values()].filter((r) => r.pubkey === room.pubkey && (r.status === 'open' || r.live) && r.key !== room.key).length;
      if (sameKey >= MAX_ROOMS_PER_KEY) return;           // one key flooding the lobby
    }
    rooms.set(room.key, room);
    if (rooms.size > 300) for (const k of [...rooms.keys()].slice(0, 100)) rooms.delete(k);
    emit();
  }

  function connect(url) {
    const entry = sockets.get(url) || { retry: 2000 };
    sockets.set(url, entry);
    let ws;
    try { ws = new WebSocket(url); } catch { return; }
    entry.ws = ws;
    ws.onopen = () => {
      entry.retry = 2000;
      ws.send(JSON.stringify(['REQ', subId, { kinds: [KIND], '#t': [LOBBY_TAG], since: now() - TTL_S - 60, limit: 200 }]));
      if (hosting?.last) ws.send(JSON.stringify(['EVENT', hosting.last]));
      status();
    };
    ws.onmessage = (m) => {
      let msg;
      try { msg = JSON.parse(m.data); } catch { return; }
      if (Array.isArray(msg) && msg[0] === 'EVENT' && msg[1] === subId) handleEvent(msg[2]).catch(() => {});
    };
    ws.onclose = () => {
      status();
      if (!wanted) return;
      entry.timer = setTimeout(() => wanted && connect(url), entry.retry);
      entry.retry = Math.min(entry.retry * 2, 60000);
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  function start() {
    if (wanted++ > 0) return;
    for (const url of relays) connect(url);
    sweepTimer = setInterval(emit, 10000);
  }

  function stop() {
    if (--wanted > 0) return;
    wanted = 0;
    clearInterval(sweepTimer);
    for (const [url, s] of sockets) {
      clearTimeout(s.timer);
      try { s.ws?.send(JSON.stringify(['CLOSE', subId])); } catch {}
      try { s.ws?.close(); } catch {}
      sockets.delete(url);
    }
    status();
  }

  let lastCreated = 0;
  async function publish(content, ttl) {
    // strictly increasing timestamps so relays always keep the latest update of a room
    const t = Math.max(now(), lastCreated + 1);
    lastCreated = t;
    const ev = await signEvent(schnorr, secretKey, {
      kind: KIND,
      tags: [['d', D_PREFIX + content.code], ['t', LOBBY_TAG], ['expiration', String(t + ttl)], ['client', 'tri-d-chess']],
      content: JSON.stringify({ v: 1, ...content }),
      created_at: t,
    });
    for (const s of sockets.values()) if (s.ws?.readyState === 1) s.ws.send(JSON.stringify(['EVENT', ev]));
    return ev;
  }

  return {
    pubkey: myPubkey,
    // see open rooms (call stop when no longer needed)
    listen() { start(); emit(); },
    // drop a room from this viewer's list for a while (it did not answer)
    hide(code, ms = 10 * 60 * 1000) { hidden.set(code, Date.now() + ms); emit(); },
    unlisten() { stop(); },
    // advertise a waiting room until unannounce()
    // live: the game has started and can be watched (re-announcing the same room keeps its "since")
    async announce({ code, kind = 'trid', hostColor, lang, name, live = false }) {
      if (hosting && hosting.code === code) { // same room: update it (the sockets are already held)
        clearInterval(hosting.timer);
        Object.assign(hosting, { kind, hostColor, lang, name: cleanName(name), live });
      } else {
        start(); // synchronously, so the relay sockets stay open across the lobby view switching off
        await this.unannounce();
        hosting = { code, kind, hostColor, lang, name: cleanName(name), since: now(), live };
      }
      const h = hosting;
      const send = async () => {
        if (hosting !== h) return;
        h.last = await publish({ code, kind: h.kind, hostColor: h.hostColor, lang: h.lang, name: h.name, since: h.since, status: h.live ? 'closed' : 'open', ...(h.live ? { live: true } : {}) }, TTL_S);
      };
      await send();
      hosting.timer = setInterval(send, REFRESH_S * 1000);
    },
    async unannounce() {
      if (!hosting) return;
      const h = hosting;
      hosting = null;
      clearInterval(h.timer);
      // send the close a few times: relays may rate-limit an update right after the previous one
      const close = () => publish({ code: h.code, kind: h.kind, hostColor: h.hostColor, lang: h.lang, name: h.name, since: h.since, status: 'closed' }, 60).catch(() => {});
      await close();
      setTimeout(close, 2000);
      setTimeout(close, 8000);
      setTimeout(stop, 9500); // keep the sockets until the last close has gone out
    },
  };
}
