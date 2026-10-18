// Serves the built site over http and boots every game in headless Chrome: no failed request, no
// response >= 400, no console or page error, and the game's own global is up. Catches what the file-level
// checks cannot: a hashed script that 404s, a manifest that is not served, a game that throws on load.
// Then the arcade kit (shared/) in every game: loading screen gone, home and share wired, news sheet, share
// fallback, performance switch, campaign card, the once-only app hint on a phone, and the selector's backup
// export / import round trip into a game.
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
  'penguin-march': () => !!(window.PM && PM.app && PM.app.state === 'TITLE' && PM.app.assets && PM.app.assets.failed.length === 0),
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

  // ---- the arcade kit (shared/) in every game and on the selector, on the built site ----
  for (const game of Object.keys(BOOT)) {
    it(`${game}: the kit is up, the loading screen is gone, home and share are wired, the kit's cards work`, async () => {
      const { ctx, page, problems } = await load(`${base}/${game}/`);
      try {
        await page.waitForFunction(BOOT[game], null, { timeout: 5000 });
        const k = await page.evaluate(() => ({
          game: Arcade.config().game, version: Arcade.config().version, kit: Arcade.KIT_VERSION, prefix: Arcade.storage.key(''),
          loading: Arcade.loading.visible(), root: !!document.getElementById('arcade-ui'), screen: Arcade.current(),
          home: [...document.querySelectorAll('[data-arcade="home"]')].map((e) => ({ hidden: e.hidden, wired: e.getAttribute('data-arcade-wired'), text: e.textContent.trim() || e.getAttribute('aria-label') || '' })),
          share: !!document.querySelector('[data-arcade="share"], [data-act="share"]'),
          news: Arcade.news.list().map((e) => e.version), unseen: Arcade.news.unseen(), lang: Arcade.lang.get(), htmlLang: document.documentElement.lang,
          items: Arcade.menu.items().map((i) => i.id), perfLow: Arcade.perf.low(), bodyLow: document.body.classList.contains('arcade-low-perf'),
          session: !!Arcade.stats.session(), stored: Object.keys(localStorage).filter((x) => x.startsWith('arcade.')),
        }));
        assert.equal(k.game, game);
        assert.match(k.version, /^\d+\.\d+\.\d+$/);
        assert.equal(k.prefix, game.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()) + '.');
        assert.equal(k.loading, false, 'the loading screen is gone once the game is up');
        assert.ok(k.root, 'the kit root is in the page');
        assert.equal(k.screen, 'title', 'the game told the kit it is on the title');
        assert.ok(k.home.length >= 1 && k.home.every((h) => !h.hidden && h.wired === '1' && h.text), `a wired, visible home entry: ${JSON.stringify(k.home)}`);
        assert.ok(k.share, 'a share button exists');
        assert.ok(k.news.length >= 1 && k.news[0] === k.version, `news.js has the current version first: ${k.news}`);
        assert.equal(k.lang, k.htmlLang);
        assert.deepEqual(k.items.slice(0, 2), ['home', 'install']);
        assert.equal(k.perfLow, false); assert.equal(k.bodyLow, false);
        assert.ok(k.session, 'a statistics session runs');
        assert.ok(k.stored.includes('arcade.session'), `kit keys: ${k.stored}`);

        // the news sheet, the share fallback, the performance switch, a campaign card
        const s = await page.evaluate(async () => {
          Arcade.news.open();
          const newsShown = !!document.querySelector('#arcade-ui .arcade-sheet .arcade-news h3');
          const seen = Arcade.news.seen();
          Arcade.closeSheet();
          Arcade.share.set({ line: 'Test line 123' });
          const text = Arcade.share.text();
          const share = await Arcade.share.go();                      // headless: no Web Share, the clipboard may be refused
          Arcade.perf.set('low');
          const low = { kit: Arcade.perf.low(), body: document.body.classList.contains('arcade-low-perf') };
          Arcade.perf.set('auto');
          Arcade.campaigns.define([{ id: 'test', every: 1, text: { en: 'Hello from the test', de: 'Hallo' }, button: 'Go', url: 'https://example.com/' }]);
          Arcade.screen('pause');
          const card = document.querySelector('#arcade-ui .arcade-sheet .arcade-text');
          const campaign = { shown: !!card && /Hello from the test/.test(card.textContent), stored: !!(Arcade.shared.get('campaigns', {}).test || {}).shownAt };
          Arcade.closeSheet(); Arcade.screen('title');
          return { newsShown, seen, text, share, low, campaign, unseenAfter: Arcade.news.unseen() };
        });
        assert.ok(s.newsShown, 'the news sheet lists an entry');
        assert.equal(s.seen, k.version, 'opening the news marks the version seen');
        assert.equal(s.unseenAfter, false);
        assert.match(s.text, /^Test line 123 · .+\nhttp:\/\/127\.0\.0\.1:\d+\/.+\/$/);
        assert.ok(['clipboard', 'none'].includes(s.share.method), `share fell back (${s.share.method})`);
        assert.deepEqual(s.low, { kit: true, body: true }, 'performance mode applies at once');
        assert.deepEqual(s.campaign, { shown: true, stored: true }, 'a due campaign shows on a quiet screen and is recorded');
        assert.deepEqual(problems, []);
      } finally { await ctx.close(); }
    });
  }

  it('on a phone in a browser tab the kit offers "play as an app" once', async () => {
    const game = Object.keys(BOOT)[0];
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' });
    const page = await ctx.newPage();
    try {
      await page.goto(`${base}/${game}/`, { waitUntil: 'networkidle' });
      await page.waitForFunction(BOOT[game], null, { timeout: 5000 });
      await page.waitForSelector('#arcade-ui .arcade-sheet .arcade-title', { timeout: 3000 });
      const hint = await page.evaluate(() => ({ title: document.querySelector('#arcade-ui .arcade-title').textContent, platform: Arcade.app.platform(), buttons: [...document.querySelectorAll('#arcade-ui .arcade-btn')].map((b) => b.textContent) }));
      assert.equal(hint.platform, 'android');
      assert.match(hint.title, /app/i);
      assert.ok(hint.buttons.length >= 1);
      await page.click('#arcade-ui .arcade-btn:last-child');          // "Later" / "Got it"
      const after = await page.evaluate(() => ({ open: Arcade.sheetOpen(), seen: !!Arcade.shared.get('installHint', null) }));
      assert.deepEqual(after, { open: false, seen: true });
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(BOOT[game], null, { timeout: 5000 });
      await page.waitForTimeout(600);
      assert.equal(await page.evaluate(() => Arcade.sheetOpen()), false, 'the hint does not come back');
    } finally { await ctx.close(); }
  });

  it('the selector exports a backup of every game and loads one back', async () => {
    const { ctx, page, problems } = await load(`${base}/`);
    try {
      // saves of two games on this origin, then the selector's export
      await page.evaluate(() => { localStorage.setItem('supermarketSorter.v1', '{"v":2,"records":{}}'); localStorage.setItem('penguinMarch.v1', '{"v":1,"reached":7}'); localStorage.setItem('arcade.lang', 'de'); });
      const out = await page.evaluate(() => {
        const text = Arcade.backup.exportText();
        return { text, described: Arcade.backup.describe(text), buttons: !!document.getElementById('backup-export') && !!document.getElementById('backup-import') };
      });
      assert.ok(out.buttons, 'export and import buttons on the selector');
      assert.deepEqual(out.described.games.map((g) => `${g.id}:${g.count}`), ['penguin-march:1', 'supermarket-sorter:1', 'arcade:1']);
      // a new device: nothing there, the backup loads at once (no game on this page), the saves are back
      const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page2 = await ctx2.newPage();
      try {
        await page2.goto(`${base}/`, { waitUntil: 'networkidle' });
        const res = await page2.evaluate((text) => { const r = Arcade.backup.importText(text); return { r, pm: localStorage.getItem('penguinMarch.v1'), lang: localStorage.getItem('arcade.lang') }; }, out.text);
        assert.equal(res.r.pending, false);
        assert.equal(res.pm, '{"v":1,"reached":7}');
        assert.equal(res.lang, 'de');
        // and a game on that device starts with the backup's language and sees the save
        await page2.goto(`${base}/penguin-march/`, { waitUntil: 'networkidle' });
        await page2.waitForFunction(BOOT['penguin-march'], null, { timeout: 5000 });
        const pm = await page2.evaluate(() => ({ reached: PM.app.save.reached, lang: Arcade.lang.stored() }));
        assert.equal(pm.reached, 7);
        assert.equal(pm.lang, 'de');
      } finally { await ctx2.close(); }
      assert.deepEqual(problems, []);
    } finally { await ctx.close(); }
  });

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
