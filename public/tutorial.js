// Interactive Tri-D tutorial: short lessons played on the real 3D board. Each lesson sets up a
// position, explains one idea and asks for one move; the engine checks it. Opened from the
// Rules page (or ?tutorial), in Italian and English. No DOM work happens at import time, so the
// lesson positions can be checked by the tests.

const W = 'white', B = 'black';
const BOARDS = { QL1: W, KL1: W, QL6: B, KL6: B };

// pieces: [square, type, colour]; goal(m) tells whether a move solves the lesson (null = read only)
export const LESSONS = [
  {
    id: 'intro', start: true, goal: null,
    it: ['Benvenuto nel Tri-D', `<p>Sette tavole: tre grandi fisse (<b>W</b> in basso, <b>N</b> in mezzo, <b>B</b> in alto) e quattro piccole <b>tavole d'attacco</b> agli angoli.</p><p>Ruota la vista trascinando, zooma con la rotella o con due dita. Quando sei pronto, premi <b>Avanti</b>.</p>`],
    en: ['Welcome to Tri-D', `<p>Seven boards: three large fixed ones (<b>W</b> at the bottom, <b>N</b> in the middle, <b>B</b> at the top) and four small <b>attack boards</b> at the corners.</p><p>Drag to rotate the view, zoom with the wheel or two fingers. When you are ready, press <b>Next</b>.</p>`],
  },
  {
    id: 'levels', start: true, goal: (m) => m.from === 'b2W' && /^b4[WN]$/.test(m.to),
    it: ['Più livelli, una sola mossa', `<p>Le mosse si giudicano <b>viste dall'alto</b>. Il pezzo può poi atterrare su qualunque livello che abbia quella casella.</p><p><b>Prova:</b> muovi il pedone <code>b2W</code> di due caselle. La casella b4 esiste sia su W sia su N: scegli tu dove atterrare.</p>`],
    en: ['Many levels, one move', `<p>Moves are judged <b>as seen from above</b>. The piece can then land on any level that has that square.</p><p><b>Try it:</b> move the pawn on <code>b2W</code> two squares. Square b4 exists on both W and N: you choose where to land.</p>`],
  },
  {
    id: 'projection',
    pieces: [['a1W', 'R', W], ['c1W', 'K', W], ['a6N', 'N', B], ['d8B', 'K', B]],
    goal: (m) => m.from === 'a1W' && m.to === 'a6N',
    it: ['Attraverso i livelli', `<p>La torre corre lungo la colonna a. Da sopra, le caselle a2–a5 sono vuote su tutti i livelli, quindi la strada è libera, anche se il bersaglio è su un'altra tavola.</p><p>Un pezzo su un livello qualunque <b>blocca</b> la colonna e la traversa sotto e sopra di sé.</p><p><b>Prova:</b> cattura il cavallo nero su <code>a6N</code> con la torre.</p>`],
    en: ['Across the levels', `<p>The rook runs along file a. Seen from above, squares a2–a5 are empty on every level, so the way is clear, even though the target is on another board.</p><p>A piece on any level <b>blocks</b> that file and rank above and below it.</p><p><b>Try it:</b> capture the black knight on <code>a6N</code> with the rook.</p>`],
  },
  {
    id: 'knight',
    pieces: [['b1W', 'N', W], ['a2W', 'P', W], ['b2W', 'P', W], ['c2W', 'P', W], ['d1W', 'K', W], ['c3N', 'P', B], ['d8B', 'K', B]],
    goal: (m) => m.from === 'b1W' && m.to === 'c3N',
    it: ['Il cavallo salta', `<p>Il cavallo si muove a «L», come sempre, e <b>salta</b> i pezzi in mezzo, anche quelli sugli altri livelli.</p><p><b>Prova:</b> scavalca i tuoi pedoni e cattura il pedone nero su <code>c3N</code>.</p>`],
    en: ['The knight jumps', `<p>The knight moves in an "L", as always, and <b>jumps</b> over pieces in the way, including those on other levels.</p><p><b>Try it:</b> jump over your pawns and capture the black pawn on <code>c3N</code>.</p>`],
  },
  {
    id: 'board',
    pieces: [['a1QL1', 'P', W], ['c1W', 'K', W], ['d8B', 'K', B]],
    goal: (m) => m.board && m.from === 'QL1',
    it: ["Spostare una tavola d'attacco", `<p>Spostare una tavola d'attacco occupa un turno intero, e la tavola porta con sé i pezzi che ha sopra. Si muove se è vuota oppure se porta <b>un solo pezzo</b>: in quel caso la sposta chi possiede il pezzo.</p><p>Una tavola occupata va solo <b>avanti o di lato</b>.</p><p><b>Prova:</b> tocca una casella vuota della tavola QL1 (in basso a sinistra), poi uno degli agganci evidenziati.</p>`],
    en: ['Moving an attack board', `<p>Moving an attack board takes a whole turn, and the board carries its pieces along. It can move when empty or when it carries <b>exactly one piece</b>; then the owner of that piece moves it.</p><p>An occupied board moves only <b>forward or sideways</b>.</p><p><b>Try it:</b> tap an empty square of board QL1 (bottom left), then one of the highlighted pins.</p>`],
  },
  {
    id: 'promotion',
    pieces: [['b7B', 'P', W], ['c1W', 'K', W], ['d9KL6', 'K', B]],
    goal: (m) => m.from === 'b7B' && !!m.promotion,
    it: ['Promozione', `<p>Il pedone si promuove sulla traversa più lontana della sua colonna. Per le colonne b e c è la traversa 8, sulla tavola B. Per z ed e è la 9; per a e d è la 9 se lì c'è una tavola d'attacco, altrimenti la 8.</p><p><b>Prova:</b> porta il pedone <code>b7B</code> in b8 e scegli il pezzo.</p>`],
    en: ['Promotion', `<p>A pawn promotes on the furthest rank of its file. For files b and c that is rank 8, on board B. For z and e it is rank 9; for a and d it is rank 9 if an attack board is there, otherwise rank 8.</p><p><b>Try it:</b> move the pawn on <code>b7B</code> to b8 and pick a piece.</p>`],
  },
  {
    id: 'mate',
    pieces: [['d4N', 'Q', W], ['d1W', 'K', W], ['z9QL6', 'K', B], ['z8QL6', 'P', B], ['a8QL6', 'P', B], ['a8B', 'P', B]],
    goal: (m) => m.from === 'd4N' && m.to === 'd9KL6',
    it: ['Scacco matto', `<p>Il re nero è chiuso nell'angolo in alto, sulla tavola QL6, dietro i suoi pedoni. Vista dall'alto, la traversa 9 va da z9 a e9: in mezzo non ci sono caselle, quindi la donna può attraversare quel vuoto.</p><p><b>Prova:</b> dai scacco matto in una mossa con la donna. Indizio: sali lungo la colonna d.</p>`],
    en: ['Checkmate', `<p>The black king is shut in the top corner, on board QL6, behind its pawns. Seen from above, rank 9 runs from z9 to e9: there are no squares in between, so the queen can cross that gap.</p><p><b>Try it:</b> checkmate in one move with the queen. Hint: go up file d.</p>`],
  },
];

