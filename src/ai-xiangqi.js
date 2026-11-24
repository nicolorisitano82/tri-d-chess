// Computer player for Xiangqi: iterative-deepening alpha-beta (negamax) with a capture search at
// the horizon, a transposition table, killer moves and a time budget, on the 90-cell array board of
// xiangqi.js (make / unmake in place). Same levels and styles as the other games.
import { toBoard, legalXq, capturesXq, inCheck, XQ_VALUES } from './xiangqi.js';
import { STYLES } from './ai.js';

export const LEVELS_XQ = {
  1: { depth: 1, qdepth: 0, noise: 220 },
  2: { depth: 3, qdepth: 2, noise: 70, budget: 1500 },
  3: { depth: 4, qdepth: 4, noise: 20, budget: 2500 },
  4: { depth: 5, qdepth: 6, noise: 8, budget: 3500 },
  5: { depth: 7, qdepth: 8, noise: 0, budget: 5000 },
};

const other = (c) => (c === 'white' ? 'black' : 'white');
const MATE = 1e6;
const NF = 9;

// positional bonus per piece from its own side (rr = ranks advanced from the home edge, 0..9)
function placeBonus(type, f, rr, st) {
  const centre = 4 - Math.abs(f - 4);                     // 0 on the edge files .. 4 on the e-file
  switch (type) {
    case 'P':
      if (rr <= 4) return rr === 4 ? 10 : 0;              // still on its own side of the river
      return 90 + centre * 8 + (rr <= 7 ? (rr - 4) * 10 : 30 - (rr - 7) * 15) + (st.pawnAdv - 8) * 2; // across: worth ~2x; the last rank is weak
    case 'H': return centre * 6 + Math.min(rr, 6) * 6 - (rr === 0 ? 15 : 0);
    case 'R': return centre * 2 + (rr >= 5 ? 20 : 0) + (rr === 0 && (f === 0 || f === 8) ? -10 : 0);
    case 'C': return (f === 4 ? 25 : 0) + (rr === 2 || rr === 3 ? 8 : 0);
    default: return 0;
  }
}

function evaluate(b, me, st) {
  let s = 0;
  const gen = {};
  for (let i = 0; i < 90; i++) { const p = b[i]; if (p && p.type === 'K') gen[p.color] = i; }
  for (let i = 0; i < 90; i++) {
    const p = b[i];
    if (!p || p.type === 'K') continue;
    const f = i % NF, r = (i - f) / NF, rr = p.color === 'white' ? r : 9 - r;
    let v = XQ_VALUES[p.type] * st.material + placeBonus(p.type, f, rr, st);
    if (p.type === 'H' || p.type === 'R' || p.type === 'C' || (p.type === 'P' && rr > 4)) {
      const ek = gen[other(p.color)];
      if (ek !== undefined) { const ef = ek % NF, er = (ek - ef) / NF; v += (9 - Math.max(Math.abs(ef - f), Math.abs(er - r))) * st.attack * 0.6; }
    }
    if ((p.type === 'A' || p.type === 'E')) v += st.shelter;
    s += p.color === me ? v : -v;
  }
  return s;
}

// --- transposition table (Zobrist hash of the 90 cells and the side to move) -------------------
const TYPES = 'KAEHRCP';
const Z = Array.from({ length: 90 * 14 }, () => [(Math.random() * 2 ** 32) >>> 0, (Math.random() * 2 ** 21) >>> 0]);
const zIdx = (p, i) => (TYPES.indexOf(p.type) + (p.color === 'white' ? 0 : 7)) * 90 + i;
function hashOf(b, color) {
  let lo = color === 'white' ? 0x9e3779b9 : 0, hi = 0;
  for (let i = 0; i < 90; i++) if (b[i]) { const z = Z[zIdx(b[i], i)]; lo ^= z[0]; hi ^= z[1]; }
  return hi * 2 ** 32 + (lo >>> 0);
}
const TT_MAX = 400000;
let tt = new Map();
const EXACT = 0, LOWER = 1, UPPER = 2;

let deadline = Infinity, nodes = 0;
class Timeout extends Error {}
const tick = () => { if ((++nodes & 1023) === 0 && performance.now() > deadline) throw new Timeout(); };

// order the flat [from, to, ...] list: TT move, captures by MVV-LVA, killers
function ordered(b, list, ttMove, killers) {
  const ms = [];
  for (let k = 0; k < list.length; k += 2) {
    const f = list[k], t = list[k + 1], cap = b[t];
    const key = f * 90 + t;
    let s = cap ? 10000 + XQ_VALUES[cap.type] * 10 - XQ_VALUES[b[f].type] / 10 : 0;
    if (key === ttMove) s += 100000;
    else if (!cap && killers) s += killers[0] === key ? 8000 : killers[1] === key ? 7000 : 0;
    ms.push([s, f, t]);
  }
  return ms.sort((a, c) => c[0] - a[0]);
}

