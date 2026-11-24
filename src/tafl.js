// Hnefatafl (the Viking game) on the 11 x 11 board with the Fetlar rules, with the same Game
// interface as the other games (reset, move, legal, resign, flag, snapshot, render, pos, kind).
// Kind id: 'tafl'.
//
// Squares are written like chess squares, "a1".."k11". The attackers (24) move first and are stored
// as 'white'; the defenders (12) and their king, in the centre, are 'black'. Types: P a warrior,
// K the king.
//
// Every piece moves like a chess rook, never through other pieces. Only the king may stop on the
// throne (f6, the centre) and on the four corners; any piece may pass over the empty throne.
// Capture by sandwiching: an enemy warrior is taken when you move so that it lies between your
// piece and another of yours (or a corner, or the empty throne), on a line; moving between two
// enemies is safe. The king takes part in captures. The king is captured when attackers close it in
// on all four sides (or on three, with the throne as the fourth); on the edge it cannot be taken.
// Defenders win when the king reaches a corner. Attackers win by capturing the king or by
// enclosing every defender so that none can reach the edge. A side with no legal move loses.
// Draws: the same position three times, or 500 plies.

const FILES = 'abcdefghijk';
const N = 11, CELLS = N * N;
const other = (c) => (c === 'white' ? 'black' : 'white');
const keyOf = (i) => FILES[i % N] + (Math.floor(i / N) + 1);
export const THRONE = 5 * N + 5;
export const CORNERS = [0, N - 1, CELLS - N, CELLS - 1];
const isCorner = (i) => i === 0 || i === N - 1 || i === CELLS - N || i === CELLS - 1;
const onEdge = (i) => { const f = i % N, r = (i - f) / N; return f === 0 || r === 0 || f === N - 1 || r === N - 1; };
const PLY_LIMIT = 500;
const DIRS = [1, -1, N, -N];
// neighbour of i in direction d, or -1 off the board
export const step = (i, d) => {
  if (d === 1) return i % N === N - 1 ? -1 : i + 1;
  if (d === -1) return i % N === 0 ? -1 : i - 1;
  const j = i + d;
  return j < 0 || j >= CELLS ? -1 : j;
};

export function parseSq(k) {
  const m = /^([a-k])(1[01]|[1-9])$/.exec(String(k || '').trim().toLowerCase());
  return m ? (Number(m[2]) - 1) * N + FILES.indexOf(m[1]) : -1;
}

export function initialTafl() {
  const p = {};
  const A = ['d1', 'e1', 'f1', 'g1', 'h1', 'f2', 'd11', 'e11', 'f11', 'g11', 'h11', 'f10',
    'a4', 'a5', 'a6', 'a7', 'a8', 'b6', 'k4', 'k5', 'k6', 'k7', 'k8', 'j6'];
  const D = ['f4', 'f5', 'f7', 'f8', 'd6', 'e6', 'g6', 'h6', 'e5', 'g5', 'e7', 'g7'];
  for (const k of A) p[k] = { type: 'P', color: 'white' };
  for (const k of D) p[k] = { type: 'P', color: 'black' };
  p.f6 = { type: 'K', color: 'black' };
  return p;
}
export function toBoard(pieces) {
  const b = new Array(CELLS).fill(null);
  for (const [k, p] of Object.entries(pieces)) { const i = parseSq(k); if (i >= 0) b[i] = { type: p.type, color: p.color }; }
  return b;
}
export function toPieces(b) {
  const p = {};
  for (let i = 0; i < CELLS; i++) if (b[i]) p[keyOf(i)] = { type: b[i].type, color: b[i].color };
  return p;
}
export const findKing = (b) => { for (let i = 0; i < CELLS; i++) if (b[i] && b[i].type === 'K') return i; return -1; };

// moves as integers from * CELLS + to
export const mFrom = (m) => Math.floor(m / CELLS);
export const mTo = (m) => m % CELLS;
export function movesTafl(b, color, out = []) {
  for (let i = 0; i < CELLS; i++) {
    const p = b[i];
    if (!p || p.color !== color) continue;
    const king = p.type === 'K';
    for (const d of DIRS) {
      let j = step(i, d);
      while (j >= 0 && !b[j]) {
        if (king || (j !== THRONE && !isCorner(j))) out.push(i * CELLS + j);
        j = step(j, d);
      }
    }
  }
  return out;
}

