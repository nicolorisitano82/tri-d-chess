// Rules page: a full-screen, searchable overlay with the rules of Tri-D chess (Meder's
// tournament rules, as implemented) and classic chess (FIDE), in Italian and English.
// Open it with the "Rules" button, or with ?rules / ?rules=chess in the URL.

const RULES = {
  it: {
    title: 'Regole', search: 'Cerca nelle regole…', close: 'Chiudi', none: 'Nessun risultato per «{q}»',
    results: '{n} sezioni trovate', tabs: { trid: 'Scacchi 3D (Tri-D)', chess: 'Scacchi classici' },
    trid: [
      ['Il gioco', `<p>Gli scacchi tridimensionali si giocano su più scacchiere sovrapposte. Qui si seguono le <b>regole da torneo di Jens Meder</b>. Pezzi e scopo sono quelli degli scacchi normali: vince chi dà scacco matto al re avversario.</p>`],
      ['La scacchiera', `<p>Ci sono <b>tre tavole principali</b> fisse, 4×4, con colonne a–d:</p>
        <ul><li><b>W</b> (Bianco): traverse 1–4, la più bassa;</li><li><b>N</b> (neutrale): traverse 3–6, in mezzo;</li><li><b>B</b> (Nero): traverse 5–8, la più alta.</li></ul>
        <p>Ci sono poi <b>quattro tavole d'attacco</b> 2×2, mobili, appoggiate su <b>agganci</b>. Gli agganci sono 12: QL1–QL6 sul lato di donna (colonne z–a) e KL1–KL6 sul lato di re (colonne d–e).</p>
        <table><tr><th>Aggancio</th><th>Traverse</th><th>Vicino a</th></tr><tr><td>1</td><td>0–1</td><td>W</td></tr><tr><td>2</td><td>4–5</td><td>W</td></tr><tr><td>3</td><td>2–3</td><td>N</td></tr><tr><td>4</td><td>6–7</td><td>N</td></tr><tr><td>5</td><td>4–5</td><td>B</td></tr><tr><td>6</td><td>8–9</td><td>B</td></tr></table>
        <p>Viste dall'alto, le colonne sono z a b c d e (6) e le traverse 0–9 (10).</p>`],
      ['Nomi delle caselle', `<p>Ogni casella si scrive <b>colonna + traversa + livello</b>, per esempio <code>a2W</code>, <code>c5N</code>, <code>d0KL1</code> o <code>z9QL6</code>.</p>
        <p>Le caselle di una tavola d'attacco prendono il nome dell'aggancio su cui si trova: se la tavola si sposta, cambiano nome. La stessa colonna e traversa può esistere su più livelli.</p>`],
      ['Posizione iniziale', `<p>Il Bianco ha le tavole d'attacco su QL1 e KL1, il Nero su QL6 e KL6.</p>
        <ul><li><b>Bianco</b>: torre z0QL1, donna a0QL1, re d0KL1, torre e0KL1; pedoni z1QL1, a1QL1, d1KL1, e1KL1; cavalli a1W e d1W, alfieri b1W e c1W; pedoni a2W–d2W.</li>
        <li><b>Nero</b>: specchiato, con torre z9QL6, donna a9QL6, re d9KL6, torre e9KL6; pedoni sulla traversa 8 delle tavole d'attacco; cavalli a8B e d8B, alfieri b8B e c8B; pedoni a7B–d7B.</li></ul>
        <p>Muove per primo il Bianco.</p>`],
      ['Come si muovono i pezzi', `<p>Si immagina tutta la scacchiera <b>schiacciata vista dall'alto</b> su una griglia 6×10. Una mossa è valida se lo è su questa proiezione, con le regole normali degli scacchi.</p>
        <p>Il pezzo può poi atterrare su <b>qualunque livello</b> che abbia una casella in quella colonna e traversa, purché sia libera o occupata da un pezzo avversario.</p>
        <ul><li>Un pezzo <b>blocca il passaggio</b> sulla sua colonna e traversa a tutti i livelli.</li><li>Il <b>cavallo salta</b>, come negli scacchi normali.</li><li>Non esistono mosse puramente verticali, cioè stessa casella su un altro livello.</li></ul>`],
      ['Pedoni', `<p>Il pedone avanza di una casella, o di due alla prima mossa se il percorso è libero, e cattura in diagonale in avanti. Il Bianco va verso la traversa 9, il Nero verso la 0.</p>
        <p>Un pedone trasportato da una tavola d'attacco perde il passo doppio.</p>`],
      ['Presa en passant', `<p>Se un pedone ha appena fatto il passo doppio, un pedone avversario accanto può catturarlo come se avesse avanzato di una sola casella. Si può fare solo alla mossa immediatamente successiva, e il pedone che cattura può atterrare su uno qualunque dei livelli disponibili.</p>`],
      ['Promozione', `<p>Il pedone che raggiunge la traversa più lontana della sua colonna diventa donna, torre, alfiere o cavallo, a scelta. La traversa più lontana dipende dalla colonna:</p>
        <ul><li>colonne <b>b, c</b>: traversa 8 per il Bianco, 1 per il Nero;</li><li>colonne <b>z, e</b>: 9 / 0;</li><li>colonne <b>a, d</b>: 9 / 0 se una tavola d'attacco sovrasta quell'angolo, altrimenti 8 / 1.</li></ul>
        <p>Se una tavola d'attacco si sposta e lascia un pedone sulla sua traversa più lontana, il pedone diventa donna.</p>`],
      ['Arrocco', `<p>Re e torre non devono essersi mai mossi e devono stare sulla stessa traversa, senza pezzi in mezzo. Il re non può essere sotto scacco né finire sotto scacco. L'arrocco non può essere la prima mossa del giocatore.</p>
        <ul><li><b>Corto (0-0)</b>: re e torre si scambiano di posto.</li><li><b>Lungo (0-0-0)</b>: il re va accanto alla torre e la torre va sulla casa del re.</li></ul>
        <p>Nell'app si arrocca muovendo il re sulla sua casella d'arrocco.</p>`],
      ["Spostare una tavola d'attacco", `<p>Spostare una tavola d'attacco occupa un turno intero, e la tavola porta con sé i pezzi che ha sopra.</p>
        <ul><li>Si sposta su un aggancio <b>libero e collegato</b>: 1–2, 1–3, 2–3, 2–4, 3–4, 3–5, 4–5, 4–6, 5–6 sullo stesso lato, oppure <b>di lato</b> (QLn ↔ KLn).</li>
        <li>Se è <b>vuota</b>, la sposta il suo proprietario. Se porta <b>un solo pezzo</b>, la sposta chi possiede quel pezzo, e così può prenderne il controllo. Con due o più pezzi sopra è bloccata.</li>
        <li>Una tavola occupata va solo <b>avanti o di lato</b>; solo una tavola vuota può tornare indietro.</li>
        <li>Lo spostamento non può lasciare il proprio re sotto scacco.</li></ul>
        <p>Nell'app tocchi una casella vuota della tavola, poi l'aggancio di arrivo evidenziato.</p>`],
      ['Scacco, matto e patta', `<p>Scacco, scacco matto e stallo funzionano come negli scacchi normali.</p>
        <p>La partita è <b>patta</b> per stallo, per triplice ripetizione della posizione, se nessuno dei due ha materiale sufficiente per dare matto, o dopo 50 mosse senza catture né mosse di pedone.</p>
        <p>Nelle partite in rete con l'orologio perde chi esaurisce il tempo. La partita è però patta se l'avversario non potrebbe mai dare matto.</p>`],
      ["Usare l'app", `<ul><li>Tocca un pezzo per vedere le sue mosse, poi tocca la casella di arrivo. Se la stessa casella esiste su più livelli, scegli quello giusto.</li><li>Il pulsante <b>Vista</b> cambia inquadratura; puoi ruotare e zoomare con il mouse o con le dita.</li><li>Dal menu <b>Pezzi</b> scegli il set del Bianco e del Nero: Federazione, Klingon, Borg o Romulani.</li></ul>`],
    ],
    chess: [
      ['Il gioco', `<p>Gli scacchi classici si giocano su una scacchiera 8×8 secondo le <b>regole FIDE</b>. Lo scopo è dare scacco matto al re avversario. Muove per primo il Bianco.</p>`],
      ['Scacchiera e caselle', `<p>Le colonne vanno da <b>a</b> a <b>h</b> e le traverse da <b>1</b> a <b>8</b>; ogni casella ha un nome come <code>e4</code>. La casa d'angolo in basso a destra di ogni giocatore è chiara.</p>
        <p>Il Bianco parte dalle traverse 1–2, il Nero dalle 7–8. Sulla prima traversa, da a a h: torre, cavallo, alfiere, donna, re, alfiere, cavallo, torre. La donna sta sulla casa del suo colore (d1 / d8).</p>`],
      ['Re', `<p>Il re si muove di una casella in qualunque direzione. Non può andare su una casella attaccata dall'avversario.</p>`],
      ['Donna', `<p>La donna si muove di quante caselle vuole in orizzontale, in verticale o in diagonale, senza saltare i pezzi.</p>`],
      ['Torre', `<p>La torre si muove di quante caselle vuole in orizzontale o in verticale, senza saltare i pezzi.</p>`],
      ['Alfiere', `<p>L'alfiere si muove di quante caselle vuole in diagonale, senza saltare i pezzi, e resta sempre sulle case del suo colore.</p>`],
      ['Cavallo', `<p>Il cavallo si muove a «L»: due caselle in una direzione e una di lato. È l'unico pezzo che <b>salta</b> gli altri.</p>`],
      ['Pedoni', `<p>Il pedone avanza di una casella, o di due dalla posizione iniziale se il percorso è libero. Cattura in diagonale una casella in avanti.</p>`],
      ['Presa en passant', `<p>Se un pedone avanza di due caselle e finisce accanto a un pedone avversario, quest'ultimo può catturarlo come se avesse avanzato di una sola casella. Si può fare solo alla mossa immediatamente successiva.</p>`],
      ['Promozione', `<p>Il pedone che raggiunge l'ultima traversa (la 8 per il Bianco, la 1 per il Nero) diventa a scelta donna, torre, alfiere o cavallo.</p>`],
      ['Arrocco', `<p>Il re si sposta di due caselle verso una torre, e la torre lo scavalca e si mette accanto a lui.</p>
        <ul><li><b>Corto (0-0)</b>: re in g1, torre in f1 (per il Nero g8 e f8).</li><li><b>Lungo (0-0-0)</b>: re in c1, torre in d1 (per il Nero c8 e d8).</li></ul>
        <p>Re e torre non devono essersi mai mossi e tra loro non ci devono essere pezzi. Il re non può essere sotto scacco, né attraversare o raggiungere una casella attaccata. Nell'app si arrocca muovendo il re di due caselle.</p>`],
      ['Scacco e scacco matto', `<p>Il re attaccato è <b>sotto scacco</b>, e il giocatore deve pararlo subito: spostando il re, catturando il pezzo che dà scacco o mettendo un pezzo in mezzo. Se non c'è modo di farlo è <b>scacco matto</b>, e la partita è persa.</p>`],
      ['Patta', `<ul><li><b>Stallo</b>: chi deve muovere non ha mosse legali ma non è sotto scacco.</li><li><b>Triplice ripetizione</b> della stessa posizione.</li><li><b>Materiale insufficiente</b>: nessuno dei due può dare matto, per esempio re contro re o re e alfiere contro re.</li><li><b>Regola delle 50 mosse</b>: 50 mosse per parte senza catture né mosse di pedone.</li><li>Con l'orologio, se finisce il tempo ma l'avversario non potrebbe mai dare matto.</li></ul>`],
      ["Usare l'app", `<ul><li>Tocca un pezzo, poi la casella di arrivo; le mosse possibili sono evidenziate.</li><li>Il pulsante <b>Vista</b> alterna il lato del Bianco, del Nero e la vista laterale.</li><li>Computer, gioco in rete, orologio, replay e AI via MCP funzionano come nel Tri-D.</li></ul>`],
    ],
  },
  en: {
    title: 'Rules', search: 'Search the rules…', close: 'Close', none: 'No results for “{q}”',
    results: '{n} sections found', tabs: { trid: '3D chess (Tri-D)', chess: 'Classic chess' },
    trid: [
      ['The game', `<p>Three-dimensional chess is played on several stacked boards. This app follows <b>Jens Meder's tournament rules</b>. The pieces and the goal are those of normal chess: checkmate the opponent's king.</p>`],
      ['The board', `<p>There are <b>three fixed main boards</b>, each 4×4 with files a–d:</p>
        <ul><li><b>W</b> (White): ranks 1–4, lowest;</li><li><b>N</b> (neutral): ranks 3–6, middle;</li><li><b>B</b> (Black): ranks 5–8, highest.</li></ul>
        <p>There are also <b>four movable 2×2 attack boards</b> that sit on <b>pins</b>. There are 12 pins: QL1–QL6 on the queen side (files z–a) and KL1–KL6 on the king side (files d–e).</p>
        <table><tr><th>Pin</th><th>Ranks</th><th>Next to</th></tr><tr><td>1</td><td>0–1</td><td>W</td></tr><tr><td>2</td><td>4–5</td><td>W</td></tr><tr><td>3</td><td>2–3</td><td>N</td></tr><tr><td>4</td><td>6–7</td><td>N</td></tr><tr><td>5</td><td>4–5</td><td>B</td></tr><tr><td>6</td><td>8–9</td><td>B</td></tr></table>
        <p>Seen from above, the files are z a b c d e (6) and the ranks 0–9 (10).</p>`],
      ['Square names', `<p>A square is written <b>file + rank + level</b>, for example <code>a2W</code>, <code>c5N</code>, <code>d0KL1</code> or <code>z9QL6</code>.</p>
        <p>The squares of an attack board are named after the pin it sits on, so they change name when the board moves. The same file and rank can exist on several levels.</p>`],
      ['Starting position', `<p>White's attack boards start on QL1 and KL1, Black's on QL6 and KL6.</p>
        <ul><li><b>White</b>: rook z0QL1, queen a0QL1, king d0KL1, rook e0KL1; pawns z1QL1, a1QL1, d1KL1, e1KL1; knights a1W and d1W, bishops b1W and c1W; pawns a2W–d2W.</li>
        <li><b>Black</b>: mirrored, with rook z9QL6, queen a9QL6, king d9KL6, rook e9KL6; pawns on rank 8 of the attack boards; knights a8B and d8B, bishops b8B and c8B; pawns a7B–d7B.</li></ul>
        <p>White moves first.</p>`],
      ['How pieces move', `<p>Imagine the whole board <b>flattened as seen from above</b> onto a 6×10 grid. A move is legal if it is a normal chess move on that projection.</p>
        <p>The piece can then land on <b>any level</b> that has a square at that file and rank, as long as the square is empty or holds an enemy piece.</p>
        <ul><li>A piece <b>blocks</b> its file and rank on every level.</li><li><b>Knights jump</b>, as in normal chess.</li><li>Purely vertical moves (same square on another level) are not allowed.</li></ul>`],
      ['Pawns', `<p>A pawn moves one square forward, or two on its first move if the path is clear, and captures diagonally forward. White moves towards rank 9, Black towards rank 0.</p>
        <p>A pawn carried by an attack board loses its double step.</p>`],
      ['En passant', `<p>If a pawn has just made a double step, an enemy pawn next to it can capture it as if it had moved only one square. This is allowed on the very next move only, and the capturing pawn may land on any available level.</p>`],
      ['Promotion', `<p>A pawn that reaches the furthest rank of its file becomes a queen, rook, bishop or knight, as you choose. The furthest rank depends on the file:</p>
        <ul><li>files <b>b, c</b>: rank 8 for White, 1 for Black;</li><li>files <b>z, e</b>: 9 / 0;</li><li>files <b>a, d</b>: 9 / 0 if an attack board overhangs that corner, otherwise 8 / 1.</li></ul>
        <p>If an attack board moves away and leaves a pawn on its furthest rank, the pawn becomes a queen.</p>`],
      ['Castling', `<p>The king and rook must never have moved and must stand on the same rank with nothing between them. The king may not be in check or land in check. Castling cannot be a player's first move.</p>
        <ul><li><b>King side (0-0)</b>: the king and rook swap places.</li><li><b>Queen side (0-0-0)</b>: the king goes next to the rook and the rook goes to the king's square.</li></ul>
        <p>In the app, castle by moving the king onto its castling square.</p>`],
      ['Moving an attack board', `<p>Moving an attack board takes a whole turn, and the board carries the pieces on it.</p>
        <ul><li>It moves to an <b>empty, linked pin</b>: 1–2, 1–3, 2–3, 2–4, 3–4, 3–5, 4–5, 4–6, 5–6 on the same side, or <b>sideways</b> (QLn ↔ KLn).</li>
        <li>An <b>empty</b> board is moved by its owner. A board carrying <b>exactly one piece</b> is moved by that piece's owner, who can take control of it this way. With two or more pieces on it, the board is locked.</li>
        <li>An occupied board moves only <b>forward or sideways</b>; only an empty board may move backwards.</li>
        <li>The move must not leave your own king in check.</li></ul>
        <p>In the app, tap an empty square of the board, then the highlighted target pin.</p>`],
      ['Check, mate and draws', `<p>Check, checkmate and stalemate work as in normal chess.</p>
        <p>The game is a <b>draw</b> by stalemate, by threefold repetition of the position, when neither side has enough material to mate, or after 50 moves without a capture or a pawn move.</p>
        <p>In clocked online games, a player who runs out of time loses. It is a draw instead if the opponent could never mate.</p>`],
      ['Using the app', `<ul><li>Tap a piece to see its moves, then tap the target square. When the same square exists on several levels, pick the one you want.</li><li>The <b>View</b> button changes the camera angle; you can rotate and zoom with the mouse or your fingers.</li><li>Use the <b>Pieces</b> menu to choose White's and Black's set: Federation, Klingon, Borg or Romulan.</li></ul>`],
    ],
    chess: [
      ['The game', `<p>Classic chess is played on an 8×8 board under the <b>FIDE Laws of Chess</b>. The goal is to checkmate the opponent's king. White moves first.</p>`],
      ['Board and squares', `<p>Files run from <b>a</b> to <b>h</b> and ranks from <b>1</b> to <b>8</b>; each square has a name like <code>e4</code>. Each player has a light square in the bottom-right corner.</p>
        <p>White starts on ranks 1–2 and Black on ranks 7–8. On the first rank, from a to h: rook, knight, bishop, queen, king, bishop, knight, rook. The queen stands on her own colour (d1 / d8).</p>`],
      ['King', `<p>The king moves one square in any direction. It may not move to a square attacked by the opponent.</p>`],
      ['Queen', `<p>The queen moves any number of squares horizontally, vertically or diagonally, without jumping over pieces.</p>`],
      ['Rook', `<p>The rook moves any number of squares horizontally or vertically, without jumping over pieces.</p>`],
      ['Bishop', `<p>The bishop moves any number of squares diagonally, without jumping over pieces, and always stays on squares of one colour.</p>`],
      ['Knight', `<p>The knight moves in an "L": two squares in one direction and one to the side. It is the only piece that <b>jumps</b> over others.</p>`],
      ['Pawns', `<p>A pawn moves one square forward, or two from its starting square if the path is clear. It captures diagonally, one square forward.</p>`],
      ['En passant', `<p>If a pawn moves two squares and lands next to an enemy pawn, that pawn can capture it as if it had moved only one square. This is allowed on the very next move only.</p>`],
      ['Promotion', `<p>A pawn that reaches the last rank (8 for White, 1 for Black) becomes a queen, rook, bishop or knight, as you choose.</p>`],
      ['Castling', `<p>The king moves two squares towards a rook, and the rook jumps over to the square next to it.</p>
        <ul><li><b>King side (0-0)</b>: king to g1, rook to f1 (g8 and f8 for Black).</li><li><b>Queen side (0-0-0)</b>: king to c1, rook to d1 (c8 and d8 for Black).</li></ul>
        <p>The king and rook must never have moved, and there must be nothing between them. The king may not be in check, nor pass through or land on an attacked square. In the app, castle by moving the king two squares.</p>`],
      ['Check and checkmate', `<p>A king that is attacked is <b>in check</b>, and the player must deal with it at once: move the king, capture the checking piece, or block the attack. If that is impossible it is <b>checkmate</b>, and the game is lost.</p>`],
      ['Draws', `<ul><li><b>Stalemate</b>: the player to move has no legal move but is not in check.</li><li><b>Threefold repetition</b> of the same position.</li><li><b>Insufficient material</b>: neither side can mate, for example king against king, or king and bishop against king.</li><li><b>50-move rule</b>: 50 moves by each side with no capture or pawn move.</li><li>With a clock, when time runs out but the opponent could never mate.</li></ul>`],
      ['Using the app', `<ul><li>Tap a piece, then the target square; the possible moves are highlighted.</li><li>The <b>View</b> button switches between White's side, Black's side and a side view.</li><li>The computer, online play, clock, replay and AI via MCP all work as in Tri-D.</li></ul>`],
    ],
  },
};

