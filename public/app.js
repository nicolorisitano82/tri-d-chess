import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildPiece as buildTriDPiece, setPieceSets, getPieceSets } from '/pieces.js';
import { createChessView } from '/chess-view.js';
import { ChessGame } from '/chess2d.js';
import { createRules } from '/rules.js';
import { t, table, getLang, setLang, applyStatic, onLangChange } from '/i18n.js';
import { LEVELS, LEVEL_NAMES, MAIN_LEVELS, PINS, isPin, squaresOf, sqKey, parseSquare, PIECE_NAMES, Game } from '/engine.js';

// --- world mapping -------------------------------------------------------------
const H = 2.0; // vertical spacing per level unit
const SQ = 1.0;
const worldPos = (x, y, level) => new THREE.Vector3((x - 2.5) * SQ, LEVELS[level].height * H, -(y - 4.5) * SQ);
const tridPos = (key) => { const s = parseSquare(key); return worldPos(s.x, s.y, s.level); };
// game kinds: 'trid' (Star Trek 3D chess) and 'chess' (classic chess, medieval room)
let kind = 'trid';
const chessView = createChessView();
const posOfKey = (key) => (kind === 'chess' ? chessView.posOfKey(key) : tridPos(key));
const buildPiece = (type, color) => (kind === 'chess' ? chessView.buildPiece(type, color) : buildTriDPiece(type, color));

// --- renderer / scene ------------------------------------------------------------
const container = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000006);
scene.fog = new THREE.Fog(0x000006, 30, 90);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 300);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 5;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI * 0.95;

const VIEWS = {
  trid: {
    white: { pos: [7, 11, 12], target: [-1.6, 2.2, 0] },
    black: { pos: [-7, 11, -12], target: [-1.6, 2.2, 0] },
    side: { pos: [14, 4, 0], target: [-1.6, 2.2, 0] },
  },
  chess: chessView.views,
};
let CAM_VIEWS = VIEWS.trid;
let camIdx = 0;
function setKind(k) {
  if (k === kind) return;
  kind = k;
  const chess = k === 'chess';
  tridRoot.visible = !chess;
  chessView.root.visible = chess;
  CAM_VIEWS = VIEWS[k];
  const bg = chess ? chessView.background : 0x000006;
  scene.background.setHex(bg);
  scene.fog.color.setHex(bg);
  [scene.fog.near, scene.fog.far] = chess ? chessView.fog.slice(1) : [30, 90];
  document.body.dataset.kind = k;
  pieceGroup.clear();
  pieceMeshes.clear();
  camIdx = 0;
  setView('white');
}
function setView(name) {
  const v = CAM_VIEWS[name];
  camera.position.set(...v.pos);
  controls.target.set(...v.target);
  controls.update();
}
setView('white');

// everything specific to the Tri-D scene lives in tridRoot; the chess room in chessView.root
const tridRoot = new THREE.Group();
scene.add(tridRoot);
scene.add(chessView.root);
tridRoot.add(new THREE.HemisphereLight(0x8899ff, 0x110818, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(6, 14, 8);
tridRoot.add(key);
const rim = new THREE.PointLight(0x66ccff, 40, 30);
rim.position.set(-6, 6, -6);
tridRoot.add(rim);
const warm = new THREE.PointLight(0xff9c33, 30, 30);
warm.position.set(6, -1, 6);
tridRoot.add(warm);

// starfield
{
  const g = new THREE.BufferGeometry();
  const n = 2500, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(60 + Math.random() * 60);
    arr.set([v.x, v.y, v.z], i * 3);
  }
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, sizeAttenuation: true, fog: false }));
  stars.name = 'stars';
  tridRoot.add(stars);
}

// --- boards: one group per level; attack-board pins are shown only while a board sits on them ---
const squareMeshes = new Map(); // key -> mesh
const pickables = [];
const levelGroups = {};          // level -> THREE.Group
const pinFrames = {};            // pin -> frame (own material, recoloured when the board can move)
const ghostGroup = new THREE.Group();
tridRoot.add(ghostGroup);
const ghosts = {};               // pin -> group shown as a move target for a selected board
const lightMat = () => new THREE.MeshStandardMaterial({ color: 0xb8d4ff, transparent: true, opacity: 0.42, metalness: 0.1, roughness: 0.2, emissive: 0x000000, depthWrite: false });
const darkMat = () => new THREE.MeshStandardMaterial({ color: 0x14244a, transparent: true, opacity: 0.72, metalness: 0.3, roughness: 0.3, emissive: 0x000000, depthWrite: false });
const squareGeo = new THREE.BoxGeometry(SQ * 0.97, 0.05, SQ * 0.97);
const frameMat = new THREE.LineBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.9 });
const metal = new THREE.MeshStandardMaterial({ color: 0x8a8f9c, metalness: 0.9, roughness: 0.3 });
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x66ffcc, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
const ghostLine = new THREE.LineBasicMaterial({ color: 0x66ffcc, transparent: true, opacity: 0.95 });

function labelSprite(text, color = '#ff9c33') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 56px Helvetica Neue, sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 48);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  sp.scale.set(1.0, 0.375, 1);
  return sp;
}