// can square j serve as the anvil against a piece of `victim` colour?
const anvil = (b, j, mover) => j >= 0 && ((b[j] && b[j].color === mover) || isCorner(j) || (j === THRONE && !b[j]));

// make the move in place; returns the undo record { from, to, caps: [[i, piece]...], kingTaken }
export function makeMove(b, m) {
  const from = mFrom(m), to = mTo(m), pc = b[from], mover = pc.color;
  b[to] = pc; b[from] = null;
  const caps = [];
  for (const d of DIRS) {
    const n = step(to, d);
    if (n < 0 || !b[n] || b[n].color === mover) continue;
    if (b[n].type === 'K') {
      if (onEdge(n)) continue;
      // the king: attackers (or the empty throne) on all four sides
      let closed = true;
      for (const e of DIRS) { const s = step(n, e); if (!((b[s] && b[s].color === 'white') || s === THRONE)) { closed = false; break; } }
      if (closed) { caps.push([n, b[n]]); b[n] = null; }
      continue;
    }
    if (anvil(b, step(n, d), mover)) { caps.push([n, b[n]]); b[n] = null; }
  }
  return { from, to, caps };
}
export function unmakeMove(b, u) {
  b[u.from] = b[u.to]; b[u.to] = null;
  for (const [i, p] of u.caps) b[i] = p;
}

