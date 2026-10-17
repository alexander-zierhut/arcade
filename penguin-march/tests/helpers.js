// tests/helpers.js: the game's modules loaded in node, and a fake storage for save tests.
'use strict';
var C = require('../src/config.js');
var sim = require('../src/sim.js');
var LEVEL_DATA = require('../src/levels-data.js');
var knobs = require('../src/knobs.js');
var bot = require('../src/bot.js');
var calibrate = require('../src/calibrate.js');
var gen = require('../src/gen.js');
var levels = require('../src/levels.js');
var save = require('../src/save.js');

/** A level def from a string (absolute numbers only), numbered 999 so it cannot collide with a real level. */
function level(str) { return levels.validate(levels.decode(str, 999)); }

/** Play def with the greedy bot and the given shop levels; returns the finished state. */
function play(def, upgrades, policy) {
  var state = sim.create(def, upgrades || { size: 0, rate: 0, dmg: 0 });
  return sim.run(state, policy || bot.greedy);
}

function fakeStorage() {
  var data = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
    data: data
  };
}

module.exports = { C: C, sim: sim, LEVEL_DATA: LEVEL_DATA, knobs: knobs, gen: gen, levels: levels, bot: bot, calibrate: calibrate, save: save, level: level, play: play, fakeStorage: fakeStorage };
