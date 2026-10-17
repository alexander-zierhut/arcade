// src/levels.js: level definitions. get(n) returns the decoded, calibrated level n: the hand-authored string
// from levels-data.js for n <= AUTHORED_LEVELS, a generated one (gen.js) after that, forever. Pure.
//
// Authored format, one string per level:   tag|length|boss|token token ...
// A token is  kind[lane]@z[:args]  with kind
//   g   gate pair, args  left,right  where each side is +k, -k, xk or /k      g@40:+9,-10   g@40:x2,/2
//   w   snow wall with hp, lane L, R or C (C = full width, the default)         wL@60:30   w@80:50
//   p   seal pack of k seals, lane L, R or C (full width)                      p@90:8
//   a   iced ally, args gift/lock: gift +k penguins or "big", lock = hp        aR@100:+12/25   aL@100:big/40
//   f   chain of k fish starting at z, FISH_GAP apart, lane L, R or C          fC@120:12
// Numbers can be relative to the waddle that arrives there (calibrate.js fixes them by playing the level):
//   ~f on a wall, pack or lock: f times what the waddle can shoot off it on the way (w@60:~0.8)
//   !b on a wall or pack: everything the waddle can shoot plus b times the waddle (w@60:!0.15 costs 15%)
//   +~f / -~f on a gate, +~f on an ally gift: f times the waddle (g@40:+~0.5,-~0.3   aR@100:+~0.4/~0.5)
//   ~s as the boss: s seconds of the waddle's fire when the fight starts (tag|300|~8|...)
// z is the distance along the road; the boss waits at `length`, the fight starts BOSS_DIST before it, so every
// token must sit between z = 2 and length - BOSS_DIST - 2. Lanes: L is x = -0.5, R is x = +0.5, C is x = 0.
(function (root) {
  'use strict';
  var PM = root.PM = root.PM || {};
  var C = PM.config || (typeof require === 'function' ? require('./config.js') : null);
  var DATA = PM.LEVEL_DATA || (typeof require === 'function' ? require('./levels-data.js') : null);
  var GEN = PM.gen || (typeof require === 'function' ? require('./gen.js') : null);
  var CAL = PM.calibrate || (typeof require === 'function' ? require('./calibrate.js') : null);

  var LANE_X = { L: -0.5, R: 0.5, C: 0 };

  function num(s, what, n) {
    var v = parseFloat(s);
    if (!(v >= 0) || !/^\d+(\.\d+)?$/.test(s)) throw new Error('level ' + n + ': bad ' + what + ' "' + s + '"');
    return v;
  }

  /** hpArgs(s) -> { hp } | { hpRel } | { hpBite } from "30", "~0.8" or "!0.15". */
  function hpArgs(s, what, n) {
    if (s[0] === '~') return { hpRel: num(s.slice(1), what, n) };
    if (s[0] === '!') return { hpBite: num(s.slice(1), what, n) };
    return { hp: num(s, what, n) };
  }

  function parseSide(s, n) {
    var m = /^([+\-x\/])(~?)(\d+(?:\.\d+)?)$/.exec(s);
    if (!m) throw new Error('level ' + n + ': bad gate side "' + s + '"');
    var side = { op: m[1] };
    if (m[2]) { if (m[1] === 'x' || m[1] === '/') throw new Error('level ' + n + ': x and / gates are never relative: ' + s); side.valRel = parseFloat(m[3]); }
    else side.val = parseFloat(m[3]);
    return side;
  }

  function gateEntity(z, x, side, pair) {
    var e = { type: 'gate', z: z, x: x, w: 0.5, op: side.op, pair: pair };
    if (side.valRel != null) e.valRel = side.valRel; else e.val = side.val;
    return e;
  }

  function withHp(e, args) { for (var k in args) e[k] = args[k]; return e; }

  /** decode(str, n) -> level def { n, tag, length, bossHp | bossSecs, riot, entities } with relative fields still in. */
  function decode(str, n) {
    var parts = str.split('|');
    if (parts.length !== 4) throw new Error('level ' + n + ': expected 4 fields');
    var def = { n: n, tag: parts[0], length: num(parts[1], 'length', n), riot: parts[0] === 'riot', entities: [] };
    if (parts[2][0] === '~') def.bossSecs = num(parts[2].slice(1), 'boss seconds', n); else def.bossHp = num(parts[2], 'boss hp', n);
    var tokens = parts[3].trim() ? parts[3].trim().split(/\s+/) : [];
    var pair = 0;
    tokens.forEach(function (tok) {
      var m = /^([gwpaf])([LRC]?)@(\d+(?:\.\d+)?)(?::(.+))?$/.exec(tok);
      if (!m) throw new Error('level ' + n + ': bad token "' + tok + '"');
      var kind = m[1], lane = m[2] || 'C', z = parseFloat(m[3]), args = m[4] || '';
      if (kind === 'g') {
        var sides = args.split(',');
        if (sides.length !== 2) throw new Error('level ' + n + ': gate needs left,right: ' + tok);
        pair++;
        def.entities.push(gateEntity(z, -0.5, parseSide(sides[0], n), pair));
        def.entities.push(gateEntity(z, 0.5, parseSide(sides[1], n), pair));
      } else if (kind === 'w') {
        def.entities.push(withHp({ type: 'wall', z: z, x: LANE_X[lane], w: lane === 'C' ? 1 : 0.5 }, hpArgs(args, 'wall', n)));
      } else if (kind === 'p') {
        var p = withHp({ type: 'pack', z: z, x: LANE_X[lane], w: lane === 'C' ? 1 : 0.5 }, hpArgs(args, 'pack', n));
        if (p.hp != null) p.hp *= C.SEAL_HP;
        def.entities.push(p);
      } else if (kind === 'a') {
        var ga = args.split('/');
        if (ga.length !== 2) throw new Error('level ' + n + ': ally needs gift/lock: ' + tok);
        var a = withHp({ type: 'ally', z: z, x: LANE_X[lane], w: 0.3 }, hpArgs(ga[1], 'ally lock', n));
        if (ga[0] === 'big') a.gift = 'big';
        else if (ga[0].slice(0, 2) === '+~') a.giftRel = num(ga[0].slice(2), 'ally gift', n);
        else a.gift = num(ga[0].replace('+', ''), 'ally gift', n);
        def.entities.push(a);
      } else if (kind === 'f') {
        var count = num(args, 'fish count', n);
        for (var i = 0; i < count; i++) def.entities.push({ type: 'fish', z: Math.round((z + i * C.FISH_GAP) * 1000) / 1000, x: LANE_X[lane], w: 0.22 });
      }
    });
    return def;
  }

  /** encode(def) -> the string form of an absolute (calibrated) def; fish chains are rebuilt from consecutive fish. */
  function encode(def) {
    var toks = [], i = 0, es = def.entities, done = {};
    var lane = function (e) { return e.x < 0 ? 'L' : e.x > 0 ? 'R' : 'C'; };
    var side = function (g) { return g.op + g.val; };
    while (i < es.length) {
      var e = es[i];
      if (e.type === 'gate') {
        if (done[e.pair]) { i++; continue; }
        var other = null;
        for (var j = i + 1; j < es.length; j++) if (es[j].type === 'gate' && es[j].pair === e.pair) { other = es[j]; break; }
        if (!other) throw new Error('gate pair ' + e.pair + ' at z=' + e.z + ' has one side');
        done[e.pair] = true;
        toks.push('g@' + e.z + ':' + side(e.x < 0 ? e : other) + ',' + side(e.x < 0 ? other : e)); i++;
      } else if (e.type === 'wall') { toks.push('w' + (e.w >= 1 ? '' : lane(e)) + '@' + e.z + ':' + e.hp); i++; }
      else if (e.type === 'pack') { toks.push('p' + (e.w >= 1 ? '' : lane(e)) + '@' + e.z + ':' + (e.hp / C.SEAL_HP)); i++; }
      else if (e.type === 'ally') { toks.push('a' + lane(e) + '@' + e.z + ':' + (e.gift === 'big' ? 'big' : '+' + e.gift) + '/' + e.hp); i++; }
      else if (e.type === 'fish') {
        var k = 1;
        while (es[i + k] && es[i + k].type === 'fish' && es[i + k].x === e.x && Math.abs(es[i + k].z - (e.z + k * C.FISH_GAP)) < 1e-3) k++;
        toks.push('f' + lane(e) + '@' + e.z + ':' + k); i += k;
      } else i++;
    }
    return def.tag + '|' + def.length + '|' + def.bossHp + '|' + toks.join(' ');
  }

  /** validate(def): throws when a (calibrated) level cannot be played as intended. */
  function validate(def) {
    var errs = [];
    if (!(def.length > 0)) errs.push('no length');
    if (!(def.bossHp > 0)) errs.push('no boss hp');
    var last = def.length - C.BOSS_DIST - 2;
    def.entities.forEach(function (e) {
      if (!(e.z > 2) || e.z > last) errs.push(e.type + ' at z=' + e.z + ' is not between 2 and ' + last);
      if (e.type === 'gate' && !(e.val > 0)) errs.push('gate with value ' + e.val);
      if (e.type === 'gate' && e.op === '/' && e.val < 2) errs.push('division gate by ' + e.val);
      if ((e.type === 'wall' || e.type === 'pack' || e.type === 'ally') && !(e.hp > 0)) errs.push(e.type + ' at z=' + e.z + ' has no hp');
      if (e.type === 'ally' && e.gift !== 'big' && !(e.gift > 0)) errs.push('ally at z=' + e.z + ' gives nothing');
      if (CAL.isRel(e)) errs.push(e.type + ' at z=' + e.z + ' still has relative numbers');
    });
    if (errs.length) throw new Error('level ' + def.n + ': ' + errs.join('; '));
    return def;
  }

  var cache = {};
  /** get(n) -> calibrated, validated level def for level n (1-based), cached. */
  function get(n) {
    n = n | 0;
    if (!(n >= 1)) throw new Error('level numbers start at 1');
    if (cache[n]) return cache[n];
    var def = n <= C.AUTHORED_LEVELS ? decode(DATA.levels[n - 1], n) : GEN.generate(n);
    def = validate(CAL.calibrate(def));
    def.entities.sort(function (a, b) { return a.z - b.z || a.x - b.x; });
    cache[n] = def;
    return def;
  }

  PM.levels = { get: get, decode: decode, encode: encode, validate: validate, LANE_X: LANE_X };
  if (typeof module !== 'undefined' && module.exports) module.exports = PM.levels;
})(typeof window !== 'undefined' ? window : globalThis);
