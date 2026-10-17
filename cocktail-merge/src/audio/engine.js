// src/audio/engine.js: the WebAudio engine (DESIGN 3.9, 3.10). AudioContext, the shared graph
// (master, compressor, buses, clink lowpass, noise buffer), the iOS-safe unlock inside the user
// gesture, mute, ambience and the voice limits. Recipes live in sounds.js, the music in music.js.
// Browser-only. Without an AudioContext every entry point is a silent no-op.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var audio = CM.audio = CM.audio || {};
  var A = (CM.config && CM.config.AUDIO) || {};

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  var MASTER = num(A.MASTER, 0.9), AMB = num(A.AMBIENCE, 0.12), SFX = num(A.SFX_BUS, 1);
  var LITE = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);   // phones/tablets: lighter mix
  var MAX_VOICES = LITE ? num(A.LITE_MAX_VOICES, 7) : num(A.MAX_VOICES, 12), DROP_GAIN = num(A.VOICE_DROP_GAIN, 0.03);
  var MUTE_TAU = num(A.MUTE_TAU, 0.02), PAN_WIDTH = num(A.PAN_WIDTH, 0.6);
  var HARD_CAP = MAX_VOICES + 4;          // absolute ceiling, even for loud non-priority voices
  var UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
  var SILENT_KICK = { touchend: 1, pointerup: 1, click: 1 };
  var Ctor = root.AudioContext || root.webkitAudioContext || null;

  var ac = null, g = null;                 // context and graph {master, comp, sfx, clink, amb, noise}
  var muted = false, ambEnabled = true, ambWanted = false;
  var armed = false, silentDone = false, lifecycleDone = false;
  var active = [];                          // end times (ctx seconds) of counted voices
  var logged = {};
  var listeners = [];                       // fn(ctx): a context was created or became running

  // ---------- fault isolation ----------
  function logOnce(where, e) {
    var msg = where + ': ' + (e && e.message ? e.message : String(e));
    if (logged[msg]) return;
    logged[msg] = 1;
    if (root.console && root.console.warn) root.console.warn('[audio] ' + msg);
  }
  function guard(where, fn) {
    return function () {
      try { return fn.apply(this, arguments); } catch (e) { logOnce(where, e); }
      return undefined;
    };
  }

  // ---------- graph ----------
  function makeNoise(c, seconds, seed) {
    var n = Math.max(1, Math.floor(c.sampleRate * seconds));
    var buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0), s = seed >>> 0;
    for (var i = 0; i < n; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;   // seeded LCG (3.9)
      d[i] = s / 2147483648 - 1;
    }
    return buf;
  }

  function build(c) {
    var G = { ctx: c };
    G.comp = c.createDynamicsCompressor();
    G.comp.threshold.value = num(A.COMP_THRESHOLD, -14);
    G.comp.knee.value = num(A.COMP_KNEE, 10);
    G.comp.ratio.value = num(A.COMP_RATIO, 3.5);
    G.comp.attack.value = num(A.COMP_ATTACK, 0.003);
    G.comp.release.value = num(A.COMP_RELEASE, 0.12);
    G.comp.connect(c.destination);
    G.master = c.createGain();
    G.master.gain.value = muted ? 0 : MASTER;
    G.master.connect(G.comp);
    G.sfx = c.createGain(); G.sfx.gain.value = SFX; G.sfx.connect(G.master);
    G.clink = c.createBiquadFilter();
    G.clink.type = 'lowpass';
    G.clink.frequency.value = num(A.CLINK_LOWPASS, 7000);
    G.clink.Q.value = num(A.CLINK_LOWPASS_Q, 0.7);
    G.clink.connect(G.sfx);
    G.amb = c.createGain(); G.amb.gain.value = 0; G.amb.connect(G.master);
    G.noise = makeNoise(c, num(A.NOISE_SECONDS, 1), 0x2545F491);
    G.canPan = typeof c.createStereoPanner === 'function';
    G.ambNodes = null;                                   // created on demand by applyAmbience (perf)
    return G;
  }

  // Ambience (3.9): noise -> lowpass 500 Hz -> gain swelling with a 0.09 Hz LFO (0.02..0.07) -> ambBus.
  function startAmbience(c, G) {
    if (G.ambNodes) return;
    var src = c.createBufferSource();
    src.buffer = G.ambBuf || (G.ambBuf = makeNoise(c, 4, 0x9E3779B9));   // 4 s loop so the waves have no audible 1-s period
    src.loop = true;
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 0.5;
    var swell = c.createGain(); swell.gain.value = 0.045;
    var lfo = c.createOscillator(); lfo.frequency.value = 0.09;
    var depth = c.createGain(); depth.gain.value = 0.025;
    lfo.connect(depth); depth.connect(swell.gain);
    src.connect(lp); lp.connect(swell); swell.connect(G.amb);
    src.start(); lfo.start();
    G.ambNodes = { src: src, lfo: lfo, lp: lp, swell: swell, depth: depth };
  }
  function stopAmbience(G, when) {
    var n = G.ambNodes; if (!n) return;
    G.ambNodes = null;
    try { n.src.stop(when); n.lfo.stop(when); } catch (e) { /* already stopped */ }
    n.src.onended = function () { [n.src, n.lfo, n.lp, n.swell, n.depth].forEach(function (x) { try { x.disconnect(); } catch (e) { /* gone */ } }); };
  }

  function applyAmbience() {
    if (!g) return;
    var target = (ambEnabled && ambWanted) ? AMB : 0, now = g.ctx.currentTime;
    if (target > 0) startAmbience(g.ctx, g); else stopAmbience(g, now + 1.0);   // nodes exist only while the waves play
    g.amb.gain.setTargetAtTime(target, now, 0.25);
  }

  function setContext(c) {
    ac = c; g = build(c); active = [];
    applyAmbience();
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](c); } catch (e) { logOnce('onContext', e); }
    }
  }

  // ---------- unlock (3.9, 3.10) ----------
  function silentBuffer() {
    var b = ac.createBuffer(1, 1, ac.sampleRate);
    var s = ac.createBufferSource();
    s.buffer = b; s.connect(ac.destination);
    s.onended = function () { try { s.disconnect(); } catch (e) { /* already gone */ } };
    if (s.start) s.start(0); else if (s.noteOn) s.noteOn(0);
  }

  function resume() {
    if (!ac || ac.state === 'running' || !ac.resume) return;
    var p = ac.resume();
    if (p && typeof p.then === 'function') p.then(onState, function () { /* retried on next gesture */ });
  }

  function onState() {
    if (!ac) return;
    if (ac.state === 'running') { disarm(); notify(); }
    else if (ac.state === 'suspended' || ac.state === 'interrupted') arm();
  }

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](ac); } catch (e) { logOnce('onRunning', e); }
    }
  }

  // Everything here runs synchronously inside the gesture handler: never after a promise or timer.
  function unlockFromGesture(e) {
    if (!Ctor && !ac) return;
    try {
      if (!ac) {
        var c;
        try { c = new Ctor({ latencyHint: LITE ? 'playback' : 'interactive' }); } catch (e1) { c = new Ctor(); }   // phones: bigger buffer, no underruns
        setContext(c);
        if ('onstatechange' in c) c.onstatechange = guard('statechange', onState);
      }
      var st = ac.state;
      if (st !== 'running') resume();
      var type = e && e.type;
      if (SILENT_KICK[type] && (!silentDone || st === 'interrupted')) { silentBuffer(); silentDone = true; }
      if (ac.state === 'running') { disarm(); notify(); }
    } catch (err) { logOnce('unlock', err); }
  }

  var opts = { capture: true, passive: true };
  function arm() {
    if (armed || !root.addEventListener) return;
    armed = true;
    for (var i = 0; i < UNLOCK_EVENTS.length; i++) root.addEventListener(UNLOCK_EVENTS[i], unlockFromGesture, opts);
  }
  function disarm() {
    if (!armed) return;
    armed = false;
    for (var i = 0; i < UNLOCK_EVENTS.length; i++) root.removeEventListener(UNLOCK_EVENTS[i], unlockFromGesture, true);
  }

  function rearm() {
    if (!ac) return;
    if (ac.state === 'suspended' || ac.state === 'interrupted') { resume(); arm(); }
  }

  function init(o) {
    o = o || {};
    if (typeof o.muted === 'boolean') muted = o.muted;
    if (typeof o.ambience === 'boolean') ambEnabled = o.ambience;
    if (o.music !== undefined && audio.music && audio.music.setEnabled) audio.music.setEnabled(!!o.music);
    if (!Ctor) return;
    if (!ac) arm();
    if (lifecycleDone || !root.document) return;
    lifecycleDone = true;
    root.document.addEventListener('visibilitychange', guard('visibility', function () {
      if (root.document.visibilityState === 'visible') rearm();
    }));
    root.addEventListener('pageshow', guard('pageshow', function (ev) { if (ev && ev.persisted) rearm(); }));
  }

  // ---------- settings ----------
  function setMuted(b) {
    muted = !!b;
    if (g) g.master.gain.setTargetAtTime(muted ? 0 : MASTER, g.ctx.currentTime, MUTE_TAU);
  }
  function setAmbience(b) { ambEnabled = !!b; applyAmbience(); }
  // ambience(on): the app wants the waves now (title, play) or not (pause). The setting still applies.
  function ambience(on) { ambWanted = !!on; applyAmbience(); }

  // ---------- voices ----------
  // voice({peak, dur, force, pan, bus: 'sfx' | 'clink' | 'raw', dest, count, delay, at}) -> Voice | null.
  // at = absolute context time (music); count: false = not limited (music); force = bypass the drop rule.
  // One logical sound; tracked until its longest stop time. Every node it creates is disconnected
  // once all of its sources have ended (3.9 "every node disconnects on onended").
  function voice(o) {
    if (!g || !ac || (ac.state !== 'running' && !g.offline)) return null;
    var now = ac.currentTime;
    var t = typeof o.at === 'number' ? Math.max(o.at, now) : now + num(o.delay, 0) + 0.005;
    var counted = o.count !== false;
    if (counted) {
      var keep = [];
      for (var i = 0; i < active.length; i++) if (active[i] > now) keep.push(active[i]);
      active = keep;
      if (!o.force && active.length >= MAX_VOICES && (num(o.peak, 1) < DROP_GAIN || active.length >= HARD_CAP)) return null;
      active.push(t + num(o.dur, 1));
    }
    var dest = o.dest || (o.bus === 'clink' ? g.clink : o.bus === 'raw' ? g.master : g.sfx);
    return new Voice(ac, t, dest, o.pan);
  }

  function Voice(c, t, dest, pan) {
    this.c = c; this.t = t; this.nodes = []; this.live = 0;
    this.out = dest;
    if (typeof pan === 'number' && g.canPan) {
      var p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(dest);
      this.nodes.push(p);
      this.out = p;
    }
  }
  Voice.prototype._src = function (s, t0, t1, offset) {
    var self = this;
    this.nodes.push(s); this.live++;
    s.onended = function () {
      if (--self.live > 0) return;
      for (var i = 0; i < self.nodes.length; i++) { try { self.nodes[i].disconnect(); } catch (e) { /* gone */ } }
      self.nodes.length = 0;
    };
    if (offset) s.start(Math.max(t0, 0), offset); else s.start(Math.max(t0, 0));
    s.stop(Math.max(t1, t0 + 0.01));
    return s;
  };
  Voice.prototype.osc = function (type, f, t0, t1) {
    var o = this.c.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f, Math.max(t0, 0));
    return this._src(o, t0, t1);
  };
  // noise(t0, t1, buf?): the shared seeded noise (or buf), looped, from a random offset (audio-only
  // randomness) so stacked noise layers do not phase against each other.
  Voice.prototype.noise = function (t0, t1, buf) {
    var s = this.c.createBufferSource();
    s.buffer = buf || g.noise; s.loop = true;
    return this._src(s, t0, t1, Math.random() * s.buffer.duration * 0.9);
  };
  Voice.prototype.gain = function (v) {
    var n = this.c.createGain(); n.gain.value = num(v, 0);
    this.nodes.push(n); return n;
  };
  Voice.prototype.filter = function (type, f, q) {
    var n = this.c.createBiquadFilter(); n.type = type; n.frequency.value = f;
    if (q !== undefined) n.Q.value = q;
    this.nodes.push(n); return n;
  };
  // chain(a, b, c, ...): connects in order; a final undefined means "into this voice's output".
  Voice.prototype.chain = function () {
    for (var i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]);
    var last = arguments[arguments.length - 1];
    last.connect(this.out);
    return last;
  };
  // env(param, t0, peak, attack, tau): 0 -> peak (linear, attack s) -> exponential decay (time constant tau).
  function env(param, t0, peak, attack, tau) {
    t0 = Math.max(t0, 0);
    param.setValueAtTime(0, t0);
    param.linearRampToValueAtTime(peak, t0 + attack);
    param.setTargetAtTime(0, t0 + attack, tau);
  }

  // ---------- offline (tests) ----------
  // _attachContext(offlineCtx): builds the whole graph on an OfflineAudioContext so recipes render
  // without a user gesture (tests/browser/audio-check.html). Never used by the game.
  function attachContext(c) {
    disarm();
    setContext(c);
    g.offline = true;
    return g;
  }

  // ---------- exports ----------
  audio.init = guard('init', init);
  audio.unlockFromGesture = unlockFromGesture;
  audio.unlock = unlockFromGesture;
  audio.setMuted = guard('setMuted', setMuted);
  audio.isMuted = function () { return muted; };
  audio.muted = audio.isMuted;
  audio.setAmbience = guard('setAmbience', setAmbience);
  audio.ambienceEnabled = function () { return ambEnabled; };
  audio.ambience = guard('ambience', ambience);
  audio.state = function () { return ac ? ac.state : 'none'; };
  audio._attachContext = attachContext;
  // Internal helpers for sounds.js and music.js (not a public API).
  audio._eng = {
    ctx: function () { return ac; },
    graph: function () { return g; },
    running: function () { return !!ac && (ac.state === 'running' || !!(g && g.offline)); },
    voice: voice,
    env: env,
    guard: guard,
    logOnce: logOnce,
    panFor: function (x) { return typeof x === 'number' && isFinite(x) ? (x - 50) / 50 * PAN_WIDTH : undefined; },
    onContext: function (fn) { listeners.push(fn); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
