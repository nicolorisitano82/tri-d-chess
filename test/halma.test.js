// Chinese checkers: board shape, start position, steps and hop chains, win and anti-blocking rule.
import assert from 'node:assert/strict';
import { HalmaGame, HOLES, HOME, TARGET, ccMoves, destinations, hasWon, initialCC, ccParse } from '../src/halma.js';

assert.equal(HOLES.length, 121, '121 holes');
assert.equal(HOME.white.length, 10); assert.equal(HOME.black.length, 10);
assert.ok(HOME.white.includes('m1') && HOME.black.includes('e17'), 'tips');
assert.ok(!ccParse('a1') && ccParse('i9'), 'a1 is off the star, i9 is the centre');
// start: White has 10 marbles; legal moves from the start position (well known: 10 for each side? count it)
const start = initialCC();
const m0 = ccMoves(start, 'white');
assert.ok(m0.length > 0);
assert.ok(m0.every((m) => !start[m.to]), 'never lands on a marble');
// a hop chain: marbles on a line with gaps
const P = (c) => ({ type: 'M', color: c });
const pos = { i9: P('white'), i10: P('black'), i12: P('white') };
const d = destinations(pos, 'i9');
assert.ok(d.has('i11'), 'single hop');
assert.ok(d.has('i13'), 'double hop');
assert.deepEqual(d.get('i13'), ['i9', 'i11', 'i13']);
assert.ok(!d.has('i12'), 'no landing on a marble');
// win: White fills the top point
const won = {};
for (const k of TARGET.white) won[k] = P('white');
assert.ok(hasWon(won, 'white'));
// anti-blocking: a black marble left at home still lets White win if the rest is White
won[TARGET.white[0]] = P('black');
assert.ok(hasWon(won, 'white'));
// a full game API round trip
const g = new HalmaGame({ white: 'human', black: 'human' });
const first = g.legal()[0];
g.move(first.from, first.to);
assert.equal(g.turn, 'black');
assert.equal(g.history.length, 1);
assert.throws(() => g.move('e17', 'e15'), /Illegal|No marble/);
console.log(`halma tests: OK (${m0.length} opening moves)`);
