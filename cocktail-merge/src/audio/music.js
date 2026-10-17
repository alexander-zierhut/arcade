// src/audio/music.js: calm beach-bar background music, fully synthesised (amendments/audio.md).
// 72 BPM in F major: soft detuned pad chords with a slow attack (I-vi-IV-V and relatives, chosen
// per 4-bar phrase), a warm triangle bass, marimba / steel-pan-like plucked arpeggios with random
// variation, and an optional light shaker, all through a lowpass into a bus of at most 0.12.
// A look-ahead scheduler on AudioContext time keeps it seamless; it is generative, so it never
// repeats as an audible 4-bar loop. Starts only once the context runs (after the first gesture).
// Browser-only.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var audio = CM.audio = CM.audio || {};
  var E = audio._eng;

  var A = (CM.config && CM.config.AUDIO) || {};
  var LEVEL = Math.min(0.12, typeof A.MUSIC === 'number' ? A.MUSIC : 0.09);   // music bus (owner limit 0.12)
  var BPM = 72, BEAT = 60 / BPM, STEP = BEAT / 2, BAR = BEAT * 4;
  var LITE = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);   // phones: about half the oscillators (owner: Firefox Android stuttered)
  var LOOKAHEAD = typeof A.MUSIC_LOOKAHEAD_S === 'number' ? A.MUSIC_LOOKAHEAD_S : 1.5;   // owner: music stuttered on the phone at 0.4 s
  var INTERVAL_MS = typeof A.MUSIC_PUMP_MS === 'number' ? A.MUSIC_PUMP_MS : 150;
  var ROOT = 53;                           // F3
  var MAJOR = [0, 2, 4, 5, 7, 9, 11];
  var PENTA = [0, 2, 4, 7, 9];             // major pentatonic, for passing notes
  var MAIN = [0, 5, 3, 4];                 // I vi IV V
  var ALT = [[0, 5, 1, 4], [0, 2, 3, 4], [5, 3, 0, 4], [3, 4, 2, 5], [0, 3, 5, 4], [3, 0, 1, 4]];
  var TEMPLATES = [                        // indices into the chord's arpeggio; -1 = rest
    [0, 2, 1, 3, 2, 4, 3, 2], [0, 1, 2, 3, 4, 3, 2, 1], [2, 0, 3, 1, 4, 2, 3, 1],
    [0, -1, 2, -1, 3, -1, 1, -1], [0, 2, 4, 2, 3, 1, 2, -1], [4, 3, 2, 0, 1, 2, 3, -1]
  ];

  var enabledFlag = true, started = false, playing = false, timer = null;
  var gr = null;                           // per-context graph {ctx, out, lp, padLp}
  var nextT = 0, step = 0, bar = 0, phrase = 0;
  var prog = MAIN, tpl = TEMPLATES[0], shakerOn = false, restP = 0.15, chord = null;

  function rnd() { return Math.random(); }  // audio-only randomness (allowed)
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function semis(i) { return 12 * Math.floor(i / 7) + MAJOR[((i % 7) + 7) % 7]; }

  // ---------- graph ----------
  function ensureGraph() {
    var c = E.ctx(), G = E.graph();
    if (!c || !G) return null;
    if (gr && gr.ctx === c) return gr;
    var out = c.createGain(); out.gain.value = 0; out.connect(G.master);
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.5;
    lp.connect(out);
    var padLp = c.createBiquadFilter(); padLp.type = 'lowpass'; padLp.frequency.value = 1100; padLp.Q.value = 0.3;
    padLp.connect(lp);
    gr = { ctx: c, out: out, lp: lp, padLp: padLp };
    playing = false;
    return gr;
  }

  // ---------- harmony ----------
  // chordInfo(degree) -> {pad: midi[], bass: midi, arp: midi[]} with smooth pad voicing.
  function chordInfo(d) {
    var tones = [semis(d), semis(d + 2), semis(d + 4)];
    if (rnd() < 0.35) tones.push(semis(d + (d === 0 || d === 3 ? 6 : 1)));   // maj7 on I/IV, else add9
    var pad = tones.map(function (s) {
      var m = ROOT + (s % 12);
      while (m < 56) m += 12;
      while (m >= 69) m -= 12;
      return m;
    }).sort(function (a, b) { return a - b; });
    var bass = ROOT - 12 + (semis(d) % 12);
    if (bass > 46) bass -= 12;
    var arp = [], pcs = [semis(d) % 12, semis(d + 2) % 12, semis(d + 4) % 12];
    for (var m = ROOT + 12; m <= ROOT + 31; m++) {
      if (pcs.indexOf((m - ROOT) % 12) >= 0) arp.push(m);
    }
    return { pad: pad, bass: bass, arp: arp };
  }

  function passing(m) {                    // nearest pentatonic neighbour, up or down
    var dir = rnd() < 0.5 ? -1 : 1;
    for (var k = 1; k <= 3; k++) {
      var n = m + dir * k;
      if (PENTA.indexOf(((n - ROOT) % 12 + 12) % 12) >= 0) return n;
    }
    return m;
  }

  function newPhrase() {
    prog = (phrase % 2 === 0 || rnd() < 0.3) ? MAIN : pick(ALT);
    tpl = pick(TEMPLATES);
    shakerOn = !LITE && phrase > 0 && rnd() < 0.65;
    restP = phrase === 0 ? 0.4 : (rnd() < 0.2 ? 0.45 : 0.15);   // now and then a sparse, breathing phrase
  }

  // ---------- instruments ----------
  function pad(t, notes) {
    var v = E.voice({ count: false, at: t, dest: gr.padLp });
    if (!v) return;
    var end = t + BAR + (LITE ? 1.2 : 2.4), n = LITE ? Math.min(3, notes.length) : notes.length;
    for (var i = 0; i < n; i++) {
      var g = v.gain(0), peak = 0.05 / Math.sqrt(n / 3);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 1.2);             // slow attack
      g.gain.setValueAtTime(peak, t + BAR);
      g.gain.setTargetAtTime(0, t + BAR, 0.5);                    // overlaps the next chord's attack
      for (var j = 0; j < (LITE && i > 0 ? 1 : 2); j++) {
        var o = v.osc(j ? 'sawtooth' : 'triangle', hz(notes[i]), t, end);
        o.detune.setValueAtTime(j ? 7 : -7, t);
        o.connect(g);
      }
      g.connect(v.out);
    }
  }

  function bass(t, m, peak, tau) {
    var v = E.voice({ count: false, at: t, dest: gr.lp });
    if (!v) return;
    var g = v.gain(0);
    E.env(g.gain, t, peak, 0.025, tau);
    v.osc('triangle', hz(m), t, t + tau * 5).connect(g);
    g.connect(v.out);
  }

  // Marimba / steel-pan pluck: fundamental, a soft octave and the marimba's 3.93x bar mode.
  function pluck(t, m, vel) {
    var v = E.voice({ count: false, at: t, dest: gr.lp, pan: (rnd() - 0.5) * 0.5 });
    if (!v) return;
    var f = hz(m), parts = LITE ? [[1, 1, 0.34], [3.93, 0.16, 0.035]] : [[1, 1, 0.34], [2, 0.12, 0.14], [3.93, 0.16, 0.035]];
    for (var i = 0; i < parts.length; i++) {
      var g = v.gain(0);
      E.env(g.gain, t, 0.3 * vel * parts[i][1], 0.003, parts[i][2]);
      v.osc('sine', f * parts[i][0], t, t + (LITE ? 1.0 : 1.5)).connect(g);
      g.connect(v.out);
    }
  }

  function shake(t, peak) {
    var v = E.voice({ count: false, at: t, dest: gr.lp });
    if (!v) return;
    var hp = v.filter('highpass', 6500, 0.7), g = v.gain(0);
    E.env(g.gain, t, peak, 0.006, 0.025);
    v.noise(t, t + 0.12).connect(hp); hp.connect(g); g.connect(v.out);
  }

  // ---------- sequencer ----------
  function scheduleStep(t) {
    if (step === 0) {
      if (bar === 0) newPhrase();
      chord = chordInfo(prog[bar]);
      pad(t, chord.pad);
      bass(t, chord.bass, 0.24, 0.9);
    }
    if (step === 4 && rnd() < 0.6) bass(t, chord.bass + (rnd() < 0.5 ? 7 : 0), 0.15, 0.5);
    var idx = tpl[step];
    var rest = idx < 0 || (step > 0 && rnd() < restP);
    if (!rest) {
      var m = chord.arp[Math.min(idx, chord.arp.length - 1)];
      if (step % 2 === 1 && rnd() < 0.12) m = passing(m);
      var vel = 0.7 + (step === 0 || step === 4 ? 0.18 : 0) + (rnd() - 0.5) * 0.24;
      var human = (rnd() - 0.5) * 0.016;
      pluck(t + Math.max(0, human), m, vel);
      if (rnd() < 0.07) pluck(t + STEP / 2, passing(m), vel * 0.6);   // a little grace 16th
    }
    if (shakerOn && rnd() > 0.12) shake(t, step % 2 ? 0.05 : 0.03);
  }

  function advance() {
    nextT += STEP;
    if (++step === 8) {
      step = 0;
      if (++bar === 4) { bar = 0; phrase++; }
    }
  }

  function wanted() {
    var doc = root.document;
    return enabledFlag && started && E.running() && !audio.isMuted() && !(doc && doc.hidden);
  }

  function begin() {
    var c = gr.ctx, now = c.currentTime;
    playing = true;
    nextT = now + 0.1; step = 0; bar = 0;
    gr.out.gain.cancelScheduledValues(now);
    gr.out.gain.setTargetAtTime(LEVEL, now, 0.9);                  // gentle fade-in
  }

  function halt() {
    playing = false;
    if (gr) gr.out.gain.setTargetAtTime(0, gr.ctx.currentTime, 0.3);
  }

  function pump() {
    if (!wanted()) { if (playing) halt(); return; }
    if (!ensureGraph()) return;
    if (!playing) begin();
    var now = gr.ctx.currentTime;
    if (nextT < now) { nextT = now + 0.05; step = 0; bar = 0; }  // fell behind (throttled timer): resync
    while (nextT < now + LOOKAHEAD) { scheduleStep(nextT); advance(); }
  }

  function syncTimer() {
    var on = enabledFlag && started;
    if (on && !timer && root.setInterval) timer = root.setInterval(E.guard('music', pump), INTERVAL_MS);
    if (!on && timer) { root.clearInterval(timer); timer = null; }
    if (on) pump(); else if (playing) halt();
  }

  // ---------- public ----------
  function start() { started = true; syncTimer(); }
  function stop() { started = false; syncTimer(); }
  function setEnabled(b) { enabledFlag = !!b; syncTimer(); }
  // duck(depth, seconds): drop to depth x level (win / lose stingers), then glide back.
  function duck(depth, seconds) {
    if (!gr || !playing) return;
    var g = gr.out.gain, now = gr.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(LEVEL * depth, now, 0.12);
    g.setTargetAtTime(LEVEL, now + seconds, 0.9);
  }
  // _render(t0, seconds): schedules music directly (no timer) on the current context, for the
  // OfflineAudioContext check in tests/browser/audio-check.html. Returns the number of steps.
  function render(t0, seconds) {
    if (!ensureGraph()) return 0;
    gr.out.gain.setValueAtTime(LEVEL, 0);
    nextT = t0; step = 0; bar = 0; phrase = 0;
    var n = 0;
    while (nextT < t0 + seconds) { scheduleStep(nextT); advance(); n++; }
    return n;
  }

  E.onContext(function () { if (started && enabledFlag) pump(); });
  if (root.document && root.document.addEventListener) {
    root.document.addEventListener('visibilitychange', E.guard('music', function () { if (started) pump(); }));
  }

  audio.music = {
    start: E.guard('music.start', start),
    stop: E.guard('music.stop', stop),
    setEnabled: E.guard('music.setEnabled', setEnabled),
    enabled: function () { return enabledFlag; },
    playing: function () { return playing; },
    duck: E.guard('music.duck', duck),
    LEVEL: LEVEL,
    _render: render
  };
  // Mute changes the master gain only; re-pump so the scheduler stops or resumes promptly.
  var setMuted0 = audio.setMuted;
  audio.setMuted = function (b) { setMuted0(b); if (started) E.guard('music', pump)(); };
  audio.setMusic = audio.music.setEnabled;
})(typeof globalThis !== 'undefined' ? globalThis : this);
