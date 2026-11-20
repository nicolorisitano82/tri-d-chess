// Faction-styled piece sets, chosen per side (default: White Federation, Black Klingon).
//   "Federation": smooth pearl hulls, silver trim, blue running lights.
//   "Klingon": faceted dark metal, bronze blades, red glow.
//   "Borg": cubic dark machinery, greebles, green glow.
//   "Romulan": green avian hulls, double wings, teal glow.
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

// --------------------------------------------------------------------- Borg ---
const BORG = {
  metal: new THREE.MeshStandardMaterial({ color: 0x8a9094, metalness: 0.55, roughness: 0.4, emissive: 0x0c120e, flatShading: true }),
  dark: new THREE.MeshStandardMaterial({ color: 0x4a4f52, metalness: 0.5, roughness: 0.55, flatShading: true }),
  glow: new THREE.MeshStandardMaterial({ color: 0x55ff77, emissive: 0x22ff55, emissiveIntensity: 1.8 }),
};
// deterministic greebles: small boxes scattered on the faces of a w×h×w block centred at y
function greebles(g, w, h, y, n, seed) {
  let x = seed * 9301 + 49297;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < n; i++) {
    const face = Math.floor(rnd() * 4), a = (face * Math.PI) / 2;
    const u = (rnd() - 0.5) * w * 0.8, v = (rnd() - 0.5) * h * 0.85;
    const sz = 0.02 + rnd() * 0.035, glow = rnd() < 0.25;
    const m = add(g, new THREE.BoxGeometry(sz, sz * (glow ? 0.5 : 1 + rnd()), 0.02), glow ? BORG.glow : BORG.dark,
      [Math.cos(a) * u + Math.sin(a) * (w / 2 + 0.008), y + v, -Math.sin(a) * u + Math.cos(a) * (w / 2 + 0.008)]);
    m.rotation.y = a;
  }
}
function borgBase(g) {
  add(g, new THREE.BoxGeometry(0.52, 0.07, 0.52), BORG.dark, [0, 0.035, 0]);
  add(g, new THREE.BoxGeometry(0.44, 0.03, 0.44), BORG.metal, [0, 0.085, 0]);
  for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) add(g, new THREE.BoxGeometry(x ? 0.012 : 0.4, 0.012, z ? 0.012 : 0.4), BORG.glow, [x * 0.225, 0.075, z * 0.225]);
}
const BORG_SET = {
  P(g) { // drone
    borgBase(g);
    add(g, new THREE.BoxGeometry(0.2, 0.26, 0.2), BORG.metal, [0, 0.23, 0]);
    greebles(g, 0.2, 0.26, 0.23, 8, 1);
    add(g, new THREE.BoxGeometry(0.15, 0.13, 0.15), BORG.metal, [0, 0.43, 0]);
    add(g, new THREE.BoxGeometry(0.05, 0.025, 0.02), BORG.glow, [0.03, 0.45, -0.08]);
  },
  R(g) { // tower of stacked cubes
    borgBase(g);
    for (const [s, y] of [[0.3, 0.2], [0.26, 0.4], [0.3, 0.58]]) { add(g, new THREE.BoxGeometry(s, 0.17, s), BORG.metal, [0, y, 0]); greebles(g, s, 0.17, y, 6, y * 10); }
    add(g, new THREE.BoxGeometry(0.2, 0.012, 0.31), BORG.glow, [0, 0.49, 0]);
    add(g, new THREE.BoxGeometry(0.31, 0.012, 0.2), BORG.glow, [0, 0.49, 0]);
  },
  B(g) { // tactical diamond
    borgBase(g);
    add(g, new THREE.BoxGeometry(0.08, 0.3, 0.08), BORG.dark, [0, 0.24, 0]);
    add(g, new THREE.OctahedronGeometry(0.2), BORG.metal, [0, 0.58, 0], [0, Math.PI / 4, 0], [0.8, 1.3, 0.8]);
    add(g, new THREE.OctahedronGeometry(0.06), BORG.glow, [0, 0.58, 0], [0, Math.PI / 4, 0], [1, 1.3, 1]);
    for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.02, 0.3, 0.02), BORG.glow, [s * 0.11, 0.58, 0], [0, 0, s * 0.35]);
  },
  N(g) { // probe on an arm
    borgBase(g);
    add(g, new THREE.BoxGeometry(0.1, 0.34, 0.1), BORG.metal, [0, 0.26, 0.05]);
    add(g, new THREE.BoxGeometry(0.08, 0.08, 0.3), BORG.dark, [0, 0.45, -0.06], [0.3, 0, 0]);
    add(g, new THREE.BoxGeometry(0.2, 0.16, 0.2), BORG.metal, [0, 0.52, -0.2], [0.3, 0, 0]);
    greebles(g, 0.2, 0.14, 0.52, 5, 7);
    add(g, new THREE.SphereGeometry(0.03, 10, 8), BORG.glow, [0, 0.5, -0.31]);
    add(g, new THREE.CylinderGeometry(0.008, 0.008, 0.25, 6), BORG.glow, [0.06, 0.62, -0.05], [0.9, 0, 0]);
  },
  Q(g) { // sphere ship
    borgBase(g);
    add(g, new THREE.CylinderGeometry(0.05, 0.08, 0.36, 4), BORG.dark, [0, 0.26, 0], [0, Math.PI / 4, 0]);
    add(g, new THREE.IcosahedronGeometry(0.21, 1), BORG.metal, [0, 0.6, 0]);
    add(g, new THREE.TorusGeometry(0.215, 0.008, 4, 32), BORG.glow, [0, 0.6, 0], [Math.PI / 2, 0, 0]);
    add(g, new THREE.TorusGeometry(0.215, 0.008, 4, 32), BORG.glow, [0, 0.6, 0]);
    add(g, new THREE.TorusGeometry(0.215, 0.008, 4, 32), BORG.glow, [0, 0.6, 0], [0, Math.PI / 2, 0]);
  },
  K(g) { // the cube
    borgBase(g);
    add(g, new THREE.BoxGeometry(0.12, 0.2, 0.12), BORG.dark, [0, 0.19, 0]);
    add(g, new THREE.BoxGeometry(0.36, 0.36, 0.36), BORG.metal, [0, 0.47, 0]);
    greebles(g, 0.36, 0.36, 0.47, 22, 3);
    for (const y of [0.36, 0.47, 0.58]) add(g, new THREE.BoxGeometry(0.368, 0.012, 0.368), BORG.glow, [0, y, 0]);
    add(g, new THREE.BoxGeometry(0.14, 0.14, 0.14), BORG.metal, [0, 0.72, 0], [Math.PI / 4, Math.PI / 4, 0]);
    add(g, new THREE.OctahedronGeometry(0.04), BORG.glow, [0, 0.84, 0]);
  },
};