// Build the lesson's game from the engine's Game class (start position, or a custom one).
export function lessonGame(Game, lesson) {
  const g = new Game({ white: 'human', black: 'tutorial' }); // Black never moves in a lesson
  g.id = 'lesson-' + lesson.id;
  if (!lesson.start) {
    g.pieces = {};
    for (const [sq, type, color] of lesson.pieces) g.pieces[sq] = { type, color, moved: true };
    g.boards = { ...BOARDS };
  }
  return g;
}

const UI = {
  it: { title: 'Tutorial Tri-D', lesson: 'Lezione {i} di {n}', prev: 'Indietro', next: 'Avanti', retry: 'Riprova', close: 'Chiudi', done: 'Ben fatto!', wrong: 'Mossa valida, ma non è quella della lezione: riprova.', finish: 'Hai finito il tutorial: ora gioca una partita!', play: 'Gioca' },
  en: { title: 'Tri-D tutorial', lesson: 'Lesson {i} of {n}', prev: 'Back', next: 'Next', retry: 'Retry', close: 'Close', done: 'Well done!', wrong: 'A legal move, but not the one this lesson asks for: try again.', finish: 'You finished the tutorial: now play a game!', play: 'Play' },
};

const CSS = `
#tutorial { position: fixed; z-index: 30; left: 50%; transform: translateX(-50%); bottom: calc(14px + env(safe-area-inset-bottom, 0px)); width: min(560px, calc(100vw - 24px)); max-height: 46vh; max-height: 46dvh; display: flex; flex-direction: column; background: rgba(10,8,20,.95); border-left: 14px solid var(--peach, #fc9); border-radius: 0 16px 16px 0; box-shadow: 0 20px 60px rgba(0,0,0,.6); backdrop-filter: blur(6px); }
#tutorial[hidden] { display: none; }
#tutorial .th { display: flex; align-items: center; gap: 8px; padding: 10px 12px 0 14px; }
#tutorial .tk { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted, #998); }
#tutorial .tx { margin-left: auto; }
#tutorial h3 { margin: 4px 14px 0; font-size: 16px; color: var(--peach, #fc9); }
#tutorial .tb { overflow-y: auto; padding: 0 14px; font-size: 14px; line-height: 1.45; }
#tutorial .tb p { margin: 6px 0; }
#tutorial code { background: #1e1936; padding: 1px 5px; border-radius: 4px; }
#tutorial .tf { display: flex; align-items: center; gap: 6px; padding: 8px 12px 10px 14px; flex-wrap: wrap; }
#tutorial .tmsg { flex: 1 1 140px; font-size: 13px; min-height: 1em; }
#tutorial .tmsg.ok { color: #66ffcc; } #tutorial .tmsg.bad { color: var(--peach, #fc9); }
#tutorial .tdots { display: flex; gap: 4px; }
#tutorial .tdots i { width: 7px; height: 7px; border-radius: 50%; background: #3a3358; }
#tutorial .tdots i.on { background: var(--peach, #fc9); } #tutorial .tdots i.ok { background: #66ffcc; }
body.tutorial-on #replayBar { display: none; }
@media (max-width: 700px) { body.tutorial-on #panel { display: none; } }
@media (min-width: 760px) { #tutorial { left: auto; right: 44px; transform: none; width: min(460px, calc(100vw - 330px)); } }
`;

