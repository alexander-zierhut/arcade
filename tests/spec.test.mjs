// docs/GAME-SPEC.md, the parts a script can check: every game has the kit's script block (in order, first in body),
// the init line, news.js, a web manifest with the icons the install prompt needs, the Open Graph tags, a home entry
// and a share entry in its markup, the kit's stylesheet, the shared/ link, and the test scripts CI runs. A new game
// that forgets one of them fails here, not on a phone.
import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const games = readdirSync(root).filter((n) => existsSync(join(root, n, 'scripts', 'release.sh'))).sort();
const KIT = ['core', 'ui', 'app', 'perf', 'stats', 'campaigns', 'news', 'share', 'backup', 'menu'];
const read = (...p) => readFileSync(join(root, ...p), 'utf8');

describe('game spec (docs/GAME-SPEC.md)', () => {
  it('the kit is complete', () => {
    for (const f of KIT) assert.ok(existsSync(join(root, 'shared', `${f}.js`)), `shared/${f}.js`);
    for (const f of ['arcade.css', 'hooks.js', 'README.md']) assert.ok(existsSync(join(root, 'shared', f)), `shared/${f}`);
    assert.ok(existsSync(join(root, 'docs', 'GAME-SPEC.md')));
  });

  for (const game of games) {
    describe(game, () => {
      const html = () => read(game, 'index.html');

      it('links shared/ to the kit', () => {
        const link = join(root, game, 'shared');
        assert.ok(existsSync(link) && lstatSync(link).isSymbolicLink(), `${game}/shared is a symlink`);
        assert.equal(readlinkSync(link), '../shared');
      });

      it('loads the kit first in body, in order, then hooks.js and news.js, then calls Arcade.init with its folder name and version', () => {
        const body = html().split(/<body[^>]*>/)[1];
        const scripts = [...body.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
        assert.deepEqual(scripts.slice(0, KIT.length + 2), [...KIT.map((f) => `shared/${f}.js`), 'shared/hooks.js', 'news.js']);
        const init = body.match(/Arcade\.init\(\{([^}]*)\}\)/);
        assert.ok(init, 'Arcade.init({ ... }) in body');
        assert.match(init[1], new RegExp(`game:\\s*'${game}'`));
        assert.match(init[1], /version:\s*'\d+\.\d+\.\d+'/);
        assert.match(init[1], /title:\s*'[^']+'/);
        // the init runs before any game script, so the loading screen shows at once
        const firstGameScript = body.indexOf('<script src="src/');
        assert.ok(firstGameScript < 0 || body.indexOf('Arcade.init(') < firstGameScript, 'Arcade.init before the game\'s own scripts');
      });

      it('has the kit stylesheet, a web manifest with 192 and 512 px icons, and the Open Graph tags', () => {
        const h = html();
        assert.match(h, /<link rel="stylesheet" href="shared\/arcade\.css">/);
        assert.match(h, /<link rel="manifest" href="manifest\.webmanifest">/);
        const m = JSON.parse(read(game, 'manifest.webmanifest'));
        for (const k of ['name', 'short_name', 'start_url', 'scope', 'display', 'background_color', 'theme_color']) assert.ok(m[k], `manifest.${k}`);
        assert.equal(m.scope, './', 'the manifest scope is the game folder (README "Storage")');
        for (const size of ['192x192', '512x512']) {
          const icon = (m.icons || []).find((i) => i.sizes === size);
          assert.ok(icon, `a ${size} icon in the manifest`);
          assert.ok(existsSync(join(root, game, icon.src)), `${icon.src} exists`);
        }
        for (const tag of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height']) assert.match(h, new RegExp(`<meta property="${tag}" content="[^"]+">`), tag);
        assert.match(h, new RegExp(`<meta property="og:url" content="https://arcade\\.alzlper\\.com/${game}/">`));
        assert.match(h, /<meta name="theme-color" content="#[0-9A-Fa-f]{6}">/);
        assert.match(h, /<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*">/);
      });

      it('offers the way home and a share button in its own markup', () => {
        const h = html();
        assert.match(h, /data-arcade="home"/, 'a data-arcade="home" element (title screen)');
        assert.match(h, /data-arcade="share"|data-act="share"/, 'a share button (end cards)');
      });

      it('has news.js in the kit\'s shape with a dated entry in both languages', () => {
        const m = read(game, 'news.js').match(/window\.ARCADE_NEWS\s*=\s*(\[[\s\S]*\]);/);
        assert.ok(m, 'window.ARCADE_NEWS = [ ... ];');
        const list = JSON.parse(m[1]);
        assert.ok(list.length >= 1);
        for (const e of list) {
          assert.match(e.version, /^\d+\.\d+\.\d+$/);
          assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
          for (const l of ['de', 'en']) assert.ok(typeof e[l] === 'string' && e[l].replace(/<[^>]*>/g, '').trim(), `${e.version}: ${l} text`);
        }
      });

      it('ships news.js, shared and the manifest in its release', () => {
        const files = JSON.parse(read(game, 'release.json')).files;
        for (const f of ['index.html', 'news.js', 'shared', 'manifest.webmanifest']) assert.ok(files.includes(f), `release.json files has ${f}`);
      });

      it('has the test scripts CI runs and a browser suite', () => {
        const pkg = JSON.parse(read(game, 'package.json'));
        assert.ok(pkg.scripts && pkg.scripts.test, 'npm test');
        assert.ok(pkg.scripts && pkg.scripts['test:browser'], 'npm run test:browser');
        assert.ok(existsSync(join(root, game, 'tests', 'browser', 'run.js')), 'tests/browser/run.js');
        assert.ok(existsSync(join(root, game, 'package-lock.json')), 'package-lock.json (CI uses npm ci)');
      });

      it('sets the kit\'s colours', () => {
        const css = readdirSync(join(root, game, 'src'), { recursive: true }).filter((f) => f.endsWith('.css')).map((f) => read(game, 'src', f)).join('\n');
        for (const v of ['--arcade-bg', '--arcade-card', '--arcade-ink', '--arcade-accent']) assert.ok(css.includes(`${v}:`), `${v} in the game's CSS`);
      });
    });
  }
});
