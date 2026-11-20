// Built-in computer player: iterative-deepening alpha-beta (negamax) with a capture search at the
// horizon, killer moves and a time budget, on top of the rules engine; selectable strength and style.
import { legalMoves, pseudoMoves, inCheck, parseSquare, findKing, applyMove } from './engine.js';

const V = { P: 100, N: 300, B: 320, R: 500, Q: 900, K: 0 };

// Experience levels. depth = full-width plies, qdepth = extra capture-only plies,
// noise = random score added per root move (higher = more mistakes).
export const LEVELS = {
  1: { name: 'Principiante', depth: 1, qdepth: 0, noise: 260 },
  2: { name: 'Facile', depth: 1, qdepth: 2, noise: 90, budget: 1500 },
  3: { name: 'Medio', depth: 3, qdepth: 4, noise: 30, budget: 2500 },
  4: { name: 'Esperto', depth: 4, qdepth: 6, noise: 8, budget: 4000 },
  5: { name: 'Maestro', depth: 5, qdepth: 8, noise: 0, budget: 6000 },
};

// Playing styles: weights for the evaluation and root move bonuses.
export const STYLES = {
  balanced:   { name: 'Equilibrato', material: 1.0, center: 20, pawnAdv: 8,  attack: 4,  shelter: 4,  check: 15, capture: 0 },
  aggressive: { name: 'Aggressivo',  material: 0.85, center: 12, pawnAdv: 14, attack: 16, shelter: 0, check: 60, capture: 25 },
  cautious:   { name: 'Prudente',    material: 1.1, center: 10, pawnAdv: 4,  attack: 0,  shelter: 14, check: 0,  capture: -5 },
};

const other = (c) => (c === 'white' ? 'black' : 'white');

// Positions are { pieces, boards } (see engine.js); board moves carry pieces along.
const apply = (pos, m) => applyMove(pos, m).pos;

const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function evaluate(pos, me, st) {
  const { pieces } = pos;
  const kings = { white: findKing(pieces, 'white'), black: findKing(pieces, 'black') };
  const kpos = { white: kings.white && parseSquare(kings.white), black: kings.black && parseSquare(kings.black) };
  let s = 0;
  for (const [k, pc] of Object.entries(pieces)) {
    const sq = parseSquare(k);
    const { x, y } = sq;
    let v = V[pc.type] * st.material;
    if (pc.type === 'P') v += (pc.color === 'white' ? y : 9 - y) * st.pawnAdv;
    else if (pc.type !== 'K') {
      if (x >= 1 && x <= 4 && y >= 3 && y <= 6) v += st.center;
      const enemyK = kpos[other(pc.color)], ownK = kpos[pc.color];
      if (enemyK) v += (9 - dist(sq, enemyK)) * st.attack;           // pressure on the enemy king
      if (ownK && dist(sq, ownK) <= 2) v += st.shelter;               // pieces guarding own king
    }
    s += pc.color === me ? v : -v;
  }
  return s;
}

// Move ordering: captures by MVV-LVA, promotions, then the killer moves of this ply.
const mkey = (m) => `${m.from}>${m.to}`;
function orderMoves(moves, killers = null) {
  const score = (m) => (m.capture ? 10000 + V[m.capture] * 10 - (V[m.piece] || 0) : 0) + (m.promotion ? 9000 : 0)
    + (killers && !m.capture ? (killers[0] === mkey(m) ? 8000 : killers[1] === mkey(m) ? 7000 : 0) : 0);
  for (const m of moves) m._s = score(m);
  return moves.sort((a, b) => b._s - a._s);
}

let deadline = Infinity;
let nodes = 0;
class Timeout extends Error {}
const tick = () => { if ((++nodes & 255) === 0 && performance.now() > deadline) throw new Timeout(); };
const MATE = 1e6;

// Capture-only search (negamax), so the search never stops in the middle of an exchange:
// a move that leaves a piece hanging is seen to lose it.
function quiesce(pos, color, alpha, beta, qd, st) {
  tick();
  const stand = evaluate(pos, color, st);
  if (qd <= 0 || stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  for (const m of orderMoves(pseudoMoves(pos, color, true))) {
    if (!m.promotion && stand + V[m.capture] + 250 < alpha) continue; // delta pruning: cannot raise alpha
    const after = apply(pos, m);
    if (inCheck(after, color)) continue;
    const v = -quiesce(after, other(color), -beta, -alpha, qd - 1, st);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

// Alpha-beta (negamax) on pseudo-legal moves: a move is checked for legality only when searched.
// Scores are from the point of view of `color`, the side to move.
function negamax(pos, color, depth, alpha, beta, ply, ctx) {
  tick();
  if (depth <= 0) {
    // a side in check at the horizon gets one more ply (stand-pat would be wrong)
    if (ply < ctx.maxPly && inCheck(pos, color)) depth = 1;
    else return quiesce(pos, color, alpha, beta, ctx.qd, ctx.st);
  }
  const killers = ctx.killers[ply] || (ctx.killers[ply] = []);
  let best = -Infinity, legal = 0;
  for (const m of orderMoves(pseudoMoves(pos, color), killers)) {
    const after = apply(pos, m);
    if (inCheck(after, color)) continue;
    legal++;
    const v = -negamax(after, other(color), depth - 1, -beta, -alpha, ply + 1, ctx);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) {
      if (!m.capture) { const k = mkey(m); if (killers[0] !== k) { killers[1] = killers[0]; killers[0] = k; } }
      break;
    }
  }
  if (!legal) return inCheck(pos, color) ? -MATE + ply : 0;
  return best;
}

/**
 * Pick a move for `color`.
 * level: 1..5, style: 'balanced' | 'aggressive' | 'cautious'.
 * recent: the side's own recent moves reversed ("to>from"), discouraged to avoid shuffling.
 */
export function chooseMove(pos, color, level = 3, style = 'balanced', recent = []) {
  const lv = LEVELS[level] || LEVELS[3];
  const st = STYLES[style] || STYLES.balanced;
  let moves = orderMoves(legalMoves(pos, color));
  if (!moves.length) return null;
  const bonus = new Map();
  for (const m of moves) {
    let b = Math.random() * lv.noise;
    if (st.check && inCheck(apply(pos, m), other(color))) b += st.check;
    if (m.capture) b += st.capture;
    if (recent.includes(`${m.from}>${m.to}`)) b -= 30;
    bonus.set(m, b);
  }
  // Iterative deepening with a time budget. Every iteration ends in the capture search, so
  // even when time runs out early the move does not hang material.
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
        // only moves that could still beat the best total need an exact score
        const a = iterBest ? bestTotal - b : -Infinity;
        const v = -negamax(apply(pos, m), other(color), d - 1, -Infinity, a === -Infinity ? Infinity : -a + 1, 1, ctx);
        scored.push({ m, s: v + b });
        if (v + b > bestTotal) { bestTotal = v + b; iterBest = m; }
        best = iterBest; // the previous best is searched first, so a partial iteration is still sound
      }
      scored.sort((x, y) => y.s - x.s);
      moves = scored.map((x) => x.m); // best-first ordering for the next iteration
    }
  } catch (e) {
    if (!(e instanceof Timeout)) throw e;
  } finally {
    deadline = Infinity;
  }
  return best;
}
