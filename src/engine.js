// Tri-dimensional chess engine following Jens Meder's tournament rules
// (https://meder.spacechess.org/3dschach/chess3d.htm), with movable attack boards.
//
// Geometry: every square is identified by file + rank + level, e.g. "a1W", "z0QL1".
//   files  z a b c d e   -> x 0..5
//   ranks  0..9          -> y 0..9
//   main levels (fixed): W (white), N (neutral), B (black)
//   attack-board pins:   QL1..QL6 (queen side, files z-a) and KL1..KL6 (king side, files d-e).
//     An attack board is a 2x2 board sitting on one pin; its squares are named after the pin
//     it currently occupies. Four attack boards exist; when one moves, the pieces on it ride along.
//
// A position is { pieces, boards, ep } where boards maps an occupied pin to the board's owner
// and ep describes a pawn that has just made a double step (en passant target) or is null.
//
// Piece movement is evaluated on the 2D projection (x, y). A move whose projection is legal
// may land on ANY existing level square at the target projection (empty or enemy).
// A piece blocks movement through its file+rank on every level (Meder 3.1c).

export const FILES = ['z', 'a', 'b', 'c', 'd', 'e'];

export const MAIN_LEVELS = {
  W: { x: [1, 4], y: [1, 4], height: 0 },
  N: { x: [1, 4], y: [3, 6], height: 1 },
  B: { x: [1, 4], y: [5, 8], height: 2 },
};

// Pin n on each side: [main level it hangs from, first rank, height]
const PIN_SPECS = {
  1: ['W', 0, 0.5], 2: ['W', 4, 0.5],
  3: ['N', 2, 1.5], 4: ['N', 6, 1.5],
  5: ['B', 4, 2.5], 6: ['B', 8, 2.5],
};
export const PINS = {};
for (const [n, [main, y0, height]] of Object.entries(PIN_SPECS)) {
  PINS[`QL${n}`] = { x: [0, 1], y: [y0, y0 + 1], height, main, side: 'Q', n: Number(n) };
  PINS[`KL${n}`] = { x: [4, 5], y: [y0, y0 + 1], height, main, side: 'K', n: Number(n) };
}
// Pins linked along one side: the next pins of the same or the next main board (Meder 3.6).
// With the sideways link QLn <-> KLn this gives 3/4/5/5/4/3 reachable pins for levels 1..6.
const PIN_LINKS = [[1, 2], [1, 3], [2, 3], [2, 4], [3, 4], [3, 5], [4, 5], [4, 6], [5, 6]];

export const LEVELS = { ...MAIN_LEVELS, ...PINS };
export const LEVEL_NAMES = Object.keys(LEVELS);
export const PIECE_NAMES = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' };
export const PROMOTION_PIECES = ['Q', 'R', 'B', 'N'];

export const isPin = (name) => Object.prototype.hasOwnProperty.call(PINS, name);

export function pinNeighbours(pin) {
  const { side, n } = PINS[pin];
  const out = [];
  for (const [a, b] of PIN_LINKS) {
    if (a === n) out.push(`${side}L${b}`);
    if (b === n) out.push(`${side}L${a}`);
  }
  out.push(`${side === 'Q' ? 'K' : 'Q'}L${n}`); // sideways
  return out;
}

export function levelHas(level, x, y) {
  const l = LEVELS[level];
  return !!l && x >= l.x[0] && x <= l.x[1] && y >= l.y[0] && y <= l.y[1];
}

export function activeLevels(boards) {
  return ['W', 'N', 'B', ...Object.keys(boards)];
}

export function levelsAt(x, y, boards) {
  return activeLevels(boards).filter((lv) => levelHas(lv, x, y));
}

export function sqKey(x, y, level) {
  return `${FILES[x]}${y}${level}`;
}

