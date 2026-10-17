// src/art/tier2-oldfashioned.js: the T2 Old Fashioned painter (DESIGN 4.3), registered as CM.art.tiers[2].
// Browser file (Canvas 2D only, Safari 15 safe). paint(ctx, h, opts) receives a ctx that sprites.js has
// already put into AUTHORING coordinates (R-units, base at y = +0.45, the glass rises toward negative y);
// h = {glass: CM.art.glass, garnish: CM.art.garnish}; opts.icon selects icon mode (no T2 differences).
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var art = CM.art = CM.art || {};
  art.tiers = art.tiers || {};

  var KEY = '#B3561C';
  var FILL = -0.35;
  var CUBE = { x: -0.05, y: -0.2, w: 0.9, h: 0.85, rot: 8 };
  var CHERRY = { x: -0.4, y: 0.15, r: 0.15, col: '#B3122E' };
  var SUBMERGED = 'rgba(160,70,20,0.35)';
  var PEEL = '#FF8C1A', PEEL_EDGE = '#FFC066', PEEL_PITH = '#FFE3B3';
  // Peel helix axis (x0, y0, x1, y1): from the right rim, where the peel hooks over the lip, down the
  // outside of the wall. The 4.3 axis (0.6, -0.95) -> (1.0, -0.28) left two disconnected curls in mid-air.
  var PEEL_AX = [0.84, -0.84, 1.0, -0.3];

  /** The step-7 sparkle dot, on the front wall below the rim (white r 0.05 with a faint halo). */
  function wallSparkle(ctx, g, P) {
    var y = -0.2, x = -(g.halfWidthAt(P, y) - 0.3);
    ctx.beginPath(); g.ellipsePath(ctx, x, y, 0.1, 0.1); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
    ctx.beginPath(); g.ellipsePath(ctx, x, y, 0.05, 0.05); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
  }

  /**
   * Five crystal-cut facet lines on the lower 35 % of the tumbler (white alpha 0.25, width 0.02). Each line
   * runs from the front of the base ellipse up to the top of the cut zone, following the taper, with a faint
   * lit facet beside it so the cut glass catches light.
   */
  function facets(ctx, g, P) {
    var y0 = P.y0, y1 = P.y0 + (P.rimY - P.y0) * 0.35, k = g.K_BASE, i, f, xb, yb, xt, yt, hb = g.halfWidthAt(P, y0),
      ht = g.halfWidthAt(P, y1), F = [-0.8, -0.4, 0, 0.4, 0.8];
    ctx.save(); ctx.lineCap = 'round';
    for (i = 0; i < F.length; i++) {
      f = F[i];
      xb = f * hb; yb = y0 + k * hb * Math.sqrt(1 - f * f) - 0.02;
      xt = f * ht; yt = y1 + k * ht * Math.sqrt(1 - f * f);
      if (i < F.length - 1) {                       // a faint lit facet between this line and the next
        var f2 = F[i + 1];
        ctx.beginPath(); ctx.moveTo(xb, yb); ctx.lineTo(xt, yt);
        ctx.lineTo(f2 * ht, y1 + k * ht * Math.sqrt(1 - f2 * f2));
        ctx.lineTo(f2 * hb, y0 + k * hb * Math.sqrt(1 - f2 * f2) - 0.02); ctx.closePath();
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(40,60,80,0.04)'; ctx.fill();
      }
      ctx.beginPath(); ctx.moveTo(xb, yb); ctx.lineTo(xt, yt);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.02; ctx.stroke();
    }
    ctx.beginPath();                                // the top of the cut zone, a front arc
    ctx.ellipse(0, y1, ht, k * ht, 0, Math.PI * 0.12, Math.PI * 0.88);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.02; ctx.stroke();
    ctx.restore();
  }

  /** Adds the rotated cube outline (front rect) and the cherry body as subpaths, for the submerged wash. */
  function cubeAndCherryPath(ctx) {
    var a = CUBE.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), hw = CUBE.w / 2, hh = CUBE.h / 2;
    var pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], i;
    for (i = 0; i < 4; i++) {
      var x = CUBE.x + pts[i][0] * c - pts[i][1] * s, y = CUBE.y + pts[i][0] * s + pts[i][1] * c;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.moveTo(CHERRY.x + CHERRY.r, CHERRY.y); ctx.arc(CHERRY.x, CHERRY.y, CHERRY.r, 0, Math.PI * 2);
  }

  /** Step 4: the big ice cube poking 0.3 above the surface, the cherry at the bottom, the submerged wash. */
  function contents(ctx, h, info) {
    var gar = h.garnish;
    gar.iceCube(ctx, CUBE.x, CUBE.y, CUBE.w, CUBE.rot, { h: CUBE.h });
    gar.cherry(ctx, CHERRY.x, CHERRY.y, CHERRY.r, CHERRY.col, { stemDir: -1 });
    ctx.save();                                     // everything under the surface line is seen through whiskey
    ctx.beginPath(); ctx.rect(-2, info.fill, 4, 3); ctx.clip();
    ctx.beginPath(); cubeAndCherryPath(ctx); ctx.fillStyle = SUBMERGED; ctx.fill();
    ctx.restore();
    ctx.save();                                     // waterline where the cube breaks the surface
    ctx.beginPath(); cubeAndCherryPath(ctx); ctx.clip();
    ctx.beginPath(); ctx.moveTo(-1, info.fill + 0.01); ctx.lineTo(1, info.fill + 0.01);
    ctx.strokeStyle = 'rgba(255,214,160,0.75)'; ctx.lineWidth = 0.025; ctx.stroke();
    ctx.restore();
  }

  /**
   * Orange-peel spiral ribbon (4.3 T2): a flat helical strip of width w whose axis runs from (ax0, ay0) to
   * (ax1, ay1), making `turns` turns. Back-facing runs show the pale pith and are drawn first; front-facing
   * runs are orange with light edges and a sheen line.
   */
  function peel(ctx, g, ax0, ay0, ax1, ay1, turns, R0, R1, w) {
    var N = 120, pts = [], i, t, th, R, ww, c, k = g.K_RIM;
    for (i = 0; i <= N; i++) {
      t = i / N; th = turns * Math.PI * 2 * t - Math.PI * 0.35;
      R = R0 + (R1 - R0) * t;
      ww = w * (t < 0.06 ? 0.5 + 0.5 * t / 0.06 : t > 0.9 ? 0.3 + 0.7 * (1 - t) / 0.1 : 1);
      pts.push({
        x: ax0 + (ax1 - ax0) * t + R * Math.sin(th), y: ay0 + (ay1 - ay0) * t + k * R * Math.cos(th),
        w: ww, c: Math.cos(th)
      });
    }
    function quad(a, b) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - a.w / 2); ctx.lineTo(b.x, b.y - b.w / 2);
      ctx.lineTo(b.x, b.y + b.w / 2); ctx.lineTo(a.x, a.y + a.w / 2); ctx.closePath();
    }
    function edgeSeg(a, b, f) { ctx.moveTo(a.x, a.y + f * a.w); ctx.lineTo(b.x, b.y + f * b.w); }
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // 1. the inner (pith) side, seen where the strip turns away from the viewer: drawn first, darker
    for (i = 0; i < N; i++) {
      c = (pts[i].c + pts[i + 1].c) / 2;
      if (c > 0) continue;
      quad(pts[i], pts[i + 1]);
      ctx.fillStyle = ctx.strokeStyle = g.shade(PEEL_PITH, -0.12 - 0.22 * (1 + c));
      ctx.lineWidth = 0.04; ctx.fill(); ctx.stroke();   // wide stroke: no gaps where the strip turns edge-on
    }
    ctx.beginPath();
    for (i = 0; i < N; i++) if (pts[i].c + pts[i + 1].c <= 0) { edgeSeg(pts[i], pts[i + 1], -0.5); edgeSeg(pts[i], pts[i + 1], 0.5); }
    ctx.strokeStyle = g.shade(PEEL, -0.4); ctx.lineWidth = 0.016; ctx.stroke();
    // 2. the outer (zest) side facing the viewer: orange, darker where it turns edge-on
    for (i = 0; i < N; i++) {
      c = (pts[i].c + pts[i + 1].c) / 2;
      if (c <= 0) continue;
      quad(pts[i], pts[i + 1]);
      ctx.fillStyle = ctx.strokeStyle = g.shade(PEEL, -0.28 * (1 - c));
      ctx.lineWidth = 0.04; ctx.fill(); ctx.stroke();   // wide stroke: no gaps where the strip turns edge-on
    }
    ctx.beginPath();
    for (i = 0; i < N; i++) if (pts[i].c + pts[i + 1].c > 0) { edgeSeg(pts[i], pts[i + 1], -0.5); edgeSeg(pts[i], pts[i + 1], 0.5); }
    ctx.strokeStyle = g.shade(PEEL, -0.38); ctx.lineWidth = 0.016; ctx.stroke();
    ctx.beginPath();                                // light edge #FFC066 along the upper edge, a sheen in the middle
    for (i = 0; i < N; i++) if (pts[i].c + pts[i + 1].c > 0.3) edgeSeg(pts[i], pts[i + 1], -0.3);
    ctx.strokeStyle = PEEL_EDGE; ctx.lineWidth = 0.028; ctx.stroke();
    ctx.beginPath();
    for (i = 0; i < N; i++) if (pts[i].c + pts[i + 1].c > 1.2) edgeSeg(pts[i], pts[i + 1], 0.02);
    ctx.strokeStyle = 'rgba(255,236,190,0.5)'; ctx.lineWidth = 0.016; ctx.stroke();
    for (i = 5; i < N - 5; i += 7) {                // zest pores on the front faces
      if (pts[i].c < 0.35) continue;
      ctx.beginPath(); g.ellipsePath(ctx, pts[i].x + 0.01, pts[i].y + 0.035, 0.011, 0.011);
      ctx.fillStyle = 'rgba(205,95,0,0.6)'; ctx.fill();
    }
    ctx.restore();
  }

  function paint(ctx, h, opts) {
    var g = h.glass, gar = h.garnish;
    var P = g.profile(0.85, 0.45, [['L', 0.95, -0.75]]);
    return g.paint(ctx, {
      profile: P, tier: 2, baseThick: 0.22, baseFill: g.COL.block,
      liquid: { fill: FILL, colors: ['#B35A1E', '#8C3F10'], surface: '#D9803A' },
      contents: function (c, info) { contents(c, h, info); },
      condensation: 4,
      // streaks stop below the front rim; the sparkle dot moves onto the front wall (at 88 % of the height it
      // sat above the front rim, over the open mouth, and read as a droplet crossing the rim)
      highlights: { left: [0.14, 0.68], right: [0.28, 0.62], sparkle: false },
      front: function (c, info) {
        facets(c, g, info.P);
        wallSparkle(c, g, info.P);
        peel(c, g, PEEL_AX[0], PEEL_AX[1], PEEL_AX[2], PEEL_AX[3], 2.5, 0.17, 0.1, 0.12);
      }
    }, opts);
  }

  art.tiers[2] = {
    key: KEY,
    name: 'Old Fashioned',
    paint: paint,
    // Merge particles (4.3): orange peel curls and ice chips #EAF7FF.
    particles: [
      { shape: 'leaf', color: '#FF8C1A' },
      { shape: 'square', color: '#EAF7FF' }
    ]
  };
  if (typeof module === 'object' && module && module.exports) module.exports = art.tiers[2];
})(typeof globalThis !== 'undefined' ? globalThis : this);
