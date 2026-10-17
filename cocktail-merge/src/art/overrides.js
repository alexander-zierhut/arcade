// src/art/overrides.js: the optional PNG override loader of DESIGN 4.3. Browser file. Sets
// CM.art.loadOverrides, CM.art.hasOverride and CM.art.overrideImage.
// If the owner drops assets/tier-1.png ... assets/tier-9.png (any subset) next to index.html, those tiers
// are drawn from the picture instead of their procedural painter. Loads use `new Image()` only (never
// fetch or XHR), so they work from file://, http and https. Nothing here ever reads pixels back.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var art = CM.art = CM.art || {};

  var N = 9;
  var WIDTH_R = 2.0;      // drawn width in R-units (the collider diameter)
  var MAX_H_R = 3.6;      // taller pictures are scaled down uniformly to this height
  var BOTTOM_Y = 0.40;    // anchor y of the picture's bottom-centre (front of the base ellipse)

  var loaded = [];        // loaded[t] = {img, rect} for every tier whose picture loaded in time
  var phase = 'idle';     // 'idle' | 'loading' | 'done'
  var waiters = [];
  var timer = null;

  /** The picture's rect in R-units, anchor coordinates: {x, y, w, h} (bottom-centre at (0, +0.40)). */
  function rectFor(nw, nh) {
    var w = WIDTH_R, h = WIDTH_R * nh / nw;
    if (h > MAX_H_R) { w *= MAX_H_R / h; h = MAX_H_R; }
    return { x: -w / 2, y: BOTTOM_Y - h, w: w, h: h };
  }

  function finish() {
    if (phase === 'done') return;
    phase = 'done';
    if (timer !== null) { clearTimeout(timer); timer = null; }
    var list = waiters; waiters = [];
    list.forEach(function (fn) {
      try { fn(); } catch (e) { if (root.console) root.console.error(e); }
    });
  }

  /**
   * Starts the 9 image loads (4.3) and calls done() exactly once, when all 9 have settled (load or error)
   * or after timeoutMs (BOOT passes 1500), whichever comes first. An image that settles after that is
   * ignored for the whole session, so a tier never changes its art mid-run. `base` (optional, default '')
   * is prefixed to the relative URL 'assets/tier-N.png'; pages outside the project root (the contact sheet
   * in tests/browser/) pass '../../'. Calling it again only queues `done` (or calls it, if already done).
   */
  function loadOverrides(timeoutMs, done, base) {
    if (typeof done === 'function') waiters.push(done);
    if (phase === 'done') { finish0(); return; }
    if (phase === 'loading') return;
    phase = 'loading';
    var Img = root.Image, pending = N, t;
    if (typeof Img !== 'function' || typeof setTimeout !== 'function') { finish(); return; }

    function settle(tier, img, ok) {
      if (phase !== 'loading') return;                 // after the deadline: a no-op
      if (ok && img.naturalWidth > 0 && img.naturalHeight > 0) {
        loaded[tier] = { img: img, rect: rectFor(img.naturalWidth, img.naturalHeight) };
      }
      pending -= 1;
      if (pending === 0) finish();
    }
    function start(tier) {
      var img = new Img(), seen = false;
      img.onload = function () { if (!seen) { seen = true; settle(tier, img, true); } };
      img.onerror = function () { if (!seen) { seen = true; settle(tier, img, false); } };
      img.src = (base || '') + 'assets/tier-' + tier + '.png';
    }
    timer = setTimeout(finish, Math.max(0, +timeoutMs || 0));
    for (t = 1; t <= N; t++) start(t);
  }
  // Already done: run the newly queued callbacks (asynchronously, like a real load would).
  function finish0() {
    var list = waiters; waiters = [];
    setTimeout(function () {
      list.forEach(function (fn) { try { fn(); } catch (e) { if (root.console) root.console.error(e); } });
    }, 0);
  }

  /** True if tier t's picture loaded before the deadline. */
  function hasOverride(t) { return !!loaded[t]; }

  /** {img, rect: {x, y, w, h}} for tier t (R-units, anchor coordinates), or null. */
  function overrideImage(t) { return loaded[t] || null; }

  /** Bit t-1 set for every tier with an override (used by sprites.js to key its cache). */
  function overrideMask() {
    var m = 0, t;
    for (t = 1; t <= N; t++) if (loaded[t]) m |= 1 << (t - 1);
    return m;
  }

  art.loadOverrides = loadOverrides;
  art.hasOverride = hasOverride;
  art.overrideImage = overrideImage;
  art.overrideMask = overrideMask;
  if (typeof module === 'object' && module && module.exports) {
    module.exports = { loadOverrides: loadOverrides, hasOverride: hasOverride, overrideImage: overrideImage,
      overrideMask: overrideMask, rectFor: rectFor };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