function levelDims(L) {
  return {
    w: (L.x[1] - L.x[0] + 1) * SQ, d: (L.y[1] - L.y[0] + 1) * SQ,
    cx: ((L.x[0] + L.x[1]) / 2 - 2.5) * SQ, cz: -((L.y[0] + L.y[1]) / 2 - 4.5) * SQ, y: L.height * H - 0.03,
  };
}
const pinOrigin = (pin) => worldPos(PINS[pin].x[0], PINS[pin].y[0], pin);

const BASE_Y = -2.2;
for (const lv of LEVEL_NAMES) {
  const L = LEVELS[lv];
  const g = new THREE.Group();
  levelGroups[lv] = g;
  tridRoot.add(g);
  const { w, d, cx, cz, y } = levelDims(L);
  for (const s of squaresOf(lv)) {
    const m = new THREE.Mesh(squareGeo, (s.x + s.y) % 2 === 0 ? darkMat() : lightMat());
    m.position.copy(worldPos(s.x, s.y, s.level));
    m.position.y -= 0.03;
    m.userData = { key: s.key, kind: 'square' };
    m.renderOrder = 1;
    g.add(m);
    squareMeshes.set(s.key, m);
    pickables.push(m);
  }
  const pin = isPin(lv);
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.08, 0.1, d + 0.08)), pin ? frameMat.clone() : frameMat);
  frame.position.set(cx, y, cz);
  g.add(frame);
  const label = labelSprite(lv, pin ? '#cc99cc' : '#ff9c33');
  label.position.set(pin ? cx + (L.x[0] === 0 ? -1.4 : 1.4) : cx - w / 2 - 0.7, y + 0.25, cz);
  g.add(label);
  if (!pin) {
    // arm to the central spine on the left
    const armLen = 1.6;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.08, 0.2), metal);
    arm.position.set(cx - w / 2 - armLen / 2, y - 0.08, cz);
    g.add(arm);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, y - BASE_Y), metal);
    post.position.set(cx - w / 2 - armLen, (y + BASE_Y) / 2, cz);
    g.add(post);
  } else {
    pinFrames[lv] = frame;
    // short post down to the main board it hangs from
    const len = y - MAIN_LEVELS[L.main].height * H;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len), metal);
    post.position.set(cx, y - len / 2, cz);
    g.add(post);
    // ghost outline shown when this pin is a legal destination for the selected board
    const gg = new THREE.Group();
    const plane = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), ghostMat);
    plane.position.set(cx, y, cz);
    plane.userData = { key: lv, kind: 'ghost' };
    gg.add(plane);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.08, 0.1, d + 0.08)), ghostLine);
    edge.position.set(cx, y, cz);
    gg.add(edge);
    const gl = labelSprite(lv, '#66ffcc');
    gl.position.set(label.position.x, label.position.y, label.position.z);
    gg.add(gl);
    gg.visible = false;
    ghosts[lv] = gg;
    ghostGroup.add(gg);
  }
}
function syncBoards() {
  for (const pin of Object.keys(PINS)) {
    levelGroups[pin].visible = !!state?.boards?.[pin];
    levelGroups[pin].position.set(0, 0, 0);
  }
}
// classic chess squares share the maps (keys "a1".."h8" never clash with Tri-D keys)
for (const { key, mesh } of chessView.squares) { squareMeshes.set(key, mesh); pickables.push(mesh); }
// base plate
{
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.0, 0.25, 48), metal);
  base.position.set(-3.6, BASE_Y - 0.12, 0);
  base.scale.set(0.6, 1, 2.2);
  tridRoot.add(base);
}

// --- pieces: faction sets in pieces.js ----------------------------------------------
const pieceGroup = new THREE.Group();
scene.add(pieceGroup);
const pieceMeshes = new Map(); // key -> group

