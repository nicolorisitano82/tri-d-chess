// Xiangqi (Chinese chess) with the same Game interface as the other games (reset, move, legal,
// resign, flag, snapshot, render, pos, kind), so the server, network play, clock, replay, undo,
// stats and MCP work unchanged.
//
// The board is 9 files x 10 ranks of intersections, written like chess squares: "a1".."i10".
// Rank 1 is Red's side; Red is stored as 'white' (moves first), Black as 'black'.
// Pieces: K general, A advisor, E elephant, H horse, R chariot, C cannon, P soldier.
//
// Rules: generals and advisors stay in the palace (d-f, ranks 1-3 / 8-10); elephants move two
// points diagonally, cannot cross the river and are blocked by a piece on the midpoint ("elephant
// eye"); the horse moves one point straight then one diagonally outward, blocked by a piece on the
// first point ("hobbling the horse"); the cannon moves like a chariot but captures by jumping
// exactly one piece (the screen); soldiers move one point forward, and also sideways once across
// the river. The two generals may never face each other on an open file ("flying general").
// A player with no legal move loses (checkmate or stalemate). Draws: threefold repetition,
// 120 plies without a capture, or no attacking pieces left on either side.

const FILES = 'abcdefghi';
const NF = 9, NR = 10;
const other = (c) => (c === 'white' ? 'black' : 'white');
const idx = (f, r) => r * NF + f;
const keyOf = (i) => FILES[i % NF] + (Math.floor(i / NF) + 1);
const NO_CAPTURE_LIMIT = 120;

export function parseXq(k) {
  const m = /^([a-i])(10|[1-9])$/.exec(String(k || '').trim().toLowerCase());
  return m ? idx(FILES.indexOf(m[1]), Number(m[2]) - 1) : -1;
}

export const XQ_VALUES = { K: 0, A: 200, E: 200, H: 400, R: 900, C: 450, P: 100 };

export function initialXq() {
  const p = {};
  const back = 'RHEAKAEHR';
  for (let f = 0; f < 9; f++) {
    p[FILES[f] + 1] = { type: back[f], color: 'white' };
    p[FILES[f] + 10] = { type: back[f], color: 'black' };
  }
  for (const f of ['b', 'h']) { p[f + 3] = { type: 'C', color: 'white' }; p[f + 8] = { type: 'C', color: 'black' }; }
  for (const f of ['a', 'c', 'e', 'g', 'i']) { p[f + 4] = { type: 'P', color: 'white' }; p[f + 7] = { type: 'P', color: 'black' }; }
  return p;
}

// --- fast board: array of 90 cells, each null or { type, color } ---------------------------------
export function toBoard(pieces) {
  const b = new Array(90).fill(null);
  for (const k in pieces) { const i = parseXq(k); if (i >= 0) b[i] = pieces[k]; }
  return b;
}
export function toPieces(b) {
  const p = {};
  for (let i = 0; i < 90; i++) if (b[i]) p[keyOf(i)] = b[i];
  return p;
}

const inPalace = (f, r, color) => f >= 3 && f <= 5 && (color === 'white' ? r >= 0 && r <= 2 : r >= 7 && r <= 9);
const ownSide = (r, color) => (color === 'white' ? r <= 4 : r >= 5);
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const HORSE = [[1, 2, 0, 1], [-1, 2, 0, 1], [1, -2, 0, -1], [-1, -2, 0, -1], [2, 1, 1, 0], [2, -1, 1, 0], [-2, 1, -1, 0], [-2, -1, -1, 0]]; // df, dr, leg df, leg dr
const ok = (f, r) => f >= 0 && f < NF && r >= 0 && r < NR;

// Pseudo-legal moves (ignoring checks) of the piece on i, pushed as [from, to].
function pieceMoves(b, i, out) {
  const p = b[i], f = i % NF, r = (i - f) / NF, c = p.color;
  const push = (tf, tr) => { const t = b[idx(tf, tr)]; if (!t || t.color !== c) out.push(i, idx(tf, tr)); };
  switch (p.type) {
    case 'K':
      for (const [df, dr] of ORTH) { const tf = f + df, tr = r + dr; if (inPalace(tf, tr, c)) push(tf, tr); }
      break;
    case 'A':
      for (const [df, dr] of DIAG) { const tf = f + df, tr = r + dr; if (inPalace(tf, tr, c)) push(tf, tr); }
      break;
    case 'E':
      for (const [df, dr] of DIAG) {
        const tf = f + 2 * df, tr = r + 2 * dr;
        if (ok(tf, tr) && ownSide(tr, c) && !b[idx(f + df, r + dr)]) push(tf, tr);
      }
      break;
    case 'H':
      for (const [df, dr, lf, lr] of HORSE) {
        const tf = f + df, tr = r + dr;
        if (ok(tf, tr) && !b[idx(f + lf, r + lr)]) push(tf, tr);
      }
      break;
    case 'R':
      for (const [df, dr] of ORTH) {
        let tf = f + df, tr = r + dr;
        while (ok(tf, tr)) { const t = b[idx(tf, tr)]; if (t) { if (t.color !== c) out.push(i, idx(tf, tr)); break; } out.push(i, idx(tf, tr)); tf += df; tr += dr; }
      }
      break;
    case 'C':
      for (const [df, dr] of ORTH) {
        let tf = f + df, tr = r + dr;
        while (ok(tf, tr) && !b[idx(tf, tr)]) { out.push(i, idx(tf, tr)); tf += df; tr += dr; }
        tf += df; tr += dr;                                       // jump the screen
        while (ok(tf, tr)) { const t = b[idx(tf, tr)]; if (t) { if (t.color !== c) out.push(i, idx(tf, tr)); break; } tf += df; tr += dr; }
      }
      break;
    case 'P': {
      const fw = c === 'white' ? 1 : -1;
      if (ok(f, r + fw)) push(f, r + fw);
      if (!ownSide(r, c)) for (const df of [-1, 1]) if (ok(f + df, r)) push(f + df, r);
      break;
    }
  }
}

