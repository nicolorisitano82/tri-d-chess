// Xiangqi move generator: perft from the start position against the published counts,
// plus a few rule checks (flying general, cannon screen, hobbled horse, elephant eye, stalemate loss).
import assert from 'node:assert/strict';
import { XiangqiGame, toBoard, legalXq, initialXq } from '../src/xiangqi.js';

function perft(b, color, d) {
  const l = legalXq(b, color);
  if (d === 1) return l.length / 2;
  let n = 0;
  const o = color === 'white' ? 'black' : 'white';
  for (let k = 0; k < l.length; k += 2) {
    const f = l[k], t = l[k + 1], cap = b[t];
    b[t] = b[f]; b[f] = null;
    n += perft(b, o, d - 1);
    b[f] = b[t]; b[t] = cap;
  }
  return n;
}
const start = toBoard(initialXq());
for (const [d, want] of [[1, 44], [2, 1920], [3, 79666], [4, 3290240]]) assert.equal(perft(start, 'white', d), want, `perft ${d}`);

const game = (pieces, turn = 'white') => { const g = new XiangqiGame({ white: 'human', black: 'human' }); g.pieces = pieces; g.turn = turn; return g; };
const P = (type, color) => ({ type, color });

// flying general: the red general cannot step onto the open file of the black one
let g = game({ d1: P('K', 'white'), e10: P('K', 'black'), a5: P('P', 'white') });
assert.ok(!g.legal('d1').some((m) => m.to === 'e1'), 'flying general');
// cannon needs exactly one screen to capture
g = game({ e1: P('K', 'white'), d10: P('K', 'black'), b3: P('C', 'white'), b5: P('P', 'white'), b8: P('H', 'black') });
assert.ok(g.legal('b3').some((m) => m.to === 'b8' && m.capture === 'H'), 'cannon capture over screen');
assert.ok(!g.legal('b3').some((m) => m.to === 'b6' && m.capture), 'cannon does not capture without screen');
// hobbled horse
g = game({ e1: P('K', 'white'), d10: P('K', 'black'), b1: P('H', 'white'), b2: P('P', 'white') });
assert.ok(!g.legal('b1').some((m) => m.to === 'a3' || m.to === 'c3'), 'hobbled horse');
// elephant eye and the river
g = game({ e1: P('K', 'white'), d10: P('K', 'black'), c5: P('E', 'white'), d4: P('P', 'white') });
assert.deepEqual(g.legal('c5').map((m) => m.to).sort(), ['a3'], 'elephant eye + river');
// stalemate is a loss for the side that cannot move
g = game({ d1: P('K', 'white'), f10: P('K', 'black'), e3: P('R', 'black'), c3: P('R', 'black'), a10: P('A', 'black') }, 'black');
g.status = 'playing';
const gg = game({ d1: P('K', 'white'), f10: P('K', 'black'), c9: P('R', 'black'), e8: P('R', 'black') }, 'black');
gg.move('e8', 'e2');
assert.equal(gg.status, 'stalemate'); assert.equal(gg.winner, 'black', 'stalemated side loses');
// full game: play a short legal sequence through the class API
g = new XiangqiGame({ white: 'human', black: 'human' });
g.move('h3', 'e3'); g.move('h10', 'g8'); g.move('h1', 'g3');
assert.equal(g.history.length, 3);
assert.equal(g.snapshot().legalMoves.length > 0, true);
console.log('xiangqi tests: OK');
