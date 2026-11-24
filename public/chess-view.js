// Classic chess in a medieval setting: walnut and maple board with a carved frame, a stone
// table and floor, torch light, and ivory / ebony pieces turned on a lathe.
// The view plugs into app.js like the Tri-D boards: square meshes keyed "a1".."h8",
// posOfKey() for piece positions, buildPiece() for the 3D pieces, camera views.
import * as THREE from 'three';

const FILES = 'abcdefghij';
const SQ = 1;
const TOP = 0.06;                                  // y of the playing surface

export const CHESS_VIEWS = {
  white: { pos: [-1.5, 10.5, 9.8], target: [-1.5, 0, 0.6], narrow: [0, 0, 0.6] },
  black: { pos: [1.5, 10.5, -9.8], target: [1.5, 0, -0.6], narrow: [0, 0, -0.6] },
  side: { pos: [10.5, 5.5, 0], target: [0, 0, 0], narrow: [0, 0, 0] },
};

// centre of a square on an n x n board ("a1".."h8", or up to "j10")
const squarePos = (n) => (key) => {
  const f = FILES.indexOf(key[0]), r = Number(key.slice(1));
  return new THREE.Vector3((f - (n - 1) / 2) * SQ, TOP, -(r - (n + 1) / 2) * SQ);
};
export const posOfSquare = squarePos(8);

// --- procedural textures -------------------------------------------------------------
function woodTexture(base, grain, seed = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = grain;
    g.globalAlpha = 0.08 + rnd() * 0.12;
    g.lineWidth = 1 + rnd() * 2.5;
    g.beginPath();
    const y = rnd() * 256;
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x / 40 + i) * (3 + rnd() * 5));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function stoneTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#3a342e';
  g.fillRect(0, 0, 512, 512);
  // flagstones
  for (let y = 0; y < 512; y += 128) for (let x = (y / 128) % 2 ? -64 : 0; x < 512; x += 128) {
    const shade = 46 + Math.floor(Math.random() * 18);
    g.fillStyle = `rgb(${shade + 6},${shade},${shade - 6})`;
    g.fillRect(x + 3, y + 3, 122, 122);
    for (let k = 0; k < 160; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(x + Math.random() * 124, y + Math.random() * 124, 2, 2); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}
function flameTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 40, 2, 32, 34, 30);
  gr.addColorStop(0, 'rgba(255,250,210,1)');
  gr.addColorStop(0.3, 'rgba(255,190,80,.9)');
  gr.addColorStop(0.7, 'rgba(255,90,20,.35)');
  gr.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function labelSprite(text) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 40px Georgia, "Times New Roman", serif';
  g.fillStyle = '#e8cf9a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  sp.scale.set(0.36, 0.36, 1);
  return sp;
}

// --- pieces ------------------------------------------------------------------------------
const IVORY = new THREE.MeshStandardMaterial({ color: 0xefe2c4, roughness: 0.42, metalness: 0.04, emissive: 0x1a140a });
const EBONY = new THREE.MeshStandardMaterial({ color: 0x2b1d15, roughness: 0.32, metalness: 0.08, emissive: 0x0a0503 });
const GOLD = new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.3, metalness: 0.85 });

const lathe = (pts, seg = 40) => new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg);
const BASE = [[0, 0], [0.34, 0], [0.34, 0.05], [0.29, 0.08], [0.31, 0.11], [0.24, 0.15]];
function add(g, geo, mat, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0], sc = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (sc) m.scale.set(...sc);
  g.add(m);
  return m;
}

const KNIGHT_PROFILE = (() => {
  // side view of a horse head facing +x, in piece units
  const s = new THREE.Shape();
  const p = [[-0.2, 0.16], [0.22, 0.16], [0.2, 0.3], [0.12, 0.42], [0.2, 0.5], [0.33, 0.55], [0.36, 0.62], [0.3, 0.68], [0.16, 0.72],
    [0.12, 0.82], [0.06, 0.86], [0.02, 0.8], [-0.06, 0.84], [-0.1, 0.78], [-0.2, 0.66], [-0.24, 0.5], [-0.22, 0.32]];
  s.moveTo(...p[0]);
  for (const q of p.slice(1)) s.lineTo(...q);
  s.closePath();
  return s;
})();

