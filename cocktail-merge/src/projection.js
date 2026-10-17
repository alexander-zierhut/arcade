// src/projection.js (CM.projection)
// Pure layout solve (stage, HUD rects, tier strip, table) and the pinhole
// sim <-> screen mapping of DESIGN 3.2 - 3.4. Takes numbers, returns numbers; no DOM.
//
// Coordinate systems:
//   - sim: table units (u), x in [0, W], y in [0, L] (y = 0 far edge, y = L near edge).
//   - canvas: CSS px of the full-viewport canvas. project(), footprint(), cx, nearY, farY
//     and the zoom "about" point of unprojectPointer() are in canvas px.
//   - stage: CSS px relative to the stage's top-left corner. lay.stage.x is the stage's
//     offset in the canvas (stage.y is always 0). hud.* and strip.* rects are stage px;
//     add lay.stage.x to x when applying them to the DOM.
// Zoom convention (render and input must agree): a canvas point P is drawn at
//   about + (P - about) * zoom, i.e. translate(about) scale(zoom) translate(-about).
(function (root, factory) {
  'use strict';
  var isNode = typeof module === 'object' && module && module.exports;
  var deps = isNode
    ? { config: require('./config.js') }
    : { config: root.CM.config };
  var api = factory(deps);
  if (isNode) module.exports = api;
  else { root.CM = root.CM || {}; root.CM.projection = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';
  /* @pure-begin */
  var config = deps.config;

  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }

  var VIEW = config.VIEW || {};
  var TABLE = config.TABLE || {};

  // Table geometry (u).
  var W = num(TABLE.W, 100);
  var L = num(TABLE.L, 160);
  var FRAME = num(TABLE.FRAME, 5);
  var LAUNCH_Y = num(TABLE.LAUNCH_Y, 144);
  var HALF_W = W / 2;

  // View constants (3.2, 5.3).
  var S_FAR = num(VIEW.S_FAR, 0.72);
  var TABLE_FILL = num(VIEW.TABLE_FILL, 0.96);
  var C_NEAR_MIN = num(VIEW.C_NEAR_MIN, 0.85);
  var C_NEAR_MAX = num(VIEW.C_NEAR_MAX, 0.98);
  var STAGE_ASPECT = num(VIEW.STAGE_ASPECT, 0.62);
  var FAR_MIN_FRAC = num(VIEW.FAR_MIN_FRAC, 0.27);
  var HEADROOM = num(VIEW.HEADROOM, 0.12);
  var PORTRAIT_BLOCK_VH = num(VIEW.PORTRAIT_BLOCK_VH, 500);
  var DPR_MAX = num(VIEW.DPR_MAX, 2);

  // Derived projection constants.
  var DEPTH = 1 - S_FAR;                 // 0.28: table height on screen = DEPTH * A
  var F = S_FAR * L / DEPTH;             // 411.4286
  var TABLE_SPAN_U = W + 2 * FRAME;      // 110: table plus both side frames
  var NEAR_PAD_U = 2 * FRAME;            // 10: near frame plus apron, below nearY
  var UI_K_BASE = 3.4;                   // uiK = kX / 3.4
  var KX_MIN = 0.25;                     // guard for degenerate (tiny) viewports only

  // Tier strip constants (3.2 step 2, 3.4).
  var STRIP_BODY_FRAC = 0.86;            // slots plus end padding, fraction of S
  var STRIP_ARROW_FRAC = 0.06;           // arrow head width, fraction of S
  var STRIP_W_FRAC = 0.92;               // whole strip, centred
  var STRIP_PAD = 6;                     // px padding at each pill end
  var SLOTS = 9;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function rect(x, y, w, h) { return { x: x, y: y, w: w, h: h }; }

  // Depth scale s(y) = F / (F + L - y): S_FAR at the far edge, 1 at the near edge.
  function scaleAt(y) { return F / (F + L - y); }

  // HUD rects (3.4), stage px. S = stage width, H = stage height.
  function computeHud(S, H, safeTop) {
    var m = Math.round(0.04 * S);
    var pillH = Math.max(Math.round(0.055 * H), 40);
    var D = Math.round(1.25 * pillH);
    var N = Math.round(Math.min(0.15 * S, 72));
    var top = Math.max(safeTop, Math.round(0.012 * H));
    var cy = top + D / 2;
    var coin = rect(m, top, D, D);
    var next = rect(S - m - N, top, N, N);
    var label = rect(next.x - 6, top + N + 2, N + 12, 20);
    var mute = rect(next.x - 52, cy - 22, 44, 44);
    var pause = rect(mute.x - 52, cy - 22, 44, 44);
    var pillX = m + D / 2;
    var pill = rect(pillX, cy - pillH / 2, Math.min(0.40 * S, pause.x - 10 - pillX), pillH);
    var bestX = m + D + 4;
    var best = rect(bestX, pill.y + pillH + 3, pill.x + pill.w - bestX, 20);
    var bottom = Math.max(best.y + 20, label.y + 20, top + D);
    return {
      top: top, bottom: bottom, cy: cy, m: m, pillH: pillH, D: D, N: N,
      coin: coin, pill: pill, best: best, pause: pause, mute: mute, next: next, label: label
    };
  }

  // Tier strip (3.2 step 2, 3.4), stage px.
  function computeStrip(S, H, safeBottom) {
    var slotW = (STRIP_BODY_FRAC * S - 2 * STRIP_PAD) / SLOTS;
    var h = Math.max(44, Math.min(0.07 * H, 1.25 * slotW + 10));
    var bottom = H - safeBottom - Math.max(0.035 * H, 16);
    var top = bottom - h;
    var x = (1 - STRIP_W_FRAC) / 2 * S;
    return {
      top: top, bottom: bottom, h: h, slotW: slotW,
      iconBox: { w: 0.9 * slotW, h: h - 10 },
      x: x, w: STRIP_W_FRAC * S,
      bodyW: STRIP_BODY_FRAC * S, arrowW: STRIP_ARROW_FRAC * S, pad: STRIP_PAD,
      slotX0: x + STRIP_PAD
    };
  }

  // computeLayout(vw, vh, dpr, safe: {top, bottom}, opts: {coarse}) -> Layout (3.1 - 3.4).
  function computeLayout(vw, vh, dpr, safe, opts) {
    vw = Math.max(1, num(vw, 1));
    vh = Math.max(1, num(vh, 1));
    safe = safe || {};
    opts = opts || {};
    var safeTop = Math.max(0, num(safe.top, 0));
    var safeBottom = Math.max(0, num(safe.bottom, 0));
    var d = num(dpr, 1);
    if (!(d > 0)) d = 1;
    d = Math.min(d, DPR_MAX);

    var S = Math.min(vw, Math.round(STAGE_ASPECT * vh));
    var H = vh;
    var stageX = Math.round((vw - S) / 2);
    var needsPortrait = !!opts.coarse && vw > vh && vh < PORTRAIT_BLOCK_VH;

    // 1. HUD.
    var hud = computeHud(S, H, safeTop);
    var hudBottom = hud.bottom;

    // 2. Tier strip.
    var strip = computeStrip(S, H, safeBottom);
    var stripTop = strip.top;

    // 3. Table.
    var gap = 0.018 * H;
    var headroomY = hudBottom + HEADROOM * H;
    var kX = TABLE_FILL * S / TABLE_SPAN_U;
    var nearY = stripTop - gap - NEAR_PAD_U * kX;
    var farTarget = Math.max(headroomY, FAR_MIN_FRAC * H);
    var cNear = clamp((nearY - farTarget) / (DEPTH * F * kX), C_NEAR_MIN, C_NEAR_MAX);
    var farY = nearY - DEPTH * cNear * F * kX;

    // 4. Not enough room even at C_NEAR_MIN: shrink the table so the far edge sits at headroomY.
    if (cNear === C_NEAR_MIN && farY < headroomY) {
      kX = (stripTop - gap - headroomY) / (NEAR_PAD_U + DEPTH * C_NEAR_MIN * F);
      if (!(kX > KX_MIN)) kX = KX_MIN;
      nearY = stripTop - gap - NEAR_PAD_U * kX;
      farY = nearY - DEPTH * cNear * F * kX;
    }
    var A = cNear * F * kX;

    return {
      vw: vw, vh: vh, S: S, H: H,
      stage: { x: stageX, y: 0, w: S, h: H },
      safe: { top: safeTop, bottom: safeBottom },
      kX: kX, cNear: cNear, A: A, F: F,
      cx: stageX + S / 2,
      nearY: nearY, farY: farY,
      hud: hud, strip: strip,
      uiK: kX / UI_K_BASE,
      dpr: d,
      needsPortrait: needsPortrait
    };
  }

  // Screen Y of table row y (canvas px; stage.y is 0).
  function screenY(lay, y) { return lay.nearY - lay.A * (1 - scaleAt(y)); }

  function project(lay, x, y, out) {
    var o = out || {};
    o.X = lay.cx + (x - HALF_W) * lay.kX * scaleAt(y);
    o.Y = screenY(lay, y);
    return o;
  }

  // Exact table-plane ellipse of a circle (3.2): lowest pixel is Y(y + r) exactly.
  function footprint(lay, x, y, r, out) {
    var o = out || {};
    var s = scaleAt(y);
    var yFar = screenY(lay, y - r);
    var yNear = screenY(lay, y + r);
    o.X = lay.cx + (x - HALF_W) * lay.kX * s;
    o.Y = (yFar + yNear) / 2;
    o.rx = r * lay.kX * s;
    o.ry = (yNear - yFar) / 2;
    return o;
  }

  // c(y) = vScale / hScale = cNear * s(y).
  function ratioAt(lay, y) { return lay.cNear * scaleAt(y); }

  function unprojectX(lay, px, y) {
    return HALF_W + (px - lay.cx) / (lay.kX * scaleAt(y));
  }

  function unprojectY(lay, py) {
    return L + F - F / (1 - (lay.nearY - py) / lay.A);
  }

  // Removes the view zoom, then maps to the sim x at LAUNCH_Y.
  // Returns {x, sy}: sy is the un-zoomed screen y in stage px (for the zone tests of 3.6).
  function unprojectPointer(lay, view, px, py) {
    var zoom = view && num(view.zoom, 1) > 0 ? num(view.zoom, 1) : 1;
    var ax = view ? num(view.aboutX, 0) : 0;
    var ay = view ? num(view.aboutY, 0) : 0;
    var ux = ax + (px - ax) / zoom;
    var uy = ay + (py - ay) / zoom;
    return { x: unprojectX(lay, ux, LAUNCH_Y), sy: uy - lay.stage.y };
  }
  /* @pure-end */

  return {
    computeLayout: computeLayout,
    scaleAt: scaleAt,
    project: project,
    footprint: footprint,
    ratioAt: ratioAt,
    unprojectX: unprojectX,
    unprojectY: unprojectY,
    unprojectPointer: unprojectPointer,
    F: F
  };
});
