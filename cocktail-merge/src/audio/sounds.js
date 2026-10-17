// src/audio/sounds.js: the sound recipes of DESIGN 3.9 (revision 3 + amendments/audio.md),
// consume(events, game), click(), notReady() and haptics. Merges, clinks, the win jingle and the
// lose sting are modelled as STRUCK GLASS: inharmonic partials 1 : 2.32 : 4.25 : 6.63 with
// beating detuned pairs (the wine-glass shimmer) plus a short noise tick. Browser-only.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var audio = CM.audio = CM.audio || {};
  var E = audio._eng;
  var A = (CM.config && CM.config.AUDIO) || {};
  var TIERS = (CM.config && CM.config.TIERS) || [];
  var SCALE = (A.SCALE && A.SCALE.length) ? A.SCALE
    : [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51, 1567.98,
       1760.00, 2093.00, 2349.32, 2637.02, 2793.83, 3135.96];

  var RATIOS = [1, 2.32, 4.25, 6.63];        // struck wine glass modes
  var PGAIN = [1, 0.42, 0.22, 0.1];          // relative partial levels
  var PTAU = [1, 0.55, 0.32, 0.2];           // higher modes die faster

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(a, b) { return a + Math.random() * (b - a); }   // audio-only randomness (allowed)
  function note(i) { return SCALE[clamp(Math.round(i), 0, SCALE.length - 1)]; }
  function radius(t) { var T = TIERS[t]; return T && T.radius ? T.radius : 6; }
  function music() { return audio.music; }

  // Pitch of the merged glass: bigger glass = lower; every chain step raises it one scale step.
  // T9 at depth 1 rings at C5 (523 Hz), T2 at E6 (1319 Hz); index capped at 14.
  function glassFreq(k, d) {
    k = clamp(Math.round(k) || 2, 2, 9);
    d = Math.max(1, Math.round(d) || 1);
    return note((9 - k) + Math.min(d - 1, 5));
  }

  // ---------- building blocks (all add nodes to an existing voice v) ----------
  // A struck glass at fundamental f: peak level, decay T (s; about -28 dB at T), into opts.dest or v.out.
  // opts: partials (<= 4), gains[], noShimmer, attack, vibrato (Hz), tick (false = none), tickGain, tickFreq.
  var LITE = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);   // phones: fewer oscillators per glass
  function glass(v, f, t, peak, T, opts) {
    opts = opts || {};
    var n = Math.min(opts.partials || 4, LITE ? (A.LITE_PARTIALS || 3) : 9), tau1 = T / 3.2, stop = t + T * 1.8;   // stops near -50 dB
    var bus = v.gain(1), oscs = [];
    bus.connect(opts.dest || v.out);
    for (var p = 0; p < n; p++) {
      var fp = f * RATIOS[p];
      if (fp > 15000) break;
      var g = v.gain(0), lvl = peak * PGAIN[p] * (opts.gains ? opts.gains[p] : 1);
      E.env(g.gain, t, lvl, opts.attack || 0.0015, tau1 * PTAU[p]);
      g.connect(bus);
      if (p < (LITE ? 1 : 2) && !opts.noShimmer) {               // phones: the beating pair only on the fundamental
        var beat = rnd(0.6, 2.4) * (1 + p);          // detuned pair: the slow wine-glass beating
        var o1 = v.osc('sine', fp - beat / 2, t, stop), o2 = v.osc('sine', fp + beat / 2, t, stop);
        var half = v.gain(0.8);
        o1.connect(g); o2.connect(half); half.connect(g);
        oscs.push([o1, RATIOS[p]], [o2, RATIOS[p]]);
      } else {
        oscs.push([v.osc('sine', fp, t, stop), RATIOS[p]]);
        oscs[oscs.length - 1][0].connect(g);
      }
    }
    if (opts.vibrato) {                                // +-8 Hz wobble on the fundamental (lose sting)
      var lfo = v.osc('sine', opts.vibrato, t, stop);
      for (var q = 0; q < oscs.length; q++) {
        var dep = v.gain(8 * oscs[q][1]);
        lfo.connect(dep); dep.connect(oscs[q][0].frequency);
      }
    }
    if (opts.tick !== false) tick(v, t, peak * (opts.tickGain || 0.35), opts.tickFreq || 5200, opts.dest);
    return stop;
  }

  // Short contact transient: noise -> bandpass -> very fast envelope.
  function tick(v, t, peak, f, dest) {
    var bp = v.filter('bandpass', f, 1.1), g = v.gain(0);
    E.env(g.gain, t, peak, 0.0005, 0.004);
    v.noise(t, t + 0.03).connect(bp); bp.connect(g); g.connect(dest || v.out);
  }

  function noiseBurst(v, t, dur, type, f, q, peak, attack, tau) {
    var flt = v.filter(type, f, q), g = v.gain(0);
    E.env(g.gain, t, peak, attack, tau);
    v.noise(t, t + dur).connect(flt); flt.connect(g); g.connect(v.out);
    return flt;
  }

  function shaker(v, t0, t1, peak) {
    for (var t = t0; t < t1 - 0.01; t += 0.125) noiseBurst(v, t, 0.1, 'highpass', 6000, 0.7, peak, 0.004, 0.03);
  }

  function simpleTone(v, type, f, t, peak, attack, tau, stop) {
    var g = v.gain(0); E.env(g.gain, t, peak, attack, tau);
    v.osc(type, f, t, stop).connect(g); g.connect(v.out);
    return g;
  }

  // ---------- recipes ----------
  // Merge (tier k, depth d): a struck glass, longer and lower for bigger glasses.
  function mergeSound(k, d, x) {
    var f = glassFreq(k, d), T = 0.5 + 0.1 * (k - 2) + 0.03 * Math.min(d - 1, 4);   // T2 0.5 s .. T9 1.2 s
    var mg = typeof A.MERGE_GAIN === 'number' ? A.MERGE_GAIN : 1;
    var peak = mg * Math.min(0.34, 0.24 * (1 + 0.08 * (d - 1)));
    var v = E.voice({ peak: peak, dur: T * 1.8 + 0.2, force: true, pan: E.panFor(x), bus: 'clink' });
    if (!v) return;
    var t = v.t;
    glass(v, f, t, peak, T, { tickGain: 0.4 });
    // A second, softer glass a fifth below answers it: two glasses touching.
    glass(v, f * 0.667, t + 0.012, peak * 0.22, T * 0.8, { partials: 3, tick: false });
    if (k >= 5 && !LITE) noiseBurst(v, t + 0.02, 0.8, 'highpass', 4000, 0.7, 0.035, 0.01, 0.25);   // fizz (desktop only)
    if (k >= 7) {                                      // body + a grace glass two steps up
      simpleTone(v, 'sine', f / 2, t, 0.08, 0.004, 0.3, t + 1.4);
      glass(v, glassFreq(k, d + 2), t + 0.09, peak * 0.55, T * 0.8, { partials: 3 });
    }
    if (d >= 2) sparkle(v, t + 0.05, Math.min(d, 5), f);
  }

  // Chain sparkle: d tiny high pings on the scale above the merge pitch.
  function sparkle(v, t, n, f) {
    for (var i = 0; i < n; i++) {
      var fi = Math.min(f * (2 + 0.5 * i) * rnd(0.98, 1.02), 6000);
      glass(v, fi, t + 0.055 * i, 0.045, 0.22, { partials: 2, noShimmer: true, tick: false });
    }
  }

  // Clink (glass-glass impact): high partials only, 60-120 ms, level from vn.
  function clinkSound(vn, rMean, x, gain) {
    var v = E.voice({ peak: gain, dur: 0.25, pan: E.panFor(x), bus: 'clink' });
    if (!v) return;
    var r1 = radius(1);                       // relative to T1, so a global radius scale keeps the pitches
    var f0 = (A.CLINK_F0 || 2600) * Math.pow(r1 / rMean, 0.6) * rnd(0.975, 1.025);
    var ts = Math.pow(rMean / r1, 0.3);
    glass(v, f0, v.t, gain, 0.125 * ts, { partials: 3, gains: [1, 1.4, 1.6], noShimmer: true,
      tickGain: 0.3, tickFreq: 7000 });
  }

  function thockSound(vn, x, gain) {
    var v = E.voice({ peak: gain, dur: 0.3, pan: E.panFor(x) });
    if (!v) return;
    var t = v.t, g = v.gain(0);
    E.env(g.gain, t, gain, 0.002, 0.05);
    var o = v.osc('triangle', 220, t, t + 0.3);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.07);
    o.connect(g); g.connect(v.out);
    noiseBurst(v, t, 0.12, 'bandpass', 1200, 1.5, 0.5 * gain, 0.002, 0.02);
  }

  function whoosh(x) {
    var v = E.voice({ peak: 0.1, dur: 0.4, pan: E.panFor(x) });
    if (!v) return;
    var t = v.t, bp = v.filter('bandpass', 500, 0.9), g = v.gain(0);
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2200, t + 0.22);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.1, t + 0.025);
    g.gain.linearRampToValueAtTime(0, t + 0.26);
    v.noise(t, t + 0.28).connect(bp); bp.connect(g); g.connect(v.out);
    var lp = v.filter('lowpass', 300, 0.7), g2 = v.gain(0);
    g2.gain.setValueAtTime(0.04, t);
    g2.gain.linearRampToValueAtTime(0, t + 0.35);
    v.noise(t, t + 0.36).connect(lp); lp.connect(g2); g2.connect(v.out);
  }

  var lastCoin = -1;
  function coinDing(delay) {
    var c = E.ctx();
    if (!c) return;
    var at = c.currentTime + delay;
    if (lastCoin >= 0 && Math.abs(at - lastCoin) < 0.04) return;
    var v = E.voice({ peak: 0.06, dur: 0.4, delay: delay });
    if (!v) return;
    lastCoin = at;
    simpleTone(v, 'sine', 1975.5, v.t, 0.06, 0.002, 0.06, v.t + 0.4);
    simpleTone(v, 'sine', 2637, v.t, 0.04, 0.002, 0.06, v.t + 0.4);
  }

  function discovery() {
    var v = E.voice({ peak: 0.05, dur: 0.6, bus: 'clink' });
    if (!v) return;
    [2637, 3136, 3951].forEach(function (f, i) {
      glass(v, f, v.t + 0.04 * i, 0.05, 0.3, { partials: 2, tick: false });
    });
  }

  function dangerTick(n) {
    var v = E.voice({ peak: 0.07, dur: 0.15 });
    if (!v) return;
    simpleTone(v, 'triangle', 880 * Math.pow(2, clamp(n, 0, 12) / 12), v.t, 0.07, 0.003, 0.02, v.t + 0.05);
  }

  // Win jingle (~2.2 s): a rising arpeggio of glasses, a glass chord, shimmer and shaker.
  function winJingle() {
    var v = E.voice({ peak: 0.26, dur: 2.3, force: true, bus: 'clink' });
    if (!v) return;
    var t = v.t, arp = [1046.5, 1318.51, 1567.98, 2093.0, 2637.02];
    for (var i = 0; i < arp.length; i++) glass(v, arp[i], t + 0.1 * i, 0.17, 0.75);
    [1046.5, 1318.51, 1567.98, 2093.0].forEach(function (f) { glass(v, f, t + 0.62, 0.1, 1.6, { tickGain: 0.2 }); });
    var sh = v.gain(0);
    sh.gain.setValueAtTime(0.04, t + 0.6);
    sh.gain.linearRampToValueAtTime(0, t + 2.0);
    var trem = v.gain(0.5), lfo = v.osc('sine', 9, t + 0.6, t + 2.05), dep = v.gain(0.5);
    lfo.connect(dep); dep.connect(trem.gain);
    v.osc('sine', 2093, t + 0.6, t + 2.05).connect(trem);
    v.osc('sine', 3136, t + 0.6, t + 2.05).connect(trem);
    trem.connect(sh); sh.connect(v.out);
    shaker(v, t + 0.62, t + 1.6, 0.05);
    duck();
  }

  // Lose sting (~1.9 s): a dull thud, then four dull glasses sliding down a semitone each.
  function loseSting() {
    var v = E.voice({ peak: 0.3, dur: 2.2, force: true });
    if (!v) return;
    var t = v.t, g = v.gain(0);
    E.env(g.gain, t, 0.3, 0.004, 0.12);
    var o = v.osc('sine', 120, t, t + 0.6);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.3);
    o.connect(g); g.connect(v.out);
    noiseBurst(v, t, 0.2, 'lowpass', 250, 0.7, 0.2, 0.003, 0.05);
    var dull = v.filter('lowpass', 2400, 0.7); dull.connect(v.out);
    var notes = [783.99, 739.99, 698.46, 659.25], lv = [0.16, 0.14, 0.12, 0.13];
    for (var i = 0; i < 4; i++) {
      var last = i === 3;
      glass(v, notes[i], t + 0.3 + 0.3 * i, lv[i], last ? 1.4 : 0.45,
        { dest: dull, partials: 3, vibrato: last ? 5.5 : 0, tickFreq: 3000, tickGain: 0.25 });
    }
    duck();
  }

  function fiesta(x) {
    mergeSound(9, 3, x);
    var v = E.voice({ peak: 0.12, dur: 0.8, force: true, pan: E.panFor(x) });
    if (!v) return;
    var t = v.t, bp = noiseBurst(v, t, 0.45, 'bandpass', 800, 1, 0.12, 0.01, 0.15);
    bp.frequency.exponentialRampToValueAtTime(300, t + 0.4);
    shaker(v, t, t + 0.6, 0.05);
  }

  // Bomb (owner feature): a deep thud, a wide noise burst and a shower of shattering glass.
  function boom(x) {
    var v = E.voice({ peak: 0.3, dur: 1.4, force: true, pan: E.panFor(x) });
    if (!v) return;
    var t = v.t, g = v.gain(0), o = v.osc('sine', 110, t, t + 0.7);
    E.env(g.gain, t, 0.3, 0.004, 0.22);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.45);
    o.connect(g); g.connect(v.out);
    noiseBurst(v, t, 0.6, 'lowpass', 900, 0.7, 0.22, 0.004, 0.18);
    noiseBurst(v, t + 0.03, 0.9, 'highpass', 3500, 0.8, 0.09, 0.01, 0.3);   // glass dust
    for (var i = 0; i < (LITE ? 2 : 4); i++) glass(v, 1800 * Math.pow(1.19, i) * rnd(0.97, 1.03), t + 0.05 + 0.06 * i, 0.07, 0.35, { partials: 3, noShimmer: true, tick: false });
  }
  function bombReady() {
    var v = E.voice({ peak: 0.1, dur: 0.6 });
    if (!v) return;
    glass(v, 1046.5, v.t, 0.08, 0.5, { partials: 3, tick: false });
    glass(v, 1568, v.t + 0.12, 0.08, 0.6, { partials: 3, tick: false });
  }
  function uiClick() {
    var v = E.voice({ peak: 0.07, dur: 0.1 });
    if (!v) return;
    var g = v.gain(0), o = v.osc('sine', 1400, v.t, v.t + 0.06);
    E.env(g.gain, v.t, 0.07, 0.002, 0.012);
    o.frequency.exponentialRampToValueAtTime(1000, v.t + 0.035);
    o.connect(g); g.connect(v.out);
  }

  function notReadySound() {
    var v = E.voice({ peak: 0.04, dur: 0.1 });
    if (!v) return;
    var g = v.gain(0);
    g.gain.setValueAtTime(0.04, v.t);
    g.gain.linearRampToValueAtTime(0, v.t + 0.04);
    v.osc('sine', 300, v.t, v.t + 0.05).connect(g); g.connect(v.out);
  }

  function duck() {
    var m = music();
    if (m && m.duck) m.duck(0.35, 2.4);
  }

  // ---------- haptics (play only; silent when muted; a no-op on iOS) ----------
  function vibrate(p) {
    var nav = root.navigator;
    if (!nav || typeof nav.vibrate !== 'function' || audio.isMuted()) return;
    try { nav.vibrate(p); } catch (e) { /* ignored */ }
  }

  // ---------- clink limiter (3.9 Limits) ----------
  var queue = [], flushPending = false, recent = [], pairLast = {}, lastQuiet = -1e9;
  function nowMs() { return root.performance && root.performance.now ? root.performance.now() : +new Date(); }

  function queueImpact(e) {
    if (e.growing) return;
    var ga = e.tierA, gb = e.tierB;
    var rMean = e.b === null || e.b === undefined || !gb ? radius(ga) : (radius(ga) + radius(gb)) / 2;
    var wall = e.b === null || e.b === undefined;
    var lin = clamp((e.vn - 18) / 140, 0, 1);
    var gain = (wall ? 0.25 : 0.32) * Math.pow(lin, 1.2);
    if (gain < (A.CLINK_MIN_GAIN || 0.02)) return;
    queue.push({ wall: wall, gain: gain, vn: e.vn, r: rMean, x: e.x,
      key: wall ? e.a + 'w' + e.wall : Math.min(e.a, e.b) + '_' + Math.max(e.a, e.b) });
    if (!flushPending) {
      flushPending = true;
      // Runs once the whole frame (all ticks of this rAF) has been dispatched: "per frame".
      Promise.resolve().then(E.guard('clinks', flush));
    }
  }

  function flush() {
    flushPending = false;
    var list = queue; queue = [];
    list.sort(function (a, b) { return b.gain - a.gain; });
    var t = nowMs(), played = 0, perFrame = LITE ? (A.LITE_CLINKS_PER_FRAME || 2) : (A.CLINKS_PER_FRAME || 3), perSec = LITE ? (A.LITE_CLINKS_PER_SEC || 6) : (A.CLINKS_PER_SEC || 12);
    var keep = [];
    for (var i = 0; i < recent.length; i++) if (t - recent[i] < 1000) keep.push(recent[i]);
    recent = keep;
    for (var j = 0; j < list.length && played < perFrame; j++) {
      var c = list[j];
      if (recent.length >= perSec) break;
      if (pairLast[c.key] !== undefined && t - pairLast[c.key] < (A.CLINK_PAIR_MS || 80)) continue;
      var quiet = c.gain < (A.CLINK_QUIET || 0.15);
      if (quiet && t - lastQuiet < (A.CLINK_QUIET_GAP_MS || 30)) continue;
      if (c.wall) thockSound(c.vn, c.x, c.gain); else clinkSound(c.vn, c.r, c.x, c.gain);
      pairLast[c.key] = t; recent.push(t); played++;
      if (quiet) lastQuiet = t;
    }
    var n = 0;                                          // prune the pair table now and then
    for (var k in pairLast) if (Object.prototype.hasOwnProperty.call(pairLast, k)) n++;
    if (n > 256) pairLast = {};
  }

  // ---------- consume ----------
  function consume(events, game) {
    if (!events || !events.length || !E.running()) return;
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      switch (e.type) {
        case 'launch': whoosh(e.x); break;
        case 'launchBlocked': notReadySound(); break;
        case 'impact': queueImpact(e); break;
        case 'merge':
          mergeSound(e.tier, e.depth || 1, e.x);
          if (e.tier >= 5) coinDing(0.5);
          if (e.tier >= 6) vibrate(12);
          break;
        case 'discover': discovery(); break;
        case 'dangerTick': dangerTick(e.n || 0); break;
        case 'win': winJingle(); vibrate([30, 40, 30]); break;
        case 'jugBurst': fiesta(e.x); coinDing(0.5); break;
        case 'bomb': boom(e.x); vibrate(60); break;
        case 'bombEarned': if (e.gained !== false) { coinDing(0.5); bombReady(); } break;
        case 'lose': loseSting(); vibrate(80); break;
        default: break;
      }
    }
  }

  audio.consume = E.guard('consume', consume);
  audio.click = E.guard('click', uiClick);
  audio.notReady = E.guard('notReady', notReadySound);
  audio.glassFreq = glassFreq;
  // Direct recipe access for tests/browser/audio-check.html and debugging (not part of 5.5).
  audio._sfx = { merge: mergeSound, clink: clinkSound, thock: thockSound, whoosh: whoosh, coin: coinDing,
    discovery: discovery, dangerTick: dangerTick, win: winJingle, lose: loseSting, fiesta: fiesta,
    click: uiClick, notReady: notReadySound, flushClinks: flush };
})(typeof globalThis !== 'undefined' ? globalThis : this);
