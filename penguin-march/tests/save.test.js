// tests/save.test.js: the save survives a round trip, garbage gives a fresh save, the shop takes coins.
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var H = require('./helpers.js');
var C = H.C, save = H.save;

test('save: fresh, round trip, and the key carries the game prefix', function () {
  var st = H.fakeStorage();
  assert.deepStrictEqual(save.load(st), save.fresh());
  var s = save.fresh();
  assert.strictEqual(save.recordWin(s, 1, 3, 40), 40);
  assert.strictEqual(save.recordWin(s, 2, 1, 30), 30);
  assert.strictEqual(save.recordWin(s, 1, 2, 10), 3, 'a replay of a won level pays a quarter');
  s.muted = true;
  assert.ok(save.save(s, st));
  assert.ok(Object.keys(st.data)[0].indexOf('penguinMarch.') === 0);
  var back = save.load(st);
  assert.deepStrictEqual(back, { v: 1, reached: 3, stars: { 1: 3, 2: 1 }, coins: 73, upgrades: { size: 0, rate: 0, dmg: 0 }, muted: true });
});

test('save: broken or foreign values give a fresh save, odd fields are clamped', function () {
  var st = H.fakeStorage();
  st.setItem(C.STORAGE_KEY, '{not json');
  assert.deepStrictEqual(save.load(st), save.fresh());
  st.setItem(C.STORAGE_KEY, JSON.stringify({ reached: -3, stars: { 1: 9, x: 2, 2: 2 }, coins: 12.7, upgrades: { size: 99, rate: -1 } }));
  var s = save.load(st);
  assert.strictEqual(s.reached, 1);
  assert.deepStrictEqual(s.stars, { 2: 2 });
  assert.strictEqual(s.coins, 12);
  assert.deepStrictEqual(s.upgrades, { size: C.MAX_SHOP, rate: 0, dmg: 0 });
  save.clear(st);
  assert.strictEqual(st.getItem(C.STORAGE_KEY), null);
});

test('save: buying takes the price and stops at the top level or when short of coins', function () {
  var s = save.fresh();
  s.coins = C.PRICES[0] - 1;
  assert.strictEqual(save.buy(s, 'size'), false);
  s.coins = C.PRICES[0];
  assert.strictEqual(save.buy(s, 'size'), true);
  assert.strictEqual(s.coins, 0);
  assert.strictEqual(s.upgrades.size, 1);
  s.upgrades.rate = C.MAX_SHOP; s.coins = 1e9;
  assert.strictEqual(save.buy(s, 'rate'), false);
  assert.strictEqual(save.buy(s, 'nope'), false);
});
