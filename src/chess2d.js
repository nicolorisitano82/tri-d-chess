// Classic chess (FIDE rules via chess.js) with the same interface as the Tri-D Game,
// so the server, network play, clock, replay, stats and MCP work unchanged.
//
// Squares are "a1".."h8". Pieces in snapshots use the shared shape { type: 'K'|'Q'|'R'|'B'|'N'|'P', color }.
import { Chess } from 'chess.js';

export const KIND = 'chess';
const C = { w: 'white', b: 'black' };
const other = (c) => (c === 'white' ? 'black' : 'white');
const VAL = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

export const FILES8 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
export const isSquare8 = (s) => typeof s === 'string' && /^[a-h][1-8]$/.test(s);

function piecesOf(chess) {
  const out = {};
  for (const row of chess.board()) for (const p of row) if (p) out[p.square] = { type: p.type.toUpperCase(), color: C[p.color] };
  return out;
}

const toMove = (m) => ({
  from: m.from, to: m.to, piece: m.piece.toUpperCase(),
  capture: m.captured ? m.captured.toUpperCase() : null,
  promotion: m.promotion ? m.promotion.toUpperCase() : null,
  ...(m.flags.includes('k') ? { castle: 'K' } : m.flags.includes('q') ? { castle: 'Q' } : {}),
  ...(m.flags.includes('e') ? { ep: true } : {}),
});

// Only a lone king, or king + one minor piece, can never mate.
function cannotMate(pieces, color) {
  const mine = Object.values(pieces).filter((p) => p.color === color && p.type !== 'K');
  return mine.length === 0 || (mine.length === 1 && (mine[0].type === 'N' || mine[0].type === 'B'));
}

export class ChessGame {
  constructor(opts = {}) { this.reset(opts); }

  reset({ white = 'human', black = 'ai', computer = {} } = {}) {
    const cfg = (c) => ({ level: computer[c]?.level ?? 3, style: computer[c]?.style ?? 'balanced' });
    this.kind = KIND;
    this.computer = { white: cfg('white'), black: cfg('black') };
    this.id = Math.random().toString(36).slice(2, 10);
    this.chess = new Chess();
    this.players = { white, black };
    this.history = [];
    this.status = 'playing';
    this.drawReason = null;
    this.winner = null;
    this.version = 0;
    this.startedAt = Date.now();
  }

  get turn() { return C[this.chess.turn()]; }
  get pieces() { return piecesOf(this.chess); }
  get boards() { return {}; }
  // position handed to the computer (worker) — FEN is enough with chess.js
  get pos() { return { fen: this.chess.fen() }; }

  legal(from = null) {
    if (this.status !== 'playing') return [];
    return this.chess.moves({ verbose: true, ...(from && isSquare8(from) ? { square: from } : {}) }).map(toMove);
  }

