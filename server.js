import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { createGame, isKind, rulesText } from './src/games.js';
import { LEVELS as AI_LEVELS, STYLES as AI_STYLES } from './src/ai.js';

const PORT = Number(process.env.PORT || 47321);
const HOST = process.env.HOST || '127.0.0.1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The game being played; its kind ('trid' | 'chess') is chosen when a new game starts.
let game = createGame('trid', { white: 'human', black: 'ai' });
const KIND_NAMES = { trid: 'Tri-D chess (Meder rules)', chess: 'classic chess' };
const bus = new EventEmitter();
bus.setMaxListeners(100);
const changed = () => { bus.emit('change', game.snapshot()); scheduleComputer(); };

// --- built-in computer player (search runs in a worker thread) -----------------
const COMPUTER_DELAY = Number(process.env.COMPUTER_DELAY || 900);
const recent = { white: [], black: [] };
let computerTimer = null;
let aiWorker = null;
let aiRequest = 0;
// Inside the packaged app the worker must load from app.asar.unpacked (see build.asarUnpack).
const workerFile = fileURLToPath(new URL('./src/ai-worker.js', import.meta.url)).replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
function getWorker() {
  if (aiWorker) return aiWorker;
  aiWorker = new Worker(workerFile);
  aiWorker.on('message', onComputerMove);
  aiWorker.on('error', (e) => { console.error('computer worker error', e.message); aiWorker = null; });
  aiWorker.on('exit', () => { aiWorker = null; });
  aiWorker.unref();
  return aiWorker;
}
let pendingTurn = null; // { id, gameId, version, turn }
function onComputerMove({ id, move, error }) {
  const p = pendingTurn;
  if (!p || p.id !== id) return;                                  // superseded request
  pendingTurn = null;
  if (error) { console.error('computer search failed', error); return; }
  if (!move || game.id !== p.gameId || game.version !== p.version) return; // game changed meanwhile
  recent[p.turn].push(`${move.to}>${move.from}`);
  if (recent[p.turn].length > 4) recent[p.turn].shift();
  try { game.move(move.from, move.to, move.promotion); } catch (e) { console.error('computer move failed', e.message); return; }
  changed();
}
function scheduleComputer() {
  clearTimeout(computerTimer);
  pendingTurn = null;
  if (game.status !== 'playing' || game.players[game.turn] !== 'computer') return;
  const { id: gameId, version, turn } = game;
  computerTimer = setTimeout(() => {
    if (game.id !== gameId || game.version !== version) return;
    const { level, style } = game.computer[turn];
    const id = ++aiRequest;
    pendingTurn = { id, gameId, version, turn };
    getWorker().postMessage({ id, kind: game.kind, pos: game.pos, color: turn, level, style, recent: recent[turn] });
  }, COMPUTER_DELAY);
}
const PLAYER_TYPES = ['human', 'ai', 'computer', 'remote'];

// Network games are strictly human vs human: a "remote" side is always paired with a local human,
// and while a network room is open (netRoom, set by the page) no other kind of game may start.
let netRoom = false;
// watch: a spectator mirrors a network game, so both sides are remote.
function playersError(white, black, watch = false) {
  if (!PLAYER_TYPES.includes(white) || !PLAYER_TYPES.includes(black)) return 'players must be "human", "ai", "computer" or "remote"';
  const remote = [white, black].filter((p) => p === 'remote').length;
  if (watch && remote === 2 && netRoom) return null;
  if (remote && !(remote === 1 && [white, black].includes('human'))) return 'Network games are human vs human only.';
  if (netRoom && remote !== 1) return 'A network game is open: leave the room before starting another kind of game.';
  return null;
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/engine.js', (_req, res) => res.sendFile(path.join(__dirname, 'src/engine.js')));
app.get('/chess2d.js', (_req, res) => res.sendFile(path.join(__dirname, 'src/chess2d.js')));

// --- REST API for the 3D UI --------------------------------------------------

app.get('/api/state', (_req, res) => res.json(game.snapshot()));

app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = (s) => res.write(`data: ${JSON.stringify(s)}\n\n`);
  send(game.snapshot());
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  bus.on('change', send);
  req.on('close', () => { clearInterval(ping); bus.off('change', send); });
});

