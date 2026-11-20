// Built-in computer player: iterative-deepening alpha-beta (negamax) with a transposition table,
// a capture search at the horizon, killer moves and a time budget, on top of the rules engine;
// selectable strength and style.
import { legalMoves, pseudoMoves, inCheck, parseSquare, applyMove } from './engine.js';

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
const SQ = new Map();
const sqOf = (k) => { let q = SQ.get(k); if (!q) { q = parseSquare(k); SQ.set(k, q); } return q; };
const FULL_PHASE = 2 * (2 * V.N + 2 * V.B + 2 * V.R + V.Q);       // non-pawn material at the start

// Static evaluation from the point of view of `me`: material, piece placement, pressure on the
// enemy king, bishop pair; in the endgame passed pawns and an active king.
// (Pawn-structure and king-shield terms were tried and played weaker in engine matches.)
function evaluate(pos, me, st) {
  const { pieces } = pos;
  let kw = null, kb = null, phase = 0, bw = 0, bb = 0;
  const pw = [], pb = [];
  for (const k in pieces) {
    const pc = pieces[k];
    if (pc.type === 'K') { if (pc.color === 'white') kw = sqOf(k); else kb = sqOf(k); }
    else if (pc.type === 'P') (pc.color === 'white' ? pw : pb).push(sqOf(k));
    else { phase += V[pc.type]; if (pc.type === 'B') { if (pc.color === 'white') bw++; else bb++; } }
  }
  const kpos = { white: kw, black: kb };
  const end = Math.max(0, Math.min(1, (FULL_PHASE * 0.6 - phase) / (FULL_PHASE * 0.45)));
  let s = 0;
  for (const k in pieces) {
    const pc = pieces[k], sq = sqOf(k), { x, y } = sq;
    let v = V[pc.type] * st.material;
    if (pc.type === 'P') {
      v += (pc.color === 'white' ? y : 9 - y) * st.pawnAdv;
      if (end > 0) {
        const foes = pc.color === 'white' ? pb : pw;
        let passed = true;
        for (const e of foes) if (Math.abs(e.x - x) <= 1 && (pc.color === 'white' ? e.y > y : e.y < y)) { passed = false; break; }
        if (passed) { const adv = pc.color === 'white' ? y - 1 : 8 - y; v += adv * adv * 3 * end; }
      }
    } else if (pc.type === 'K') {
      if (end > 0) v += (4 - Math.max(Math.abs(x - 2.5), Math.abs(y - 4.5))) * 10 * end;
    } else {
      if (x >= 1 && x <= 4 && y >= 3 && y <= 6) v += st.center;
      const enemyK = kpos[other(pc.color)], ownK = kpos[pc.color];
      if (enemyK) v += (9 - dist(sq, enemyK)) * st.attack;
      if (ownK && dist(sq, ownK) <= 2) v += st.shelter;
    }
    s += pc.color === me ? v : -v;
  }
  const pair = (bw >= 2 ? 25 : 0) - (bb >= 2 ? 25 : 0);
  return s + (me === 'white' ? pair : -pair);
}

// --- transposition table --------------------------------------------------------------
// Zobrist-style hash computed per node: each (square, piece, moved), attack board, en passant
// target and side to move maps to two random 32-bit words, XORed together into a 53-bit key.
let seed = 0x2545f491;
const rnd32 = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
const Z = new Map();
const z = (tok) => { let v = Z.get(tok); if (!v) { v = [rnd32(), rnd32() & 0x1fffff]; Z.set(tok, v); } return v; };
function hashPos(pos, color) {
  let a = 0, b = 0, t;
  for (const k in pos.pieces) {
    const p = pos.pieces[k];
    t = z(k + p.type + p.color[0] + (p.moved ? '*' : ''));
    a ^= t[0]; b ^= t[1];
  }
  for (const pin in pos.boards) { t = z('@' + pin + pos.boards[pin][0]); a ^= t[0]; b ^= t[1]; }
  if (pos.ep) { t = z('ep' + pos.ep.victim); a ^= t[0]; b ^= t[1]; }
  if (pos.firstMove) for (const c in pos.firstMove) if (pos.firstMove[c] !== false) { t = z('fm' + c); a ^= t[0]; b ^= t[1]; }
  if (color === 'black') { t = z('side'); a ^= t[0]; b ^= t[1]; }
  return (a >>> 0) * 2097152 + b;
}
const TT = new Map();
const TT_MAX = 400000;
const EXACT = 0, LOWER = 1, UPPER = 2;

// Move ordering: captures by MVV-LVA, promotions, then the killer moves of this ply.
const mkey = (m) => `${m.from}>${m.to}`;
function orderMoves(moves, killers = null, ttMove = null) {
  const score = (m) => (ttMove && mkey(m) === ttMove ? 50000 : 0)
    + (m.capture ? 10000 + V[m.capture] * 10 - (V[m.piece] || 0) : 0) + (m.promotion ? 9000 : 0)
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
  const key = hashPos(pos, color), e = TT.get(key);
  if (e && e.d >= depth) {
    // mate scores are stored relative to this node
    const v = e.s > MATE / 2 ? e.s - ply : e.s < -MATE / 2 ? e.s + ply : e.s;
    if (e.f === EXACT || (e.f === LOWER && v >= beta) || (e.f === UPPER && v <= alpha)) return v;
  }
  const alpha0 = alpha;
  const killers = ctx.killers[ply] || (ctx.killers[ply] = []);
  let best = -Infinity, bestKey = null, legal = 0;
  for (const m of orderMoves(pseudoMoves(pos, color), killers, e && e.m)) {
    const after = apply(pos, m);
    if (inCheck(after, color)) continue;
    legal++;
    const v = -negamax(after, other(color), depth - 1, -beta, -alpha, ply + 1, ctx);
    if (v > best) { best = v; bestKey = mkey(m); }
    if (v > alpha) alpha = v;
    if (alpha >= beta) {
      if (!m.capture) { const k = mkey(m); if (killers[0] !== k) { killers[1] = killers[0]; killers[0] = k; } }
      break;
    }
  }
  if (!legal) return inCheck(pos, color) ? -MATE + ply : 0;
  if (TT.size >= TT_MAX) TT.clear();
  TT.set(key, {
    d: depth, m: bestKey,
    s: best > MATE / 2 ? best + ply : best < -MATE / 2 ? best - ply : best,
    f: best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT,
  });
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
  TT.clear();
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
