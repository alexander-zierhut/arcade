// src/game/levels.js: level identity and storage (DESIGN 3.7, 4.3, 4.8, 8.3). Pure. A level is identified by (mode, n):
// authored L1-L6, then baked strings in SS.LEVEL_DATA (src/game/levels-data.js), then runtime generation with a remix
// fallback. get() returns a level ready for SS.game.createGame: product ids from the catalogue (the skin), silhouettes,
// par, time limit and the verified witness. Every level is re-verified through the board rules before it is returned.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var C = SS.config || (typeof require === 'function' ? require('../config.js') : {});
  var RNG = SS.rng || (typeof require === 'function' ? require('./rng.js') : null);
  var B = SS.board || (typeof require === 'function' ? require('./board.js') : null);
  var R = SS.rules || (typeof require === 'function' ? require('./rules.js') : null);
  var SOL = SS.solver || (typeof require === 'function' ? require('./solver.js') : null);
  var GEN = SS.gen || (typeof require === 'function' ? require('./gen.js') : null);
  var CODES = GEN.CODES, BUNNY = '*';
  var SIL_PALETTE = [['#2E7D32', 122], ['#C62828', 0], ['#1565C0', 210], ['#6A1B9A', 282], ['#EF6C00', 27], ['#00838F', 187], ['#6D4C41', 15], ['#AD1457', 336]];

  // ---------- authored L1-L6 (DESIGN 4.3): letters are type codes, '.' hole, '*' bunny; layers separated by '/' ----------
  var AUTHORED = {
    1: { shape: 'A4', comps: ['AB.', 'BA.', 'CAB', 'CC.'] },
    2: { shape: 'A5', comps: ['AB.', 'CDA', 'BC.', 'DCB', 'A.D'] },
    3: { shape: 'A6', comps: ['AB./CD.', 'BCA', 'DA./B..', 'C.D', 'EE.', 'E..'] },
    4: { shape: 'A6', comps: ['AB./CD.', 'CAE/F..', 'BFG', 'DE./G.A', 'FG.', 'EBC/D..'] },
    5: { shape: 'A7', comps: ['ABC/DE.', 'DF./GA.', 'EGH/I..', 'BI./FC.', 'HAD', 'CE./HB.', 'FGI'] },
    6: { shape: 'A7', comps: ['AB./CD.', 'EFA/G..', 'HCI', 'DE./ID*', 'BGF/H..', 'GI./AE.', 'FHC/B..'] }
  };
  function authored(n) {
    var a = AUTHORED[n];
    if (!a) return null;
    var lay = R.layout(a.shape), comps = a.comps.map(function (str, i) {
      return { layers: str.split('/').map(function (l) { return l.split('').map(function (ch) { return ch === '.' ? null : ch === '*' ? BUNNY : CODES[ch.charCodeAt(0) - 65]; }); }), lockAt: 0, row: lay[i].row, col: lay[i].col };
    });
    var types = {};
    comps.forEach(function (c) { c.layers.forEach(function (l) { l.forEach(function (t) { if (t && t !== BUNNY) types[t] = 1; }); }); });
    var items = 0; comps.forEach(function (c) { c.layers.forEach(function (l) { l.forEach(function (t) { if (t && t !== BUNNY) items += 1; }); }); });
    return { shape: a.shape, tag: R.tag(n), n: n, comps: comps, belts: [], types: Object.keys(types).length, F0: 3, items: items, locks: 0 };
  }

  // ---------- encoding ----------
  function encode(level, witness) {
    var locks = level.comps.map(function (c, i) { return c.lockAt ? i + ':' + c.lockAt : null; }).filter(Boolean).join(';') || '-';
    var belts = (level.belts || []).map(function (bt) { return bt.id + bt.appearAt + ':' + bt.cells.map(function (t) { return t === BUNNY ? '*' : (t === null ? '.' : t); }).join(''); }).join(';') || '-';
    var rack = level.comps.map(function (c) { return c.layers.map(function (l) { return l.map(function (t) { return t === null ? '.' : t; }).join(''); }).join('/'); }).join(',');
    var w = (witness || []).map(function (m) { return (m[0] < 0 ? 'S' : String(m[0])) + m[1] + String(m[2]); }).join('');
    return [level.shape, level.tag, level.n, level.par || 0, locks, belts, rack, w].join('|');
  }
  function decode(str) {
    var f = str.split('|'), shape = f[0], lay = R.layout(shape), lockAt = {};
    if (f[4] !== '-') f[4].split(';').forEach(function (p) { var q = p.split(':'); lockAt[+q[0]] = +q[1]; });
    var comps = f[6].split(',').map(function (cs, i) {
      return { layers: cs.split('/').map(function (l) { return l.split('').map(function (ch) { return ch === '.' ? null : ch; }); }), lockAt: lockAt[i] || 0, row: lay ? lay[i].row : i, col: lay ? lay[i].col : 0 };
    });
    var belts = f[5] === '-' ? [] : f[5].split(';').map(function (bs) {
      var m = /^([LRH])(\d+):(.*)$/.exec(bs);
      return { id: m[1], axis: m[1] === 'H' ? 'x' : 'y', appearAt: +m[2], cells: m[3].split('').map(function (ch) { return ch === '.' ? null : ch; }) };
    });
    var witness = [], w = f[7] || '';
    for (var i = 0; i + 2 < w.length + 0 && i + 3 <= w.length; i += 3) witness.push([w[i] === 'S' ? -1 : +w[i], w[i + 1], +w[i + 2]]);
    var types = {}, items = 0;
    comps.forEach(function (c) { c.layers.forEach(function (l) { l.forEach(function (t) { if (t && t !== BUNNY) { types[t] = 1; items += 1; } }); }); });
    belts.forEach(function (bt) { bt.cells.forEach(function (t) { if (t && t !== BUNNY) { types[t] = 1; items += 1; } }); });
    return { level: { shape: shape, tag: f[1], n: +f[2], par: +f[3], comps: comps, belts: belts, types: Object.keys(types).length, items: items, locks: Object.keys(lockAt).length }, witness: witness };
  }

  // ---------- sources ----------
  function baked(mode, n) {
    var D = SS.LEVEL_DATA || (typeof require === 'function' ? tryRequire('./levels-data.js') : null);
    if (!D || !D[mode] || !D[mode][n - 1]) return null;
    var d = decode(D[mode][n - 1]);
    d.source = 'baked';
    return d;
  }
  function tryRequire(p) { try { var m = require(p); return m && m.LEVEL_DATA ? m.LEVEL_DATA : (SS.LEVEL_DATA || null); } catch (e) { return null; } }
  function bakedCount(mode) { var D = SS.LEVEL_DATA || (typeof require === 'function' ? tryRequire('./levels-data.js') : null); return D && D[mode] ? D[mode].length : 0; }

  /** raw(mode, n, opts) -> { level (codes), witness, source } : baked, authored (gated), generated or remix. Never unverified. */
  function raw(mode, n, opts) {
    opts = opts || {};
    var d = baked(mode, n);
    if (d && SOL.verify(B.createBoard(d.level), d.witness).ok) return d;
    var a = authored(n);
    if (a) {
      var g = GEN.gate(a, 200000, 64, RNG.create('authored-' + n));
      if (g) { a.par = Math.ceil(1.25 * g.witness.length); return { level: a, witness: g.witness, source: 'authored' }; }
    }
    var r = GEN.generate(mode, n, { attempts: opts.attempts || C.TAIL_ATTEMPTS, nodes: opts.nodes || C.TAIL_NODES, playouts: opts.playouts || 64, windows: !!opts.windows });
    if (r) return { level: r.level, witness: r.witness, source: 'generated' };
    var count = bakedCount(mode);
    if (count >= 10) {
      var base = baked(mode, 1 + ((Math.max(0, n - 1)) % count));
      if (base) { var rm = GEN.remix(base.level, base.witness, 'remix-' + mode + '-' + n); rm.level.n = n; rm.level.tag = R.tag(n); return { level: rm.level, witness: rm.witness, source: 'remix' }; }
    }
    return null;
  }

  // ---------- skin: codes -> products, confusable pairs, silhouettes (DESIGN 4.8) ----------
  function hueDiff(a, b) { if (a < 0 || b < 0) return 999; var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
  function codesOf(level) {
    var seen = {}, out = [];
    function add(t) { if (t && t !== BUNNY && !seen[t]) { seen[t] = 1; out.push(t); } }
    level.comps.forEach(function (c) { c.layers.forEach(function (l) { l.forEach(add); }); });
    (level.belts || []).forEach(function (bt) { bt.cells.forEach(add); });
    return out;
  }
  function pickProducts(codes, mode, n, catalog, rng) {
    var T = codes.length, pairs = GEN.confusablePairs(mode, n), items = [];
    [1, 2, 3].forEach(function (tier) { items = items.concat(rng.shuffle(catalog.items.filter(function (p) { return (p.tier || 2) === tier; }))); });   // tasty food first (owner: she likes looking at food)
    var chosen = [], used = {}, pairedWith = {};
    function clashes(p) {
      for (var i = 0; i < chosen.length; i++) {
        var q = chosen[i];
        if (q.cls === p.cls && hueDiff(q.hue, p.hue) <= 30) return true;
        if (n <= 9 && hueDiff(q.hue, p.hue) <= 30) return true;
        if (q.shapeGroup === p.shapeGroup && hueDiff(q.hue, p.hue) <= 45) return true;
      }
      return false;
    }
    var distinct = Math.max(1, T - pairs);
    for (var i = 0; i < items.length && chosen.length < distinct; i++) { var p = items[i]; if (used[p.id] || clashes(p)) continue; used[p.id] = 1; chosen.push(p); }
    for (var k = 0; k < pairs && chosen.length < T; k++) {
      var found = null;
      for (var a = 0; a < chosen.length && !found; a++) {
        var base = chosen[a]; if (pairedWith[base.id]) continue;
        for (var j = 0; j < items.length; j++) { var c = items[j]; if (used[c.id] || c.cls !== base.cls || hueDiff(c.hue, base.hue) > 30) continue; found = c; pairedWith[base.id] = c.id; pairedWith[c.id] = base.id; break; }
      }
      if (!found) for (var z = 0; z < items.length; z++) { if (!used[items[z].id] && !clashes(items[z])) { found = items[z]; break; } }
      if (!found) for (var y = 0; y < items.length; y++) { if (!used[items[y].id]) { found = items[y]; break; } }
      used[found.id] = 1; chosen.push(found);
    }
    while (chosen.length < T) { for (var u = 0; u < items.length; u++) if (!used[items[u].id]) { used[items[u].id] = 1; chosen.push(items[u]); break; } if (chosen.length < T && Object.keys(used).length >= items.length) break; }
    var map = {};
    codes.forEach(function (code, idx) { map[code] = chosen[idx % chosen.length].id; });
    return { map: map, paired: pairedWith };
  }
  function silCount(mode, n, items) {
    var k = GEN.knobs(mode, n);
    if (k.silExact) return k.silExact;
    if (!k.silPermille) return 0;
    return Math.round(items * k.silPermille / 1000);
  }
  /** skin(level, mode, n, catalog) -> { comps, belts, types, map, silhouettes } with product ids and silhouette colours. */
  function skin(level, mode, n, catalog) {
    var rng = RNG.create('skin-' + mode + '-' + n), codes = codesOf(level);
    var pick = pickProducts(codes, mode, n, catalog, rng), map = pick.map;
    var byId = catalog.byId;
    // candidate silhouette positions: front items first (L24 teaches with visible siblings), then back layers, then belts
    var copies = {}, groups = {};
    codes.forEach(function (c) { var p = byId[map[c]]; groups[p.shapeGroup] = (groups[p.shapeGroup] || 0) + 1; });
    level.comps.forEach(function (c) { c.layers.forEach(function (l) { l.forEach(function (t) { if (t && t !== BUNNY) copies[t] = (copies[t] || 0) + 1; }); }); });
    (level.belts || []).forEach(function (bt) { bt.cells.forEach(function (t) { if (t && t !== BUNNY) copies[t] = (copies[t] || 0) + 1; }); });
    function eligible(code) { var p = byId[map[code]]; return p && p.silhouetteOk && groups[p.shapeGroup] === 1 && !pick.paired[p.id] && (copies[code] || 0) >= 3; }
    var want = silCount(mode, n, level.items || 0), perType = {}, perLayer = {}, placed = [];
    var positions = [];
    level.comps.forEach(function (c, ci) { c.layers.forEach(function (l, li) { l.forEach(function (t, s) { if (t && t !== BUNNY) positions.push({ ci: ci, li: li, s: s, t: t, front: li === 0 }); }); }); });
    (level.belts || []).forEach(function (bt, bi) { bt.cells.forEach(function (t, k) { if (t && t !== BUNNY) positions.push({ bi: bi, k: k, t: t, front: false }); }); });
    rng.shuffle(positions);
    positions.sort(function (a, b) { return (b.front ? 1 : 0) - (a.front ? 1 : 0); });
    var sils = {};
    for (var i = 0; i < positions.length && placed.length < want; i++) {
      var pos = positions[i], t = pos.t;
      if (!eligible(t)) continue;
      if ((perType[t] || 0) >= Math.floor(copies[t] / 3)) continue;
      var lkey = pos.ci !== undefined ? pos.ci + '/' + pos.li : 'b' + pos.bi;
      if (perLayer[lkey]) continue;
      var p = byId[map[t]], pal = SIL_PALETTE.filter(function (e) { return hueDiff(e[1], p.hue) > 60; });
      if (!pal.length) pal = SIL_PALETTE;
      var colour = pal[rng.int(pal.length)][0];
      perType[t] = (perType[t] || 0) + 1; perLayer[lkey] = 1;
      sils[pos.ci !== undefined ? 'c' + pos.ci + '/' + pos.li + '/' + pos.s : 'b' + pos.bi + '/' + pos.k] = colour;
      placed.push(pos);
    }
    var comps = level.comps.map(function (c, ci) {
      return { layers: c.layers.map(function (l) { return l.map(function (t) { return t === null ? null : t === BUNNY ? BUNNY : map[t]; }); }),
        sil: c.layers.map(function (l, li) { return l.map(function (t, s) { return sils['c' + ci + '/' + li + '/' + s] || 0; }); }),
        lockAt: c.lockAt, row: c.row, col: c.col };
    });
    var belts = (level.belts || []).map(function (bt, bi) {
      return { id: bt.id, axis: bt.axis, appearAt: bt.appearAt, cells: bt.cells.map(function (t, k) { return t === null ? null : t === BUNNY ? BUNNY : { t: map[t], sil: sils['b' + bi + '/' + k] || 0 }; }) };
    });
    return { comps: comps, belts: belts, map: map, types: codes.map(function (c) { return map[c]; }), silhouettes: placed.length, paired: pick.paired };
  }

  /** timeMs(mode, n, level, witnessLen) -> the time limit in ms (0 for relaxed). */
  function timeMs(mode, n, level, witnessLen) {
    if (mode !== 'timed') return 0;
    var v = R.speed100(mode, n, level.tag), h = R.hidden(mode, n), waits = 0, rows = (R.SHAPES[level.shape] || {}).rackRows || 6;
    if (v > 0) (level.belts || []).forEach(function (bt) { var items = bt.cells.filter(function (t) { return t && t !== BUNNY; }).length, hid = bt.id === 'H' ? 3 : Math.max(h, bt.cells.length - rows); waits += items * hid * 100 / v; });   // v0.3.1: a side column shows one cell per rack row
    waits = waits / 2;                                        // a player takes what comes by; the full hidden arc per take was too generous
    return R.timeLimitS(mode, n, level.tag, witnessLen, Math.ceil(waits)) * 1000;
  }

  /** get(mode, n, catalog?) -> level for createGame, or null. Re-verifies the witness through the board rules. */
  function get(mode, n, catalog, opts) {
    var d = raw(mode, n, opts);
    if (!d) return null;
    var check = SOL.verify(B.createBoard(d.level), d.witness);
    if (!check.ok) return null;
    catalog = catalog || SS.catalog;
    var sk = catalog && catalog.items && catalog.items.length >= 24 ? skin(d.level, mode, n, catalog) : null;
    var lv = d.level, out = {
      n: n, mode: mode, tag: lv.tag || R.tag(n), shape: lv.shape, rows: 0, cols: 2,
      comps: sk ? sk.comps : lv.comps.map(function (c) { return { layers: c.layers, lockAt: c.lockAt, row: c.row, col: c.col }; }),
      belts: sk ? sk.belts : lv.belts, par: lv.par || Math.ceil(1.25 * d.witness.length), source: d.source,
      witness: d.witness.map(function (m) { return [m[0], sk ? sk.map[m[1]] : m[1], m[2]]; }),
      types: sk ? sk.types : codesOf(lv), items: lv.items, silhouettes: sk ? sk.silhouettes : 0,
      beltSpeed100: R.speed100(mode, n, lv.tag), turbo: R.isTurbo(mode, n), hidden: R.hidden(mode, n), Wv: (R.SHAPES[lv.shape] || {}).Wv || 6
    };
    out.timeMs = timeMs(mode, n, lv, d.witness.length);
    out.rows = R.layout(lv.shape) ? R.layout(lv.shape)[R.layout(lv.shape).length - 1].row + 1 : 0;
    return out;
  }

  var levels = { AUTHORED: AUTHORED, authored: authored, encode: encode, decode: decode, baked: baked, bakedCount: bakedCount, raw: raw, skin: skin, timeMs: timeMs, get: get,
    codesOf: codesOf, SIL_PALETTE: SIL_PALETTE };
  SS.levels = levels;
  if (typeof module !== 'undefined' && module.exports) module.exports = levels;
})(typeof globalThis !== 'undefined' ? globalThis : this);