// markers for legal targets
const markerGroup = new THREE.Group();
scene.add(markerGroup);
const ringGeo = new THREE.RingGeometry(0.22, 0.34, 32);
const ringMove = new THREE.MeshBasicMaterial({ color: 0x66ffcc, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
const ringCap = new THREE.MeshBasicMaterial({ color: 0xff5555, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });

// --- state & UI ----------------------------------------------------------------------
let state = null;
let selected = null;
let anim = null;
const $ = (id) => document.getElementById(id);
// localized lookup tables (read the current language on every access)
const IT = table('name');
const DRAW_IT = table('draw');
const LEVEL_IT = table('level');
const STYLE_IT = table('style');


// --- MCP commands: only for the colors set to AI ----------------------------------
function renderMcp() {
  const box = $('mcpcmd');
  const players = { white: $('selW').value, black: $('selB').value };
  const ai = ['white', 'black'].filter((c) => players[c] === 'ai');
  if (!ai.length) { box.innerHTML = `<div class="mcpnone">${t('mcp.none')}</div>`; return; }
  box.innerHTML = '';
  for (const c of ai) {
    const cmd = `claude mcp add --transport http tri-d-chess-${c} "${location.origin}/mcp?color=${c}"`;
    const div = document.createElement('div');
    div.className = 'mcpline';
    div.innerHTML = `<div class="who">${IT[c]} · AI</div><code></code>`;
    div.querySelector('code').textContent = cmd;
    div.onclick = () => navigator.clipboard?.writeText(cmd).then(() => toast(t('mcp.copied')), () => {});
    box.appendChild(div);
  }
  const unsaved = state && (players.white !== state.players.white || players.black !== state.players.black);
  if (unsaved) box.insertAdjacentHTML('beforeend', `<div class="mcpnone">${t('mcp.unsaved')}</div>`);
}
function syncLevel() { for (const c of ['W', 'B']) $('cpu' + c).hidden = $('sel' + c).value !== 'computer'; }
const newGameBody = () => ({
  kind: $('gameKind').value,
  white: $('selW').value, black: $('selB').value,
  computer: {
    white: { level: Number($('lvlW').value), style: $('styW').value },
    black: { level: Number($('lvlB').value), style: $('styB').value },
  },
});
$('selW').onchange = $('selB').onchange = () => { renderMcp(); syncLevel(); };
// switching game starts a new game of that kind (asks first if a game is under way)
$('gameKind').onchange = () => {
  const s = live || state;
  const busy = s && !s.replay && s.status === 'playing' && s.history.length > 0;
  if (busy && !confirm(t('ui.switchConfirm'))) { $('gameKind').value = kindOf(s); return; }
  if (replay) closeReplay();
  selected = null;
  post('/api/new', newGameBody());
};
syncLevel();

// piece sets for Tri-D (cosmetic, local only: each player sees their own choice)
try { setPieceSets(JSON.parse(localStorage.getItem('tridchess.sets') || '{}')); } catch {}
$('setW').value = getPieceSets().white;
$('setB').value = getPieceSets().black;
$('setW').onchange = $('setB').onchange = () => {
  setPieceSets({ white: $('setW').value, black: $('setB').value });
  try { localStorage.setItem('tridchess.sets', JSON.stringify(getPieceSets())); } catch {}
  if (state && kind === 'trid') renderPieces(null);
};

// --- statistics panel -----------------------------------------------------------------
const VAL = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const glyph = (t) => GLYPH[t] + '\uFE0E';
const fmtTime = (ms) => { if (ms == null || !isFinite(ms)) return '—'; const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function statsFor(s, c) {
  const mine = s.history.filter((m) => m.color === c);
  const caps = mine.filter((m) => m.captured).map((m) => m.captured).sort((x, y) => VAL[y] - VAL[x]);
  const material = Object.values(s.pieces).filter((p) => p.color === c).reduce((t, p) => t + VAL[p.type], 0);
  const think = [];
  s.history.forEach((m, i) => { if (m.color === c && m.at) { const prev = i ? s.history[i - 1].at : s.startedAt; if (prev) think.push(m.at - prev); } });
  return {
    moves: mine.length, caps, material,
    checks: mine.filter((m) => m.check).length,
    promotions: mine.filter((m) => m.promotion).length,
    pieces: Object.values(s.pieces).filter((p) => p.color === c).length,
    avg: think.length ? think.reduce((t, x) => t + x, 0) / think.length : null,
    total: think.length ? think.reduce((t, x) => t + x, 0) : null,
  };
}

function renderStats() {
  if (!state) return;
  const st = { white: statsFor(state, 'white'), black: statsFor(state, 'black') };
  const totalMat = st.white.material + st.black.material || 1;
  for (const c of ['white', 'black']) {
    const o = c === 'white' ? 'black' : 'white';
    const S = st[c], diff = S.material - st[o].material;
    const card = $(`card-${c}`);
    card.classList.toggle('turn', state.status === 'playing' && state.turn === c);
    const capsHtml = S.caps.length ? S.caps.map((t) => `<span class="${o[0]}">${glyph(t)}</span>`).join('') : `<span class="none">${t('stats.noCaps')}</span>`;
    const thinking = state.status === 'playing' && state.turn === c;
    card.innerHTML = `
      <div class="head"><span class="name">${IT[c]}</span><span class="who">${IT[state.players[c]]}${state.winner === c ? ` · ${t('stats.winner')}` : ''}</span></div>
      <div class="mat"><b>${S.material}</b><span class="who">${t('stats.material')}</span>${diff > 0 ? `<span class="adv">+${diff}</span>` : ''}</div>
      ${c === 'white' ? `<div class="balance" title="${t('stats.balance')}"><div style="width:${(S.material / totalMat) * 100}%"></div></div>` : ''}
      <div class="who" style="margin-top:8px">${t('stats.captured')}</div>
      <div class="caps">${capsHtml}</div>
      <div class="sgrid">
        <span>${t('stats.moves')}</span><span>${S.moves}</span>
        <span>${t('stats.captures')}</span><span>${S.caps.length}</span>
        <span>${t('stats.checks')}</span><span>${S.checks}</span>
        <span>${t('stats.promotions')}</span><span>${S.promotions}</span>
        <span>${t('stats.pieces')}</span><span>${S.pieces}/16</span>
        <span>${t('stats.avg')}</span><span>${fmtTime(S.avg)}</span>
        <span>${t('stats.total')}</span><span>${fmtTime(S.total)}</span>
        ${thinking ? `<span>${t('stats.thinking')}</span><span class="thinking" data-c="${c}">—</span>` : ''}
      </div>`;
  }
  tickThinking();
}
function tickThinking() {
  const el = document.querySelector('.thinking');
  if (!el || !state) return;
  const since = state.lastMove?.at || state.startedAt;
  el.textContent = since ? fmtTime(Date.now() - since) : '—';
}
setInterval(tickThinking, 1000);

const statsEl = $('stats'), statsTab = $('statsTab');
function setStats(open) {
  statsEl.classList.toggle('hidden', !open);
  statsTab.classList.toggle('gone', open);
  try { localStorage.setItem('tridchess.stats', open ? '1' : '0'); } catch {}
}
let statsPref = null;
try { statsPref = localStorage.getItem('tridchess.stats'); } catch {}
setStats(statsPref ? statsPref === '1' : window.innerWidth > 1100);
$('btnStats').onclick = () => setStats(statsEl.classList.contains('hidden'));
$('statsClose').onclick = () => setStats(false);
statsTab.onclick = () => setStats(true);
window.addEventListener('keydown', (e) => {
  if (e.target.closest('select, input, textarea') || e.metaKey || e.ctrlKey) return;
  if (e.key === 's' || e.key === 'S') setStats(statsEl.classList.contains('hidden'));
  if (e.key === 'Escape') hideVictory();
});

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2500);
}

const kindOf = (s) => s?.kind || 'trid';
const isHumanTurn = () => state && !state.replay && state.status === 'playing' && state.players[state.turn] === 'human';

function setSquareGlow() {
  for (const [k, m] of squareMeshes) m.material.emissive.setHex(0x000000);
  if (state?.lastMove?.board) {
    for (const s of squaresOf(state.lastMove.to)) squareMeshes.get(s.key)?.material.emissive.setHex(0x332000);
  } else if (state?.lastMove) {
    squareMeshes.get(state.lastMove.from)?.material.emissive.setHex(0x332000);
    squareMeshes.get(state.lastMove.to)?.material.emissive.setHex(0x553300);
  }
  // attack-board frames: orange = you can move this board now, white = selected
  const movable = new Set(isHumanTurn() ? state.legalMoves.filter((m) => m.board).map((m) => m.from) : []);
  for (const [pin, f] of Object.entries(pinFrames)) f.material.color.setHex(selected === pin ? 0xffffff : movable.has(pin) ? 0xff9c33 : 0x66ccff);
  if (state?.check) {
    const kk = Object.keys(state.pieces).find((k) => state.pieces[k].type === 'K' && state.pieces[k].color === state.turn);
    squareMeshes.get(kk)?.material.emissive.setHex(0x880000);
  }
  // under check, light up every piece that has a legal way out
  if (state?.check && isHumanTurn()) {
    for (const from of new Set(state.legalMoves.map((m) => m.from))) squareMeshes.get(from)?.material.emissive.setHex(0x0b5a3a);
  }
  if (selected && isPin(selected)) for (const s of squaresOf(selected)) squareMeshes.get(s.key)?.material.emissive.setHex(0x0066aa);
  else if (selected) squareMeshes.get(selected)?.material.emissive.setHex(0x0066aa);
}

function targetsOf(from) {
  return state ? state.legalMoves.filter((m) => m.from === from) : [];
}

function renderMarkers() {
  markerGroup.clear();
  for (const g of Object.values(ghosts)) g.visible = false;
  if (!selected) return;
  if (isPin(selected)) { for (const m of targetsOf(selected)) ghosts[m.to].visible = true; return; }
  const seen = new Set();
  for (const m of targetsOf(selected)) {
    if (seen.has(m.to)) continue; // promotions: one ring per square
    seen.add(m.to);
    const r = new THREE.Mesh(ringGeo, m.capture ? ringCap : ringMove);
    r.rotation.x = -Math.PI / 2;
    r.position.copy(posOfKey(m.to));
    r.position.y += 0.03;
    r.userData = { key: m.to, kind: 'marker' };
    markerGroup.add(r);
  }
}

function renderPieces(prev) {
  pieceGroup.clear();
  pieceMeshes.clear();
  for (const [k, p] of Object.entries(state.pieces)) {
    const g = buildPiece(p.type, p.color);
    g.position.copy(posOfKey(k));
    g.traverse((o) => { o.userData.key = k; });
    pieceGroup.add(g);
    pieceMeshes.set(k, g);
  }
  // animate the last move if it is new
  const lm = state.lastMove;
  if (lm && prev && prev.id === state.id && prev.version === state.version - 1) {
    if (lm.board) {
      const dx = PINS[lm.to].x[0] - PINS[lm.from].x[0], dy = PINS[lm.to].y[0] - PINS[lm.from].y[0];
      const items = squaresOf(lm.to).filter((s) => pieceMeshes.get(s.key)).map((s) => ({ g: pieceMeshes.get(s.key), from: posOfKey(sqKey(s.x - dx, s.y - dy, lm.from)), to: posOfKey(s.key), arc: 0.5 }));
      anim = { items, board: { group: levelGroups[lm.to], delta: pinOrigin(lm.from).sub(pinOrigin(lm.to)) }, t0: performance.now(), dur: 900 };
    } else {
      const g = pieceMeshes.get(lm.to);
      const items = g ? [{ g, from: posOfKey(lm.from), to: posOfKey(lm.to), arc: 1.2 }] : [];
      const rook = lm.castle && pieceMeshes.get(lm.rookTo);
      if (rook) items.push({ g: rook, from: posOfKey(lm.rookFrom), to: posOfKey(lm.rookTo), arc: 0.6 });
      if (items.length) anim = { items, t0: performance.now(), dur: lm.castle ? 800 : 550 };
    }
  }
}

function renderPanel() {
  const s = state;
  let status;
  if (s.replay) status = t('replay.status', { i: s.replay.i, n: s.replay.n });
  else if (s.status === 'checkmate') status = t('status.mate', { c: IT[s.winner] });
  else if (s.status === 'stalemate') status = t('status.stalemate');
  else if (s.status === 'draw') status = t('status.draw', { r: DRAW_IT[s.drawReason || 'fifty'] });
  else if (s.status === 'resigned') status = t('status.resigned', { c: IT[s.winner] });
  else if (s.status === 'timeout') status = t('status.timeout', { c: IT[s.winner] });
  else if (s.check) status = t(s.legalMoves.length === 1 ? 'status.check1' : 'status.check', { c: IT[s.turn], n: s.legalMoves.length });
  else if (s.players[s.turn] === 'computer') status = t('status.computer', { c: IT[s.turn] });
  else if (s.players[s.turn] === 'remote') status = t('status.remote', { c: IT[s.turn] });
  else status = s.players[s.turn] === 'ai' ? t('status.ai', { c: IT[s.turn] }) : t('status.you', { c: IT[s.turn], n: s.legalMoves.length });
  $('status').textContent = status;
  $('status').classList.toggle('alert', s.check || s.status !== 'playing');
  $('turn').textContent = IT[s.turn];
  const pl = (c) => IT[s.players[c]] + (s.players[c] === 'computer' && s.computer ? ` · ${LEVEL_IT[s.computer[c].level].toLowerCase()}, ${STYLE_IT[s.computer[c].style].toLowerCase()}` : '');
  $('pw').textContent = pl('white');
  $('pb').textContent = pl('black');
  const ol = $('moves');
  ol.innerHTML = '';
  for (const m of s.history) {
    const li = document.createElement('li');
    li.className = m.color;
    li.textContent = m.notation;
    ol.appendChild(li);
  }
  $('log').scrollTop = $('log').scrollHeight;
  renderStats();
  renderMcp();
  syncLevel();
}

function applyState(s) {
  const prev = state;
  state = s;
  setKind(kindOf(s));
  if (!s.replay && (!prev || prev.id !== s.id)) {
    // new game: look from Black's side when Black is the only human on this screen
    const view = s.players.black === 'human' && s.players.white !== 'human' ? 'black' : 'white';
    if (!prev || prev.players?.black !== s.players.black || prev.players?.white !== s.players.white || kindOf(prev) !== kindOf(s)) { camIdx = view === 'black' ? 1 : 0; setView(view); }
  }
  if (!s.replay && (!prev || prev.id !== s.id)) { $('gameKind').value = kindOf(s); $('selW').value = s.players.white; $('selB').value = s.players.black; if (s.computer) for (const [c, k] of [['white', 'W'], ['black', 'B']]) { $('lvl' + k).value = String(s.computer[c].level); $('sty' + k).value = s.computer[c].style; } }
  if (selected && ((!isPin(selected) && !s.pieces[selected]) || (isPin(selected) && !s.boards[selected]) || !isHumanTurn())) selected = null;
  syncBoards();
  renderPieces(prev);
  renderMarkers();
  setSquareGlow();
  renderPanel();
  const canReplay = !s.replay && s.status !== 'playing' && s.history.length > 0;
  $('btnReplay').hidden = !canReplay;
  $('vReplay').hidden = !canReplay;
  if (s.replay) { if (victory) stopVictory(); return; }
  for (const f of window.TriD?.listeners || []) { try { f(s, prev); } catch (err) { console.error(err); } }
  const over = s.status !== 'playing';
  if (over && !quietVictory && (!prev || prev.id !== s.id || prev.status === 'playing')) startVictory();
  quietVictory = false;
  if (!over && victory) stopVictory();
}

// --- live state vs replay -------------------------------------------------------------
// Live states come from the server (or the local game in the web build). While a replay is
// open they are kept but not shown; the replay renders positions rebuilt with the engine.
let live = null;
let replay = null;        // { moves, i }
let quietVictory = false;
let replayFromUrl = null;
function onLive(s) {
  live = s;
  if (!replay) applyState(s);
  if (replayFromUrl) { const { moves, k } = replayFromUrl; replayFromUrl = null; startReplay(moves, k); }
}
const PUBLIC_DEMO = 'https://nicolorisitano82.github.io/tri-d-chess/play/';
const CHESS_MOVE_RE = /^([a-h][1-8])-([a-h][1-8])(?:=([QRBN]))?$/;
const MOVE_RE = /^([zabcde]\d(?:W|N|B|[QK]L[1-6])|[QK]L[1-6])-([zabcde]\d(?:W|N|B|[QK]L[1-6])|[QK]L[1-6])(?:=([QRBN]))?$/;
const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
function encodeGame(moves) { return b64url(moves.map((m) => `${m.from}-${m.to}${m.promotion ? '=' + m.promotion : ''}`).join('.')); }
function decodeGame(code, k = 'trid') {
  try {
    if (!code || code.length > 30000) return null;
    const parts = unb64url(code).split('.').filter(Boolean);
    if (!parts.length || parts.length > 2000) return null;
    const re = k === 'chess' ? CHESS_MOVE_RE : MOVE_RE;
    const moves = parts.map((p) => { const m = re.exec(p); return m && { from: m[1], to: m[2], promotion: m[3] || null }; });
    return moves.every(Boolean) ? moves : null;
  } catch { return null; }
}
function replayState(moves, i) {
  const g = replay?.kind === 'chess' ? new ChessGame({ white: 'human', black: 'human' }) : new Game({ white: 'human', black: 'human' });
  g.id = 'replay';
  let k = 0;
  for (; k < i; k++) { try { g.move(moves[k].from, moves[k].to, moves[k].promotion); } catch { break; } }
  return { ...g.snapshot(), legalMoves: [], replay: { i: k, n: moves.length } };
}
function startReplay(moves, k = 'trid') {
  if (!moves?.length) return;
  hideVictory();
  selected = null;
  replay = { moves, i: moves.length, kind: k };
  // validate the whole list once: stop at the first illegal move
  const full = replayState(moves, moves.length);
  replay.moves = moves.slice(0, full.replay.i);
  replay.i = replay.moves.length;
  if (!replay.i) { replay = null; toast(t('replay.bad')); return; }
  $('replayBar').hidden = false;
  showReplay();
}
function showReplay() {
  applyState(replayState(replay.moves, replay.i));
  $('rpPos').textContent = `${replay.i} / ${replay.moves.length}`;
  $('rpFirst').disabled = $('rpPrev').disabled = replay.i === 0;
  $('rpNext').disabled = $('rpLast').disabled = replay.i === replay.moves.length;
}
function stepReplay(to) {
  if (!replay) return;
  replay.i = Math.max(0, Math.min(replay.moves.length, to));
  showReplay();
}
function closeReplay() {
  if (!replay) return;
  replay = null;
  $('replayBar').hidden = true;
  try { const u = new URL(location.href); if (u.searchParams.has('replay')) { u.searchParams.delete('replay'); u.searchParams.delete('game'); history.replaceState(null, '', u); } } catch {}
  quietVictory = true;
  if (live) applyState(live);
}
const movesOfState = (s) => s.history.map((h) => ({ from: h.from, to: h.to, promotion: h.promotion || null }));
$('btnReplay').onclick = () => live && startReplay(movesOfState(live), kindOf(live));
$('vReplay').onclick = () => live && startReplay(movesOfState(live), kindOf(live));
$('rpFirst').onclick = () => stepReplay(0);
$('rpPrev').onclick = () => stepReplay(replay.i - 1);
$('rpNext').onclick = () => stepReplay(replay.i + 1);
$('rpLast').onclick = () => stepReplay(Infinity);
$('rpClose').onclick = closeReplay;
$('rpShare').onclick = () => {
  if (!replay) return;
  const url = `${PUBLIC_DEMO}?replay=${encodeGame(replay.moves)}${replay.kind === 'chess' ? '&game=chess' : ''}`;
  navigator.clipboard?.writeText(url).then(() => toast(t('replay.copied')), () => {});
};
window.addEventListener('keydown', (e) => {
  if (!replay || e.target?.closest?.('input, textarea, select')) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); stepReplay(replay.i - 1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); stepReplay(replay.i + 1); }
  else if (e.key === 'Home') stepReplay(0);
  else if (e.key === 'End') stepReplay(Infinity);
  else if (e.key === 'Escape') closeReplay();
});
{
  const qs = new URLSearchParams(location.search);
  const code = qs.get('replay'), k = qs.get('game') === 'chess' ? 'chess' : 'trid';
  if (code) { const m = decodeGame(code, k); if (m) replayFromUrl = { moves: m, k }; else setTimeout(() => toast(t('replay.bad')), 500); }
}

