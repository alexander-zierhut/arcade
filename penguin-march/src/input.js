// src/input.js: where the player wants the waddle. Touch or mouse: press anywhere and drag, the waddle follows
// the finger sideways (the finger's x on the road, with some gain so the thumb never has to reach the edge).
// Keyboard: left/right arrows or A/D push toward the edges while held. target() is read by the game loop every
// step; null means "no wish, stay where you are".
(function (root) {
  'use strict';
  var PM = root.PM = root.PM || {};

  var GAIN = 1.35;             // finger at 74% of the road half-width already means the edge
  var el = null, toRoad = null, dragging = false, pointerTarget = null, keyDir = 0, pointerId = null;

  /** attach(element, mapFn): mapFn(clientX) -> road x at the waddle's depth (render.js knows the geometry). */
  function attach(element, mapFn) {
    el = element; toRoad = mapFn;
    el.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      dragging = true; pointerId = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
      move(e);
      PM.input.onPress && PM.input.onPress();
      e.preventDefault();
    });
    el.addEventListener('pointermove', function (e) { if (dragging && e.pointerId === pointerId) move(e); });
    var up = function (e) { if (e.pointerId === pointerId) { dragging = false; pointerId = null; } };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    root.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keyDir = -1; pointerTarget = null; e.preventDefault(); }
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keyDir = 1; pointerTarget = null; e.preventDefault(); }
      PM.input.onKey && PM.input.onKey(e);
    });
    root.addEventListener('keyup', function (e) {
      if ((e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') && keyDir === -1) keyDir = 0;
      if ((e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') && keyDir === 1) keyDir = 0;
    });
  }

  function move(e) {
    var x = toRoad ? toRoad(e.clientX) : 0;
    pointerTarget = Math.max(-1, Math.min(1, x * GAIN));
  }

  /** target(currentX) -> road x the player steers toward, or null. */
  function target(currentX) {
    if (keyDir) return keyDir;
    if (pointerTarget != null) return pointerTarget;
    return null;
  }

  function reset() { dragging = false; pointerTarget = null; keyDir = 0; pointerId = null; }

  /** set(x): a programmatic wish (tests, the preview bot). null clears it. */
  function set(x) { pointerTarget = x; keyDir = 0; }

  PM.input = { attach: attach, target: target, reset: reset, set: set, onPress: null, onKey: null };
})(typeof window !== 'undefined' ? window : globalThis);
