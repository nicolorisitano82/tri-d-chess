// Targeted tests for Meder's official rules.
import assert from 'node:assert/strict';
import { Game, pinNeighbours, promotionRank, deadPosition } from '../src/engine.js';

const fresh = () => new Game({ white: 'human', black: 'human' });
// keep only kings (+ listed pieces) to build test positions
function setup(pieces, { turn = 'white', boards } = {}) {
  const g = fresh();
  g.pieces = {};
  for (const [k, v] of Object.entries(pieces)) g.pieces[k] = { moved: false, ...v };
  if (boards) g.boards = boards;
  g.turn = turn;
  g.repetitions = {};
  g.history = [{ color: 'white' }, { color: 'black' }];
  return g;
}
const W = (type, extra = {}) => ({ type, color: 'white', ...extra });
const B = (type, extra = {}) => ({ type, color: 'black', ...extra });
let n = 0;
const ok = (name) => { n++; console.log('  ✓', name); };

// --- official starting position (Meder's diagram, image5 of the tournament rules) ---------
{
  const g = fresh();
  const official = {
    white: { z0QL1: 'R', a0QL1: 'Q', z1QL1: 'P', a1QL1: 'P', d0KL1: 'K', e0KL1: 'R', d1KL1: 'P', e1KL1: 'P',
      a1W: 'N', b1W: 'B', c1W: 'B', d1W: 'N', a2W: 'P', b2W: 'P', c2W: 'P', d2W: 'P' },
    black: { z9QL6: 'R', a9QL6: 'Q', z8QL6: 'P', a8QL6: 'P', d9KL6: 'K', e9KL6: 'R', d8KL6: 'P', e8KL6: 'P',
      a8B: 'N', b8B: 'B', c8B: 'B', d8B: 'N', a7B: 'P', b7B: 'P', c7B: 'P', d7B: 'P' },
  };
  const actual = Object.fromEntries(Object.entries(g.pieces).map(([k, p]) => [k, p.color + p.type]));
  const expected = Object.fromEntries(Object.entries(official).flatMap(([c, sq]) => Object.entries(sq).map(([k, ty]) => [k, c + ty])));
  assert.deepEqual(actual, expected);
  assert.deepEqual(Object.keys(g.boards).sort(), ['KL1', 'KL6', 'QL1', 'QL6']);
  ok('starting position matches the official diagram');
}

// --- pin graph: 3/4/5/5/4/3 reachable pins, examples from Meder 3.6 ------------------
assert.deepEqual([1, 2, 3, 4, 5, 6].map((i) => pinNeighbours(`QL${i}`).length), [3, 4, 5, 5, 4, 3]);
assert.deepEqual(pinNeighbours('QL6').sort(), ['KL6', 'QL4', 'QL5']);
assert.deepEqual(pinNeighbours('QL3').sort(), ['KL3', 'QL1', 'QL2', 'QL4', 'QL5']);
ok('pin graph matches Meder 3.6 (incl. sideways)');

// --- sideways board move carries pieces across files -------------------------------------
{
  const g = setup({ d0KL1: W('K'), z1QL1: W('P'), d9KL6: B('K') });
  assert.ok(g.legal('QL1').some((m) => m.to === 'KL1') === false, 'KL1 occupied');
  g.boards = { QL1: 'white', KL3: 'white', QL6: 'black', KL6: 'black' };
  g.pieces = { d2KL3: W('K'), z1QL1: W('P'), d9KL6: B('K') };
  g.move('QL1', 'KL1');
  assert.equal(g.pieces.d1KL1?.type, 'P', 'board translates: z1 pawn moves to d1');
  ok('sideways board move QL1 → KL1 carries the pawn z1 → d1');
}