const CSS = `
#rulesPage { position: fixed; inset: 0; z-index: 60; display: flex; justify-content: center; background: rgba(0,0,6,.72); backdrop-filter: blur(4px); padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom)); }
#rulesPage[hidden] { display: none; }
#rulesPage .rcard { width: min(760px, 100%); display: flex; flex-direction: column; background: rgba(10,8,20,.98); border-left: 14px solid var(--orange, #f90); border-radius: 0 18px 18px 0; box-shadow: 0 30px 80px rgba(0,0,0,.6); overflow: hidden; }
#rulesPage .rhead { display: grid; gap: 10px; padding: 14px 16px 10px; border-bottom: 1px solid #2a2440; }
#rulesPage .rtop { display: flex; align-items: center; gap: 10px; }
#rulesPage h2 { margin: 0; font-size: 18px; letter-spacing: .12em; text-transform: uppercase; color: var(--orange, #f90); }
#rulesPage .rclose { margin-left: auto; }
#rulesPage .rtabs { display: flex; gap: 6px; flex-wrap: wrap; }
#rulesPage .rtabs button { flex: 1 1 0; min-width: 0; opacity: .55; }
#rulesPage .rtabs button[aria-selected="true"] { opacity: 1; }
#rulesPage input[type=search] { width: 100%; box-sizing: border-box; padding: 9px 12px; border-radius: 10px; border: 1px solid #3a3358; background: #120f22; color: inherit; font: inherit; font-size: 15px; }
#rulesPage .rcount { font-size: 12px; color: var(--muted, #998); min-height: 1em; }
#rulesPage .rbody { overflow-y: auto; padding: 6px 18px 20px; line-height: 1.5; font-size: 14.5px; -webkit-overflow-scrolling: touch; }
#rulesPage .rgame { margin: 18px 0 4px; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted, #998); }
#rulesPage section h3 { margin: 16px 0 4px; font-size: 15px; color: var(--sky, #9cf); }
#rulesPage section p, #rulesPage section ul { margin: 6px 0; }
#rulesPage section ul { padding-left: 20px; }
#rulesPage table { border-collapse: collapse; margin: 6px 0; font-size: 13px; }
#rulesPage th, #rulesPage td { border: 1px solid #3a3358; padding: 3px 10px; text-align: center; }
#rulesPage code { background: #1e1936; padding: 1px 5px; border-radius: 4px; }
#rulesPage mark { background: var(--orange, #f90); color: #000; border-radius: 3px; padding: 0 1px; }
`;

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Wrap every match of q (accent- and case-insensitive) in <mark>, text nodes only.
function highlight(root, q) {
  const fq = fold(q);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const text = n.nodeValue, ft = fold(text);
    if (!ft.includes(fq)) continue;
    const frag = document.createDocumentFragment();
    let i = 0, j;
    while ((j = ft.indexOf(fq, i)) !== -1) {
      frag.append(text.slice(i, j));
      const m = document.createElement('mark');
      m.textContent = text.slice(j, j + fq.length);
      frag.append(m);
      i = j + fq.length;
    }
    frag.append(text.slice(i));
    n.replaceWith(frag);
  }
}

