// Faction-styled piece sets.
//   white → "Federation": smooth pearl hulls, silver trim, blue running lights.
//   black → "Klingon": faceted dark metal, bronze blades, red glow.
// Original designs inspired by the factions — no official insignia.
import * as THREE from 'three';

const FED = {
  hull: new THREE.MeshStandardMaterial({ color: 0xeef2f7, metalness: 0.35, roughness: 0.25, emissive: 0x141c26 }),
  trim: new THREE.MeshStandardMaterial({ color: 0xb4bfce, metalness: 0.55, roughness: 0.25, emissive: 0x0d1420 }),
  glow: new THREE.MeshStandardMaterial({ color: 0x66ccff, emissive: 0x3ab0ff, emissiveIntensity: 2.2 }),
};
const KLI = {
  metal: new THREE.MeshStandardMaterial({ color: 0x6a6470, metalness: 0.45, roughness: 0.4, emissive: 0x2a0a0c, flatShading: true }),
  bronze: new THREE.MeshStandardMaterial({ color: 0xc8873f, metalness: 0.5, roughness: 0.3, emissive: 0x2a1404, flatShading: true }),
  glow: new THREE.MeshStandardMaterial({ color: 0xff1020, emissive: 0xe0001a, emissiveIntensity: 1.5 }),
};

function add(g, geo, mat, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0], s = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (s) m.scale.set(...s);
  g.add(m);
  return m;
}
const lathe = (pts, seg = 40) => new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg);
const torus = (r, t, rs = 12, ts = 48) => new THREE.TorusGeometry(r, t, rs, ts);
const flat = [Math.PI / 2, 0, 0];

// ---------------------------------------------------------------- Federation ---
function fedBase(g) {
  add(g, lathe([[0, 0], [0.3, 0], [0.3, 0.05], [0.26, 0.085], [0, 0.085]]), FED.trim);
  add(g, torus(0.235, 0.014), FED.glow, [0, 0.09, 0], flat);
}