/**
 * show(state)    puts a lesson state on screen (the app treats it like a local human game)
 * restore()      gives the screen back to the live game
 * Game           the Tri-D engine class
 */
export function createTutorial({ Game, getLang, onLangChange, show, restore }) {
  let el = null, idx = 0, game = null, solved = new Set(), msg = { key: '', cls: '' };
  const L = () => UI[getLang()] || UI.en;

  function build() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    el = document.createElement('section');
    el.id = 'tutorial';
    el.hidden = true;
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `<div class="th"><span class="tk"></span><span class="tdots"></span><button class="red mini tx" type="button"></button></div>
      <h3></h3><div class="tb"></div>
      <div class="tf"><span class="tmsg"></span><button class="blue mini tp" type="button"></button><button class="lilac mini tr" type="button"></button><button class="orange mini tn" type="button"></button></div>`;
    document.body.append(el);
    el.querySelector('.tx').onclick = close;
    el.querySelector('.tp').onclick = () => go(idx - 1);
    el.querySelector('.tr').onclick = () => go(idx);
    el.querySelector('.tn').onclick = () => (idx === LESSONS.length - 1 ? close() : go(idx + 1));
    onLangChange(() => { if (!el.hidden) render(); });
  }

  function render() {
    const ui = L(), lesson = LESSONS[idx], [title, html] = lesson[getLang()] || lesson.en;
    el.querySelector('.tk').textContent = ui.lesson.replace('{i}', idx + 1).replace('{n}', LESSONS.length);
    el.querySelector('.tdots').innerHTML = LESSONS.map((l, i) => `<i class="${i === idx ? 'on' : solved.has(l.id) ? 'ok' : ''}"></i>`).join('');
    el.querySelector('.tx').textContent = ui.close;
    el.querySelector('h3').textContent = title;
    el.querySelector('.tb').innerHTML = html;
    const m = el.querySelector('.tmsg');
    m.textContent = msg.key === 'finish' ? ui.finish : msg.key ? ui[msg.key] : '';
    m.className = 'tmsg ' + msg.cls;
    const tp = el.querySelector('.tp'), tr = el.querySelector('.tr'), tn = el.querySelector('.tn');
    tp.textContent = ui.prev; tp.disabled = idx === 0;
    tr.textContent = ui.retry; tr.hidden = !lesson.goal;
    tn.textContent = idx === LESSONS.length - 1 ? ui.play : ui.next;
    el.setAttribute('aria-label', ui.title);
  }

  function go(i) {
    idx = Math.max(0, Math.min(LESSONS.length - 1, i));
    game = lessonGame(Game, LESSONS[idx]);
    msg = { key: '', cls: '' };
    render();
    show(game.snapshot());
    el.querySelector('.tb').scrollTop = 0;
  }

  function open(i = 0) {
    if (!el) build();
    solved = new Set(solved);
    el.hidden = false;
    document.body.classList.add('tutorial-on');
    go(i);
  }

  function close() {
    if (!el || el.hidden) return;
    el.hidden = true;
    document.body.classList.remove('tutorial-on');
    game = null;
    restore();
  }

  // a move made on the board while a lesson is open
  function move({ from, to, promotion = null }) {
    const lesson = LESSONS[idx];
    if (!game || !lesson.goal || game.turn !== 'white') return;
    const cand = game.legal().find((m) => m.from === from && m.to === to && (!m.promotion || !promotion || m.promotion === promotion));
    if (!cand) return;
    if (!lesson.goal({ ...cand, promotion: promotion || cand.promotion })) { msg = { key: 'wrong', cls: 'bad' }; render(); return; }
    game.move(from, to, promotion);
    solved.add(lesson.id);
    msg = idx === LESSONS.length - 1 ? { key: 'finish', cls: 'ok' } : { key: 'done', cls: 'ok' };
    render();
    show(game.snapshot());
  }

  return { open, close, move, active: () => !!(el && !el.hidden) };
}