// --- rules page ---------------------------------------------------------------------
const rules = createRules({ getLang, onLangChange });
$('btnRules').onclick = () => rules.open(kind);
{
  const r = new URLSearchParams(location.search).get('rules');
  if (r !== null) rules.open(r === 'chess' ? 'chess' : r === 'trid' ? 'trid' : kind);
}

// --- victory celebration -------------------------------------------------------------
let victory = null;
const fxGroup = new THREE.Group();
scene.add(fxGroup);
const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd36b, metalness: 1, roughness: 0.18, emissive: 0x6a4300 });
const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const sparkTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

function kingKey(color) {
  return Object.keys(state.pieces).find((k) => state.pieces[k].type === 'K' && state.pieces[k].color === color);
}

function victoryText(s) {
  const n = Math.ceil(s.history.length / 2);
  $('vKing').innerHTML = '♚&#xFE0E;';
  if (!s.winner) {
    $('vEyebrow').textContent = t('victory.gameOver');
    $('vTitle').textContent = t('victory.draw');
    $('vSub').textContent = s.status === 'stalemate' ? t('victory.stalemate') : t('victory.drawBy', { r: DRAW_IT[s.drawReason || 'fifty'] });
    $('vMeta').textContent = t('victory.plies', { n: s.history.length });
  } else {
    const w = s.winner, st = statsFor(s, w);
    $('vEyebrow').textContent = t('victory.glory', { c: IT[w] });
    $('vTitle').textContent = t('victory.win');
    $('vSub').textContent = t('victory.sub', { c: IT[w], who: IT[s.players[w]], how: t(s.status === 'checkmate' ? 'victory.byMate' : s.status === 'timeout' ? 'victory.byTime' : 'victory.byResign'), n });
    $('vMeta').textContent = t('victory.meta', { caps: st.caps.length, checks: st.checks, mat: st.material });
  }
}

