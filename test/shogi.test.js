// Shogi: perft from the start (known counts) and the special rules (drops, nifu, uchifuzume, promotion).
import assert from 'node:assert/strict';
import { ShogiGame, toBoard, initialShogi, emptyHands, perft } from '../src/shogi.js';

const b = toBoard(initialShogi()), h = emptyHands();
assert.deepEqual([1, 2, 3, 4].map((d) => perft(b, h, 'white', d)), [30, 900, 25470, 719731]);

const g = (pieces, hands = {}, turn = 'white') => {
  const x = new ShogiGame({ white: 'human', black: 'human' });
  x.pieces = pieces; x.hands = { ...emptyHands(), ...hands }; x.turn = turn;
  return x;
};
// nifu: no second pawn on a file
{
  const x = g({ e1: { type: 'K', color: 'white' }, e9: { type: 'K', color: 'black' }, c4: { type: 'P', color: 'white' } }, { white: { R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 1 } });
  const drops = x.legal().filter((m) => m.from === 'w*P').map((m) => m.to);
  assert.ok(!drops.some((s) => s[0] === 'c'), 'nifu');
  assert.ok(!drops.some((s) => s.endsWith('9')), 'no pawn drop on the last rank');
  assert.ok(drops.includes('d5'));
}
// uchifuzume: a pawn drop that mates is illegal, the same drop that only checks is fine
{
  const pieces = { a9: { type: 'K', color: 'black' }, a7: { type: 'P', color: 'black' }, b9: { type: 'N', color: 'black' }, c7: { type: 'G', color: 'white' }, e1: { type: 'K', color: 'white' } };
  const hand = { white: { R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 1 } };
  assert.throws(() => g({ ...pieces, b7: { type: 'G', color: 'white' }, a6: { type: 'L', color: 'white' } }, hand).move('w*P', 'a8'));
}
// promotion: optional in the zone, forced on the last rank; captures go to the hand
{
  const x = g({ e1: { type: 'K', color: 'white' }, a9: { type: 'K', color: 'black' }, c6: { type: 'S', color: 'white' }, d8: { type: 'P', color: 'white' }, e7: { type: 'G', color: 'black' } });
  assert.equal(x.legal().filter((m) => m.from === 'c6' && m.to === 'c7').length, 2, 'optional promotion');
  assert.equal(x.legal().filter((m) => m.from === 'd8' && m.to === 'd9').length, 1, 'forced promotion');
  x.move('d8', 'd9');
  assert.equal(x.pieces.d9.type, 'P+');
  x.move('e7', 'e6');
  x.move('c6', 'd7', '+');
  assert.equal(x.pieces.d7.type, 'S+');
}
{
  const x = g({ e1: { type: 'K', color: 'white' }, a9: { type: 'K', color: 'black' }, e5: { type: 'R', color: 'white' }, e8: { type: 'B+', color: 'black' } });
  x.move('e5', 'e8');
  assert.equal(x.hands.white.B, 1, 'a promoted piece goes to the hand unpromoted');
  x.move('a9', 'b9');
  x.move('w*B', 'c6');
  assert.equal(x.pieces.c6.type, 'B');
}
console.log('shogi tests: OK');
