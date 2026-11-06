// tests/codes.test.js: level codes (plan R30). A shared code must give everyone the same level, today and after the next
// change: the GOLDEN table below freezes codes made on 2026-11-06 (after the hidden-piece, pair and front-run rules of
// that evening; the codes of the first 0.2.0 deploy were allowed to break) to the fingerprint (sha1 of the level JSON) of the
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
  { code: "L1-1NV0C7", fp: "0dd82b1f8a92c5df", N: 8, kinds: 5 },
  { code: "L2-1NZV7TP", fp: "ce36cee9a332247e", N: 7, kinds: 10 },
  { code: "L3p-1M008K5", fp: "17e9373b5ea9d5d6", N: 7, kinds: 8 },
  { code: "L4wi-J3RYQF", fp: "efb2acae60aab9b6", N: 6, kinds: 11 },
  { code: "L5n-1T4VJJR", fp: "473cd10a3600c1ab", N: 6, kinds: 11 },
  { code: "L6-YASF2Q", fp: "2621ebc20dd8419d", N: 6, kinds: 12 },
  { code: "L7k-10DAWZV", fp: "00b345bf34f2e3a7", N: 4, kinds: 11 },
  { code: "L8no-18AC5TQ", fp: "6e2cd226be16a75c", N: 4, kinds: 12 },
  { code: "L9n-1ZT6D4F", fp: "38bd1656c5d3b24c", N: 4, kinds: 11 },
  { code: "L10n-1Z9M973", fp: "bd291887d05ce661", N: 4, kinds: 10 },
  { code: "L6npwiko-NDHZW7", fp: "8049b29c892eb0aa", N: 6, kinds: 12 },
  { code: "L3n-178GGG7", fp: "2704e36c78427668", N: 8, kinds: 7 },
];
// the fingerprint covers the structure (what the player sees), not the stored hardness numbers (the analyser may improve)
const fp = (level) => { const l = Object.assign({}, level); delete l.hard; delete l.h; return crypto.createHash('sha1').update(JSON.stringify(l)).digest('hex').slice(0, 16); };

test('codes: the golden codes replay to the very same levels (fingerprint, plates, kinds)', () => {
  for (const g of GOLDEN) {
    const r = gen.replay(g.code);
    assert.ok(r && r.level, g.code + ' replays');
    assert.equal(fp(r.level), g.fp, g.code + ': the level changed (see the header of this file before touching the table)');
    assert.equal(r.level.N, g.N, g.code + ' plates');
    assert.equal(r.level.kinds, g.kinds, g.code + ' kinds');
    assert.equal(r.code, g.code, g.code + ' re-encodes to itself');
  }
});

test('codes: format 1 (letter L), difficulty 1-10, flags for the mechanics switched off, seed in the 32-symbol alphabet', () => {
  assert.equal(gen.CODE_VERSION, 1);
  assert.deepEqual(gen.decodeCode('L7nk-C1S'), { version: 1, difficulty: 7, disabled: ['hidden', 'lock'], noLuck: true, tight: false, seed: 12345 });
  assert.deepEqual(gen.decodeCode('L10nt-C1S'), { version: 1, difficulty: 10, disabled: ['hidden'], noLuck: true, tight: true, seed: 12345 }, 'the t flag: a tight deal');
  assert.equal(gen.encodeCode(10, ['hidden'], 12345, true), 'L10nt-C1S', 'the t flag comes after the mechanics');
  assert.equal(gen.encodeCode(7, ['lock', 'hidden'], 12345), 'L7nk-C1S', 'flags in the canonical order');
  assert.equal(gen.encodeCode(10, true, 7), 'L10n-7', 'a boolean means no luck');
  assert.deepEqual(gen.decodeCode(' l3 - 33 '), { version: 1, difficulty: 3, disabled: [], noLuck: false, tight: false, seed: 99 }, 'case and spaces do not matter');
  assert.deepEqual(gen.decodeCode('L3-O1I'), gen.decodeCode('L3-011'), 'O, I and L read as 0, 1, 1 in the seed');
  assert.equal(gen.decodeCode('L7npwiko-1').disabled.length, 6, 'every mechanic can be off');
  for (const bad of ['L11-1', 'L0-1', 'M7-1', 'L7x-1', 'L7-', '', null, 'L7-3ZZZZZZZ', 'L7-ABCDEFGH']) assert.equal(gen.decodeCode(bad), null, JSON.stringify(bad) + ' is refused');
  for (const seed of [0, 1, 31, 32, 1023, 4294967295]) {
    const d = gen.decodeCode(gen.encodeCode(5, [], seed));
    assert.equal(d.seed, seed, 'seed ' + seed + ' round-trips');
  }
});

test('codes: difficulty 9 forces hidden pieces off, whatever the code says; 10 leaves luck to the code', () => {
  const spec = gen.DIFFICULTY[9], g = gen.generate({ tier: spec.tier, seed: 4251, allow: gen.allowOf(['hidden']), candidates: 3, hardness: [0, 9], look: spec.look || 0 });
  assert.ok(g && g.level, 'a level for difficulty 9');
  const r = gen.replay(gen.encodeCode(9, [], g.level.seed));        // the code claims every mechanic, including hidden pieces
  assert.ok(r && r.level, 'difficulty 9 replays');
  assert.ok(r.code.indexOf('n') > 0 && r.disabled.indexOf('hidden') >= 0, 'difficulty 9 re-encodes with the n flag');
  assert.equal(JSON.stringify(r.level).indexOf('"h:'), -1, 'nothing hidden at 9');
  assert.ok(gen.DIFFICULTY[10].noLuck && gen.DIFFICULTY[10].luckAllowed, 'difficulty 10: no luck by default, luck as the player\'s choice (Alex 2026-11-06)');
});

test('codes: allowOf and disabledOf agree and keep the canonical order', () => {
  assert.deepEqual(gen.allowOf(['ice', 'hidden']), ['pair', 'wrap', 'lock', 'oneway']);
  assert.deepEqual(gen.disabledOf(['oneway', 'nonsense', 'hidden']), ['hidden', 'oneway']);
  assert.deepEqual(gen.allowOf(true), ['pair', 'wrap', 'ice', 'lock', 'oneway']);
  assert.deepEqual(gen.allowOf(undefined), gen.MECHANICS);
});