const PIECES = {
  P(g, m) {
    add(g, lathe([...BASE, [0.13, 0.32], [0.2, 0.36], [0.12, 0.4], [0, 0.4]]), m);
    add(g, new THREE.SphereGeometry(0.14, 28, 20), m, [0, 0.52, 0]);
  },
  R(g, m) {
    add(g, lathe([...BASE, [0.2, 0.22], [0.18, 0.56], [0.25, 0.6], [0.25, 0.7], [0.19, 0.7], [0.19, 0.66], [0, 0.66]]), m);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(g, new THREE.BoxGeometry(0.1, 0.1, 0.08), m, [Math.cos(a) * 0.21, 0.75, Math.sin(a) * 0.21], [0, -a, 0]);
    }
    add(g, new THREE.BoxGeometry(0.05, 0.11, 0.02), EBONY === m ? IVORY : EBONY, [0, 0.42, 0.185]); // arrow slit
  },
  B(g, m) {
    add(g, lathe([...BASE, [0.12, 0.42], [0.2, 0.46], [0.11, 0.5], [0, 0.5]]), m);
    add(g, new THREE.SphereGeometry(0.15, 28, 20), m, [0, 0.66, 0], [0, 0, 0], [1, 1.45, 1]);
    add(g, new THREE.BoxGeometry(0.03, 0.16, 0.32), m === EBONY ? IVORY : EBONY, [0, 0.7, 0], [0, 0, 0.6]); // mitre cut
    add(g, new THREE.SphereGeometry(0.045, 16, 12), m, [0, 0.9, 0]);
  },
  N(g, m) {
    add(g, lathe([...BASE, [0.22, 0.18], [0, 0.18]]), m);
    // horse head: side profile extruded and centred, turned to face the opponent (3/4 view)
    const head = new THREE.Group();
    const geo = new THREE.ExtrudeGeometry(KNIGHT_PROFILE, { depth: 0.2, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
    geo.translate(0, 0, -0.1);
    add(head, geo, m);
    const eye = m === EBONY ? GOLD : EBONY;
    add(head, new THREE.SphereGeometry(0.028, 10, 8), eye, [0.2, 0.62, 0.13]);
    add(head, new THREE.SphereGeometry(0.028, 10, 8), eye, [0.2, 0.62, -0.13]);
    head.rotation.y = Math.PI / 2 - 0.55;
    g.add(head);
  },
  Q(g, m) {
    add(g, lathe([...BASE, [0.13, 0.52], [0.22, 0.6], [0.14, 0.66], [0.21, 0.82], [0, 0.8]]), m);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      add(g, new THREE.SphereGeometry(0.035, 10, 8), GOLD, [Math.cos(a) * 0.19, 0.86, Math.sin(a) * 0.19]);
    }
    add(g, new THREE.SphereGeometry(0.07, 16, 12), m, [0, 0.9, 0]);
  },
  K(g, m) {
    add(g, lathe([...BASE, [0.14, 0.56], [0.23, 0.64], [0.15, 0.7], [0.2, 0.86], [0, 0.86]]), m);
    add(g, new THREE.TorusGeometry(0.19, 0.025, 8, 40), GOLD, [0, 0.86, 0], [Math.PI / 2, 0, 0]);
    add(g, new THREE.BoxGeometry(0.06, 0.26, 0.06), m, [0, 1.02, 0]);
    add(g, new THREE.BoxGeometry(0.18, 0.06, 0.06), m, [0, 1.06, 0]);
  },
};

// Draughts: a turned disc with grooves; a king ("dama") is two discs crowned with gold.
function disc(g, m, y) {
  add(g, new THREE.CylinderGeometry(0.4, 0.42, 0.13, 40), m, [0, y + 0.065, 0]);
  add(g, new THREE.TorusGeometry(0.33, 0.012, 6, 40), GOLD, [0, y + 0.132, 0], [Math.PI / 2, 0, 0]);
  add(g, new THREE.TorusGeometry(0.2, 0.01, 6, 32), m, [0, y + 0.132, 0], [Math.PI / 2, 0, 0]);
}
export function buildDraughtsPiece(type, color) {
  const g = new THREE.Group();
  const m = color === 'white' ? IVORY : EBONY;
  disc(g, m, 0);
  if (type === 'D') {
    disc(g, m, 0.135);
    add(g, new THREE.TorusGeometry(0.14, 0.035, 8, 32), GOLD, [0, 0.29, 0], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(g, new THREE.ConeGeometry(0.03, 0.09, 6), GOLD, [Math.cos(a) * 0.14, 0.34, Math.sin(a) * 0.14]); }
  }
  return g;
}

