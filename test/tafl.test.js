// Hnefatafl (Fetlar): captures, the king, restricted squares, the end of the game.
import assert from 'node:assert/strict';
import { TaflGame } from '../src/tafl.js';

const P = (color) => ({ type: 'P', color }), K = { type: 'K', color: 'black' };
const g = (pieces, turn = 'white') => { const x = new TaflGame({ white: 'human', black: 'human' }); x.pieces = pieces; x.turn = turn; return x; };

assert.equal(new TaflGame().legal().length, 116);
// custodial capture, and moving between two enemies is safe
{
  const x = g({ c5: P('white'), d5: P('black'), e7: P('white'), f6: K, b2: P('black') });
  x.move('e7', 'e5');
  assert.ok(!x.pieces.d5, 'sandwiched');
  const y = g({ c5: P('black'), e5: P('black'), d7: P('white'), f6: K }, 'white');
  y.move('d7', 'd5');
  assert.ok(y.pieces.d5, 'safe between two');
}
// corners are hostile, only the king may stop on throne and corners
{
  const y = g({ b1: P('white'), d1: P('black'), f8: K, k9: P('white') }, 'black');
  y.move('d1', 'c1');
  assert.ok(!y.pieces.b1, 'captured against the corner');
  assert.throws(() => g({ a5: P('white'), f9: K }).move('a5', 'a1'), /only the king/);
}
// the king: escape, four-side capture, three plus the throne, safe on the edge
{
  const x = g({ a5: K, c3: P('white'), k5: P('white') }, 'black');
  x.move('a5', 'a1');
  assert.equal(x.status, 'checkmate'); assert.equal(x.winner, 'black'); assert.equal(x.endReason, 'escape');
  const y = g({ d4: K, c4: P('white'), e4: P('white'), d3: P('white'), d7: P('white'), k11: P('black') });
  y.move('d7', 'd5');
  assert.equal(y.endReason, 'capture');
  const z = g({ e6: K, e7: P('white'), e5: P('white'), c6: P('white'), k10: P('black') });
  z.move('c6', 'd6');
  assert.equal(z.endReason, 'capture', 'three attackers and the throne');
  const w = g({ a6: K, a7: P('white'), a5: P('white'), c6: P('white'), k10: P('black') });
  w.move('c6', 'b6');
  assert.equal(w.status, 'playing', 'no capture on the edge');
}
// encirclement: closing the last gap around every defender wins
{
  const ring = {};
  for (const sq of ['e5', 'f4', 'g5', 'f7', 'e6']) ring[sq] = P('white');
  const x = g({ ...ring, f5: K, f6: P('black'), h9: P('white'), i6: P('white') });
  x.move('h9', 'h8');
  assert.equal(x.status, 'playing', 'g6 is still open');
  x.turn = 'white';
  x.move('i6', 'g6');
  assert.equal(x.endReason, 'encircle');
}
console.log('tafl tests: OK');
