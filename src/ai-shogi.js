// Computer player for shogi: iterative-deepening alpha-beta (negamax) with a capture search at the
// horizon, a transposition table, killer moves and a time budget, on the 81-cell array board of
// shogi.js (make / unmake in place, hands included). Same levels and styles as the other games.
import { toBoard, pseudoMoves, legalShogi, makeMove, unmakeMove, inCheck, findKing, moveKeys, mFrom, mTo, mPromo, HAND_TYPES, SHOGI_VALUES } from './shogi.js';
import { STYLES } from './ai.js';

export const LEVELS_SH = {
  1: { depth: 1, qdepth: 0, noise: 250 },
  2: { depth: 2, qdepth: 2, noise: 80, budget: 1500 },
  3: { depth: 3, qdepth: 4, noise: 25, budget: 2500 },
  4: { depth: 4, qdepth: 4, noise: 8, budget: 3500 },
  5: { depth: 6, qdepth: 6, noise: 0, budget: 5000 },
};

const other = (c) => (c === 'white' ? 'black' : 'white');
const MATE = 1e6;
const N = 9;
const HAND_VALUE = { R: 1150, B: 950, G: 620, S: 570, N: 400, L: 340, P: 115 };   // a piece in hand is flexible

function evaluate(b, hands, me, st) {
  let s = 0;
  const king = { white: findKing(b, 'white'), black: findKing(b, 'black') };
  for (let i = 0; i < 81; i++) {
    const p = b[i];
    if (!p || p.type === 'K') continue;
    const f = i % N, r = (i - f) / N, rr = p.color === 'white' ? r : 8 - r;   // ranks advanced 0..8
    let v = SHOGI_VALUES[p.type] * st.material;
    if (p.type === 'P') v += rr * st.pawnAdv * 0.6;
    if (p.type === 'S' || p.type === 'G' || p.type === 'N') v += Math.min(rr, 5) * 4;
    if (p.type === 'R' || p.type === 'B') v += (4 - Math.abs(f - 4)) * 2;
    // defenders near the own king, attackers near the enemy king
    const own = king[p.color], their = king[other(p.color)];
    if (own >= 0 && (p.type === 'G' || p.type === 'S')) {
      const kf = own % N, kr = (own - kf) / N;
      if (Math.max(Math.abs(kf - f), Math.abs(kr - r)) <= 2) v += 18 + st.shelter * 2;
    }
    if (their >= 0) {
      const kf = their % N, kr = (their - kf) / N;
      v += (8 - Math.max(Math.abs(kf - f), Math.abs(kr - r))) * st.attack * (p.type.length > 1 || 'RBS'.includes(p.type) ? 0.9 : 0.3);
    }
    s += p.color === me ? v : -v;
  }
  for (const t of HAND_TYPES) s += (hands[me][t] - hands[other(me)][t]) * HAND_VALUE[t] * st.material;
  // king shelter: the king likes a castle away from the centre files with its own pieces around it
  for (const c of ['white', 'black']) {
    const k = king[c];
    if (k < 0) continue;
    const kf = k % N, kr = (k - kf) / N, krr = c === 'white' ? kr : 8 - kr;
    let v = (krr === 0 ? 20 : krr === 1 ? 10 : -krr * 12) + (Math.abs(kf - 4) >= 2 ? 15 : 0);
    s += c === me ? v : -v;
  }
  return s;
}

// --- transposition table (Zobrist hash of the 81 cells, the hands and the side to move) --------
const TYPES = ['K', 'R', 'B', 'G', 'S', 'N', 'L', 'P', 'R+', 'B+', 'S+', 'N+', 'L+', 'P+'];
const TI = Object.fromEntries(TYPES.map((t, i) => [t, i]));
const rnd = () => [(Math.random() * 2 ** 32) >>> 0, (Math.random() * 2 ** 21) >>> 0];
const Z = Array.from({ length: 81 * 28 }, rnd);
const ZH = Array.from({ length: 2 * 7 * 19 }, rnd);
function hashOf(b, hands, color) {
  let lo = color === 'white' ? 0x9e3779b9 : 0, hi = 0;
  for (let i = 0; i < 81; i++) if (b[i]) { const z = Z[(TI[b[i].type] + (b[i].color === 'white' ? 0 : 14)) * 81 + i]; lo ^= z[0]; hi ^= z[1]; }
  for (let c = 0; c < 2; c++) for (let t = 0; t < 7; t++) { const n = hands[c ? 'black' : 'white'][HAND_TYPES[t]]; if (n) { const z = ZH[(c * 7 + t) * 19 + n]; lo ^= z[0]; hi ^= z[1]; } }
  return hi * 2 ** 32 + (lo >>> 0);
}
const TT_MAX = 400000;
let tt = new Map();
const EXACT = 0, LOWER = 1, UPPER = 2;

let deadline = Infinity, nodes = 0;
class Timeout extends Error {}
const tick = () => { if ((++nodes & 1023) === 0 && performance.now() > deadline) throw new Timeout(); };

