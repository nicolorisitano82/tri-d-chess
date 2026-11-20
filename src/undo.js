// Take back moves in a local game (humans and the built-in computer on this screen only).
// No imports: the server and the web build both use it, each with its own game factory.

// A local game: every side is a human or the built-in computer, and at least one is human.
export const isLocalGame = (g) => {
  const p = Object.values(g.players);
  return p.every((x) => x === 'human' || x === 'computer') && p.includes('human');
};

// How many moves to keep: drop the last move, then keep dropping until a human is to move
// (so "undo" against the computer takes back your move and its reply). White moves first,
// except in English draughts (g.variant.first).
export function undoTarget(g) {
  const first = g.variant?.first || 'white', second = first === 'white' ? 'black' : 'white';
  let n = g.history.length - 1;
  while (n > 0 && g.players[n % 2 === 0 ? first : second] !== 'human') n--;
  return Math.max(0, n);
}

// Rebuild the game without its last moves. create(kind, opts) makes an empty game of that kind.
// The game keeps its id; the version jumps by 2 so the client does not animate an old move again.
export function undoGame(g, create) {
  if (!isLocalGame(g)) throw new Error('Undo is only for local games.');
  if (!g.history.length) throw new Error('No moves to take back.');
  const keep = undoTarget(g);
  const fresh = create(g.kind, { white: g.players.white, black: g.players.black, computer: g.computer });
  for (const h of g.history.slice(0, keep)) {
    // (draughts: the route picks the same capture among several with the same start and end)
    const r = fresh.move(h.from, h.to, h.promotion || (h.path && h.path.length > 2 ? h.path.join('x') : null));
    if (h.at) r.at = h.at;
  }
  fresh.id = g.id;
  fresh.startedAt = g.startedAt;
  fresh.version = g.version + 2;
  return fresh;
}
