// Computer player for draughts (all variants): iterative-deepening alpha-beta (negamax) with
// killer moves and a time budget. Captures are compulsory, so a position with a capture to play
// is never a leaf: the search goes on while captures are pending (no horizon blunders).
import { VARIANTS, draughtsMoves, applyDraughts } from './draughts.js';
import { STYLES } from './ai.js';

export const LEVELS_DRAUGHTS = {
  1: { depth: 2, noise: 160 },
  2: { depth: 4, noise: 60, budget: 1500 },
  3: { depth: 6, noise: 20, budget: 2500 },
  4: { depth: 8, noise: 6, budget: 3500 },
  5: { depth: 12, noise: 0, budget: 5000 },
};

const other = (c) => (c === 'white' ? 'black' : 'white');
const FILES = 'abcdefghij';
const MATE = 1e6;

function evaluate(pieces, v, me, st) {
  const n = v.size, kingV = v.flying ? 450 : 300;
  let s = 0, mine = 0, theirs = 0;
  for (const k in pieces) {
    const p = pieces[k];
    const f = FILES.indexOf(k[0]), r = Number(k.slice(1)) - 1;
    const adv = p.color === 'white' ? r : n - 1 - r;               // rows advanced
    let val;
    if (p.type === 'D') val = kingV * st.material;
    else {
      val = 100 * st.material + adv * (4 + st.pawnAdv / 2);
      if (adv === 0) val += 10 + st.shelter;                       // back rank guard against crowning
      if (adv >= n - 3) val += 12;                                 // close to crowning
    }
    const centre = Math.min(f, n - 1 - f);
    val += centre * (st.center / 8);
    if (f === 0 || f === n - 1) val -= 4;                          // edge men are less mobile
    if (p.color === me) { s += val; mine++; } else { s -= val; theirs++; }
  }
  // when ahead, trade down
  if (mine > theirs) s += (24 - theirs) * 2;
  else if (theirs > mine) s -= (24 - mine) * 2;
  return s;
}

let deadline = Infinity, nodes = 0;
class Timeout extends Error {}
const tick = () => { if ((++nodes & 255) === 0 && performance.now() > deadline) throw new Timeout(); };
const mkey = (m) => m.path.join('x');

function order(moves, killers) {
  for (const m of moves) m._s = m.taken.length * 1000 + (m.crown ? 500 : 0) + (killers && (killers[0] === mkey(m) ? 300 : killers[1] === mkey(m) ? 200 : 0));
  return moves.sort((a, b) => b._s - a._s);
}

function negamax(pos, v, color, depth, alpha, beta, ply, ctx) {
  tick();
  const moves = draughtsMoves(pos, v, color);
  if (!moves.length) return -MATE + ply;                            // cannot move: lost
  const forcing = moves[0].taken.length > 0;
  if (depth <= 0 && !(forcing && ply < ctx.maxPly)) return evaluate(pos.pieces, v, color, ctx.st);
  const killers = ctx.killers[ply] || (ctx.killers[ply] = []);
  let best = -Infinity;
  for (const m of order(moves, killers)) {
    const v2 = -negamax(applyDraughts(pos, m), v, other(color), depth - 1, -beta, -alpha, ply + 1, ctx);
    if (v2 > best) best = v2;
    if (v2 > alpha) alpha = v2;
    if (alpha >= beta) {
      if (!m.taken.length) { const k = mkey(m); if (killers[0] !== k) { killers[1] = killers[0]; killers[0] = k; } }
      break;
    }
  }
  return best;
}

/** Pick a move for `color` from { pieces, variant }. Returns { from, to, promotion } where
 *  promotion carries the capture route ("c3xe5xg7"), which DraughtsGame.move accepts. */
export function chooseMoveDraughts(pos, color, level = 3, style = 'balanced', recent = []) {
  const v = VARIANTS[pos.variant] || VARIANTS['dama-it'];
  const lv = LEVELS_DRAUGHTS[level] || LEVELS_DRAUGHTS[3];
  const st = STYLES[style] || STYLES.balanced;
  let moves = order(draughtsMoves(pos, v, color));
  if (!moves.length) return null;
  if (moves.length === 1) return { from: moves[0].from, to: moves[0].to, promotion: moves[0].path.join('x') };
  const bonus = new Map();
  for (const m of moves) {
    let b = Math.random() * lv.noise;
    if (m.taken.length) b += st.capture;
    if (recent.includes(`${m.from}>${m.to}`)) b -= 30;
    bonus.set(m, b);
  }
  deadline = lv.budget ? performance.now() + lv.budget : Infinity;
  nodes = 0;
  const ctx = { st, killers: [], maxPly: lv.depth + 12 };
  let best = moves[0];
  try {
    for (let d = 1; d <= lv.depth; d++) {
      ctx.maxPly = d + 12;
      const scored = [];
      let bestTotal = -Infinity, iterBest = null;
      for (const m of moves) {
        const b = bonus.get(m);
        const a = iterBest ? bestTotal - b : -Infinity;
        const val = -negamax(applyDraughts(pos, m), v, other(color), d - 1, -Infinity, a === -Infinity ? Infinity : -a + 1, 1, ctx);
        scored.push({ m, s: val + b });
        if (val + b > bestTotal) { bestTotal = val + b; iterBest = m; }
        best = iterBest;
      }
      scored.sort((x, y) => y.s - x.s);
      moves = scored.map((x) => x.m);
      if (Math.abs(scored[0].s) > MATE / 2) break;                  // a forced win or loss is found
    }
  } catch (e) {
    if (!(e instanceof Timeout)) throw e;
  } finally {
    deadline = Infinity;
  }
  return { from: best.from, to: best.to, promotion: best.path.join('x') };
}
