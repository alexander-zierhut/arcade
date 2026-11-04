'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const rng = require('../src/gen/rng.js');

// independent copy of the reference mulberry32 (unbounded seed accumulation)
function reference(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

test('next() matches reference mulberry32', () => {
  for (const seed of [0, 1, 42, 981233, 0x7fffffff, 123456789012]) {
    const a = rng.create(seed), b = reference(seed);
    for (let i = 0; i < 2000; i++) assert.equal(a.next(), b());
  }
});

test('deterministic per seed, different across seeds', () => {
  const a = rng.create(7), b = rng.create(7), c = rng.create(8);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 50; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
});

test('next() stays in [0,1), int(n) in [0,n), pick returns members', () => {
  const r = rng.create(99);
  const arr = ['a', 'b', 'c', 'd'];
  for (let i = 0; i < 5000; i++) {
    const x = r.next();
    assert.ok(x >= 0 && x < 1);
    const k = r.int(7);
    assert.ok(Number.isInteger(k) && k >= 0 && k < 7);
    assert.ok(arr.includes(r.pick(arr)));
  }
  assert.equal(r.int(1), 0);
});

test('int(n) is roughly uniform', () => {
  const r = rng.create(2024), counts = new Array(10).fill(0), n = 100000;
  for (let i = 0; i < n; i++) counts[r.int(10)]++;
  for (const c of counts) assert.ok(c > n / 10 * 0.95 && c < n / 10 * 1.05, 'bucket ' + c);
  const r2 = rng.create(5);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += r2.next();
  assert.ok(Math.abs(sum / n - 0.5) < 0.01);
});

test('shuffle works in place, returns the array, keeps the multiset', () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = rng.create(3).shuffle(arr);
  assert.equal(out, arr);
  assert.deepEqual(arr.slice().sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(rng.create(0).shuffle([]), []);
  assert.deepEqual(rng.create(0).shuffle([9]), [9]);
});

test('shuffle reaches every permutation of 3 elements fairly', () => {
  const r = rng.create(11), seen = {};
  for (let i = 0; i < 6000; i++) { const k = r.shuffle([0, 1, 2]).join(''); seen[k] = (seen[k] || 0) + 1; }
  assert.equal(Object.keys(seen).length, 6);
  for (const k in seen) assert.ok(seen[k] > 800 && seen[k] < 1200, k + ' ' + seen[k]);
});

test('permutation(n, seed) is a deterministic bijection', () => {
  for (const n of [0, 1, 2, 5, 12, 50]) {
    const p = rng.permutation(n, 31337);
    assert.equal(p.length, n);
    assert.deepEqual(p.slice().sort((a, b) => a - b), Array.from({ length: n }, (_, i) => i));
    assert.deepEqual(p, rng.permutation(n, 31337));
  }
  let different = 0;
  for (let seed = 1; seed <= 20; seed++) {
    if (rng.permutation(12, seed).join() !== rng.permutation(12, seed + 1).join()) different++;
  }
  assert.ok(different >= 19);
});

test('permutation positions are uniform', () => {
  const n = 5, counts = [];
  for (let i = 0; i < n; i++) counts.push(new Array(n).fill(0));
  const trials = 10000;
  for (let seed = 1; seed <= trials; seed++) {
    const p = rng.permutation(n, seed);
    for (let i = 0; i < n; i++) counts[i][p[i]]++;
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    assert.ok(counts[i][j] > trials / n * 0.9 && counts[i][j] < trials / n * 1.1, i + ',' + j + ': ' + counts[i][j]);
  }
});

test('global PlateLoop.rng is set', () => {
  assert.equal(globalThis.PlateLoop.rng, rng);
});