// Parses a square name against the static geometry (whether that level is in play is checked separately).
export function parseSquare(str) {
  if (typeof str !== 'string') return null;
  const m = /^([zabcde])([0-9])(W|N|B|[QK]L[1-6])$/i.exec(str.trim());
  if (!m) return null;
  const x = FILES.indexOf(m[1].toLowerCase());
  const y = Number(m[2]);
  const level = m[3].toUpperCase();
  if (!levelHas(level, x, y)) return null;
  return { x, y, level, key: sqKey(x, y, level) };
}

export function squaresOf(level) {
  const l = LEVELS[level], out = [];
  for (let x = l.x[0]; x <= l.x[1]; x++)
    for (let y = l.y[0]; y <= l.y[1]; y++) out.push({ x, y, level, key: sqKey(x, y, level) });
  return out;
}

// Every square of the given boards configuration (or of the whole geometry when omitted).
export function allSquares(boards = null) {
  return (boards ? activeLevels(boards) : LEVEL_NAMES).flatMap(squaresOf);
}

const other = (c) => (c === 'white' ? 'black' : 'white');

export function initialBoards() {
  return { QL1: 'white', KL1: 'white', QL6: 'black', KL6: 'black' };
}

export function initialPieces() {
  const p = {};
  const put = (sq, type, color) => { p[sq] = { type, color, moved: false }; };
  // White
  put('z0QL1', 'R', 'white'); put('a0QL1', 'Q', 'white');
  put('z1QL1', 'P', 'white'); put('a1QL1', 'P', 'white');
  put('d0KL1', 'K', 'white'); put('e0KL1', 'R', 'white');
  put('d1KL1', 'P', 'white'); put('e1KL1', 'P', 'white');
  put('a1W', 'N', 'white'); put('b1W', 'B', 'white'); put('c1W', 'B', 'white'); put('d1W', 'N', 'white');
  for (const f of 'abcd') put(`${f}2W`, 'P', 'white');
  // Black
  put('z9QL6', 'R', 'black'); put('a9QL6', 'Q', 'black');
  put('z8QL6', 'P', 'black'); put('a8QL6', 'P', 'black');
  put('d9KL6', 'K', 'black'); put('e9KL6', 'R', 'black');
  put('d8KL6', 'P', 'black'); put('e8KL6', 'P', 'black');
  put('a8B', 'N', 'black'); put('b8B', 'B', 'black'); put('c8B', 'B', 'black'); put('d8B', 'N', 'black');
  for (const f of 'abcd') put(`${f}7B`, 'P', 'black');
  return p;
}

// --- low level helpers -------------------------------------------------------

function columnOccupied(pos, x, y) {
  for (const lv of levelsAt(x, y, pos.boards)) if (pos.pieces[sqKey(x, y, lv)]) return true;
  return false;
}

function inGrid(x, y) {
  return x >= 0 && x <= 5 && y >= 0 && y <= 9;
}

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

// Destinations at projection (tx,ty): empty or enemy squares on any level in play.
function landings(pos, color, tx, ty, { captureOnly = false, quietOnly = false } = {}) {
  const out = [];
  for (const lv of levelsAt(tx, ty, pos.boards)) {
    const k = sqKey(tx, ty, lv);
    const occ = pos.pieces[k];
    if (!occ && !captureOnly) out.push(k);
    else if (occ && occ.color !== color && !quietOnly) out.push(k);
  }
  return out;
}

// Furthest rank a pawn of `color` can reach on file x (Meder 3.4e).
export function promotionRank(pos, color, x) {
  if (x === 2 || x === 3) return color === 'white' ? 8 : 1;          // files b, c
  if (x === 0 || x === 5) return color === 'white' ? 9 : 0;          // files z, e
  // files a, d: the far corner counts only while an attack board overhangs it
  const pin = color === 'white' ? (x === 1 ? 'QL6' : 'KL6') : (x === 1 ? 'QL1' : 'KL1');
  const overhang = !!pos.boards[pin];
  return color === 'white' ? (overhang ? 9 : 8) : (overhang ? 0 : 1);
}

