// Runs every game's scripts/release.sh and checks what it leaves behind: a valid release.json, a dist/ with
// index.html whose relative references all exist, VERSION.txt in its three-line format and the zip.
// Nothing here needs a browser.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const games = readdirSync(root).filter((n) => existsSync(join(root, n, 'scripts', 'release.sh'))).sort();

describe('release', () => {
  it('finds the games', () => assert.ok(games.length >= 2, `games: ${games}`));

  for (const game of games) {
    describe(game, () => {
      const dir = join(root, game);
      const manifest = () => JSON.parse(readFileSync(join(dir, 'release.json'), 'utf8'));
      const version = () => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
      let ran = false;
      const release = () => {
        if (!ran) execFileSync('bash', ['scripts/release.sh'], { cwd: dir, stdio: 'pipe' });
        ran = true;
      };

      it('has a release.json with a name and files', () => {
        const m = manifest();
        assert.ok(typeof m.name === 'string' && m.name.trim(), 'name');
        assert.ok(Array.isArray(m.files) && m.files.length, 'files');
      });

      it('scripts/release.sh succeeds and writes dist/index.html', () => {
        release();
        assert.ok(existsSync(join(dir, 'dist', 'index.html')));
      });

      it('every relative src/href in index.html exists in dist', () => {
        release();
        const html = readFileSync(join(dir, 'dist', 'index.html'), 'utf8');
        const refs = [...html.matchAll(/\b(?:src|href)="([^"]*)"/g)].map((m) => m[1])
          .filter((r) => r && !/^(?:http|data:|\/|#|mailto:)/.test(r)).map((r) => r.replace(/[?#].*$/, ''));
        assert.ok(refs.length, 'no relative references found');
        for (const r of refs) assert.ok(existsSync(join(dir, 'dist', r)), `missing in dist: ${r}`);
      });

      it('VERSION.txt has the name, the package.json version and a build date', () => {
        release();
        const text = readFileSync(join(dir, 'dist', 'VERSION.txt'), 'utf8');
        assert.match(text, /^[^\n]+\nversion [^\n]+\nbuilt \d{4}-\d{2}-\d{2}\n$/);
        const [name, ver] = text.split('\n');
        assert.equal(name, manifest().name);
        assert.equal(ver, `version ${version()}`);
      });

      it('writes the zip', () => {
        release();
        assert.ok(existsSync(join(dir, 'release', `${game}-v${version()}.zip`)));
      });
    });
  }
});
