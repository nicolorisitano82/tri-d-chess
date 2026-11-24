// Shogi (Japanese chess) with the same Game interface as the other games (reset, move, legal,
// resign, flag, snapshot, render, pos, kind), so the server, network play, clock, replay, undo,
// stats and MCP work unchanged. Kind id: 'shogi'.
//
// The board is 9 x 9 squares written like chess squares, "a1".."i9": file a is shogi file 9 and
// file i is file 1 (as seen by Sente), rank 1 is Sente's back rank. Sente (moves first) is stored
// as 'white', Gote as 'black'.
// Pieces: K king, R rook, B bishop, G gold, S silver, N knight, L lance, P pawn; promoted pieces
// carry a "+": "R+" dragon, "B+" horse, "S+", "N+", "L+", "P+" (tokin) move like a gold.
// Captured pieces change side and go to the capturer's hand (unpromoted); instead of moving, a
// player may drop a piece from the hand on any empty square. A drop is written from "w*P" (Sente's
// hand, a pawn) or "b*R" (Gote's hand, a rook) to the square.
//
// Rules: the last three ranks are the promotion zone; a piece that moves into, out of or inside
// it may promote (move(..., '+')), and must when it could not move again (pawn and lance on the last
// rank, knight on the last two). Drops: never where the piece could not move again, no second
// unpromoted pawn on a file (nifu), no pawn drop that gives checkmate (uchifuzume).
// A player with no legal move loses. Draws: the same position four times (sennichite), or 500 plies.

const FILES = 'abcdefghi';
const N = 9;
const other = (c) => (c === 'white' ? 'black' : 'white');
const keyOf = (i) => FILES[i % N] + (Math.floor(i / N) + 1);
const PLY_LIMIT = 500;
export const HAND_TYPES = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];
const PROMOTES = { R: 'R+', B: 'B+', S: 'S+', N: 'N+', L: 'L+', P: 'P+' };
export const baseOf = (t) => (t.length > 1 ? t[0] : t);

export function parseSq(k) {
  const m = /^([a-i])([1-9])$/.exec(String(k || '').trim().toLowerCase());
  return m ? (Number(m[2]) - 1) * N + FILES.indexOf(m[1]) : -1;
}
// "w*P" -> { color: 'white', type: 'P' }
export function parseDrop(k) {
  const m = /^([wb])\*([RBGSNLP])$/i.exec(String(k || '').trim());
  return m ? { color: m[1].toLowerCase() === 'w' ? 'white' : 'black', type: m[2].toUpperCase() } : null;
}
export const dropKey = (color, type) => `${color[0]}*${type}`;

export const SHOGI_VALUES = { K: 0, P: 100, L: 300, N: 350, S: 500, G: 550, B: 800, R: 1000, 'P+': 550, 'L+': 550, 'N+': 550, 'S+': 550, 'B+': 1050, 'R+': 1250 };

// step moves in Sente's frame (dr > 0 = forward)
const GOLD = [[0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1]];
const KING = [[0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1], [1, -1], [-1, -1]];
const STEPS = {
  K: KING, G: GOLD, 'S+': GOLD, 'N+': GOLD, 'L+': GOLD, 'P+': GOLD,
  S: [[0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]],
  P: [[0, 1]], N: [[1, 2], [-1, 2]],
  'R+': [[1, 1], [-1, 1], [1, -1], [-1, -1]], 'B+': [[0, 1], [1, 0], [-1, 0], [0, -1]],
  R: [], B: [], L: [],
};
const ORTH = [[0, 1], [1, 0], [-1, 0], [0, -1]], DIAG = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
const SLIDES = { R: ORTH, 'R+': ORTH, B: DIAG, 'B+': DIAG, L: [[0, 1]] };

