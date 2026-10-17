// tests/helpers.js: shared helpers for the unit tests.
'use strict';
var assert = require('assert');
var B = require('../src/game/board.js');
var RNG = require('../src/game/rng.js');

/** spec(fill, rows?, cols?) -> a board spec from an array of single-layer compartments (arrays of type strings; null = hole). */
function spec(fill, rows, cols) {
  rows = rows || fill.length; cols = cols || 1;
  return { shape: 'G', rows: rows, cols: cols, comps: fill.map(function (f, i) { return { layers: [f.slice()], row: Math.floor(i / cols), col: i % cols }; }) };
}
/** mk(fill, rows?, cols?) -> Board. */
function mk(fill, rows, cols) { return B.createBoard(spec(fill, rows, cols)); }
/** idAt(b, ci, s) -> item id in compartment ci, slot s. */
function idAt(b, ci, s) { return b.comps[ci].slots[s]; }
function ofType(events, type) { return events.filter(function (e) { return e.type === type; }); }
var PRODUCTS = 'abcdefghijklmnopqrstuvwxyz'.split('').map(function (c) { return 'p-' + c; });

/** singleLayer(number, seed?) -> a single-layer level spec (rows x 3, every type three times, no starting triple, >= 3 holes),
 *  the shape of the v0.1 boards. Used by tests of invariants that need many boards without layers. */
function singleLayer(number, seed) {
  var rows = number <= 2 ? 3 : number <= 8 ? 4 : number <= 20 ? 5 : 6, cols = 3, rng = RNG.create(seed === undefined ? 'single-' + number : seed);
  var comps = rows * cols, slots = comps * 3, freeTarget = number <= 3 ? 4 : number <= 10 ? 3 : 2;
  var T = Math.min(Math.floor((slots - freeTarget) / 3), PRODUCTS.length, 14), pool = rng.shuffle(PRODUCTS.slice()).slice(0, T), fill, tries = 0;
  do {
    var positions = []; for (var ci = 0; ci < comps; ci++) for (var s = 0; s < 3; s++) positions.push([ci, s]);
    rng.shuffle(positions); fill = []; for (var c = 0; c < comps; c++) fill.push([null, null, null]);
    var p = 0; for (var t = 0; t < T; t++) for (var copy = 0; copy < 3; copy++) { var pos = positions[p++]; fill[pos[0]][pos[1]] = pool[t]; }
    tries += 1;
  } while (hasTriple(fill) && tries < 50);
  var sp = spec(fill, rows, cols); sp.n = number; sp.tag = 'normal'; sp.par = 40; sp.timeMs = 0; sp.types = pool;
  return sp;
}
function hasTriple(fill) { for (var ci = 0; ci < fill.length; ci++) { var counts = {}; for (var s = 0; s < fill[ci].length; s++) { var t = fill[ci][s]; if (t) { counts[t] = (counts[t] || 0) + 1; if (counts[t] >= 3) return true; } } } return false; }

module.exports = { assert: assert, spec: spec, mk: mk, idAt: idAt, ofType: ofType, PRODUCTS: PRODUCTS, singleLayer: singleLayer };
