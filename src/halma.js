// Chinese checkers for two players, with the same Game interface as the other games (reset, move,
// legal, resign, flag, snapshot, render, pos, kind), so the server, network play, clock, replay,
// undo, stats and MCP work unchanged. Kind id: 'cinese'.
//
// The board is the six-pointed star of 121 holes. Internally a hole is a cube coordinate
// (x, y, z) with x + y + z = 0 that lies in one of the two big triangles: all of x, y, z >= -4,
// or all of them <= 4. Its name is file + rank like a chess square: the file letter is x + 8
// ('a'..'q') and the rank is z + 9 (1..17), so White's home point is at the bottom (ranks 1-4)
// and Black's at the top (ranks 14-17). Example: the bottom tip is "m1", the top tip "e17".
//
// Each side has 10 marbles in its home point. A move is either one step to an adjacent empty hole,
// or a chain of hops: jump over one adjacent marble (of either colour) into the empty hole just
// beyond it, as many times as wished; nothing is captured. You win when every hole of the opposite
// point is filled and at least one of them by your marbles (so the opponent cannot block it by
// staying at home). Draw after 400 plies.

const FILES = 'abcdefghijklmnopq';
const other = (c) => (c === 'white' ? 'black' : 'white');
export const CC_DIRS = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]];
const PLY_LIMIT = 400;

export const inStar = (x, z) => {
  const y = -x - z;
  return (x >= -4 && y >= -4 && z >= -4) || (x <= 4 && y <= 4 && z <= 4);
};
export const ccKey = (x, z) => FILES[x + 8] + (z + 9);
export function ccParse(k) {
  const m = /^([a-q])(1[0-7]|[1-9])$/.exec(String(k || '').trim().toLowerCase());
  if (!m) return null;
  const x = FILES.indexOf(m[1]) - 8, z = Number(m[2]) - 9;
  return inStar(x, z) ? { x, z } : null;
}

export const HOLES = [];
for (let z = -8; z <= 8; z++) for (let x = -8; x <= 8; x++) if (inStar(x, z)) HOLES.push(ccKey(x, z));
// home points: White starts at the bottom (z <= -5) and goes to the top (z >= 5)
export const HOME = { white: HOLES.filter((k) => ccParse(k).z <= -5), black: HOLES.filter((k) => ccParse(k).z >= 5) };
export const TARGET = { white: HOME.black, black: HOME.white };

// neighbours and hop targets of each hole, precomputed: [[adjacent, beyond], ...]
export const LINKS = {};
for (const k of HOLES) {
  const { x, z } = ccParse(k);
  LINKS[k] = CC_DIRS.map(([dx, , dz]) => {
    const a = inStar(x + dx, z + dz) ? ccKey(x + dx, z + dz) : null;
    const b = a && inStar(x + 2 * dx, z + 2 * dz) ? ccKey(x + 2 * dx, z + 2 * dz) : null;
    return [a, b];
  }).filter(([a]) => a);
}

export function initialCC() {
  const p = {};
  for (const k of HOME.white) p[k] = { type: 'M', color: 'white' };
  for (const k of HOME.black) p[k] = { type: 'M', color: 'black' };
  return p;
}

// All destinations of the marble on `from`: { to: path[] } (path includes from and to).
export function destinations(pieces, from) {
  const out = new Map();
  for (const [a] of LINKS[from]) if (!pieces[a]) out.set(a, [from, a]);
  // hops: breadth-first over landing holes (the moving marble has left `from`)
  const seen = new Set([from]);
  const queue = [[from, [from]]];
  while (queue.length) {
    const [at, path] = queue.shift();
    for (const [a, b] of LINKS[at]) {
      if (!b || seen.has(b)) continue;
      const over = a === from ? null : pieces[a];
      if (!over || (pieces[b] && b !== from)) continue;
      seen.add(b);
      const p = [...path, b];
      if (!out.has(b)) out.set(b, p);
      queue.push([b, p]);
    }
  }
  return out;
}

export function ccMoves(pieces, color) {
  const out = [];
  for (const k in pieces) {
    if (pieces[k].color !== color) continue;
    for (const [to, path] of destinations(pieces, k)) out.push({ from: k, to, path });
  }
  return out;
}

export function hasWon(pieces, color) {
  let mine = 0;
  for (const k of TARGET[color]) { const p = pieces[k]; if (!p) return false; if (p.color === color) mine++; }
  return mine > 0;
}

const posKey = (pieces, turn) => turn + ':' + Object.keys(pieces).sort().map((k) => k + pieces[k].color[0]).join(',');

export class HalmaGame {
  constructor(opts = {}) { this.kind = 'cinese'; this.reset(opts); }

