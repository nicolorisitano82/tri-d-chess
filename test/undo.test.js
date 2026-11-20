// Undo in local games: takes back your move and the computer's reply, keeps the game id.
import assert from 'node:assert/strict';
import { createGame } from '../src/games.js';
import { undoGame, undoTarget, isLocalGame } from '../src/undo.js';

const play = (g, moves) => { for (const [f, t] of moves) g.move(f, t); return g; };

// human (White) vs computer (Black): undo after W,B -> back to the start, White to move
let g = play(createGame('trid', { white: 'human', black: 'computer' }), [['b2W', 'b4N'], ['b7B', 'b5N']]);
assert.equal(undoTarget(g), 0);
let u = undoGame(g, createGame);
assert.equal(u.history.length, 0); assert.equal(u.turn, 'white'); assert.equal(u.id, g.id); assert.ok(u.version > g.version);

// computer (White) vs human (Black): after W,B,W undo goes back to Black to move (1 move kept)
g = play(createGame('chess', { white: 'computer', black: 'human' }), [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3']]);
u = undoGame(g, createGame);
assert.equal(u.history.length, 1); assert.equal(u.turn, 'black');

// two humans on one screen: one move at a time
g = play(createGame('chess', { white: 'human', black: 'human' }), [['e2', 'e4'], ['e7', 'e5']]);
u = undoGame(g, createGame);
assert.equal(u.history.length, 1); assert.equal(u.turn, 'black');

// undo after checkmate brings the game back to playing
g = play(createGame('chess', { white: 'human', black: 'human' }), [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]);
assert.equal(g.status, 'checkmate');
u = undoGame(g, createGame);
assert.equal(u.status, 'playing'); assert.equal(u.history.length, 3);

// not for network or MCP games
assert.equal(isLocalGame(createGame('trid', { white: 'human', black: 'remote' })), false);
assert.equal(isLocalGame(createGame('trid', { white: 'human', black: 'ai' })), false);
assert.throws(() => undoGame(createGame('trid', { white: 'human', black: 'ai' }), createGame));
console.log('undo tests: OK');