function startVictory() {
  stopVictory();
  const s = state;
  const draw = !s.winner;
  const ov = $('victory');
  ov.classList.toggle('draw', draw);
  const vc = s.winner === 'black' ? '#ff4d6d' : '#ffd36b';
  ov.style.setProperty('--vc', vc);
  ov.style.setProperty('--vk', s.winner === 'black' ? '#d23a55' : '#f4f7fb');
  victoryText(s);
  ov.classList.add('show');
  if (draw) { victory = { draw: true }; return; }

  const wk = kingKey(s.winner), lk = kingKey(s.winner === 'white' ? 'black' : 'white');
  const king = pieceMeshes.get(wk), loser = pieceMeshes.get(lk);
  if (!king) return;
  king.traverse((o) => { if (o.isMesh) o.material = goldMat; });
  const base = king.position.clone();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.8, 30, 32, 1, true), beamMat);
  beam.position.set(base.x, base.y + 15, base.z);
  fxGroup.add(beam);
  const light = new THREE.PointLight(0xffd36b, 0, 14);
  light.position.copy(base).y += 2;
  fxGroup.add(light);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 12, 64), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
  halo.rotation.x = Math.PI / 2;
  fxGroup.add(halo);
  victory = { king, loser, loserBase: loser?.position.clone(), base, beam, light, halo, t0: performance.now(), bursts: [], nextBurst: 0, savedTarget: controls.target.clone() };
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.6;
}

