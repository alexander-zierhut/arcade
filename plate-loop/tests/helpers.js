// tests/helpers.js: shared fixtures for the node tests (API.md section 9)
'use strict';

var layouts = require('../src/levels/layouts.js');

function need(rel, what) {
  try {
    return require(rel);
  } catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND') {
      throw new Error('tests/helpers.js: ' + what + ' needs ' + rel + ' (engine not written yet): ' + e.message.split('\n')[0]);
    }
    throw e;
  }
}
function model() { return need('../src/engine/model.js', 'helpers.state/sim'); }
function sim() { return need('../src/engine/sim.js', 'helpers.sim'); }
function config() { return need('../src/config.js', 'helpers.tapAndSettle'); }

// kind of one piece in the level sugar (int, 'h:k', 'k:ID:k', 'hk:ID:k', ['p', a, b]) -> max kind inside
function kindOf(piece) {
  if (Array.isArray(piece)) return Math.max(kindOf(piece[1]), kindOf(piece[2]));
  if (typeof piece === 'number') return piece;
  var parts = String(piece).split(':');
  return parseInt(parts[parts.length - 1], 10);
}

// level(spec): { N, layout = 'ring-2col', boxes: { L1: [pieces] | { pieces, mods }, ... }, dir = 'cw', kinds?, id?, tier?, seed? }
function level(spec) {
  var name = spec.layout || 'ring-2col';
  var tpl = layouts[name];
  if (!tpl || !tpl.slots) throw new Error('helpers.level: unknown layout ' + name);
  var boxes = [], maxKind = -1, id;
  for (id in spec.boxes) if (Object.prototype.hasOwnProperty.call(spec.boxes, id)) {
    if (!tpl.slots[id]) throw new Error('helpers.level: ' + name + ' has no slot ' + id);
    var b = spec.boxes[id];
    var entry = Array.isArray(b) ? { id: id, pieces: b.slice() } : { id: id, pieces: (b.pieces || []).slice() };
    if (!Array.isArray(b) && b.mods) entry.mods = b.mods;
    for (var i = 0; i < entry.pieces.length; i++) maxKind = Math.max(maxKind, kindOf(entry.pieces[i]));
    boxes.push(entry);
  }
  return {
    id: spec.id || 1, tier: spec.tier || 'easy', seed: spec.seed || 1, layout: name, dir: spec.dir || 'cw',
    N: spec.N || 6, kinds: spec.kinds !== undefined ? spec.kinds : maxKind + 1, boxes: boxes
  };
}

function layoutOf(spec) { return layouts[spec.layout || 'ring-2col']; }

// sim(spec): sim.create on level(spec) with the layout's perimeter and the layout object
function makeSim(spec) {
  var lv = level(spec), tpl = layoutOf(spec), opts = { perimeter: tpl.perimeter, layout: tpl };
  if (spec.lapMs) opts.lapMs = spec.lapMs;
  return sim().create(lv, opts);
}

// runUntil(s, pred, maxMs): 16 ms ticks until pred(s, eventsOfThisTick) (also tested once before the first tick) or maxMs
function runUntil(s, pred, maxMs) {
  var all = [], t = 0, ev;
  var simMod = sim();
  if (pred(s, [])) return all;
  while (t < maxMs) {
    ev = simMod.tick(s, 16);
    t += 16;
    for (var i = 0; i < ev.length; i++) all.push(ev[i]);
    if (pred(s, ev)) break;
  }
  return all;
}

function beltEmpty(s) {
  var i;
  for (i = 0; i < s.state.belt.length; i++) if (s.state.belt[i]) return false;
  for (i = 0; i < s.state.boxes.length; i++) if (s.state.boxes[i].pending > 0) return false;
  return true;
}

// tapAndSettle(s, boxIndex): tap, then run until nothing is on the belt or reserved, or the sim is won/lost; -> events
function tapAndSettle(s, boxIndex) {
  var r = sim().tap(s, boxIndex);
  if (!r || !r.ok) return [];
  var cfg = config();
  var lap = (cfg && cfg.LAP_MS) || 8000;
  return runUntil(s, function (st) { return st.status !== 'play' || beltEmpty(st); }, lap * 10);
}

function state(spec) { return model().parse(level(spec)); }

module.exports = {
  level: level,
  sim: makeSim,
  runUntil: runUntil,
  tapAndSettle: tapAndSettle,
  state: state,
  layout: layoutOf,
  beltEmpty: beltEmpty
};
