// Copy the browser-side libraries into public/vendor, so they are served from public/
// both in dev and inside the packaged app (electron-builder drops node_modules/*/examples
// by default, and the browser cannot resolve bare npm specifiers on its own).
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (p) => join(root, 'node_modules', p);
const out = (p) => join(root, 'public/vendor', p);

// Three.js: renderer + orbit controls
for (const f of ['build/three.module.js', 'examples/jsm/controls/OrbitControls.js']) {
  mkdirSync(dirname(out(`three/${f}`)), { recursive: true });
  cpSync(nm(`three/${f}`), out(`three/${f}`));
}

// Trystero (serverless WebRTC matchmaking over public Nostr relays) and its ESM deps.
// Mapped in index.html's import map: @trystero-p2p/core, @trystero-p2p/nostr, @noble/secp256k1.
const copyDir = (from, to) => {
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true, filter: (src) => !src.endsWith('.map') && !src.endsWith('.d.mts') && !src.endsWith('.d.mts.map') });
};
copyDir(nm('@trystero-p2p/core/dist'), out('trystero-core'));
copyDir(nm('@trystero-p2p/nostr/dist'), out('trystero-nostr'));
mkdirSync(out('noble-secp256k1'), { recursive: true });
cpSync(nm('@noble/secp256k1/index.js'), out('noble-secp256k1/index.js'));

// chess.js (classic chess rules, BSD-2): one ESM file, mapped as "chess.js"
mkdirSync(out('chess.js'), { recursive: true });
cpSync(nm('chess.js/dist/esm/chess.js'), out('chess.js/chess.js'));

console.log('vendored three.js + trystero + chess.js →', 'public/vendor');