function burst(center, color) {
  const n = 90, pos = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) {
    pos.set([center.x, center.y, center.z], i * 3);
    vel.push(new THREE.Vector3().randomDirection().multiplyScalar(2 + Math.random() * 2.5));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color, size: 0.28, map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(g, m);
  fxGroup.add(pts);
  return { pts, vel, t0: performance.now() };
}

function updateVictory(t) {
  const v = victory;
  if (!v || v.draw) return;
  const e = (performance.now() - v.t0) / 1000;
  const rise = Math.min(1, e / 1.6), ease = 1 - Math.pow(1 - rise, 3);
  v.king.position.set(v.base.x, v.base.y + ease * 1.8 + Math.sin(e * 2) * 0.08 * rise, v.base.z);
  v.king.rotation.y = e * 1.4;
  v.king.scale.setScalar(0.85 * (1 + 0.6 * ease));
  goldMat.emissiveIntensity = 1 + Math.sin(e * 3) * 0.5;
  v.beam.material.opacity = 0.12 + 0.12 * ease + Math.sin(e * 4) * 0.04;
  v.light.intensity = 30 * ease;
  v.halo.position.set(v.base.x, v.king.position.y + 1.55 * v.king.scale.y / 0.85 * 0.85, v.base.z);
  v.halo.scale.setScalar(1 + Math.sin(e * 3) * 0.08);
  if (v.loser) {
    const k = Math.min(1, Math.max(0, (e - 0.4) / 1.2));
    v.loser.rotation.z = (Math.PI / 2) * (1 - Math.pow(1 - k, 3));
    v.loser.position.y = v.loserBase.y + 0.15 * k;
  }
  controls.target.lerp(new THREE.Vector3(v.base.x, v.base.y + 1.2, v.base.z), 0.03);
  if (e > 0.8 && e > v.nextBurst) {
    v.nextBurst = e + 0.45 + Math.random() * 0.4;
    const c = v.base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 2.5 + Math.random() * 3, (Math.random() - 0.5) * 6));
    const cols = state.winner === 'black' ? [0xff4d6d, 0xffd36b, 0xff9c33] : [0xffd36b, 0x9fd0ff, 0xffffff];
    v.bursts.push(burst(c, cols[Math.floor(Math.random() * cols.length)]));
  }
  for (const b of v.bursts) {
    const age = (performance.now() - b.t0) / 1000;
    const p = b.pts.geometry.attributes.position;
    for (let i = 0; i < b.vel.length; i++) {
      b.vel[i].y -= 2.2 * 0.016;
      b.vel[i].multiplyScalar(0.985);
      p.setXYZ(i, p.getX(i) + b.vel[i].x * 0.016, p.getY(i) + b.vel[i].y * 0.016, p.getZ(i) + b.vel[i].z * 0.016);
    }
    p.needsUpdate = true;
    b.pts.material.opacity = Math.max(0, 1 - age / 1.8);
  }
  v.bursts = v.bursts.filter((b) => {
    if ((performance.now() - b.t0) / 1000 > 1.8) { fxGroup.remove(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose(); return false; }
    return true;
  });
}

