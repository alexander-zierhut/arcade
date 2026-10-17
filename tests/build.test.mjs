// Builds the whole site into a temp dir and checks what the deploy relies on: every reference resolves,
// scripts/styles/preview images carry a content hash, _site-immutable.txt matches the hashed files, the
// selector has a card per game and the old URLs redirect. Nothing here needs a browser.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://arcade.alzlper.com/';
const HASHED = /\.[0-9a-f]{10}\.[^./]+$/;
const games = readdirSync(root).filter((n) => existsSync(join(root, n, 'scripts', 'release.sh'))).sort();
// parsed from the script itself, so a new redirect is tested without touching this file
const redirects = Object.entries(JSON.parse(
  readFileSync(join(root, 'scripts', 'build-site.mjs'), 'utf8').match(/const REDIRECTS = (\{.*?\});/s)[1].replace(/'/g, '"')));

let tmp, site, immutableFile;
const read = (...p) => readFileSync(join(site, ...p), 'utf8');
const metaContent = (html, prop) => (html.match(new RegExp(`<meta\\s+(?:property|name)="${prop}"\\s+content="([^"]*)"`)) || [])[1];
const walk = (dir, base = dir) => readdirSync(dir).flatMap((n) => {
  const f = join(dir, n);
  return statSync(f).isDirectory() ? walk(f, base) : [f.slice(base.length + 1).split('\\').join('/')];
});

/** Local references of one page: [kind, path relative to the site root]. Absolute URLs of our own origin
 *  (og:image) map to the same path; other URLs are ignored. */
function refsOf(page) {
  const html = read(page);
  const dir = dirname(page) === '.' ? '' : dirname(page) + '/';
  const out = [];
  const add = (kind, ref) => {
    if (ref.startsWith(SITE_URL)) return out.push([kind, ref.slice(SITE_URL.length)]);
    if (/^(?:[a-z]+:|\/\/|#)/i.test(ref)) return;
    out.push([kind, (dir + ref).split('\\').join('/')]);
  };
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) add('script', m[1]);
  for (const m of html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g)) add('stylesheet', m[1]);
  for (const m of html.matchAll(/<meta\b[^>]*\b(?:property|name)="(?:og|twitter):image"[^>]*\bcontent="([^"]+)"/g)) add('image', m[1]);
  if (page === 'index.html') for (const m of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) add('image', m[1]);
  return out;
}

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'arcade-site-'));
  site = join(tmp, '_site');
  immutableFile = `${site}-immutable.txt`;
  execFileSync('node', ['scripts/build-site.mjs'], { cwd: root, env: { ...process.env, SITE_DIR: site }, stdio: 'pipe' });
});
after(() => rmSync(tmp, { recursive: true, force: true }));

describe('site build', () => {
  const pages = () => ['index.html', ...games.map((g) => `${g}/index.html`)];

  it('finds the games', () => assert.ok(games.length >= 2, `games: ${games}`));

  it('every referenced script, stylesheet and preview image exists', () => {
    for (const page of pages()) {
      for (const [kind, ref] of refsOf(page)) assert.ok(existsSync(join(site, ref)), `${page}: ${kind} ${ref} is missing`);
    }
  });

  it('every referenced script, stylesheet and og/twitter image is hashed', () => {
    for (const page of pages()) {
      for (const [kind, ref] of refsOf(page)) assert.match(ref, HASHED, `${page}: ${kind} ${ref} is not hashed`);
    }
  });

  it('a hash is the first 10 hex of the sha256 of the content', () => {
    for (const page of pages()) {
      for (const [, ref] of refsOf(page)) {
        const sum = createHash('sha256').update(readFileSync(join(site, ref))).digest('hex').slice(0, 10);
        assert.equal(ref.match(HASHED)[0].split('.')[1], sum, `${page}: ${ref} name does not match its content`);
      }
    }
  });

  it('no page references an unhashed script or stylesheet', () => {
    for (const page of walk(site).filter((f) => f.endsWith('.html'))) {
      for (const m of read(page).matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)) {
        if (/^(?:[a-z]+:|\/\/)/i.test(m[1])) continue;
        assert.match(m[1], HASHED, `${page}: ${m[1]}`);
      }
    }
  });

  it('_site-immutable.txt lists exactly the hashed files that exist', () => {
    const listed = readFileSync(immutableFile, 'utf8').split('\n').filter(Boolean);
    assert.equal(new Set(listed).size, listed.length, 'duplicates in the list');
    for (const f of listed) {
      assert.ok(!f.startsWith('/') && !f.startsWith('_site'), `not relative to the site root: ${f}`);
      assert.ok(existsSync(join(site, f)), `listed but missing: ${f}`);
    }
    // the deploy serves everything not listed as no-cache, so every hashed file must be listed
    assert.deepEqual([...listed].sort(), walk(site).filter((f) => HASHED.test(f)).sort());
  });

  it('the selector has one card per game, titled by the game\'s og:title', () => {
    const cards = [...read('index.html').matchAll(/<a class="card" href="([^"]+)">([\s\S]*?)<\/a>/g)];
    assert.deepEqual(cards.map((c) => c[1]), games.map((g) => `${g}/`));
    cards.forEach((c, i) => {
      const title = metaContent(read(games[i], 'index.html'), 'og:title');
      assert.ok(title, `${games[i]} has no og:title`);
      assert.equal(c[2].match(/<h2>(.*?)<\/h2>/)[1], title.replace(/&/g, '&amp;').replace(/&amp;amp;/g, '&amp;'));
    });
  });

  it('every game has a VERSION.txt', () => {
    for (const g of games) assert.ok(existsSync(join(site, g, 'VERSION.txt')), `${g}/VERSION.txt`);
  });

  it('every REDIRECTS entry points at its new game', () => {
    assert.ok(redirects.length > 0, 'REDIRECTS not parsed');
    for (const [from, to] of redirects) {
      assert.ok(games.includes(to), `${to} is not a game`);
      const html = read(from, 'index.html');
      assert.ok(html.includes(`url=../${to}/`), `${from}: meta refresh`);
      assert.ok(html.includes(`location.replace('../${to}/'`), `${from}: script redirect`);
      assert.ok(html.includes(`rel="canonical" href="${SITE_URL}${to}/"`), `${from}: canonical`);
    }
  });

  it('the root og:image and twitter:image are existing hashed files', () => {
    const html = read('index.html');
    for (const prop of ['og:image', 'twitter:image']) {
      const url = metaContent(html, prop);
      assert.ok(url && url.startsWith(SITE_URL), `no ${prop}`);
      const rel = url.slice(SITE_URL.length);
      assert.match(rel, HASHED);
      assert.ok(existsSync(join(site, rel)), `${prop} -> ${rel} is missing`);
    }
  });
});
