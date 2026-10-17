// src/art/tier6-sunrise.js: the T6 Tequila Sunrise painter (DESIGN 4.3). A hurricane glass on a short stem
// with a red-to-orange-to-yellow layered drink, faint sunrise rays and ice near the top; garnished with an
// orange wheel slotted on the rim, a cherry on a white pick and a red/white straw.
// Browser file (Canvas 2D only, Safari 15 safe); registers CM.art.tiers[6].
// All numbers are R-units in authoring coordinates (base at y = +0.45, the glass rises toward negative y).
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var art = CM.art = CM.art || {};
  art.tiers = art.tiers || {};

  var RIM_Y = -1.75, RIM_RX = 0.90, FILL = -1.5;
  var STOPS = [[0, '#C81D3A'], [0.45, '#FF6A1A'], [1.0, '#FFD23F']], SURFACE = '#FFE57A';
  var STRAW = [-0.3, -0.8, -0.7, -2.3], STRAW_W = 0.12, STRAW_BASE = '#FFFFFF', STRAW_STRIPE = '#E63946';
  var WHEEL = [0.85, -1.8, 0.42], CHERRY = [0.5, -2.15, 0.16], PICK = [0.34, -1.56, 0.56, -2.36];

  /**
   * Outer hurricane outline (right side, bottom up): from the stem joint, a rounded bowl bottom passing
   * half-width 0.45 at +0.1, the bulge 0.95 at -0.4, the waist 0.66 at -1.15, the flared rim 0.90 at -1.75.
   */
  function outer(g) {
    return g.profile(0.08, 0.17, [
      ['C', 0.40, 0.14, 0.95, 0.0, 0.95, -0.40],
      ['C', 0.95, -0.70, 0.66, -0.88, 0.66, -1.15],
      ['C', 0.66, -1.42, 0.86, -1.55, RIM_RX, RIM_Y]
    ]);
  }
  /** The interior (outline inset by about 0.06, thicker glass at the bottom): the liquid clip. */
  function inner(g) {
    return g.profile(0.05, 0.08, [
      ['C', 0.36, 0.06, 0.89, -0.06, 0.89, -0.40],
      ['C', 0.89, -0.70, 0.60, -0.88, 0.60, -1.15],
      ['C', 0.60, -1.42, 0.80, -1.55, 0.84, RIM_Y]
    ]);
  }

  /** Region below the front half of the ellipse (0, y, rx, ry); adds a subpath only. */
  function belowFront(c, y, rx, ry) {
    c.moveTo(-3, y); c.lineTo(-rx, y); c.ellipse(0, y, rx, ry, 0, Math.PI, 0, true);
    c.lineTo(3, y); c.lineTo(3, 4); c.lineTo(-3, 4); c.closePath();
  }
  /** Region above the front half of the ellipse (0, y, rx, ry); adds a subpath only. */
  function aboveFront(c, y, rx, ry) {
    c.moveTo(-3, -5); c.lineTo(3, -5); c.lineTo(3, y); c.lineTo(rx, y);
    c.ellipse(0, y, rx, ry, 0, 0, Math.PI, false); c.lineTo(-3, y); c.closePath();
  }
  function clipped(c, trace, fn) { c.save(); c.beginPath(); trace(c); c.clip(); fn(); c.restore(); }
  function drawStraw(c, gn, alpha) {
    gn.straw(c, STRAW[0], STRAW[1], STRAW[2], STRAW[3], STRAW_W, STRAW_BASE, STRAW_STRIPE, false,
      alpha === undefined ? undefined : { alpha: alpha });
  }

  /** Steps 3-4: the layered drink, the straw inside, ice near the top and the sunrise rays. */
  function drink(c, g, gn, PI) {
    var rx = g.halfWidthAt(PI, FILL), ry = g.K_RIM * rx, i, a, L = 1.7;
    var trIn = function (cc) { g.traceBody(cc, PI); };
    function sub(cc) { belowFront(cc, FILL, rx, ry); }
    function air(cc) { aboveFront(cc, FILL, rx, ry); }
    g.liquid(c, trIn, { fill: FILL, surface: SURFACE, stops: STOPS, rx: rx, bottom: 0.1 });
    g.withClip(c, trIn, function () {
      // a warm glow where the grenadine meets the orange juice
      clipped(c, sub, function () {
        var gr = c.createLinearGradient(0, 0.1, 0, FILL);
        gr.addColorStop(0.3, 'rgba(255,120,60,0)'); gr.addColorStop(0.42, 'rgba(255,170,90,0.22)');
        gr.addColorStop(0.55, 'rgba(255,120,60,0)');
        c.fillStyle = gr; c.fillRect(-1.2, FILL, 2.4, 1.7);
      });
      // the straw: dimmed in the drink, full colour above the surface
      clipped(c, sub, function () { drawStraw(c, gn, 0.55); });
      clipped(c, air, function () { drawStraw(c, gn); });
      // three ice cubes near the top (left of the pick, right of the straw)
      gn.iceCube(c, -0.2, -1.38, 0.34, 14);
      gn.iceCube(c, 0.17, -1.42, 0.32, -12);
      gn.iceCube(c, -0.03, -1.6, 0.3, 30);
      // what is submerged takes a little of the drink's colour
      clipped(c, sub, function () {
        c.fillStyle = 'rgba(255,140,40,0.2)'; c.fillRect(-1.2, FILL, 2.4, 1.8);
      });
      // sunrise rays: 5 thin lines fanning +-35 deg from the bottom centre, white alpha 0.12, width 0.04
      clipped(c, sub, function () {
        c.lineCap = 'round'; c.lineWidth = 0.04; c.strokeStyle = 'rgba(255,255,255,0.12)';
        for (i = 0; i < 5; i++) {
          a = g.rad(-35 + 17.5 * i);
          c.beginPath(); c.moveTo(Math.sin(a) * 0.16, 0.06 - Math.cos(a) * 0.16);   // start just off the centre: no hot spot
          c.lineTo(Math.sin(a) * L, 0.06 - Math.cos(a) * L); c.stroke();
        }
      });
    });
  }

  /** The orange wheel slotted on the right rim: the part inside the glass sits behind the wall and front rim. */
  function slottedWheel(c, g, gn, trB) {
    var x = WHEEL[0], y = WHEEL[1], r = WHEEL[2], ry = g.K_RIM * RIM_RX;
    c.save(); c.beginPath(); c.arc(x + 0.03, y + 0.045, r, 0, Math.PI * 2);
    c.fillStyle = 'rgba(90,40,10,0.14)'; c.fill(); c.restore();
    gn.citrusWheel(c, x, y, r, 12, gn.PAL.orange, 8);
    c.save();
    c.beginPath(); c.arc(x, y, r + 0.02, 0, Math.PI * 2); c.clip();
    c.beginPath(); trB(c); c.clip();
    c.beginPath(); belowFront(c, RIM_Y, RIM_RX, ry); c.clip();
    c.fillStyle = 'rgba(220,245,255,0.38)'; c.fillRect(x - r - 0.1, y - r - 0.1, 2 * r + 0.2, 2 * r + 0.2);
    c.restore();
    c.save();
    c.beginPath(); c.arc(x, y, r + 0.05, 0, Math.PI * 2); c.clip();
    g.rim(c, RIM_Y, RIM_RX, 'front');
    c.restore();
  }

  /** Step 8: straw out of the glass, the slotted orange wheel, then the cherry on its pick. */
  function front(c, g, gn, info) {
    var ry = g.K_RIM * RIM_RX;
    clipped(c, function (cc) { aboveFront(cc, RIM_Y, RIM_RX, ry); }, function () { drawStraw(c, gn); });
    slottedWheel(c, g, gn, info.traceBody);
    gn.pick(c, PICK[0], PICK[1], PICK[2], PICK[3], '#FFFFFF');
    c.save(); c.beginPath(); c.arc(CHERRY[0] + 0.025, CHERRY[1] + 0.035, CHERRY[2], 0, Math.PI * 2);
    c.fillStyle = 'rgba(80,10,10,0.18)'; c.fill(); c.restore();
    gn.cherry(c, CHERRY[0], CHERRY[1], CHERRY[2], '#C3102F', { stem: false });
    // the pick passes through the cherry: redraw its tip above it
    gn.pick(c, 0.527, -2.24, PICK[2], PICK[3], '#FFFFFF');
  }

  function paint(ctx, h, opts) {
    var g = h.glass, gn = h.garnish, P = outer(g), PI = inner(g);
    return g.paint(ctx, {
      profile: P, tier: 6,
      stem: { top: 0.15, bottom: 0.43, w: 0.15 },
      foot: { y: 0.45, rx: 0.55 },
      liquid: null,                                   // drawn in contents, clipped to the true bowl interior
      contents: function (c) { drink(c, g, gn, PI); },
      condensation: 7,
      highlights: { left: [0.12, 0.82], right: [0.25, 0.7] },
      front: function (c, info) { front(c, g, gn, info); }
    }, opts);
  }

  art.tiers[6] = {
    key: 'sunrise', name: 'Tequila Sunrise', color: '#FF4F2E', paint: paint,
    // 4.3: orange and red droplets
    particles: [
      { shape: 'circle', color: '#FF8C1A' }, { shape: 'circle', color: '#FFB03A' },
      { shape: 'circle', color: '#E63946' }, { shape: 'circle', color: '#C81D3A' }
    ]
  };
  if (typeof module === 'object' && module && module.exports) module.exports = art.tiers[6];
})(typeof globalThis !== 'undefined' ? globalThis : this);
