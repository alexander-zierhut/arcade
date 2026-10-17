// src/audio/sounds.js: the sound recipes. Every function is safe to call at any time (silent when audio is off).
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var audio = SS.audio = SS.audio || {};
  var E = function () { return audio.engine; };
  var PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.7, 1318.5, 1568.0, 1760.0];   // C major pentatonic from C5

  function click() { E().play(function (c, o, t) { return E().tone(c, o, t, { type: 'sine', f0: 1500, f1: 900, dur: 0.05, gain: 0.08 }); }); }
  function pick() { E().play(function (c, o, t) { return E().tone(c, o, t, { type: 'triangle', f0: 700, f1: 1100, dur: 0.07, gain: 0.12 }); }); }
  function drop() {
    E().play(function (c, o, t) {
      E().noise(c, o, t, { dur: 0.04, gain: 0.12, cutoff: 2500 });
      return E().tone(c, o, t, { type: 'triangle', f0: 260, f1: 160, dur: 0.11, gain: 0.2 });
    });
  }
  function refuse() {
    E().play(function (c, o, t) {
      E().tone(c, o, t, { type: 'square', f0: 220, f1: 200, dur: 0.07, gain: 0.06 });
      return E().tone(c, o, t + 0.08, { type: 'square', f0: 180, f1: 160, dur: 0.1, gain: 0.06 });
    });
  }
  /** match(combo): a rising three-note arpeggio; higher combos start higher on the scale. */
  function match(combo) {
    var base = Math.min(PENTA.length - 3, Math.max(0, (combo || 1) - 1));
    E().play(function (c, o, t) {
      var end = t;
      for (var i = 0; i < 3; i++) {
        var f = PENTA[base + i];
        E().tone(c, o, t + i * 0.07, { type: 'triangle', f0: f, dur: 0.22, gain: 0.16 });
        end = E().tone(c, o, t + i * 0.07, { type: 'sine', f0: f * 2, dur: 0.16, gain: 0.05 });
      }
      E().noise(c, o, t, { dur: 0.05, gain: 0.08, cutoff: 6000 });
      return end;
    }, true);
  }
  function combo(n) {
    E().play(function (c, o, t) {
      var end = t;
      for (var i = 0; i < Math.min(4, n); i++) end = E().tone(c, o, t + 0.25 + i * 0.05, { type: 'sine', f0: 1760 + i * 220, dur: 0.09, gain: 0.07 });
      return end;
    });
  }
  function clear() {
    var notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    E().play(function (c, o, t) {
      var end = t;
      for (var i = 0; i < notes.length; i++) {
        E().tone(c, o, t + i * 0.11, { type: 'triangle', f0: notes[i], dur: 0.3, gain: 0.18 });
        end = E().tone(c, o, t + i * 0.11, { type: 'sine', f0: notes[i] / 2, dur: 0.35, gain: 0.08 });
      }
      return end;
    }, true);
  }
  function lose() {
    var notes = [392, 349.23, 311.13];
    E().play(function (c, o, t) {
      var end = t;
      for (var i = 0; i < notes.length; i++) end = E().tone(c, o, t + i * 0.22, { type: 'sawtooth', f0: notes[i], f1: notes[i] * 0.97, dur: 0.3, gain: 0.08 });
      return end;
    }, true);
  }
  function tick() { E().play(function (c, o, t) { return E().tone(c, o, t, { type: 'square', f0: 1000, dur: 0.03, gain: 0.05 }); }); }
  function timeout() {
    E().play(function (c, o, t) {
      E().tone(c, o, t, { type: 'square', f0: 160, dur: 0.4, gain: 0.08 });
      return E().tone(c, o, t, { type: 'square', f0: 164, dur: 0.4, gain: 0.08 });
    }, true);
  }

  audio.sounds = { click: click, pick: pick, drop: drop, refuse: refuse, match: match, combo: combo, clear: clear, lose: lose, tick: tick, timeout: timeout };
  SS.sounds = audio.sounds;
})(typeof globalThis !== 'undefined' ? globalThis : this);