export function buildChessPiece(type, color) {
  const g = new THREE.Group();
  PIECES[type](g, color === 'white' ? IVORY : EBONY);
  if (color === 'black') g.rotation.y = Math.PI;
  return g;
}

// --- Xiangqi pieces: flat wooden discs with the character carved on top -----------------------
// Red: 帥 仕 相 傌 俥 炮 兵, Black: 將 士 象 馬 車 砲 卒 (traditional forms).
const XQ_CHARS = {
  white: { K: '帥', A: '仕', E: '相', H: '傌', R: '俥', C: '炮', P: '兵' },
  black: { K: '將', A: '士', E: '象', H: '馬', R: '車', C: '砲', P: '卒' },
};
const XQ_WOOD = new THREE.MeshStandardMaterial({ color: 0xe9d3a4, roughness: 0.5, metalness: 0.02, emissive: 0x15100a });
const xqFaces = {};
function xqFace(type, color) {
  const id = color + type;
  if (xqFaces[id]) return xqFaces[id];
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const ink = color === 'white' ? '#b3121b' : '#14100c';
  const gr = g.createRadialGradient(128, 118, 20, 128, 128, 128);
  gr.addColorStop(0, '#f6e6c2'); gr.addColorStop(1, '#dcc08a');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = ink;
  g.lineWidth = 7;
  g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
  g.fillStyle = ink;
  g.font = 'bold 140px "Kaiti SC","STKaiti","KaiTi","Songti SC","SimSun","Noto Serif CJK TC","PingFang TC",serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(XQ_CHARS[color][type], 128, 136);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return (xqFaces[id] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.02, emissive: 0x15100a }));
}
export function buildXiangqiPiece(type, color) {
  const g = new THREE.Group();
  // side wood, top face with the character, bottom plain; turned so each player reads its own pieces
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.2, 40), [XQ_WOOD, xqFace(type, color), XQ_WOOD]);
  m.position.y = 0.1;
  if (color === 'black') m.rotation.y = Math.PI;
  g.add(m);
  return g;
}

// the board: lines on wood, river with its inscription, palaces with diagonals
function xiangqiBoardTexture() {
  const S = 100, W = 11 * S, H = 12 * S;                // one point = 100 px; board 11 x 12 units
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(woodTexture('#d8b47a', '#9a6a35', 13).image, 0, 0, W, H);
  const X = (f) => S * 1.5 + f * S, Y = (r) => H - (S * 1.5 + r * S);                     // f 0..8, r 0..9; 1.5 points of margin
  g.strokeStyle = '#3a200c';
  g.lineWidth = 4;
  g.strokeRect(X(0) - 12, Y(9) - 12, X(8) - X(0) + 24, Y(0) - Y(9) + 24);
  g.lineWidth = 3;
  for (let r = 0; r < 10; r++) { g.beginPath(); g.moveTo(X(0), Y(r)); g.lineTo(X(8), Y(r)); g.stroke(); }
  for (let f = 0; f < 9; f++) {
    g.beginPath();
    if (f === 0 || f === 8) { g.moveTo(X(f), Y(0)); g.lineTo(X(f), Y(9)); }
    else { g.moveTo(X(f), Y(0)); g.lineTo(X(f), Y(4)); g.moveTo(X(f), Y(5)); g.lineTo(X(f), Y(9)); }   // the river cuts the files
    g.stroke();
  }
  for (const [r0, r1] of [[0, 2], [7, 9]]) {
    g.beginPath(); g.moveTo(X(3), Y(r0)); g.lineTo(X(5), Y(r1)); g.moveTo(X(5), Y(r0)); g.lineTo(X(3), Y(r1)); g.stroke();
  }
  // small marks on the cannon and soldier points
  const mark = (f, r) => {
    const d = 10, l = 22;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      if ((f === 0 && sx < 0) || (f === 8 && sx > 0)) continue;
      g.beginPath();
      g.moveTo(X(f) + sx * d, Y(r) + sy * (d + l)); g.lineTo(X(f) + sx * d, Y(r) + sy * d); g.lineTo(X(f) + sx * (d + l), Y(r) + sy * d);
      g.stroke();
    }
  };
  for (const [f, r] of [[1, 2], [7, 2], [1, 7], [7, 7]]) mark(f, r);
  for (const f of [0, 2, 4, 6, 8]) { mark(f, 3); mark(f, 6); }
  g.fillStyle = '#3a200c';
  g.font = 'bold 62px "Kaiti SC","STKaiti","KaiTi","Songti SC","SimSun",serif';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  const ry = (Y(4) + Y(5)) / 2;
  g.fillText('楚 河', (X(1) + X(3)) / 2, ry);
  g.save(); g.translate((X(5) + X(7)) / 2, ry); g.rotate(Math.PI); g.fillText('漢 界', 0, 0); g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// an invisible pick tile on each point that lights up like a square when the app sets its emissive
