'use strict';
var assert = require('assert');
var S = require('../src/game/save.js');

test('save: normalizeSave turns garbage into v2 defaults', function () {
  [null, undefined, '', '{bad', 42, { muted: 'yes', records: { timed: { best: -5, top: 'x' } } }].forEach(function (raw) {
    var s = S.normalizeSave(raw);
    assert.strictEqual(s.v, 2); assert.strictEqual(s.muted, false); assert.strictEqual(s.showDepth, false); assert.strictEqual(s.lang, 'de');
    assert.strictEqual(s.records.timed.reached, 1); assert.deepStrictEqual(s.records.timed.top, []); assert.deepStrictEqual(s.records.timed.levels, {});
    assert.strictEqual(s.records.relaxed.totalBest, 0); assert.deepStrictEqual(s.records.relaxed.top, []);
  });
});
test('save: a v1 record migrates (timed top keeps entries with fromLevel 1, relaxed run totals become progress)', function () {
  var v1 = { v: 1, muted: true, records: { timed: { best: 900, bestLevel: 4, games: 2, top: [{ score: 900, level: 4, date: '2026-10-10' }] }, relaxed: { best: 3000, bestLevel: 7, top: [{ score: 3000, level: 7, date: '2026-10-10' }] } } };
  var s = S.normalizeSave(JSON.stringify(v1));
  assert.strictEqual(s.muted, true);
  assert.strictEqual(s.records.timed.top[0].fromLevel, 1); assert.strictEqual(s.records.timed.best, 900);
  assert.deepStrictEqual(s.records.relaxed.top, []); assert.strictEqual(s.records.relaxed.reached, 8);
});
test('save: recordRun banks a timed Serie into the top ten, sorted, with rank and new-best', function () {
  var s = S.normalizeSave(null), r;
  for (var i = 1; i <= 12; i++) { r = S.recordRun(s, 'timed', { score: i * 100, level: i + 3, fromLevel: i, date: '2026-10-10' }); s = r.save; assert.strictEqual(r.rank, 0); assert.strictEqual(r.newBest, true); }
  assert.strictEqual(s.records.timed.top.length, 10); assert.strictEqual(s.records.timed.best, 1200); assert.strictEqual(s.records.timed.top[0].fromLevel, 12);
  r = S.recordRun(s, 'timed', { score: 550, level: 3, fromLevel: 1, date: '2026-10-11' });
  assert.strictEqual(r.rank, 7); assert.strictEqual(r.newBest, false);
});
test('save: recordLevel keeps the best per level, advances reached, and builds the weighted relaxed top list', function () {
  var s = S.normalizeSave(null), r;
  r = S.recordLevel(s, 'relaxed', 3, { score: 800, stars: 2, moves: 30, badges: ['nohelp'], date: '2026-10-10' }); s = r.save;
  assert.strictEqual(r.improved, true); assert.strictEqual(s.records.relaxed.reached, 4); assert.strictEqual(s.records.relaxed.totalBest, 800);
  assert.strictEqual(s.records.relaxed.top[0].score, 824);
  r = S.recordLevel(s, 'relaxed', 3, { score: 700, stars: 3, moves: 40 }); s = r.save;
  assert.strictEqual(r.improved, false); assert.strictEqual(s.records.relaxed.levels['3'].best, 800);
  r = S.recordLevel(s, 'timed', 5, { score: 1500, stars: 3 }); s = r.save;
  assert.strictEqual(s.records.timed.levels['5'].best, 1500); assert.strictEqual(s.records.timed.reached, 6);
});
test('save: mergeSave takes settings and the Serie from next, the max of records and the union of top lists', function () {
  var a = S.recordRun(S.normalizeSave(null), 'timed', { score: 900, level: 4, fromLevel: 1, date: '2026-10-01' }).save;
  a.records.timed.serie = { score: 300, fromLevel: 4 };
  var b = S.normalizeSave(JSON.stringify({ v: 2, muted: true, records: { timed: { reached: 9, best: 300, top: [{ score: 300, level: 9, fromLevel: 7, date: '2026-10-02' }], serie: { score: 0, fromLevel: 9 } } } }));
  var m = S.mergeSave(JSON.stringify(a), b);
  assert.strictEqual(m.muted, true); assert.strictEqual(m.records.timed.best, 900); assert.strictEqual(m.records.timed.reached, 9);
  assert.strictEqual(m.records.timed.top.length, 2); assert.strictEqual(m.records.timed.serie.score, 0, 'the Serie comes from next');
  assert.strictEqual(S.mergeSave(a, {}).muted, false, 'missing settings keep the stored value');
  assert.strictEqual(S.mergeSave(a, {}).records.timed.serie.score, 300, 'missing Serie keeps the stored one');
});