// Piece moves (no castling). Each move is { from, to } plus { ep: victimKey } for en passant.
function pieceMovesFrom(pos, fromKey) {
  const piece = pos.pieces[fromKey];
  if (!piece) return [];
  const { x, y } = parseSquare(fromKey);
  const color = piece.color;
  const targets = [];
  const extra = [];

  const slide = (dirs, maxSteps) => {
    for (const [dx, dy] of dirs) {
      let cx = x, cy = y;
      for (let s = 1; s <= maxSteps; s++) {
        cx += dx; cy += dy;
        if (!inGrid(cx, cy)) break;
        targets.push(...landings(pos, color, cx, cy));
        if (columnOccupied(pos, cx, cy)) break;
      }
    }
  };

  switch (piece.type) {
    case 'R': slide(ORTHO, 10); break;
    case 'B': slide(DIAG, 10); break;
    case 'Q': slide([...ORTHO, ...DIAG], 10); break;
    case 'K': slide([...ORTHO, ...DIAG], 1); break;
    case 'N':
      for (const [dx, dy] of KNIGHT) {
        const tx = x + dx, ty = y + dy;
        if (inGrid(tx, ty)) targets.push(...landings(pos, color, tx, ty));
      }
      break;
    case 'P': {
      const dir = color === 'white' ? 1 : -1;
      const y1 = y + dir;
      if (inGrid(x, y1)) {
        targets.push(...landings(pos, color, x, y1, { quietOnly: true }));
        const y2 = y + 2 * dir;
        if (!piece.moved && !columnOccupied(pos, x, y1) && inGrid(x, y2))
          targets.push(...landings(pos, color, x, y2, { quietOnly: true }));
        for (const dx of [-1, 1])
          if (inGrid(x + dx, y1)) targets.push(...landings(pos, color, x + dx, y1, { captureOnly: true }));
        // en passant: capture the pawn that just double-stepped past (ep.x, ep.y), landing on any level
        const ep = pos.ep;
        if (ep && ep.color !== color && Math.abs(ep.x - x) === 1 && ep.y === y1 && pos.pieces[ep.victim])
          for (const k of landings(pos, color, ep.x, ep.y, { quietOnly: true })) extra.push({ from: fromKey, to: k, ep: ep.victim });
      }
      break;
    }
  }
  return [...targets.filter((t) => t !== fromKey).map((to) => ({ from: fromKey, to })), ...extra];
}

// Castling (Meder 3.5a): king and rook unmoved on the same rank, nothing between them.
// King side: king and rook exchange places. Queen side: the king goes next to the rook
// and the rook goes to the square the king left.
function castlingMoves(pos, color) {
  const kingKey = findKing(pos.pieces, color);
  if (!kingKey) return [];
  const king = pos.pieces[kingKey];
  if (king.moved) return [];
  const k = parseSquare(kingKey);
  const out = [];
  for (const [rKey, rook] of Object.entries(pos.pieces)) {
    if (rook.type !== 'R' || rook.color !== color || rook.moved) continue;
    const r = parseSquare(rKey);
    if (r.y !== k.y) continue;
    const step = Math.sign(r.x - k.x);
    let clear = true;
    for (let x = k.x + step; x !== r.x; x += step) if (columnOccupied(pos, x, k.y)) { clear = false; break; }
    if (!clear) continue;
    if (step > 0) {
      out.push({ from: kingKey, to: rKey, castle: 'K', rookFrom: rKey, rookTo: kingKey });
    } else {
      const lvls = levelsAt(r.x + 1, r.y, pos.boards);
      const lv = lvls.includes(r.level) ? r.level : lvls[0];
      if (!lv) continue;
      const kingTo = sqKey(r.x + 1, r.y, lv);
      if (kingTo === kingKey || pos.pieces[kingTo]) continue;
      out.push({ from: kingKey, to: kingTo, castle: 'Q', rookFrom: rKey, rookTo: kingKey });
    }
  }
  return out;
}

