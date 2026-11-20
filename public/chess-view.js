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

// --- the room and the board ------------------------------------------------------------
// size: 8 or 10. darkA1: whether a1 is a dark square (chess, international draughts); the Italian
// draughts board is turned so that the dark corner is on each player's right (h1).
// draughts: build discs instead of chess pieces.
export function createChessView({ size = 8, darkA1 = true, draughts = false } = {}) {
  const n = size, half = n / 2, posOf = squarePos(n), k = n / 8;
  const root = new THREE.Group();
  root.visible = false;
  const squares = [];

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
  // carved frame with brass inlay and coordinates
  const frameWood = new THREE.MeshStandardMaterial({ map: woodTexture('#3b2414', '#1c0e05', 3), roughness: 0.45, metalness: 0.05 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(n + 1.3, 0.3, n + 1.3), frameWood);
  frame.position.y = -0.13;
  root.add(frame);
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3e, roughness: 0.35, metalness: 0.8 });
  const e = half + 0.07, L = n + 0.2;
  for (const [w, d, x, z] of [[L, 0.05, 0, e], [L, 0.05, 0, -e], [0.05, L, e, 0], [0.05, L, -e, 0]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), brass);
    b.position.set(x, 0.03, z);
    root.add(b);
  }
  const lab = half + 0.38;
  for (let i = 0; i < n; i++) {
    for (const z of [lab, -lab]) { const s = labelSprite(FILES[i]); s.position.set(i - (n - 1) / 2, 0.06, z); root.add(s); }
    for (const x of [-lab, lab]) { const s = labelSprite(String(i + 1)); s.position.set(x, 0.06, -(i + 1 - (n + 1) / 2)); root.add(s); }
  }
  // stone table and floor
  const stone = new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.9, metalness: 0 });
  const table = new THREE.Mesh(new THREE.CylinderGeometry(7.6 * k, 7.9 * k, 0.5, 64), new THREE.MeshStandardMaterial({ map: woodTexture('#4a2f1b', '#24130a', 5), roughness: 0.6 }));
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
  for (const [x, z] of [[-8.5, -5], [8.5, 5], [8.5, -6]].map(([x, z]) => [x * k, z * k])) {
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

  return {
    root,
    squares,
    views: k === 1 ? CHESS_VIEWS : Object.fromEntries(Object.entries(CHESS_VIEWS).map(([name, v]) => [name, { pos: v.pos.map((x) => x * k), target: v.target.map((x) => x * k), narrow: v.narrow.map((x) => x * k) }])),
    posOfKey: posOf,
    buildPiece: draughts ? buildDraughtsPiece : buildChessPiece,
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
