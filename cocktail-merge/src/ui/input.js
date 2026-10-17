// src/ui/input.js: gameplay input (DESIGN 3.6, 3.10). Browser file; sets CM.ui.input.
// Pointer Events on the full-viewport #input layer (touch + mouse fallback when PointerEvent is missing),
// the keyboard, the intents latch consumed by app/loop.js at step boundaries, the 250 ms input guard,
// and the iOS page guards (pinch, rubber-band, double-tap, callout). Nothing here touches the game state:
// it only writes `intents` ({aimX, aimDirty, launch, pause(), mute(), restart()}).
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var ui = CM.ui = CM.ui || {};

  var layer = null, getLayout = null, getView = null, intents = null;
  var tracked = null;          // id of the one tracked pointer / touch identifier (null = none)
  var trackedEl = null;        // element holding pointer capture
  var downInPlay = false;      // the tracked gesture began while in PLAY (3.6 input guard)
  var cancel = false;          // the tracked gesture is above the table (cancel state)
  var lastX = NaN;             // last sim x written to intents.aimX
  var guardMs = 0;             // launch intents ignored until performance.now() >= guardMs
  var keys = { left: false, right: false, shift: false };
  var pageGuards = false;

  var GAME_KEYS = /^(Space|Enter|NumpadEnter|ArrowLeft|ArrowRight|ArrowUp|ArrowDown|KeyW|KeyA|KeyS|KeyD|KeyP|KeyM|KeyR|KeyB|Escape)$/;

  function now() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }
  function state() { var a = CM.app && CM.app.ctx; return a ? a.state : ''; }
  function inPlay() { return state() === 'PLAY'; }
  function safe(name, fn) {
    return function (ev) {
      try { return fn(ev); } catch (e) { if (root.console) root.console.error('Cocktail Merge input (' + name + ')', e); }
    };
  }
  function unlockAudio() {
    try { if (CM.audio && CM.audio.unlockFromGesture) CM.audio.unlockFromGesture(); } catch (e) { /* audio is optional */ }
  }

  // Maps a client point to {x (sim x at LAUNCH_Y), sy (un-zoomed stage y)}, or null without a layout.
  function map(px, py) {
    var lay = getLayout && getLayout();
    if (!lay || !CM.projection) return null;
    var view = (getView && getView()) || { zoom: 1, aboutX: 0, aboutY: 0 };
    var p = CM.projection.unprojectPointer(lay, view, px, py);
    p.farY = lay.farY;
    return p;
  }
  function aimAt(x) {
    if (!intents || !(x === x)) return;
    if (x !== lastX) { lastX = x; intents.aimX = x; intents.aimDirty = true; }
  }
  function setCancel(b) { cancel = !!b; if (intents) intents.cancel = cancel; }
  // Bomb aiming (owner feature): a client point -> the sim point (x, y) on the table plane, clamped to the table.
  function mapBomb(px, py) {
    var lay = getLayout && getLayout(), P = CM.projection;
    if (!lay || !P) return null;
    var view = (getView && getView()) || { zoom: 1, aboutX: 0, aboutY: 0 }, zoom = view.zoom > 0 ? view.zoom : 1;
    var ux = view.aboutX + (px - view.aboutX) / zoom, uy = view.aboutY + (py - view.aboutY) / zoom;
    var sy = uy - lay.stage.y, T = (CM.config && CM.config.TABLE) || { W: 100, L: 160 };
    var y = P.unprojectY(lay, sy); if (!(y === y)) return null;
    y = Math.max(0, Math.min(T.L, y));
    var x = Math.max(0, Math.min(T.W, P.unprojectX(lay, ux, y)));
    return { x: x, y: y };
  }
  var bombTracked = null;

  // ---------- the shared gesture handlers (pointer and touch/mouse fallback feed these) ----------
  function down(id, px, py, el) {
    if (intents && intents.bombMode && inPlay()) {          // bomb: any point on the stage aims the blast
      var bp = mapBomb(px, py);
      if (!bp) return false;
      bombTracked = id; intents.bombAt = bp;
      return true;
    }
    if (tracked !== null || !inPlay()) return false;
    var p = map(px, py);
    if (!p || p.sy < p.farY) return false;          // above the table: nothing (3.6)
    tracked = id; trackedEl = el || null; downInPlay = true; setCancel(false);
    aimAt(p.x);
    return true;
  }
  function move(id, px, py, hover) {
    var p;
    if (intents && intents.bombMode) {
      if (bombTracked === id || (hover && bombTracked === null)) { var bp = mapBomb(px, py); if (bp) intents.bombAt = bp; }
      return;
    }
    if (tracked === id) {
      p = map(px, py);
      if (!p) return;
      if (p.sy < p.farY) setCancel(true);            // aim frozen while cancelling
      else { setCancel(false); aimAt(p.x); }
    } else if (hover && tracked === null && inPlay()) {
      p = map(px, py);
      if (p && p.sy >= p.farY) aimAt(p.x);           // mouse hover aims (only when it actually moved)
    }
  }
  function up(id) {
    if (bombTracked === id) {
      bombTracked = null;
      if (intents && intents.bombMode && intents.bombAt) intents.bomb = { x: intents.bombAt.x, y: intents.bombAt.y };
      return;
    }
    if (tracked !== id) return;
    var fire = !cancel && downInPlay && inPlay() && now() >= guardMs;
    release();
    if (fire && intents) intents.launch = 'pointer';
  }
  function cancelGesture(id) { if (bombTracked === id) bombTracked = null; if (tracked === id) release(); }
  function release() {
    if (trackedEl && tracked !== null && trackedEl.releasePointerCapture) {
      try { trackedEl.releasePointerCapture(tracked); } catch (e) { /* not captured */ }
    }
    tracked = null; trackedEl = null; downInPlay = false; setCancel(false);
  }

  // ---------- Pointer Events ----------
  function bindPointer(el) {
    el.addEventListener('pointerdown', safe('pointerdown', function (ev) {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      if (down(ev.pointerId, ev.clientX, ev.clientY, el)) {
        try { el.setPointerCapture(ev.pointerId); } catch (e) { /* capture is best effort */ }
        if (ev.cancelable) ev.preventDefault();
      }
    }));
    el.addEventListener('pointermove', safe('pointermove', function (ev) {
      move(ev.pointerId, ev.clientX, ev.clientY, ev.pointerType === 'mouse' && !ev.buttons);
    }));
    el.addEventListener('pointerup', safe('pointerup', function (ev) {
      unlockAudio();
      if (tracked === ev.pointerId) move(ev.pointerId, ev.clientX, ev.clientY, false);
      up(ev.pointerId);
    }));
    el.addEventListener('pointercancel', safe('pointercancel', function (ev) { cancelGesture(ev.pointerId); }));
    el.addEventListener('lostpointercapture', safe('lostcapture', function (ev) {
      if (tracked === ev.pointerId && ev.pointerType !== 'mouse') cancelGesture(ev.pointerId);
    }));
  }

  // ---------- touch + mouse fallback (engines without PointerEvent, 3.10) ----------
  function bindFallback(el) {
    var nonPassive = { passive: false };
    function find(list, id) {
      for (var i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
      return null;
    }
    el.addEventListener('touchstart', safe('touchstart', function (ev) {
      var t = ev.changedTouches[0];
      if (t && down('t' + t.identifier, t.clientX, t.clientY, null)) ev.preventDefault();
    }), nonPassive);
    el.addEventListener('touchmove', safe('touchmove', function (ev) {
      if (tracked === null) return;
      var t = find(ev.changedTouches, +String(tracked).slice(1));
      if (t) { move(tracked, t.clientX, t.clientY, false); ev.preventDefault(); }
    }), nonPassive);
    el.addEventListener('touchend', safe('touchend', function (ev) {
      unlockAudio();
      if (tracked === null) return;
      var t = find(ev.changedTouches, +String(tracked).slice(1));
      if (t) { move(tracked, t.clientX, t.clientY, false); up(tracked); ev.preventDefault(); }
    }), nonPassive);
    el.addEventListener('touchcancel', safe('touchcancel', function () { if (tracked !== null) release(); }), nonPassive);
    el.addEventListener('mousedown', safe('mousedown', function (ev) {
      if (ev.button === 0 && down('m', ev.clientX, ev.clientY, null)) ev.preventDefault();
    }));
    root.addEventListener('mousemove', safe('mousemove', function (ev) {
      move(tracked === 'm' ? 'm' : '-', ev.clientX, ev.clientY, tracked === null && ev.target === el);
    }));
    root.addEventListener('mouseup', safe('mouseup', function (ev) {
      if (tracked === 'm') { move('m', ev.clientX, ev.clientY, false); up('m'); }
    }));
  }

  // ---------- keyboard ----------
  function code(ev) {
    if (ev.code) return ev.code;
    var k = ev.key;
    if (k === ' ' || k === 'Spacebar') return 'Space';
    if (k === 'Esc') return 'Escape';
    if (k === 'Left') return 'ArrowLeft';
    if (k === 'Right') return 'ArrowRight';
    if (k === 'Up') return 'ArrowUp';
    if (k && k.length === 1) return 'Key' + k.toUpperCase();
    return k || '';
  }
  function isButton(t) { return !!(t && t.closest && t.closest('button, a, [role="button"], [role="switch"]')); }

  function onKeyDown(ev) {
    var c = code(ev);
    keys.shift = !!ev.shiftKey;
    if (inPlay()) {
      if (!GAME_KEYS.test(c)) return;
      ev.preventDefault();
      if (c === 'ArrowLeft' || c === 'KeyA') keys.left = true;
      else if (c === 'ArrowRight' || c === 'KeyD') keys.right = true;
      else if (ev.repeat) return;
      else if (c === 'Space' || c === 'Enter' || c === 'NumpadEnter' || c === 'ArrowUp' || c === 'KeyW') {
        unlockAudio();
        if (intents && now() >= guardMs) intents.launch = 'key';
      } else if (c === 'Escape' && intents && intents.bombMode) { intents.bombMode = false; intents.bombAt = null; intents.bomb = null; }
      else if (c === 'KeyP' || c === 'Escape') { if (intents && intents.pause) intents.pause(c === 'Escape' ? 'esc' : 'p'); }
      else if (c === 'KeyB') { if (intents && intents.bombKey) intents.bombKey(); }
      else if (c === 'KeyM') { if (intents && intents.mute) intents.mute(); }
      else if (c === 'KeyR') { if (intents && intents.restart) intents.restart(); }
      return;
    }
    // Outside PLAY: buttons keep native activation; Esc, R, P and Enter go to the overlay layer.
    if (ev.repeat) return;
    if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space') {
      if (isButton(ev.target)) return;
      if (c === 'Space') return;
    } else if (c !== 'Escape' && c !== 'KeyR' && c !== 'KeyP') return;
    var handled = false;
    try { handled = !!(CM.ui.keyAction && CM.ui.keyAction(c === 'NumpadEnter' ? 'Enter' : c)); } catch (e) { handled = false; }
    if (handled) ev.preventDefault();
  }
  function onKeyUp(ev) {
    var c = code(ev);
    keys.shift = !!ev.shiftKey;
    if (c === 'ArrowLeft' || c === 'KeyA') keys.left = false;
    if (c === 'ArrowRight' || c === 'KeyD') keys.right = false;
    if (inPlay() && GAME_KEYS.test(c)) ev.preventDefault();
  }
  function clearKeys() { keys.left = keys.right = keys.shift = false; }

  // ---------- iOS page guards (3.10): no pinch, rubber-band, double-tap zoom, callout or context menu ----------
  function scrollableAncestor(t) {
    for (var n = t; n && n !== root.document.body; n = n.parentNode) {
      if (n.nodeType === 1 && n.scrollHeight > n.clientHeight + 1) {
        var oy = root.getComputedStyle ? root.getComputedStyle(n).overflowY : '';
        if (oy === 'auto' || oy === 'scroll') return n;
      }
    }
    return null;
  }
  function installPageGuards() {
    if (pageGuards || !root.document) return;
    pageGuards = true;
    var d = root.document, nonPassive = { passive: false };
    function stop(ev) { if (ev.cancelable) ev.preventDefault(); }
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (n) { d.addEventListener(n, stop, nonPassive); });
    d.addEventListener('touchmove', function (ev) {
      if (ev.touches && ev.touches.length > 1) { stop(ev); return; }
      if (!scrollableAncestor(ev.target)) stop(ev);
    }, nonPassive);
    d.addEventListener('dblclick', stop, nonPassive);
    d.addEventListener('contextmenu', stop, nonPassive);
    root.addEventListener('blur', clearKeys);
  }

  // ---------- public API (5.5) ----------
  /** attach(inputLayer, getLayout, getView, intents): binds once; later calls only swap the callbacks. */
  function attach(el, gl, gv, it) {
    getLayout = gl; getView = gv; intents = it || intents;
    if (intents && typeof intents.cancel !== 'boolean') intents.cancel = false;
    installPageGuards();
    if (layer === el || !el) return;
    layer = el;
    if (root.PointerEvent) bindPointer(el); else bindFallback(el);
    root.addEventListener('keydown', safe('keydown', onKeyDown), true);
    root.addEventListener('keyup', safe('keyup', onKeyUp), true);
  }
  /** heldDir() -> -1 | 0 | 1 from the held arrow / A-D keys. */
  function heldDir() { return (keys.right ? 1 : 0) - (keys.left ? 1 : 0); }
  /** precise() -> boolean: Shift held (keyboard aim x0.35). */
  function precise() { return keys.shift; }
  /** reset(): every exit from PLAY clears the latch, aimDirty, the tracked pointer and held keys. */
  function reset() {
    release();
    clearKeys();
    bombTracked = null;
    lastX = NaN;
    if (intents) { intents.launch = null; intents.aimDirty = false; intents.cancel = false; }
  }
  /** guardUntil(ms): launch intents are ignored until performance.now() reaches ms. */
  function guardUntil(ms) { guardMs = +ms || 0; }
  /** cancelling() -> boolean: the tracked gesture is in the cancel state (render draws the red X). */
  function cancelling() { return cancel; }
  /** active() -> boolean: a gesture is being tracked (finger down / button held). */
  function active() { return tracked !== null; }

  ui.input = { attach: attach, heldDir: heldDir, precise: precise, reset: reset, guardUntil: guardUntil,
    cancelling: cancelling, active: active };
})(typeof globalThis !== 'undefined' ? globalThis : this);