function hideVictory() { $('victory').classList.remove('show'); }
function stopVictory() {
  hideVictory();
  if (victory && !victory.draw) {
    controls.autoRotate = false;
    controls.target.copy(victory.savedTarget);
  }
  fxGroup.clear();
  victory = null;
}
$('vClose').onclick = hideVictory;
$('vNew').onclick = () => { stopVictory(); selected = null; post('/api/new', newGameBody()); };

const es = new EventSource('/api/events');
es.onmessage = (e) => onLive(JSON.parse(e.data));
es.onerror = () => { $('status').textContent = t('status.lost'); };

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) toast(j.error || t('ui.error', { s: r.status }));
  return j;
}

$('btnNew').onclick = () => { selected = null; post('/api/new', newGameBody()); };
$('btnResign').onclick = () => { if (isHumanTurn() && confirm(t('ui.resignConfirm'))) post('/api/resign'); };
$('btnCam').onclick = () => { camIdx = (camIdx + 1) % 3; setView(Object.keys(CAM_VIEWS)[camIdx]); };

// --- promotion picker ------------------------------------------------------------------
function askPromotion(color) {
  return new Promise((resolve) => {
    const box = $('promo');
    box.querySelectorAll('button[data-p]').forEach((b) => {
      b.innerHTML = GLYPH[b.dataset.p] + '\uFE0E';
      b.className = 'pp ' + color[0];
      b.onclick = () => { box.hidden = true; resolve(b.dataset.p); };
    });
    $('promoCancel').onclick = () => { box.hidden = true; resolve(null); };
    box.hidden = false;
  });
}