// --- occupied boards cannot move backwards; empty ones can --------------------------------
{
  const g = setup({ d0KL1: W('K'), z3QL3: W('N'), d9KL6: B('K') }, { boards: { QL3: 'white', KL1: 'white', QL6: 'black', KL6: 'black' } });
  const to = g.legal('QL3').map((m) => m.to).sort();
  assert.deepEqual(to, ['KL3', 'QL2', 'QL4', 'QL5'], 'occupied: forward + sideways only');
  delete g.pieces.z3QL3;
  assert.ok(g.legal('QL3').some((m) => m.to === 'QL1'), 'empty: backward allowed');
  ok('occupied board: forward/sideways only; empty board may go backwards');
}

// --- carried pawn loses its double step ---------------------------------------------------
{
  // black's queen-side board waits on QL2 so that z4/z5 exist
  const g = setup({ d0KL1: W('K'), z1QL1: W('P'), d9KL6: B('K') }, { boards: { QL1: 'white', KL1: 'white', QL2: 'black', KL6: 'black' } });
  g.move('QL1', 'QL3');
  assert.ok(g.pieces.z3QL3.moved, 'pawn marked as moved');
  g.move('d9KL6', 'e9KL6');
  const targets = g.legal('z3QL3').map((m) => m.to);
  assert.ok(targets.includes('z4QL2') && !targets.includes('z5QL2'), 'only single step');
  ok('pawn carried by an attack board has no double step');
}

// --- castling ------------------------------------------------------------------------------
{
  const g = setup({ d0KL1: W('K'), e0KL1: W('R'), z0QL1: W('R'), d9KL6: B('K') });
  const cs = g.legal().filter((m) => m.castle).map((m) => m.castle).sort();
  assert.deepEqual(cs, ['K', 'Q']);
  const g2 = setup({ d0KL1: W('K'), e0KL1: W('R'), z0QL1: W('R'), d9KL6: B('K') });
  g2.move('0-0');
  assert.equal(g2.pieces.e0KL1.type, 'K'); assert.equal(g2.pieces.d0KL1.type, 'R');
  const g3 = setup({ d0KL1: W('K'), e0KL1: W('R'), z0QL1: W('R'), d9KL6: B('K') });
  g3.move('0-0-0');
  assert.equal(g3.pieces.a0QL1.type, 'K'); assert.equal(g3.pieces.d0KL1.type, 'R');
  assert.equal(g3.history.at(-1).notation.replace('+', ''), '0-0-0');
  assert.ok(!fresh().legal().some((m) => m.castle), 'never as the first move');
  // blocked by a piece between (queen on a0)
  const g4 = setup({ d0KL1: W('K'), z0QL1: W('R'), a0QL1: W('Q'), d9KL6: B('K') });
  assert.ok(!g4.legal().some((m) => m.castle === 'Q'), 'queen between');
  // not when king or rook moved, not out of / into check
  const g5 = setup({ d0KL1: W('K', { moved: true }), e0KL1: W('R'), d9KL6: B('K') });
  assert.ok(!g5.legal().some((m) => m.castle));
  const g6 = setup({ d0KL1: W('K'), e0KL1: W('R'), d9KL6: B('K'), d5N: B('R') });
  assert.ok(!g6.legal().some((m) => m.castle), 'in check');
  // not when the king would land on an attacked square (bishop on b2W attacks... a rook on the e-file via KL3)
  const g7 = setup({ d0KL1: W('K'), e0KL1: W('R'), d9KL6: B('K'), e3KL3: B('R', { moved: true }) }, { boards: { QL1: 'white', KL1: 'white', QL6: 'black', KL3: 'black' } });
  assert.ok(!g7.legal().some((m) => m.castle === 'K'), 'king would land on attacked e0');
  // king also castles by moving onto the rook square (UI path)
  const g8 = setup({ d0KL1: W('K'), e0KL1: W('R'), d9KL6: B('K') });
  g8.move('d0KL1', 'e0KL1');
  assert.equal(g8.history.at(-1).castle, 'K');
  ok('castling 0-0 / 0-0-0, blocked by pieces, by moved king, by check');
}

