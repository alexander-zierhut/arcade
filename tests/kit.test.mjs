// The arcade kit (shared/*.js) in node: the pure helpers every feature rests on (prefixes, language choice, backup
// format, campaign timing, performance verdict, statistics folding, news order, share text) and the storage and
// backup wrappers against a fake localStorage. The kit's DOM parts are covered by the games' browser suites and
// tests/site.test.mjs (the selector's export / import).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// a localStorage that behaves like the browser's (string values, key(i), length)
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear(), _map: m,
  };
}
globalThis.localStorage = fakeStorage();
export const FILES = ['core', 'ui', 'app', 'perf', 'stats', 'campaigns', 'news', 'share', 'backup', 'menu'];
for (const f of FILES) require(join(root, 'shared', `${f}.js`));
const A = globalThis.Arcade;
const pure = A.pure;

describe('kit: pure helpers', () => {
  it('prefixOf turns the folder name into the storage prefix of README "Storage"', () => {
    assert.equal(pure.prefixOf('supermarket-sorter'), 'supermarketSorter.');
    assert.equal(pure.prefixOf('cocktail-merge'), 'cocktailMerge.');
    assert.equal(pure.prefixOf('penguin-march'), 'penguinMarch.');
    assert.equal(pure.prefixOf('game4'), 'game4.');
  });
  it('pickLang: stored wins, then the browser language, then the first supported', () => {
    assert.equal(pure.pickLang('de', 'en-US', ['de', 'en']), 'de');
    assert.equal(pure.pickLang(null, 'de-DE', ['de', 'en']), 'de');
    assert.equal(pure.pickLang(null, 'fr-FR', ['de', 'en']), 'de');
    assert.equal(pure.pickLang('fr', 'en-GB', ['de', 'en']), 'en');
    assert.equal(pure.pickLang(null, undefined, ['en']), 'en');
    assert.equal(pure.pickLang(null, 'de', []), 'en');
  });
  it('compareVersions orders x.y.z numerically', () => {
    assert.equal(pure.compareVersions('0.3.3', '0.3.10'), -1);
    assert.equal(pure.compareVersions('1.0.0', '0.9.9'), 1);
    assert.equal(pure.compareVersions('1.2', '1.2.0'), 0);
  });
  it('newsSorted puts the newest version first and drops junk', () => {
    const s = pure.newsSorted([{ version: '0.3.1', en: 'a' }, null, { nope: 1 }, { version: '0.3.3', en: 'c' }, { version: '0.3.2', en: 'b' }]);
    assert.deepEqual(s.map((e) => e.version), ['0.3.3', '0.3.2', '0.3.1']);
  });
  it('newsPlain strips tags', () => assert.equal(pure.newsPlain('<p><b>More room:</b> the bar is gone.</p><p>x</p>'), 'More room: the bar is gone. x'));
  it('backup: encode / decode round trip, every value a string, keys sorted', () => {
    const text = pure.backupEncode({ 'supermarketSorter.v1': '{"a":1}', 'arcade.lang': '"de"', 'cocktailMerge.v1': '{}' }, { date: '2026-10-18T12:00:00', origin: 'https://arcade.alzlper.com' });
    const o = JSON.parse(text);
    assert.equal(o.kind, 'arcade-backup'); assert.equal(o.format, 1); assert.equal(o.origin, 'https://arcade.alzlper.com');
    assert.deepEqual(Object.keys(o.keys), ['arcade.lang', 'cocktailMerge.v1', 'supermarketSorter.v1']);
    const d = pure.backupDecode(text);
    assert.equal(d.date, '2026-10-18T12:00:00'); assert.equal(d.keys['supermarketSorter.v1'], '{"a":1}');
  });
  it('backup: decode refuses what is not a backup', () => {
    assert.throws(() => pure.backupDecode('nope'), /not json/);
    assert.throws(() => pure.backupDecode('{"kind":"x"}'), /not an arcade backup/);
    assert.throws(() => pure.backupDecode('{"kind":"arcade-backup","format":1}'), /not an arcade backup/);
    assert.deepEqual(pure.backupDecode('{"kind":"arcade-backup","format":1,"keys":{"a":"1","b":2}}').keys, { a: '1' });   // non-strings dropped
  });
  it('backup: describe says which games are in it', () => {
    const games = [{ id: 'supermarket-sorter', title: 'Supermarket Sorter' }, { id: 'cocktail-merge', title: 'Cocktail Merge' }];
    const g = pure.backupGames({ 'supermarketSorter.v1': '', 'supermarketSorter.v1.run.timed': '', 'arcade.lang': '', 'other.x': '' }, games);
    assert.deepEqual(g, [{ id: 'supermarket-sorter', title: 'Supermarket Sorter', count: 2 }, { id: 'arcade', title: 'Arcade', count: 1 }]);
  });
  it('campaignDue: the rhythm, the play-time threshold, the dates, the screens, the click', () => {
    const c = { id: 'kofi', every: 60, after: 15, text: 'x', url: 'https://x' }, h = 3600000, now = Date.parse('2026-10-18T12:00:00Z');
    assert.equal(pure.campaignDue(c, undefined, { now, playMs: 10 * 60000, screen: 'title' }), false, 'not enough play time');
    assert.equal(pure.campaignDue(c, undefined, { now, playMs: 20 * 60000, screen: 'title' }), true);
    assert.equal(pure.campaignDue(c, undefined, { now, playMs: 20 * 60000, screen: 'play' }), false, 'never during play');
    assert.equal(pure.campaignDue(c, { shownAt: now - h / 2 }, { now, playMs: 20 * 60000, screen: 'pause' }), false, 'shown 30 min ago');
    assert.equal(pure.campaignDue(c, { shownAt: now - h - 1 }, { now, playMs: 20 * 60000, screen: 'pause' }), true, 'shown over an hour ago');
    assert.equal(pure.campaignDue(c, { shownAt: now - 2 * h, clicked: now - 2 * h }, { now, playMs: 20 * 60000, screen: 'pause' }), false, 'clicked: never again');
    assert.equal(pure.campaignDue({ ...c, onceClicked: false }, { shownAt: now - 2 * h, clicked: now - 2 * h }, { now, playMs: 20 * 60000, screen: 'pause' }), true);
    assert.equal(pure.campaignDue({ ...c, until: '2026-10-01' }, undefined, { now, playMs: 20 * 60000, screen: 'title' }), false, 'expired');
    assert.equal(pure.campaignDue({ ...c, from: '2026-11-01' }, undefined, { now, playMs: 20 * 60000, screen: 'title' }), false, 'not yet');
    assert.equal(pure.campaignDue({ ...c, max: 2 }, { count: 2, shownAt: now - 5 * h }, { now, playMs: 20 * 60000, screen: 'title' }), false, 'max reached');
    assert.equal(pure.campaignDue({ ...c, screens: ['win'] }, undefined, { now, playMs: 20 * 60000, screen: 'title' }), false, 'not on this screen');
    assert.equal(pure.campaignDue({ id: 'x' }, undefined, { now, playMs: 0, screen: 'title' }), false, 'no text, no card');
  });
  it('perfVerdict: smooth frames are ok, dropped frames are low, too few samples say nothing', () => {
    const smooth = Array.from({ length: 240 }, (_, i) => 16.7 + (i % 3));
    const choppy = Array.from({ length: 240 }, (_, i) => (i % 4 === 0 ? 70 : 28));
    const mixed = Array.from({ length: 240 }, (_, i) => (i % 10 === 0 ? 50 : 17));   // a hiccup every 10th frame on a fast device: no verdict
    assert.equal(pure.perfVerdict(smooth), 'ok');
    assert.equal(pure.perfVerdict(choppy), 'low');
    assert.equal(pure.perfVerdict(mixed), null);
    assert.equal(pure.perfVerdict(smooth.slice(0, 50)), null);
  });
  it('statsFold records a session once (updates in place), caps at 300 and rebuilds the per-game totals', () => {
    let st = pure.statsFold(null, { id: 'a', game: 'cocktail-merge', start: 1000, end: 5000, playMs: 3000 });
    st = pure.statsFold(st, { id: 'a', game: 'cocktail-merge', start: 1000, end: 9000, playMs: 6000 });
    st = pure.statsFold(st, { id: 'b', game: 'penguin-march', start: 20000, end: 30000, playMs: 2500.4 });
    assert.equal(st.sessions.length, 2);
    assert.deepEqual(st.games['cocktail-merge'], { sessions: 1, playMs: 6000, last: 9000, first: 1000 });
    assert.deepEqual(st.games['penguin-march'], { sessions: 1, playMs: 2500, last: 30000, first: 20000 });
    for (let i = 0; i < 320; i++) st = pure.statsFold(st, { id: 'c' + i, game: 'x', start: i, end: i + 1, playMs: 1 });
    assert.equal(st.sessions.length, 300);
  });
  it('shareText puts the line, the title and the address together', () => {
    assert.equal(pure.shareText({ title: 'Supermarket Sorter', line: 'Level 12, 4.520 Punkte', url: 'https://arcade.alzlper.com/supermarket-sorter/' }), 'Level 12, 4.520 Punkte · Supermarket Sorter\nhttps://arcade.alzlper.com/supermarket-sorter/');
    assert.equal(pure.shareText({ title: 'Penguin March', url: 'u' }), 'Penguin March\nu');
  });
});

