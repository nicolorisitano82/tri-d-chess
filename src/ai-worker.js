// Runs the computer's search off the main thread (worker_threads), so the game server
// keeps answering the UI, SSE and MCP while the computer thinks.
import { parentPort } from 'node:worker_threads';
import { chooseMove } from './ai.js';

parentPort.on('message', ({ id, pos, color, level, style, recent }) => {
  let move = null;
  try { move = chooseMove(pos, color, level, style, recent); } catch (e) { parentPort.postMessage({ id, error: e.message }); return; }
  parentPort.postMessage({ id, move: move && { from: move.from, to: move.to, promotion: move.promotion || null } });
});
