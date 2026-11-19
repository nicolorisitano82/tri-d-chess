// UI translations (Italian / English). Static markup uses data-i18n* attributes;
// scripts call t('key', { vars }). The language follows the saved choice, else the system.

const STRINGS = {
  it: {
    'name.white': 'Bianco', 'name.black': 'Nero',
    'name.human': 'Umano', 'name.ai': 'AI', 'name.computer': 'Computer', 'name.remote': 'In rete',
    'opt.ai': 'AI (MCP)',
    'level.1': 'Principiante', 'level.2': 'Facile', 'level.3': 'Medio', 'level.4': 'Esperto', 'level.5': 'Maestro',
    'style.balanced': 'Equilibrato', 'style.aggressive': 'Aggressivo', 'style.cautious': 'Prudente',
    'draw.fifty': 'regola delle 50 mosse', 'draw.repetition': 'triplice ripetizione', 'draw.material': 'materiale insufficiente',
    'piece.K': 'Re', 'piece.Q': 'Regina', 'piece.R': 'Torre', 'piece.B': 'Alfiere', 'piece.N': 'Cavallo', 'piece.P': 'Pedone',

    'status.connecting': 'Connessione…', 'status.lost': 'Connessione persa, riprovo…',
    'status.mate': 'Scacco matto — vince {c}', 'status.stalemate': 'Stallo — patta', 'status.draw': 'Patta ({r})',
    'status.resigned': 'Abbandono — vince {c}',
    'status.check': 'Scacco al {c}! {n} mosse per uscirne', 'status.check1': 'Scacco al {c}! 1 mossa per uscirne',
    'status.computer': 'Il computer pensa ({c})…', 'status.remote': "Mossa dell'avversario in rete ({c})…",
    'status.ai': "In attesa dell'AI ({c})…", 'status.you': 'Tocca a te ({c}) · {n} mosse',

    'ui.turn': 'Turno', 'ui.log': 'Registro mosse', 'ui.newGame': 'Nuova partita', 'ui.resign': 'Abbandona',
    'ui.confirm': 'Conferma?', 'ui.view': 'Vista', 'ui.stats': 'Statistiche', 'ui.statsHide': 'Nascondi (S)',
    'ui.statsShow': 'Mostra statistiche (S)', 'ui.options': 'Opzioni', 'ui.close': 'Chiudi',
    'ui.levelW': 'Livello Bianco', 'ui.levelB': 'Livello Nero', 'ui.styleW': 'Stile Bianco', 'ui.styleB': 'Stile Nero',
    'ui.lang': 'Lingua', 'ui.resignConfirm': 'Abbandonare la partita?', 'ui.error': 'Errore {s}',

    'mcp.title': "Collega l'AI (MCP) · clic per copiare", 'mcp.none': 'Nessun giocatore AI: imposta Bianco o Nero su AI.',
    'mcp.unsaved': 'Premi “Nuova partita” per applicare i giocatori.', 'mcp.copied': 'Comando copiato',

    'stats.noCaps': 'Nessun pezzo catturato', 'stats.winner': 'vincitore', 'stats.material': 'punti materiale',
    'stats.balance': 'Equilibrio materiale', 'stats.captured': 'Pezzi mangiati', 'stats.moves': 'Mosse',
    'stats.captures': 'Catture', 'stats.checks': 'Scacchi dati', 'stats.promotions': 'Promozioni',
    'stats.pieces': 'Pezzi in gioco', 'stats.avg': 'Tempo medio', 'stats.total': 'Tempo totale', 'stats.thinking': 'Sta pensando',

    'victory.triumph': 'Trionfo', 'victory.gameOver': 'Fine partita', 'victory.draw': 'Patta',
    'victory.stalemate': 'Stallo: nessuna mossa legale', 'victory.drawBy': 'Patta per {r}', 'victory.plies': '{n} semimosse giocate',
    'victory.glory': 'Gloria al {c}', 'victory.win': 'Vittoria', 'victory.sub': 'Il {c} ({who}) trionfa {how} alla mossa {n}',
    'victory.byMate': 'per scacco matto', 'victory.byResign': 'per abbandono',
    'victory.meta': '{caps} pezzi catturati · {checks} scacchi dati · materiale {mat}', 'victory.watch': 'Guarda la scacchiera',

    'promo.eyebrow': 'Promozione', 'promo.title': 'Scegli il nuovo pezzo', 'promo.cancel': 'Annulla',

    'hint.notYourTurn': 'Non è il tuo turno', 'hint.pin': 'Aggancio {p} · sposta qui la tavola', 'hint.movable': ' · tavola spostabile',
    'hint.boardLocked': 'Tavola bloccata: si sposta solo se vuota o con un solo pezzo',
    'hint.boardEnemy': "Questa tavola la controlla l'avversario (ha sopra un suo pezzo)",
    'hint.boardEnemyEmpty': "Tavola vuota dell'avversario: solo lui può spostarla",
    'hint.boardNoPin': 'Questa tavola non ha agganci liberi raggiungibili',
    'hint.pawnStuck': 'Pedone bloccato: sposta la sua tavola (tocca una casella vuota della tavola) per farlo avanzare',
    'hint.kingStuckCheck': 'Il re non può muoversi: para lo scacco con un pezzo evidenziato in verde',
    'hint.kingStuck': 'Il re non può muoversi, ma hai altre {n} mosse',
    'hint.notBlocking': 'Questo pezzo non para lo scacco: usa uno evidenziato in verde',
    'hint.noMoves': 'Nessuna mossa legale per questo pezzo',

    'net.title': 'Gioco in rete (P2P)', 'net.iPlay': 'Io gioco', 'net.random': 'Casuale', 'net.host': 'Crea stanza',
    'net.code': 'Codice stanza', 'net.join': 'Entra', 'net.room': 'Stanza', 'net.state': 'Stato', 'net.you': 'Tu giochi',
    'net.copy': 'Copia', 'net.leave': 'Esci dalla stanza', 'net.waiting': "In attesa dell'avversario…",
    'net.searching': 'Cerco la stanza…', 'net.syncing': 'Allineamento partita…', 'net.connected': 'Connesso',
    'net.desync': 'Partita non allineata', 'net.peerLeft': 'Avversario disconnesso: può rientrare con lo stesso codice',
    'net.codeCopied': 'Codice copiato', 'net.needCode': 'Inserisci il codice della stanza', 'net.left': 'Sei uscito dalla stanza',
    'net.busy': 'La stanza è già occupata da due giocatori', 'net.peerNew': "L'avversario ha avviato una nuova partita",
    'net.peerAway': "L'avversario non è connesso", 'net.unavailable': 'Rete non disponibile: {e}',

    'net.waitingPublic': "In attesa dell'avversario… (visibile nella lobby)",
    'lobby.title': 'Stanze aperte', 'lobby.public': 'Mostra nella lobby pubblica', 'lobby.name': 'Il tuo nome (facoltativo)',
    'lobby.empty': 'Nessuna stanza in attesa: creane una!', 'lobby.searching': 'Collegamento alla lobby…', 'lobby.anon': 'Giocatore anonimo',
    'lobby.youPlay': 'Giochi col {c}', 'lobby.now': 'adesso', 'lobby.min': 'da {n} min', 'lobby.relays': '{n} relay', 'lobby.join': 'Entra nella stanza', 'lobby.noAnswer': 'La stanza non risponde: forse è già piena o chiusa', 'lobby.search': 'Cerca per nome, codice, lingua, colore…', 'lobby.noMatch': 'Nessuna stanza corrisponde alla ricerca',
    'chat.title': 'Chat', 'chat.send': 'Invia', 'chat.placeholder': 'Scrivi un messaggio…', 'chat.emoji': 'Emoticon',
    'chat.reactions': 'Reazioni', 'chat.me': 'Tu', 'chat.them': 'Avversario', 'chat.wait': 'attendi {s}s',
    'chat.tooManyEmoji': 'Massimo {n} emoticon per messaggio', 'chat.joined': "L'avversario è nella stanza",
    'chat.left': "L'avversario è uscito",
    'react.clap': 'Applausi', 'react.fire': 'Fuoco', 'react.wow': 'Wow', 'react.laugh': 'Risata', 'react.gg': 'Bella partita', 'react.boom': 'Boom',
  },
  en: {
    'name.white': 'White', 'name.black': 'Black',
    'name.human': 'Human', 'name.ai': 'AI', 'name.computer': 'Computer', 'name.remote': 'Online',
    'opt.ai': 'AI (MCP)',
    'level.1': 'Beginner', 'level.2': 'Easy', 'level.3': 'Medium', 'level.4': 'Expert', 'level.5': 'Master',
    'style.balanced': 'Balanced', 'style.aggressive': 'Aggressive', 'style.cautious': 'Cautious',
    'draw.fifty': 'the 50-move rule', 'draw.repetition': 'threefold repetition', 'draw.material': 'insufficient material',
    'piece.K': 'King', 'piece.Q': 'Queen', 'piece.R': 'Rook', 'piece.B': 'Bishop', 'piece.N': 'Knight', 'piece.P': 'Pawn',

    'status.connecting': 'Connecting…', 'status.lost': 'Connection lost, retrying…',
    'status.mate': 'Checkmate — {c} wins', 'status.stalemate': 'Stalemate — draw', 'status.draw': 'Draw ({r})',
    'status.resigned': 'Resignation — {c} wins',
    'status.check': '{c} in check! {n} moves to escape', 'status.check1': '{c} in check! 1 move to escape',
    'status.computer': 'Computer thinking ({c})…', 'status.remote': 'Waiting for the online opponent ({c})…',
    'status.ai': 'Waiting for the AI ({c})…', 'status.you': 'Your move ({c}) · {n} moves',

    'ui.turn': 'Turn', 'ui.log': 'Move log', 'ui.newGame': 'New game', 'ui.resign': 'Resign',
    'ui.confirm': 'Confirm?', 'ui.view': 'View', 'ui.stats': 'Stats', 'ui.statsHide': 'Hide (S)',
    'ui.statsShow': 'Show stats (S)', 'ui.options': 'Options', 'ui.close': 'Close',
    'ui.levelW': 'White level', 'ui.levelB': 'Black level', 'ui.styleW': 'White style', 'ui.styleB': 'Black style',
    'ui.lang': 'Language', 'ui.resignConfirm': 'Resign the game?', 'ui.error': 'Error {s}',

    'mcp.title': 'Connect an AI (MCP) · click to copy', 'mcp.none': 'No AI player: set White or Black to AI.',
    'mcp.unsaved': 'Press “New game” to apply the players.', 'mcp.copied': 'Command copied',

    'stats.noCaps': 'No captures yet', 'stats.winner': 'winner', 'stats.material': 'material points',
    'stats.balance': 'Material balance', 'stats.captured': 'Captured pieces', 'stats.moves': 'Moves',
    'stats.captures': 'Captures', 'stats.checks': 'Checks given', 'stats.promotions': 'Promotions',
    'stats.pieces': 'Pieces left', 'stats.avg': 'Average time', 'stats.total': 'Total time', 'stats.thinking': 'Thinking',

    'victory.triumph': 'Triumph', 'victory.gameOver': 'Game over', 'victory.draw': 'Draw',
    'victory.stalemate': 'Stalemate: no legal moves', 'victory.drawBy': 'Draw by {r}', 'victory.plies': '{n} plies played',
    'victory.glory': 'Glory to {c}', 'victory.win': 'Victory', 'victory.sub': '{c} ({who}) wins {how} on move {n}',
    'victory.byMate': 'by checkmate', 'victory.byResign': 'by resignation',
    'victory.meta': '{caps} pieces captured · {checks} checks · material {mat}', 'victory.watch': 'View the board',

    'promo.eyebrow': 'Promotion', 'promo.title': 'Choose the new piece', 'promo.cancel': 'Cancel',

    'hint.notYourTurn': "It's not your turn", 'hint.pin': 'Pin {p} · move the board here', 'hint.movable': ' · movable board',
    'hint.boardLocked': 'Board locked: it moves only when empty or holding one piece',
    'hint.boardEnemy': 'Your opponent controls this board (one of their pieces is on it)',
    'hint.boardEnemyEmpty': "Opponent's empty board: only they can move it",
    'hint.boardNoPin': 'No free pin within reach for this board',
    'hint.pawnStuck': 'Pawn blocked: move its attack board (tap an empty square of the board) to advance it',
    'hint.kingStuckCheck': "The king can't move: block the check with a piece highlighted in green",
    'hint.kingStuck': "The king can't move, but you have {n} other moves",
    'hint.notBlocking': "This piece can't stop the check: use one highlighted in green",
    'hint.noMoves': 'No legal moves for this piece',

    'net.title': 'Online play (P2P)', 'net.iPlay': 'I play', 'net.random': 'Random', 'net.host': 'Create room',
    'net.code': 'Room code', 'net.join': 'Join', 'net.room': 'Room', 'net.state': 'Status', 'net.you': 'You play',
    'net.copy': 'Copy', 'net.leave': 'Leave room', 'net.waiting': 'Waiting for your opponent…',
    'net.searching': 'Looking for the room…', 'net.syncing': 'Syncing the game…', 'net.connected': 'Connected',
    'net.desync': 'Game out of sync', 'net.peerLeft': 'Opponent disconnected: they can rejoin with the same code',
    'net.codeCopied': 'Code copied', 'net.needCode': 'Enter the room code', 'net.left': 'You left the room',
    'net.busy': 'This room already has two players', 'net.peerNew': 'Your opponent started a new game',
    'net.peerAway': 'Your opponent is not connected', 'net.unavailable': 'Network unavailable: {e}',

    'net.waitingPublic': 'Waiting for an opponent… (listed in the lobby)',
    'lobby.title': 'Open rooms', 'lobby.public': 'List in the public lobby', 'lobby.name': 'Your name (optional)',
    'lobby.empty': 'No rooms waiting: create one!', 'lobby.searching': 'Connecting to the lobby…', 'lobby.anon': 'Anonymous player',
    'lobby.youPlay': 'You play {c}', 'lobby.now': 'just now', 'lobby.min': '{n} min', 'lobby.relays': '{n} relays', 'lobby.join': 'Join this room', 'lobby.noAnswer': 'The room does not answer: it may be full or closed', 'lobby.search': 'Search by name, code, language, colour…', 'lobby.noMatch': 'No rooms match your search',
    'chat.title': 'Chat', 'chat.send': 'Send', 'chat.placeholder': 'Write a message…', 'chat.emoji': 'Emoji',
    'chat.reactions': 'Reactions', 'chat.me': 'You', 'chat.them': 'Opponent', 'chat.wait': 'wait {s}s',
    'chat.tooManyEmoji': 'At most {n} emoji per message', 'chat.joined': 'Your opponent is in the room',
    'chat.left': 'Your opponent left',
    'react.clap': 'Applause', 'react.fire': 'Fire', 'react.wow': 'Wow', 'react.laugh': 'Laugh', 'react.gg': 'Good game', 'react.boom': 'Boom',
  },
};

export const LANGS = ['it', 'en'];
const KEY = 'tridchess.lang';
const listeners = [];

function detect() {
  try { const saved = localStorage.getItem(KEY); if (LANGS.includes(saved)) return saved; } catch {}
  const q = new URLSearchParams(location.search).get('lang');
  if (LANGS.includes(q)) return q;
  return (navigator.language || 'en').toLowerCase().startsWith('it') ? 'it' : 'en';
}

let lang = detect();
export const getLang = () => lang;

export function t(key, vars = {}) {
  const s = STRINGS[lang][key] ?? STRINGS.it[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

// Fill every element marked with data-i18n (text), data-i18n-title, data-i18n-placeholder, data-i18n-aria.
export function applyStatic(root = document) {
  document.documentElement.lang = lang;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}

export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  lang = next;
  try { localStorage.setItem(KEY, lang); } catch {}
  applyStatic();
  for (const f of listeners) { try { f(lang); } catch (e) { console.error(e); } }
}

export const onLangChange = (f) => listeners.push(f);

// Lookup tables that read the current language on every access, e.g. NAMES.white.
export const table = (prefix) => new Proxy({}, { get: (_, k) => (typeof k === 'string' ? t(`${prefix}.${k}`) : undefined) });