  // from/to: squares, or "0-0" / "0-0-0" to castle. promotion: Q, R, B or N (default Q).
  move(fromStr, toStr, promotion = null) {
    if (this.status !== 'playing') throw new Error(`Game is over (${this.status}).`);
    const f = String(fromStr || '').trim();
    const castleSide = /^[0o]-[0o]$/i.test(f) ? 'K' : /^[0o]-[0o]-[0o]$/i.test(f) ? 'Q' : null;
    let mv;
    if (castleSide) {
      mv = this.chess.moves({ verbose: true }).find((m) => m.flags.includes(castleSide === 'K' ? 'k' : 'q'));
      if (!mv) throw new Error(`Castling ${castleSide === 'K' ? 'king' : 'queen'}-side is not legal now.`);
    } else {
      const from = f.toLowerCase(), to = String(toStr || '').trim().toLowerCase();
      if (!isSquare8(from)) throw new Error(`Invalid square "${fromStr}". Use a1..h8, or 0-0 / 0-0-0 to castle.`);
      if (!isSquare8(to)) throw new Error(`Invalid square "${toStr}". Use a1..h8.`);
      const piece = this.chess.get(from);
      if (!piece) throw new Error(`No piece on ${from}.`);
      if (C[piece.color] !== this.turn) throw new Error(`Piece on ${from} is ${C[piece.color]}, but it is ${this.turn}'s turn.`);
      const cands = this.chess.moves({ verbose: true, square: from }).filter((m) => m.to === to);
      if (!cands.length) throw new Error(`Illegal move ${from} -> ${to}.`);
      const pr = String(promotion || 'Q').toLowerCase();
      mv = cands.find((m) => !m.promotion || m.promotion === pr);
      if (!mv) throw new Error(`Invalid promotion "${promotion}". Choose Q, R, B or N.`);
    }
    const mover = this.turn;
    const done = this.chess.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
    const m = toMove(done);
    const check = this.chess.inCheck();
    let notation = done.san;
    if (this.chess.isCheckmate()) { this.status = 'checkmate'; this.winner = mover; }
    else if (this.chess.isStalemate()) this.status = 'stalemate';
    else if (this.chess.isInsufficientMaterial()) { this.status = 'draw'; this.drawReason = 'material'; }
    else if (this.chess.isThreefoldRepetition()) { this.status = 'draw'; this.drawReason = 'repetition'; }
    else if (this.chess.isDrawByFiftyMoves()) { this.status = 'draw'; this.drawReason = 'fifty'; }
    if (m.castle) notation = m.castle === 'K' ? '0-0' : '0-0-0';
    if (m.ep) notation += ' e.p.';
    const rank = mover === 'white' ? '1' : '8';
    const record = {
      n: this.history.length + 1, color: mover, from: m.from, to: m.to,
      castle: m.castle, ep: m.ep || undefined,
      ...(m.castle ? { rookFrom: (m.castle === 'K' ? 'h' : 'a') + rank, rookTo: (m.castle === 'K' ? 'f' : 'd') + rank } : {}),
      piece: m.piece, captured: m.capture, promotion: m.promotion, check, notation, at: Date.now(),
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

  // `color` ran out of time: draw if the opponent could never mate (FIDE 6.9).
  flag(color) {
    if (this.status !== 'playing') throw new Error('Game is already over.');
    if (cannotMate(this.pieces, other(color))) { this.status = 'draw'; this.drawReason = 'time-material'; }
    else { this.status = 'timeout'; this.winner = other(color); }
    this.version++;
  }

  snapshot() {
    return {
      kind: KIND,
      id: this.id,
      version: this.version,
      turn: this.turn,
      players: this.players,
      startedAt: this.startedAt,
      computer: this.computer,
      status: this.status,
      drawReason: this.drawReason,
      winner: this.winner,
      check: this.status === 'playing' && this.chess.inCheck(),
      pieces: this.pieces,
      boards: {},
      history: this.history,
      lastMove: this.history[this.history.length - 1] || null,
      legalMoves: this.legal().map(({ from, to, capture, promotion, castle, ep }) => ({
        from, to, capture, promotion, ...(castle ? { castle } : {}), ...(ep ? { ep: true } : {}),
      })),
    };
  }

  // Text board for AI clients
  render() {
    const p = this.pieces;
    const lines = ['   a b c d e f g h'];
    for (let r = 8; r >= 1; r--) {
      let row = ` ${r} `;
      for (const f of FILES8) { const x = p[f + r]; row += (x ? (x.color === 'white' ? x.type : x.type.toLowerCase()) : '.') + ' '; }
      lines.push(row + r);
    }
    lines.push('   a b c d e f g h');
    lines.push(`FEN: ${this.chess.fen()}`);
    return lines.join('\n');
  }
}

export const RULES_TEXT = `CLASSIC CHESS (FIDE Laws of Chess)

BOARD: 8x8, files a..h, ranks 1..8. White starts on ranks 1-2 and moves first.
SQUARE NAMES: "e2", "g8", ...
MOVES: make_move with from/to squares, e.g. from "e2" to "e4", or from "g1" to "f3".
  Castling: from "0-0" (king side) or "0-0-0" (queen side), or move the king two squares (e1 -> g1).
  Promotion: pass promotion Q, R, B or N (default Q). En passant is played by moving the pawn onto the passed square.
END: checkmate, stalemate, threefold repetition, insufficient material, 50-move rule; on time in clocked online games.
PIECES in text render: uppercase = white, lowercase = black. K king, Q queen, R rook, B bishop, N knight, P pawn.`;

export { VAL };
