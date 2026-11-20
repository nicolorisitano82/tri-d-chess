// Draughts (checkers) in several national variants, with the same Game interface as the chess
// games (reset, move, legal, resign, flag, snapshot, render, pos, kind), so the server, network
// play, clock, replay, undo, stats and MCP work unchanged.
//
// Squares are algebraic like chess ("a1".."h8", or "a1".."j10" on the 10x10 board); rank 1 is
// White's side. Pieces: { type: 'M' (man) | 'D' (king, "dama"), color }.
// A move is from -> to; a capture may jump several times (its landing squares are in `path`).
// When two capture routes share the same start and end, the first one in the rules' order of
// preference is played (both players and replays get the same one).

// --- variants ----------------------------------------------------------------------------
// dark: which squares are played on. 'odd' = a1 dark (international, English, Russian, Brazilian);
// 'even' = the Italian board, rotated so the dark corner square is on each player's right.
// rule: which capture must be chosen. 'free' = any (complete) sequence; 'max' = the most pieces;
// 'italian' = most pieces, then with the king, then most kings, then the earliest king.
// crown: a man reaching the far rank during a capture: 'stop' (crowned, the move ends),
// 'continue' (crowned, goes on capturing as a king), 'end' (crowned only if the move ends there).
export const VARIANTS = {
  'dama-it':  { name: 'italian', size: 8, rows: 3, first: 'white', dark: 'even', menBack: false, flying: false, rule: 'italian', menTakeKings: false, crown: 'stop' },
  'dama-int': { name: 'international', size: 10, rows: 4, first: 'white', dark: 'odd', menBack: true, flying: true, rule: 'max', menTakeKings: true, crown: 'end' },
  'dama-en':  { name: 'english', size: 8, rows: 3, first: 'black', dark: 'odd', menBack: false, flying: false, rule: 'free', menTakeKings: true, crown: 'stop' },
  'dama-ru':  { name: 'russian', size: 8, rows: 3, first: 'white', dark: 'odd', menBack: true, flying: true, rule: 'free', menTakeKings: true, crown: 'continue' },
  'dama-br':  { name: 'brazilian', size: 8, rows: 3, first: 'white', dark: 'odd', menBack: true, flying: true, rule: 'max', menTakeKings: true, crown: 'end' },
};
export const DRAUGHTS_KINDS = Object.keys(VARIANTS);
export const isDraughts = (k) => Object.prototype.hasOwnProperty.call(VARIANTS, k);

const FILES = 'abcdefghij';
const other = (c) => (c === 'white' ? 'black' : 'white');
const key = (f, r) => FILES[f] + (r + 1);            // f, r: 0-based
const DIRS = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
const KINGS_ONLY_LIMIT = 50;                          // plies with only king moves and no capture: draw

function parse(k, size) {
  const m = /^([a-j])(10|[1-9])$/.exec(String(k || '').trim().toLowerCase());
  if (!m) return null;
  const f = FILES.indexOf(m[1]), r = Number(m[2]) - 1;
  return f < size && r < size ? { f, r } : null;
}
const playable = (v, f, r) => ((f + r) % 2 === 0) === (v.dark === 'odd');

export function initialPieces(v) {
  const p = {};
  for (let r = 0; r < v.size; r++) for (let f = 0; f < v.size; f++) {
    if (!playable(v, f, r)) continue;
    if (r < v.rows) p[key(f, r)] = { type: 'M', color: 'white' };
    else if (r >= v.size - v.rows) p[key(f, r)] = { type: 'M', color: 'black' };
  }
  return p;
}

const lastRank = (v, color) => (color === 'white' ? v.size - 1 : 0);
const forward = (color) => (color === 'white' ? 1 : -1);

