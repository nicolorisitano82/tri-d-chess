// Computer player for classic chess: alpha-beta with iterative deepening, capture quiescence
// and a time budget, on top of chess.js (make/undo). Same levels and styles as the Tri-D computer.
import { Chess } from 'chess.js';
import { STYLES } from './ai.js';

// Experience levels for classic chess (branching is lower than Tri-D, so a little deeper).
export const LEVELS_CHESS = {
  1: { depth: 1, qdepth: 0, noise: 220 },
  2: { depth: 2, qdepth: 0, noise: 70 },
  3: { depth: 2, qdepth: 3, noise: 20, budget: 1500 },
  4: { depth: 3, qdepth: 4, noise: 8, budget: 2500 },
  5: { depth: 4, qdepth: 4, noise: 2, budget: 3500 },
};

const V = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// Piece-square tables from White's point of view, rank 8 first (index 0 = a8).
const PST = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};

let deadline = Infinity;
class Timeout extends Error {}

function evaluate(chess, me, st) {
  const board = chess.board();
  const kings = {};
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const p = board[r][f]; if (p && p.type === 'k') kings[p.color] = [r, f]; }
  let s = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) continue;
      const idx = p.color === 'w' ? r * 8 + f : (7 - r) * 8 + f;
      let v = V[p.type] * st.material + PST[p.type][idx];
      if (p.type === 'p') v += (p.color === 'w' ? 6 - r : r - 1) * (st.pawnAdv / 2);
      if (p.type !== 'k' && p.type !== 'p') {
        const ek = kings[p.color === 'w' ? 'b' : 'w'], ok = kings[p.color];
        if (ek) v += (7 - Math.max(Math.abs(ek[0] - r), Math.abs(ek[1] - f))) * st.attack;
        if (ok && Math.max(Math.abs(ok[0] - r), Math.abs(ok[1] - f)) <= 2) v += st.shelter;
      }
      s += p.color === me ? v : -v;
    }
  }
  return s;
}

const order = (moves) => moves.sort((a, b) => (b.captured ? V[b.captured] * 10 - V[b.piece] : 0) + (b.promotion ? 800 : 0) - ((a.captured ? V[a.captured] * 10 - V[a.piece] : 0) + (a.promotion ? 800 : 0)));

function quiesce(chess, me, qd, alpha, beta, st) {
  if (performance.now() > deadline) throw new Timeout();
  const stand = evaluate(chess, me, st);
  if (qd === 0) return stand;
  const maximizing = chess.turn() === me;
  if (maximizing) { if (stand >= beta) return stand; alpha = Math.max(alpha, stand); }
  else { if (stand <= alpha) return stand; beta = Math.min(beta, stand); }
  let best = stand;
  for (const m of order(chess.moves({ verbose: true }).filter((x) => x.captured || x.promotion))) {
    chess.move(m);
    const v = quiesce(chess, me, qd - 1, alpha, beta, st);
    chess.undo();
    if (maximizing) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (alpha >= beta) break;
  }
  return best;
}

function search(chess, me, depth, alpha, beta, lv, st) {
  if (performance.now() > deadline) throw new Timeout();
  if (chess.isCheckmate()) return chess.turn() === me ? -1e6 - depth : 1e6 + depth;
  if (chess.isStalemate() || chess.isInsufficientMaterial() || chess.isThreefoldRepetition()) return 0;
  if (depth === 0) return lv.qdepth ? quiesce(chess, me, lv.qdepth, alpha, beta, st) : evaluate(chess, me, st);
  const maximizing = chess.turn() === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const m of order(chess.moves({ verbose: true }))) {
    chess.move(m);
    const v = search(chess, me, depth - 1, alpha, beta, lv, st);
    chess.undo();
    if (maximizing) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (alpha >= beta) break;
  }
  return best;
}

/** Pick a move for `color` ('white'|'black') from { fen }. Returns { from, to, promotion }. */
export function chooseMoveChess(pos, color, level = 3, style = 'balanced', recent = []) {
  const lv = LEVELS_CHESS[level] || LEVELS_CHESS[3];
  const st = STYLES[style] || STYLES.balanced;
  const chess = new Chess(pos.fen);
  const me = color === 'white' ? 'w' : 'b';
  let moves = order(chess.moves({ verbose: true }));
  if (!moves.length) return null;
  const bonus = new Map();
  for (const m of moves) {
    let b = Math.random() * lv.noise;
    if (m.captured) b += st.capture;
    if (st.check && m.san.includes('+')) b += st.check;
    if (recent.includes(`${m.from}>${m.to}`)) b -= 30;
    bonus.set(m, b);
  }
  deadline = lv.budget ? performance.now() + lv.budget : Infinity;
  let best = moves[0];
  try {
    for (let d = 1; d <= lv.depth; d++) {
      const scored = [];
      for (const m of moves) {
        chess.move(m);
        const v = search(chess, me, d - 1, -Infinity, Infinity, d === lv.depth ? lv : { ...lv, qdepth: 0 }, st);
        chess.undo();
        scored.push({ m, s: v + bonus.get(m) });
      }
      scored.sort((a, b) => b.s - a.s);
      best = scored[0].m;
      moves = scored.map((x) => x.m);
    }
  } catch (e) {
    if (!(e instanceof Timeout)) throw e;
  } finally {
    deadline = Infinity;
  }
  return { from: best.from, to: best.to, promotion: best.promotion ? best.promotion.toUpperCase() : null };
}
