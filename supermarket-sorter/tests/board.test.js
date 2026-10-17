'use strict';
var H = require('./helpers.js'), assert = H.assert, mk = H.mk, idAt = H.idAt;
var B = require('../src/game/board.js');

test('board: createBoard places items in fixed slots and counts them', function () {
  var b = mk([['a', 'b'], [], ['c', null, 'a']]);
  assert.strictEqual(b.count, 4);
  assert.strictEqual(B.typeAt(b, 0, 0), 'a'); assert.strictEqual(B.typeAt(b, 0, 2), null);
  assert.strictEqual(B.typeAt(b, 2, 1), null); assert.strictEqual(B.typeAt(b, 2, 2), 'a');
  assert.strictEqual(B.freeSlots(b, 1), 3); assert.strictEqual(B.totalFree(b), 5);
});
test('board: canMove rejects same compartment, full compartment and occupied slot', function () {
  var b = mk([['a', 'b', 'c'], ['d', 'e', 'f'], ['g']]);
  var a = idAt(b, 0, 0);
  assert.strictEqual(B.canMove(b, a, 0), false, 'same compartment');
  assert.strictEqual(B.canMove(b, a, 1), false, 'full compartment');
  assert.strictEqual(B.canMove(b, a, 2), true);
  assert.strictEqual(B.canMove(b, a, 2, 0), false, 'occupied slot');
  assert.strictEqual(B.canMove(b, a, 2, 2), true);
  assert.strictEqual(B.canMove(b, 999, 2), false, 'unknown item');
  assert.strictEqual(B.canMove(b, a, 9), false, 'unknown compartment');
});
test('board: move goes to the requested slot or the first free one and updates the item', function () {
  var b = mk([['a', 'b', 'c'], [null, 'd', null], ['g']]);
  var a = idAt(b, 0, 0);
  var ev = B.move(b, a, 1);
  assert.strictEqual(ev.length, 1);
  assert.deepStrictEqual(ev[0], { type: 'move', item: a, product: 'a', from: 0, fromSlot: 0, to: 1, toSlot: 0 });
  assert.strictEqual(b.items[a].comp, 1); assert.strictEqual(b.items[a].slot, 0);
  assert.strictEqual(B.typeAt(b, 0, 0), null);
  var bId = idAt(b, 0, 1);
  var ev2 = B.move(b, bId, 1, 2);
  assert.strictEqual(ev2[0].toSlot, 2);
  assert.strictEqual(B.move(b, bId, 1), null, 'illegal move returns null');
});
test('board: three identical items in one compartment clear and report their slots', function () {
  var b = mk([['a', 'b', 'a'], ['a'], []]);
  var bId = idAt(b, 0, 1), third = idAt(b, 1, 0);
  B.move(b, bId, 2);
  var ev = B.move(b, third, 0);
  assert.strictEqual(ev.length, 2);
  assert.strictEqual(ev[1].type, 'match'); assert.strictEqual(ev[1].comp, 0); assert.strictEqual(ev[1].product, 'a');
  assert.deepStrictEqual(ev[1].slots, [0, 1, 2]);
  assert.strictEqual(ev[1].items.length, 3);
  assert.strictEqual(b.count, 1);
  assert.strictEqual(B.freeSlots(b, 0), 3);
  ev[1].items.forEach(function (id) { assert.strictEqual(b.items[id], undefined); });
});
test('board: resolveAll clears triples present at creation', function () {
  var b = mk([['a', 'a', 'a'], ['b', 'b', 'b'], ['c']]);
  var ev = B.resolveAll(b);
  assert.strictEqual(ev.length, 2);
  assert.strictEqual(b.count, 1);
});
test('board: no progress means no free slot and no match; cleared means nothing matchable', function () {
  var b = mk([['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'b', 'c']]);
  assert.strictEqual(B.progressPossible(b), false);
  assert.strictEqual(B.isCleared(b), false);
  var b2 = mk([['a', 'b', 'c'], ['a', 'b', null], ['a', 'b', 'c']]);
  assert.strictEqual(B.progressPossible(b2), true);
  assert.strictEqual(B.isCleared(mk([[], []])), true);
  assert.strictEqual(B.isCleared(mk([['a', 'b'], ['a', 'b']])), true, 'two copies of each type cannot match: counts as cleared');
});
test('board: legalMoves lists every item into every other compartment with a free slot', function () {
  var b = mk([['a', 'b'], ['c', 'd', 'e'], []]);
  var moves = B.legalMoves(b);
  // 5 items; compartments with free slots: 0 and 2. items in 0 (2) -> comp 2 only = 2; items in 1 (3) -> comps 0 and 2 = 6
  assert.strictEqual(moves.length, 8);
});
test('board: hash, canonical, clone, snapshot and restore', function () {
  var b = mk([['a', 'b'], ['c', null, 'a'], []]);
  assert.strictEqual(B.hash(b), 'a,b,-|c,-,a|-,-,-#m0b0');
  assert.strictEqual(B.canonical(b), B.canonical(mk([[], ['a', 'c'], ['b', 'a']])));
  var c = B.clone(b);
  B.move(c, idAt(c, 0, 0), 2);
  assert.notStrictEqual(B.hash(b), B.hash(c));
  var r = B.restore(B.snapshot(b));
  assert.strictEqual(B.hash(r), B.hash(b));
  assert.strictEqual(r.count, b.count);
});