// Pieces standing on the attack board at `pin`.
export function piecesOnBoard(pos, pin) {
  return squaresOf(pin).map((s) => s.key).filter((k) => pos.pieces[k]);
}

// Who may move the board on `pin`: its owner when empty, the owner of the single piece on it otherwise.
export function boardController(pos, pin) {
  const on = piecesOnBoard(pos, pin);
  if (on.length === 0) return pos.boards[pin];
  if (on.length === 1) return pos.pieces[on[0]].color;
  return null;
}

// Board moves (Meder 3.6): to a linked empty pin; an occupied board only forward or sideways,
// an empty board also backwards ("inverted").
function boardMovesFor(pos, color) {
  const out = [];
  for (const pin of Object.keys(pos.boards)) {
    if (boardController(pos, pin) !== color) continue;
    const occupied = piecesOnBoard(pos, pin).length > 0;
    for (const to of pinNeighbours(pin)) {
      if (pos.boards[to]) continue;
      const dy = PINS[to].y[0] - PINS[pin].y[0];
      const backward = color === 'white' ? dy < 0 : dy > 0;
      if (occupied && backward) continue;
      out.push({ from: pin, to, board: true });
    }
  }
  return out;
}

// Pawns that stand on their furthest rank (e.g. after an overhanging board left) are promoted
// before the next move (Meder 3.4e-iii); here automatically to a queen.
function promoteStranded(pos) {
  for (const [k, pc] of Object.entries(pos.pieces)) {
    if (pc.type !== 'P') continue;
    const s = parseSquare(k);
    if (s.y === promotionRank(pos, pc.color, s.x)) pos.pieces[k] = { ...pc, type: 'Q', moved: true };
  }
}

export function applyMove(pos, move) {
  const r = applyMoveInner(pos, move);
  const mover = move.board ? boardController(pos, move.from) : pos.pieces[move.from].color;
  r.pos.firstMove = { ...(pos.firstMove || {}), [mover]: false };
  return r;
}

function applyMoveInner(pos, move) {
  if (move.board) {
    const boards = { ...pos.boards };
    boards[move.to] = boards[move.from];
    delete boards[move.from];
    const pieces = { ...pos.pieces };
    const dx = PINS[move.to].x[0] - PINS[move.from].x[0];
    const dy = PINS[move.to].y[0] - PINS[move.from].y[0];
    for (const s of squaresOf(move.from)) {
      const pc = pos.pieces[s.key];
      if (!pc) continue;
      delete pieces[s.key];
      // a pawn moved by an attack board loses its double step (Meder 3.4b)
      pieces[sqKey(s.x + dx, s.y + dy, move.to)] = pc.type === 'P' ? { ...pc, moved: true } : pc;
    }
    const next = { pieces, boards, ep: null };
    promoteStranded(next);
    return { pos: next, captured: null };
  }
  const pieces = { ...pos.pieces };
  const piece = pieces[move.from];
  if (move.castle) {
    const rook = pieces[move.rookFrom];
    delete pieces[move.from];
    delete pieces[move.rookFrom];
    pieces[move.to] = { ...piece, moved: true };
    pieces[move.rookTo] = { ...rook, moved: true };
    return { pos: { pieces, boards: pos.boards, ep: null }, captured: null };
  }
  let captured = pieces[move.to] || null;
  if (move.ep) { captured = pieces[move.ep]; delete pieces[move.ep]; }
  delete pieces[move.from];
  const moved = { ...piece, moved: true };
  if (move.promotion) moved.type = move.promotion;
  pieces[move.to] = moved;
  let ep = null;
  if (piece.type === 'P') {
    const f = parseSquare(move.from), t = parseSquare(move.to);
    if (Math.abs(t.y - f.y) === 2) ep = { x: f.x, y: (f.y + t.y) / 2, victim: move.to, color: piece.color };
  }
  return { pos: { pieces, boards: pos.boards, ep }, captured };
}

export function findKing(pieces, color) {
  return Object.keys(pieces).find((k) => pieces[k].type === 'K' && pieces[k].color === color);
}