// ------------------------------------------------------------------ Romulan ---
const ROM = {
  hull: new THREE.MeshStandardMaterial({ color: 0x4f8a6a, metalness: 0.5, roughness: 0.3, emissive: 0x06140c }),
  dark: new THREE.MeshStandardMaterial({ color: 0x24443a, metalness: 0.55, roughness: 0.35 }),
  glow: new THREE.MeshStandardMaterial({ color: 0x66ffd8, emissive: 0x20f0c0, emissiveIntensity: 1.8 }),
};
function romBase(g) {
  add(g, lathe([[0, 0], [0.31, 0], [0.29, 0.04], [0.22, 0.08], [0, 0.08]], 8), ROM.dark, [0, 0, 0], [0, Math.PI / 8, 0]);
  add(g, new THREE.TorusGeometry(0.235, 0.012, 4, 8), ROM.glow, [0, 0.085, 0], [Math.PI / 2, 0, Math.PI / 8]);
}
// a swept wing: thin box, bent at the tip
function wing(g, s, y, z, len, tilt, mat = ROM.hull) {
  add(g, new THREE.BoxGeometry(len, 0.022, 0.16), mat, [s * len / 2, y, z], [0, s * 0.25, s * tilt]);
  add(g, new THREE.BoxGeometry(len * 0.9, 0.012, 0.02), ROM.glow, [s * len / 2, y + 0.005, z - 0.075], [0, s * 0.25, s * tilt]);
}
const ROMULAN = {
  P(g) { // sentinel
    romBase(g);
    add(g, lathe([[0, 0.08], [0.15, 0.08], [0.08, 0.32], [0, 0.34]], 8), ROM.hull);
    add(g, new THREE.ConeGeometry(0.08, 0.2, 6), ROM.hull, [0, 0.42, -0.03], [-0.3, 0, 0]);
    add(g, new THREE.BoxGeometry(0.1, 0.02, 0.02), ROM.glow, [0, 0.4, -0.09]);
  },
  R(g) { // twin pylon gate
    romBase(g);
    for (const s of [-1, 1]) add(g, new THREE.CylinderGeometry(0.06, 0.09, 0.5, 6), ROM.hull, [s * 0.12, 0.33, 0]);
    add(g, new THREE.BoxGeometry(0.38, 0.06, 0.16), ROM.dark, [0, 0.6, 0]);
    add(g, new THREE.TorusGeometry(0.1, 0.014, 6, 24, Math.PI), ROM.glow, [0, 0.42, 0]);
    for (const s of [-1, 1]) add(g, new THREE.ConeGeometry(0.035, 0.14, 4), ROM.hull, [s * 0.17, 0.68, 0], [0, 0, s * -0.4]);
  },
  B(g) { // feather blade
    romBase(g);
    add(g, new THREE.CylinderGeometry(0.06, 0.1, 0.2, 6), ROM.dark, [0, 0.18, 0]);
    add(g, new THREE.SphereGeometry(0.15, 20, 14), ROM.hull, [0, 0.52, 0], [0, 0, 0], [0.45, 1.7, 0.75]);
    add(g, new THREE.BoxGeometry(0.012, 0.42, 0.02), ROM.glow, [0, 0.52, -0.11]);
    add(g, new THREE.ConeGeometry(0.03, 0.12, 6), ROM.glow, [0, 0.8, 0]);
  },
  N(g) { // raptor head
    romBase(g);
    add(g, new THREE.CylinderGeometry(0.08, 0.14, 0.3, 6), ROM.hull, [0, 0.23, 0]);
    add(g, new THREE.SphereGeometry(0.13, 16, 12), ROM.hull, [0, 0.5, 0.02], [0, 0, 0], [0.8, 0.9, 1.1]);
    add(g, new THREE.ConeGeometry(0.06, 0.22, 6), ROM.dark, [0, 0.46, -0.2], [-Math.PI / 2 - 0.5, 0, 0]);
    add(g, new THREE.ConeGeometry(0.05, 0.26, 4), ROM.hull, [0, 0.64, 0.14], [0.9, 0, 0]);
    for (const s of [-1, 1]) add(g, new THREE.SphereGeometry(0.02, 8, 6), ROM.glow, [s * 0.065, 0.54, -0.08]);
  },
  Q(g) { // warbird: double wings around a glowing core
    romBase(g);
    add(g, new THREE.CylinderGeometry(0.04, 0.09, 0.36, 6), ROM.dark, [0, 0.26, 0]);
    add(g, new THREE.SphereGeometry(0.07, 16, 12), ROM.glow, [0, 0.58, 0.04]);
    add(g, new THREE.ConeGeometry(0.06, 0.3, 6), ROM.hull, [0, 0.58, -0.17], [-Math.PI / 2, 0, 0]);
    for (const s of [-1, 1]) { wing(g, s, 0.68, 0.06, 0.34, -0.35); wing(g, s, 0.48, 0.06, 0.34, 0.35); }
    for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.03, 0.25, 0.1), ROM.hull, [s * 0.32, 0.58, 0.06]);
  },
  K(g) { // praetor spire with wing crest
    romBase(g);
    add(g, lathe([[0, 0.08], [0.18, 0.08], [0.1, 0.4], [0.13, 0.6], [0.06, 0.72], [0, 0.74]], 8), ROM.hull);
    add(g, new THREE.TorusGeometry(0.115, 0.012, 4, 8), ROM.glow, [0, 0.42, 0], [Math.PI / 2, 0, Math.PI / 8]);
    for (const s of [-1, 1]) wing(g, s, 0.66, 0.02, 0.22, -0.7, ROM.dark);
    add(g, new THREE.OctahedronGeometry(0.06), ROM.glow, [0, 0.82, 0], [0, 0, 0], [1, 1.6, 1]);
  },
};

