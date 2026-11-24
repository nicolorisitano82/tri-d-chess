// Computer player for Hnefatafl (Fetlar, 11 x 11): iterative-deepening alpha-beta (negamax) with a
// transposition table, killer moves and a time budget, on the 121-cell array board of tafl.js
// (make / unmake in place). Same levels and styles as the other games.
import { toBoard, movesTafl, makeMove, unmakeMove, outcome, findKing, step, mFrom, mTo, THRONE, CORNERS } from './tafl.js';
import { STYLES } from './ai.js';

export const LEVELS_TF = {
  1: { depth: 1, noise: 120 },
  2: { depth: 2, noise: 40, budget: 1500 },
  3: { depth: 3, noise: 12, budget: 2500 },
  4: { depth: 4, noise: 4, budget: 3500 },
  5: { depth: 5, noise: 0, budget: 5000 },
};

const other = (c) => (c === 'white' ? 'black' : 'white');
const WIN = 1e6;
const N = 11, CELLS = 121;
const DIRS = [1, -1, N, -N];
// two squares on the diagonal near each corner (b3 + c2 for a1...): attackers there wall it off
const GUARDS = [2 * N + 1, N + 2, 2 * N + N - 2, N + N - 3, CELLS - 3 * N + 1, CELLS - 2 * N + 2, CELLS - 2 * N - 2, CELLS - 3 * N - 2];
const isCorner = (i) => CORNERS.includes(i);
// the 8 edge lanes into the corners: the first three squares from each corner along each edge
const LANES = CORNERS.flatMap((c) => { const cf = c % N, cr = (c - cf) / N, sf = cf ? -1 : 1, sr = cr ? -1 : 1; return [[1, 2, 3].map((k) => c + sf * k), [1, 2, 3].map((k) => c + sr * k * N)]; });

// how many corners the king could reach in one or two rook moves over empty squares
function escapes(b, k) {
  let one = 0, two = 0;
  const reach = (from) => {
    const out = [];
    for (const d of DIRS) { let j = step(from, d); while (j >= 0 && (!b[j] || j === from)) { out.push(j); j = step(j, d); } }
    return out;
  };
  const first = reach(k);
  for (const j of first) if (isCorner(j)) one++;
  if (one) return { one, two: 0 };
  const seen = new Set();
  for (const j of first) for (const c of reach(j)) if (isCorner(c) && !seen.has(c)) { seen.add(c); two++; }
  return { one, two };
}

function evaluate(b, me, st) {
  let att = 0, def = 0, guards = 0, near = 0;
  const k = findKing(b);
  if (k < 0) return me === 'white' ? WIN / 2 : -WIN / 2;
  const kf = k % N, kr = (k - kf) / N;
  for (let i = 0; i < CELLS; i++) {
    const p = b[i];
    if (!p) continue;
    if (p.color === 'white') {
      att++;
      const f = i % N, r = (i - f) / N, d = Math.abs(f - kf) + Math.abs(r - kr);
      if (d === 1) near += 3; else if (d === 2) near += 1;
    } else if (p.type !== 'K') def++;
  }
  for (const g of GUARDS) if (b[g] && b[g].color === 'white') guards++;
  for (const lane of LANES) if (lane.some((i) => b[i] && b[i].color === 'white')) guards += 1.5;
  const { one, two } = escapes(b, k);
  const cornerDist = Math.min(...CORNERS.map((c) => Math.abs((c % N) - kf) + Math.abs(Math.floor(c / N) - kr)));
  let s = 0;                                                     // from the defenders' point of view
  s += def * 220 * st.material - att * 110 * st.material;
  // the king one move from a corner: with the defenders to move it is over; two open corners are a fork
  s += (me === 'black' && one ? 50000 : one >= 2 ? 20000 : one * 900) + two * 220;
  s -= cornerDist * (6 + st.pawnAdv);
  s -= near * (25 + st.attack * 2);
  s -= guards * (45 + st.shelter);
  if (k === THRONE) s -= 10;
  return me === 'black' ? s : -s;
}

// --- transposition table --------------------------------------------------------------------
const rnd = () => [(Math.random() * 2 ** 32) >>> 0, (Math.random() * 2 ** 21) >>> 0];
const Z = Array.from({ length: CELLS * 3 }, rnd);
const zi = (p) => (p.type === 'K' ? 2 : p.color === 'white' ? 0 : 1);
function hashOf(b, color) {
  let lo = color === 'white' ? 0x9e3779b9 : 0, hi = 0;
  for (let i = 0; i < CELLS; i++) if (b[i]) { const z = Z[zi(b[i]) * CELLS + i]; lo ^= z[0]; hi ^= z[1]; }
  return hi * 2 ** 32 + (lo >>> 0);
}
const TT_MAX = 300000;
let tt = new Map();
const EXACT = 0, LOWER = 1, UPPER = 2;

let deadline = Infinity, nodes = 0;
class Timeout extends Error {}
const tick = () => { if ((++nodes & 1023) === 0 && performance.now() > deadline) throw new Timeout(); };

