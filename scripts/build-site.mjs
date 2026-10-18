#!/usr/bin/env node
// Builds the whole arcade into _site/: every game's release (its scripts/release.sh writes <game>/dist)
// under _site/<game>/, plus a selector page at _site/index.html that shows a card per game, filled from the
// game's own Open Graph tags (og:title, og:description, og:image). A folder is a game when it has
// scripts/release.sh and its dist ends up with an index.html. Run from anywhere: node scripts/build-site.mjs
//
// Ready and beta: a game whose release.json says "status": "beta" is listed in its own section under the
// ready games, with a Beta badge and a note that it is still changing and that its saved progress may not
// survive the next version. Without a status (or with "ready") a game is listed as ready. The sections only
// appear when there is a beta game; otherwise the page is one plain grid.
//
// Content hashes: the games ship plain files, so this step gives every script and stylesheet that
// index.html references a name with its content hash (src/main.js -> src/main.3f9c2a7b1e.js) and rewrites
// the references. Those files never change under their name, so the deploy uploads them as immutable
// (cached for a year) while index.html and everything else stay no-cache: a new index.html always names
// the matching scripts, and nothing in between can serve a stale one. Files that a game loads by name at
// runtime (sprites, backgrounds, the manifest) keep their names. The list of hashed paths goes to
// _site-immutable.txt for scripts/deploy.sh.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// SITE_DIR lets tests/build.test.mjs build into a temp dir; the immutable list always sits beside it
const site = process.env.SITE_DIR ? resolve(process.env.SITE_DIR) : join(root, '_site');
const SITE_URL = 'https://arcade.alzlper.com/';

const hashOf = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 10);
const hashedName = (ref, hash) => ref.replace(/(\.[^./]+)$/, `.${hash}$1`);

/** hashAssets(dir, base) -> relative paths of the files it renamed. dir holds a copied release with an
 *  index.html, base its absolute URL (for the og:image / twitter:image tags, which are absolute). The
 *  preview images are hashed too, so a new picture gets a new URL and no cache keeps showing the old one. */
function hashAssets(dir, base) {
  const page = join(dir, 'index.html');
  let html = readFileSync(page, 'utf8');
  const hashed = [];
  const refs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g), ...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g)]
    .map((m) => m[1]);
  for (const m of html.matchAll(/<meta\b[^>]*\b(?:property|name)="(?:og|twitter):image"[^>]*\bcontent="([^"]+)"/g)) {
    if (m[1].startsWith(base)) refs.push(m[1].slice(base.length));
  }
  for (const ref of new Set(refs)) {
    if (/^(?:[a-z]+:|\/|#)/i.test(ref) || ref.includes('?')) continue;        // absolute, data: or already versioned
    const file = join(dir, ref);
    if (!existsSync(file)) throw new Error(`${page}: references ${ref}, which is not in the release`);
    const target = hashedName(ref, hashOf(file));
    renameSync(file, join(dir, target));
    html = html.split(`"${ref}"`).join(`"${target}"`).split(`"${base}${ref}"`).join(`"${base}${target}"`);
    hashed.push(target);
  }
  writeFileSync(page, html);
  return hashed;
}

// Old game folders that moved: a tiny page at the old URL sends the browser on (query and hash kept).
// Saved games are unaffected: localStorage belongs to the origin, not the path.
const REDIRECTS = { 'supermarkt-sortieren': 'supermarket-sorter' };

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const unesc = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (c, n) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[n]));

/** meta(html, prop) -> content of <meta property="prop"> (or name="prop") as text (entities decoded), '' when absent. */
function meta(html, prop) {
  const re = new RegExp(`<meta\\s+(?:property|name)="${prop}"\\s+content="([^"]*)"`, 'i');
  const m = html.match(re);
  return m ? unesc(m[1]) : '';
}

rmSync(site, { recursive: true, force: true });
mkdirSync(site);

