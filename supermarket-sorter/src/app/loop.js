// src/app/loop.js: the frame loop runs only while a reason wants it (DESIGN 8.5): 'clock' in timed PLAY, 'anim' while a
// JS animation runs. Relaxed play idles with zero callbacks; belts animate on the compositor.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var app = SS.app = SS.app || {};
  var reasons = {}, raf = 0, running = false;
  function any() { for (var k in reasons) if (reasons[k]) return true; return false; }
  function step(t) {
    raf = 0;
    if (!running) return;
    try { app.frame(t); } catch (e) { if (root.console) root.console.error('[loop]', e); }
    if (any()) raf = root.requestAnimationFrame(step); else running = false;
  }
  /** want(reason, on): turns a reason on or off; the loop runs while any reason is on. */
  function want(reason, on) {
    reasons[reason] = !!on;
    if (any() && !running) { running = true; if (!raf) raf = root.requestAnimationFrame(step); }
  }
  function stop() { reasons = {}; running = false; if (raf) { root.cancelAnimationFrame(raf); raf = 0; } }
  app.loop = { want: want, stop: stop, running: function () { return running; } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
