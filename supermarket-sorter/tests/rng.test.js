'use strict';
var assert = require('assert');
var R = require('../src/game/rng.js');

test('rng: same seed, same sequence; different seeds differ', function () {
  var a = R.create('abc'), b = R.create('abc'), c = R.create('abd');
  var sa = [a.next(), a.next(), a.next()], sb = [b.next(), b.next(), b.next()], sc = [c.next(), c.next(), c.next()];
  assert.deepStrictEqual(sa, sb);
  assert.notDeepStrictEqual(sa, sc);
});
test('rng: int, range and pick stay in bounds', function () {
  var r = R.create(7);
  for (var i = 0; i < 2000; i++) {
    var v = r.int(5); assert.ok(v >= 0 && v < 5 && v === Math.floor(v));
    var w = r.range(3, 6); assert.ok(w >= 3 && w <= 6);
    assert.ok(['x', 'y'].indexOf(r.pick(['x', 'y'])) >= 0);
  }
});
test('rng: shuffle is a permutation and depends on the seed', function () {
  var r = R.create(1), arr = [1, 2, 3, 4, 5, 6, 7, 8, 9], s = r.shuffle(arr.slice());
  assert.deepStrictEqual(s.slice().sort(), arr);
  assert.deepStrictEqual(R.create(1).shuffle(arr.slice()), s);
});
