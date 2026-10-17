// src/art/tier3-cosmo.js: the T3 Cosmopolitan painter (DESIGN 4.3), registered as CM.art.tiers[3].
// Browser file (Canvas 2D only, Safari 15 safe). paint(ctx, h, opts) receives a ctx that sprites.js has
// already put into AUTHORING coordinates (R-units, base at y = +0.45, the glass rises toward negative y);
// h = {glass: CM.art.glass, garnish: CM.art.garnish}; opts.icon selects icon mode (no T3 differences).
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var art = CM.art = CM.art || {};
  art.tiers = art.tiers || {};

  var KEY = '#FF5C8A';
  var RIM_Y = -1.05, RIM_RX = 0.95;
  var WHEEL = { x: 0.82, y: -1.05, r: 0.32, rot: 12, seg: 8 };
  var ZEST = '#FFA43A';

  /**
   * The lime wheel slotted onto the rim (4.3): inside the wheel's lower third, the bowl in front of the
   * fruit gets a glass-tint wash, then the glass edge and the front rim stroke are drawn again over it.
   */
  function slotOver(ctx, g, info, cx, cy, r) {
    var ry = g.K_RIM * info.rimRx;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.03, 0, Math.PI * 2); ctx.clip();
    ctx.beginPath(); ctx.rect(cx - r - 0.2, cy + r / 3, 2 * r + 0.4, r + 0.2); ctx.clip();
    ctx.save();
    ctx.beginPath(); info.traceBody(ctx); ctx.clip();
    ctx.beginPath(); ctx.moveTo(-info.rimRx - 2, info.rimY); ctx.lineTo(-info.rimRx, info.rimY);
    ctx.ellipse(0, info.rimY, info.rimRx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(info.rimRx + 2, info.rimY); ctx.lineTo(info.rimRx + 2, 2); ctx.lineTo(-info.rimRx - 2, 2); ctx.closePath();
    ctx.clip();
    ctx.fillStyle = g.COL.tint; ctx.fillRect(cx - r - 0.2, cy - r, 2 * r + 0.4, 2 * r + 0.4);
    ctx.fillStyle = 'rgba(255,170,200,0.22)'; ctx.fillRect(cx - r - 0.2, cy - r, 2 * r + 0.4, 2 * r + 0.4);
    ctx.restore();
    g.edge(ctx, info.traceBody);
    g.rim(ctx, info.rimY, info.rimRx, 'front');
    ctx.restore();
  }

  /**
   * Thin orange zest curl (#FFA43A, width 0.06) hooked over the left rim: it starts inside the rim at
   * (-0.55, -1.17), arches over the rim edge and coils down outside the bowl as a tightening spiral.
   * The strip narrows and darkens where it twists edge-on, so it reads as a peel, not a tube.
   */
  function zestCurl(ctx, g, w) {
    var pts = [], i, t, u, a, r, N = 26, M = 70, C = { x: -1.07, y: -0.82 };
    var p0 = { x: -0.55, y: -1.17 }, p1 = { x: -0.86, y: -1.28 }, p2 = { x: -1.0, y: -1.06 };
    for (i = 0; i <= N; i++) {
      t = i / N; u = 1 - t;
      pts.push({ x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y });
    }
    var a0 = Math.atan2(p2.y - C.y, p2.x - C.x), r0 = Math.sqrt((p2.x - C.x) * (p2.x - C.x) + (p2.y - C.y) * (p2.y - C.y));
    for (i = 1; i <= M; i++) {
      t = i / M; a = a0 + t * Math.PI * 2 * 1.3; r = r0 + (0.06 - r0) * Math.pow(t, 0.8);
      pts.push({ x: C.x + r * Math.cos(a), y: C.y + r * Math.sin(a) });
    }
    var n = pts.length - 1, tw = [];
    for (i = 0; i <= n; i++) {                       // twist: 0 = edge-on, 1 = flat toward the viewer
      tw.push(Math.abs(Math.cos(i / n * Math.PI * 5.5 + 0.4)));
    }
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    function pass(colorFn, widthFn) {
      for (i = 0; i < n; i++) {
        var k = (tw[i] + tw[i + 1]) / 2, taper = i > n - 8 ? 0.45 + 0.55 * (n - i) / 8 : (i < 3 ? 0.7 : 1);
        ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
        ctx.strokeStyle = colorFn(k); ctx.lineWidth = widthFn(k) * taper; ctx.stroke();
      }
    }
    pass(function () { return g.shade(ZEST, -0.45); }, function (k) { return w * (0.45 + 0.55 * k) + 0.022; });
    pass(function (k) { return g.shade(ZEST, -0.3 * (1 - k)); }, function (k) { return w * (0.45 + 0.55 * k); });
    pass(function (k) { return 'rgba(255,232,180,' + (0.75 * k) + ')'; }, function (k) { return w * 0.3 * k + 0.004; });
    ctx.restore();
  }

  /** 6 white frost dots along the front of the rim, each with a faint shadow so it reads on the glass. */
  function frost(ctx, gar, rnd) {
    var ry = 0.42 * RIM_RX;
    gar.specks(ctx, 6, { cx: 0.006, cy: RIM_Y + 0.016, rx: RIM_RX, ry: ry, a0: 28, a1: 142 }, 0.04,
      'rgba(150,40,80,0.25)', rnd);
    gar.specks(ctx, 6, { cx: 0, cy: RIM_Y, rx: RIM_RX, ry: ry, a0: 28, a1: 142 }, 0.035, '#FFFFFF', rnd);
  }

  /** A thin cone flare where the stem meets the bowl point and the foot, so the stem reads as one piece. */
  function stemFlares(ctx, g) {
    function tr(c) {
      c.moveTo(-0.04, 0.24); c.quadraticCurveTo(-0.045, 0.33, -0.13, 0.36);
      c.lineTo(0.13, 0.36); c.quadraticCurveTo(0.045, 0.33, 0.04, 0.24); c.closePath();
    }
    g.fillBody(ctx, tr, 0.13);
    ctx.save(); ctx.beginPath(); tr(ctx); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.02;
    ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
  }

  function paint(ctx, h, opts) {
    var g = h.glass, gar = h.garnish;
    var P = g.profile(0, -0.05, [['Q', 0.52, -0.20, RIM_RX, RIM_Y]]);
    return g.paint(ctx, {
      profile: P, tier: 3,
      stem: { top: -0.05, bottom: 0.35, w: 0.08 },
      foot: { y: 0.45, rx: 0.55 },
      liquid: { fill: -0.85, colors: ['#FF7AA2', '#D81B60'], surface: '#FF9DBB' },
      contents: function (c, info) {
        // a deeper glow in the point of the V and a few tiny bubbles
        var gr = c.createRadialGradient(0, -0.15, 0.01, 0, -0.15, 0.45);
        gr.addColorStop(0, 'rgba(150,0,50,0.35)'); gr.addColorStop(1, 'rgba(150,0,50,0)');
        c.fillStyle = gr; c.fillRect(-1, info.fill, 2, 1);
        gar.bubbles(c, 3, { x0: -0.3, y0: -0.7, x1: 0.25, y1: -0.35 }, info.rnd);
      },
      condensation: 5,
      highlights: { left: [0.3, 0.85], right: [0.4, 0.8], inset: 0.15 },
      front: function (c, info) {
        stemFlares(c, g);
        zestCurl(c, g, 0.06);
        frost(c, gar, info.rnd);
        gar.citrusWheel(c, WHEEL.x, WHEEL.y, WHEEL.r, WHEEL.rot, gar.PAL.lime, WHEEL.seg);
        slotOver(c, g, info, WHEEL.x, WHEEL.y, WHEEL.r);
      }
    }, opts);
  }

  art.tiers[3] = {
    key: KEY,
    name: 'Cosmopolitan',
    paint: paint,
    // Merge particles (4.3): droplets #FF5C8A / #FFB0C8.
    particles: [
      { shape: 'teardrop', color: '#FF5C8A' },
      { shape: 'teardrop', color: '#FFB0C8' }
    ]
  };
  if (typeof module === 'object' && module && module.exports) module.exports = art.tiers[3];
})(typeof globalThis !== 'undefined' ? globalThis : this);