// All capture sequences for the piece on `from`. Captured pieces stay on the board (and block)
// until the move ends, and cannot be jumped twice.
function capturesFrom(pos, v, from) {
  const start = parse(from, v.size), piece = pos.pieces[from];
  const out = [];
  const inside = (f, r) => f >= 0 && r >= 0 && f < v.size && r < v.size;
  const at = (f, r) => (key(f, r) === from ? null : pos.pieces[key(f, r)]); // the mover has left its square
  const walk = (f, r, isKing, path, taken, kingsTaken, firstKingAt) => {
    let extended = false;
    for (const [df, dr] of DIRS) {
      if (!isKing && !v.menBack && dr !== forward(piece.color)) continue;
      let cf = f + df, cr = r + dr;
      if (isKing && v.flying) while (inside(cf, cr) && !at(cf, cr)) { cf += df; cr += dr; }
      if (!inside(cf, cr)) continue;
      const victim = at(cf, cr), vk = key(cf, cr);
      if (!victim || victim.color === piece.color || taken.includes(vk)) continue;
      if (!isKing && !v.menTakeKings && victim.type === 'D') continue;
      // landing squares beyond the victim: one for men and short kings, any free run for flying kings
      const nTaken = [...taken, vk];
      const nKings = kingsTaken + (victim.type === 'D' ? 1 : 0);
      const nFirst = firstKingAt ?? (victim.type === 'D' ? taken.length : null);
      const ends = [], goesOn = [];
      let lf = cf + df, lr = cr + dr;
      while (inside(lf, lr) && !at(lf, lr)) {
        const nPath = [...path, key(lf, lr)];
        let crowned = isKing, stop = false;
        if (!isKing && lr === lastRank(v, piece.color)) {
          if (v.crown === 'stop') { crowned = true; stop = true; }
          else if (v.crown === 'continue') crowned = true;
        }
        const before = out.length;
        if (!stop) walk(lf, lr, crowned, nPath, nTaken, nKings, nFirst);
        if (out.length > before) goesOn.push(true);
        else ends.push({ path: nPath, taken: nTaken, kings: nKings, firstKing: nFirst ?? Infinity });
        if (!(isKing && v.flying)) break;
        lf += df; lr += dr;
      }
      // the capture must go on when it can: a landing square that ends it only counts if none continues
      if (!goesOn.length) out.push(...ends);
      extended = true;
    }
    return extended;
  };
  walk(start.f, start.r, piece.type === 'D', [from], [], 0, null);
  return out;
}

function quietFrom(pos, v, from) {
  const { f, r } = parse(from, v.size), piece = pos.pieces[from];
  const out = [];
  for (const [df, dr] of DIRS) {
    if (piece.type === 'M' && dr !== forward(piece.color)) continue;
    let cf = f + df, cr = r + dr;
    while (cf >= 0 && cr >= 0 && cf < v.size && cr < v.size && !pos.pieces[key(cf, cr)]) {
      out.push({ path: [from, key(cf, cr)], taken: [], kings: 0, firstKing: Infinity });
      if (piece.type === 'M' || !v.flying) break;
      cf += df; cr += dr;
    }
  }
  return out;
}

// Legal moves for `color` in position { pieces }: captures are compulsory, filtered by the rule.
export function draughtsMoves(pos, v, color, fromOnly = null) {
  const mine = Object.keys(pos.pieces).filter((k) => pos.pieces[k].color === color);
  let caps = [];
  for (const k of mine) for (const c of capturesFrom(pos, v, k)) caps.push({ ...c, isKing: pos.pieces[k].type === 'D' });
  let list;
  if (caps.length) {
    if (v.rule === 'max' || v.rule === 'italian') {
      const most = Math.max(...caps.map((c) => c.taken.length));
      caps = caps.filter((c) => c.taken.length === most);
    }
    if (v.rule === 'italian') {
      if (caps.some((c) => c.isKing)) caps = caps.filter((c) => c.isKing);
      const kings = Math.max(...caps.map((c) => c.kings));
      caps = caps.filter((c) => c.kings === kings);
      const first = Math.min(...caps.map((c) => c.firstKing));
      caps = caps.filter((c) => c.firstKing === first);
    }
    list = caps;
  } else {
    list = [];
    for (const k of mine) list.push(...quietFrom(pos, v, k));
  }
  const moves = list.map((c) => {
    const from = c.path[0], to = c.path[c.path.length - 1];
    const pc = pos.pieces[from];
    // crowned when the move ends on the far rank, or (Russian) when a capture passes over it
    const last = lastRank(v, pc.color);
    const crown = pc.type === 'M' && (parse(to, v.size).r === last || (v.crown === 'continue' && c.path.some((x) => parse(x, v.size).r === last)));
    return {
      from, to, path: c.path, taken: c.taken,
      piece: pc.type,
      capture: c.taken.length ? pos.pieces[c.taken[0]].type : null,
      captures: c.taken.map((x) => pos.pieces[x].type),
      crown,
      promotion: null,
    };
  });
  return fromOnly ? moves.filter((m) => m.from === fromOnly) : moves;
}

