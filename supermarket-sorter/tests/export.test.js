'use strict';
// Progress export/import and the forward-compatibility contract: every fixture in tests/fixtures/ (one per released
// version) must still import in the current version with its progress intact. Never delete a fixture; add one per release.
var assert = require('assert');
var fs = require('fs'), path = require('path');
var S = require('../src/game/save.js');
var C = require('../src/config.js');
var FIX = path.join(__dirname, 'fixtures');

test('export: the record is self-describing with app, format, version and save version', function () {
  var s = S.recordLevel(S.normalizeSave(null), 'relaxed', 4, { score: 900, stars: 3, moves: 20, badges: [], date: '2026-10-10' }).save;
  var rec = S.exportRecord(s, { relaxed: null, timed: null }, { version: C.VERSION, rulesVersion: C.RULES_VERSION, date: '2026-10-10T20:00:00' });
  assert.strictEqual(rec.app, 'supermarket-sorter'); assert.strictEqual(rec.format, S.EXPORT_FORMAT); assert.strictEqual(rec.version, C.VERSION);
  assert.strictEqual(rec.saveVersion, S.SAVE_VERSION); assert.strictEqual(rec.rulesVersion, C.RULES_VERSION); assert.strictEqual(rec.exportedAt, '2026-10-10T20:00:00');
  assert.strictEqual(rec.save.records.relaxed.reached, 5);
  var back = S.importRecord(JSON.stringify(rec));
  assert.deepStrictEqual(back.save, rec.save); assert.strictEqual(back.info.version, C.VERSION); assert.strictEqual(back.info.newerFormat, false);
});
test('import: garbage, foreign files and missing data are refused with a reason; a newer format still loads what it can', function () {
  ['', '{', 'null', '[]', '{"app":"other","format":1,"save":{}}', '{"app":"supermarket-sorter","format":1}'].forEach(function (bad) {
    assert.throws(function () { S.importRecord(bad); }, Error, 'refused: ' + bad);
  });
  var newer = S.importRecord({ app: 'supermarket-sorter', format: 99, version: '9.9.9', saveVersion: 9, save: { v: 9, muted: true, records: { timed: { reached: 40, futureField: 1 } }, futureField: true }, runs: { timed: { v: 9, rulesVersion: 99, mode: 'timed', levelNo: 40, game: {} } } });
  assert.strictEqual(newer.info.newerFormat, true); assert.strictEqual(newer.save.muted, true); assert.strictEqual(newer.save.records.timed.reached, 40);
  assert.ok(newer.runs.timed, 'a run from a newer rules version is passed through (storage decides whether to restore it)');
});
test('import: every released fixture still imports with its progress intact (forward compatibility)', function () {
  var files = fs.readdirSync(FIX).filter(function (f) { return /^export-v.*\.json$/.test(f); }).sort();
  assert.ok(files.length >= 1, 'at least one fixture');
  files.forEach(function (f) {
    var text = fs.readFileSync(path.join(FIX, f), 'utf8'), r = S.importRecord(text), s = r.save;
    assert.strictEqual(s.v, S.SAVE_VERSION, f + ' normalises to the current save version');
    assert.ok(s.records.relaxed.reached >= 3, f + ' relaxed progress'); assert.ok(s.records.timed.reached >= 3, f + ' timed progress');
    assert.ok(s.records.timed.top.length >= 1 && s.records.timed.best >= 3900, f + ' timed highscores');
    assert.ok(s.records.relaxed.levels['1'] && s.records.relaxed.levels['1'].stars === 3, f + ' per-level record');
    assert.strictEqual(s.records.timed.serie.score, 2600, f + ' the Serie');
    assert.strictEqual(s.muted, true, f + ' settings'); assert.strictEqual(s.seenTips.drag, true, f + ' seen tips');
    // merging an import into a richer current save never loses progress on either side
    var current = S.recordLevel(S.normalizeSave(null), 'relaxed', 9, { score: 700, stars: 1, moves: 40, badges: [], date: '2026-11-01' }).save;
    var merged = S.mergeSave(current, s);
    assert.strictEqual(merged.records.relaxed.reached, 10); assert.strictEqual(merged.records.relaxed.levels['1'].best, 1000); assert.strictEqual(merged.records.timed.best, 3900);
    // the board in progress survives the file (whether it is restored is up to the rules version at import time)
    if (r.runs.relaxed) { assert.strictEqual(r.runs.relaxed.levelNo, 3); assert.ok(r.runs.relaxed.game && r.runs.relaxed.game.board); }
  });
});
test('import: the current fixture matches the current version (regenerate the fixture when the export format changes)', function () {
  var f = path.join(FIX, 'export-v' + C.VERSION + '.json');
  assert.ok(fs.existsSync(f), 'fixture for version ' + C.VERSION + ' exists (node -e script in tests/export.test.js header of the previous commit)');
  var rec = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.strictEqual(rec.format, S.EXPORT_FORMAT); assert.strictEqual(rec.saveVersion, S.SAVE_VERSION);
});
