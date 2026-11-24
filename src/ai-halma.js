// Computer player for Chinese checkers (two players): iterative-deepening alpha-beta (negamax) with
// a beam (only the most promising moves are searched at each node: hop chains make the branching
// factor large) and a time budget. Same levels and styles as the other games.
import { ccMoves, ccParse, hasWon, TARGET } from './halma.js';
import { STYLES } from './ai.js';

export const LEVELS_CC = {
  1: { depth: 1, beam: 40, noise: 30 },
  2: { depth: 2, beam: 16, noise: 10, budget: 1500 },
  3: { depth: 3, beam: 14, noise: 3, budget: 2500 },
  4: { depth: 4, beam: 12, noise: 1, budget: 3500 },
  5: { depth: 5, beam: 12, noise: 0, budget: 5000 },
};

const other = (c) => (c === 'white' ? 'black' : 'white');
const WIN = 1e6;
const C = {};                                   // per-hole cache: forward row for White, lateral offset
const info = (k) => C[k] || (C[k] = (() => { const { x, z } = ccParse(k); return { z, lat: Math.abs(x - (-x - z)) / 2 }; })());
const TSET = { white: new Set(TARGET.white), black: new Set(TARGET.black) };

// how far a side still has to go: rows to the far tip, off-axis drift, and the last straggler
function remaining(pieces, color, st) {
  let sum = 0, worst = 0, lat = 0, home = 0;
  for (const k in pieces) {
    const p = pieces[k];
    if (p.color !== color) continue;
    const { z, lat: l } = info(k);
    const d = color === 'white' ? 8 - z : z + 8;          // 0 at the far tip, 16 at the own tip
    sum += d;
    if (d > worst) worst = d;
    if (!TSET[color].has(k)) lat += l;
    if (d >= 13) home++;                                 // still inside the own point
  }
  return sum * 10 + lat * (3 + st.center / 10) + worst * (6 + st.shelter / 2) + home * st.pawnAdv;
}
const evaluate = (pieces, me, st) => remaining(pieces, other(me), st) - remaining(pieces, me, st) * st.material;

const gain = (m, color) => { const a = info(m.from).z, b = info(m.to).z; return color === 'white' ? b - a : a - b; };
const apply = (pieces, m) => { const p = { ...pieces }; p[m.to] = p[m.from]; delete p[m.from]; return p; };

let deadline = Infinity, nodes = 0;
class Timeout extends Error {}
const tick = () => { if ((++nodes & 255) === 0 && performance.now() > deadline) throw new Timeout(); };

function candidates(pieces, color, beam) {
  const ms = ccMoves(pieces, color);
  for (const m of ms) m._g = gain(m, color) * 10 - info(m.to).lat + (TSET[color].has(m.to) && !TSET[color].has(m.from) ? 6 : 0);
  ms.sort((a, b) => b._g - a._g);
  return beam ? ms.slice(0, beam) : ms;
}

function negamax(pieces, color, depth, alpha, beta, ply, ctx) {
  tick();
  if (hasWon(pieces, other(color))) return -WIN + ply;
  if (depth <= 0) return evaluate(pieces, color, ctx.st);
  const ms = candidates(pieces, color, ctx.beam);
  if (!ms.length) return -WIN + ply;
  let best = -Infinity;
  for (const m of ms) {
    const v = -negamax(apply(pieces, m), other(color), depth - 1, -beta, -alpha, ply + 1, ctx);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

/** Pick a move for `color` from { pieces }. Returns { from, to, promotion: null }. */
export function chooseMoveHalma(pos, color, level = 3, style = 'balanced', recent = []) {
  const lv = LEVELS_CC[level] || LEVELS_CC[3];
  const st = STYLES[style] || STYLES.balanced;
  let moves = candidates(pos.pieces, color, 0);
  if (!moves.length) return null;
  // an immediate win
  for (const m of moves) if (hasWon(apply(pos.pieces, m), color)) return { from: m.from, to: m.to, promotion: null };
  moves = moves.slice(0, Math.max(lv.beam * 2, 24));
  const bonus = new Map();
  for (const m of moves) {
    let x = Math.random() * lv.noise;
    if (recent.includes(`${m.to}>${m.from}`)) x -= 40;                 // no shuffling back and forth
    bonus.set(m, x);
  }
  deadline = lv.budget ? performance.now() + lv.budget : Infinity;
  nodes = 0;
  const ctx = { st, beam: lv.beam };
  let best = moves[0];
  try {
    for (let d = 1; d <= lv.depth; d++) {
      const scored = [];
      let bestTotal = -Infinity, iterBest = null;
      for (const m of moves) {
        const x = bonus.get(m);
        const a = iterBest ? bestTotal - x : -Infinity;
        const v = -negamax(apply(pos.pieces, m), other(color), d - 1, -Infinity, a === -Infinity ? Infinity : -a + 1, 1, ctx);
        scored.push({ m, s: v + x });
        if (v + x > bestTotal) { bestTotal = v + x; iterBest = m; }
      }
      best = iterBest;
      scored.sort((p, q) => q.s - p.s);
      moves = scored.map((p) => p.m);
      if (Math.abs(scored[0].s) > WIN / 2) break;
    }
  } catch (e) {
    if (!(e instanceof Timeout)) throw e;
  } finally {
    deadline = Infinity;
  }
  return { from: best.from, to: best.to, promotion: null };
}