export function applyDraughts(pos, m) {
  const pieces = { ...pos.pieces };
  const pc = pieces[m.from];
  delete pieces[m.from];
  for (const x of m.taken) delete pieces[x];
  pieces[m.to] = m.crown ? { type: 'D', color: pc.color } : pc;
  return { pieces };
}

const posKey = (pos, turn) => turn + ':' + Object.keys(pos.pieces).sort().map((k) => k + pos.pieces[k].color[0] + pos.pieces[k].type).join(',');

export class DraughtsGame {
  constructor(kind = 'dama-it', opts = {}) { this.kind = isDraughts(kind) ? kind : 'dama-it'; this.reset(opts); }

  get variant() { return VARIANTS[this.kind]; }

  reset({ white = 'human', black = 'ai', computer = {} } = {}) {
    const cfg = (c) => ({ level: computer[c]?.level ?? 3, style: computer[c]?.style ?? 'balanced' });
    this.computer = { white: cfg('white'), black: cfg('black') };
    this.id = Math.random().toString(36).slice(2, 10);
    this.pieces = initialPieces(this.variant);
    this.players = { white, black };
    this.turn = this.variant.first;
    this.history = [];
    this.status = 'playing';
    this.drawReason = null;
    this.winner = null;
    this.quiet = 0;                       // plies of king moves without captures
    this.seen = { [posKey(this, this.turn)]: 1 };
    this.version = 0;
    this.startedAt = Date.now();
  }

  get boards() { return {}; }
  get pos() { return { pieces: this.pieces, variant: this.kind }; }

  legal(from = null) {
    if (this.status !== 'playing') return [];
    return draughtsMoves(this, this.variant, this.turn, from);
  }