export function findGeneral(b, color) {
  for (let i = 0; i < 90; i++) { const p = b[i]; if (p && p.type === 'K' && p.color === color) return i; }
  return -1;
}

// Is the point i attacked by `by`? (includes the flying-general rule)
export function attacked(b, i, by) {
  const f = i % NF, r = (i - f) / NF;
  // chariots, cannons and the facing general along the four lines
  for (const [df, dr] of ORTH) {
    let tf = f + df, tr = r + dr, screens = 0;
    while (ok(tf, tr)) {
      const t = b[idx(tf, tr)];
      if (t) {
        if (screens === 0) {
          if (t.color === by && (t.type === 'R' || (t.type === 'K' && df === 0))) return true;
          if (t.color === by && t.type === 'P' && Math.abs(tf - f) + Math.abs(tr - r) === 1) {
            const fw = by === 'white' ? 1 : -1;
            if (tr - r === -fw || (dr === 0 && !ownSide(tr, by))) return true;  // soldier in front, or beside after the river
          }
          screens = 1;
        } else {
          if (t.color === by && t.type === 'C') return true;
          break;
        }
      }
      tf += df; tr += dr;
    }
  }
  // horses: a horse at (f+df, r+dr) reaches i if its own leg (next to the horse, towards i) is free
  for (const [df, dr, lf, lr] of HORSE) {
    const hf = f - df, hr = r - dr;
    if (!ok(hf, hr)) continue;
    const h = b[idx(hf, hr)];
    if (h && h.color === by && h.type === 'H' && !b[idx(hf + lf, hr + lr)]) return true;
  }
  return false;
}

export function inCheck(b, color) {
  const k = findGeneral(b, color);
  return k < 0 || attacked(b, k, other(color));
}

// Legal moves for color as [from, to, from, to, ...] (flat array of indexes).
export function legalXq(b, color) {
  const pseudo = [];
  for (let i = 0; i < 90; i++) if (b[i] && b[i].color === color) pieceMoves(b, i, pseudo);
  const out = [];
  for (let k = 0; k < pseudo.length; k += 2) {
    const from = pseudo[k], to = pseudo[k + 1], cap = b[to];
    b[to] = b[from]; b[from] = null;
    if (!inCheck(b, color)) out.push(from, to);
    b[from] = b[to]; b[to] = cap;
  }
  return out;
}

// Only captures (for the computer's quiescence search); legality is checked the same way.
export function capturesXq(b, color) {
  const pseudo = [];
  for (let i = 0; i < 90; i++) if (b[i] && b[i].color === color) pieceMoves(b, i, pseudo);
  const out = [];
  for (let k = 0; k < pseudo.length; k += 2) {
    const from = pseudo[k], to = pseudo[k + 1], cap = b[to];
    if (!cap) continue;
    b[to] = b[from]; b[from] = null;
    if (!inCheck(b, color)) out.push(from, to);
    b[from] = b[to]; b[to] = cap;
  }
  return out;
}

const posKey = (b, turn) => turn + ':' + b.map((p) => (p ? (p.color === 'white' ? p.type : p.type.toLowerCase()) : '.')).join('');
const attackers = (b) => b.some((p) => p && 'RHCP'.includes(p.type));

export class XiangqiGame {
  constructor(opts = {}) { this.kind = 'xiangqi'; this.reset(opts); }

  reset({ white = 'human', black = 'ai', computer = {} } = {}) {
    const cfg = (c) => ({ level: computer[c]?.level ?? 3, style: computer[c]?.style ?? 'balanced' });
    this.computer = { white: cfg('white'), black: cfg('black') };
    this.id = Math.random().toString(36).slice(2, 10);
    this.pieces = initialXq();
    this.players = { white, black };
    this.turn = 'white';
    this.history = [];
    this.status = 'playing';
    this.drawReason = null;
    this.winner = null;
    this.quiet = 0;
    this.seen = { [posKey(toBoard(this.pieces), this.turn)]: 1 };
    this.check = false;
    this.version = 0;
    this.startedAt = Date.now();
  }

  get boards() { return {}; }
  get pos() { return { pieces: this.pieces, variant: 'xiangqi' }; }

