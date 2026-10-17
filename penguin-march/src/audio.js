// src/audio.js: a handful of synthesised sounds on WebAudio, no files. The context is created on the first user
// gesture (browsers require that); before then every call is a no-op. play(name) is what the game calls.
(function (root) {
  'use strict';
  var PM = root.PM = root.PM || {};

  var ctx = null, muted = false, lastShot = 0;

  function ensure() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    return ctx;
  }

  /** unlock(): call from a user gesture once; creates and resumes the context. */
  function unlock() {
    var c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  function tone(freq, type, t0, dur, gain, slideTo) {
    var c = ctx;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(t0, dur, gain) {
    var c = ctx, len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1200;
    s.buffer = buf; g.gain.value = gain;
    s.connect(f); f.connect(g); g.connect(c.destination);
    s.start(t0);
  }

  var SOUNDS = {
    shoot: function (t) { if (t - lastShot < 0.06) return; lastShot = t; tone(900, 'triangle', t, 0.05, 0.05, 500); },
    gateGood: function (t) { tone(520, 'square', t, 0.09, 0.08); tone(780, 'square', t + 0.09, 0.14, 0.08); },
    gateBad: function (t) { tone(400, 'sawtooth', t, 0.12, 0.08, 180); },
    bump: function (t) { tone(1200, 'triangle', t, 0.04, 0.04); },
    pickup: function (t) { tone(1000, 'sine', t, 0.08, 0.07, 1400); },
    ally: function (t) { tone(600, 'triangle', t, 0.1, 0.09); tone(900, 'triangle', t + 0.1, 0.1, 0.09); tone(1200, 'triangle', t + 0.2, 0.18, 0.09); },
    break_: function (t) { noise(t, 0.18, 0.25); tone(200, 'square', t, 0.1, 0.06, 80); },
    hit: function (t) { noise(t, 0.12, 0.2); tone(150, 'sawtooth', t, 0.18, 0.12, 60); },
    boss: function (t) { tone(90, 'square', t, 0.08, 0.1, 60); },
    win: function (t) { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 'square', t + i * 0.11, 0.2, 0.09); }); },
    lose: function (t) { [392, 330, 262].forEach(function (f, i) { tone(f, 'sawtooth', t + i * 0.18, 0.25, 0.09); }); },
    click: function (t) { tone(700, 'sine', t, 0.04, 0.05); }
  };

  /** play(name): fire a sound (names: shoot, gateGood, gateBad, bump, pickup, ally, break, hit, boss, win, lose, click). */
  function play(name) {
    if (muted || !ctx || ctx.state !== 'running') return;
    var fn = SOUNDS[name === 'break' ? 'break_' : name];
    if (fn) { try { fn(ctx.currentTime); } catch (e) { /* audio is optional */ } }
  }

  function setMuted(m) { muted = !!m; }
  function isMuted() { return muted; }

  PM.audio = { unlock: unlock, play: play, setMuted: setMuted, isMuted: isMuted };
})(typeof window !== 'undefined' ? window : globalThis);