function quiesce(b, color, alpha, beta, qd, ctx) {
  tick();
  const stand = evaluate(b, color, ctx.st);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (qd <= 0) return stand;
  for (const [, f, t] of ordered(b, capturesXq(b, color), -1, null)) {
    const cap = b[t];
    b[t] = b[f]; b[f] = null;
    const v = -quiesce(b, other(color), -beta, -alpha, qd - 1, ctx);
    b[f] = b[t]; b[t] = cap;
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function negamax(b, color, depth, alpha, beta, ply, ctx) {
  tick();
  const check = inCheck(b, color);
  if (check) depth++;                                         // check extension
  if (depth <= 0) return quiesce(b, color, alpha, beta, ctx.qdepth, ctx);
  const h = hashOf(b, color), e = tt.get(h);
  let ttMove = -1;
  if (e) {
    ttMove = e.move;
    if (e.depth >= depth && ply > 0) {
      const sc = e.score > MATE / 2 ? e.score - ply : e.score < -MATE / 2 ? e.score + ply : e.score;
      if (e.flag === EXACT || (e.flag === LOWER && sc >= beta) || (e.flag === UPPER && sc <= alpha)) return sc;
    }
  }
  const list = legalXq(b, color);
  if (!list.length) return -MATE + ply;                       // no move: lost (checkmate or stalemate)
  const killers = ctx.killers[ply] || (ctx.killers[ply] = []);
  const a0 = alpha;
  let best = -Infinity, bestMove = -1;
  for (const [, f, t] of ordered(b, list, ttMove, killers)) {
    const cap = b[t];
    b[t] = b[f]; b[f] = null;
    const v = -negamax(b, other(color), depth - 1, -beta, -alpha, ply + 1, ctx);
    b[f] = b[t]; b[t] = cap;
    if (v > best) { best = v; bestMove = f * 90 + t; }
    if (v > alpha) alpha = v;
    if (alpha >= beta) {
      if (!cap) { const k = f * 90 + t; if (killers[0] !== k) { killers[1] = killers[0]; killers[0] = k; } }
      break;
    }
  }
  if (tt.size > TT_MAX) tt.clear();
  const stored = best > MATE / 2 ? best + ply : best < -MATE / 2 ? best - ply : best;
  tt.set(h, { depth, score: stored, flag: best <= a0 ? UPPER : best >= beta ? LOWER : EXACT, move: bestMove });
  return best;
}

const keyOf = (i) => 'abcdefghi'[i % NF] + (Math.floor(i / NF) + 1);

/** Pick a move for `color` from { pieces }. Returns { from, to, promotion: null }. */
export function chooseMoveXiangqi(pos, color, level = 3, style = 'balanced', recent = []) {
  const lv = LEVELS_XQ[level] || LEVELS_XQ[3];
  const st = STYLES[style] || STYLES.balanced;
  const b = toBoard(pos.pieces);
  const list = legalXq(b, color);
  if (!list.length) return null;
  let moves = ordered(b, list, -1, null).map(([, f, t]) => ({ f, t }));
  const done = (m) => ({ from: keyOf(m.f), to: keyOf(m.t), promotion: null });
  if (moves.length === 1) return done(moves[0]);
  const bonus = new Map();
  for (const m of moves) {
    let x = Math.random() * lv.noise;
    if (b[m.t]) x += st.capture;
    if (recent.includes(`${keyOf(m.t)}>${keyOf(m.f)}`)) x -= 30;   // do not shuffle back and forth
    bonus.set(m, x);
  }
  tt = new Map();
  deadline = lv.budget ? performance.now() + lv.budget : Infinity;
  nodes = 0;
  const ctx = { st, qdepth: lv.qdepth, killers: [] };
  let best = moves[0];
  try {
    for (let d = 1; d <= lv.depth; d++) {
      const scored = [];
      let bestTotal = -Infinity, iterBest = null;
      for (const m of moves) {
        const x = bonus.get(m), cap = b[m.t];
        b[m.t] = b[m.f]; b[m.f] = null;
        let v;
        try {
          if (inCheck(b, other(color))) v = st.check; else v = 0;
          const a = iterBest ? bestTotal - x - v : -Infinity;
          v += -negamax(b, other(color), d - 1, -Infinity, a === -Infinity ? Infinity : -a + 1, 1, ctx);
        } finally { b[m.f] = b[m.t]; b[m.t] = cap; }
        scored.push({ m, s: v + x });
        if (v + x > bestTotal) { bestTotal = v + x; iterBest = m; }
      }
      best = iterBest;
      scored.sort((p, q) => q.s - p.s);
      moves = scored.map((p) => p.m);
      if (Math.abs(scored[0].s) > MATE / 2) break;
    }
  } catch (e) {
    if (!(e instanceof Timeout)) throw e;
  } finally {
    deadline = Infinity;
  }
  return done(best);
}
