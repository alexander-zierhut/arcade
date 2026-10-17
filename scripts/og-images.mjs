#!/usr/bin/env node
// Renders each game's Open Graph image (1200x630, <game>/assets/icons/og-image.png) from a real
// gameplay screenshot: the phone shot on the game's colour, title and pitch beside it. The screenshots
// live in the game's docs/preview (the browser tests and review tools write them). The page is laid out
// in HTML and shot with the system Chrome, so the typography matches the selector page.
// Usage: node scripts/og-images.mjs [game ...]   (default: every game in the table)
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const GAMES = {
  'cocktail-merge': {
    shot: 'docs/preview/game-play.png',
    color: '#6CC9F2', ink: '#1b3a4b', accent: '#ff7a3d',
    title: 'Cocktail Merge', sub: 'Beach Bar',
    pitch: 'Drop cocktails, merge pairs, chain combos. A physics merge game, free in the browser.',
    tags: ['Physics merge', 'Combo chains', '9 cocktails'],
  },
  'supermarket-sorter': {
    shot: 'docs/preview/og-play.png',
    color: '#8C4A2B', ink: '#fff6e8', accent: '#F2B749',
    title: 'Supermarket Sorter', sub: 'Match three on the shelf',
    pitch: 'Slide products between shelves until three of a kind meet. Relaxed or against the clock.',
    tags: ['Match 3', 'Puzzle levels', 'Timed mode'],
  },
  'penguin-march': {
    shot: 'docs/preview/game-play.png',
    color: '#1b4f7a', ink: '#f7f9fb', accent: '#ffb84d',
    title: 'Penguin March', sub: 'The gate runner from the ads, for real',
    pitch: 'Pick +9 or x2, grow the waddle, shoot the walls, beat the walrus. 50 authored levels, then endless.',
    tags: ['Gate runner', 'Riot levels', 'Endless'],
  },
};

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(existsSync) || process.env.CHROME_PATH;
if (!CHROME) throw new Error('no Chrome found; set CHROME_PATH');

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function html(g, shotDataUri) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body { background: ${g.color}; color: ${g.ink}; font-family: "DejaVu Sans", system-ui, sans-serif; position: relative; }
  .glow { position: absolute; left: -120px; top: -160px; width: 700px; height: 700px; border-radius: 50%;
          background: radial-gradient(closest-side, rgba(255,255,255,.28), rgba(255,255,255,0)); }
  .phone { position: absolute; left: 92px; top: 38px; width: 256px; height: 554px; border-radius: 30px; overflow: hidden;
           box-shadow: 0 30px 60px rgba(0,0,0,.35), 0 0 0 8px rgba(0,0,0,.18); transform: rotate(-3deg); background: #000; }
  .phone img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .text { position: absolute; left: 430px; top: 110px; width: 700px; }
  h1 { font-size: 72px; line-height: 1; font-weight: bold; letter-spacing: -1px; }
  h2 { font-size: 30px; font-weight: normal; margin-top: 14px; opacity: .85; }
  p { font-size: 25px; line-height: 1.35; margin-top: 30px; max-width: 640px; }
  .tags { display: flex; gap: 12px; margin-top: 34px; }
  .tag { padding: 10px 20px; border-radius: 999px; background: ${g.accent}; color: #1b1b1b; font-size: 21px; font-weight: bold; }
</style></head><body>
  <div class="glow"></div>
  <div class="phone"><img src="${shotDataUri}" alt=""></div>
  <div class="text">
    <h1>${esc(g.title)}</h1>
    <h2>${esc(g.sub)}</h2>
    <p>${esc(g.pitch)}</p>
    <div class="tags">${g.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
  </div>
</body></html>`;
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(GAMES);
for (const name of names) {
  const g = GAMES[name];
  if (!g) throw new Error(`${name}: not in the table in scripts/og-images.mjs`);
  const shot = join(root, name, g.shot);
  if (!existsSync(shot)) throw new Error(`${name}: screenshot ${g.shot} is missing`);
  const dataUri = 'data:image/png;base64,' + readFileSync(shot).toString('base64');
  const tmp = mkdtempSync(join(tmpdir(), 'og-'));
  const page = join(tmp, 'og.html');
  writeFileSync(page, html(g, dataUri));
  execFileSync(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--window-size=1200,630',
    `--screenshot=${join(tmp, 'og.png')}`, `file://${page}`], { stdio: 'ignore' });
  const out = join(root, name, 'assets', 'icons', 'og-image.png');
  copyFileSync(join(tmp, 'og.png'), out);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`${name}: ${out.slice(root.length + 1)}`);
}
