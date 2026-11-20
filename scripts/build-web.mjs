// Build a standalone, server-less single HTML page:
// rules engine + pieces + UI on the main thread, built-in computer in a Web Worker,
// game kept in the page (and localStorage). No MCP: that needs the local server.
//
// usage: node scripts/build-web.mjs [--target=artifact|pages] [out.html]
//   artifact (default): one file, Three.js from a CDN, no network play (WebRTC is blocked in artifacts)
//   pages:   a full page for GitHub Pages with local vendor files and peer-to-peer network play
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const args = process.argv.slice(2);
const target = (args.find((a) => a.startsWith('--target='))?.split('=')[1]) || 'artifact';
const PAGES = target === 'pages';
const out = args.find((a) => !a.startsWith('--')) || join(root, PAGES ? 'docs/play/index.html' : 'dist-web/tri-d-chess.html');
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.170.0';

// Names imported by a module from a given specifier, e.g. "a, b, c".
function importNames(src, spec) {
  const m = src.match(new RegExp(`import \\{([^}]*)\\} from '${spec.replace(/[./]/g, (c) => '\\' + c)}';`));
  if (!m) throw new Error(`build-web: no import from ${spec}`);
  return m[1].split(',').map((s) => s.trim()).filter(Boolean).join(', ');
}

function must(src, find, repl, label) {
  if (!src.includes(find)) throw new Error(`build-web: cannot find ${label}`);
  return src.split(find).join(repl);
}

