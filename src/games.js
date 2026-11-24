// Registry of the game kinds the app can play. Each kind exposes the same Game interface
// (reset, move, legal, resign, flag, snapshot, render, pos, kind) plus its rules text.
import { Game as TriDGame, RULES_TEXT as TRID_RULES } from './engine.js';
import { ChessGame, RULES_TEXT as CHESS_RULES } from './chess2d.js';
import { XiangqiGame, RULES_TEXT as XQ_RULES } from './xiangqi.js';
import { DraughtsGame, DRAUGHTS_KINDS, isDraughts, RULES_TEXT as DRAUGHTS_RULES } from './draughts.js';

export const KINDS = ['trid', 'chess', 'xiangqi', ...DRAUGHTS_KINDS];
export const isKind = (k) => KINDS.includes(k);

export function createGame(kind = 'trid', opts = {}) {
  if (kind === 'chess') return new ChessGame(opts);
  if (kind === 'xiangqi') return new XiangqiGame(opts);
  if (isDraughts(kind)) return new DraughtsGame(kind, opts);
  return new TriDGame(opts);
}

export const rulesText = (kind) => (kind === 'chess' ? CHESS_RULES : kind === 'xiangqi' ? XQ_RULES : isDraughts(kind) ? DRAUGHTS_RULES : TRID_RULES);