export function isAttacked(pos, targetKey, byColor) {
  for (const k of Object.keys(pos.pieces)) {
    if (pos.pieces[k].color !== byColor) continue;
    if (pieceMovesFrom(pos, k).some((m) => m.to === targetKey)) return true;
  }
  return false;
}

export function inCheck(pos, color) {
  const king = findKing(pos.pieces, color);
  return king ? isAttacked(pos, king, other(color)) : false;
}

// Legal moves for `color`. `from` may be a square (piece moves) or a pin (board moves).
export function legalMoves(pos, color, from = null) {
  const candidates = [];
  const pinFrom = from && isPin(from);
  if (!pinFrom) {
    const keys = from ? [from] : Object.keys(pos.pieces);
    for (const k of keys) {
      const p = pos.pieces[k];
      if (!p || p.color !== color) continue;
      for (const m of pieceMovesFrom(pos, k)) {
        // promotion: one move per piece the pawn may become
        const t = p.type === 'P' && parseSquare(m.to);
        if (t && t.y === promotionRank(pos, color, t.x)) for (const pr of PROMOTION_PIECES) candidates.push({ ...m, promotion: pr });
        else candidates.push(m);
      }
    }
    const kingKey = findKing(pos.pieces, color);
    // Meder 3.5a: castling is not allowed as a player's first move
    if ((!from || from === kingKey) && !pos.firstMove?.[color] && !inCheck(pos, color)) candidates.push(...castlingMoves(pos, color));
  }
  if (!from || pinFrom) candidates.push(...boardMovesFor(pos, color).filter((m) => !from || m.from === from));
  const out = [];
  for (const m of candidates) {
    const { pos: after } = applyMove(pos, m);
    if (inCheck(after, color)) continue;
    if (m.board) out.push({ ...m, piece: null, capture: null, promotion: null });
    else {
      const p = pos.pieces[m.from];
      const capt = m.ep ? 'P' : !m.castle && pos.pieces[m.to] ? pos.pieces[m.to].type : null;
      out.push({ ...m, piece: p.type, capture: capt, promotion: m.promotion || null });
    }
  }
  return out;
}

// No sequence of legal moves can mate (Meder 1.3): bare kings, or only one minor piece,
// or only bishops all on squares of one colour.
export function deadPosition(pos) {
  const minors = [];
  for (const [k, pc] of Object.entries(pos.pieces)) {
    if (pc.type === 'K') continue;
    if (pc.type !== 'B' && pc.type !== 'N') return false;
    minors.push({ type: pc.type, sq: parseSquare(k) });
  }
  if (minors.length <= 1) return true;
  if (minors.every((m) => m.type === 'B')) {
    const colours = new Set(minors.map((m) => (m.sq.x + m.sq.y) % 2));
    return colours.size === 1;
  }
  return false;
}

// Key identifying a position for repetition: pieces with castling/double-step rights,
// boards, side to move and en passant target (Meder 9.2).
function positionKey(pos, turn) {
  const pcs = Object.keys(pos.pieces).sort().map((k) => {
    const p = pos.pieces[k];
    return `${k}${p.color[0]}${p.type}${p.moved ? '' : '*'}`;
  }).join(',');
  const boards = Object.keys(pos.boards).sort().map((p) => `${p}${pos.boards[p][0]}`).join(',');
  return `${turn}|${pcs}|${boards}|${pos.ep ? pos.ep.victim : '-'}`;
}

// --- game object -------------------------------------------------------------

export class Game {
  constructor(opts = {}) {
    this.reset(opts);
  }

