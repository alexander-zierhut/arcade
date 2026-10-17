// Serves the built site over http and boots every game in headless Chrome: no failed request, no
// response >= 400, no console or page error, and the game's own global is up. Catches what the file-level
// checks cannot: a hashed script that 404s, a manifest that is not served, a game that throws on load.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { launchChrome } = createRequire(import.meta.url)('./chrome.js');

// One line per game: runs in the page after load and returns true when the game is up. A game without a
// line fails below, so a new game cannot ship untested by accident.
const BOOT = {
  'supermarket-sorter': () => !!(window.SS && SS.app && SS.app.ctx.state === 'TITLE'),
  'cocktail-merge': () => !!(window.CM && document.querySelector('canvas#game')),
};

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain',
};
const games = readdirSync(root).filter((n) => existsSync(join(root, n, 'scripts', 'release.sh'))).sort();

let tmp, site, server, base, browser;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'arcade-site-'));
  site = join(tmp, '_site');
  execFileSync('node', ['scripts/build-site.mjs'], { cwd: root, env: { ...process.env, SITE_DIR: site }, stdio: 'pipe' });
  server = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = join(site, p);
    if (!f.startsWith(site + sep) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' });
    createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await launchChrome();
});
after(async () => {
  if (browser) await browser.close();
  if (server) server.close();
  rmSync(tmp, { recursive: true, force: true });
});

/** Opens url on a phone-sized page, waits for the network to settle, returns the page and what went wrong. */
async function load(url) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const problems = [];
  const responses = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e && e.message || e}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => problems.push(`failed: ${r.url()}`));
  page.on('response', (r) => { responses.push(r); if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });
  await page.goto(url, { waitUntil: 'networkidle' });
  return { ctx, page, problems, responses };
}

describe('built site in headless Chrome', () => {
  it('every game has a boot check', () => {
    assert.deepEqual(games.filter((g) => !BOOT[g]), [], 'add the game to BOOT in tests/site.test.mjs');
  });

  for (const game of Object.keys(BOOT)) {
    it(`${game} boots without errors`, async () => {
      const { ctx, page, problems, responses } = await load(`${base}/${game}/`);
      try {
        assert.ok(responses.length > 1, 'page loaded nothing but itself');
        await page.waitForFunction(BOOT[game], null, { timeout: 5000 });   // scripts may still be starting after networkidle
        assert.deepEqual(problems, []);
      } finally { await ctx.close(); }
    });
  }

  it('the selector page loads its images', async () => {
    const { ctx, page, problems, responses } = await load(`${base}/`);
    try {
      // the cards are loading="lazy": force them so the requests happen
      await page.evaluate(() => Promise.all([...document.images].map((i) => { i.loading = 'eager'; return i.decode().catch(() => {}); })));
      assert.deepEqual(problems, []);
      const imgs = await page.$$eval('.card img', (els) => els.map((e) => ({ src: e.currentSrc, ok: e.naturalWidth > 0 })));
      assert.equal(imgs.length, games.length);
      for (const i of imgs) {
        assert.ok(i.ok, `${i.src} did not decode`);
        assert.equal(responses.find((r) => r.url() === i.src)?.status(), 200, i.src);
      }
    } finally { await ctx.close(); }
  });
});