const pieceAt = (b, m) => { const f = mFrom(m); return f >= 81 ? HAND_TYPES[f - 81] : b[f].type; };
function ordered(b, list, ttMove, killers) {
  const ms = [];
  for (const m of list) {
    const cap = b[mTo(m)];
    let s = cap ? 10000 + SHOGI_VALUES[cap.type] * 10 - SHOGI_VALUES[pieceAt(b, m)] / 10 : 0;
    if (mPromo(m)) s += 3000;
    if (m === ttMove) s += 100000;
    else if (!cap && killers) s += killers[0] === m ? 8000 : killers[1] === m ? 7000 : 0;
    if (mFrom(m) >= 81) s -= 50;                     // try board moves before the many drops
    ms.push([s, m]);
  }
  return ms.sort((a, c) => c[0] - a[0]);
}

function quiesce(b, hands, color, alpha, beta, qd, ctx) {
  tick();
  const stand = evaluate(b, hands, color, ctx.st);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (qd <= 0) return stand;
  const caps = [];
  for (const m of pseudoMoves(b, { white: {}, black: {} }, color)) if (b[mTo(m)]) caps.push(m);   // board captures only
  for (const [, m] of ordered(b, caps, -1, null)) {
    const u = makeMove(b, hands, color, m);
    if (inCheck(b, color)) { unmakeMove(b, hands, color, u); continue; }
    const v = -quiesce(b, hands, other(color), -beta, -alpha, qd - 1, ctx);
    unmakeMove(b, hands, color, u);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function negamax(b, hands, color, depth, alpha, beta, ply, ctx) {
  tick();
  const check = inCheck(b, color);
  if (check) depth++;
  if (depth <= 0) return quiesce(b, hands, color, alpha, beta, ctx.qdepth, ctx);
  const h = hashOf(b, hands, color), e = tt.get(h);
  let ttMove = -1;
  if (e) {
    ttMove = e.move;
    if (e.depth >= depth && ply > 0) {
      const sc = e.score > MATE / 2 ? e.score - ply : e.score < -MATE / 2 ? e.score + ply : e.score;
      if (e.flag === EXACT || (e.flag === LOWER && sc >= beta) || (e.flag === UPPER && sc <= alpha)) return sc;
    }
  }
  const killers = ctx.killers[ply] || (ctx.killers[ply] = []);
  const a0 = alpha;
  let best = -Infinity, bestMove = -1, any = false;
  for (const [, m] of ordered(b, pseudoMoves(b, hands, color), ttMove, killers)) {
    const u = makeMove(b, hands, color, m);
    if (inCheck(b, color)) { unmakeMove(b, hands, color, u); continue; }
    any = true;
    const v = -negamax(b, hands, other(color), depth - 1, -beta, -alpha, ply + 1, ctx);
    unmakeMove(b, hands, color, u);
    if (v > best) { best = v; bestMove = m; }
    if (v > alpha) alpha = v;
    if (alpha >= beta) {
      if (!u.cap && killers[0] !== m) { killers[1] = killers[0]; killers[0] = m; }
      break;
    }
  }
  if (!any) return -MATE + ply;
  if (tt.size > TT_MAX) tt.clear();
  const stored = best > MATE / 2 ? best + ply : best < -MATE / 2 ? best - ply : best;
  tt.set(h, { depth, score: stored, flag: best <= a0 ? UPPER : best >= beta ? LOWER : EXACT, move: bestMove });
  return best;
}

/** Pick a move for `color` from { pieces, hands }. Returns { from, to, promotion }. */
export function chooseMoveShogi(pos, color, level = 3, style = 'balanced', recent = []) {
  const lv = LEVELS_SH[level] || LEVELS_SH[3];
  const st = STYLES[style] || STYLES.balanced;
  const b = toBoard(pos.pieces);
  const hands = { white: { ...pos.hands.white }, black: { ...pos.hands.black } };
  const list = legalShogi(b, hands, color);
  if (!list.length) return null;
  let moves = ordered(b, list, -1, null).map(([, m]) => m);
  const done = (m) => moveKeys(m, color);
  if (moves.length === 1) return done(moves[0]);
  const bonus = new Map();
  for (const m of moves) {
    const k = moveKeys(m, color);
    let x = Math.random() * lv.noise;
    if (b[mTo(m)]) x += st.capture;
    if (recent.includes(`${k.to}>${k.from}`)) x -= 30;
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
        const x = bonus.get(m);
        const u = makeMove(b, hands, color, m);
        let v;
        try {
          v = inCheck(b, other(color)) ? st.check : 0;
          const a = iterBest ? bestTotal - x - v : -Infinity;
          v += -negamax(b, hands, other(color), d - 1, -Infinity, a === -Infinity ? Infinity : -a + 1, 1, ctx);
        } finally { unmakeMove(b, hands, color, u); }
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