  legal(from = null) {
    if (this.status !== 'playing') return [];
    const b = toBoard(this.pieces), l = legalXq(b, this.turn), out = [];
    for (let k = 0; k < l.length; k += 2) {
      const f = keyOf(l[k]);
      if (from && f !== from) continue;
      out.push({ from: f, to: keyOf(l[k + 1]), piece: b[l[k]].type, capture: b[l[k + 1]]?.type || null, promotion: null });
    }
    return out;
  }

  move(fromStr, toStr) {
    if (this.status !== 'playing') throw new Error(`Game is over (${this.status}).`);
    const from = String(fromStr || '').trim().toLowerCase(), to = String(toStr || '').trim().toLowerCase();
    const fi = parseXq(from), ti = parseXq(to);
    if (fi < 0) throw new Error(`Invalid point "${fromStr}".`);
    if (ti < 0) throw new Error(`Invalid point "${toStr}".`);
    const b = toBoard(this.pieces), pc = b[fi];
    if (!pc) throw new Error(`No piece on ${from}.`);
    if (pc.color !== this.turn) throw new Error(`Piece on ${from} is ${pc.color === 'white' ? 'red' : 'black'}, but it is ${this.turn === 'white' ? 'red' : 'black'}'s turn.`);
    const l = legalXq(b, this.turn);
    let found = false;
    for (let k = 0; k < l.length; k += 2) if (l[k] === fi && l[k + 1] === ti) { found = true; break; }
    if (!found) throw new Error(inCheck(b, this.turn) ? `Illegal move ${from} -> ${to}: your general is in check.` : `Illegal move ${from} -> ${to}.`);
    const mover = this.turn, captured = b[ti]?.type || null;
    b[ti] = pc; b[fi] = null;
    this.pieces = toPieces(b);
    this.turn = other(mover);
    this.quiet = captured ? 0 : this.quiet + 1;
    this.check = inCheck(b, this.turn);
    const pk = posKey(b, this.turn);
    this.seen[pk] = (this.seen[pk] || 0) + 1;
    if (!legalXq(b, this.turn).length) { this.status = this.check ? 'checkmate' : 'stalemate'; this.winner = mover; }  // no move: that side loses
    else if (this.seen[pk] >= 3) { this.status = 'draw'; this.drawReason = 'repetition'; }
    else if (this.quiet >= NO_CAPTURE_LIMIT) { this.status = 'draw'; this.drawReason = 'noCapture'; }
    else if (!attackers(b)) { this.status = 'draw'; this.drawReason = 'material'; }
    const record = {
      n: this.history.length + 1, color: mover, from, to, piece: pc.type, captured,
      promotion: null, check: this.check,
      notation: `${pc.type}${from}${captured ? 'x' : '-'}${to}${this.status === 'checkmate' || this.status === 'stalemate' ? '#' : this.check ? '+' : ''}`, at: Date.now(),
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
      pieces: this.pieces, boards: {}, history: this.history,
      lastMove: this.history[this.history.length - 1] || null,
      legalMoves: this.legal().map(({ from, to, capture }) => ({ from, to, capture, promotion: null })),
    };
  }

  render() {
    const lines = ['    a b c d e f g h i'];
    for (let r = 9; r >= 0; r--) {
      let row = String(r + 1).padStart(3) + ' ';
      for (let f = 0; f < 9; f++) {
        const p = this.pieces[FILES[f] + (r + 1)];
        row += (p ? (p.color === 'white' ? p.type : p.type.toLowerCase()) : '.') + ' ';
      }
      lines.push(row + (r + 1));
      if (r === 5) lines.push('    ~~~~~ river ~~~~~');
    }
    lines.push('    a b c d e f g h i');
    lines.push(`UPPERCASE = Red (moves first, "white"), lowercase = Black. ${this.turn === 'white' ? 'Red' : 'Black'} to move.`);
    return lines.join('\n');
  }
}

export const RULES_TEXT = `XIANGQI (Chinese chess). 9 files x 10 ranks of points, "a1".."i10"; rank 1 is Red's side.
Red is the "white" player and moves first. Between ranks 5 and 6 runs the river; each side has a palace
(files d-f, ranks 1-3 for Red, 8-10 for Black).
PIECES (letters used in moves and the board text):
  K general: one point orthogonally, inside the palace. The two generals may never face each other on an
    open file (flying general).
  A advisor: one point diagonally, inside the palace.
  E elephant: exactly two points diagonally, never across the river; blocked by a piece on the midpoint.
  H horse: one point orthogonally then one diagonally outward; blocked by a piece on the first point.
  R chariot: any distance orthogonally (like a chess rook).
  C cannon: moves like a chariot, but captures only by jumping exactly one piece (the screen).
  P soldier: one point forward; after crossing the river also one point sideways. Never backwards.
MOVES: make_move with from/to points, e.g. "h3" -> "e3" (cannon to the centre). You may not leave your
  general in check (including facing the other general).
END: a player with no legal move loses (checkmate or stalemate). Draws: threefold repetition, 120 plies
  without a capture, or no attacking pieces (R, H, C, P) left on either side.`;