function pointTile(geo) {
  // additive: the glow colour is added to the wood below (black adds nothing), like a lit square
  const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x000000, emissiveIntensity: 3.5, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const setHex = mat.emissive.setHex.bind(mat.emissive);
  mat.emissive.setHex = (h) => { setHex(h); mat.opacity = h ? 1 : 0; return mat.emissive; };
  return new THREE.Mesh(geo, mat);
}

// --- Chinese checkers: a round walnut board with the star inlaid, glass marbles ----------------
const STAR_FILES = 'abcdefghijklmnopq';
const U = 0.78;                                        // distance between neighbouring holes
const starXZ = (key) => { const x = STAR_FILES.indexOf(key[0]) - 8, z = Number(key.slice(1)) - 9; return [(x + z / 2) * U, -z * (Math.sqrt(3) / 2) * U]; };
const STAR_R = 8.4;                                    // board radius
const MARBLE = {
  white: new THREE.MeshPhysicalMaterial({ color: 0xf4efe6, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.4, emissive: 0x15120c }),
  black: new THREE.MeshPhysicalMaterial({ color: 0x2a1a3a, roughness: 0.1, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x08040c }),
};
const marbleGeo = new THREE.SphereGeometry(0.29, 32, 24);
export function buildMarble(type, color) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(marbleGeo, MARBLE[color] || MARBLE.white);
  m.position.y = 0.2;
  g.add(m);
  return g;
}
function starBoardTexture(holes, home) {
  const W = 2048, R = STAR_R;
  const c = document.createElement('canvas');
  c.width = c.height = W;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 4, 0, Math.PI * 2); g.clip();   // round board: transparent outside
  g.drawImage(woodTexture('#6b4424', '#2e1a0a', 17).image, 0, 0, W, W);
  const P = (key) => { const [x, z] = starXZ(key); return [(x / (2 * R) + 0.5) * W, (z / (2 * R) + 0.5) * W]; };
  const px = W / (2 * R);                              // pixels per world unit
  // the star: a lighter inlay under the six points and the centre, home points tinted
  const disc = (key, r, fill) => { const [x, y] = P(key); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };
  for (const k of holes) disc(k, U * 0.62 * px, '#d9b47c');
  for (const k of home.white) disc(k, U * 0.62 * px, '#efe3c8');
  for (const k of home.black) disc(k, U * 0.62 * px, '#6a4a7c');
  // grooves between neighbouring holes
  g.strokeStyle = 'rgba(60,30,10,.55)';
  g.lineWidth = 3;
  const set = new Set(holes);
  for (const k of holes) {
    const x = STAR_FILES.indexOf(k[0]) - 8, z = Number(k.slice(1)) - 9;
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 1]]) {
      const n = STAR_FILES[x + dx + 8] + (z + dz + 9);
      if (!set.has(n)) continue;
      const [a, b] = P(k), [c2, d] = P(n);
      g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke();
    }
  }
  // the holes
  for (const k of holes) {
    const [x, y] = P(k);
    const gr = g.createRadialGradient(x, y - 3, 2, x, y, U * 0.3 * px);
    gr.addColorStop(0, '#1a0e05'); gr.addColorStop(1, '#4a2c14');
    g.beginPath(); g.arc(x, y, U * 0.3 * px, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
  }
  // brass ring at the edge
  g.strokeStyle = '#b08a3e'; g.lineWidth = 14;
  g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 30, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// --- the room and the board ------------------------------------------------------------
// size: 8 or 10. darkA1: whether a1 is a dark square (chess, international draughts); the Italian
// draughts board is turned so that the dark corner is on each player's right (h1).
// draughts: build discs instead of chess pieces. xiangqi: the 9 x 10 Chinese board (pieces on points).
// star: { holes, home: { white, black } } for the Chinese checkers board.
export function createChessView({ size = 8, darkA1 = true, draughts = false, xiangqi = false, star = null } = {}) {
  const cols = xiangqi ? 9 : size, rows = xiangqi ? 10 : size;
  const n = Math.max(cols, rows), k = n / 8;
  const posOf = star ? (key) => { const [x, z] = starXZ(key); return new THREE.Vector3(x, TOP, z); } : (key) => {
    const f = FILES.indexOf(key[0]), r = Number(key.slice(1));
    return new THREE.Vector3((f - (cols - 1) / 2) * SQ, TOP, -(r - (rows + 1) / 2) * SQ);
  };
  const root = new THREE.Group();
  root.visible = false;
  const squares = [];

  if (star) {
    const board = new THREE.Mesh(new THREE.CylinderGeometry(STAR_R, STAR_R + 0.15, 0.35, 96), new THREE.MeshStandardMaterial({ map: woodTexture('#3b2414', '#1c0e05', 3), roughness: 0.45 }));
    board.position.y = TOP - 0.2;
    root.add(board);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(2 * STAR_R, 2 * STAR_R), new THREE.MeshStandardMaterial({ map: starBoardTexture(star.holes, star.home), roughness: 0.55, transparent: true, alphaTest: 0.5 }));
    top.rotation.x = -Math.PI / 2;
    top.position.y = TOP - 0.02;
    root.add(top);
    const tileGeo = new THREE.CylinderGeometry(U * 0.42, U * 0.42, 0.02, 24);
    for (const key of star.holes) {
      const m = pointTile(tileGeo);
      m.position.copy(posOf(key));
      m.position.y = TOP + 0.005;
      m.userData = { key, kind: 'square' };
      root.add(m);
      squares.push({ key, mesh: m });
    }
  } else if (xiangqi) {
    const top = new THREE.Mesh(new THREE.BoxGeometry(cols + 2 * SQ - 0.02, 0.08, rows + 2 * SQ - 0.02),
      [0, 1, 2, 3, 4, 5].map((i) => new THREE.MeshStandardMaterial(i === 2 ? { map: xiangqiBoardTexture(), roughness: 0.6 } : { color: 0x9a6a35, roughness: 0.6 })));
    top.position.y = TOP - 0.04;
    root.add(top);
    const tileGeo = new THREE.CylinderGeometry(SQ * 0.46, SQ * 0.46, 0.02, 32);
    for (let f = 0; f < cols; f++) for (let r = 1; r <= rows; r++) {
      const key = FILES[f] + r;
      const m = pointTile(tileGeo);
      m.position.copy(posOf(key));
      m.position.y = TOP + 0.005;
      m.userData = { key, kind: 'square' };
      root.add(m);
      squares.push({ key, mesh: m });
    }
  } else {
    const light = new THREE.MeshStandardMaterial({ map: woodTexture('#d9b98a', '#8a5a2b', 7), roughness: 0.55, metalness: 0.02, emissive: 0x000000 });
    const dark = new THREE.MeshStandardMaterial({ map: woodTexture('#5a3a22', '#2a170a', 11), roughness: 0.5, metalness: 0.03, emissive: 0x000000 });
    const sqGeo = new THREE.BoxGeometry(SQ * 0.995, 0.08, SQ * 0.995);
    for (let f = 0; f < n; f++) for (let r = 1; r <= n; r++) {
      const key = FILES[f] + r;
      const isDark = ((f + r) % 2 === 1) === darkA1;
      const m = new THREE.Mesh(sqGeo, (isDark ? dark : light).clone());
      m.position.copy(posOf(key));
      m.position.y = TOP - 0.04;
      m.userData = { key, kind: 'square' };
      root.add(m);
      squares.push({ key, mesh: m });
    }
  }
  // carved frame with brass inlay and coordinates (the Chinese board has one point of margin inside)
  const frameWood = new THREE.MeshStandardMaterial({ map: woodTexture('#3b2414', '#1c0e05', 3), roughness: 0.45, metalness: 0.05 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3e, roughness: 0.35, metalness: 0.8 });
  if (!star) {
  const pad = xiangqi ? 2 : 0;
  const FW = cols + pad + 1.3, FD = rows + pad + 1.3;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(FW, 0.3, FD), frameWood);
  frame.position.y = -0.13;
  root.add(frame);
  const ex = (cols + pad) / 2 + 0.07, ez = (rows + pad) / 2 + 0.07;
  for (const [w, d, x, z] of [[2 * ex + 0.06, 0.05, 0, ez], [2 * ex + 0.06, 0.05, 0, -ez], [0.05, 2 * ez + 0.06, ex, 0], [0.05, 2 * ez + 0.06, -ex, 0]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), brass);
    b.position.set(x, 0.03, z);
    root.add(b);
  }
  const lx = (cols + pad) / 2 + 0.38, lz = (rows + pad) / 2 + 0.38;
  for (let i = 0; i < cols; i++) for (const z of [lz, -lz]) { const s = labelSprite(FILES[i]); s.position.set(i - (cols - 1) / 2, 0.06, z); root.add(s); }
  for (let i = 0; i < rows; i++) for (const x of [-lx, lx]) { const s = labelSprite(String(i + 1)); s.position.set(x, 0.06, -(i + 1 - (rows + 1) / 2)); root.add(s); }
  }
  // stone table and floor
  const stone = new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.9, metalness: 0 });
  const tk = star ? 13 / 8 : xiangqi ? 12.5 / 8 : k;
  const table = new THREE.Mesh(new THREE.CylinderGeometry(7.6 * tk, 7.9 * tk, 0.5, 64), new THREE.MeshStandardMaterial({ map: woodTexture('#4a2f1b', '#24130a', 5), roughness: 0.6 }));
  table.position.y = -0.55;
  root.add(table);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 4, 24), frameWood);
  leg.position.y = -2.8;
  root.add(leg);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), stone);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -4.8;
  root.add(floor);

  // lights: warm hemisphere, cold moonlight from a window, two torches
  root.add(new THREE.HemisphereLight(0xffd9a8, 0x1a0f08, 0.55));
  const moon = new THREE.DirectionalLight(0xaabbe0, 0.9);
  moon.position.set(-8, 14, 6);
  root.add(moon);
  const flameTex = flameTexture();
  const torches = [];
  for (const [x, z] of [[-8.5, -5], [8.5, 5], [8.5, -6]].map(([x, z]) => [x * tk, z * tk])) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.2, 10), frameWood);
    pole.position.set(x, 1.2, z);
    root.add(pole);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.14, 0.3, 12), brass);
    cup.position.set(x, 2.4, z);
    root.add(cup);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff }));
    flame.position.set(x, 2.85, z);
    flame.scale.set(0.9, 1.3, 1);
    root.add(flame);
    const pl = new THREE.PointLight(0xff9a3c, 40, 22, 1.6);
    pl.position.set(x, 3, z);
    root.add(pl);
    torches.push({ pl, flame, phase: Math.random() * 10 });
  }

  const vk = star ? 11.5 / 8 : xiangqi ? 11.5 / 8 : k;                       // the 9 x 10 board with its margin is ~12 x 13 units
  return {
    root,
    squares,
    views: vk === 1 ? CHESS_VIEWS : Object.fromEntries(Object.entries(CHESS_VIEWS).map(([name, v]) => [name, { pos: v.pos.map((x) => x * vk), target: v.target.map((x) => x * vk), narrow: v.narrow.map((x) => x * vk) }])),
    posOfKey: posOf,
    buildPiece: star ? buildMarble : xiangqi ? buildXiangqiPiece : draughts ? buildDraughtsPiece : buildChessPiece,
    background: 0x140d08,
    fog: [0x140d08, 22, 70],
    update(t) {
      for (const tc of torches) {
        const k = 0.85 + Math.sin(t * 7.3 + tc.phase) * 0.08 + Math.sin(t * 13.1 + tc.phase * 2) * 0.05 + Math.random() * 0.04;
        tc.pl.intensity = 40 * k;
        tc.flame.scale.set(0.9 * (0.9 + k * 0.15), 1.3 * k, 1);
      }
    },
  };
}
