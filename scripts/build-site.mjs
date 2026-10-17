#!/usr/bin/env node
// Builds the whole arcade into _site/: every game's release (its scripts/release.sh writes <game>/dist)
// under _site/<game>/, plus a selector page at _site/index.html that shows a card per game, filled from the
// game's own Open Graph tags (og:title, og:description, og:image). A folder is a game when it has
// scripts/release.sh and its dist ends up with an index.html. Run from anywhere: node scripts/build-site.mjs
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, '_site');
const SITE_URL = 'https://arcade.alzlper.com/';

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** meta(html, prop) -> content of <meta property="prop"> (or name="prop"), '' when absent. */
function meta(html, prop) {
  const re = new RegExp(`<meta\\s+(?:property|name)="${prop}"\\s+content="([^"]*)"`, 'i');
  const m = html.match(re);
  return m ? m[1] : '';
}

rmSync(site, { recursive: true, force: true });
mkdirSync(site);

const games = [];
for (const name of readdirSync(root).sort()) {
  const dir = join(root, name);
  if (!existsSync(join(dir, 'scripts', 'release.sh'))) continue;
  execFileSync('bash', ['scripts/release.sh'], { cwd: dir, stdio: 'inherit' });
  const dist = join(dir, 'dist');
  if (!existsSync(join(dist, 'index.html'))) throw new Error(`${name}: release.sh left no dist/index.html`);
  cpSync(dist, join(site, name), { recursive: true });
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const title = meta(html, 'og:title') || (html.match(/<title>(.*?)<\/title>/) || [])[1] || name;
  const image = meta(html, 'og:image').replace(SITE_URL + name + '/', '');   // the tag is absolute; the card links relative
  games.push({ name, title, description: meta(html, 'og:description'), image: image ? `${name}/${image}` : '' });
}
if (!games.length) throw new Error('no games found (a game is a folder with scripts/release.sh)');

const cards = games.map((g) => `
      <a class="card" href="${g.name}/">
        ${g.image ? `<img src="${esc(g.image)}" alt="" width="1200" height="630" loading="lazy">` : '<div class="noimg"></div>'}
        <div class="body">
          <h2>${esc(g.title)}</h2>
          ${g.description ? `<p>${esc(g.description)}</p>` : ''}
          <span class="play">Play</span>
        </div>
      </a>`).join('');

const ogImage = existsSync(join(root, 'og-image.png')) ? (cpSync(join(root, 'og-image.png'), join(site, 'og-image.png')), SITE_URL + 'og-image.png') : '';
const description = `${games.length} free browser games, no ads, no account: ${games.map((g) => g.title).join(', ')}.`;

writeFileSync(join(site, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Arcade</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="Arcade">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE_URL}">
${ogImage ? `<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ogImage}">` : ''}
<meta name="theme-color" content="#14161f">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #14161f; color: #f2f3f7;
         display: flex; flex-direction: column; align-items: center; padding: 2.5rem 1rem 3rem; }
  header { text-align: center; margin-bottom: 2rem; }
  h1 { margin: 0 0 .4rem; font-size: clamp(2rem, 6vw, 3rem); letter-spacing: .04em; }
  header p { margin: 0; color: #a3a8bb; }
  .grid { width: 100%; max-width: 64rem; display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr)); }
  .card { display: flex; flex-direction: column; text-decoration: none; color: inherit; background: #1f2230; border-radius: 1.1rem; overflow: hidden;
          box-shadow: 0 10px 30px rgba(0,0,0,.35); transition: transform .15s, box-shadow .15s; outline: none; }
  .card:hover, .card:focus-visible { transform: translateY(-.25rem); box-shadow: 0 16px 40px rgba(0,0,0,.45); }
  .card:focus-visible { box-shadow: 0 0 0 3px #7aa2ff, 0 16px 40px rgba(0,0,0,.45); }
  .card img, .noimg { display: block; width: 100%; height: auto; aspect-ratio: 1200 / 630; object-fit: cover; background: #2a2e40; }
  .body { padding: 1rem 1.1rem 1.2rem; display: flex; flex-direction: column; gap: .5rem; flex: 1; }
  h2 { margin: 0; font-size: 1.25rem; }
  .body p { margin: 0; color: #c2c6d6; line-height: 1.45; flex: 1; }
  .play { align-self: flex-start; margin-top: .4rem; padding: .5rem 1.1rem; border-radius: 999px; background: #f2f3f7; color: #14161f; font-weight: 600; }
  footer { margin-top: 2.5rem; color: #6f7489; font-size: .85rem; }
</style>
</head>
<body>
  <header>
    <h1>Arcade</h1>
    <p>Pick a game. Free, no ads, no account.</p>
  </header>
  <main class="grid">${cards}
  </main>
  <footer>${games.length} game${games.length === 1 ? '' : 's'}</footer>
</body>
</html>
`);

console.log(`_site/ ready: ${games.map((g) => g.name).join(', ')}`);
