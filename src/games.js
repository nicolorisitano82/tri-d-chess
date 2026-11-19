// Registry of the game kinds the app can play. Each kind exposes the same Game interface
// (reset, move, legal, resign, flag, snapshot, render, pos, kind) plus its rules text.
import { Game as TriDGame, RULES_TEXT as TRID_RULES } from './engine.js';
import { ChessGame, RULES_TEXT as CHESS_RULES } from './chess2d.js';

export const KINDS = ['trid', 'chess'];
export const isKind = (k) => KINDS.includes(k);

export function createGame(kind = 'trid', opts = {}) {
  return kind === 'chess' ? new ChessGame(opts) : new TriDGame(opts);
}

export const rulesText = (kind) => (kind === 'chess' ? CHESS_RULES : TRID_RULES);
