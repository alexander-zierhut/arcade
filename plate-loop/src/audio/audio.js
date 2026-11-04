// src/audio/audio.js: PL.audio, the sounds of Plate Loop as Web Audio synthesis (no sample files). Quiet, warm, short.
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};

  var MASTER = 0.35;
  var NAMES = ['eject', 'land', 'close', 'refuse', 'reveal', 'unlock', 'unwrap', 'thaw', 'win', 'lose', 'tap'];

  var ctx = null, master = null, noiseBuf = null;
  var failed = false;            // no AudioContext (or it threw): everything is a no-op
  var mutedFlag = null;          // null = not read yet
  var low = null;                // null = ask Arcade.perf lazily
  var listening = false;
  var lastPlay = {};

  // ---- mute state ---------------------------------------------------------------------------------------------
  function readSound() {
    // PL.save owns 'sound' inside the game's save when it is there; else the plain Arcade.storage key 'sound'.
    try {
      if (PL.save && PL.save.get) { var s = PL.save.get(); if (s && typeof s.sound === 'boolean') return s.sound; }
    } catch (e) { /* fall through */ }
    try {
      if (root.Arcade && root.Arcade.storage && root.Arcade.storage.get) return root.Arcade.storage.get('sound', true) !== false;
    } catch (e2) { /* fall through */ }
    return null;
  }
  function muted() {
    var s = readSound();
    if (s !== null) mutedFlag = !s;
    else if (mutedFlag === null) mutedFlag = false;
    return mutedFlag;
  }
  function setMuted(m) {
    mutedFlag = !!m;
    var on = !mutedFlag;
    // Persist only a real change (writing at boot would make the kit treat a first visit as a return visit),
    // and only through the save (one key: plateLoop.save), with Arcade.storage as the fallback without a save.
    if (readSound() !== on) {
      try {
        if (PL.save && PL.save.patch) PL.save.patch({ sound: on });
        else if (root.Arcade && root.Arcade.storage && root.Arcade.storage.set) root.Arcade.storage.set('sound', on);
      } catch (e) { /* ignore */ }
    }
    if (mutedFlag && master && ctx) {
      try { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(0, ctx.currentTime); } catch (e3) { /* ignore */ }
    }
    return mutedFlag;
  }

  function lowPerf(v) {
    if (arguments.length) low = !!v;
    if (low !== null) return low;
    try { return !!(root.Arcade && root.Arcade.perf && root.Arcade.perf.low && root.Arcade.perf.low()); } catch (e) { return false; }
  }

  // ---- context ------------------------------------------------------------------------------------------------
  function getCtx() {
    if (ctx) return ctx;
    if (failed) return null;
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) { failed = true; return null; }
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = MASTER;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; master = null; failed = true; return null; }
    return ctx;
  }
  function resume() {
    var c = getCtx();
    if (!c) return null;
    try { if (c.state === 'suspended' && c.resume) { var p = c.resume(); if (p && p.catch) p.catch(function () {}); } } catch (e) { /* ignore */ }
    return c;
  }
  function unlock() {
    if (listening) return;
    var d = root.document;
    if (!d || !d.addEventListener) return;
    listening = true;
    function go() {
      resume();
      try { d.removeEventListener('pointerdown', go, true); d.removeEventListener('keydown', go, true); d.removeEventListener('touchend', go, true); } catch (e) { /* ignore */ }
    }
    try {
      d.addEventListener('pointerdown', go, true);
      d.addEventListener('keydown', go, true);
      d.addEventListener('touchend', go, true);
    } catch (e2) { /* ignore */ }
  }

  // ---- voices -------------------------------------------------------------------------------------------------
  function env(g, t, peak, attack, dur) {
    var a = Math.min(attack, dur * 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  // tone(type, f0, f1, t, dur, peak, attack): one oscillator, optional pitch glide f0 -> f1
  function tone(type, f0, f1, t, dur, peak, attack) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, peak, attack || 0.004, dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function getNoise() {
    if (noiseBuf) return noiseBuf;
    var n = Math.floor(ctx.sampleRate * 0.5), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), seed = 12345;
    for (var i = 0; i < n; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = seed / 2147483648 - 1; }
    noiseBuf = b;
    return b;
  }
  // noise(ftype, f0, f1, q, t, dur, peak, attack): filtered noise burst, filter sweeping f0 -> f1
  function noise(ftype, f0, f1, q, t, dur, peak, attack) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = getNoise();
    f.type = ftype; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, peak, attack || 0.004, dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, 0, Math.min(dur + 0.02, 0.5)); s.stop(t + dur + 0.02);
  }

  // ---- the sounds (t = start time, lo = fewer layers) -----------------------------------------------------------
  var VOICES = {
    // a short soft slide
    eject: function (t, lo) {
      noise('bandpass', 500, 1500, 1.2, t, 0.16, 0.6, 0.04);
      if (!lo) tone('sine', 300, 190, t, 0.14, 0.12, 0.01);
    },
    // light ceramic tap: plate meets box
    land: function (t, lo) {
      tone('sine', 1250, 1000, t, 0.09, 0.28, 0.002);
      if (!lo) { tone('sine', 2100, 1900, t, 0.05, 0.1, 0.002); noise('highpass', 3500, 3500, 0.7, t, 0.025, 0.1, 0.001); }
    },
    // lid snap + a tiny two-note chime
    close: function (t, lo) {
      noise('highpass', 2200, 2200, 0.8, t, 0.04, 0.24, 0.001);
      tone('triangle', 220, 140, t, 0.07, 0.22, 0.002);
      tone('sine', 1319, 1319, t + 0.07, 0.2, 0.15, 0.004);
      tone('sine', 1760, 1760, t + 0.15, 0.3, 0.13, 0.004);
      if (!lo) { tone('sine', 2637, 2637, t + 0.07, 0.1, 0.04, 0.004); tone('sine', 3520, 3520, t + 0.15, 0.14, 0.035, 0.004); }
    },
    // a dull thud
    refuse: function (t, lo) {
      tone('sine', 150, 70, t, 0.22, 0.4, 0.003);
      if (!lo) noise('lowpass', 500, 200, 0.7, t, 0.08, 0.14, 0.002);
    },
    // a glint: high short ping
    reveal: function (t, lo) {
      tone('sine', 2400, 2400, t, 0.22, 0.25, 0.002);
      if (!lo) { tone('sine', 3600, 3600, t + 0.03, 0.14, 0.06, 0.002); tone('sine', 4800, 4800, t + 0.06, 0.08, 0.03, 0.002); }
    },
    // a click + rising two notes
    unlock: function (t, lo) {
      noise('bandpass', 3000, 3000, 2, t, 0.025, 0.2, 0.001);
      tone('triangle', 660, 660, t + 0.04, 0.12, 0.17, 0.004);
      tone('triangle', 880, 880, t + 0.13, 0.22, 0.17, 0.004);
      if (!lo) tone('sine', 1760, 1760, t + 0.13, 0.16, 0.04, 0.004);
    },
    // a cloth swish
    unwrap: function (t, lo) {
      noise('bandpass', 1800, 700, 0.8, t, 0.28, 0.45, 0.09);
      if (!lo) noise('highpass', 4000, 2500, 0.5, t + 0.03, 0.2, 0.05, 0.08);
    },
    // a crackle: a few short noise bursts
    thaw: function (t, lo) {
      var times = lo ? [0, 0.09, 0.21] : [0, 0.05, 0.11, 0.19, 0.27, 0.36];
      var freqs = [4200, 3100, 5200, 3600, 4700, 2800];
      for (var i = 0; i < times.length; i++) {
        noise('bandpass', freqs[i], freqs[i] * 0.7, 3, t + times[i], 0.02 + (i % 2) * 0.012, 0.6 - i * 0.04, 0.001);
      }
      if (!lo) tone('sine', 900, 600, t + 0.3, 0.12, 0.05, 0.01);
    },
    // "order up": a bright bell with a decaying harmonic, then a short major arpeggio
    win: function (t, lo) {
      tone('sine', 1568, 1568, t, 1.0, 0.22, 0.002);                        // G6 strike
      if (!lo) {
        tone('sine', 1568 * 2.76, 1568 * 2.76, t, 0.35, 0.08, 0.002);      // inharmonic partial, dies fast
        tone('sine', 1568 * 5.4, 1568 * 5.4, t, 0.12, 0.04, 0.002);
      }
      var notes = lo ? [523.25, 659.25, 783.99] : [523.25, 659.25, 783.99, 1046.5];
      for (var i = 0; i < notes.length; i++) {
        var s = t + 0.22 + i * 0.13;
        tone('triangle', notes[i], notes[i], s, i === notes.length - 1 ? 0.8 : 0.3, 0.17, 0.005);
        if (!lo) tone('sine', notes[i] * 2, notes[i] * 2, s, 0.2, 0.04, 0.005);
      }
    },
    // a low descending two-note wah
    lose: function (t, lo) {
      tone('sawtooth', 294, 262, t, 0.26, 0.1, 0.03);
      tone('sawtooth', 233, 175, t + 0.26, 0.32, 0.1, 0.03);
      if (!lo) { tone('sine', 147, 131, t, 0.26, 0.12, 0.03); tone('sine', 117, 88, t + 0.26, 0.32, 0.12, 0.03); }
    },
    // UI click
    tap: function (t, lo) {
      tone('sine', 900, 650, t, 0.05, 0.2, 0.002);
      if (!lo) noise('bandpass', 2500, 2500, 1.5, t, 0.015, 0.06, 0.001);
    }
  };

  function play(name) {
    try {
      var v = VOICES[name];
      if (!v || muted()) return false;
      var c = resume();
      if (!c || !master) return false;
      var now = c.currentTime;
      if (lastPlay[name] !== undefined && now - lastPlay[name] < 0.03) return false;   // the same sound twice in 30 ms is one
      lastPlay[name] = now;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(MASTER, now);
      v(now + 0.005, lowPerf());
      return true;
    } catch (e) { return false; }
  }

  PL.audio = {
    play: play, setMuted: setMuted, muted: muted, unlock: unlock, lowPerf: lowPerf,
    names: NAMES.slice(),
    ctx: function () { return ctx; }            // for tests
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.audio;
})(typeof window !== 'undefined' ? window : globalThis);
