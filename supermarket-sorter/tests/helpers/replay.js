// tests/helpers/replay.js: the INDEPENDENT witness checker (DESIGN 3.4 item 2). Written from the rules tables of
// DESIGN sections 1-2 only; it shares no code with src/game/board.js, belts or the solver. A witness token is
// [from, type, to]: from = compartment index or -1 (take from a belt), type = type code, to = compartment index.
// Rules replayed: whole-layer reveal, matches of three, locks opening at N matches, belts appearing at N matches,
// take-only cells barred after a take, bunnies collected automatically (free), orphan types dead, win when no type
// has three copies left anywhere.
'use strict';
function check(level, witness) {
  var comps = level.comps.map(function (c) {
    return { front: c.layers[0].filter(function (t) { return t !== null; }), back: c.layers.slice(1).map(function (l) { return l.filter(function (t) { return t !== null; }); }), lockAt: c.lockAt || 0 };
  });
  var belts = (level.belts || []).map(function (b) { return { appearAt: b.appearAt || 0, cells: b.cells.map(function (t) { return t === null ? [] : [t]; }), barred: b.cells.map(function (t) { return t === null; }) }; });
  var matches = 0, bunnies = 0, dead = {};
  function remaining() {
    var r = {};
    comps.forEach(function (c) { c.front.forEach(add); c.back.forEach(function (l) { l.forEach(add); }); });
    belts.forEach(function (b) { b.cells.forEach(function (s) { s.forEach(add); }); });
    function add(t) { if (t !== '*' && !dead[t]) r[t] = (r[t] || 0) + 1; }
    return r;
  }
  function open(ci) { return !comps[ci].lockAt || matches >= comps[ci].lockAt; }
  function appeared(b) { return matches >= b.appearAt; }
  function settle() {
    var changed = true, guard = 0;
    while (changed && guard++ < 500) {
      changed = false;
      comps.forEach(function (c, ci) {
        if (!open(ci)) return;
        var bi = c.front.indexOf('*');
        if (bi >= 0) { c.front.splice(bi, 1); bunnies += 1; changed = true; }
        var counts = {};
        c.front.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
        for (var t in counts) if (counts[t] >= 3) { var n = 0; c.front = c.front.filter(function (x) { if (x === t && n < 3) { n += 1; return false; } return true; }); matches += 1; changed = true; }
        if (c.front.length === 0 && c.back.length) { c.front = c.back.shift().filter(function (t) { return t === '*' || !dead[t]; }); changed = true; }
      });
      belts.forEach(function (b) { if (!appeared(b)) return; b.cells.forEach(function (s, k) { if (!b.barred[k] && s[0] === '*') { s.shift(); bunnies += 1; if (!s.length) b.barred[k] = true; changed = true; } }); });
      var r = remaining();
      for (var u in r) if (r[u] < 3 && !dead[u]) { dead[u] = 1; changed = true; comps.forEach(function (c) { c.front = c.front.filter(function (x) { return x !== u; }); }); belts.forEach(function (b) { b.cells.forEach(function (s, k) { var before = s.length; var kept = s.filter(function (x) { return x !== u; }); s.length = 0; kept.forEach(function (x) { s.push(x); }); if (before && !s.length) b.barred[k] = true; }); }); }
    }
  }
  settle();
  for (var i = 0; i < witness.length; i++) {
    var w = witness[i], from = w[0], t = String(w[1]), to = w[2];
    if (to < 0 || to >= comps.length || !open(to) || comps[to].front.length >= 3) return { ok: false, at: i, reason: 'target not open or full' };
    if (from >= 0) {
      if (!open(from) || from === to) return { ok: false, at: i, reason: 'source closed or same' };
      var idx = comps[from].front.indexOf(t);
      if (idx < 0) return { ok: false, at: i, reason: 'type ' + t + ' not in front of ' + from };
      comps[from].front.splice(idx, 1);
    } else {
      var found = false;
      for (var b = 0; b < belts.length && !found; b++) { if (!appeared(belts[b])) continue; for (var k = 0; k < belts[b].cells.length; k++) { var s = belts[b].cells[k]; if (!belts[b].barred[k] && s[0] === t) { s.shift(); if (!s.length) belts[b].barred[k] = true; found = true; break; } } }
      if (!found) return { ok: false, at: i, reason: 'type ' + t + ' not available on a belt' };
    }
    comps[to].front.push(t);
    settle();
  }
  var r = remaining(), left = 0;
  for (var z in r) if (r[z] >= 3) left += r[z];
  return { ok: left === 0, at: witness.length, reason: left ? 'matchable left: ' + left : '', matches: matches, bunnies: bunnies };
}
module.exports = { check: check };