export function initialShogi() {
  const p = {};
  const back = 'LNSGKGSNL';
  for (let f = 0; f < N; f++) {
    p[FILES[f] + 1] = { type: back[f], color: 'white' };
    p[FILES[f] + 3] = { type: 'P', color: 'white' };
    p[FILES[f] + 9] = { type: back[f], color: 'black' };
    p[FILES[f] + 7] = { type: 'P', color: 'black' };
  }
  p.b2 = { type: 'B', color: 'white' }; p.h2 = { type: 'R', color: 'white' };
  p.h8 = { type: 'B', color: 'black' }; p.b8 = { type: 'R', color: 'black' };
  return p;
}
export const emptyHands = () => ({ white: Object.fromEntries(HAND_TYPES.map((t) => [t, 0])), black: Object.fromEntries(HAND_TYPES.map((t) => [t, 0])) });

export function toBoard(pieces) {
  const b = new Array(81).fill(null);
  for (const [k, p] of Object.entries(pieces)) { const i = parseSq(k); if (i >= 0) b[i] = { type: p.type, color: p.color }; }
  return b;
}
export function toPieces(b) {
  const p = {};
  for (let i = 0; i < 81; i++) if (b[i]) p[keyOf(i)] = { type: b[i].type, color: b[i].color };
  return p;
}
const cloneHands = (h) => ({ white: { ...h.white }, black: { ...h.black } });

const inZone = (r, color) => (color === 'white' ? r >= 6 : r <= 2);
// rows a piece still needs ahead of it to move again
const deadRow = (type, r, color) => {
  const rr = color === 'white' ? r : 8 - r;        // 0 = own back rank .. 8 = far rank
  return ((type === 'P' || type === 'L') && rr === 8) || (type === 'N' && rr >= 7);
};

export function findKing(b, color) {
  for (let i = 0; i < 81; i++) { const p = b[i]; if (p && p.type === 'K' && p.color === color) return i; }
  return -1;
}

// is square i attacked by `by`?
export function attacked(b, i, by) {
  const f = i % N, r = (i - f) / N, d = by === 'white' ? 1 : -1;
  // step attackers: a piece at (f - df, r - dr*d) that steps (df, dr)
  for (const [df, dr0] of KING) {
    const ff = f - df, rr = r - dr0 * d;
    if (ff < 0 || ff >= N || rr < 0 || rr >= N) continue;
    const p = b[rr * N + ff];
    if (p && p.color === by && STEPS[p.type].some(([a, c]) => a === df && c === dr0)) return true;
  }
  for (const df of [1, -1]) {                        // knights
    const ff = f - df, rr = r - 2 * d;
    if (ff < 0 || ff >= N || rr < 0 || rr >= N) continue;
    const p = b[rr * N + ff];
    if (p && p.color === by && p.type === 'N') return true;
  }
  // sliders: walk outward from i; the first piece found must slide back along that ray
  for (const [df, dr] of [...ORTH, ...DIAG]) {
    let ff = f + df, rr = r + dr;
    while (ff >= 0 && ff < N && rr >= 0 && rr < N) {
      const p = b[rr * N + ff];
      if (p) {
        if (p.color === by) {
          const orth = df === 0 || dr === 0;
          if (orth && (p.type === 'R' || p.type === 'R+')) return true;
          if (!orth && (p.type === 'B' || p.type === 'B+')) return true;
          if (p.type === 'L' && df === 0 && dr === -d) return true;   // lance moves +d toward i
        }
        break;
      }
      ff += df; rr += dr;
    }
  }
  return false;
}
export const inCheck = (b, color) => { const k = findKing(b, color); return k >= 0 && attacked(b, k, other(color)); };

// Moves are integers: from * 162 + to * 2 + promote, where from 81..87 is a drop of HAND_TYPES[from - 81].
export const mFrom = (m) => Math.floor(m / 162);
export const mTo = (m) => (m >> 1) % 81;
export const mPromo = (m) => m & 1;
const enc = (from, to, promo) => from * 162 + to * 2 + (promo ? 1 : 0);