describe('kit: storage, language and backup against a fake localStorage', () => {
  it('init sets the game prefix; storage keys carry it; shared keys carry arcade.', () => {
    A.init({ game: 'supermarket-sorter', title: 'Supermarket Sorter', version: '0.3.3', loading: false });
    assert.equal(A.storage.key('seenVersion'), 'supermarketSorter.seenVersion');
    A.storage.set('seenVersion', '0.3.3');
    assert.equal(localStorage.getItem('supermarketSorter.seenVersion'), '"0.3.3"');
    assert.equal(A.storage.get('seenVersion'), '0.3.3');
    assert.equal(A.storage.get('missing', 42), 42);
    A.perf.set('low');
    assert.equal(JSON.parse(localStorage.getItem('arcade.perf')).mode, 'low');
    assert.equal(A.perf.low(), true);
    A.perf.set('auto');
    assert.equal(A.perf.low(), false);
  });
  it('the language is one preference for the whole arcade', () => {
    const seen = [];
    A.on('lang', (l) => seen.push(l));
    assert.equal(A.lang.get(), 'en');                     // node has no navigator: the first supported language
    assert.equal(A.lang.set('de'), 'de');
    assert.equal(localStorage.getItem('arcade.lang'), 'de');
    assert.equal(A.t('home'), 'Alle Spiele');
    assert.equal(A.lang.set('xx'), 'de', 'an unsupported code changes nothing');
    assert.equal(A.lang.toggle(), 'en');
    assert.deepEqual(seen, ['de', 'en']);
  });
  it('news: the latest entry, unseen until marked, text per language', () => {
    globalThis.ARCADE_NEWS = [{ version: '0.3.2', date: '2026-10-17', de: 'alt', en: 'old' }, { version: '0.3.3', date: '2026-10-18', de: 'neu', en: 'new' }];
    assert.equal(A.news.latest().version, '0.3.3');
    A.storage.remove('seenVersion');
    assert.equal(A.news.unseen(), true);
    A.news.markSeen();
    assert.equal(A.news.unseen(), false);
    assert.equal(A.news.text(A.news.latest(), 'de'), 'neu');
    assert.equal(A.news.text({ version: '1', de: 'nur de' }, 'en'), 'nur de');
  });
  it('backup: export carries every key on the origin; import inside a game is pending until applyPending', () => {
    localStorage.setItem('cocktailMerge.v1', '{"best":5}');
    const text = A.backup.exportText();
    const o = JSON.parse(text);
    assert.equal(o.keys['cocktailMerge.v1'], '{"best":5}');
    assert.equal(o.keys['supermarketSorter.seenVersion'], '"0.3.3"');
    localStorage.setItem('cocktailMerge.v1', '{"best":1}');
    A.backup.games = [{ id: 'cocktail-merge', title: 'Cocktail Merge' }, { id: 'supermarket-sorter', title: 'Supermarket Sorter' }];
    const d = A.backup.describe(text);
    assert.deepEqual(d.games.map((g) => g.id), ['cocktail-merge', 'supermarket-sorter', 'arcade']);
    assert.equal(A.backup.importText(text, () => false), null, 'the confirm can cancel');
    const res = A.backup.importText(text, (s) => s.games.length === 3);
    assert.equal(res.pending, true);
    assert.equal(localStorage.getItem('cocktailMerge.v1'), '{"best":1}', 'nothing written yet inside a game');
    assert.equal(A.backup.applyPending(), Object.keys(o.keys).length);
    assert.equal(localStorage.getItem('cocktailMerge.v1'), '{"best":5}', 'written on the next load');
    assert.equal(localStorage.getItem('arcade.pendingImport'), null);
    assert.throws(() => A.backup.importText('garbage'), /not json/);
  });
  it('screen() feeds the statistics: play time counts only on the play screen', () => {
    A.screen('title'); A.screen('play');
    const s = A.stats.session();
    assert.ok(s && s.game === 'supermarket-sorter');
    A.screen('pause');
    const sum = A.stats.summary();
    assert.ok(sum.games['supermarket-sorter'].sessions === 1);
    assert.ok(sum.games['supermarket-sorter'].playMs >= 0 && sum.games['supermarket-sorter'].playMs < 5000);
  });
  it('the menu lists the standard entries with labels in the current language', () => {
    const ids = A.menu.items().map((i) => i.id);
    assert.deepEqual(ids, ['home', 'install', 'fullscreen', 'app', 'share', 'news', 'perf', 'lang', 'backup-export', 'backup-import']);
    A.lang.set('de');
    assert.equal(A.menu.items()[0].label, 'Alle Spiele');
    assert.equal(A.menu.items()[6].label, 'Sparmodus: automatisch');
  });
});