  reset({ white = 'human', black = 'ai', computer = {} } = {}) {
    const cfg = (c) => ({ level: computer[c]?.level ?? 3, style: computer[c]?.style ?? 'balanced' });
    this.computer = { white: cfg('white'), black: cfg('black') };
    this.id = Math.random().toString(36).slice(2, 10);
    this.pieces = initialCC();
    this.players = { white, black };
    this.turn = 'white';
    this.history = [];
    this.status = 'playing';
    this.drawReason = null;
    this.winner = null;
    this.seen = { [posKey(this.pieces, this.turn)]: 1 };
    this.version = 0;
    this.startedAt = Date.now();
  }

  get boards() { return {}; }
  get pos() { return { pieces: this.pieces, variant: 'cinese' }; }

  legal(from = null) {
    if (this.status !== 'playing') return [];
    const all = ccMoves(this.pieces, this.turn);
    return (from ? all.filter((m) => m.from === from) : all).map((m) => ({ ...m, piece: 'M', capture: null, promotion: null }));
  }

  move(fromStr, toStr) {
    if (this.status !== 'playing') throw new Error(`Game is over (${this.status}).`);
    const from = String(fromStr || '').trim().toLowerCase(), to = String(toStr || '').trim().toLowerCase();
    if (!ccParse(from)) throw new Error(`Invalid hole "${fromStr}".`);
    if (!ccParse(to)) throw new Error(`Invalid hole "${toStr}".`);
    const pc = this.pieces[from];
    if (!pc) throw new Error(`No marble on ${from}.`);
    if (pc.color !== this.turn) throw new Error(`Marble on ${from} is ${pc.color}, but it is ${this.turn}'s turn.`);
    const path = destinations(this.pieces, from).get(to);
    if (!path) throw new Error(`Illegal move ${from} -> ${to}: step to a next hole, or hop over marbles.`);
    const mover = this.turn;
    const pieces = { ...this.pieces };
    delete pieces[from];
    pieces[to] = pc;
    this.pieces = pieces;
    this.turn = other(mover);
    const pk = posKey(pieces, this.turn);
    this.seen[pk] = (this.seen[pk] || 0) + 1;
    if (hasWon(pieces, mover)) { this.status = 'checkmate'; this.winner = mover; }
    else if (!ccMoves(pieces, this.turn).length) { this.status = 'checkmate'; this.winner = mover; }
    else if (this.seen[pk] >= 3) { this.status = 'draw'; this.drawReason = 'repetition'; }
    else if (this.history.length + 1 >= PLY_LIMIT) { this.status = 'draw'; this.drawReason = 'plyLimit'; }
    const record = {
      n: this.history.length + 1, color: mover, from, to, path, piece: 'M', captured: null,
      promotion: null, check: false, notation: path.length > 2 ? path.join('x') : `${from}-${to}`, at: Date.now(),
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
      status: this.status, drawReason: this.drawReason, winner: this.winner, check: false,
      pieces: this.pieces, boards: {}, history: this.history,
      lastMove: this.history[this.history.length - 1] || null,
      legalMoves: this.legal().map(({ from, to, path }) => ({ from, to, path, capture: null, promotion: null })),
    };
  }

  render() {
    const lines = [];
    for (let z = 8; z >= -8; z--) {
      let row = String(z + 9).padStart(3) + ' ' + ' '.repeat(z + 8);
      for (let x = -8; x <= 8; x++) {
        if (!inStar(x, z)) { row += '  '; continue; }
        const p = this.pieces[ccKey(x, z)];
        row += (p ? (p.color === 'white' ? 'W' : 'B') : '.') + ' ';
      }
      lines.push(row.replace(/\s+$/, ''));
    }
    lines.push('Holes are named file+rank: file a..q, rank 1..17 (White starts at ranks 1-4, Black at 14-17).');
    lines.push(`W = White, B = Black. ${this.turn} to move.`);
    return lines.join('\n');
  }
}

export const RULES_TEXT = `CHINESE CHECKERS (two players). The board is a six-pointed star of 121 holes; White's 10 marbles
start in the bottom point (ranks 1-4), Black's in the top point (ranks 14-17). White moves first.
HOLES are named file+rank: file letters a..q, ranks 1..17 (e.g. bottom tip "m1", top tip "e17"); use
get_state or the board text to see which holes exist.
MOVES (make_move from/to): either one step to an adjacent empty hole (six directions), or a chain of
  hops: jump over one adjacent marble (either colour) into the empty hole right behind it, repeated as
  long as you like; give only the start and the final hole. Nothing is captured.
WIN: fill every hole of the opposite point, with at least one of your marbles among them.
DRAW: threefold repetition, or 400 plies.`;