export function createRules({ getLang, onLangChange }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const el = document.createElement('div');
  el.id = 'rulesPage';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'rulesTitle');
  el.innerHTML = `<div class="rcard">
    <div class="rhead">
      <div class="rtop"><h2 id="rulesTitle"></h2><button class="red rclose" type="button"></button></div>
      <div class="rtabs" role="tablist"><button class="orange" type="button" role="tab" data-g="trid"></button><button class="blue" type="button" role="tab" data-g="chess"></button></div>
      <input type="search" autocomplete="off" spellcheck="false">
      <div class="rcount" aria-live="polite"></div>
    </div>
    <div class="rbody"></div>
  </div>`;
  document.body.append(el);
  const $ = (s) => el.querySelector(s);
  const input = $('input'), body = $('.rbody'), count = $('.rcount');
  let game = 'trid', lastFocus = null;

  function render() {
    const R = RULES[getLang()] || RULES.en;
    $('#rulesTitle').textContent = R.title;
    $('.rclose').textContent = R.close;
    input.placeholder = R.search;
    input.setAttribute('aria-label', R.search);
    for (const b of el.querySelectorAll('.rtabs button')) {
      b.textContent = R.tabs[b.dataset.g];
      b.setAttribute('aria-selected', String(b.dataset.g === game));
    }
    const q = input.value.trim();
    // with a query, search both games (current one first); otherwise show the current game
    const games = q ? [game, game === 'trid' ? 'chess' : 'trid'] : [game];
    let html = '', n = 0;
    for (const g of games) {
      const secs = R[g].filter(([h, b]) => !q || fold(h + ' ' + b.replace(/<[^>]+>/g, ' ')).includes(fold(q)));
      if (!secs.length) continue;
      if (q) html += `<div class="rgame">${esc(R.tabs[g])}</div>`;
      for (const [h, b] of secs) html += `<section><h3>${esc(h)}</h3>${b}</section>`;
      n += secs.length;
    }
    body.innerHTML = html;
    if (q) highlight(body, q);
    count.textContent = q ? (n ? R.results.replace('{n}', n) : R.none.replace('{q}', q)) : '';
  }

  function open(g) {
    if (g === 'trid' || g === 'chess') game = g;
    input.value = '';
    lastFocus = document.activeElement;
    el.hidden = false;
    render();
    body.scrollTop = 0;
    // no auto-focus on touch screens: it would pop up the keyboard over the rules
    if (!matchMedia('(pointer: coarse)').matches) input.focus({ preventScroll: true });
  }
  function close() {
    el.hidden = true;
    lastFocus?.focus?.();
  }

  input.addEventListener('input', () => { render(); body.scrollTop = 0; });
  $('.rclose').onclick = close;
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  for (const b of el.querySelectorAll('.rtabs button')) b.onclick = () => { game = b.dataset.g; render(); body.scrollTop = 0; };
  onLangChange(() => { if (!el.hidden) render(); });

  return { open, close, isOpen: () => !el.hidden };
}
