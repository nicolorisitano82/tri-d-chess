// The fast geometric isAttacked must agree with the reference that generates every move, for
// every occupied square (the only use is check detection: is the king's square reachable?),
// on positions from many random games.
import assert from 'node:assert/strict';
import { Game, isAttacked, isAttackedSlow, allSquares } from '../src/engine.js';

let seed = 12345;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
let checked = 0, positions = 0;
for (let g = 0; g < 60; g++) {
  const G = new Game({ white: 'human', black: 'human' });
  for (let i = 0; i < 120 && G.status === 'playing'; i++) {
    const pos = G.pos;
    for (const s of allSquares(pos.boards)) {
      const occ = pos.pieces[s.key];
      if (!occ) continue;
      for (const c of ['white', 'black']) {
        if (occ.color === c) continue;
        const a = isAttacked(pos, s.key, c), b = isAttackedSlow(pos, s.key, c);
        if (a !== b) assert.fail(`game ${g} ply ${i}: ${s.key} by ${c}: fast ${a}, reference ${b}`);
        checked++;
      }
    }
    positions++;
    const L = G.legal();
    const m = L[Math.floor(rnd() * L.length)];
    G.move(m.from, m.to, m.promotion);
  }
}
console.log(`attack tests: ${checked} squares in ${positions} positions agree`);
