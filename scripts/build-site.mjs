// Build the static website (English pages + the game at /play/) into site/, ready to upload by FTP.
//
// usage: node scripts/build-site.mjs --site=https://example.altervista.org
//   Every canonical URL, social card, sitemap entry and the game's share/replay links use --site.
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { page, esc, CSS } from './site/layout.mjs';
import { RULES } from '../public/rules.js';
import { VARIANTS } from '../src/draughts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const SITE = (args.find((a) => a.startsWith('--site='))?.split('=')[1] || '').replace(/\/+$/, '');
if (!/^https:\/\/[a-z0-9.-]+$/i.test(SITE)) {
  console.error('usage: node scripts/build-site.mjs --site=https://your-name.altervista.org');
  process.exit(1);
}
const OUT = join(root, 'site');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const today = new Date().toISOString().slice(0, 10);
const pages = []; // [path, priority]

function write(path, html, priority = 0.6) {
  const file = join(OUT, path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  pages.push([path, priority]);
}
const slug = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const P = (o) => page({ site: SITE, ...o });

// --- assets and the game ------------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'assets'), { recursive: true });
writeFileSync(join(OUT, 'assets/site.css'), CSS);
cpSync(join(root, 'website/assets'), join(OUT, 'assets'), { recursive: true });
// the game: icons first (the service worker lists them), then the page built for this site
cpSync(join(root, 'docs/play/icons'), join(OUT, 'play/icons'), { recursive: true });
execFileSync(process.execPath, [join(root, 'scripts/build-web.mjs'), '--target=pages', `--site=${SITE}`, join(OUT, 'play/index.html')], { stdio: 'inherit' });
pages.push(['/play/', 0.9]);

// --- shared pieces --------------------------------------------------------------------------
const playBox = (text, href = '/play/', label = 'Play now') =>
  `<div class="playbox"><p>${text}</p><a class="btn orange" href="${href}">${label}</a></div>`;
const related = (links) => `<nav class="related" aria-label="Related pages"><h2 class="bar" style="background:var(--lilac)">Read next</h2><ul>${
  links.map(([n, p]) => `<li><a href="${p}">${esc(n)}</a></li>`).join('')}</ul></nav>`;
const toc = (items) => `<aside class="toc" aria-label="On this page"><h2>On this page</h2><ol>${
  items.map(([id, n]) => `<li><a href="#${id}">${esc(n)}</a></li>`).join('')}</ol></aside>`;
// a rules section from the game's own rules page (public/rules.js): [title, html]
const sections = (list) => list.map(([title, html]) => ({ id: slug(title), title, html }));
const sectionHtml = (s) => `<section id="${s.id}" aria-labelledby="${s.id}-h"><h2 id="${s.id}-h">${esc(s.title)}</h2>\n${s.html}</section>`;
const article = ({ head, secs, after = '', extraToc = [] }) => `<div class="wrap page-head">${head}</div>
<div class="wrap layout">
  <article class="prose">
${secs.map(sectionHtml).join('\n')}
${after}
  </article>
  ${toc([...secs.map((s) => [s.id, s.title]), ...extraToc])}
</div>`;

const APP_LD = {
  '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Tri-D Chess', url: `${SITE}/play/`,
  description: 'Free three-dimensional chess (Meder tournament rules), classic chess and five draughts variants in the browser: play the computer or a friend online.',
  applicationCategory: 'GameApplication', genre: ['Board game', 'Chess', 'Draughts'], operatingSystem: 'Any (web browser), macOS',
  browserRequirements: 'Requires a browser with WebGL', inLanguage: ['en', 'it'], isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, image: `${SITE}/assets/og-image.jpg`,
  softwareVersion: version, license: 'https://www.gnu.org/licenses/gpl-3.0.html',
  sameAs: ['https://github.com/nicolorisitano82/tri-d-chess'],
};

// --- home -----------------------------------------------------------------------------------
const GAMES = [
  { img: 'board', alt: 'The 3D chessboard: three main levels and four attack boards in space', title: '3D chess (Tri-D)',
    text: 'Seven levels, movable attack boards and Jens Meder’s tournament rules: chess in three dimensions, finally playable.',
    rules: '/rules/3d-chess/', play: '/play/?game=trid', accent: 'var(--orange)' },
  { img: 'chess', alt: 'A classic chessboard in a torch-lit medieval hall', title: 'Classic chess',
    text: 'Standard FIDE chess on a walnut-and-maple board in a torch-lit medieval hall, with ivory and ebony pieces.',
    rules: '/rules/chess/', play: '/play/?game=chess', accent: 'var(--sky)' },
  { img: 'draughts', alt: 'A draughts board with light and dark discs and a crowned king', title: 'Draughts & checkers',
    text: 'Italian, international (10×10), English checkers, Russian and Brazilian draughts, each with its own capture rules.',
    rules: '/rules/draughts/', play: '/play/?game=dama-it', accent: 'var(--lilac)' },
];
const imgOf = (name) => existsSync(join(root, 'website/assets', name + '.webp')) ? name : 'board';
write('/', P({
  path: '/', title: 'Tri-D Chess — play free 3D chess online in your browser',
  description: 'Play 3D chess online for free: seven levels, movable attack boards, Meder rules. Plus chess and draughts, a computer opponent and online play. No sign-up.',
  jsonld: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Tri-D Chess', url: SITE + '/', inLanguage: 'en' }, APP_LD],
  body: `<div class="wrap hero">
  <div>
    <span class="eyebrow">Chess on seven levels</span>
    <h1>Play <em>3D chess</em> online, free, in your browser.</h1>
    <p class="lede">Three fixed boards, four attack boards that move with the pieces on them, and Jens Meder’s tournament rules. Play the computer, challenge a friend online, or learn step by step with the interactive tutorial. No download, no account.</p>
    <div class="cta">
      <a class="btn orange" href="/play/">Play now</a>
      <a class="btn peach" href="/play/?tutorial">Start the tutorial</a>
      <a class="btn lilac" href="/rules/3d-chess/">Read the rules</a>
    </div>
  </div>
  <figure class="shot">
    <img src="/assets/board.webp" width="1600" height="964" alt="The 3D chessboard in mid-game: three main levels, attack boards, move log and statistics panel" fetchpriority="high">
    <figcaption>A game in progress: move log, statistics and attack boards at the four corners.</figcaption>
  </figure>
</div>

<section aria-labelledby="games-h">
  <div class="wrap">
    <span class="bar" style="background:var(--orange)">Three games</span>
    <h2 id="games-h">3D chess, classic chess and draughts in one place</h2>
    <div class="grid">
${GAMES.map((g) => `      <div class="card game-card" style="--accent:${g.accent}">
        <img src="/assets/${imgOf(g.img)}.webp" width="1600" height="964" alt="${esc(g.alt)}" loading="lazy">
        <div class="in"><h3>${g.title}</h3><p>${g.text}</p>
          <div class="links"><a href="${g.play}">Play ${g.title.split(' (')[0].toLowerCase().replace(' & checkers', '')}</a><a href="${g.rules}">Rules</a></div></div>
      </div>`).join('\n')}
    </div>
  </div>
</section>

<section aria-labelledby="feat-h">
  <div class="wrap">
    <span class="bar" style="background:var(--lilac)">Features</span>
    <h2 id="feat-h">Everything you need to play</h2>
    <div class="grid">
      <div class="card" style="--accent:var(--orange)"><h3>Official rules</h3><p>Meder’s tournament rules for 3D chess: castling, en passant across levels, promotion by file, draws by repetition and material.</p></div>
      <div class="card" style="--accent:var(--peach)"><h3>Computer opponent</h3><p>Five levels from Beginner to Master and three styles: balanced, aggressive or cautious. It runs in your browser, even offline.</p></div>
      <div class="card" style="--accent:var(--sky)"><h3>Online with friends</h3><p>Create a room and send the link, or join someone from the public lobby. Games travel directly between the two browsers.</p></div>
      <div class="card" style="--accent:var(--lilac)"><h3>Chat, clock, rematch</h3><p>Short messages with emoji and animated reactions, an optional chess clock, spectators and one-tap rematch.</p></div>
      <div class="card" style="--accent:var(--orange)"><h3>Learn as you play</h3><p>Seven short interactive lessons, legal moves highlighted, undo and hints when you play the computer.</p></div>
      <div class="card" style="--accent:var(--red)"><h3>Accessible</h3><p>Keyboard moves, screen-reader announcements, a text description of the position and a high-contrast theme.</p></div>
    </div>
  </div>
</section>

<section aria-labelledby="online-h">
  <div class="wrap two">
    <figure class="shot">
      <img src="/assets/online.webp" width="1600" height="964" alt="An online game with the chat panel open and a fire reaction rising over the board" loading="lazy">
      <figcaption>Online game with chat and a reaction.</figcaption>
    </figure>
    <div>
      <span class="bar" style="background:var(--sky)">Online play</span>
      <h2 id="online-h">Challenge a friend in two clicks</h2>
      <ul class="ticks" style="grid-template-columns:1fr">
        <li>Open the game and choose <b>Create room</b> in the online panel.</li>
        <li>Share the link on WhatsApp, Telegram, X or by email — the post names the game you picked.</li>
        <li>Your friend opens the link and the game starts. No accounts, no game server.</li>
        <li>Browsers in the background get a notification when it is your move.</li>
      </ul>
      <div class="cta"><a class="btn sky" href="/play/">Create a room</a><a class="btn lilac" href="/faq/#online">How it works</a></div>
    </div>
  </div>
</section>

<section aria-labelledby="glance-h">
  <div class="wrap">
    <span class="bar" style="background:var(--orange)">3D chess at a glance</span>
    <h2 id="glance-h">One chessboard, seven levels</h2>
    <ul class="ticks">
      <li>Three fixed 4×4 boards (W, N, B) and four 2×2 attack boards on twelve pins: 64 squares, just like normal chess.</li>
      <li>A move is legal if it is legal seen from above; the piece then chooses the level it lands on.</li>
      <li>A piece blocks its file and rank on every level; knights jump.</li>
      <li>Moving an attack board is a whole move: empty or with one piece, forward or sideways.</li>
      <li>Castling, en passant across levels, promotion on each file’s last rank.</li>
      <li>Draws by stalemate, threefold repetition, insufficient material and the 50-move rule.</li>
    </ul>
    <div class="cta"><a class="btn orange" href="/learn/how-to-play-3d-chess/">How to play 3D chess</a><a class="btn lilac" href="/rules/3d-chess/">Full rules</a></div>
  </div>
</section>

<section aria-labelledby="get-h">
  <div class="wrap">
    <span class="bar" style="background:var(--peach)">Get it</span>
    <h2 id="get-h">Play anywhere</h2>
    <div class="grid">
      <div class="card" style="--accent:var(--orange)"><h3>In the browser</h3><p>Desktop, tablet or phone. On a phone choose “Add to Home Screen” to install it as an app that also works offline.</p><a class="more" href="/play/">Open the game →</a></div>
      <div class="card" style="--accent:var(--lilac)"><h3>macOS app</h3><p>A desktop app with the same game, plus a built-in MCP server to let an AI such as Claude play.</p><a class="more" href="https://github.com/nicolorisitano82/tri-d-chess/releases" rel="noopener">Download from GitHub →</a></div>
      <div class="card" style="--accent:var(--sky)"><h3>Open source</h3><p>The whole project is free software under the GPL-3.0 licence. Read the code, report a bug or contribute.</p><a class="more" href="https://github.com/nicolorisitano82/tri-d-chess" rel="noopener">Source on GitHub →</a></div>
    </div>
  </div>
</section>`,
}), 1.0);

// --- rules ----------------------------------------------------------------------------------
const EN = RULES.en;
write('/rules/', P({
  path: '/rules/', title: 'Game rules: 3D chess, chess and draughts',
  description: 'Complete rules of 3D chess (Meder tournament rules), classic chess and five draughts variants: Italian, international, checkers, Russian, Brazilian.',
  crumbs: [['Rules', '/rules/']],
  body: `<div class="wrap page-head">
  <h1>Game rules</h1>
  <p class="lede">The full rules of every game you can play on Tri-D Chess, written for beginners and checked against the game itself: what the app accepts is exactly what is written here.</p>
</div>
<section><div class="wrap grid">
  <div class="card" style="--accent:var(--orange)"><h3><a href="/rules/3d-chess/">3D chess (Tri-D)</a></h3><p>The seven-level board, attack boards, square names, how pieces move between levels, castling, promotion by file and draws.</p></div>
  <div class="card" style="--accent:var(--sky)"><h3><a href="/rules/chess/">Classic chess</a></h3><p>The FIDE Laws of Chess in short: how each piece moves, castling, en passant, promotion, check, checkmate and draws.</p></div>
  <div class="card" style="--accent:var(--lilac)"><h3><a href="/rules/draughts/">Draughts &amp; checkers</a></h3><p>Men, kings and compulsory captures, then what changes in each of the five variants.</p></div>
</div></section>
<section><div class="wrap">
  <h2>Draughts variants</h2>
  <ul class="ticks"></ul>
</div></section>`,
}), 0.8);

// 3D chess
{
  const secs = sections(EN.trid);
  write('/rules/3d-chess/', P({
    path: '/rules/3d-chess/', title: '3D chess rules (Tri-D, Meder tournament rules)',
    description: 'How to play 3D chess: the seven-level board, attack boards, square names, moving between levels, castling, en passant, promotion and draws.',
    crumbs: [['Rules', '/rules/'], ['3D chess', '/rules/3d-chess/']], type: 'article',
    jsonld: [{ '@context': 'https://schema.org', '@type': 'Article', headline: '3D chess rules (Tri-D, Meder tournament rules)', inLanguage: 'en',
      about: 'Three-dimensional chess', mainEntityOfPage: `${SITE}/rules/3d-chess/`, image: `${SITE}/assets/og-image.jpg`, dateModified: today,
      author: { '@type': 'Organization', name: 'Tri-D Chess', url: SITE + '/' } }],
    body: article({
      head: `<h1>3D chess rules</h1>
<p class="lede">Three-dimensional chess as played on Tri-D Chess follows <b>Jens Meder’s tournament rules</b>. The pieces and the goal are those of normal chess — checkmate the king — but the board has seven levels and four of them move. New to the game? Start with the <a href="/learn/how-to-play-3d-chess/">beginner’s guide</a> or the <a href="/play/?tutorial">interactive tutorial</a>.</p>`,
      secs,
      after: `${playBox('The tutorial walks you through levels, projection, knights, attack boards, promotion and mate on the real board, one move at a time.', '/play/?tutorial', 'Start the tutorial')}
<p class="note">Reference: <a href="https://meder.spacechess.org/3dschach/chess3d.htm" rel="noopener">Jens Meder — Tournament Rules for Three-Dimensional Chess</a>.</p>
${related([['How to play 3D chess', '/learn/how-to-play-3d-chess/'], ['Classic chess rules', '/rules/chess/'], ['FAQ', '/faq/']])}`,
    }),
  }), 0.9);
}

// classic chess
{
  const secs = sections(EN.chess);
  write('/rules/chess/', P({
    path: '/rules/chess/', title: 'Chess rules for beginners (FIDE laws in short)',
    description: 'Chess rules explained simply: how each piece moves, castling, en passant, promotion, check, checkmate and draws. Then play the computer for free.',
    crumbs: [['Rules', '/rules/'], ['Chess', '/rules/chess/']], type: 'article', image: '/assets/chess.jpg',
    imageAlt: 'A classic chessboard in a torch-lit medieval hall',
    jsonld: [{ '@context': 'https://schema.org', '@type': 'Article', headline: 'Chess rules for beginners', inLanguage: 'en', about: 'Chess',
      mainEntityOfPage: `${SITE}/rules/chess/`, image: `${SITE}/assets/chess.jpg`, dateModified: today, author: { '@type': 'Organization', name: 'Tri-D Chess', url: SITE + '/' } }],
    body: article({
      head: `<h1>Chess rules</h1>
<p class="lede">Classic chess follows the <b>FIDE Laws of Chess</b>. Here is everything you need to play your first game, with each piece’s moves, the special moves and how a game ends. Then try it against the computer at level 1.</p>`,
      secs,
      after: `${playBox('Play classic chess against the computer (five levels) or a friend online, with legal moves highlighted.', '/play/?game=chess', 'Play chess')}
${related([['3D chess rules', '/rules/3d-chess/'], ['Draughts rules', '/rules/draughts/'], ['FAQ', '/faq/']])}`,
    }),
  }), 0.8);
}

// draughts: common rules + one page per variant
const DV = [
  { kind: 'dama-it', slug: 'italian', title: 'Italian draughts', short: 'men cannot capture kings, strict capture priorities.',
    intro: 'Italian draughts (<i lang="it">dama italiana</i>) is the traditional form of the game in Italy. It is played on an 8×8 board turned so that the dark corner square is on each player’s right, and it has the strictest capture rules of all: men may not take kings, and when several captures are possible a precise order of priority decides which one you must play.' },
  { kind: 'dama-int', slug: 'international', title: 'International draughts', short: '10×10 board, flying kings, take the most pieces.',
    intro: 'International draughts is played on a 10×10 board with 20 men a side. It is the version used in world championships and is especially popular in the Netherlands and in many African countries. Its flying kings and the duty to capture as many pieces as possible make for long, tactical combinations.' },
  { kind: 'dama-en', slug: 'english-checkers', title: 'English draughts (checkers)', short: 'Black starts, short kings, free choice of capture.',
    intro: 'English draughts — called <b>checkers</b> in North America — is the form played across the English-speaking world. Kings move just one square, men capture only forwards, and Black (the darker pieces) moves first. You may choose any capture, but you must complete it.' },
  { kind: 'dama-ru', slug: 'russian', title: 'Russian draughts', short: 'flying kings, crowned men keep capturing.',
    intro: 'Russian draughts (<i lang="ru">shashki</i>) is played on an 8×8 board in Russia and the former Soviet countries. Men capture backwards too, kings fly, and a man that reaches the last row in the middle of a capture is crowned at once and carries on capturing as a king.' },
  { kind: 'dama-br', slug: 'brazilian', title: 'Brazilian draughts', short: 'international rules on an 8×8 board.',
    intro: 'Brazilian draughts uses the rules of international draughts on a smaller 8×8 board with 12 men a side: flying kings, men that capture backwards, and the duty to take as many pieces as possible.' },
];
const DAMA_SECS = sections(EN.dama);
const VARIANT_SEC = { 'dama-it': 5, 'dama-int': 6, 'dama-en': 7, 'dama-ru': 8, 'dama-br': 9 };
const yes = (b) => b ? '<td class="yes">yes</td>' : '<td class="no">no</td>';
const cmpTable = (here = null) => `<div class="tablewrap"><table class="cmp">
<caption class="note" style="caption-side:bottom;text-align:left;padding-top:6px">How the five draughts variants differ.</caption>
<thead><tr><th scope="col">Variant</th><th scope="col">Board</th><th scope="col">Men</th><th scope="col">First move</th><th scope="col">Men capture backwards</th><th scope="col">Flying kings</th><th scope="col">Men capture kings</th><th scope="col">Capture choice</th></tr></thead>
<tbody>${DV.map((d) => {
  const v = VARIANTS[d.kind];
  const rule = v.rule === 'max' ? 'most pieces' : v.rule === 'italian' ? 'priority order' : 'free';
  return `<tr${d.kind === here ? ' class="here"' : ''}><th scope="row"><a href="/rules/draughts/${d.slug}/">${d.title}</a></th><td>${v.size}×${v.size}</td><td>${v.rows * v.size / 2}</td><td>${v.first === 'white' ? 'White' : 'Black'}</td>${yes(v.menBack)}${yes(v.flying)}${yes(v.menTakeKings)}<td>${rule}</td></tr>`;
}).join('')}</tbody></table></div>`;

write('/rules/draughts/', P({
  path: '/rules/draughts/', title: 'Draughts and checkers rules (all variants)',
  description: 'How to play draughts (checkers): men, kings, compulsory captures and crowning, and how the Italian, international, English, Russian and Brazilian rules differ.',
  crumbs: [['Rules', '/rules/'], ['Draughts', '/rules/draughts/']], type: 'article', image: '/assets/draughts.jpg',
  imageAlt: 'A draughts board with light and dark discs and a crowned king',
  jsonld: [{ '@context': 'https://schema.org', '@type': 'Article', headline: 'Draughts and checkers rules', inLanguage: 'en', about: 'Draughts',
    mainEntityOfPage: `${SITE}/rules/draughts/`, image: `${SITE}/assets/draughts.jpg`, dateModified: today, author: { '@type': 'Organization', name: 'Tri-D Chess', url: SITE + '/' } }],
  body: article({
    head: `<h1>Draughts rules</h1>
<p class="lede">Draughts — <b>checkers</b> in North America — is played with men that move diagonally on the dark squares. The basics are the same everywhere; the five variants differ in who captures what, how far kings move and which capture you must choose.</p>`,
    secs: [...DAMA_SECS.slice(0, 5), { id: 'variants', title: 'The five variants', html: `<p>Each variant has its own page with the details. At a glance:</p>${cmpTable()}` },
      ...DAMA_SECS.slice(10)],
    after: `${playBox('Play any variant against the computer or a friend online. For multiple captures you tap only the final square — the app finds the route.', '/play/?game=dama-it', 'Play draughts')}
${related(DV.map((d) => [d.title, `/rules/draughts/${d.slug}/`]))}`,
  }),
}), 0.8);

for (const d of DV) {
  const path = `/rules/draughts/${d.slug}/`;
  const own = DAMA_SECS[VARIANT_SEC[d.kind]];
  const secs = [
    { id: 'about', title: `About ${d.title}`, html: `<p>${d.intro}</p>` },
    { ...own, id: 'rules', title: `${d.title}: the rules` },
    { id: 'common', title: 'Rules shared by all variants', html: `<ul>
<li>Pieces stand and move on the dark squares only; a man moves one square diagonally forwards.</li>
<li>Capturing is compulsory and the whole sequence of jumps must be completed; captured pieces are removed at the end of the move and cannot be jumped twice.</li>
<li>A man reaching the far row is crowned king.</li>
<li>You lose when you have no pieces or no legal move.</li></ul>
<p>Full explanation on the <a href="/rules/draughts/">draughts rules page</a>.</p>` },
    { id: 'compare', title: 'Compared with other variants', html: cmpTable(d.kind) },
    DAMA_SECS[11],
  ];
  write(path, P({
    path, title: `${d.title} rules`,
    description: `${d.title} rules explained: ${d.short} How it differs from other variants, and where to play it free online.`,
    crumbs: [['Rules', '/rules/'], ['Draughts', '/rules/draughts/'], [d.title, path]], type: 'article', image: '/assets/draughts.jpg',
    imageAlt: 'A draughts board with light and dark discs and a crowned king',
    jsonld: [{ '@context': 'https://schema.org', '@type': 'Article', headline: `${d.title} rules`, inLanguage: 'en', about: d.title,
      mainEntityOfPage: SITE + path, image: `${SITE}/assets/draughts.jpg`, dateModified: today, author: { '@type': 'Organization', name: 'Tri-D Chess', url: SITE + '/' } }],
    body: article({
      head: `<h1>${d.title} rules</h1><p class="lede">${d.title}: ${d.short}</p>`,
      secs,
      after: `${playBox(`Play ${d.title.split(' (')[0].toLowerCase()} now against the computer (five levels) or a friend online.`, `/play/?game=${d.kind}`, 'Play now')}
${related([['All draughts rules', '/rules/draughts/'], ...DV.filter((x) => x !== d).map((x) => [x.title, `/rules/draughts/${x.slug}/`])])}`,
    }),
  }), 0.7);
}

// the rules index lists the variants (DV is defined after it was first written)
{
  const f = join(OUT, 'rules/index.html');
  writeFileSync(f, readFileSync(f, 'utf8').replace('<ul class="ticks"></ul>',
    `<ul class="ticks">${DV.map((d) => `<li><a href="/rules/draughts/${d.slug}/">${d.title}</a> — ${d.short}</li>`).join('')}</ul>`));
}

// --- learn ----------------------------------------------------------------------------------
{
  const secs = [
    { id: 'what', title: 'What is 3D chess?', html: `<p>Three-dimensional chess is chess played on several stacked boards. The best-known form — often called <b>Tri-D chess</b> — comes from the tiered chessboard seen in a classic 1960s science-fiction TV series. The prop had no rules of its own; fans later wrote complete rules for it, and the most widely used today are <b>Jens Meder’s tournament rules</b>, which Tri-D Chess follows.</p>
<p>The pieces are the ones you know. What changes is the board: three fixed boards and four small attack boards that can move during the game.</p>` },
    { id: 'board', title: 'The board: 64 squares on seven levels', html: `<p>There are three fixed <b>main boards</b> of 4×4 squares — White’s (W) at the bottom, the neutral board (N) in the middle and Black’s (B) at the top — and four movable <b>attack boards</b> of 2×2 squares, standing on pins at the corners of the main boards.</p>
<p>Count them: 3 × 16 + 4 × 4 = <b>64 squares</b>, exactly as on a normal chessboard. At the start each player owns two attack boards, at the queen-side and king-side corners of their own main board.</p>` },
    { id: 'projection', title: 'The key idea: look from above', html: `<p>Almost everything follows from one rule: <b>imagine the whole board flattened as seen from above</b>. Seen that way the levels form a 6×10 grid. A move is legal if it is a normal chess move on that flat grid; the piece then lands on any level that has a square there.</p>
<ul><li>A piece in the way <b>blocks</b> its square on every level, so lines are blocked “through” the levels.</li>
<li><b>Knights jump</b>, exactly as in normal chess.</li>
<li>A move that goes straight up or down (same square, another level) is not a move.</li></ul>
<p>Once this clicks, bishops, rooks and queens become intuitive: trace the line on the flat grid, then pick the level.</p>` },
    { id: 'names', title: 'Reading square names', html: `<p>A square is written as file, rank and level: <code>b2W</code> is file b, rank 2 on White’s main board; <code>z0QL1</code> is a corner of the attack board on pin QL1. Files run z, a, b, c, d, e and ranks 0 to 9. The game shows the names as you hover or tap, and you can type moves with the keyboard (press <b>M</b>).</p>` },
    { id: 'attack-boards', title: 'Attack boards: the moving part', html: `<p>Moving an attack board is a whole move. A board can move to an empty pin next to it, forward or sideways, carrying the pieces on it; only an empty board may move backwards. A board with exactly one piece on it belongs to that piece’s owner — so you can take control of an opponent’s board by occupying it alone.</p>
<p>Attack boards let you bring a rook or the queen forward, open a new line of attack, or move your king to safety.</p>` },
    { id: 'tips', title: 'Six tips for your first games', html: `<ol>
<li><b>Develop your knights early.</b> They jump between levels and reach squares other pieces cannot.</li>
<li><b>Fight for the neutral board.</b> The middle level is reachable by both sides and controls many lines.</li>
<li><b>Remember that blocking works on every level.</b> A pawn on one level can shut a rook’s file on all of them.</li>
<li><b>Keep your king safe.</b> It starts on an attack board; castling and moving that board are both ways to tuck it away.</li>
<li><b>Count the tempo.</b> Moving a board costs a move — make sure it gains more than a piece move would.</li>
<li><b>Check promotion squares by file.</b> The last rank is not the same on every file; the rules page has the table.</li></ol>` },
    { id: 'mistakes', title: 'Common beginner mistakes', html: `<ul><li>Expecting to move a piece straight up to the same square on another level.</li>
<li>Forgetting that a piece on another level blocks a line.</li>
<li>Trying to move an attack board backwards with a piece on it.</li>
<li>Leaving the king on an attack board the opponent can attack from several levels.</li></ul>` },
    { id: 'practice', title: 'How to practise', html: `<p>Start with the <a href="/play/?tutorial">seven-lesson tutorial</a>, then play the computer at level 1 or 2 with hints on. Tap a piece to see all its legal moves highlighted — the fastest way to build intuition. When you feel ready, <a href="/play/">challenge a friend online</a>.</p>` },
  ];
  write('/learn/how-to-play-3d-chess/', P({
    path: '/learn/how-to-play-3d-chess/', title: 'How to play 3D chess: a beginner’s guide',
    description: 'Learn 3D chess in ten minutes: the seven-level board, the “look from above” rule, square names, attack boards, tips and common mistakes.',
    crumbs: [['How to play 3D chess', '/learn/how-to-play-3d-chess/']], type: 'article',
    jsonld: [{ '@context': 'https://schema.org', '@type': 'Article', headline: 'How to play 3D chess: a beginner’s guide', inLanguage: 'en', about: 'Three-dimensional chess',
      mainEntityOfPage: `${SITE}/learn/how-to-play-3d-chess/`, image: `${SITE}/assets/og-image.jpg`, dateModified: today, author: { '@type': 'Organization', name: 'Tri-D Chess', url: SITE + '/' } }],
    body: article({
      head: `<h1>How to play 3D chess</h1><p class="lede">A ten-minute introduction to three-dimensional chess for players who already know the normal game. For every detail, see the <a href="/rules/3d-chess/">complete rules</a>.</p>`,
      secs,
      after: `${playBox('Ready to try? The tutorial sets up each idea on the real board and checks your moves.', '/play/?tutorial', 'Start the tutorial')}
${related([['3D chess rules', '/rules/3d-chess/'], ['FAQ', '/faq/'], ['Play now', '/play/']])}`,
    }),
  }), 0.8);
}

// --- FAQ --------------------------------------------------------------------------------------
const FAQ = [
  ['free', 'Is Tri-D Chess free?', 'Yes. The game is free, with no ads inside the game and no account to create. It is open-source software released under the GPL-3.0 licence.'],
  ['install', 'Do I need to download anything?', 'No. Tri-D Chess runs in any modern browser on desktop, tablet or phone. You can also install it from the browser (“Add to Home Screen” or the install button) to play offline against the computer, or download the macOS app.'],
  ['online', 'How do I play with a friend online?', 'Open the game, choose a colour and a clock in the online panel and press “Create room”. Send your friend the link (or the 8-character code). You can also list the room in the public lobby, where anyone can join with one tap. The two browsers connect directly, peer to peer; public relay servers are used only to help them find each other, and the connection is encrypted.'],
  ['watch', 'Can other people watch a game?', 'Yes. Live games listed in the lobby can be watched, and a third person who opens a room link joins as a spectator. Players see how many spectators are watching.'],
  ['rules', 'Which rules does the 3D chess use?', 'Jens Meder’s tournament rules for three-dimensional chess, including movable attack boards, castling, en passant across levels and promotion by file. Other rule sets exist; the complete rules as played here are on the 3D chess rules page.'],
  ['computer', 'How strong is the computer?', 'There are five levels, from Beginner to Master, and three playing styles (balanced, aggressive, cautious) that you can set separately for White and Black. Level 1 makes deliberate mistakes; level 5 searches several moves ahead. It runs entirely in your browser.'],
  ['games', 'Which games can I play?', '3D chess (Tri-D), classic chess and five draughts variants: Italian, international (10×10), English draughts (checkers), Russian and Brazilian.'],
  ['undo', 'Can I take back a move or get a hint?', 'Yes, in games played on one screen — against the computer or two players on the same device. Online games have no undo, to keep them fair.'],
  ['phone', 'Does it work on a phone?', 'Yes. The board can be rotated and zoomed with your fingers, and the panels fold away to leave room for the game.'],
  ['language', 'Is the game available in other languages?', 'The game itself is in English and Italian; switch with the EN/IT button. This website is in English.'],
  ['accessibility', 'Is it accessible?', 'You can play entirely from the keyboard by typing moves (press M), moves and game status are announced to screen readers, a text description of the position is available, and there is a high-contrast theme. Animations are reduced if your system asks for it.'],
  ['ai', 'Can an AI play?', 'Yes, with the macOS app or the source code: a built-in MCP server lets an AI assistant such as Claude play one colour, or two AIs play each other.'],
];
write('/faq/', P({
  path: '/faq/', title: 'Frequently asked questions',
  description: 'Is it free? How do I play 3D chess online with a friend? Rules, computer levels, undo, phones, languages and accessibility: all the answers.',
  crumbs: [['FAQ', '/faq/']],
  jsonld: [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([, q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }],
  body: `<div class="wrap page-head"><h1>Frequently asked questions</h1><p class="lede">Can’t find your answer? Open an issue on <a href="https://github.com/nicolorisitano82/tri-d-chess/issues" rel="noopener">GitHub</a>.</p></div>
<div class="wrap prose" style="padding-bottom:30px">
${FAQ.map(([id, q, a]) => `<details class="faq" id="${id}"${id === 'free' ? ' open' : ''}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
${playBox('The quickest way to understand it is to play a few moves.', '/play/', 'Play now')}
</div>`,
}), 0.7);

// --- about & privacy --------------------------------------------------------------------------
write('/about/', P({
  path: '/about/', title: 'About Tri-D Chess and privacy',
  description: 'Tri-D Chess is a free, open-source fan project bringing 3D chess to the browser: what it is built with, how online play works, what data it keeps.',
  crumbs: [['About', '/about/']],
  body: article({
    head: `<h1>About Tri-D Chess</h1><p class="lede">A free, open-source fan project to make three-dimensional chess actually playable — in the browser, on a phone or as a desktop app.</p>`,
    secs: [
      { id: 'project', title: 'The project', html: `<p>Tri-D Chess started from a simple wish: to play the tiered chess of science fiction with real, complete rules. It grew to include classic chess, five draughts variants, a computer opponent, serverless online play and an interactive tutorial.</p>
<p>It is a fan project and is not affiliated with any science-fiction franchise; the piece designs are original. The code is free software under the <a href="https://www.gnu.org/licenses/gpl-3.0.html" rel="noopener">GPL-3.0 licence</a> and lives on <a href="https://github.com/nicolorisitano82/tri-d-chess" rel="noopener">GitHub</a>.</p>` },
      { id: 'built-with', title: 'Built with', html: `<ul><li><a href="https://threejs.org" rel="noopener">Three.js</a> for the 3D board.</li><li><a href="https://github.com/dmotz/trystero" rel="noopener">Trystero</a> for peer-to-peer online play over WebRTC.</li><li><a href="https://github.com/jhlywa/chess.js" rel="noopener">chess.js</a> for the classic chess rules.</li><li><a href="https://www.electronjs.org" rel="noopener">Electron</a> for the macOS app, and the <a href="https://modelcontextprotocol.io" rel="noopener">Model Context Protocol</a> for AI players.</li></ul>` },
      { id: 'privacy', title: 'Privacy', html: `<p>The game has no accounts, no ads and no analytics of its own.</p>
<ul><li><b>On your device:</b> the game saves your current game, settings and optional nickname in your browser’s local storage. Clear your browser data to remove them.</li>
<li><b>Online games:</b> your browser connects directly to your opponent’s. Public Nostr relays carry the short messages that let the two browsers find each other and, if you choose to list a room, the room’s entry in the public lobby (game, colour, language and nickname). Moves and chat travel between the two browsers, encrypted.</li>
<li><b>Notifications</b> are shown by your own browser and only if you allow them.</li>
<li><b>Hosting:</b> this website is hosted by Altervista, which may keep standard server logs (such as IP addresses) as described in its own privacy policy.</li></ul>` },
      { id: 'contact', title: 'Contact', html: `<p>Bug reports, ideas and questions are welcome as <a href="https://github.com/nicolorisitano82/tri-d-chess/issues" rel="noopener">GitHub issues</a>.</p>` },
    ],
    after: playBox('Ready for a game?', '/play/', 'Play now'),
  }),
}), 0.4);

// --- 404, sitemap, robots, .htaccess -----------------------------------------------------------
writeFileSync(join(OUT, '404.html'), P({
  path: '/404.html', title: 'Page not found', description: 'This page does not exist.', noindex: true,
  body: `<div class="wrap page-head" style="padding-bottom:60px"><h1>Page not found</h1><p class="lede">This square is off the board. Try one of these instead:</p>
<div class="cta"><a class="btn orange" href="/play/">Play now</a><a class="btn lilac" href="/rules/">Rules</a><a class="btn sky" href="/">Home</a></div></div>`,
}));
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(([p, pr]) => `  <url><loc>${SITE}${p}</loc><lastmod>${today}</lastmod><priority>${pr.toFixed(1)}</priority></url>`).join('\n')}
</urlset>
`);
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
// Altervista supports ErrorDocument, DirectoryIndex and mod_rewrite (not mod_headers / mod_expires)
writeFileSync(join(OUT, '.htaccess'), `DirectoryIndex index.html
ErrorDocument 404 /404.html

RewriteEngine On
RewriteBase /
# one address per page: /index.html -> /
RewriteCond %{THE_REQUEST} \\s/+(.*/)?index\\.html[\\s?] [NC]
RewriteRule ^(.*/)?index\\.html$ ${SITE}/$1 [R=301,L]
`);
console.log(`built site → ${OUT} (${pages.length} pages) for ${SITE}`);
