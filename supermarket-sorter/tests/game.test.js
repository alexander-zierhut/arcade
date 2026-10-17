'use strict';
var H = require('./helpers.js'), assert = H.assert, idAt = H.idAt, ofType = H.ofType;
var G = require('../src/game/game.js');
var B = require('../src/game/board.js');
var C = require('../src/config.js');

function level(fill, mode, extra) {
  var s = H.spec(fill); s.n = 1; s.tag = 'normal'; s.timeMs = mode === 'timed' ? 30000 : 0; s.par = 4;
  if (extra) for (var k in extra) s[k] = extra[k];
  return s;
}
function v2(comps, mode, extra) {
  var s = { n: 1, tag: 'normal', shape: 'G', rows: comps.length, cols: 1, comps: comps.map(function (c, i) { c.row = i; c.col = 0; return c; }), timeMs: mode === 'timed' ? 30000 : 0, par: 4 };
  if (extra) for (var k in extra) s[k] = extra[k];
  return s;
}
test('game: a plain move counts, scores nothing and keeps playing', function () {
  var g = G.createGame(level([['a', 'b'], ['c'], ['a', 'a']]), 'relaxed');
  var ev = G.moveItem(g, idAt(g.board, 0, 1), 1);
  assert.strictEqual(ev.length, 1); assert.strictEqual(ev[0].type, 'move');
  assert.strictEqual(g.moves, 1); assert.strictEqual(g.score, 0); assert.strictEqual(g.status, 'playing');
  assert.deepStrictEqual(G.moveItem(g, 999, 1), []);
  assert.strictEqual(g.undo.length, 1);
});
test('game: timed: a match scores MATCH_POINTS, the next within the window doubles the chain, the window ends it', function () {
  var g = G.createGame(level([['a', 'b'], ['b', 'b'], ['a', 'a'], ['c', 'c', 'c']], 'timed'), 'timed');
  G.start(g);
  assert.strictEqual(g.board.matches, 1, 'a starting triple resolves at creation');
  var ev = G.moveItem(g, idAt(g.board, 0, 0), 2);
  assert.strictEqual(ofType(ev, 'match').length, 1);
  assert.strictEqual(g.score, C.MATCH_POINTS); assert.strictEqual(g.combo, 1);
  G.tick(g, 1000);
  var ev2 = G.moveItem(g, idAt(g.board, 0, 1), 1);
  assert.strictEqual(ofType(ev2, 'match')[0].combo, 2);
  assert.strictEqual(ofType(ev2, 'combo')[0].combo, 2);
  assert.strictEqual(g.score, C.MATCH_POINTS + Math.round(C.MATCH_POINTS * (1 + C.COMBO_STEP)) + 250 + 29 * 5 + 250, 'second match, clear bonus, time bonus, flawless');
  assert.strictEqual(g.status, 'won');
});
test('game: timed combo ends through tick with a comboEnd event', function () {
  var g = G.createGame(level([['a'], ['a', 'a', 'b'], [], ['b', 'b'], ['d', 'd', 'd']], 'timed'), 'timed');
  G.start(g);
  G.moveItem(g, idAt(g.board, 1, 2), 2);
  G.moveItem(g, idAt(g.board, 0, 0), 1);
  assert.strictEqual(g.combo, 1);
  var ev = G.tick(g, 100); for (var i = 0; i < 70 && !ofType(ev, 'comboEnd').length; i++) ev = ev.concat(G.tick(g, 100));
  assert.strictEqual(ofType(ev, 'comboEnd').length, 1);
  assert.strictEqual(g.combo, 0);
});
test('game: relaxed combo is a 3-move window and gives no points', function () {
  var g = G.createGame(level([['a', 'a'], ['a', 'b'], ['b', 'b'], ['c', 'c'], ['c'], [], ['d', 'd', 'e'], ['d', 'e', 'e']]), 'relaxed');
  G.moveItem(g, idAt(g.board, 1, 0), 0);                     // match a -> combo 1
  assert.strictEqual(g.combo, 1); assert.strictEqual(g.score, 0);
  G.moveItem(g, idAt(g.board, 3, 0), 5); G.moveItem(g, idAt(g.board, 3, 1), 5);   // two plain moves
  assert.strictEqual(g.combo, 1);
  var ev = G.moveItem(g, idAt(g.board, 5, 0), 3);            // third plain move: window closes
  assert.strictEqual(ofType(ev, 'comboEnd').length, 1); assert.strictEqual(g.combo, 0);
});
test('game: clearing the board wins with efficiency and stars in relaxed', function () {
  var g = G.createGame(level([['a', 'a'], ['a'], []], 'relaxed', { par: 1 }), 'relaxed');
  var ev = G.moveItem(g, idAt(g.board, 1, 0), 0);
  var done = ofType(ev, 'cleared')[0];
  assert.ok(done, 'cleared event'); assert.strictEqual(g.status, 'won');
  assert.strictEqual(done.stars, 3);
  assert.strictEqual(done.bonus.efficiency, 1000);
  assert.strictEqual(g.score, 1000);
  assert.deepStrictEqual(G.moveItem(g, 1, 0), [], 'no moves after the win');
});
test('game: timed mode counts down, warns, offers +30 s once and then loses', function () {
  var g = G.createGame(level([['a', 'a'], ['a'], []], 'timed', { timeMs: 40000 }), 'timed');
  assert.deepStrictEqual(G.tick(g, 1000), [], 'the clock waits for the first touch');
  G.start(g);
  var ev = [];
  for (var i = 0; i < 400 && g.status === 'playing'; i++) ev = ev.concat(G.tick(g, 100));
  assert.deepStrictEqual(ofType(ev, 'timeWarn').map(function (e) { return e.level; }), ['amber', 'red']);
  assert.strictEqual(g.status, 'timeout'); assert.strictEqual(ofType(ev, 'timeout')[0].canExtend, true);
  assert.strictEqual(G.extend(g).length, 1); assert.strictEqual(g.status, 'playing'); assert.strictEqual(g.timeLeftMs, 30000);
  assert.deepStrictEqual(G.extend(g), []);
  for (i = 0; i < 400 && g.status === 'playing'; i++) ev = G.tick(g, 100);
  assert.strictEqual(g.status, 'lost'); assert.strictEqual(ofType(ev, 'timeout')[0].canExtend, false);
  assert.deepStrictEqual(G.tick(g, 1000), []);
});
test('game: layers reveal when the front empties, locks open after N matches, orphans end the level', function () {
  var g = G.createGame(v2([
    { layers: [['a', 'b', null], ['c', 'c', null]] },
    { layers: [['a', null, null]], lockAt: 1 },
    { layers: [['b', null, null]] },
    { layers: [['c', null, null]] },
    { layers: [[null, null, null]] },
    { layers: [['d', 'd', null]] },
    { layers: [['d', 'e', 'e']] },
    { layers: [['e', null, null]] }
  ]), 'relaxed');
  var ev = G.moveItem(g, idAt(g.board, 0, 0), 2);         // a to comp 2 (the locked comp 1 holds the third a)
  assert.strictEqual(ofType(ev, 'reveal').length, 0);
  assert.deepStrictEqual(G.moveItem(g, idAt(g.board, 2, 0), 1), [], 'locked compartment refuses drops');
  ev = G.moveItem(g, idAt(g.board, 0, 1), 4);            // b away: comp 0 front empty -> reveal c c
  var rv = ofType(ev, 'reveal')[0];
  assert.ok(rv, 'reveal event'); assert.strictEqual(rv.comp, 0); assert.strictEqual(rv.layer.length, 2);
  ev = G.moveItem(g, idAt(g.board, 3, 0), 0);            // c c c -> match 1 -> lock opens
  assert.strictEqual(ofType(ev, 'match').length, 1);
  assert.strictEqual(ofType(ev, 'unlock')[0].comp, 1);
  assert.strictEqual(g.status, 'playing');
  G.rescue(g); assert.strictEqual(g.board.bunnies, 1);
  ev = G.spend(g, 2);                                     // clears b a -> a and b have 1 copy each -> orphan sweep
  assert.strictEqual(ofType(ev, 'spend').length, 1);
  var sw = ofType(ev, 'sweep')[0];
  assert.ok(sw && sw.products.sort().join() === 'a,b', 'a and b swept');
  assert.strictEqual(g.board.remaining.a, undefined); assert.strictEqual(B.frontEmpty(g.board, 1), true); assert.strictEqual(B.frontEmpty(g.board, 4), true);
  assert.strictEqual(g.status, 'playing', 'd and e can still match');
  ev = G.moveItem(g, idAt(g.board, 6, 0), 5);            // d d d
  assert.strictEqual(ofType(ev, 'match').length, 1);
  ev = G.moveItem(g, idAt(g.board, 7, 0), 6);            // e e e -> won
  assert.strictEqual(g.status, 'won');
  assert.strictEqual(ofType(ev, 'cleared').length, 1);
  // the orphan rule alone: a triple that leaves only pairs behind wins at once
  var g2 = G.createGame(level([['a', 'a'], ['a', 'b'], ['b', null, null]]), 'relaxed');
  ev = G.moveItem(g2, idAt(g2.board, 1, 0), 0);
  assert.strictEqual(g2.status, 'won'); assert.strictEqual(ofType(ev, 'cleared')[0].leftovers.orphans, 2);
});
test('game: belts are take-only, bar after the take, and a bunny is collected then spent', function () {
  var g = G.createGame(v2([
    { layers: [['a', 'a', null]] },
    { layers: [['b', 'b', '*']] },
    { layers: [['b', null, null]] }
  ], 'relaxed', { belts: [{ id: 'L', cells: ['a', 'c', 'c', 'c'] }] }), 'relaxed');
  var take = g.board.belts[0].cells[0].item;
  var ev = G.moveItem(g, take, 0);
  assert.strictEqual(ofType(ev, 'take').length, 1); assert.strictEqual(ofType(ev, 'bar')[0].reason, 'take');
  assert.strictEqual(ofType(ev, 'match').length, 1, 'a a a');
  var bunny = idAt(g.board, 1, 2);
  ev = G.collect(g, bunny);
  assert.strictEqual(ofType(ev, 'collect').length, 1); assert.strictEqual(g.board.bunnies, 1);
  assert.deepStrictEqual(G.moveItem(g, idAt(g.board, 1, 0), 99), [], 'cannot drop onto a belt');
  ev = G.spend(g, 1);                                     // clears b b -> b has 1 left -> orphan sweep -> remaining c c c on the belt
  assert.strictEqual(g.board.bunnies, 0);
  assert.strictEqual(ofType(ev, 'sweep')[0].products[0], 'b');
  assert.strictEqual(g.status, 'playing');
  var c1 = g.board.belts[0].cells[1].item, c2 = g.board.belts[0].cells[2].item, c3 = g.board.belts[0].cells[3].item;
  G.moveItem(g, c1, 0); G.moveItem(g, c2, 0); ev = G.moveItem(g, c3, 0);
  assert.strictEqual(g.status, 'won');
});
test('game: undo restores board, score and combo but not moves; stuck is reported once and cleared by undo', function () {
  var g = G.createGame(v2([
    { layers: [['a', 'b', 'c']] }, { layers: [['a', 'b', 'c']] }, { layers: [['a', 'b', null]] }
  ], 'relaxed', { belts: [{ id: 'L', cells: ['c'] }] }), 'relaxed');
  var hash0 = B.hash(g.board);
  var ev = G.moveItem(g, g.board.belts[0].cells[0].item, 2);    // rack full, no match, nothing left to take -> stuck
  assert.strictEqual(ofType(ev, 'stuck').length, 1);
  assert.strictEqual(g.moves, 1);
  var u = G.undo(g);
  assert.strictEqual(ofType(u, 'undo').length, 1); assert.strictEqual(ofType(u, 'unstuck').length, 1);
  assert.strictEqual(B.hash(g.board), hash0);
  assert.strictEqual(g.moves, 1, 'moves only grow'); assert.strictEqual(g.flawless, false);
  assert.deepStrictEqual(G.undo(g), []);
});
test('game: snapshot and restore round-trip with layers, belts and the undo stack', function () {
  var g = G.createGame(v2([
    { layers: [['a', 'b', null], ['c', 'c', 'd']] }, { layers: [['a', 'a', null]], lockAt: 2 }, { layers: [['b', null, null]] }
  ], 'timed', { belts: [{ id: 'R', appearAt: 1, cells: ['b', 'd'] }] }), 'timed', { score: 500 });
  G.start(g);
  G.moveItem(g, idAt(g.board, 0, 0), 2);
  G.tick(g, 1234);
  var r = G.restore(JSON.parse(JSON.stringify(G.snapshot(g))));
  assert.strictEqual(r.score, g.score); assert.strictEqual(r.moves, 1); assert.strictEqual(r.timeLeftMs, g.timeLeftMs);
  assert.strictEqual(B.hash(r.board), B.hash(g.board)); assert.strictEqual(r.undo.length, 1); assert.strictEqual(r.board.belts[0].appeared, false);
});
test('game: a move never changes the number of free slots unless it matches (single-layer boards)', function () {
  var R = require('../src/game/rng.js');
  var rng = R.create('free-invariant');
  for (var lv = 1; lv <= 30; lv += 2) {
    var g = G.createGame(H.singleLayer(lv), 'relaxed');
    for (var i = 0; i < 60 && g.status === 'playing'; i++) {
      var moves = B.legalMoves(g.board), m = rng.pick(moves), before = B.totalFree(g.board);
      var ev = G.moveItem(g, m.item, m.to);
      var matched = ofType(ev, 'match').length;
      assert.strictEqual(B.totalFree(g.board), before + 3 * matched);
      assert.ok(B.progressPossible(g.board));
    }
  }
});
