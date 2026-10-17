// src/art/tier4-mojito.js: the T5 Mojito painter (DESIGN 4.3). A tall highball with a pale minty drink,
// ice cubes, lime wheels, muddled mint, bubbles and a crushed-ice heap, a green-striped straw and a mint sprig.
// Browser file (Canvas 2D only, Safari 15 safe); registers CM.art.tiers[4].
// All numbers are R-units in authoring coordinates (base at y = +0.45, the glass rises toward negative y).
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var art = CM.art = CM.art || {};
  art.tiers = art.tiers || {};

  var RIM_Y = -1.75, RIM_RX = 0.95, FILL = -1.45;
  var SUGAR = ['#E0A458', '#C27D38', '#9A5A26', '#74421A', '#F2C77E'];   // light -> dark brown sugar, crystal
  var STRAW = [0.25, -0.4, 0.55, -2.2], STRAW_W = 0.12, STRAW_BASE = '#FFFFFF', STRAW_STRIPE = '#2FA84F';

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

  /**
   * Brown sugar settled on the interior floor (inside the interior clip): a lumpy layer whose top edge
   * follows the floor's perspective (a front half-ellipse, higher in the middle where it is heaped),
   * a granular texture of grains in four browns with a few bright crystals, and muddled mint shreds.
   */
  function sugarLayer(c, g, gn, floorY, rnd) {
    var i, x, y, gr, rx = 0.86, n = 40;
    function topY(xx) {                                     // the sugar's top edge at x: a lumpy front arc
      var u = Math.max(0, 1 - (xx * xx) / (rx * rx));
      return floorY + 0.02 + 0.1 * Math.sqrt(u) + 0.022 * Math.sin(xx * 9 + 0.6) + 0.012 * Math.sin(xx * 19 + 2);
    }
    function edge(cc) {
      for (i = 0; i <= n; i++) { x = -rx + 2 * rx * i / n; if (i) cc.lineTo(x, topY(x)); else cc.moveTo(x, topY(x)); }
    }
    c.save();
    c.beginPath(); edge(c); c.lineTo(1.2, 1.2); c.lineTo(-1.2, 1.2); c.closePath(); c.clip();
    gr = c.createLinearGradient(0, floorY, 0, floorY + 0.45);
    gr.addColorStop(0, SUGAR[0]); gr.addColorStop(0.4, SUGAR[1]); gr.addColorStop(1, SUGAR[2]);
    c.fillStyle = gr; c.fillRect(-1.2, floorY - 0.3, 2.4, 1.2);
    gn.specks(c, 150, { x0: -0.9, y0: floorY - 0.02, x1: 0.9, y1: floorY + 0.48 }, [0.008, 0.018],
      [SUGAR[3], SUGAR[4], SUGAR[2], SUGAR[0], SUGAR[3], SUGAR[1]], rnd);
    for (i = 0; i < 6; i++) {                              // muddled (torn, darkened) mint bits in the sugar
      x = -0.62 + 1.24 * (i + rnd()) / 6; y = topY(x) + 0.07 + 0.12 * rnd();
      gn.leaf(c, x, y, 0.1 + 0.05 * rnd(), 0.06, rnd() * 360, { dark: '#24803F', light: '#3E9F55', vein: '#6CC07E' });
    }
    gn.specks(c, 14, { x0: -0.8, y0: floorY, x1: 0.8, y1: floorY + 0.4 }, 0.012, 'rgba(255,248,225,0.95)', rnd);
    c.restore();
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';   // the lit crust along the top, a darker line under it
    c.beginPath(); edge(c); c.strokeStyle = SUGAR[4]; c.lineWidth = 0.035; c.stroke();
    c.translate(0, 0.03); c.beginPath(); edge(c); c.strokeStyle = 'rgba(116,66,26,0.35)'; c.lineWidth = 0.015; c.stroke();
    c.restore();
    crust(c, topY, 16, rnd);
    gn.specks(c, 9, { x0: -0.6, y0: floorY - 0.45, x1: 0.6, y1: floorY - 0.06 }, [0.01, 0.016],
      ['rgba(194,125,56,0.8)', 'rgba(224,164,88,0.75)'], rnd);    // a few grains still sinking
    gr = c.createLinearGradient(0, floorY - 0.7, 0, floorY + 0.05);   // amber haze where the sugar dissolves
    gr.addColorStop(0, 'rgba(214,160,80,0)'); gr.addColorStop(1, 'rgba(214,160,80,0.2)');
    c.fillStyle = gr; c.fillRect(-1.2, floorY - 0.7, 2.4, 0.75);
    return topY;
  }
  /** n loose sugar grains piled along the layer's top edge topY(x) (also drawn over the muddled leaf stalks). */
  function crust(c, topY, n, rnd) {
    var i, x;
    for (i = 0; i < n; i++) {
      x = -0.8 + 1.6 * rnd();
      c.beginPath(); c.arc(x, topY(x) - 0.004 - 0.012 * rnd(), 0.012 + 0.008 * rnd(), 0, Math.PI * 2);
      c.fillStyle = SUGAR[i % 3]; c.fill();
    }
  }

  /** Step 4: everything inside the glass, back to front. */
  function contents(c, g, gn, info) {
    var rx = info.surfaceRx, ry = g.K_RIM * rx, rnd = info.rnd, mint = gn.PAL.mint;
    function sub(cc) { belowFront(cc, FILL, rx, ry); }
    function air(cc) { aboveFront(cc, FILL, rx, ry); }
    // the straw: dimmed where it is in the drink, full colour above the surface
    clipped(c, sub, function () { drawStraw(c, gn, 0.55); });
    clipped(c, air, function () { drawStraw(c, gn); });
    // brown sugar settled at the bottom, muddled with mint; lime wheels pressed against the glass
    var topY = sugarLayer(c, g, gn, info.bottom, rnd);
    gn.leaf(c, -0.48, 0.34, 0.35, 0.16, -62, mint, { alpha: 0.9 });
    gn.leaf(c, 0.05, 0.36, 0.35, 0.16, -18, mint, { alpha: 0.9 });
    gn.leaf(c, 0.52, 0.34, 0.35, 0.16, 48, mint, { alpha: 0.9 });
    crust(c, topY, 22, rnd);
    gn.citrusWheel(c, -0.36, -0.12, 0.28, 18, gn.PAL.lime, 8, { alpha: 0.9 });
    gn.citrusWheel(c, 0.42, -0.72, 0.28, -24, gn.PAL.lime, 8, { alpha: 0.9 });
    gn.leaf(c, -0.58, -1.02, 0.35, 0.16, 28, mint, { alpha: 0.9 });
    gn.leaf(c, 0.02, -1.08, 0.35, 0.16, -34, mint, { alpha: 0.9 });
    gn.leaf(c, 0.62, -1.0, 0.35, 0.16, -12, mint, { alpha: 0.9 });
    // three ice cubes floating near the top
    // (kept left of the straw, which is redrawn in front above the rim)
    gn.iceCube(c, -0.12, -0.94, 0.45, 26);
    gn.iceCube(c, -0.44, -1.3, 0.45, 11);
    gn.iceCube(c, 0.04, -1.37, 0.45, -9);
    // a light wash of the drink over what is submerged, so it reads as inside the liquid
    clipped(c, sub, function () {
      var gr = c.createLinearGradient(0, FILL, 0, info.bottom);
      gr.addColorStop(0, 'rgba(225,255,215,0.18)'); gr.addColorStop(1, 'rgba(150,220,140,0.24)');
      c.fillStyle = gr; c.fillRect(-1.2, FILL, 2.4, info.bottom - FILL + 0.4);
    });
    gn.bubbles(c, 10, { x0: -0.62, y0: -1.2, x1: 0.62, y1: 0.12 }, rnd);
    // crushed ice heaped above the surface to -1.6
    gn.crushedIce(c, 4, { x0: -0.52, y0: -1.58, x1: 0.18, y1: -1.47 }, rnd, { size: 0.2 });
  }

  /** Step 8: the straw where it rises out of the glass (above the front rim), then the mint sprig. */
  function front(c, g, gn) {
    var ry = g.K_RIM * RIM_RX;
    clipped(c, function (cc) { aboveFront(cc, RIM_Y, RIM_RX, ry); }, function () { drawStraw(c, gn); });
    gn.sprig(c, -0.3, -1.85, [-60, -20, 20, 60], 0.35, 0.16, gn.PAL.mint);
  }

  var VISUAL_SCALE = 0.86;   // owner: the highball looked too big next to its neighbours (collider unchanged)
  function paint(ctx, h, opts) {
    var g = h.glass, gn = h.garnish, info;
    ctx.save();
    ctx.translate(0, g.BASE_Y); ctx.scale(VISUAL_SCALE, VISUAL_SCALE); ctx.translate(0, -g.BASE_Y);
    info = g.paint(ctx, {
      profile: g.profile(0.88, 0.45, [['L', RIM_RX, RIM_Y]]), tier: 4, baseThick: 0.18,
      liquid: {
        fill: FILL, surface: '#E9FFE0',
        colors: ['rgba(220,255,210,0.85)', 'rgba(150,220,140,0.9)']
      },
      contents: function (c, info) { contents(c, g, gn, info); },
      condensation: 9,
      front: function (c) { front(c, g, gn); }
    }, opts);
    ctx.restore();
    return info;
  }

  art.tiers[4] = {
    key: 'mojito', name: 'Mojito', color: '#4CC97A', paint: paint,
    // 4.3: mint leaves and bubble rings
    particles: [
      { shape: 'leaf', color: '#2E9E4F' }, { shape: 'leaf', color: '#5FD27A' },
      { shape: 'ring', color: '#FFFFFF' }
    ]
  };
  if (typeof module === 'object' && module && module.exports) module.exports = art.tiers[4];
})(typeof globalThis !== 'undefined' ? globalThis : this);