// Wrap an ES module's source in an IIFE that returns its exports.
function asNamespace(src, { inject = '' } = {}) {
  const names = [...src.matchAll(/^export\s+(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  const body = src.replace(/^import .*$/gm, '').replace(/^export\s+/gm, '');
  return `(() => {\n${inject}\n${body}\nreturn { ${names.join(', ')} };\n})()`;
}

const engineSrc = read('src/engine.js');
const aiSrc = read('src/ai.js');
const aiChessSrc = read('src/ai-chess.js');
const chess2dSrc = read('src/chess2d.js');
const chessViewSrc = read('public/chess-view.js');
// chess.js is one ES module ending in a single export list: inline it in the worker as a namespace
const chessJsSrc = read('node_modules/chess.js/dist/esm/chess.js');
const CHESS_EXPORT = /^export \{[^}]*\};\s*$/m;
if (!CHESS_EXPORT.test(chessJsSrc) || (chessJsSrc.match(/^export /gm) || []).length !== 1) throw new Error('build-web: unexpected chess.js export format');
const chessJsNs = `(() => {\n${chessJsSrc.replace(CHESS_EXPORT, '')}\nreturn { Chess };\n})()`;
const piecesSrc = read('public/pieces.js');
const i18nSrc = read('public/i18n.js');
const chatSrc = read('public/chat.js');
const lobbySrc = read('public/lobby.js');
const netSrc = read('public/net.js')
  .replace("import { createChat } from '/chat.js';", () => `const { createChat } = ${asNamespace(chatSrc)};`)
  .replace("import { createLobby } from '/lobby.js';", () => `const { createLobby } = ${asNamespace(lobbySrc)};`);
let appSrc = read('public/app.js');
const html = read('public/index.html');

// ---- worker: engine + ai ---------------------------------------------------------
const workerSrc = `
const ENG = ${asNamespace(engineSrc)};
const AI = ${asNamespace(aiSrc, { inject: `const { ${importNames(aiSrc, './engine.js')} } = ENG;` })};
const CJS = ${chessJsNs};
const AIC = ${asNamespace(aiChessSrc, { inject: 'const { Chess } = CJS; const { STYLES } = AI;' })};
onmessage = (e) => {
  const { id, kind, pos, color, level, style, recent } = e.data;
  const m = kind === 'chess' ? AIC.chooseMoveChess(pos, color, level, style, recent) : AI.chooseMove(pos, color, level, style, recent);
  postMessage({ id, hint: !!e.data.hint, m: m && { from: m.from, to: m.to, promotion: m.promotion || null } });
};`;

// ---- main app: adapt server calls to a local game -------------------------------
appSrc = appSrc.replace(/^import .*$/gm, '');
appSrc = must(appSrc,
  "const es = new EventSource('/api/events');\nes.onmessage = (e) => onLive(JSON.parse(e.data));\nes.onerror = () => { $('status').textContent = t('status.lost'); };",
  '/*LOCAL_GAME*/', 'EventSource block');
appSrc = appSrc.replace(/async function post\(url, body\) \{[\s\S]*?\n\}\n/, '');
appSrc = must(appSrc,
  "$('btnResign').onclick = () => { if (isHumanTurn() && confirm(t('ui.resignConfirm'))) post('/api/resign'); };",
  `$('btnResign').onclick = () => {
  const b = $('btnResign');
  if (!isHumanTurn()) return;
  if (b.dataset.armed) { delete b.dataset.armed; b.textContent = t('ui.resign'); post('/api/resign'); return; }
  b.dataset.armed = '1'; b.textContent = t('ui.confirm');
  setTimeout(() => { delete b.dataset.armed; b.textContent = t('ui.resign'); }, 3000);
};
$('btnMore').onclick = () => { const p = $('panel'); p.classList.toggle('open'); $('btnMore').textContent = t(p.classList.contains('open') ? 'ui.close' : 'ui.options'); };`,
  'resign handler');
// responsive camera: back off in portrait, centre the board above the bottom panel
appSrc = must(appSrc,
  "function setView(name) {\n  const v = CAM_VIEWS[name];\n  camera.position.set(...v.pos);\n  controls.target.set(...v.target);\n  controls.update();\n}",
  `function setView(name) {
  const v = CAM_VIEWS[name];
  const narrow = window.matchMedia('(max-width: 700px), (max-height: 500px)').matches;
  const k = camera.aspect < 1 ? Math.min(1.8, 0.8 / camera.aspect) : 1;
  const t = narrow ? (v.narrow || [-0.5, 1.5, 0]) : v.target;
  camera.position.set(...v.pos.map((p, i) => t[i] + (p - v.target[i]) * k));
  controls.target.set(...t);
  controls.update();
}
let lastPortrait = camera.aspect < 1;`, 'setView');
appSrc = must(appSrc,
  "  renderer.setSize(window.innerWidth, window.innerHeight);\n});",
  "  renderer.setSize(window.innerWidth, window.innerHeight);\n  const portrait = camera.aspect < 1;\n  if (portrait !== lastPortrait) { lastPortrait = portrait; setView(Object.keys(CAM_VIEWS)[camIdx]); }\n});",
  'resize handler');

const localGame = `
// --- local game: replaces the server's REST + SSE ------------------------------------
const STORE_KEY = 'tridchess.web.game.v4';
const createGame = (kind, opts) => (kind === 'chess' ? new ChessGame(opts) : new ENG.Game(opts));
let game = createGame('trid', { white: 'human', black: 'computer', computer: { black: { level: 3, style: 'aggressive' } } });
const recentMoves = { white: [], black: [] };
// saved as the move list (replayed on load), so every game kind restores the same way
const serialize = () => ({ kind: game.kind, id: game.id, players: game.players, computer: game.computer, startedAt: game.startedAt,
  moves: game.history.map((h) => ({ from: h.from, to: h.to, promotion: h.promotion || null, at: h.at })),
  status: game.status, winner: game.winner, drawReason: game.drawReason });
function restore(sv) {
  const g = createGame(sv.kind === 'chess' ? 'chess' : 'trid', { white: sv.players.white, black: sv.players.black, computer: sv.computer });
  for (const m of sv.moves || []) { const r = g.move(m.from, m.to, m.promotion); if (m.at) r.at = m.at; }
  if (g.status === 'playing' && ['resigned', 'timeout', 'draw'].includes(sv.status)) { g.status = sv.status; g.winner = sv.winner || null; g.drawReason = sv.drawReason || null; }
  if (sv.id) g.id = sv.id;
  if (sv.startedAt) g.startedAt = sv.startedAt;
  return g;
}
const worker = new Worker(URL.createObjectURL(new Blob([${JSON.stringify(workerSrc)}], { type: 'text/javascript' })));
let thinkingId = 0;
const UNDO = ${asNamespace(read('src/undo.js'))};
const hintWaits = new Map(); // hint request id -> resolve(move | null)
let hintSeq = 1e6;
worker.onmessage = (e) => {
  if (e.data.hint) { const done = hintWaits.get(e.data.id); hintWaits.delete(e.data.id); done?.(e.data.m || null); return; }
  if (e.data.id !== thinkingId || !e.data.m) return;
  const { from, to, promotion } = e.data.m, c = game.turn;
  recentMoves[c].push(to + '>' + from); if (recentMoves[c].length > 4) recentMoves[c].shift();
  try { game.move(from, to, promotion); } catch (err) { toast(err.message); return; }
  publish();
};
function scheduleComputer() {
  const id = ++thinkingId, ver = game.version;
  if (game.status !== 'playing' || game.players[game.turn] !== 'computer') return;
  setTimeout(() => {
    if (id !== thinkingId || ver !== game.version) return;
    const { level, style } = game.computer[game.turn];
    worker.postMessage({ id, kind: game.kind, pos: game.pos, color: game.turn, level, style, recent: recentMoves[game.turn] });
  }, 650);
}
function publish() {
  onLive(game.snapshot());
  try { localStorage.setItem(STORE_KEY, JSON.stringify(serialize())); } catch {}
  scheduleComputer();
}
let netRoom = false;
// network games are human vs human only (same rule as server.js)
function playersError(white, black, watch = false) {
  const remote = [white, black].filter((p) => p === 'remote').length;
  if (watch && remote === 2 && netRoom) return null; // a spectator mirrors a network game
  if (remote && !(remote === 1 && [white, black].includes('human'))) return 'Network games are human vs human only.';
  if (netRoom && remote !== 1) return 'A network game is open: leave the room first.';
  return null;
}
async function post(url, body = {}) {
  try {
    if (url === '/api/net-room') { netRoom = !!body.open; return { ok: true }; }
    if ((url === '/api/new' || url === '/api/net-sync') && playersError(body.white, body.black, url === '/api/net-sync' && body.watch === true)) throw new Error(playersError(body.white, body.black, url === '/api/net-sync' && body.watch === true));
    if (url === '/api/new') {
      game = createGame(body.kind === 'chess' || body.kind === 'trid' ? body.kind : game.kind, { white: body.white, black: body.black, computer: body.computer });
      recentMoves.white = []; recentMoves.black = [];
    } else if (url === '/api/undo') {
      game = UNDO.undoGame(game, createGame);
      recentMoves.white = []; recentMoves.black = [];
    } else if (url === '/api/hint') {
      // the move the computer (level 4) would play for the human to move; the game is unchanged
      if (!UNDO.isLocalGame(game) || game.status !== 'playing' || game.players[game.turn] !== 'human') return { error: 'no hint now' };
      const id = ++hintSeq, ver = game.version, gid = game.id;
      const move = await new Promise((resolve) => {
        hintWaits.set(id, resolve);
        worker.postMessage({ id, hint: true, kind: game.kind, pos: game.pos, color: game.turn, level: 4, style: 'balanced', recent: [] });
      });
      if (!move || game.version !== ver || game.id !== gid) return { error: 'The position changed.' };
      return { ok: true, move };
    } else if (url === '/api/move') {
      if (game.players[game.turn] !== 'human') throw new Error(t('hint.notYourTurn'));
      game.move(body.from, body.to, body.promotion);
    } else if (url === '/api/resign') {
      game.resign(body.color || game.turn);
    } else if (url === '/api/flag') {
      if (!Object.values(game.players).includes('remote')) throw new Error('Time control applies to network games only.');
      game.flag(body.color);
    } else if (url === '/api/remote-move') {
      // move from the network opponent (net.js); n keeps both sides in step
      if (game.players[game.turn] !== 'remote' || body.n !== game.history.length) return { error: 'out of sync', expected: game.history.length };
      game.move(body.from, body.to, body.promotion);
    } else if (url === '/api/net-sync') {
      game = createGame(body.kind === 'chess' ? 'chess' : 'trid', { white: body.white, black: body.black });
      recentMoves.white = []; recentMoves.black = [];
      try { for (const m of body.moves || []) game.move(m.from, m.to, m.promotion); if (body.resigned && game.status === 'playing') game.resign(body.resigned); }
      catch (err) { publish(); return { error: err.message }; }
    }
    publish();
    return { ok: true };
  } catch (err) {
    if (!url.startsWith('/api/remote') && !url.startsWith('/api/net')) toast(err.message);
    return { error: err.message };
  }
}
const hot = window.claude?.hot;
hot?.snapshot?.(() => ({ game: serialize() }));
function boot(data) {
  let saved = data?.game || null;
  if (!saved) { try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch {} }
  if (saved && saved.players && Array.isArray(saved.moves)) { try { game = restore(saved); } catch {} }
  publish();
}
hot?.ready ? hot.ready(boot) : boot(hot?.data ?? {});

// --- phone: collapse the panel to a status pill so the board gets the whole screen ---
const narrowMQ = window.matchMedia('(max-width: 700px), (max-height: 500px)');
function setMini(on) {
  const p = $('panel');
  p.classList.toggle('mini', on && narrowMQ.matches);
  if (on) { p.classList.remove('open'); $('btnMore').textContent = t('ui.options'); }
}
$('statusBlock').addEventListener('click', () => { if (narrowMQ.matches) setMini(!$('panel').classList.contains('mini')); });
renderer.domElement.addEventListener('pointerdown', () => { if (narrowMQ.matches && !$('panel').classList.contains('mini')) setMini(true); });
for (const id of ['btnNew', 'vNew']) { const f = $(id).onclick; $(id).onclick = (e) => { f(e); setMini(true); }; }
narrowMQ.addEventListener?.('change', () => setMini(narrowMQ.matches));
setMini(true);
`;
appSrc = must(appSrc, '/*LOCAL_GAME*/', localGame, 'local game marker');

const mainSrc = `import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const ENG = ${asNamespace(engineSrc)};
const { ${importNames(read('public/app.js'), '/engine.js')} } = ENG;
import { Chess } from 'chess.js';
const { buildPiece: buildTriDPiece, setPieceSets, getPieceSets } = ${asNamespace(piecesSrc)};
const { ChessGame } = ${asNamespace(chess2dSrc)};
const { createRules } = ${asNamespace(read('public/rules.js'))};
const { createTutorial } = ${asNamespace(read('public/tutorial.js'))};
const { createChessView } = ${asNamespace(chessViewSrc)};
const { ${importNames(read('public/app.js'), '/i18n.js')} } = ${asNamespace(i18nSrc)};
${appSrc}`;

// ---- markup + styles ----------------------------------------------------------------
let style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
style = style.replace(':root {', ':root {\n      color-scheme: dark;');
style += `
    /* --- standalone / phone layout --- */
    #btnMore { display: none; }
    #mcpblock, #dragbar${PAGES ? '' : ', #netblock, #chat'} { display: none !important; }
    @media (max-width: 700px), (max-height: 500px) {
      #panel { top: auto; left: 8px; right: 8px; bottom: calc(8px + env(safe-area-inset-bottom, 0px)); width: auto; height: auto; max-height: 64vh; max-height: 64dvh; overflow-y: auto; gap: 6px; }
      #panel .bar.title, #panel .logbar, #log, #panel .grid2 { display: none; }
      #panel.open .logbar { display: block; }
      #panel.open #log { display: block; flex: none; max-height: 20vh; max-height: 20dvh; }
      #panel.open .grid2 { display: grid; margin-bottom: 4px; }
      #panel .block { padding: 8px 10px; }
      #status { font-size: 15px; }
      #btnMore { display: inline-block; }
      .btns { margin-top: 0; }
      button { padding: 9px 12px; font-size: 12px; }
      select { padding: 7px 6px; font-size: 14px; }
      #hover { display: none; }
      #stats { top: calc(8px + env(safe-area-inset-top, 0px)); left: 8px; right: 8px; max-height: 46vh; max-height: 46dvh; }
      #statsTab { padding: 12px 5px; }
      #victory { padding-bottom: 12vh; padding-bottom: 12dvh; }
      #statusBlock { cursor: pointer; }
      #status::after { content: " ▾"; color: var(--muted); font-size: 12px; }
      #panel.mini { left: auto; right: max(8px, env(safe-area-inset-right, 0px)); max-width: 78vw; overflow: visible; }
      #panel.mini > :not(#statusBlock) { display: none !important; }
      #panel.mini #statusBlock { padding: 7px 14px 7px 12px; border-left-width: 8px; border-radius: 0 20px 20px 0; box-shadow: 0 4px 18px rgba(0,0,0,.5); }
      #panel.mini #statusBlock .row { display: none; }
      #panel.mini #status { font-size: 13px; }
      #panel.mini #status::after { content: " ▴"; }
      #panel:not(.mini) ~ #statsTab { display: none; }
      #victory .card { padding: 18px 12px; }
      #victory .rays { width: 560px; height: 560px; margin: -280px 0 0 -280px; }
      #victory .king { font-size: 48px; }
      #victory .sub { font-size: 14px; }
    }
    @media (max-height: 500px) and (min-width: 701px) {
      #panel { right: auto; width: min(380px, 48vw); max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px - env(safe-area-inset-bottom, 0px)); }
      #panel.mini { left: auto; right: max(8px, env(safe-area-inset-right, 0px)); width: auto; }
      #stats { left: auto; right: max(8px, env(safe-area-inset-right, 0px)); width: min(300px, 42vw); max-height: calc(100vh - 70px); max-height: calc(100dvh - 70px); }
      #victory { padding-bottom: 2vh; }
      #chat { left: auto; right: max(8px, env(safe-area-inset-right, 0px)); }
    }`;

let body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
body = body.replace(/<script>if \(new URLSearchParams[\s\S]*?<\/script>\n?/, '');
body = body.replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, '');
body = body.replace(/<script type="module" src="\/app.js"><\/script>\n?/, '');
body = body.replace(/\s*<script type="module" src="\/net.js"><\/script>\n?/, '\n'); // added back inline for pages
body = must(body, '<div class="block">\n      <div id="status"', '<div class="block" id="statusBlock">\n      <div id="status"', 'status block');
body = must(body, '<div class="bar" style="background:var(--lilac)" data-i18n="ui.log">', '<div class="bar logbar" style="background:var(--lilac)" data-i18n="ui.log">', 'log bar');
body = body.split('<option value="ai" data-i18n="opt.ai">AI (MCP)</option>').join('');
if (!PAGES) body = body.split('<option value="remote" hidden data-i18n="name.remote">In rete</option>').join('');
body = must(body, '<button class="lilac" id="btnStats" data-i18n="ui.stats">Statistiche</button>', '<button class="lilac" id="btnStats" data-i18n="ui.stats">Statistiche</button>\n        <button class="peach" id="btnMore" style="background:var(--peach)" data-i18n="ui.options">Opzioni</button>', 'stats button');
// default: black = computer
body = must(body, '<select id="selB"><option value="human" data-i18n="name.human">Umano</option><option value="computer" data-i18n="name.computer">Computer</option>',
  '<select id="selB"><option value="human" data-i18n="name.human">Umano</option><option value="computer" selected data-i18n="name.computer">Computer</option>', 'black select');

const importMap = PAGES
  ? { three: './vendor/three/build/three.module.js', 'three/addons/': './vendor/three/examples/jsm/',
      '@trystero-p2p/core': './vendor/trystero-core/index.mjs', '@trystero-p2p/nostr': './vendor/trystero-nostr/index.mjs',
      '@noble/secp256k1': './vendor/noble-secp256k1/index.js', 'chess.js': './vendor/chess.js/chess.js' }
  : { three: `${THREE_CDN}/build/three.module.js`, 'three/addons/': `${THREE_CDN}/examples/jsm/`, 'chess.js': 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/dist/esm/chess.js' };
// ---- PWA (pages only): install button + service worker registration ----------------------
const PWA_SRC = `
const T = window.TriD, btn = document.getElementById('btnInstall');
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let deferred = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; btn.hidden = false; });
addEventListener('appinstalled', () => { deferred = null; btn.hidden = true; });
if (ios && !standalone) btn.hidden = false;
btn.onclick = async () => {
  if (deferred) { deferred.prompt(); try { await deferred.userChoice; } catch {} deferred = null; btn.hidden = true; }
  else T.toast(T.t('pwa.ios'));
};
addEventListener('offline', () => T.toast(T.t('pwa.offline')));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
`;

const content = `${PAGES ? '' : '<title>Tri-D Chess</title>\n'}<style>${style}</style>
${body}
<script type="importmap">
  ${JSON.stringify({ imports: importMap })}
</script>
<script type="module">
${mainSrc}
</script>
${PAGES ? `<script type="module">\n${netSrc}\n</script>\n<script type="module">\n${PWA_SRC}\n</script>\n` : ''}`;
// artifacts get their document skeleton at publish time; GitHub Pages needs a full page
const page = PAGES
  ? `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Play Tri-D Chess</title>
<meta name="description" content="Tri-D Chess: 3D chess on seven levels, Meder rules, computer opponent and peer-to-peer online play.">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Tri-D Chess">
<meta property="og:url" content="https://nicolorisitano82.github.io/tri-d-chess/play/">
<meta property="og:title" content="Play Tri-D Chess in your browser">
<meta property="og:description" content="3D chess on seven levels: play the computer or a friend online, with chat. No install needed.">
<meta property="og:image" content="https://nicolorisitano82.github.io/tri-d-chess/assets/og-image.jpg">
<meta property="og:image:secure_url" content="https://nicolorisitano82.github.io/tri-d-chess/assets/og-image.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Tri-D Chess: a three-dimensional chessboard with three main levels and four attack boards in space">
<meta property="og:locale" content="en_US">
<meta property="og:locale:alternate" content="it_IT">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Play Tri-D Chess in your browser">
<meta name="twitter:description" content="3D chess on seven levels: play the computer or a friend online, with chat. No install needed.">
<meta name="twitter:image" content="https://nicolorisitano82.github.io/tri-d-chess/assets/og-image.jpg">
<meta name="twitter:image:alt" content="Tri-D Chess: a three-dimensional chessboard with three main levels and four attack boards in space">
<link rel="canonical" href="https://nicolorisitano82.github.io/tri-d-chess/play/">
<link rel="icon" href="../assets/icon.png">
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#000006">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Tri-D Chess">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
</head>
<body>
${content}
</body>
</html>
`
  : content;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
if (PAGES) {
  const dir = dirname(out);
  cpSync(join(root, 'public/vendor'), join(dir, 'vendor'), { recursive: true });
  const version = JSON.parse(read('package.json')).version;
  writeFileSync(join(dir, 'manifest.webmanifest'), JSON.stringify({
    name: 'Tri-D Chess', short_name: 'Tri-D Chess', id: './', start_url: './', scope: './',
    description: 'Three-dimensional chess on seven levels: play the computer or a friend online.',
    display: 'standalone', orientation: 'any', background_color: '#000006', theme_color: '#000006', lang: 'it',
    categories: ['games', 'board'],
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2));
  // offline cache: the page, its icons and every vendored module
  const walk = (d, base = '') => readdirSync(join(dir, d)).flatMap((f) => statSync(join(dir, d, f)).isDirectory() ? walk(join(d, f), base) : [`./${join(d, f)}`]);
  const assets = ['./', './manifest.webmanifest', ...walk('icons'), ...walk('vendor')];
  writeFileSync(join(dir, 'sw.js'), `// Tri-D Chess service worker — generated by scripts/build-web.mjs
const CACHE = 'tridchess-${version}';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('tridchess-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // the page: network first (updates arrive at once), cached copy when offline; ?room=… shares the same page
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); return res; })
      .catch(() => caches.match('./', { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
`);
}
console.log(`built ${target} → ${out} (${(page.length / 1024).toFixed(0)} KB)`);