const FEDERATION = {
  P(g) { // probe
    fedBase(g);
    add(g, lathe([[0, 0.08], [0.16, 0.08], [0.09, 0.28], [0, 0.3]]), FED.hull);
    add(g, new THREE.SphereGeometry(0.12, 32, 20), FED.hull, [0, 0.38, 0]);
    add(g, torus(0.121, 0.013), FED.glow, [0, 0.37, 0], flat);
  },
  R(g) { // station tower
    fedBase(g);
    add(g, new THREE.CylinderGeometry(0.17, 0.2, 0.42, 40), FED.hull, [0, 0.3, 0]);
    add(g, torus(0.19, 0.014), FED.glow, [0, 0.2, 0], flat);
    add(g, torus(0.175, 0.014), FED.glow, [0, 0.4, 0], flat);
    add(g, lathe([[0, 0.5], [0.27, 0.5], [0.27, 0.54], [0.2, 0.6], [0.06, 0.62], [0, 0.66]]), FED.trim);
    add(g, new THREE.SphereGeometry(0.035, 16, 12), FED.glow, [0, 0.68, 0]);
  },
  B(g) { // spire
    fedBase(g);
    add(g, lathe([[0, 0.08], [0.14, 0.08], [0.08, 0.4], [0.05, 0.7], [0, 0.8]]), FED.hull);
    add(g, torus(0.1, 0.012), FED.glow, [0, 0.3, 0], flat);
    add(g, torus(0.075, 0.03), FED.trim, [0, 0.5, 0], flat);
    add(g, new THREE.SphereGeometry(0.045, 20, 14), FED.glow, [0, 0.83, 0]);
  },
  N(g) { // shuttle on a pylon
    fedBase(g);
    add(g, new THREE.CylinderGeometry(0.05, 0.1, 0.36, 24), FED.trim, [0, 0.27, 0]);
    add(g, new THREE.CapsuleGeometry(0.11, 0.26, 8, 20), FED.hull, [0, 0.55, 0], [Math.PI / 2, 0, 0]);
    add(g, new THREE.BoxGeometry(0.12, 0.05, 0.06), FED.glow, [0, 0.6, -0.2]);
    for (const s of [-1, 1]) {
      add(g, new THREE.CapsuleGeometry(0.035, 0.22, 6, 12), FED.trim, [s * 0.16, 0.6, 0.06], [Math.PI / 2, 0, 0]);
      add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8), FED.glow, [s * 0.16, 0.635, 0.06], [Math.PI / 2, 0, 0]);
      add(g, new THREE.BoxGeometry(0.12, 0.02, 0.06), FED.hull, [s * 0.09, 0.58, 0.06]);
    }
  },
  Q(g) { // starship: saucer + nacelles
    fedBase(g);
    add(g, new THREE.CylinderGeometry(0.045, 0.1, 0.4, 24), FED.trim, [0, 0.28, 0]);
    add(g, new THREE.CapsuleGeometry(0.075, 0.2, 8, 16), FED.hull, [0, 0.5, 0.08], [Math.PI / 2 - 0.25, 0, 0]);
    add(g, lathe([[0, 0], [0.33, 0], [0.31, 0.045], [0.14, 0.085], [0.06, 0.1], [0, 0.105]], 48), FED.hull, [0, 0.62, -0.05]);
    add(g, torus(0.325, 0.011, 8, 64), FED.glow, [0, 0.625, -0.05], flat);
    add(g, new THREE.SphereGeometry(0.05, 16, 10), FED.glow, [0, 0.725, -0.05], [0, 0, 0], [1, 0.5, 1]);
    for (const s of [-1, 1]) {
      add(g, new THREE.BoxGeometry(0.02, 0.16, 0.05), FED.hull, [s * 0.11, 0.66, 0.2], [0, 0, s * -0.5]);
      add(g, new THREE.CapsuleGeometry(0.04, 0.34, 6, 14), FED.trim, [s * 0.17, 0.74, 0.24], [Math.PI / 2, 0, 0]);
      add(g, new THREE.CylinderGeometry(0.014, 0.014, 0.32, 8), FED.glow, [s * 0.17, 0.778, 0.24], [Math.PI / 2, 0, 0]);
      add(g, new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff7755, emissive: 0xff3311, emissiveIntensity: 2 }), [s * 0.17, 0.74, 0.04]);
    }
  },
  K(g) { // command spire
    fedBase(g);
    add(g, lathe([[0, 0.08], [0.19, 0.08], [0.1, 0.38], [0.15, 0.58], [0.08, 0.76], [0, 0.8]]), FED.hull);
    add(g, torus(0.15, 0.02), FED.trim, [0, 0.58, 0], [Math.PI / 2 + 0.25, 0, 0]);
    add(g, torus(0.11, 0.012), FED.glow, [0, 0.3, 0], flat);
    add(g, new THREE.SphereGeometry(0.085, 24, 16), FED.glow, [0, 0.9, 0]);
    add(g, torus(0.14, 0.01, 8, 48), FED.trim, [0, 0.9, 0], flat);
    add(g, torus(0.14, 0.01, 8, 48), FED.trim, [0, 0.9, 0], [0, 0, Math.PI / 2]);
  },
};

// ------------------------------------------------------------------- Klingon ---
function kliBase(g) {
  add(g, new THREE.CylinderGeometry(0.27, 0.31, 0.085, 6), KLI.bronze, [0, 0.042, 0]);
  add(g, new THREE.TorusGeometry(0.24, 0.014, 4, 6), KLI.glow, [0, 0.09, 0], [Math.PI / 2, 0, Math.PI / 6]);
}
function spikes(g, n, r, y, h, tilt, mat = KLI.bronze, w = 0.035) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const sp = add(g, new THREE.ConeGeometry(w, h, 4), mat, [Math.cos(a) * r, y, Math.sin(a) * r]);
    sp.rotation.set(0, -a, 0);
    sp.rotateZ(-tilt);
  }
}