const STATUSES = ['ready', 'beta'];
/** statusOf(dir, name) -> 'ready' | 'beta' from the game's release.json; a game without a manifest is ready. */
function statusOf(dir, name) {
  const file = join(dir, 'release.json');
  if (!existsSync(file)) return 'ready';
  let manifest;
  try { manifest = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${name}/release.json: ${e.message}`); }
  const status = manifest.status === undefined ? 'ready' : manifest.status;
  if (!STATUSES.includes(status)) throw new Error(`${name}/release.json: "status" must be one of ${STATUSES.join(', ')}, not ${JSON.stringify(status)}`);
  return status;
}

const games = [];
const immutable = [];
for (const name of readdirSync(root).sort()) {
  const dir = join(root, name);
  if (!existsSync(join(dir, 'scripts', 'release.sh'))) continue;
  const status = statusOf(dir, name);
  execFileSync('bash', ['scripts/release.sh'], { cwd: dir, stdio: 'inherit' });
  const dist = join(dir, 'dist');
  if (!existsSync(join(dist, 'index.html'))) throw new Error(`${name}: release.sh left no dist/index.html`);
  cpSync(dist, join(site, name), { recursive: true });
  for (const p of hashAssets(join(site, name), SITE_URL + name + '/')) immutable.push(`${name}/${p}`);
  const html = readFileSync(join(site, name, 'index.html'), 'utf8');          // after hashing: the card links the hashed image
  const title = meta(html, 'og:title') || (html.match(/<title>(.*?)<\/title>/) || [])[1] || name;
  const image = meta(html, 'og:image').replace(SITE_URL + name + '/', '');   // the tag is absolute; the card links relative
  games.push({ name, title, status, description: meta(html, 'og:description'), image: image ? `${name}/${image}` : '' });
}
if (!games.length) throw new Error('no games found (a game is a folder with scripts/release.sh)');
const ready = games.filter((g) => g.status === 'ready');
const beta = games.filter((g) => g.status === 'beta');

for (const [from, to] of Object.entries(REDIRECTS)) {
  if (!games.some((g) => g.name === to)) throw new Error(`redirect ${from} -> ${to}: no such game`);
  mkdirSync(join(site, from), { recursive: true });
  writeFileSync(join(site, from, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<link rel="canonical" href="${SITE_URL}${to}/">
<meta http-equiv="refresh" content="0; url=../${to}/">
<title>Moved</title>
<script>location.replace('../${to}/' + location.search + location.hash);</script>
</head>
<body><p>This game moved to <a href="../${to}/">${SITE_URL}${to}/</a>.</p></body>
</html>
`);
}

// h: the title's heading level, h2 in the plain grid and h3 under a section heading, so the outline never skips a level
const card = (g, h) => `
      <a class="card${g.status === 'beta' ? ' beta' : ''}" href="${g.name}/">
        ${g.image ? `<img src="${esc(g.image)}" alt="" width="1200" height="630" loading="lazy">` : '<div class="noimg"></div>'}
        ${g.status === 'beta' ? '<span class="badge">Beta</span>' : ''}
        <div class="body">
          <${h}>${esc(g.title)}</${h}>
          ${g.description ? `<p>${esc(g.description)}</p>` : ''}
          <span class="play">${g.status === 'beta' ? 'Play the beta' : 'Play'}</span>
        </div>
      </a>`;
const BETA_NOTE = 'Still being built. Expect big changes from version to version, and progress saved in a beta game may not carry over to the next version.';
// one plain grid while every game is ready; headed sections as soon as there is a beta game
const sections = !beta.length ? `
  <main class="grid">${games.map((g) => card(g, 'h2')).join('')}
  </main>` : `
  <main>${ready.length ? `
    <section class="group ready" aria-labelledby="ready-title">
      <h2 id="ready-title">Ready to play</h2>
      <div class="grid">${ready.map((g) => card(g, 'h3')).join('')}
      </div>
    </section>` : ''}
    <section class="group beta" aria-labelledby="beta-title">
      <h2 id="beta-title">Beta</h2>
      <p class="note">${BETA_NOTE}</p>
      <div class="grid">${beta.map((g) => card(g, 'h3')).join('')}
      </div>
    </section>
  </main>`;
