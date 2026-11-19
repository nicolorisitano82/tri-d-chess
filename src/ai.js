// Built-in computer player: alpha-beta search (+ capture quiescence at high levels)
// on top of the rules engine, with selectable strength and playing style.
import { legalMoves, inCheck, parseSquare, findKing, applyMove } from './engine.js';

const V = { P: 100, N: 300, B: 320, R: 500, Q: 900, K: 0 };

// Experience levels. depth = full-width plies, qdepth = extra capture-only plies,
// noise = random score added per root move (higher = more mistakes).
export const LEVELS = {
  1: { name: 'Principiante', depth: 1, qdepth: 0, noise: 260 },
  2: { name: 'Facile', depth: 1, qdepth: 0, noise: 70 },
  3: { name: 'Medio', depth: 2, qdepth: 0, noise: 25, budget: 2000 },
  4: { name: 'Esperto', depth: 2, qdepth: 2, noise: 8, budget: 2500 },
  5: { name: 'Maestro', depth: 3, qdepth: 2, noise: 2, budget: 3500 },
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

function orderMoves(moves) {
  return moves.sort((a, b) => (b.capture ? V[b.capture] * 10 - V[b.piece] : 0) - (a.capture ? V[a.capture] * 10 - V[a.piece] : 0));
}

// Capture-only search to avoid stopping in the middle of an exchange.
let deadline = Infinity;
class Timeout extends Error {}

function quiesce(pos, color, me, qdepth, alpha, beta, st) {
  if (performance.now() > deadline) throw new Timeout();
  const stand = evaluate(pos, me, st);
  if (qdepth === 0) return stand;
  const maximizing = color === me;
  if (maximizing) { if (stand >= beta) return stand; alpha = Math.max(alpha, stand); }
  else { if (stand <= alpha) return stand; beta = Math.min(beta, stand); }
  const caps = orderMoves(legalMoves(pos, color).filter((m) => m.capture));
  let best = stand;
  for (const m of caps) {
    const v = quiesce(apply(pos, m), other(color), me, qdepth - 1, alpha, beta, st);
    if (maximizing) { best = Math.max(best, v); alpha = Math.max(alpha, v); }
    else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (alpha >= beta) break;
  }
  return best;
}

function search(pos, color, me, depth, alpha, beta, lv, st) {
  if (performance.now() > deadline) throw new Timeout();
  const moves = legalMoves(pos, color);
  if (!moves.length) return inCheck(pos, color) ? (color === me ? -1e6 - depth : 1e6 + depth) : 0;
  if (depth === 0) return lv.qdepth ? quiesce(pos, color, me, lv.qdepth, alpha, beta, st) : evaluate(pos, me, st);
  orderMoves(moves);
  const maximizing = color === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const m of moves) {
    const v = search(apply(pos, m), other(color), me, depth - 1, alpha, beta, lv, st);
    if (maximizing) { best = Math.max(best, v); alpha = Math.max(alpha, v); }
    else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (alpha >= beta) break;
  }
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
  // Iterative deepening with a time budget: keep the last fully searched depth.
  deadline = lv.budget ? performance.now() + lv.budget : Infinity;
  let best = moves[0];
  try {
    for (let d = 1; d <= lv.depth; d++) {
      const scored = [];
      for (const m of moves) {
        const v = search(apply(pos, m), other(color), color, d - 1, -Infinity, Infinity, d === lv.depth ? lv : { ...lv, qdepth: 0 }, st);
        scored.push({ m, s: v + bonus.get(m) });
      }
      scored.sort((a, b) => b.s - a.s);
      best = scored[0].m;
      moves = scored.map((x) => x.m); // best-first ordering for the next iteration
    }
  } catch (e) {
    if (!(e instanceof Timeout)) throw e;
  } finally {
    deadline = Infinity;
  }
  return best;
}