app.post('/api/move', (req, res) => {
  const { from, to, promotion } = req.body || {};
  if (game.players[game.turn] !== 'human')
    return res.status(409).json({ error: `It is ${game.turn}'s turn and ${game.turn} is not played on this screen.` });
  try {
    const rec = game.move(from, to, promotion);
    changed();
    res.json({ ok: true, move: rec });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/new', (req, res) => {
  const { white = 'human', black = 'ai', computer = {}, kind = game.kind } = req.body || {};
  if (!isKind(kind)) return res.status(400).json({ error: 'kind must be "trid" or "chess"' });
  const perr = playersError(white, black);
  if (perr) return res.status(409).json({ error: perr });
  const cfg = {};
  for (const c of ['white', 'black']) {
    const { level = 3, style = 'balanced' } = computer[c] || {};
    if (!AI_LEVELS[Number(level)]) return res.status(400).json({ error: `${c} level must be 1..5` });
    if (!AI_STYLES[style]) return res.status(400).json({ error: `${c} style must be balanced, aggressive or cautious` });
    cfg[c] = { level: Number(level), style };
  }
  recent.white = []; recent.black = [];
  game = createGame(kind, { white, black, computer: cfg });
  changed();
  res.json({ ok: true });
});

// body.color: the side that resigns (a local human, or the network opponent); default the side to move
app.post('/api/resign', (req, res) => {
  const color = req.body?.color || game.turn;
  if (!['white', 'black'].includes(color) || !['human', 'remote'].includes(game.players[color]))
    return res.status(409).json({ error: `${color} cannot resign from this screen.` });
  try {
    game.resign(color);
    changed();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// --- network play (peer-to-peer runs in the page; these endpoints apply what the peer sends) ---

// A move received from the network opponent. n = number of moves played before it, to keep both sides in step.
app.post('/api/remote-move', (req, res) => {
  const { from, to, promotion, n } = req.body || {};
  if (game.players[game.turn] !== 'remote') return res.status(409).json({ error: 'Not the network opponent\'s turn.', expected: game.history.length });
  if (n !== game.history.length) return res.status(409).json({ error: 'Out of sync.', expected: game.history.length });
  try {
    const rec = game.move(from, to, promotion);
    changed();
    res.json({ ok: true, move: rec });
  } catch (e) {
    res.status(400).json({ error: e.message, expected: game.history.length });
  }
});

// Rebuild the game from a move list (joining or re-joining a network game).
// A player of a network game ran out of time (reported by either side's clock).
app.post('/api/flag', (req, res) => {
  const color = req.body?.color;
  if (!['white', 'black'].includes(color) || !Object.values(game.players).includes('remote') || !['human', 'remote'].includes(game.players[color]))
    return res.status(409).json({ error: 'Time control applies to network games only.' });
  try { game.flag(color); changed(); res.json({ ok: true, status: game.status }); }
  catch (e) { res.status(409).json({ error: e.message }); }
});

// The page reports whether a network room is open (network games are human vs human only).
app.post('/api/net-room', (req, res) => {
  netRoom = !!req.body?.open;
  res.json({ ok: true, open: netRoom });
});

app.post('/api/net-sync', (req, res) => {
  const { white, black, moves = [], resigned = null, kind = game.kind, watch = false } = req.body || {};
  if (!isKind(kind)) return res.status(400).json({ error: 'bad game kind' });
  const perr = playersError(white, black, watch === true);
  if (perr) return res.status(409).json({ error: perr });
  recent.white = []; recent.black = [];
  game = createGame(kind, { white, black });
  try {
    for (const m of moves) game.move(m.from, m.to, m.promotion);
    if (resigned && game.status === 'playing') game.resign(resigned);
  } catch (e) {
    changed();
    return res.status(400).json({ error: `Replay failed: ${e.message}` });
  }
  changed();
  res.json({ ok: true, moves: game.history.length });
});

// --- MCP server (Streamable HTTP, stateless) ---------------------------------

const text = (t) => ({ content: [{ type: 'text', text: t }] });
const fail = (t) => ({ content: [{ type: 'text', text: t }], isError: true });

const COLOR = z.enum(['white', 'black']);

// Which color an MCP caller plays: explicit arg > URL ?color= > the only AI side.
function resolveColor(arg, urlColor) {
  const c = arg || urlColor;
  if (c) return { color: c };
  const ai = Object.keys(game.players).filter((k) => game.players[k] === 'ai');
  if (ai.length === 1) return { color: ai[0] };
  if (ai.length === 0) return { error: 'No side is played by the AI. Start a new_game with an "ai" player.' };
  return { error: 'Both sides are AI: pass color ("white" or "black"), or connect with /mcp?color=white or /mcp?color=black.' };
}

function describe(me = null) {
  const s = game.snapshot();
  const list = (v) => Object.entries(s.players).filter(([, p]) => p === v).map(([c]) => c).join(', ') || 'none';
  const myTurn = me ? s.status === 'playing' && s.turn === me && s.players[me] === 'ai' : s.status === 'playing' && s.players[s.turn] === 'ai';
  const head = [
    `Game ${s.id} (${KIND_NAMES[s.kind] || s.kind}) — status: ${s.status}${s.winner ? `, winner: ${s.winner}` : ''}`,
    `Turn: ${s.turn}${s.check ? ' (IN CHECK)' : ''}`,
    `AI (MCP) plays: ${list('ai')} | human plays: ${list('human')} | built-in computer plays: ${list('computer')}`,
    me ? `You play: ${me}` : null,
    `Your turn now: ${myTurn ? 'YES' : 'no'}`,
    `Last move: ${s.lastMove ? `${s.lastMove.color} ${s.lastMove.notation}` : '—'}`,
    `Moves played: ${s.history.length}`,
  ].filter(Boolean).join('\n');
  const fmt = (m) => m.castle ? (m.castle === 'K' ? '0-0' : '0-0-0') : `${m.from}-${m.to}${m.capture ? `x${m.capture}` : ''}${m.promotion ? `=${m.promotion}` : ''}${m.ep ? ' e.p.' : ''}`;
  const legal = [...new Set(s.legalMoves.map(fmt))];
  return `${head}\n\n${game.render()}\n\nLegal moves for ${s.turn} (${legal.length}):\n${legal.join(' ')}`;
}

function buildMcp(urlColor = null) {
  const mcp = new McpServer({ name: 'tri-d-chess', version: '0.2.0' });
  const colorArg = { color: COLOR.optional().describe(`Your color. Optional${urlColor ? ` (this connection plays ${urlColor})` : '; required when both sides are AI'}.`) };

  mcp.registerTool('get_rules', {
    description: 'Explain the board geometry, square naming and movement rules of this tri-dimensional chess variant. Read this first.',
    inputSchema: {},
  }, async () => text(`Current game: ${KIND_NAMES[game.kind]}.\n\n` + rulesText(game.kind) + (urlColor ? `\n\nThis MCP connection plays ${urlColor}.` : '')));

  mcp.registerTool('get_game_state', {
    description: 'Current game state: whose turn, your color, status, a text render of every level and the legal moves for the side to move.',
    inputSchema: colorArg,
  }, async ({ color }) => text(describe(resolveColor(color, urlColor).color || null)));

  mcp.registerTool('get_legal_moves', {
    description: 'Legal moves for the side to move, optionally only from one square (piece) or one pin (attack board, e.g. "QL1").',
    inputSchema: { from: z.string().optional().describe('Square like "a2W" or pin like "KL1" to filter by origin') },
  }, async ({ from }) => {
    const moves = game.legal(from ? from.trim() : null);
    if (!moves.length) return text('No legal moves.');
    return text(moves.map((m) => m.board ? `attack board ${m.from}-${m.to}` : m.castle ? `castling ${m.castle === 'K' ? '0-0 (king side)' : '0-0-0 (queen side)'}: king ${m.from}-${m.to}` : `${m.piece} ${m.from}-${m.to}${m.capture ? ` captures ${m.capture}` : ''}${m.ep ? ' en passant' : ''}${m.promotion ? ` promotes to ${m.promotion}` : ''}`).join('\n'));
  });

  mcp.registerTool('make_move', {
    description: 'Play a move for your (AI) color. Tri-D: squares file+rank+level, e.g. from "b2W" to "b4N"; classic chess: from "e2" to "e4". Attack-board move: pins, e.g. from "QL1" to "QL3". See get_rules.',
    inputSchema: {
      from: z.string().describe('Origin square (e.g. "b2W"), attack-board pin (e.g. "QL1"), or "0-0" / "0-0-0" to castle'),
      to: z.string().describe('Destination square (e.g. "b4N") or empty pin (e.g. "QL3"); ignored for "0-0"/"0-0-0"'),
      promotion: z.enum(['Q', 'R', 'B', 'N']).optional().describe('Piece for a promoting pawn (default Q)'),
      ...colorArg,
    },
  }, async ({ from, to, color, promotion }) => {
    const r = resolveColor(color, urlColor);
    if (r.error) return fail(r.error);
    if (game.status !== 'playing') return fail(`Game is over (${game.status}). Use new_game to start another.`);
    if (game.players[r.color] !== 'ai') return fail(`${r.color} is not an MCP AI side in this game (it is ${game.players[r.color]}).`);
    if (game.turn !== r.color) return fail(`It is ${game.turn}'s turn, not yours (${r.color}). Use wait_for_my_turn.`);
    try {
      const rec = game.move(from, to, promotion);
      changed();
      return text(`Played ${rec.notation}.\n\n${describe(r.color)}`);
    } catch (e) {
      return fail(e.message);
    }
  });

  mcp.registerTool('wait_for_my_turn', {
    description: "Block until it is your color's turn (or the game ends), then return the game state. Call this after each of your moves to wait for the opponent.",
    inputSchema: { timeout_seconds: z.number().int().min(1).max(600).optional().describe('Max wait, default 120'), ...colorArg },
  }, async ({ timeout_seconds = 120, color }) => {
    const r = resolveColor(color, urlColor);
    if (r.error) return fail(r.error);
    if (game.players[r.color] !== 'ai') return fail(`${r.color} is not an MCP AI side in this game (it is ${game.players[r.color]}).`);
    const ready = () => game.status !== 'playing' || game.turn === r.color;
    if (!ready()) {
      await new Promise((resolve) => {
        const t = setTimeout(done, timeout_seconds * 1000);
        function done() { clearTimeout(t); bus.off('change', check); resolve(); }
        function check() { if (ready()) done(); }
        bus.on('change', check);
      });
    }
    if (!ready()) return text(`Still waiting: the opponent has not moved yet (timeout ${timeout_seconds}s). Call wait_for_my_turn again.`);
    return text(describe(r.color));
  });

  mcp.registerTool('new_game', {
    description: 'Start a new game, discarding the current one. Choose who plays each color. Only call this when asked to.',
    inputSchema: {
      white: z.enum(['human', 'ai', 'computer']).default('human').describe('"computer" = built-in engine'),
      black: z.enum(['human', 'ai', 'computer']).default('ai'),
      white_level: z.number().int().min(1).max(5).default(3).describe('White built-in computer strength: 1 beginner .. 5 master'),
      white_style: z.enum(['balanced', 'aggressive', 'cautious']).default('balanced').describe('White built-in computer style'),
      black_level: z.number().int().min(1).max(5).default(3).describe('Black built-in computer strength: 1 beginner .. 5 master'),
      black_style: z.enum(['balanced', 'aggressive', 'cautious']).default('balanced').describe('Black built-in computer style'),
      kind: z.enum(['trid', 'chess']).optional().describe('Which game: "trid" (3D chess, Meder rules) or "chess" (classic chess). Default: the current one'),
    },
  }, async ({ white, black, white_level, white_style, black_level, black_style, kind }) => {
    if (netRoom || Object.values(game.players).includes('remote') && game.status === 'playing')
      return fail('A human-vs-human network game is in progress on this board; new_game is not available until it ends.');
    const perr = playersError(white, black);
    if (perr) return fail(perr);
    recent.white = []; recent.black = [];
    game = createGame(kind || game.kind, { white, black, computer: { white: { level: white_level, style: white_style }, black: { level: black_level, style: black_style } } });
    changed();
    return text(`New game started.\n\n${describe(urlColor)}`);
  });

  mcp.registerTool('resign', {
    description: 'Resign the game for your (AI) color. Only on your turn.',
    inputSchema: colorArg,
  }, async ({ color }) => {
    const r = resolveColor(color, urlColor);
    if (r.error) return fail(r.error);
    if (game.players[r.color] !== 'ai' || game.turn !== r.color) return fail('You can only resign on your own turn.');
    try { game.resign(r.color); changed(); return text(`Resigned. ${describe(r.color)}`); }
    catch (e) { return fail(e.message); }
  });

  return mcp;
}

app.post('/mcp', async (req, res) => {
  const c = String(req.query.color || '').toLowerCase();
  const mcp = buildMcp(c === 'white' || c === 'black' ? c : null);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); mcp.close(); });
  try {
    await mcp.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error('MCP error', e);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
  }
});
const methodNotAllowed = (_req, res) => res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
app.get('/mcp', methodNotAllowed);
app.delete('/mcp', methodNotAllowed);

export function startServer({ port = PORT, host = HOST } = {}) {
  return new Promise((resolve, reject) => {
    const srv = app.listen(port, host, () => {
      console.log(`Tri-D Chess  →  http://localhost:${port}`);
      console.log(`MCP endpoint →  http://localhost:${port}/mcp`);
      resolve(srv);
    });
    srv.once('error', reject);
  });
}

// Run directly with `node server.js`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startServer().catch((e) => { console.error(e.message); process.exit(1); });
}