// attackers' encirclement: no defender can reach the edge through squares free of attackers
export function encircled(b) {
  const seen = new Uint8Array(CELLS), stack = [];
  for (let i = 0; i < CELLS; i++) if (b[i] && b[i].color === 'black') { if (onEdge(i)) return false; seen[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop();
    for (const d of DIRS) {
      const j = step(i, d);
      if (j < 0 || seen[j] || (b[j] && b[j].color === 'white')) continue;
      if (onEdge(j)) return false;
      seen[j] = 1; stack.push(j);
    }
  }
  return true;
}

// the result after `mover` played: 'escape' | 'capture' | 'encircle' | null
export function outcome(b, u, mover) {
  if (mover === 'black') return b[u.to].type === 'K' && isCorner(u.to) ? 'escape' : null;
  if (u.caps.some(([, p]) => p.type === 'K')) return 'capture';
  return encircled(b) ? 'encircle' : null;
}

const posKey = (b, turn) => turn + ':' + b.map((p) => (p ? (p.type === 'K' ? 'K' : p.color[0]) : '.')).join('');

export class TaflGame {
  constructor(opts = {}) { this.kind = 'tafl'; this.reset(opts); }

  reset({ white = 'human', black = 'ai', computer = {} } = {}) {
    const cfg = (c) => ({ level: computer[c]?.level ?? 3, style: computer[c]?.style ?? 'balanced' });
    this.computer = { white: cfg('white'), black: cfg('black') };
    this.id = Math.random().toString(36).slice(2, 10);
    this.pieces = initialTafl();
    this.players = { white, black };
    this.turn = 'white';
    this.history = [];
    this.status = 'playing';
    this.drawReason = null;
    this.endReason = null;
    this.winner = null;
    this.seen = { [posKey(toBoard(this.pieces), this.turn)]: 1 };
    this.version = 0;
    this.startedAt = Date.now();
  }

  get boards() { return {}; }
  get pos() { return { pieces: this.pieces, variant: 'tafl' }; }

  legal(from = null) {
    if (this.status !== 'playing') return [];
    const b = toBoard(this.pieces), out = [];
    for (const m of movesTafl(b, this.turn)) {
      const f = keyOf(mFrom(m));
      if (from && f !== from) continue;
      out.push({ from: f, to: keyOf(mTo(m)), piece: b[mFrom(m)].type, capture: null, promotion: null });
    }
    return out;
  }

  move(fromStr, toStr) {
    if (this.status !== 'playing') throw new Error(`Game is over (${this.status}).`);
    const from = String(fromStr || '').trim().toLowerCase(), to = String(toStr || '').trim().toLowerCase();
    const fi = parseSq(from), ti = parseSq(to);
    if (fi < 0) throw new Error(`Invalid square "${fromStr}".`);
    if (ti < 0) throw new Error(`Invalid square "${toStr}".`);
    const b = toBoard(this.pieces), pc = b[fi];
    const side = (c) => (c === 'white' ? 'the attackers' : 'the defenders');
    if (!pc) throw new Error(`No piece on ${from}.`);
    if (pc.color !== this.turn) throw new Error(`Piece on ${from} belongs to ${side(pc.color)}, but it is ${side(this.turn)}' turn.`);
    const m = fi * CELLS + ti;
    if (!movesTafl(b, this.turn).includes(m)) {
      throw new Error(ti === THRONE || CORNERS.includes(ti) ? `Illegal move ${from} -> ${to}: only the king may stop on the throne and the corners.` : `Illegal move ${from} -> ${to}: pieces move in a straight line over empty squares.`);
    }
    const mover = this.turn;
    const u = makeMove(b, m);
    this.pieces = toPieces(b);
    this.turn = other(mover);
    const pk = posKey(b, this.turn);
    this.seen[pk] = (this.seen[pk] || 0) + 1;
    const end = outcome(b, u, mover);
    if (end) { this.status = 'checkmate'; this.winner = mover; this.endReason = end; }
    else if (!movesTafl(b, this.turn).length) { this.status = 'stalemate'; this.winner = mover; this.endReason = 'blocked'; }
    else if (this.seen[pk] >= 3) { this.status = 'draw'; this.drawReason = 'repetition'; }
    else if (this.history.length + 1 >= PLY_LIMIT) { this.status = 'draw'; this.drawReason = 'plyLimit500'; }
    const captured = u.caps.map(([, p]) => p.type);
    const record = {
      n: this.history.length + 1, color: mover, from, to, piece: pc.type,
      captured: captured[0] || null, capturedAll: captured, capturedAt: u.caps.map(([i]) => keyOf(i)),
      promotion: null, check: false,
      notation: `${pc.type === 'K' ? 'K' : ''}${from}-${to}${u.caps.map(([i]) => 'x' + keyOf(i)).join('')}${end ? '#' : ''}`, at: Date.now(),
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
      status: this.status, drawReason: this.drawReason, endReason: this.endReason, winner: this.winner, check: false,
      pieces: this.pieces, boards: {}, history: this.history,
      lastMove: this.history[this.history.length - 1] || null,
      legalMoves: this.legal().map(({ from, to }) => ({ from, to, capture: null, promotion: null })),
    };
  }

  render() {
    const lines = ['    a b c d e f g h i j k'];
    for (let r = N; r >= 1; r--) {
      let row = String(r).padStart(3) + ' ';
      for (let f = 0; f < N; f++) {
        const i = (r - 1) * N + f, p = this.pieces[FILES[f] + r];
        row += (p ? (p.type === 'K' ? 'K' : p.color === 'white' ? 'A' : 'd') : i === THRONE || isCorner(i) ? '+' : '.') + ' ';
      }
      lines.push(row + r);
    }
    lines.push('    a b c d e f g h i j k');
    lines.push(`A = attacker ("white", moves first), d = defender, K = king ("black"), + = throne / corner. ${this.turn === 'white' ? 'Attackers' : 'Defenders'} to move.`);
    return lines.join('\n');
  }
}

export const RULES_TEXT = `HNEFATAFL (the Viking game, Fetlar rules). 11 x 11 squares "a1".."k11". The 24 ATTACKERS are the "white"
player and move first; the 12 DEFENDERS and their KING (on the throne, f6) are "black".
MOVES: every piece moves like a chess rook (any distance in a straight line over empty squares). Only the
  king may stop on the throne (f6) and on the four corners (a1, k1, a11, k11); anyone may pass over the
  empty throne.
CAPTURE: an enemy warrior is taken when your move leaves it between your piece and another of yours on a
  line (a corner or the empty throne also counts as yours). Moving between two enemies is safe. The king
  can help capture. The KING is taken when attackers stand on all four sides of it (three if the fourth is
  the throne); it can never be taken on the board edge.
WIN: defenders, when the king reaches a corner. Attackers, by capturing the king or by enclosing every
  defender so that none can reach the edge. A side with no legal move loses.
DRAW: the same position three times, or 500 plies.`;