const count = (n, what) => `${n} ${what}${n === 1 ? '' : 's'}`;
const footer = count(games.length, 'game') + (beta.length ? `, ${beta.length} in beta` : '');   // the total, as the description counts it

let ogImage = '';
if (existsSync(join(root, 'og-image.png'))) {
  const name = hashedName('og-image.png', hashOf(join(root, 'og-image.png')));
  cpSync(join(root, 'og-image.png'), join(site, name));
  immutable.push(name);
  ogImage = SITE_URL + name;
}
const description = `${count(games.length, 'free browser game')}, no ads, no account: ${[...ready, ...beta].map((g) => g.title + (g.status === 'beta' ? ' (beta)' : '')).join(', ')}.`;

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
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%2314161f'/%3E%3Ctext x='50' y='70' font-size='60' text-anchor='middle'%3E%F0%9F%95%B9%3C/text%3E%3C/svg%3E">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #14161f; color: #f2f3f7;
         display: flex; flex-direction: column; align-items: center; padding: 2.5rem 1rem 3rem; }
  header { text-align: center; margin-bottom: 2rem; }
  h1 { margin: 0 0 .4rem; font-size: clamp(2rem, 6vw, 3rem); letter-spacing: .04em; }
  header p { margin: 0; color: #a3a8bb; }
  main { width: 100%; max-width: 64rem; }
  .grid { width: 100%; display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr)); }
  .group + .group { margin-top: 3rem; padding-top: 2.25rem; border-top: 1px solid #2a2e40; }
  .group h2 { margin: 0 0 1rem; font-size: 1.1rem; letter-spacing: .12em; text-transform: uppercase; color: #a3a8bb; }
  .group.beta h2 { color: #ffb84d; }
  .note { margin: -.4rem 0 1.25rem; max-width: 46rem; color: #c2c6d6; line-height: 1.5; }
  .card { position: relative; display: flex; flex-direction: column; text-decoration: none; color: inherit; background: #1f2230; border-radius: 1.1rem; overflow: hidden;
          box-shadow: 0 10px 30px rgba(0,0,0,.35); transition: transform .15s, box-shadow .15s; outline: none; }
  .card:hover, .card:focus-visible { transform: translateY(-.25rem); box-shadow: 0 16px 40px rgba(0,0,0,.45); }
  .card:focus-visible { box-shadow: 0 0 0 3px #7aa2ff, 0 16px 40px rgba(0,0,0,.45); }
  .card.beta { outline: 1px solid rgba(255,184,77,.4); outline-offset: -1px; }   /* an outline, so the focus ring (a box-shadow) still shows */
  .card img, .noimg { display: block; width: 100%; height: auto; aspect-ratio: 1200 / 630; object-fit: cover; background: #2a2e40; }
  .badge { position: absolute; top: .8rem; left: .8rem; padding: .3rem .7rem; border-radius: 999px; background: #ffb84d; color: #14161f;
           font-size: .8rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; box-shadow: 0 2px 8px rgba(0,0,0,.4); }
  .body { padding: 1rem 1.1rem 1.2rem; display: flex; flex-direction: column; gap: .5rem; flex: 1; }
  .body h2, .body h3 { margin: 0; font-size: 1.25rem; letter-spacing: 0; text-transform: none; color: inherit; }
  .body p { margin: 0; color: #c2c6d6; line-height: 1.45; flex: 1; }
  .play { align-self: flex-start; margin-top: .4rem; padding: .5rem 1.1rem; border-radius: 999px; background: #f2f3f7; color: #14161f; font-weight: 600; }
  .card.beta .play { background: #ffb84d; }
  footer { margin-top: 2.5rem; color: #6f7489; font-size: .85rem; }
</style>
</head>
<body>
  <header>
    <h1>Arcade</h1>
    <p>Pick a game. Free, no ads, no account.</p>
  </header>
${sections}
  <footer>${footer}</footer>
</body>
</html>
`);

writeFileSync(`${site}-immutable.txt`, immutable.join('\n') + '\n');
console.log(`${site} ready: ${games.map((g) => g.name).join(', ')} (${immutable.length} hashed files in ${site}-immutable.txt)`);