// --- picking -------------------------------------------------------------------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const hits = ray.intersectObjects([...markerGroup.children, ...ghostGroup.children, ...pieceGroup.children, ...pickables], true).filter((h) => shown(h.object));
  // lines and labels have no key (and a wide raycast threshold): only keyed objects count
  return hits.find((h) => h.object.userData.key)?.object.userData.key ?? null;
}

function describeKey(k) {
  if (!k) return '—';
  if (isPin(k)) return t('hint.pin', { p: k });
  const p = state?.pieces[k];
  const lv = parseSquare(k)?.level;
  const extra = lv && isPin(lv) && targetsOf(lv).length && isHumanTurn() ? t('hint.movable') : '';
  return (p ? `${k} · ${IT[p.color]} ${PIECE_IT[p.type]}` : k) + extra;
}
const PIECE_IT = table('piece');

let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointermove', (e) => { $('hover').textContent = describeKey(pick(e)); });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
  down = null;
  const k = pick(e);
  if (!state || !isHumanTurn()) { if (k && state?.status === 'playing') toast(t('hint.notYourTurn')); return; }
  if (selected && k && targetsOf(selected).some((m) => m.to === k)) {
    const from = selected;
    const promo = targetsOf(from).some((m) => m.to === k && m.promotion);
    selected = null;
    renderMarkers(); setSquareGlow();
    if (promo) askPromotion(state.turn).then((p) => { if (p) post('/api/move', { from, to: k, promotion: p }); });
    else post('/api/move', { from, to: k });
    return;
  }
  const p = k && state.pieces[k];
  if (selected && pieceMeshes.get(selected)) pieceMeshes.get(selected).position.copy(posOfKey(selected));
  const lv = k && !isPin(k) ? parseSquare(k)?.level : null;
  if (!p && lv && isPin(lv)) {
    // empty square of an attack board: select the board itself
    selected = targetsOf(lv).length ? lv : null;
    if (!selected) {
      const n = squaresOf(lv).filter((s) => state.pieces[s.key]).length;
      toast(n > 1 ? t('hint.boardLocked')
        : n === 1 && state.pieces[squaresOf(lv).find((s) => state.pieces[s.key]).key].color !== state.turn ? t('hint.boardEnemy')
        : n === 0 && state.boards[lv] !== state.turn ? t('hint.boardEnemyEmpty')
        : t('hint.boardNoPin'));
    }
    renderMarkers();
    setSquareGlow();
    return;
  }
  selected = p && p.color === state.turn && targetsOf(k).length ? k : null;
  if (p && p.color === state.turn && !targetsOf(k).length && p.type === 'P' && lv && isPin(lv) && !state.check) {
    toast(t('hint.pawnStuck'));
  } else if (p && p.color === state.turn && !targetsOf(k).length) {
    if (p.type === 'K' && state.check) toast(t('hint.kingStuckCheck'));
    else if (p.type === 'K') toast(t('hint.kingStuck', { n: state.legalMoves.length }));
    else toast(state.check ? t('hint.notBlocking') : t('hint.noMoves'));
  }
  renderMarkers();
  setSquareGlow();
});

// --- loop ------------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  if (kind === 'chess') chessView.update(t);
  else scene.getObjectByName('stars').rotation.y = t * 0.004;
  ringMove.opacity = 0.6 + 0.3 * Math.sin(t * 4);
  if (anim) {
    const k = Math.min(1, (performance.now() - anim.t0) / anim.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    for (const it of anim.items) {
      it.g.position.lerpVectors(it.from, it.to, e);
      it.g.position.y += Math.sin(Math.PI * k) * it.arc;
    }
    if (anim.board) {
      anim.board.group.position.copy(anim.board.delta).multiplyScalar(1 - e);
      anim.board.group.position.y += Math.sin(Math.PI * k) * 0.5;
    }
    if (k >= 1) { if (anim.board) anim.board.group.position.set(0, 0, 0); anim = null; }
  }
  updateVictory(t);
  if (selected && pieceMeshes.get(selected)) {
    pieceMeshes.get(selected).position.y = posOfKey(selected).y + 0.12 + Math.sin(t * 5) * 0.05;
  }
  controls.update();
  renderer.render(scene, camera);
});

// --- hooks for optional modules (network play, net.js) ---------------------------------
window.TriD = Object.assign(window.TriD || {}, { getState: () => live || state, post, toast, t, onLangChange, listeners: window.TriD?.listeners || [] });

// --- language (IT / EN) -------------------------------------------------------------------
function refreshLanguage() {
  applyStatic();
  $('langBtn').textContent = getLang() === 'it' ? 'EN' : 'IT';
  if (state) { renderPanel(); renderMcp(); if ($('victory').classList.contains('show')) victoryText(state); }
}
$('langBtn').onclick = () => setLang(getLang() === 'it' ? 'en' : 'it');
onLangChange(refreshLanguage);
refreshLanguage();
