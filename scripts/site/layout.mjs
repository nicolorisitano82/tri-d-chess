// Page shell for the static website: head (SEO, social cards, JSON-LD), header, footer.
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const NAV = [
  ['Play', '/play/'],
  ['Rules', '/rules/'],
  ['Learn', '/learn/how-to-play-3d-chess/'],
  ['FAQ', '/faq/'],
  ['About', '/about/'],
];

/**
 * page({ site, path, title, description, body, crumbs, jsonld, image, imageAlt, type })
 * path: "/rules/chess/" (trailing slash); crumbs: [[name, path], ...] without Home.
 */
export function page({ site, path, title, description, body, crumbs = [], jsonld = [], image = '/assets/og-image.jpg',
  imageAlt = 'Tri-D Chess: a three-dimensional chessboard with three main levels and four attack boards in space', type = 'website', noindex = false }) {
  const url = site + path;
  const fullTitle = path === '/' ? title : `${title} · Tri-D Chess`;
  const ld = [...jsonld];
  if (crumbs.length) ld.push({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [['Home', '/'], ...crumbs].map(([name, p], i) => ({ '@type': 'ListItem', position: i + 1, name, item: site + p })),
  });
  const crumbHtml = crumbs.length
    ? `<nav class="crumbs wrap" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li>${crumbs.map(([n, p], i) =>
      i === crumbs.length - 1 ? `<li aria-current="page">${esc(n)}</li>` : `<li><a href="${p}">${esc(n)}</a></li>`).join('')}</ol></nav>`
    : '';
  const nav = NAV.map(([n, p]) => `<a href="${p}"${path.startsWith(p) && p !== '/' ? ' aria-current="page"' : ''}${n === 'Play' ? ' class="navplay"' : ''}>${n}</a>`).join('\n      ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}<meta name="theme-color" content="#05040c">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="Tri-D Chess">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${site}${image}">
<meta property="og:image:alt" content="${esc(imageAlt)}">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${site}${image}">
<link rel="icon" type="image/png" sizes="64x64" href="/assets/favicon-64.png">
<link rel="apple-touch-icon" href="/assets/icon-180.png">
<link rel="stylesheet" href="/assets/site.css">
${ld.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header>
  <div class="wrap">
    <a class="brand" href="/"><img src="/assets/favicon-64.png" width="34" height="34" alt="">Tri-D Chess</a>
    <nav aria-label="Main">
      ${nav}
    </nav>
  </div>
</header>
${crumbHtml}
<main id="main">
${body}
</main>
<footer>
  <div class="wrap foot">
    <div>
      <p class="brand small">Tri-D Chess</p>
      <p>Free 3D chess, classic chess, Chinese chess and draughts in your browser. Open source under the GPL-3.0 licence.</p>
      <p class="note">A fan project, not affiliated with any science-fiction franchise. Original piece designs.</p>
    </div>
    <nav aria-label="Footer">
      <a href="/play/">Play now</a>
      <a href="/rules/3d-chess/">3D chess rules</a>
      <a href="/rules/chess/">Chess rules</a>
      <a href="/rules/xiangqi/">Xiangqi rules</a>
      <a href="/rules/draughts/">Draughts rules</a>
      <a href="/learn/how-to-play-3d-chess/">How to play 3D chess</a>
      <a href="/faq/">FAQ</a>
      <a href="/about/">About &amp; privacy</a>
      <a href="https://github.com/nicolorisitano82/tri-d-chess" rel="noopener">Source code on GitHub</a>
    </nav>
  </div>
</footer>
</body>
</html>
`;
}

export const CSS = `/* Tri-D Chess website — dark "console" look, orange / lilac / sky bars echo the game's panels */
:root {
  color-scheme: dark;
  --bg: #05040c; --panel: #0f0c1c; --panel2: #151127; --line: #2a2340;
  --text: #efe7dc; --muted: #a59a8f; --soft: #d9cfc4;
  --orange: #ff9c33; --peach: #ffcc99; --lilac: #cc99cc; --sky: #66ccff; --red: #ff5f6d;
  --font: "Avenir Next", "Helvetica Neue", -apple-system, "Segoe UI", Roboto, sans-serif;
  --display: "Avenir Next Condensed", "Helvetica Neue", "Arial Narrow", sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
html { scroll-padding-top: 76px; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.65 var(--font); -webkit-text-size-adjust: 100%; }
body::before { content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background: radial-gradient(1px 1px at 20% 30%, #fff8 50%, transparent 51%), radial-gradient(1px 1px at 70% 20%, #fff6 50%, transparent 51%),
    radial-gradient(1px 1px at 40% 80%, #fff5 50%, transparent 51%), radial-gradient(1px 1px at 85% 65%, #fff7 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 10% 70%, #fff6 50%, transparent 51%), radial-gradient(1px 1px at 55% 50%, #fff4 50%, transparent 51%);
  background-size: 380px 380px, 520px 520px, 440px 440px, 610px 610px, 700px 700px, 300px 300px; }
a { color: var(--sky); text-underline-offset: 3px; }
a:hover { color: #9fe0ff; }
:focus-visible { outline: 2px solid var(--peach); outline-offset: 3px; }
img { max-width: 100%; height: auto; }
.wrap { max-width: 1120px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.skip { position: absolute; left: -999px; top: 8px; background: var(--orange); color: #000; padding: 8px 14px; border-radius: 8px; z-index: 20; }
.skip:focus { left: 8px; }

header { position: sticky; top: 0; z-index: 10; background: rgba(5,4,12,.88); backdrop-filter: blur(8px); border-bottom: 1px solid var(--line); }
header .wrap { display: flex; align-items: center; gap: 14px; padding-block: 10px; flex-wrap: wrap; }
.brand { display: flex; align-items: center; gap: 10px; font: 700 18px var(--display); letter-spacing: .14em; text-transform: uppercase; color: var(--text); text-decoration: none; }
.brand.small { font-size: 15px; margin: 0 0 6px; }
header nav { margin-left: auto; display: flex; gap: 6px 16px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
header nav a { color: var(--muted); text-decoration: none; font-size: 14px; letter-spacing: .04em; }
header nav a:hover, header nav a[aria-current] { color: var(--text); }
header nav a.navplay { background: var(--orange); color: #000; font-weight: 700; padding: 5px 14px; border-radius: 16px; text-transform: uppercase; letter-spacing: .08em; font-size: 13px; }
header nav a.navplay:hover { color: #000; filter: brightness(1.12); }

.crumbs ol { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; padding: 14px 0 0; margin: 0; font-size: 13px; color: var(--muted); }
.crumbs li + li::before { content: "›"; margin-right: 6px; color: var(--line); }
.crumbs a { color: var(--muted); }

.hero { padding-block: 56px 40px; display: grid; grid-template-columns: 1fr; gap: 28px; }
.eyebrow { display: inline-block; background: var(--orange); color: #000; font: 700 12px var(--display); letter-spacing: .3em; text-transform: uppercase; padding: 6px 14px 6px 18px; border-radius: 16px 4px 4px 16px; }
h1 { font: 700 clamp(36px, 6.4vw, 72px)/1.04 var(--display); letter-spacing: .02em; margin: 14px 0 12px; text-wrap: balance; }
h1 em { font-style: normal; color: var(--orange); }
.page-head h1 { font-size: clamp(32px, 5vw, 54px); }
.lede { max-width: 64ch; color: var(--soft); font-size: 18px; }
.cta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
.btn { display: inline-flex; align-items: center; gap: 8px; text-decoration: none; font: 700 14px var(--font); letter-spacing: .08em; text-transform: uppercase; padding: 12px 20px; border-radius: 22px; color: #000; }
.btn.orange { background: var(--orange); } .btn.lilac { background: var(--lilac); } .btn.sky { background: var(--sky); } .btn.peach { background: var(--peach); }
.btn:hover { filter: brightness(1.12); color: #000; }
.shot { margin: 0; border-radius: 14px; overflow: hidden; border: 1px solid var(--line); box-shadow: 0 30px 80px rgba(0,0,0,.6); background: #000; }
.shot img { display: block; width: 100%; }
figcaption { font-size: 13px; color: var(--muted); padding: 10px 14px; background: var(--panel); }

section { padding-block: 40px; }
.bar { font: 700 14px var(--display); letter-spacing: .24em; text-transform: uppercase; color: #000; padding: 8px 18px; border-radius: 18px 4px 4px 18px; display: inline-block; margin-bottom: 18px; }
h2 { font: 700 clamp(25px, 3.4vw, 34px)/1.18 var(--display); margin: 0 0 14px; text-wrap: balance; }
h3 { font: 700 18px/1.3 var(--display); letter-spacing: .04em; margin: 22px 0 6px; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.card { background: var(--panel); border: 1px solid var(--line); border-left: 10px solid var(--accent, var(--lilac)); border-radius: 0 12px 12px 0; padding: 16px 18px; }
.card h3 { margin: 0 0 6px; font-size: 17px; letter-spacing: .06em; text-transform: uppercase; }
.card p { margin: 0; color: #d4cabf; font-size: 15px; }
.card .more { display: inline-block; margin-top: 10px; font-size: 14px; }
.game-card { display: flex; flex-direction: column; padding: 0; overflow: hidden; }
.game-card img { display: block; width: 100%; aspect-ratio: 16/10; object-fit: cover; border-bottom: 1px solid var(--line); }
.game-card .in { padding: 14px 18px 16px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
.game-card .links { margin-top: auto; padding-top: 10px; display: flex; gap: 14px; flex-wrap: wrap; font-size: 14px; }
.two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.ticks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 28px; padding: 0; list-style: none; margin: 0; }
.ticks li { padding-left: 18px; position: relative; color: var(--soft); }
.ticks li::before { content: ""; position: absolute; left: 0; top: .72em; width: 8px; height: 8px; border-radius: 2px; background: var(--orange); }
code { font-family: var(--mono); background: #1a1530; padding: 1px 6px; border-radius: 4px; font-size: .9em; color: var(--peach); }
.note { color: var(--muted); font-size: 14px; }

/* article pages */
.page-head { padding-block: 26px 8px; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 36px; align-items: start; padding-bottom: 40px; }
.prose { max-width: 74ch; }
.prose h2 { margin-top: 34px; padding-top: 4px; border-top: 1px solid var(--line); padding-top: 22px; }
.prose h2:first-child { margin-top: 0; border-top: 0; padding-top: 0; }
.prose p, .prose li { color: var(--soft); }
.prose ul, .prose ol { padding-left: 22px; }
.prose li { margin: 4px 0; }
.prose b, .prose strong { color: var(--text); }
.prose table, table.cmp { border-collapse: collapse; margin: 10px 0 16px; font-size: 14px; width: 100%; }
.prose th, .prose td, table.cmp th, table.cmp td { border: 1px solid var(--line); padding: 6px 10px; text-align: left; }
.prose th, table.cmp th { background: var(--panel2); color: var(--peach); font-weight: 600; }
.tablewrap { overflow-x: auto; }
table.cmp td.yes { color: #9be29b; } table.cmp td.no { color: var(--muted); }
table.cmp tr.here td, table.cmp tr.here th { background: rgba(255,156,51,.12); }
aside.toc { position: sticky; top: 76px; background: var(--panel); border: 1px solid var(--line); border-left: 8px solid var(--sky); border-radius: 0 12px 12px 0; padding: 14px 16px; font-size: 14px; }
aside.toc h2 { font-size: 13px; letter-spacing: .2em; text-transform: uppercase; color: var(--muted); margin: 0 0 8px; border: 0; padding: 0; }
aside.toc ol { margin: 0; padding-left: 18px; }
aside.toc li { margin: 3px 0; }
aside.toc a { color: var(--soft); text-decoration: none; }
aside.toc a:hover { color: var(--text); text-decoration: underline; }
.playbox { margin: 30px 0 10px; padding: 18px 20px; background: var(--panel); border: 1px solid var(--line); border-left: 10px solid var(--orange); border-radius: 0 14px 14px 0; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
.playbox p { margin: 0; flex: 1 1 280px; color: var(--soft); }
.related { margin-top: 26px; }
.related ul { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.related a { display: inline-block; border: 1px solid var(--line); border-radius: 16px; padding: 5px 12px; text-decoration: none; font-size: 14px; color: var(--soft); background: var(--panel); }
.related a:hover { color: var(--text); border-color: var(--lilac); }
details.faq { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; margin: 10px 0; }
details.faq summary { cursor: pointer; font-weight: 700; color: var(--text); }
details.faq[open] summary { color: var(--peach); }
details.faq p { margin: 8px 0 2px; color: var(--soft); }

footer { border-top: 1px solid var(--line); padding-block: 26px 40px; color: var(--muted); font-size: 14px; margin-top: 30px; }
footer .foot { display: grid; grid-template-columns: 1.2fr 1fr; gap: 26px; }
footer p { margin: 6px 0; max-width: 70ch; }
footer nav { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 18px; align-content: start; }
footer nav a { color: var(--muted); text-decoration: none; }
footer nav a:hover { color: var(--text); text-decoration: underline; }

@media (min-width: 900px) { .hero { grid-template-columns: 0.9fr 1.1fr; align-items: center; } }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } aside.toc { position: static; order: -1; } }
@media (max-width: 860px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .grid, .two, .ticks, footer .foot { grid-template-columns: 1fr; } .hero { padding-block: 30px 20px; } header nav { margin-left: 0; justify-content: flex-start; } }
`;