// cheap move ordering: captures and king moves toward the corners first
function ordered(b, list, ttMove, killers) {
  const k = findKing(b), kf = k % N, kr = (k - kf) / N;
  const ms = [];
  for (const m of list) {
    const f = mFrom(m), t = mTo(m), p = b[f];
    let s = 0;
    const tf = t % N, trr = (t - tf) / N;
    if (p.type === 'K') s += isCorner(t) ? 50000 : (tf === 0 || tf === N - 1 || trr === 0 || trr === N - 1) ? 600 : 100;
    // a capture? an enemy next to t with our anvil behind it
    for (const d of DIRS) {
      const n = step(t, d);
      if (n < 0 || !b[n] || b[n].color === p.color || b[n].type === 'K') continue;
      const a = step(n, d);
      if (a >= 0 && a !== f && ((b[a] && b[a].color === p.color) || isCorner(a) || (a === THRONE && !b[a]))) s += 3000;
    }
    if (p.color === 'white' && Math.abs(tf - kf) + Math.abs(trr - kr) === 1) s += 300;
    if (m === ttMove) s += 100000;
    else if (killers) s += killers[0] === m ? 2000 : killers[1] === m ? 1500 : 0;
    ms.push([s, m]);
  }
  return ms.sort((a, c) => c[0] - a[0]);
}

function negamax(b, color, depth, alpha, beta, ply, ctx) {
  tick();
  if (depth <= 0) return evaluate(b, color, ctx.st);
  const h = hashOf(b, color), e = tt.get(h);
  let ttMove = -1;
  if (e) {
    ttMove = e.move;
    if (e.depth >= depth && ply > 0) {
      const sc = e.score > WIN / 2 ? e.score - ply : e.score < -WIN / 2 ? e.score + ply : e.score;
      if (e.flag === EXACT || (e.flag === LOWER && sc >= beta) || (e.flag === UPPER && sc <= alpha)) return sc;
    }
  }
  const list = movesTafl(b, color);
  if (!list.length) return -WIN + ply;
  const killers = ctx.killers[ply] || (ctx.killers[ply] = []);
  const a0 = alpha;
  let best = -Infinity, bestMove = -1;
  for (const [, m] of ordered(b, list, ttMove, killers)) {
    const u = makeMove(b, m);
    const end = outcome(b, u, color);
    const v = end ? WIN - ply - 1 : -negamax(b, other(color), depth - 1, -beta, -alpha, ply + 1, ctx);
    unmakeMove(b, u);
    if (v > best) { best = v; bestMove = m; }
    if (v > alpha) alpha = v;
    if (alpha >= beta) {
      if (!u.caps.length && killers[0] !== m) { killers[1] = killers[0]; killers[0] = m; }
      break;
    }
  }
  if (tt.size > TT_MAX) tt.clear();
  const stored = best > WIN / 2 ? best + ply : best < -WIN / 2 ? best - ply : best;
  tt.set(h, { depth, score: stored, flag: best <= a0 ? UPPER : best >= beta ? LOWER : EXACT, move: bestMove });
  return best;
}

const FILES = 'abcdefghijk';
const keyOf = (i) => FILES[i % N] + (Math.floor(i / N) + 1);

/** Pick a move for `color` from { pieces }. Returns { from, to, promotion: null }. */
export function chooseMoveTafl(pos, color, level = 3, style = 'balanced', recent = []) {
  const lv = LEVELS_TF[level] || LEVELS_TF[3];
  const st = STYLES[style] || STYLES.balanced;
  const b = toBoard(pos.pieces);
  const list = movesTafl(b, color);
  if (!list.length) return null;
  const done = (m) => ({ from: keyOf(mFrom(m)), to: keyOf(mTo(m)), promotion: null });
  // a winning move at once
  for (const m of list) { const u = makeMove(b, m); const end = outcome(b, u, color); unmakeMove(b, u); if (end) return done(m); }
  let moves = ordered(b, list, -1, null).map(([, m]) => m);
  if (moves.length === 1) return done(moves[0]);
  const bonus = new Map();
  for (const m of moves) {
    let x = Math.random() * lv.noise;
    if (recent.includes(`${keyOf(mTo(m))}>${keyOf(mFrom(m))}`)) x -= 60;
    bonus.set(m, x);
  }
  tt = new Map();
  deadline = lv.budget ? performance.now() + lv.budget : Infinity;
  nodes = 0;
  const ctx = { st, killers: [] };
  let best = moves[0];
  try {
    for (let d = 1; d <= lv.depth; d++) {
      const scored = [];
      let bestTotal = -Infinity, iterBest = null;
      for (const m of moves) {
        const x = bonus.get(m);
        const u = makeMove(b, m);
        let v;
        try {
          if (u.caps.length) v = st.capture; else v = 0;
          const a = iterBest ? bestTotal - x - v : -Infinity;
          v += -negamax(b, other(color), d - 1, -Infinity, a === -Infinity ? Infinity : -a + 1, 1, ctx);
        } finally { unmakeMove(b, u); }
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
  return done(best);
}