  // computer: per-color settings for the built-in engine, e.g. { white: { level: 4, style: 'aggressive' } }
  reset({ white = 'human', black = 'ai', computer = {} } = {}) {
    const cfg = (c) => ({ level: computer[c]?.level ?? 3, style: computer[c]?.style ?? 'balanced' });
    this.computer = { white: cfg('white'), black: cfg('black') };
    this.id = Math.random().toString(36).slice(2, 10);
    this.pieces = initialPieces();
    this.boards = initialBoards();
    this.ep = null;
    this.turn = 'white';
    this.players = { white, black };
    this.history = [];
    this.status = 'playing'; // playing | checkmate | stalemate | draw | resigned | timeout
    this.drawReason = null;  // fifty | repetition | material | time-material
    this.winner = null;
    this.halfmoveClock = 0;
    this.repetitions = { [positionKey(this.pos, 'white')]: 1 };
    this.version = 0;
    this.startedAt = Date.now();
  }

  get pos() {
    const moved = (c) => this.history.some((h) => h.color === c);
    return { pieces: this.pieces, boards: this.boards, ep: this.ep, firstMove: { white: !moved('white'), black: !moved('black') } };
  }

  legal(from = null) {
    if (this.status !== 'playing') return [];
    return legalMoves(this.pos, this.turn, from);
  }

  // from/to: squares, pins (attack-board move) or "0-0" / "0-0-0" (castling).
  // promotion: Q, R, B or N when a pawn reaches its furthest rank (default Q).
  move(fromStr, toStr, promotion = null) {
    if (this.status !== 'playing') throw new Error(`Game is over (${this.status}).`);
    const f = String(fromStr || '').trim().toUpperCase().replace(/O/g, '0');
    const castleSide = f === '0-0' ? 'K' : f === '0-0-0' ? 'Q' : null;
    let mv;
    if (castleSide) {
      mv = this.legal().find((m) => m.castle === castleSide);
      if (!mv) throw new Error(`Castling ${castleSide === 'K' ? 'king' : 'queen'}-side is not legal now.`);
    } else {
      const boardMove = isPin(f);
      let from, to;
      if (boardMove) {
        from = f; to = String(toStr || '').trim().toUpperCase();
        if (!this.boards[from]) throw new Error(`No attack board on pin ${from}.`);
        if (!isPin(to)) throw new Error(`Invalid pin "${toStr}". Pins are QL1..QL6 and KL1..KL6.`);
      } else {
        const fs = parseSquare(String(fromStr)), ts = parseSquare(String(toStr));
        if (!fs) throw new Error(`Invalid square "${fromStr}". Format: file+rank+level, e.g. a2W, d0KL1 — a pin (e.g. QL1) to move an attack board, or 0-0 / 0-0-0 to castle.`);
        if (!ts) throw new Error(`Invalid square "${toStr}". Format: file+rank+level, e.g. a3N, z1QL1.`);
        from = fs.key; to = ts.key;
        const piece = this.pieces[from];
        if (!piece) throw new Error(`No piece on ${from}.`);
        if (piece.color !== this.turn) throw new Error(`Piece on ${from} is ${piece.color}, but it is ${this.turn}'s turn.`);
      }
      const cands = legalMoves(this.pos, this.turn, from).filter((m) => m.to === to);
      if (!cands.length) throw new Error(`Illegal move ${from} -> ${to}.`);
      if (cands.some((m) => m.promotion)) {
        const pr = String(promotion || 'Q').toUpperCase();
        mv = cands.find((m) => m.promotion === pr);
        if (!mv) throw new Error(`Invalid promotion "${promotion}". Choose Q, R, B or N.`);
      } else mv = cands[0];
    }

    const boardMove = !!mv.board;
    const piece = boardMove ? null : this.pieces[mv.from];
    const carried = boardMove ? piecesOnBoard(this.pos, mv.from).map((k) => this.pieces[k].type) : [];
    const { pos, captured } = applyMove(this.pos, mv);
    this.pieces = pos.pieces;
    this.boards = pos.boards;
    this.ep = pos.ep;
    this.halfmoveClock = captured || piece?.type === 'P' ? 0 : this.halfmoveClock + 1;
    const mover = this.turn;
    this.turn = other(this.turn);
    const check = inCheck(this.pos, this.turn);
    const replies = legalMoves(this.pos, this.turn);
    let notation;
    if (mv.castle) notation = mv.castle === 'K' ? '0-0' : '0-0-0';
    else if (boardMove) notation = `${mv.from}→${mv.to}${carried.length ? ` (${carried.join('')})` : ''}`;
    else notation = `${piece.type === 'P' ? '' : piece.type}${mv.from}${captured ? 'x' : '-'}${mv.to}${mv.promotion ? `=${mv.promotion}` : ''}${mv.ep ? ' e.p.' : ''}`;
    const key = positionKey(this.pos, this.turn);
    this.repetitions[key] = (this.repetitions[key] || 0) + 1;
    if (replies.length === 0) {
      if (check) { this.status = 'checkmate'; this.winner = mover; notation += '#'; }
      else this.status = 'stalemate';
    } else {
      if (check) notation += '+';
      if (deadPosition(this.pos)) { this.status = 'draw'; this.drawReason = 'material'; }
      else if (this.repetitions[key] >= 3) { this.status = 'draw'; this.drawReason = 'repetition'; }
      else if (this.halfmoveClock >= 100) { this.status = 'draw'; this.drawReason = 'fifty'; }
    }
    const record = {
      n: this.history.length + 1, color: mover, from: mv.from, to: mv.to, board: boardMove || undefined,
      castle: mv.castle || undefined, rookFrom: mv.rookFrom, rookTo: mv.rookTo, ep: mv.ep ? true : undefined,
      piece: piece ? piece.type : null, captured: captured ? captured.type : null,
      promotion: mv.promotion || null, check, notation, at: Date.now(),
    };
    this.history.push(record);
    this.version++;
    return record;
  }