export function pseudoMoves(b, hands, color, out = []) {
  const d = color === 'white' ? 1 : -1;
  const add = (from, to, type, fr, tr) => {
    const canPromote = PROMOTES[type] && (inZone(fr, color) || inZone(tr, color));
    if (canPromote) out.push(enc(from, to, 1));
    if (!canPromote || !deadRow(type, tr, color)) out.push(enc(from, to, 0));
  };
  for (let i = 0; i < 81; i++) {
    const p = b[i];
    if (!p || p.color !== color) continue;
    const f = i % N, r = (i - f) / N;
    for (const [df, dr] of STEPS[p.type]) {
      const ff = f + df, rr = r + dr * d;
      if (ff < 0 || ff >= N || rr < 0 || rr >= N) continue;
      const q = b[rr * N + ff];
      if (q && q.color === color) continue;
      add(i, rr * N + ff, p.type, r, rr);
    }
    const sl = SLIDES[p.type];
    if (sl) for (const [df, dr0] of sl) {
      const dr = dr0 * d;
      let ff = f + df, rr = r + dr;
      while (ff >= 0 && ff < N && rr >= 0 && rr < N) {
        const q = b[rr * N + ff];
        if (q && q.color === color) break;
        add(i, rr * N + ff, p.type, r, rr);
        if (q) break;
        ff += df; rr += dr;
      }
    }
  }
  // drops
  const hand = hands[color];
  let pawnFiles = null;
  for (let h = 0; h < HAND_TYPES.length; h++) {
    const type = HAND_TYPES[h];
    if (!hand[type]) continue;
    if (type === 'P' && !pawnFiles) {
      pawnFiles = new Array(N).fill(false);
      for (let i = 0; i < 81; i++) { const p = b[i]; if (p && p.color === color && p.type === 'P') pawnFiles[i % N] = true; }
    }
    for (let i = 0; i < 81; i++) {
      if (b[i]) continue;
      const r = Math.floor(i / N);
      if (deadRow(type, r, color)) continue;
      if (type === 'P' && pawnFiles[i % N]) continue;
      out.push(enc(81 + h, i, 0));
    }
  }
  return out;
}

// make / unmake in place; returns an undo record
export function makeMove(b, hands, color, m) {
  const from = mFrom(m), to = mTo(m);
  if (from >= 81) {
    const type = HAND_TYPES[from - 81];
    hands[color][type]--;
    b[to] = { type, color };
    return { drop: type, to };
  }
  const pc = b[from], cap = b[to];
  if (cap) hands[color][baseOf(cap.type)]++;
  b[to] = mPromo(m) ? { type: PROMOTES[pc.type], color } : pc;
  b[from] = null;
  return { from, to, pc, cap };
}
export function unmakeMove(b, hands, color, u) {
  if (u.drop) { b[u.to] = null; hands[color][u.drop]++; return; }
  b[u.from] = u.pc;
  b[u.to] = u.cap;
  if (u.cap) hands[color][baseOf(u.cap.type)]--;
}

export function legalShogi(b, hands, color, checkDropMate = true) {
  const out = [];
  for (const m of pseudoMoves(b, hands, color)) {
    const u = makeMove(b, hands, color, m);
    let ok = !inCheck(b, color);
    // uchifuzume: a pawn drop may not give checkmate
    if (ok && checkDropMate && u.drop === 'P') {
      const them = other(color), k = findKing(b, them);
      const r = Math.floor(u.to / N), kr = Math.floor(k / N);
      if (k >= 0 && k % N === u.to % N && kr === r + (color === 'white' ? 1 : -1) && !legalShogi(b, hands, them, false).length) ok = false;
    }
    unmakeMove(b, hands, color, u);
    if (ok) out.push(m);
  }
  return out;
}

export function perft(b, hands, color, depth) {
  const ms = legalShogi(b, hands, color);
  if (depth === 1) return ms.length;
  let n = 0;
  for (const m of ms) { const u = makeMove(b, hands, color, m); n += perft(b, hands, other(color), depth - 1); unmakeMove(b, hands, color, u); }
  return n;
}

const posKey = (b, hands, turn) => turn + ':' + b.map((p) => (p ? (p.color === 'white' ? p.type : p.type.toLowerCase()) : '.')).join('')
  + ':' + HAND_TYPES.map((t) => hands.white[t]).join('') + HAND_TYPES.map((t) => hands.black[t]).join('');

export const moveKeys = (m, color) => {
  const from = mFrom(m);
  return { from: from >= 81 ? dropKey(color, HAND_TYPES[from - 81]) : keyOf(from), to: keyOf(mTo(m)), promotion: mPromo(m) ? '+' : null };
};

