// src/audio/engine.js: the WebAudio engine. AudioContext created inside the first user gesture (iOS rule), silent-buffer
// unlock, resume after 'interrupted' / tab switches, master gain with mute, a voice cap. Recipes live in sounds.js.
// Without an AudioContext every entry point is a silent no-op.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var audio = SS.audio = SS.audio || {};
  var A = (SS.config && SS.config.AUDIO) || {};
  var MASTER = typeof A.MASTER === 'number' ? A.MASTER : 0.8, MAX_VOICES = 10;
  var Ctor = root.AudioContext || root.webkitAudioContext || null;
  var UNLOCK = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
  var ac = null, master = null, muted = false, armed = false, voices = [], logged = {};

  function warn(where, e) { var k = where + String(e && e.message); if (logged[k]) return; logged[k] = 1; if (root.console) root.console.warn('[audio] ' + where, e || ''); }

  function build() {
    if (ac || !Ctor) return;
    try {
      ac = new Ctor();
      master = ac.createGain(); master.gain.value = muted ? 0 : MASTER; master.connect(ac.destination);
      var b = ac.createBuffer(1, 1, ac.sampleRate), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0);   // silent kick
    } catch (e) { warn('create', e); ac = null; }
  }
  function resume() {
    if (!ac || !ac.resume) return;
    if (ac.state === 'running') { disarm(); return; }
    try { var p = ac.resume(); if (p && p.then) p.then(function () { if (ac.state === 'running') disarm(); }, function () { /* next gesture */ }); } catch (e) { warn('resume', e); }
  }
  function onGesture() { build(); resume(); }
  function arm() { if (armed) return; armed = true; UNLOCK.forEach(function (t) { root.addEventListener(t, onGesture, true); }); }
  function disarm() { if (!armed) return; armed = false; UNLOCK.forEach(function (t) { root.removeEventListener(t, onGesture, true); }); }

  function init(opts) {
    muted = !!(opts && opts.muted);
    arm();
    if (root.document) root.document.addEventListener('visibilitychange', function () { if (root.document.visibilityState === 'visible' && ac && ac.state !== 'running') arm(); });
    root.addEventListener('pageshow', function () { if (ac && ac.state !== 'running') arm(); });
  }
  function setMuted(on) {
    muted = !!on;
    if (master && ac) { try { master.gain.setTargetAtTime(muted ? 0 : MASTER, ac.currentTime, 0.02); } catch (e) { master.gain.value = muted ? 0 : MASTER; } }
  }
  function ready() { return !!(ac && ac.state === 'running' && !muted); }

  /** play(recipe): recipe(ctx, out, now) builds nodes; skipped when muted, locked or over the voice cap. */
  function play(recipe, priority) {
    if (!ready()) return;
    var now = ac.currentTime;
    voices = voices.filter(function (t) { return t > now; });
    if (voices.length >= MAX_VOICES && !priority) return;
    try {
      var end = recipe(ac, master, now);
      voices.push(typeof end === 'number' ? end : now + 0.2);
    } catch (e) { warn('play', e); }
  }
  /** tone(ctx, out, t0, {type, f0, f1, dur, gain, attack}): one oscillator voice with an envelope. Returns its end time. */
  function tone(ctx, out, t0, o) {
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur);
    var a = o.attack || 0.005, peak = o.gain || 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g); g.connect(out);
    osc.start(t0); osc.stop(t0 + o.dur + 0.02);
    osc.onended = function () { try { osc.disconnect(); g.disconnect(); } catch (e) { /* gone */ } };
    return t0 + o.dur;
  }
  /** noise(ctx, out, t0, {dur, gain, cutoff}): a short filtered noise burst. */
  function noise(ctx, out, t0, o) {
    var n = Math.floor(ctx.sampleRate * o.dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = o.cutoff || 3000; g.gain.value = o.gain || 0.15;
    src.connect(f); f.connect(g); g.connect(out); src.start(t0);
    src.onended = function () { try { src.disconnect(); f.disconnect(); g.disconnect(); } catch (e) { /* gone */ } };
    return t0 + o.dur;
  }

  audio.engine = { init: init, setMuted: setMuted, play: play, tone: tone, noise: noise, ready: ready, context: function () { return ac; } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