export const PIECE_SETS = { federation: FEDERATION, klingon: KLINGON, borg: BORG_SET, romulan: ROMULAN };
export const SET_IDS = Object.keys(PIECE_SETS);
const sets = { white: 'federation', black: 'klingon' };
export const getPieceSets = () => ({ ...sets });
export function setPieceSets(next = {}) {
  for (const c of ['white', 'black']) if (PIECE_SETS[next[c]]) sets[c] = next[c];
}

// Both sides on the same set: Black gets a darkened hull and complementary glow, so the
// two armies stay distinguishable.
const altCache = new Map();
function altMaterial(m) {
  if (!altCache.has(m)) {
    const c = m.clone();
    if ((c.emissiveIntensity ?? 1) > 1.2) { c.color.offsetHSL(0.5, 0, 0); c.emissive.offsetHSL(0.5, 0, 0); }
    else { c.color.multiplyScalar(0.38); c.emissive.multiplyScalar(0.3); }
    altCache.set(m, c);
  }
  return altCache.get(m);
}

export function buildPiece(type, color) {
  const g = new THREE.Group();
  PIECE_SETS[sets[color]][type](g);
  if (color === 'black' && sets.white === sets.black) g.traverse((o) => { if (o.material) o.material = altMaterial(o.material); });
  if (color === 'black') g.rotation.y = Math.PI; // face the opponent
  g.scale.setScalar(0.85);
  return g;
}