  // `color` ran out of time. A draw instead when the opponent could never mate (FIDE 6.9).
  flag(color) {
    if (this.status !== 'playing') throw new Error('Game is already over.');
    const opp = other(color);
    const oppOnly = { pieces: Object.fromEntries(Object.entries(this.pieces).filter(([, p]) => p.color === opp || p.type === 'K')), boards: this.boards };
    if (deadPosition(oppOnly)) { this.status = 'draw'; this.drawReason = 'time-material'; }
    else { this.status = 'timeout'; this.winner = opp; }
    this.version++;
  }

  resign(color) {
    if (this.status !== 'playing') throw new Error('Game is already over.');
    this.status = 'resigned';
    this.winner = other(color);
    this.version++;
  }

  snapshot() {
    return {
      id: this.id,
      version: this.version,
      turn: this.turn,
      players: this.players,
      startedAt: this.startedAt,
      computer: this.computer,
      status: this.status,
      drawReason: this.drawReason,
      winner: this.winner,
      check: this.status === 'playing' && inCheck(this.pos, this.turn),
      pieces: this.pieces,
      boards: this.boards,
      history: this.history,
      lastMove: this.history[this.history.length - 1] || null,
      legalMoves: this.legal().map(({ from, to, capture, promotion, board, castle, ep }) => ({
        from, to, capture, promotion,
        ...(board ? { board: true } : {}), ...(castle ? { castle } : {}), ...(ep ? { ep: true } : {}),
      })),
    };
  }

  // Text rendering for AI clients: one grid per level in play, from top to bottom.
  render() {
    const order = activeLevels(this.boards).sort((a, b) => LEVELS[b].height - LEVELS[a].height || LEVELS[b].y[0] - LEVELS[a].y[0]);
    const sym = (p) => (p ? (p.color === 'white' ? p.type : p.type.toLowerCase()) : '.');
    const lines = [];
    for (const lv of order) {
      const L = LEVELS[lv];
      const tag = isPin(lv) ? ` — attack board owned by ${this.boards[lv]}, movable by ${boardController(this.pos, lv) || 'nobody (2+ pieces)'}` : '';
      lines.push(`Level ${lv} (files ${FILES[L.x[0]]}-${FILES[L.x[1]]}, ranks ${L.y[0]}-${L.y[1]})${tag}:`);
      for (let y = L.y[1]; y >= L.y[0]; y--) {
        let row = `  ${y} `;
        for (let x = L.x[0]; x <= L.x[1]; x++) row += ' ' + sym(this.pieces[sqKey(x, y, lv)]);
        lines.push(row);
      }
      let foot = '    ';
      for (let x = L.x[0]; x <= L.x[1]; x++) foot += ' ' + FILES[x];
      lines.push(foot);
    }
    const free = Object.keys(PINS).filter((p) => !this.boards[p]);
    lines.push(`Empty pins: ${free.join(' ')}`);
    if (this.ep) lines.push(`En passant possible on file ${FILES[this.ep.x]} rank ${this.ep.y} (pawn ${this.ep.victim})`);
    return lines.join('\n');
  }
}