export class ShogiGame {
  constructor(opts = {}) { this.kind = 'shogi'; this.reset(opts); }

  reset({ white = 'human', black = 'ai', computer = {} } = {}) {
    const cfg = (c) => ({ level: computer[c]?.level ?? 3, style: computer[c]?.style ?? 'balanced' });
    this.computer = { white: cfg('white'), black: cfg('black') };
    this.id = Math.random().toString(36).slice(2, 10);
    this.pieces = initialShogi();
    this.hands = emptyHands();
    this.players = { white, black };
    this.turn = 'white';
    this.history = [];
    this.status = 'playing';
    this.drawReason = null;
    this.winner = null;
    this.seen = { [posKey(toBoard(this.pieces), this.hands, this.turn)]: 1 };
    this.check = false;
    this.version = 0;
    this.startedAt = Date.now();
  }

  get boards() { return {}; }
  get pos() { return { pieces: this.pieces, hands: this.hands, variant: 'shogi' }; }

  legal(from = null) {
    if (this.status !== 'playing') return [];
    const b = toBoard(this.pieces), hands = cloneHands(this.hands), out = [];
    for (const m of legalShogi(b, hands, this.turn)) {
      const k = moveKeys(m, this.turn);
      if (from && k.from !== from) continue;
      const fi = mFrom(m);
      out.push({ ...k, piece: fi >= 81 ? HAND_TYPES[fi - 81] : b[fi].type, capture: b[mTo(m)]?.type || null, drop: fi >= 81 });
    }
    return out;
  }

  move(fromStr, toStr, promotion = null) {
    if (this.status !== 'playing') throw new Error(`Game is over (${this.status}).`);
    const fromRaw = String(fromStr || '').trim(), to = String(toStr || '').trim().toLowerCase();
    const drop = parseDrop(fromRaw);
    const from = drop ? dropKey(drop.color, drop.type) : fromRaw.toLowerCase();
    const ti = parseSq(to);
    if (ti < 0) throw new Error(`Invalid square "${toStr}".`);
    const b = toBoard(this.pieces), hands = cloneHands(this.hands);
    let fi;
    if (drop) {
      if (drop.color !== this.turn) throw new Error(`It is ${this.turn === 'white' ? 'Sente' : 'Gote'}'s turn: drop from "${this.turn[0]}*${drop.type}".`);
      if (!hands[this.turn][drop.type]) throw new Error(`No ${drop.type} in hand.`);
      fi = 81 + HAND_TYPES.indexOf(drop.type);
    } else {
      fi = parseSq(from);
      if (fi < 0) throw new Error(`Invalid square "${fromStr}" (a drop is written like "w*P").`);
      if (!b[fi]) throw new Error(`No piece on ${from}.`);
      if (b[fi].color !== this.turn) throw new Error(`Piece on ${from} belongs to ${b[fi].color === 'white' ? 'Sente' : 'Gote'}, but it is ${this.turn === 'white' ? 'Sente' : 'Gote'}'s turn.`);
    }
    const want = promotion === true || /^(\+|y|yes|p|promote|true|1)$/i.test(String(promotion ?? ''));
    const legal = legalShogi(b, hands, this.turn).filter((m) => mFrom(m) === fi && mTo(m) === ti);
    if (!legal.length) throw new Error(inCheck(b, this.turn) ? `Illegal move ${from} -> ${to}: your king is in check.` : `Illegal move ${from} -> ${to}.`);
    const m = legal.find((x) => !!mPromo(x) === want) ?? legal[0];   // a forced promotion happens anyway
    const mover = this.turn, pc = fi >= 81 ? { type: HAND_TYPES[fi - 81], color: mover } : b[fi];
    const captured = b[ti]?.type || null;
    makeMove(b, hands, mover, m);
    this.pieces = toPieces(b);
    this.hands = hands;
    this.turn = other(mover);
    this.check = inCheck(b, this.turn);
    const pk = posKey(b, hands, this.turn);
    this.seen[pk] = (this.seen[pk] || 0) + 1;
    if (!legalShogi(b, hands, this.turn).length) { this.status = this.check ? 'checkmate' : 'stalemate'; this.winner = mover; }
    else if (this.seen[pk] >= 4) { this.status = 'draw'; this.drawReason = 'sennichite'; }
    else if (this.history.length + 1 >= PLY_LIMIT) { this.status = 'draw'; this.drawReason = 'plyLimit500'; }
    const promo = !!mPromo(m), couldPromote = legal.length > 1;
    const record = {
      n: this.history.length + 1, color: mover, from, to, piece: pc.type, captured, drop: fi >= 81,
      promotion: promo ? '+' : null, check: this.check,
      notation: fi >= 81 ? `${pc.type}*${to}` : `${pc.type}${from}${captured ? 'x' : '-'}${to}${promo ? '+' : couldPromote ? '=' : ''}`, at: Date.now(),
    };
    this.history.push(record);
    this.version++;
    return record;
  }

