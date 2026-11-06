// tests/codes.test.js: level codes (plan R30). A shared code must give everyone the same level, today and after the next
// change: the GOLDEN table below freezes codes made on 2026-11-06 to the fingerprint (sha1 of the level JSON) of the
// level they replay to. If a change to the generator, the solver, the rules, the layouts, the tier bands or the
// difficulty table alters one of them, this suite fails ON PURPOSE: either make the change backwards compatible,
// or bump generator.CODE_VERSION with a new code letter (old codes then need a legacy path or a clear refusal) and
// re-freeze the table. Never "fix" the table to make the suite pass.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('../src/levels/layouts.js');
const gen = require('../src/gen/generator.js');

const GOLDEN = [
  { code: "L1-1NV0C7", fp: "96d17cf172c9d793", hard: 0.04, N: 8, kinds: 5 },
  { code: "L2-FMHYGM", fp: "fdd939bd5e0cd27a", hard: 0.61, N: 6, kinds: 7 },
  { code: "L3p-M3W9M9", fp: "65aa5cefbab82be0", hard: 1.07, N: 6, kinds: 7 },
  { code: "L4wi-2X8F4C", fp: "e959f1d52f066257", hard: 1.67, N: 6, kinds: 10 },
  { code: "L5n-CDMB8Q", fp: "e80bc05bad0ffb69", hard: 1.82, N: 6, kinds: 10 },
  { code: "L6-YASF2Q", fp: "81dd8fa7750a4c4b", hard: 2.45, N: 6, kinds: 12 },
  { code: "L7k-2FQS0Y", fp: "964210882b1280c4", hard: 2.36, N: 4, kinds: 12 },
  { code: "L8no-18AC5TQ", fp: "49534342d7684b1a", hard: 2.97, N: 4, kinds: 12 },
  { code: "L9n-1CNQCZY", fp: "712534f59b7635c7", hard: 2.41, N: 4, kinds: 12 },
  { code: "L10n-Y6Z75N", fp: "cd5297e37c9bd36d", hard: 2.33, N: 4, kinds: 10 },
  { code: "L6npwiko-1F0S2Q9", fp: "ed9ce7ba93066071", hard: 2.48, N: 5, kinds: 12 },
  { code: "L3n-1J0T6NV", fp: "988971f75fdb87f5", hard: 0.99, N: 6, kinds: 10 },
];
const fp = (level) => crypto.createHash('sha1').update(JSON.stringify(level)).digest('hex').slice(0, 16);

test('codes: the golden codes replay to the very same levels (fingerprint, hardness, plates, kinds)', () => {
  for (const g of GOLDEN) {
    const r = gen.replay(g.code);
    assert.ok(r && r.level, g.code + ' replays');
    assert.equal(fp(r.level), g.fp, g.code + ': the level changed (see the header of this file before touching the table)');
    assert.equal(r.level.hard, g.hard, g.code + ' hardness');
    assert.equal(r.level.N, g.N, g.code + ' plates');
    assert.equal(r.level.kinds, g.kinds, g.code + ' kinds');
    assert.equal(r.code, g.code, g.code + ' re-encodes to itself');
  }
});

test('codes: format 1 (letter L), difficulty 1-10, flags for the mechanics switched off, seed in the 32-symbol alphabet', () => {
  assert.equal(gen.CODE_VERSION, 1);
  assert.deepEqual(gen.decodeCode('L7nk-C1S'), { version: 1, difficulty: 7, disabled: ['hidden', 'lock'], noLuck: true, seed: 12345 });
  assert.equal(gen.encodeCode(7, ['lock', 'hidden'], 12345), 'L7nk-C1S', 'flags in the canonical order');
  assert.equal(gen.encodeCode(10, true, 7), 'L10n-7', 'a boolean means no luck');
  assert.deepEqual(gen.decodeCode(' l3 - 33 '), { version: 1, difficulty: 3, disabled: [], noLuck: false, seed: 99 }, 'case and spaces do not matter');
  assert.deepEqual(gen.decodeCode('L3-O1I'), gen.decodeCode('L3-011'), 'O, I and L read as 0, 1, 1 in the seed');
  assert.equal(gen.decodeCode('L7npwiko-1').disabled.length, 6, 'every mechanic can be off');
  for (const bad of ['L11-1', 'L0-1', 'M7-1', 'L7x-1', 'L7-', '', null, 'L7-3ZZZZZZZ', 'L7-ABCDEFGH']) assert.equal(gen.decodeCode(bad), null, JSON.stringify(bad) + ' is refused');
  for (const seed of [0, 1, 31, 32, 1023, 4294967295]) {
    const d = gen.decodeCode(gen.encodeCode(5, [], seed));
    assert.equal(d.seed, seed, 'seed ' + seed + ' round-trips');
  }
});

test('codes: difficulties 9 and 10 force hidden pieces off, whatever the code says', () => {
  for (const d of [9, 10]) {
    const spec = gen.DIFFICULTY[d], g = gen.generate({ tier: spec.tier, seed: 4242 + d, allow: gen.allowOf(['hidden']), candidates: 3, hardness: [0, 9] });
    assert.ok(g && g.level, 'a level for difficulty ' + d);
    const r = gen.replay(gen.encodeCode(d, [], g.level.seed));        // the code claims every mechanic, including hidden pieces
    assert.ok(r && r.level, 'difficulty ' + d + ' replays');
    assert.ok(r.code.indexOf('n') > 0 && r.disabled.indexOf('hidden') >= 0, 'difficulty ' + d + ' re-encodes with the n flag');
    assert.equal(JSON.stringify(r.level).indexOf('"h:'), -1, 'nothing hidden at ' + d);
  }
});

test('codes: allowOf and disabledOf agree and keep the canonical order', () => {
  assert.deepEqual(gen.allowOf(['ice', 'hidden']), ['pair', 'wrap', 'lock', 'oneway']);
  assert.deepEqual(gen.disabledOf(['oneway', 'nonsense', 'hidden']), ['hidden', 'oneway']);
  assert.deepEqual(gen.allowOf(true), ['pair', 'wrap', 'ice', 'lock', 'oneway']);
  assert.deepEqual(gen.allowOf(undefined), gen.MECHANICS);
});