export const RULES_TEXT = `TRI-D CHESS (Jens Meder's tournament rules)

BOARD: 3 fixed main boards + 4 movable attack boards.
  Main boards (4x4, files a-d): W = white (ranks 1-4, lowest), N = neutral (ranks 3-6), B = black (ranks 5-8, highest).
  Attack boards (2x2) sit on pins. There are 12 pins:
    queen side (files z-a): QL1..QL6, king side (files d-e): KL1..KL6
    pin 1: ranks 0-1 (by W)   pin 2: ranks 4-5 (by W)   pin 3: ranks 2-3 (by N)
    pin 4: ranks 6-7 (by N)   pin 5: ranks 4-5 (by B)   pin 6: ranks 8-9 (by B)
  Start: white boards on QL1 and KL1, black boards on QL6 and KL6. Squares of an attack board are named after its current pin.
  Files from left to right: z a b c d e. Ranks 0 (white side) .. 9 (black side).

SQUARE NAMES: file + rank + level, e.g. "a2W", "c5N", "d0KL1", "z9QL6". The same file+rank can exist on several levels.

PIECE MOVES: project the board flat onto a 6x10 grid. A move is legal if it is a legal chess move on that projection;
  the piece may then land on ANY level in play that has a square at the target file+rank (empty or enemy).
  A piece blocks movement through its file+rank on every level. Knights jump. Purely vertical moves are not allowed.
  Pawns: forward one (two on their first move, path empty), capture diagonally forward. White moves towards rank 9.
  En passant: a pawn that has just made a double step may be captured by an adjacent pawn as if it had moved one square,
    on the very next move only; the capturing pawn may land on either level.
  A pawn carried by an attack board loses its double step.
  Promotion (to Q, R, B or N, pass promotion in make_move): on the furthest rank of the file —
    files b,c: rank 8 (white) / 1 (black); files z,e: 9 / 0; files a,d: 9 / 0 if an attack board overhangs that corner, else 8 / 1.
    A pawn left on its furthest rank when an overhanging board moves away is promoted to a queen.

CASTLING (not as a player's first move; king and rook unmoved, same rank, nothing between them, king not in check and not landing in check):
  king side "0-0": king and rook exchange places. Queen side "0-0-0": the king goes next to the rook, the rook to the king's square.
  make_move with from "0-0" or "0-0-0" (to is ignored), or move the king onto its castling square.

ATTACK BOARD MOVES (a whole turn): make_move with from = current pin, to = target pin (e.g. from "QL1" to "QL3").
  Linked pins on the same side: 1-2, 1-3, 2-3, 2-4, 3-4, 3-5, 4-5, 4-6, 5-6; plus sideways QLn <-> KLn.
  The target pin must be empty. The board carries the pieces on it.
  It may be moved when empty (by its owner) or carrying exactly ONE piece (by that piece's owner).
  An occupied board moves only forward or sideways; only an empty board may move backwards. The move must not leave your own king in check.

END: check, checkmate and stalemate as in normal chess. Draws: threefold repetition, no mating material, 50-move rule.
PIECES in text render: uppercase = white, lowercase = black. K king, Q queen, R rook, B bishop, N knight, P pawn.`;
