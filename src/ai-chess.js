// Computer player for classic chess: iterative-deepening alpha-beta (negamax) with a capture
// search at the horizon, killer moves and a time budget, on top of chess.js (make/undo).
// Same levels and styles as the Tri-D computer.
import { Chess } from 'chess.js';
import { STYLES } from './ai.js';

// Experience levels for classic chess (branching is lower than Tri-D, so a little deeper).
export const LEVELS_CHESS = {
  1: { depth: 1, qdepth: 0, noise: 220 },
  2: { depth: 2, qdepth: 2, noise: 70, budget: 1500 },
  3: { depth: 3, qdepth: 4, noise: 20, budget: 2500 },
  4: { depth: 3, qdepth: 6, noise: 8, budget: 3500 },
  5: { depth: 4, qdepth: 6, noise: 0, budget: 5000 },
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

// Move ordering: captures by MVV-LVA, promotions, then this ply's killer moves.
const mkey = (m) => m.from + m.to;
function order(moves, killers = null) {
  for (const m of moves) m._s = (m.captured ? 10000 + V[m.captured] * 10 - V[m.piece] : 0) + (m.promotion ? 9000 : 0)
    + (killers && !m.captured ? (killers[0] === mkey(m) ? 8000 : killers[1] === mkey(m) ? 7000 : 0) : 0);
  return moves.sort((a, b) => b._s - a._s);
}

let deadline = Infinity;
let nodes = 0;
class Timeout extends Error {}
const tick = () => { if ((++nodes & 127) === 0 && performance.now() > deadline) throw new Timeout(); };
const MATE = 1e6;
const side = (chess) => chess.turn(); // 'w' | 'b'

// Capture-only search (negamax): never stop in the middle of an exchange.
function quiesce(chess, alpha, beta, qd, st) {
  tick();
  const stand = evaluate(chess, side(chess), st);
  if (qd <= 0 || stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  for (const m of order(chess.moves({ verbose: true }).filter((x) => x.captured || x.promotion))) {
    if (!m.promotion && stand + V[m.captured] + 250 < alpha) continue; // delta pruning
    chess.move(m);
    const v = -quiesce(chess, -beta, -alpha, qd - 1, st);
    chess.undo();
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

// Alpha-beta (negamax); scores from the side to move's point of view.
function negamax(chess, depth, alpha, beta, ply, ctx) {
  tick();
  if (depth <= 0) {
    if (ply < ctx.maxPly && chess.inCheck()) depth = 1; // check at the horizon: one more ply
    else return quiesce(chess, alpha, beta, ctx.qd, ctx.st);
  }
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return chess.inCheck() ? -MATE + ply : 0;
  if (ply > 0 && (chess.isInsufficientMaterial() || chess.isThreefoldRepetition())) return 0;
  const killers = ctx.killers[ply] || (ctx.killers[ply] = []);
  let best = -Infinity;
  for (const m of order(moves, killers)) {
    chess.move(m);
    const v = -negamax(chess, depth - 1, -beta, -alpha, ply + 1, ctx);
    chess.undo();
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) {
      if (!m.captured) { const k = mkey(m); if (killers[0] !== k) { killers[1] = killers[0]; killers[0] = k; } }
      break;
    }
  }
  return best;
}

/** Pick a move for `color` ('white'|'black') from { fen }. Returns { from, to, promotion }. */
export function chooseMoveChess(pos, color, level = 3, style = 'balanced', recent = []) {
  const lv = LEVELS_CHESS[level] || LEVELS_CHESS[3];
  const st = STYLES[style] || STYLES.balanced;
  const chess = new Chess(pos.fen);
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
  // Iterative deepening with a time budget; every iteration ends in the capture search, so a
  // move kept after a timeout still sees the recaptures.
  deadline = lv.budget ? performance.now() + lv.budget : Infinity;
  nodes = 0;
  const ctx = { qd: lv.qdepth, st, killers: [], maxPly: lv.depth + 2 };
  let best = moves[0];
  try {
    for (let d = 1; d <= lv.depth; d++) {
      ctx.maxPly = d + 2;
      const scored = [];
      let bestTotal = -Infinity, iterBest = null;
      for (const m of moves) {
        const b = bonus.get(m);
        const a = iterBest ? bestTotal - b : -Infinity; // only moves that could still win need an exact score
        chess.move(m);
        const v = -negamax(chess, d - 1, -Infinity, a === -Infinity ? Infinity : -a + 1, 1, ctx);
        chess.undo();
        scored.push({ m, s: v + b });
        if (v + b > bestTotal) { bestTotal = v + b; iterBest = m; }
        best = iterBest; // the previous best is searched first, so a partial iteration is sound
      }
      scored.sort((x, y) => y.s - x.s);
      moves = scored.map((x) => x.m);
    }
  } catch (e) {
    if (!(e instanceof Timeout)) throw e;
  } finally {
    deadline = Infinity;
  }
  return { from: best.from, to: best.to, promotion: best.promotion ? best.promotion.toUpperCase() : null };
}