  resign(color) {
    if (this.status !== 'playing') throw new Error('Game is already over.');
    this.status = 'resigned';
    this.winner = other(color);
    this.version++;
  }

  flag(color) {
    if (this.status !== 'playing') throw new Error('Game is already over.');
    this.status = 'timeout';
    this.winner = other(color);
    this.version++;
  }

  snapshot() {
    return {
      kind: this.kind, id: this.id, version: this.version, turn: this.turn, players: this.players,
      startedAt: this.startedAt, computer: this.computer,
      status: this.status, drawReason: this.drawReason, winner: this.winner, check: this.check,
      pieces: this.pieces, hands: this.hands, boards: {}, history: this.history,
      lastMove: this.history[this.history.length - 1] || null,
      legalMoves: this.legal().map(({ from, to, capture, promotion, drop }) => ({ from, to, capture, promotion, drop })),
    };
  }

  render() {
    const sym = (p) => (p ? (p.color === 'white' ? p.type : p.type.toLowerCase()).padEnd(2) : '. ');
    const lines = ['    a  b  c  d  e  f  g  h  i'];
    for (let r = 9; r >= 1; r--) {
      let row = String(r).padStart(3) + ' ';
      for (let f = 0; f < N; f++) row += sym(this.pieces[FILES[f] + r]) + ' ';
      lines.push(row + r);
    }
    lines.push('    a  b  c  d  e  f  g  h  i');
    const hand = (c) => HAND_TYPES.filter((t) => this.hands[c][t]).map((t) => `${t}x${this.hands[c][t]}`).join(' ') || '-';
    lines.push(`Sente hand (drop from "w*X"): ${hand('white')}   Gote hand ("b*X"): ${hand('black')}`);
    lines.push(`UPPERCASE = Sente (moves first, "white", starts on ranks 1-3), lowercase = Gote. ${this.turn === 'white' ? 'Sente' : 'Gote'} to move.`);
    return lines.join('\n');
  }
}

export const RULES_TEXT = `SHOGI (Japanese chess). 9 x 9 squares "a1".."i9"; rank 1 is Sente's back rank. Sente is the "white"
player and moves first; Gote is "black". (File a is shogi file 9, file i is file 1.)
PIECES (letters used in the board text; promoted pieces carry "+"):
  K king: one square any way.  G gold: one square orthogonally or diagonally forward.
  S silver: one square diagonally or straight forward.  N knight: two forward and one sideways, jumping
  (forward only).  L lance: any distance straight forward.  P pawn: one square forward (captures the same way).
  R rook / B bishop: like in chess. R+ dragon = rook + one diagonal step; B+ horse = bishop + one
  orthogonal step. S+, N+, L+, P+ (tokin) move like a gold.
PROMOTION: the last three ranks are the promotion zone. A move into, out of or inside it may promote
  (make_move with promotion "+"); pawns and lances on the last rank and knights on the last two must.
CAPTURES go to your hand. Instead of moving you may DROP a piece from your hand on any empty square:
  make_move from "w*P" (Sente drops a pawn) or "b*R" (Gote drops a rook) to the square. Not where it
  could never move, not a second unpromoted pawn on a file, not a pawn drop that gives checkmate.
END: a player with no legal move loses (checkmate). Draws: the same position four times, or 500 plies.`;