const KLINGON = {
  P(g) { // warrior
    kliBase(g);
    add(g, new THREE.CylinderGeometry(0.05, 0.16, 0.34, 5), KLI.metal, [0, 0.25, 0]);
    add(g, new THREE.OctahedronGeometry(0.1), KLI.metal, [0, 0.46, 0], [0, 0, 0], [1, 1.3, 1]);
    add(g, new THREE.BoxGeometry(0.14, 0.025, 0.02), KLI.glow, [0, 0.47, -0.075]);
  },
  R(g) { // fortress
    kliBase(g);
    add(g, new THREE.CylinderGeometry(0.19, 0.24, 0.44, 6), KLI.metal, [0, 0.3, 0]);
    add(g, new THREE.TorusGeometry(0.205, 0.014, 4, 6), KLI.glow, [0, 0.38, 0], [Math.PI / 2, 0, Math.PI / 6]);
    add(g, new THREE.CylinderGeometry(0.23, 0.19, 0.07, 6), KLI.bronze, [0, 0.55, 0]);
    spikes(g, 6, 0.19, 0.66, 0.18, 0.35);
  },
  B(g) { // blade
    kliBase(g);
    add(g, new THREE.CylinderGeometry(0, 0.13, 0.72, 4), KLI.metal, [0, 0.45, 0], [0, Math.PI / 4, 0]);
    add(g, new THREE.CylinderGeometry(0.17, 0.12, 0.05, 6), KLI.bronze, [0, 0.27, 0]);
    add(g, new THREE.BoxGeometry(0.02, 0.32, 0.05), KLI.glow, [0, 0.47, -0.07], [0.08, 0, 0]);
    spikes(g, 2, 0.13, 0.3, 0.18, 1.1);
  },
  N(g) { // beast head
    kliBase(g);
    add(g, new THREE.CylinderGeometry(0.09, 0.15, 0.3, 5), KLI.metal, [0, 0.23, 0]);
    add(g, new THREE.BoxGeometry(0.17, 0.2, 0.36), KLI.metal, [0, 0.5, -0.06], [0.45, 0, 0]);
    add(g, new THREE.ConeGeometry(0.08, 0.2, 4), KLI.metal, [0, 0.43, -0.28], [-Math.PI / 2 - 0.4, 0, 0]);
    add(g, new THREE.BoxGeometry(0.02, 0.22, 0.3), KLI.bronze, [0, 0.66, 0.02], [0.5, 0, 0]);
    for (const s of [-1, 1]) {
      add(g, new THREE.BoxGeometry(0.035, 0.02, 0.03), KLI.glow, [s * 0.06, 0.55, -0.22]);
      add(g, new THREE.ConeGeometry(0.03, 0.18, 4), KLI.bronze, [s * 0.1, 0.66, 0.06], [0.4, 0, s * -0.5]);
    }
  },
  Q(g) { // bird of prey
    kliBase(g);
    add(g, new THREE.CylinderGeometry(0.05, 0.12, 0.42, 5), KLI.metal, [0, 0.3, 0]);
    add(g, new THREE.CylinderGeometry(0.035, 0.07, 0.36, 5), KLI.metal, [0, 0.62, -0.12], [Math.PI / 2 - 0.2, 0, 0]);
    add(g, new THREE.OctahedronGeometry(0.075), KLI.metal, [0, 0.66, -0.32], [0, 0, 0], [1, 0.7, 1.5]);
    add(g, new THREE.BoxGeometry(0.06, 0.02, 0.03), KLI.glow, [0, 0.67, -0.42]);
    add(g, new THREE.CylinderGeometry(0.12, 0.09, 0.12, 6), KLI.metal, [0, 0.6, 0.08]);
    for (const s of [-1, 1]) {
      const wing = add(g, new THREE.BoxGeometry(0.4, 0.025, 0.2), KLI.metal, [s * 0.24, 0.55, 0.1], [0, s * 0.15, s * 0.45]);
      wing.scale.set(1, 1, 1);
      add(g, new THREE.BoxGeometry(0.4, 0.03, 0.03), KLI.bronze, [s * 0.24, 0.555, 0.0], [0, s * 0.15, s * 0.45]);
      add(g, new THREE.ConeGeometry(0.025, 0.14, 4), KLI.glow, [s * 0.42, 0.46, 0.0], [-Math.PI / 2, 0, 0]);
    }
  },
  K(g) { // warlord
    kliBase(g);
    add(g, new THREE.CylinderGeometry(0.1, 0.19, 0.62, 6), KLI.metal, [0, 0.39, 0]);
    add(g, new THREE.CylinderGeometry(0.15, 0.11, 0.08, 6), KLI.bronze, [0, 0.72, 0]);
    add(g, new THREE.TorusGeometry(0.15, 0.013, 4, 6), KLI.glow, [0, 0.4, 0], [Math.PI / 2, 0, Math.PI / 6]);
    spikes(g, 5, 0.12, 0.88, 0.28, 0.3, KLI.bronze, 0.04);
    add(g, new THREE.OctahedronGeometry(0.07), KLI.glow, [0, 0.88, 0], [0, 0, 0], [1, 1.5, 1]);
  },
};

export function buildPiece(type, color) {
  const g = new THREE.Group();
  (color === 'white' ? FEDERATION : KLINGON)[type](g);
  if (color === 'black') g.rotation.y = Math.PI; // face the opponent
  g.scale.setScalar(0.85);
  return g;
}
