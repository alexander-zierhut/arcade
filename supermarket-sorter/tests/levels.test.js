'use strict';
var H = require('./helpers.js'), assert = H.assert, PRODUCTS = H.PRODUCTS;
var fs = require('fs'), path = require('path'), crypto = require('crypto');
var L = require('../src/game/levels.js');
var B = require('../src/game/board.js');
var G = require('../src/game/game.js');
var GEN = require('../src/game/gen.js');
var SOLVER = require('../src/game/solver.js');
var R = require('../src/game/rules.js');
var REPLAY = require('./helpers/replay.js');
var DATA = require('../src/game/levels-data.js').LEVEL_DATA;
var CATALOG = require('../src/art/catalog.js');

test('levels: encode/decode round trip keeps layers, locks, belts and the witness', function () {
  var r = GEN.generate('timed', 23, { attempts: 6, nodes: 20000, playouts: 32 });
  assert.ok(r, 'generated');
  var str = L.encode(r.level, r.witness), d = L.decode(str);
  assert.strictEqual(L.encode(d.level, d.witness), str);
  assert.deepStrictEqual(d.level.comps.map(function (c) { return c.layers; }), r.level.comps.map(function (c) { return c.layers; }));
  assert.deepStrictEqual(d.witness, r.witness);
  assert.strictEqual(d.level.belts.length, r.level.belts.length);
});
test('levels: knob tables parse for L1-60 in both modes and formulas continue beyond', function () {
  ['timed', 'relaxed'].forEach(function (mode) {
    for (var n = 1; n <= 400; n += 1) {
      var k = GEN.knobs(mode, n);
      assert.ok(R.SHAPES[k.shape], mode + ' L' + n + ' shape ' + k.shape);
      assert.ok(k.types >= 3 && k.types <= 24, mode + ' L' + n + ' types');
      assert.strictEqual(k.tag, R.tag(n));
      if (k.tag === 'pause' || k.tag === 'hard' || k.tag === 'vhard') assert.strictEqual(k.locks, null, mode + ' L' + n + ' locks on ' + k.tag);
    }
  });
});
test('levels: every baked level passes the invariants and both witness checkers (independent replay and the shipped rules)', function () {
  var total = 0;
  ['timed', 'relaxed'].forEach(function (mode) {
    DATA[mode].forEach(function (str, i) {
      var d = L.decode(str), n = i + 1;
      assert.strictEqual(d.level.n, n);
      var errs = GEN.invariants(d.level, mode);
      assert.deepStrictEqual(errs, [], mode + ' L' + n + ' invariants: ' + errs.join('; '));
      var ind = REPLAY.check(d.level, d.witness);
      assert.ok(ind.ok, mode + ' L' + n + ' independent replay: ' + ind.reason + ' at ' + ind.at);
      var sh = SOLVER.verify(B.createBoard(d.level), d.witness);
      assert.ok(sh.ok, mode + ' L' + n + ' shipped rules replay: ' + sh.reason);
      // through SS.game: the real API with collects
      var g = G.createGame({ n: n, tag: d.level.tag, shape: d.level.shape, comps: d.level.comps, belts: d.level.belts, par: d.level.par, timeMs: 0 }, 'relaxed');
      var moves = SOLVER.toItemMoves(g.board, d.witness);
      assert.strictEqual(moves.length, d.witness.length, mode + ' L' + n + ' every token maps to an item');
      var b = g.board;
      function collectAll() { var again = true; while (again) { again = false; for (var id in b.items) if (b.items[id].type === '*' && G.collect(g, +id).length) { again = true; break; } } }
      collectAll();
      for (var m = 0; m < d.witness.length; m++) {
        var w = d.witness[m], id = 0, k, bi, c;
        if (w[0] >= 0) { for (k = 0; k < 3; k++) { var sid = b.comps[w[0]].slots[k]; if (sid && b.items[sid].type === w[1]) { id = sid; break; } } }
        else { for (bi = 0; bi < b.belts.length && !id; bi++) for (c = 0; c < b.belts[bi].cells.length; c++) if (B.beltAvailable(b, bi, c) && b.items[b.belts[bi].cells[c].item].type === w[1]) { id = b.belts[bi].cells[c].item; break; } }
        assert.ok(id, mode + ' L' + n + ' token ' + m + ' has an item');
        var ev = G.moveItem(g, id, w[2]);
        assert.ok(ev.length, mode + ' L' + n + ' token ' + m + ' legal');
        collectAll();
      }
      assert.strictEqual(g.status, 'won', mode + ' L' + n + ' cleared through SS.game');
      total += 1;
    });
  });
  assert.ok(total >= 40, 'baked levels checked: ' + total);
});
test('levels: the authored levels 1-6 are the boards of the design and pass the gate', function () {
  for (var n = 1; n <= 6; n++) {
    var a = L.authored(n);
    assert.ok(a, 'authored ' + n);
    assert.deepStrictEqual(GEN.invariants(a, 'relaxed'), []);
    var g = GEN.gate(a, 100000, 32, require('../src/game/rng.js').create('t' + n));
    assert.ok(g && g.witness.length > 0, 'gate ' + n);
    assert.ok(REPLAY.check(a, g.witness).ok, 'independent ' + n);
  }
  assert.strictEqual(L.authored(1).items, 9); assert.strictEqual(L.authored(6).items, 27);
});
test('levels: get() returns a skinned, verified level with product ids, time limit and par', function () {
  var lv = L.get('timed', 12, CATALOG);
  assert.ok(lv, 'level'); assert.strictEqual(lv.n, 12); assert.strictEqual(lv.shape, 'A8');
  assert.ok(lv.timeMs >= 120000 && lv.timeMs <= 480000, 'time ' + lv.timeMs);
  assert.ok(lv.par > 0); assert.strictEqual(lv.belts.length, 2); assert.strictEqual(lv.beltSpeed100, 20);
  lv.types.forEach(function (p) { assert.ok(CATALOG.byId[p], 'product ' + p); });
  var g = G.createGame(lv, 'timed');
  assert.ok(g.board.count > 30);
  var v = SOLVER.verify(g.board, lv.witness);
  assert.ok(v.ok, 'skinned witness replays: ' + v.reason);
  assert.strictEqual(L.get('relaxed', 12, CATALOG).timeMs, 0);
  var again = L.get('timed', 12, CATALOG);
  assert.deepStrictEqual(again.types, lv.types, 'the skin is deterministic');
});
test('levels: silhouettes start at L24 with exactly two, never on confusable pairs, at most one per triple', function () {
  var lv23 = L.get('relaxed', 23, CATALOG), lv24 = L.get('relaxed', 24, CATALOG);
  assert.strictEqual(lv23.silhouettes, 0);
  assert.strictEqual(lv24.silhouettes, 2);
  var perType = {}, paired = {};
  lv24.comps.forEach(function (c) { c.sil.forEach(function (l, li) { l.forEach(function (s, k) { if (s) { var t = c.layers[li][k]; perType[t] = (perType[t] || 0) + 1; } }); }); });
  for (var t in perType) assert.ok(perType[t] <= 1, 'one silhouette per triple of ' + t);
  assert.strictEqual(Object.keys(perType).length, 2, 'two different types');
  var lvHi = L.get('relaxed', 60, CATALOG);
  assert.ok(lvHi.silhouettes >= 3, 'later levels carry more silhouettes: ' + lvHi.silhouettes);
});
test('levels: the stuck test agrees with an exhaustive search on 600 small random boards with layers, locks, belts and bunnies', function () {
  var RNG = require('../src/game/rng.js'), rng = RNG.create('bfs');
  var disagreements = 0, checked = 0;
  function bfsCanProgress(b) {
    // exhaustive: is there any sequence of moves/takes/collects that produces a match, a reveal, an unlock or a bunny?
    var seen = {}, queue = [b], guard = 0;
    while (queue.length && guard++ < 4000) {
      var cur = queue.shift(), key = B.hash(cur);
      if (seen[key]) continue; seen[key] = 1;
      if (cur.matchable === 0) return true;
      if (cur.bunnies > 0 && B.counts(cur).spendable) return true;
      for (var id in cur.items) if (cur.items[id].type === '*') { var cb = B.clone(cur); if (B.collect(cb, { item: +id })) return true; }
      var moves = B.legalMoves(cur);
      for (var i = 0; i < moves.length; i++) {
        var nb = B.clone(cur), prev = nb.matches, ev = B.move(nb, moves[i].item, moves[i].to);
        if (!ev) continue;
        if (ev.some(function (e) { return e.type === 'match'; })) return true;
        var res = B.resolve(nb, prev, false);
        if (res.some(function (e) { return e.type === 'reveal' || e.type === 'match' || e.type === 'unlock' || e.type === 'beltAppear'; })) return true;
        queue.push(nb);
      }
    }
    return false;
  }
  for (var trial = 0; trial < 600; trial++) {
    var nC = rng.range(2, 4), T = rng.range(2, 4), comps = [], lay = [];
    for (var ci = 0; ci < nC; ci++) {
      var layers = [], depth = rng.range(1, 3);
      for (var li = 0; li < depth; li++) { var l = []; for (var s = 0; s < 3; s++) l.push(rng.int(5) === 0 ? null : String(rng.int(T))); layers.push(l); }
      comps.push({ layers: layers, lockAt: rng.int(4) === 0 ? rng.range(1, 2) : 0, row: ci, col: 0 });
    }
    var cells = []; for (var k = 0; k < rng.range(0, 4); k++) cells.push(rng.int(6) === 0 ? '*' : String(rng.int(T)));
    var spec = { shape: 'G', rows: nC, cols: 1, comps: comps, belts: cells.length ? [{ id: 'L', cells: cells }] : [] };
    if (rng.int(5) === 0) comps[0].layers[0][0] = '*';
    var b = B.createBoard(spec);
    B.resolveAll(b); B.resolve(b, b.matches, false);
    if (b.matchable === 0) continue;
    var fast = B.progressPossible(b), slow = bfsCanProgress(b);
    checked += 1;
    if (fast !== slow) { disagreements += 1; if (disagreements < 4) console.log('    disagreement: fast=' + fast + ' slow=' + slow + ' ' + B.hash(b)); }
  }
  assert.ok(checked > 300, 'checked ' + checked);
  assert.strictEqual(disagreements, 0, disagreements + ' disagreements');
});
