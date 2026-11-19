// Classic chess adapter (chess.js) — same interface as the Tri-D game.
import assert from 'node:assert/strict';
import { ChessGame } from '../src/chess2d.js';

const g = () => new ChessGame({ white: 'human', black: 'human' });
let n = 0; const ok = (s) => { n++; console.log('  ✓', s); };

{ const x = g(); assert.equal(x.legal().length, 20); assert.equal(Object.keys(x.pieces).length, 32); assert.equal(x.snapshot().kind, 'chess'); ok('start: 20 moves, 32 pieces'); }
{ // scholar's mate
  const x = g(); for (const [f, t] of [['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6'], ['h5', 'f7']]) x.move(f, t);
  assert.equal(x.status, 'checkmate'); assert.equal(x.winner, 'white'); assert.match(x.history.at(-1).notation, /#$/); ok('checkmate detected (scholar\'s mate)');
}
{ // castling both ways, by 0-0 and by king move
  const x = g(); for (const [f, t] of [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['g8', 'f6'], ['f1', 'c4'], ['f8', 'c5']]) x.move(f, t);
  const r = x.move('0-0'); assert.equal(r.castle, 'K'); assert.equal(r.rookFrom, 'h1'); assert.equal(x.pieces.g1.type, 'K'); assert.equal(x.pieces.f1.type, 'R');
  const r2 = x.move('e8', 'g8'); assert.equal(r2.castle, 'K'); assert.equal(r2.notation, '0-0'); ok('castling via 0-0 and via king move');
}
{ // en passant
  const x = g(); for (const [f, t] of [['e2', 'e4'], ['a7', 'a6'], ['e4', 'e5'], ['d7', 'd5']]) x.move(f, t);
  const ep = x.legal('e5').find((m) => m.ep); assert.equal(ep.to, 'd6'); const r = x.move('e5', 'd6'); assert.ok(r.ep); assert.ok(!x.pieces.d5); ok('en passant');
}
{ // promotion with choice
  const x = g(); for (const [f, t] of [['h2', 'h4'], ['g7', 'g5'], ['h4', 'g5'], ['h7', 'h6'], ['g5', 'h6'], ['g8', 'f6'], ['h6', 'h7'], ['f6', 'g8']]) x.move(f, t);
  const promos = x.legal('h7').filter((m) => m.to === 'h8' || m.to === 'g8').map((m) => m.promotion); assert.ok(promos.includes('N') && promos.includes('Q'));
  x.move('h7', 'g8', 'N'); assert.equal(x.pieces.g8.type, 'N'); assert.equal(x.pieces.g8.color, 'white'); ok('promotion with choice of piece');
}
{ // stalemate (fastest known: 10 moves)
  const x = g(); for (const [f, t] of [['e2', 'e3'], ['a7', 'a5'], ['d1', 'h5'], ['a8', 'a6'], ['h5', 'a5'], ['h7', 'h5'], ['h2', 'h4'], ['a6', 'h6'], ['a5', 'c7'], ['f7', 'f6'], ['c7', 'd7'], ['e8', 'f7'], ['d7', 'b7'], ['d8', 'd3'], ['b7', 'b8'], ['d3', 'h7'], ['b8', 'c8'], ['f7', 'g6'], ['c8', 'e6']]) x.move(f, t);
  assert.equal(x.status, 'stalemate'); ok('stalemate detected');
}
{ // illegal moves, wrong turn, flag
  const x = g(); assert.throws(() => x.move('e2', 'e5'), /Illegal/); assert.throws(() => x.move('e7', 'e5'), /turn/);
  x.flag('white'); assert.equal(x.status, 'timeout'); assert.equal(x.winner, 'black'); ok('illegal moves rejected, loss on time');
}
console.log(`chess tests: ${n} groups OK`);
