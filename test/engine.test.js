import assert from 'node:assert/strict';
import {
  Game, allSquares, legalMoves, initialPieces, initialBoards, inCheck, findKing, parseSquare,
  levelsAt, sqKey, PINS, pinNeighbours, boardController,
} from '../src/engine.js';

const other = (c) => (c === 'white' ? 'black' : 'white');

// --- geometry ------------------------------------------------------------------
assert.equal(allSquares(initialBoards()).length, 64, '64 squares in play at start');
assert.equal(allSquares().length, 48 + 12 * 4, 'static geometry: 3 main boards + 12 pins');
assert.equal(Object.keys(initialPieces()).length, 32, '32 pieces');
assert.deepEqual(pinNeighbours('QL1').sort(), ['KL1', 'QL2', 'QL3']);
assert.deepEqual(pinNeighbours('KL5').sort(), ['KL3', 'KL4', 'KL6', 'QL5']);

// --- opening ---------------------------------------------------------------------
const g = new Game({ white: 'human', black: 'human' });
const wm = g.legal();
assert.ok(wm.some((m) => m.from === 'a2W' && m.to === 'a4N'));
assert.ok(wm.some((m) => m.from === 'a2W' && m.to === 'a4W'));
assert.ok(!wm.some((m) => m.board), 'boards with 2+ pieces cannot move at start');
assert.throws(() => g.move('a2W', 'a5N'));
assert.throws(() => g.move('a7B', 'a6B'), /turn/);
console.log('white opening moves:', wm.length);

// --- attack board moves ------------------------------------------------------------
{
  // empty the white queen-side board except one pawn and move it forward
  const t = new Game({ white: 'human', black: 'human' });
  delete t.pieces.z0QL1; delete t.pieces.a0QL1; delete t.pieces.a1QL1;
  assert.equal(boardController(t.pos, 'QL1'), 'white');
  const bm = t.legal('QL1');
  assert.deepEqual(bm.map((m) => m.to).sort(), ['QL2', 'QL3']);
  const rec = t.move('QL1', 'QL3');
  assert.ok(rec.board);
  assert.equal(t.boards.QL3, 'white');
  assert.ok(!t.boards.QL1);
  assert.equal(t.pieces.z3QL3?.type, 'P', 'pawn rides along z1 → z3');
  assert.ok(!t.pieces.z1QL1);
  // the z pawn can now step forward? z4 exists only if a board sits on QL2/QL5
  t.move('a7B', 'a6B');
  assert.ok(!t.legal('z3QL3').length, 'z3 pawn blocked: no z4 square');
  t.move('QL3', 'QL2'); // forward for the pawn: z3 → z5
  assert.equal(t.pieces.z5QL2?.type, 'P');
  t.move('a6B', 'a5B');
  assert.ok(!t.legal('QL2').some((m) => m.to === 'QL1' || m.to === 'QL3'), 'board with a white pawn cannot go backwards');
  console.log('board moves ok:', t.history.map((h) => h.notation).join(' '));
}

// --- independent audit over random games -----------------------------------------
function attacked(pos, target, by) {
  const t = parseSquare(target);
  const occCol = (x, y) => levelsAt(x, y, pos.boards).some((lv) => pos.pieces[sqKey(x, y, lv)]);
  for (const [k, pc] of Object.entries(pos.pieces)) {
    if (pc.color !== by) continue;
    const s = parseSquare(k), dx = t.x - s.x, dy = t.y - s.y, adx = Math.abs(dx), ady = Math.abs(dy);
    if (!adx && !ady) continue;
    const clear = () => { const sx = Math.sign(dx), sy = Math.sign(dy); let x = s.x + sx, y = s.y + sy; while (x !== t.x || y !== t.y) { if (occCol(x, y)) return false; x += sx; y += sy; } return true; };
    if (pc.type === 'N' && ((adx === 1 && ady === 2) || (adx === 2 && ady === 1))) return true;
    if (pc.type === 'K' && adx <= 1 && ady <= 1) return true;
    if (pc.type === 'P' && adx === 1 && dy === (pc.color === 'white' ? 1 : -1)) return true;
    const ortho = adx === 0 || ady === 0, diag = adx === ady;
    if (((pc.type === 'R' && ortho) || (pc.type === 'B' && diag) || (pc.type === 'Q' && (ortho || diag))) && clear()) return true;
  }
  return false;
}
let positions = 0, boardMoves = 0;
const results = {};
for (let i = 0; i < 60; i++) {
  const G = new Game({ white: 'human', black: 'human' });
  while (G.status === 'playing' && G.history.length < 250) {
    positions++;
    const c = G.turn;
    assert.equal(inCheck(G.pos, c), attacked(G.pos, findKing(G.pieces, c), other(c)), 'inCheck agrees with independent check');
    // every piece stands on a square that is in play
    for (const k of Object.keys(G.pieces)) assert.ok(levelsAt(parseSquare(k).x, parseSquare(k).y, G.boards).includes(parseSquare(k).level), `piece on inactive square ${k}`);
    assert.equal(Object.keys(G.boards).length, 4, 'always 4 attack boards');
    const ms = G.legal();
    assert.ok(ms.length > 0, 'side to move has moves while playing');
    const m = ms[Math.floor(Math.random() * ms.length)];
    if (m.board) boardMoves++;
    G.move(m.from, m.to);
    assert.ok(!inCheck(G.pos, other(G.turn)), 'mover not in check after own move');
  }
  results[G.status] = (results[G.status] || 0) + 1;
}
console.log(`random play: ${positions} positions, ${boardMoves} board moves`, results);
console.log('OK');
