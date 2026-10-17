// tests/golden.js: behaviour fingerprint for refactors. Writes docs/proof/golden-<tag>.json with one hash per area;
// two runs with identical hashes mean identical observable behaviour of the pure core. Usage: node tests/golden.js <tag>
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto');
var ROOT = path.resolve(__dirname, '..');
var C = require(path.join(ROOT, 'src/config.js'));
var RNG = require(path.join(ROOT, 'src/game/rng.js'));
var B = require(path.join(ROOT, 'src/game/board.js'));
var R = require(path.join(ROOT, 'src/game/rules.js'));
var SOL = require(path.join(ROOT, 'src/game/solver.js'));
var S = require(path.join(ROOT, 'src/game/score.js'));
var G = require(path.join(ROOT, 'src/game/game.js'));
var GEN = require(path.join(ROOT, 'src/game/gen.js'));
var L = require(path.join(ROOT, 'src/game/levels.js'));
var SAVE = require(path.join(ROOT, 'src/game/save.js'));
var CAT = require(path.join(ROOT, 'src/art/catalog.js'));
var SAMPLE = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 13, 20, 24, 27, 34, 40, 50, 60, 100, 301, 500];
function h(x) { return crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex').slice(0, 16); }
var out = { tag: process.argv[2] || 'run', version: C.VERSION };

out.levelsData = h(fs.readFileSync(path.join(ROOT, 'src/game/levels-data.js'), 'utf8'));
var levels = {};
['timed', 'relaxed'].forEach(function (mode) { SAMPLE.forEach(function (n) { levels[mode + n] = L.get(mode, n, CAT); }); });
out.levelsGet = h(levels);

// scripted games: hint moves, collects, one spend, undo every 7th move, ticks in timed mode
var traces = {};
['timed', 'relaxed'].forEach(function (mode) {
  [1, 3, 6, 7, 12, 24, 40].forEach(function (n) {
    var lv = levels[mode + n], g = G.createGame(lv, mode, { score: 100 }), ev = [], steps = 0, spent = false;
    G.start(g);
    while (g.status === 'playing' && steps < 400) {
      steps += 1;
      var did = false;
      for (var id in g.board.items) if (g.board.items[id].type === '*') { var ce = G.collect(g, +id); if (ce.length) { ev.push(ce); did = true; break; } }
      if (did) continue;
      if (!spent && g.board.bunnies > 0 && steps > 10) { for (var ci = 0; ci < g.board.comps.length; ci++) { var se = G.spend(g, ci); if (se.length) { ev.push(se); spent = true; break; } } if (spent) continue; }
      if (steps % 7 === 0 && g.undo.length) { ev.push(G.undo(g)); continue; }
      var m = SOL.hint(g.board, 20000);
      if (!m) break;
      ev.push(G.moveItem(g, m.item, m.to));
      if (mode === 'timed') ev.push(G.tick(g, 250));
    }
    traces[mode + n] = { ev: ev, snap: G.snapshot(g), status: g.status, score: g.score, moves: g.moves };
  });
});
out.traces = h(traces);

var gen = {};
['timed', 'relaxed'].forEach(function (mode) { [301, 302, 350, 600].forEach(function (n) { var r = GEN.generate(mode, n, { attempts: 12, nodes: 30000, playouts: 64 }); gen[mode + n] = r ? L.encode(r.level, r.witness) : null; }); });
out.generate = h(gen);

var rules = [];
for (var n = 1; n <= 400; n++) ['timed', 'relaxed'].forEach(function (mode) { var t = R.tag(n); rules.push([mode, n, t, R.speed100(mode, n, t), R.hidden(mode, n), R.timeLimitS(mode, n, t, 40, 30), R.isTurbo(mode, n), JSON.stringify(GEN.knobs(mode, n))]); });
out.rules = h(rules);

var sc = [];
for (var c = 1; c <= 9; c++) sc.push([S.multiplier(c), S.matchPoints(c)]);
sc.push(S.efficiency(30, 45), S.weighted(900, 12), S.clearBonus({ mode: 'timed', timeLeftMs: 61234, extended: false, flawless: true }, 2), S.clearBonus({ mode: 'relaxed', level: { par: 20 }, moves: 25 }, 0));
sc.push(S.stars({ mode: 'timed', level: { timeMs: 100000 }, timeLeftMs: 51000 }), S.stars({ mode: 'relaxed', level: { par: 10 }, moves: 14, rescueUsed: true }));
out.score = h(sc);

var saves = [];
fs.readdirSync(path.join(__dirname, 'fixtures')).forEach(function (f) { var txt = fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8'); var r = SAVE.importRecord(txt); saves.push(r.save, r.info); saves.push(SAVE.mergeSave(r.save, SAVE.recordLevel(SAVE.normalizeSave(null), 'relaxed', 9, { score: 700, stars: 1, moves: 40, badges: [], date: '2026-11-01' }).save)); });
saves.push(SAVE.normalizeSave({ v: 1, muted: true, records: { timed: { best: 900, bestLevel: 4, top: [{ score: 900, level: 4, date: '2026-10-10' }] }, relaxed: { top: [{ score: 3000, level: 7, date: '2026-10-10' }] } } }));
saves.push(SAVE.exportRecord(SAVE.normalizeSave(null), { timed: null, relaxed: null }, { version: 'x', rulesVersion: 2, date: 'd' }));
out.save = h(saves);

var stuck = [], rng = RNG.create('golden-stuck');
for (var t = 0; t < 300; t++) {
  var comps = [], nC = rng.range(2, 4), T = rng.range(2, 4);
  for (var ci2 = 0; ci2 < nC; ci2++) { var layers = []; for (var li = 0; li < rng.range(1, 3); li++) { var l = []; for (var s2 = 0; s2 < 3; s2++) l.push(rng.int(5) === 0 ? null : String(rng.int(T))); layers.push(l); } comps.push({ layers: layers, lockAt: rng.int(4) === 0 ? rng.range(1, 2) : 0, row: ci2, col: 0 }); }
  var cells = []; for (var k = 0; k < rng.range(0, 4); k++) cells.push(rng.int(6) === 0 ? '*' : String(rng.int(T)));
  var b = B.createBoard({ shape: 'G', rows: nC, cols: 1, comps: comps, belts: cells.length ? [{ id: 'L', cells: cells }] : [] });
  B.resolveAll(b); B.resolve(b, b.matches, false);
  stuck.push([B.hash(b), B.progressPossible(b), B.counts(b), B.canonical(b), B.legalMoves(b).length]);
}
out.stuck = h(stuck);

var file = path.join(ROOT, 'docs/proof/golden-' + out.tag + '.json');
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log(Object.keys(out).map(function (k) { return k + '=' + out[k]; }).join(' '));