  // extra: optional path "c3xe5xg7" (or array) to pick one capture route among several
  move(fromStr, toStr, extra = null) {
    if (this.status !== 'playing') throw new Error(`Game is over (${this.status}).`);
    const from = String(fromStr || '').trim().toLowerCase(), to = String(toStr || '').trim().toLowerCase();
    if (!parse(from, this.variant.size)) throw new Error(`Invalid square "${fromStr}".`);
    if (!parse(to, this.variant.size)) throw new Error(`Invalid square "${toStr}".`);
    const pc = this.pieces[from];
    if (!pc) throw new Error(`No piece on ${from}.`);
    if (pc.color !== this.turn) throw new Error(`Piece on ${from} is ${pc.color}, but it is ${this.turn}'s turn.`);
    const all = this.legal();
    let cands = all.filter((m) => m.from === from && m.to === to);
    const want = Array.isArray(extra) ? extra.join('x') : typeof extra === 'string' && extra.includes('x') ? extra.toLowerCase() : null;
    if (want) cands = cands.filter((m) => m.path.join('x') === want).concat(cands.filter((m) => m.path.join('x') !== want));
    if (!cands.length) {
      if (all.some((m) => m.taken.length)) throw new Error(`Capturing is compulsory: ${[...new Set(all.map((m) => m.from))].join(', ')} must capture.`);
      throw new Error(`Illegal move ${from} -> ${to}.`);
    }
    const m = cands[0];
    const mover = this.turn;
    this.pieces = applyDraughts(this, m).pieces;
    this.turn = other(mover);
    this.quiet = m.taken.length || m.piece === 'M' ? 0 : this.quiet + 1;
    const pk = posKey(this, this.turn);
    this.seen[pk] = (this.seen[pk] || 0) + 1;
    const replies = draughtsMoves(this, this.variant, this.turn);
    if (!replies.length) { this.status = 'checkmate'; this.winner = mover; }   // the side to move cannot move: it loses
    else if (this.seen[pk] >= 3) { this.status = 'draw'; this.drawReason = 'repetition'; }
    else if (this.quiet >= KINGS_ONLY_LIMIT) { this.status = 'draw'; this.drawReason = 'fifty'; }
    const notation = m.taken.length ? m.path.join('x') : `${m.from}-${m.to}`;
    const record = {
      n: this.history.length + 1, color: mover, from: m.from, to: m.to, path: m.path,
      piece: m.piece, captured: m.capture, capturedAll: m.captures, crowned: m.crown || undefined,
      promotion: null, check: false, notation: notation + (m.crown ? ' D' : ''), at: Date.now(),
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
      kind: this.kind, variant: this.variant.name, size: this.variant.size,
      id: this.id, version: this.version, turn: this.turn, players: this.players,
      startedAt: this.startedAt, computer: this.computer,
      status: this.status, drawReason: this.drawReason, winner: this.winner, check: false,
      pieces: this.pieces, boards: {}, history: this.history,
      lastMove: this.history[this.history.length - 1] || null,
      legalMoves: this.legal().map(({ from, to, capture, path }) => ({ from, to, capture, path, promotion: null })),
    };
  }

  render() {
    const n = this.variant.size, lines = [];
    const files = FILES.slice(0, n).split('').join(' ');
    lines.push('    ' + files);
    for (let r = n - 1; r >= 0; r--) {
      let row = String(r + 1).padStart(3) + ' ';
      for (let f = 0; f < n; f++) {
        const p = this.pieces[key(f, r)];
        row += (p ? (p.color === 'white' ? (p.type === 'D' ? 'W' : 'w') : (p.type === 'D' ? 'B' : 'b')) : playable(this.variant, f, r) ? '.' : ' ') + ' ';
      }
      lines.push(row + (r + 1));
    }
    lines.push('    ' + files);
    lines.push(`Variant: ${this.variant.name}. w/b = men, W/B = kings. ${this.turn} to move.`);
    return lines.join('\n');
  }
}

export const RULES_TEXT = `DRAUGHTS (checkers). Variants: italian, international (10x10), english (checkers), russian, brazilian.

BOARD: squares are algebraic ("c3", "j10"); rank 1 is White's side. Only the dark squares are used.
MOVES: make_move with from/to, e.g. "c3" -> "d4". A multiple capture is one move from the start square
  to the final square (the engine finds the route). Capturing is compulsory.
MEN move one square diagonally forward. KINGS ("D", crowned on the far rank) move diagonally both ways.
VARIANTS:
  italian (8x8): men capture forward only and cannot capture kings; kings move one square. You must take the
    most pieces, then with a king, then the most kings, then the earliest king. White moves first.
  international (10x10): men capture backwards too; flying kings; take the most pieces; a man is crowned only
    if it ends its move on the far rank.
  english (8x8): men capture forward only; kings move one square; any capture may be chosen (complete it).
    Black moves first.
  russian (8x8): men capture backwards too; flying kings; free choice of capture; a man crowned during a
    capture goes on capturing as a king.
  brazilian (8x8): international rules on an 8x8 board.
END: a player who cannot move (no pieces or all blocked) loses. Draws: threefold repetition, or 50 plies of
  king moves only without captures.`;