// --- en passant ---------------------------------------------------------------------------------
{
  const g = setup({ d0KL1: W('K'), b2W: W('P'), d9KL6: B('K'), c4N: B('P', { moved: true }) });
  g.move('b2W', 'b4W');
  const ep = g.legal('c4N').filter((m) => m.ep);
  assert.ok(ep.length >= 1, 'en passant available');
  assert.ok(ep.every((m) => /^b3[WN]$/.test(m.to)), 'lands on the passed square, any level');
  g.move('c4N', ep[0].to);
  assert.ok(!g.pieces.b4W, 'double-stepped pawn removed');
  assert.match(g.history.at(-1).notation, /e\.p\./);
  // only on the very next move
  const h = setup({ d0KL1: W('K'), b2W: W('P'), d9KL6: B('K'), c4N: B('P', { moved: true }), a7B: B('P') });
  h.move('b2W', 'b4W'); h.move('a7B', 'a6B'); h.move('d0KL1', 'e0KL1');
  assert.ok(!h.legal('c4N').some((m) => m.ep), 'expired');
  ok('en passant, landing on either level, only immediately');
}

// --- promotion ranks and choice -----------------------------------------------------------------
{
  const g = fresh();
  assert.equal(promotionRank(g.pos, 'white', 2), 8);   // b
  assert.equal(promotionRank(g.pos, 'white', 0), 9);   // z
  assert.equal(promotionRank(g.pos, 'white', 1), 9);   // a, QL6 overhangs
  g.boards = { QL1: 'white', KL1: 'white', QL4: 'black', KL6: 'black' };
  assert.equal(promotionRank(g.pos, 'white', 1), 8);   // a, no board on QL6
  assert.equal(promotionRank(g.pos, 'black', 4), 0);   // d, KL1 overhangs
  const p = setup({ d0KL1: W('K'), c7B: W('P', { moved: true }), d9KL6: B('K') });
  const promos = p.legal('c7B').filter((m) => m.to === 'c8B').map((m) => m.promotion).sort();
  assert.deepEqual(promos, ['B', 'N', 'Q', 'R']);
  p.move('c7B', 'c8B', 'N');
  assert.equal(p.pieces.c8B.type, 'N');
  // z-file pawn on rank 8 is not yet promoted
  const z = setup({ d0KL1: W('K'), z7QL4: W('P', { moved: true }), d9KL6: B('K') }, { boards: { QL1: 'white', KL1: 'white', QL4: 'white', QL6: 'black', KL6: 'black' } });
  assert.ok(z.legal('z7QL4').some((m) => m.to === 'z8QL6' && !m.promotion));
  // stranded pawn on a8B promoted when the overhanging board leaves
  const s = setup({ d0KL1: W('K'), a8B: W('P', { moved: true }), d9KL6: B('K') }, { turn: 'black', boards: { QL1: 'white', KL1: 'white', QL6: 'black', KL6: 'black' } });
  s.move('QL6', 'QL5');
  assert.equal(s.pieces.a8B.type, 'Q');
  ok('promotion ranks per file/board, choice of piece, stranded pawn');
}

// --- draws ------------------------------------------------------------------------------------------
{
  const g = setup({ d0KL1: W('K'), d9KL6: B('K'), c3N: W('N') });
  assert.ok(deadPosition(g.pos));
  const r = setup({ d0KL1: W('K'), d9KL6: B('K'), b1W: W('R') });
  r.repetitions = {};
  const cycle = [['b1W', 'b2W'], ['d9KL6', 'e9KL6'], ['b2W', 'b1W'], ['e9KL6', 'd9KL6']];
  for (let i = 0; i < 16 && r.status === 'playing'; i++) r.move(...cycle[i % 4]);
  assert.equal(r.status, 'draw'); assert.equal(r.drawReason, 'repetition');
  const m = setup({ d0KL1: W('K'), d9KL6: B('K'), b1W: W('N'), c8B: B('P', { moved: true }) }, { turn: 'white' });
  m.move('b1W', 'c3N'); m.move('c8B', 'c7B');
  assert.equal(m.status, 'playing');
  ok('draws: dead position and threefold repetition');
}
console.log(`rules tests: ${n} groups OK`);
