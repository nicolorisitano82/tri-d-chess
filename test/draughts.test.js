// Draughts rules in each variant: start position, compulsory and preferred captures, men vs kings,
// flying kings, crowning, end of game.
import assert from 'node:assert/strict';
import { DraughtsGame, VARIANTS } from '../src/draughts.js';

let groups = 0;
const setup = (kind, pieces, turn = 'white') => {
  const g = new DraughtsGame(kind, { white: 'human', black: 'human' });
  g.pieces = {};
  for (const [sq, type, color] of pieces) g.pieces[sq] = { type, color };
  g.turn = turn;
  return g;
};
const tos = (g, from) => g.legal(from).map((m) => m.to).sort();

// start positions and opening moves
{
  const it = new DraughtsGame('dama-it', {});
  const count = (g, c) => Object.values(g.pieces).filter((p) => p.color === c).length;
  assert.equal(count(it, 'white'), 12); assert.equal(count(it, 'black'), 12);
  assert.ok(it.pieces.h1 && !it.pieces.a1, 'Italian board: the dark corner (h1) is on the right');
  assert.equal(it.turn, 'white');
  assert.equal(it.legal().length, 7);
  const int = new DraughtsGame('dama-int', {});
  assert.equal(count(int, 'white'), 20); assert.equal(count(int, 'black'), 20);
  assert.ok(int.pieces.a1, 'international: a1 is a playing square');
  assert.equal(int.legal().length, 9);
  const en = new DraughtsGame('dama-en', {});
  assert.equal(en.turn, 'black', 'English checkers: Black (dark) moves first');
  assert.equal(en.legal().length, 7);
  groups++;
}

// capturing is compulsory; a quiet move is refused while a capture exists
{
  const g = setup('dama-en', [['c3', 'M', 'white'], ['d4', 'M', 'black'], ['g3', 'M', 'white'], ['a7', 'M', 'black']]);
  assert.deepEqual(g.legal().map((m) => `${m.from}-${m.to}`), ['c3-e5']);
  assert.throws(() => g.move('g3', 'h4'), /compulsory/);
  g.move('c3', 'e5');
  assert.ok(!g.pieces.d4 && g.pieces.e5);
  groups++;
}

// men capture backwards in Russian/international, not in English/Italian
{
  const pieces = [['e5', 'M', 'white'], ['d4', 'M', 'black'], ['h8', 'M', 'black']];
  assert.deepEqual(tos(setup('dama-en', pieces), 'e5').includes('c3'), false);
  assert.deepEqual(tos(setup('dama-ru', pieces), 'e5'), ['c3']);
  groups++;
}

// Italian: men cannot capture kings; kings prefer to capture; the most pieces first
{
  // (on the Italian board the dark squares are b1, d1, ..., a2, c2, ...)
  const g = setup('dama-it', [['d3', 'M', 'white'], ['e4', 'D', 'black'], ['g8', 'M', 'black']]);
  assert.ok(!g.legal().some((m) => m.taken.length), 'a man may not take a king');
  // a king and a man can both capture one man: the king must
  const k = setup('dama-it', [['b1', 'D', 'white'], ['e2', 'M', 'white'], ['c2', 'M', 'black'], ['f3', 'M', 'black'], ['g8', 'M', 'black']]);
  assert.deepEqual(k.legal().map((m) => m.from), ['b1']);
  // two pieces beat one
  const most = setup('dama-it', [['a2', 'M', 'white'], ['e2', 'M', 'white'], ['b3', 'M', 'black'], ['b5', 'M', 'black'], ['f3', 'M', 'black'], ['g8', 'M', 'black']]);
  assert.deepEqual(most.legal().map((m) => m.path.join('x')), ['a2xc4xa6']);
  groups++;
}

// international: flying kings, majority capture, crowned only at the end of the move
{
  const g = setup('dama-int', [['a1', 'D', 'white'], ['d4', 'M', 'black'], ['j10', 'M', 'black']]);
  assert.deepEqual(tos(g, 'a1'), ['e5', 'f6', 'g7', 'h8', 'i9']);
  const maj = setup('dama-int', [['a1', 'M', 'white'], ['e1', 'M', 'white'], ['b2', 'M', 'black'], ['b4', 'M', 'black'], ['f2', 'M', 'black'], ['j10', 'M', 'black']]);
  assert.deepEqual(maj.legal().map((m) => m.path.join('x')), ['a1xc3xa5']);
  groups++;
}

// crowning: English stops on the far rank; Russian goes on capturing as a king
{
  const en = setup('dama-en', [['d6', 'M', 'white'], ['e7', 'M', 'black'], ['g7', 'M', 'black'], ['a1', 'M', 'black']]);
  const m = en.legal().find((x) => x.from === 'd6');
  assert.equal(m.to, 'f8'); assert.equal(m.taken.length, 1); assert.ok(m.crown);
  const ru = setup('dama-ru', [['d6', 'M', 'white'], ['e7', 'M', 'black'], ['g7', 'M', 'black'], ['a1', 'M', 'black']]);
  const r = ru.legal().find((x) => x.from === 'd6');
  assert.equal(r.taken.length, 2, 'crowned on f8, it carries on as a king over g7');
  assert.ok(r.crown);
  groups++;
}

// end of game: the side that cannot move loses
{
  const g = setup('dama-en', [['c3', 'M', 'white'], ['d4', 'M', 'black']]);
  g.move('c3', 'e5');
  assert.equal(g.status, 'checkmate'); assert.equal(g.winner, 'white');
  groups++;
}

// every variant can play a long random game without errors
{
  let seed = 4242;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const kind of Object.keys(VARIANTS)) for (let n = 0; n < 20; n++) {
    const g = new DraughtsGame(kind, { white: 'human', black: 'human' });
    for (let i = 0; i < 300 && g.status === 'playing'; i++) {
      const L = g.legal();
      const m = L[Math.floor(rnd() * L.length)];
      g.move(m.from, m.to, m.path);
    }
  }
  groups++;
}
console.log(`draughts tests: ${groups} groups OK`);
