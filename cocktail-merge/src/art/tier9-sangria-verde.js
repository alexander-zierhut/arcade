// src/art/tier9-sangria-verde.js: the T9 Sangria Verde jug painter (DESIGN 4.3), registered as CM.art.tiers[9].
// Browser file (Canvas 2D only, Safari 15 safe). paint(ctx, h, opts) receives a ctx already in AUTHORING
// coordinates (R-units, base at y = +0.45, body rising toward negative y); h = {glass, garnish}.
// Green (jade liquid, lime, apple, grapes, mint) AND yellow (lemons, ribbon, handle highlight; the yellow-gold
// baked glow is added by sprites.js). opts.icon thickens the ribbon (0.16) and the handle highlight (0.07), 3.4.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var art = CM.art = CM.art || {};
  art.tiers = art.tiers || {};

  var TAU = Math.PI * 2;
  var GOLD = '#FFD23F', GOLD_EDGE = '#D9A400', GOLD_SHEEN = '#FFF0A0', HANDLE_HL = '#FFE45C';
  var LIQ = ['#B5EE8A', '#3DBE6E', '#0F8A5F'], SURFACE = '#D4F7B0';
  var SPOUT_X = -0.95, SPOUT_Y = -1.8, RIM_Y = -1.75, RIM_RX = 0.84;
  // Handle: quadratic (0.85,-1.4) -> (0.85,-0.2), control (1.71,-0.8); highlight offset outward.
  var HANDLE = [0.85, -1.4, 1.71, -0.8, 0.85, -0.2], HANDLE_HI = [0.89, -1.38, 1.75, -0.8, 0.89, -0.22];

  function rad(d) { return d * Math.PI / 180; }

  /** Right side of the pitcher (the left mirrors it except for the spout). */
  function jugProfile(g) {
    return g.profile(0.78, 0.45, [['Q', 0.95, 0.15, 0.95, -0.4], ['Q', 0.95, -1.0, 0.78, -1.55],
      ['Q', 0.78, -1.68, RIM_RX, RIM_Y]]);
  }
  /** Outer jug subpath: right side, back of the rim, the spout lip, left side, front of the bottom ellipse. */
  function traceJug(c, g) {
    var kr = g.K_RIM * RIM_RX;
    c.moveTo(0.78, 0.45);
    c.quadraticCurveTo(0.95, 0.15, 0.95, -0.4); c.quadraticCurveTo(0.95, -1.0, 0.78, -1.55);
    c.quadraticCurveTo(0.78, -1.68, RIM_RX, RIM_Y);
    c.ellipse(0, RIM_Y, RIM_RX, kr, 0, 0, -rad(165), true);
    c.quadraticCurveTo(-0.9, -1.84, SPOUT_X, SPOUT_Y);
    c.quadraticCurveTo(-0.80, -1.72, -0.78, -1.55);
    c.quadraticCurveTo(-0.95, -1.0, -0.95, -0.4); c.quadraticCurveTo(-0.95, 0.15, -0.78, 0.45);
    c.ellipse(0, 0.45, 0.78, g.K_BASE * 0.78, 0, Math.PI, 0, true);
    c.closePath();
  }

  /** Rim (step 6) with the spout: back half alpha 0.5, front half and lower lip edge alpha 0.9. */
  function rimWithSpout(ctx, g) {
    var kr = g.K_RIM * RIM_RX;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 0.07;
    ctx.beginPath(); ctx.moveTo(RIM_RX, RIM_Y); ctx.ellipse(0, RIM_Y, RIM_RX, kr, 0, 0, -rad(165), true);
    ctx.quadraticCurveTo(-0.9, -1.84, SPOUT_X, SPOUT_Y);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(SPOUT_X, SPOUT_Y); ctx.quadraticCurveTo(-0.86, -1.72, -RIM_RX * Math.cos(rad(15)), RIM_Y + kr * Math.sin(rad(15)));
    ctx.ellipse(0, RIM_Y, RIM_RX, kr, 0, rad(165), 0, true);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
    ctx.restore();
  }

  function liquidGradient(ctx, top, bottom) {
    var gr = ctx.createLinearGradient(0, bottom, 0, top);
    gr.addColorStop(0, LIQ[2]); gr.addColorStop(0.5, LIQ[1]); gr.addColorStop(1, LIQ[0]);
    return gr;
  }

  /** Green-apple cube: flesh #F4F8D0 faces with skin #7CC242 on the top-right edge. */
  function appleCube(ctx, x, y, s, rot) {
    var k = s * 0.22, L = -s / 2, T = -s / 2, R = s / 2, B = s / 2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rad(rot)); ctx.lineJoin = 'round';
    ctx.lineWidth = s * 0.05; ctx.strokeStyle = 'rgba(120,150,60,0.6)';
    ctx.beginPath(); ctx.rect(L, T + k, s - k, s - k); ctx.fillStyle = '#F4F8D0'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(L, T + k); ctx.lineTo(L + k, T); ctx.lineTo(R, T); ctx.lineTo(R - k, T + k); ctx.closePath();
    ctx.fillStyle = '#7CC242'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(R - k, T + k); ctx.lineTo(R, T); ctx.lineTo(R, B - k); ctx.lineTo(R - k, B); ctx.closePath();
    ctx.fillStyle = '#E3EDB0'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(L + s * 0.12, T + k + s * 0.12); ctx.lineTo(L + s * 0.12, B - s * 0.15);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = s * 0.07; ctx.lineCap = 'round'; ctx.stroke();
    ctx.restore();
  }
  /** Green grape r: #C9E86B with shade #8DBF3A and a white highlight dot. */
  function grape(ctx, x, y, r) {
    var gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    gr.addColorStop(0, '#E4F7A6'); gr.addColorStop(0.45, '#C9E86B'); gr.addColorStop(1, '#8DBF3A');
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = 'rgba(100,140,30,0.6)'; ctx.lineWidth = r * 0.12; ctx.stroke();
    ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.38, r * 0.24, 0, TAU); ctx.fillStyle = '#FFFFFF'; ctx.fill();
  }
  /** A leaf floating flat on the liquid surface (foreshortened vertically). */
  function floatingLeaf(ctx, gn, x, y, ang) {
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.55);
    gn.leaf(ctx, 0, 0, 0.3, 0.15, ang, gn.PAL.mint);
    ctx.restore();
  }

  /** Step 4: fruit, ice and bubbles under a 15 % liquid wash, then the surface veil and floating bits. */
  function contents(ctx, info, g, gn) {
    var f = info.fill, rx = info.surfaceRx, ry = g.K_RIM * rx, PAL = gn.PAL, rnd = info.rnd;
    ctx.save(); ctx.globalAlpha *= 0.9;
    grape(ctx, -0.62, 0.14, 0.08); grape(ctx, -0.49, 0.22, 0.08); grape(ctx, 0.62, -0.62, 0.08); grape(ctx, 0.2, 0.27, 0.08);
    appleCube(ctx, 0.56, 0.08, 0.2, 15); appleCube(ctx, -0.08, -0.72, 0.2, -10); appleCube(ctx, -0.66, -0.5, 0.19, 25);
    gn.iceCube(ctx, -0.12, -0.3, 0.3, 12);
    gn.iceCube(ctx, 0.66, -1.12, 0.26, -14);
    gn.citrusWheel(ctx, 0.5, -0.92, 0.28, 20, PAL.lime, 8, { squash: 0.8 });
    gn.citrusWheel(ctx, -0.36, 0.02, 0.28, -30, PAL.lime, 8, { squash: 0.9 });
    gn.citrusWheel(ctx, -0.42, -0.84, 0.32, 10, PAL.lemon, 8, { squash: 0.92 });
    gn.citrusWheel(ctx, 0.4, -0.33, 0.32, -15, PAL.lemon, 8, { squash: 0.86 });
    gn.citrusWheel(ctx, 0.12, 0.12, 0.32, 40, PAL.lemon, 8, { squash: 0.72 });
    ctx.restore();
    ctx.save(); ctx.globalAlpha *= 0.15;                             // the 15 % liquid-colour wash
    ctx.beginPath(); ctx.moveTo(rx, f); ctx.ellipse(0, f, rx, ry, 0, 0, -Math.PI, true);
    ctx.lineTo(-rx - 0.3, 1.2); ctx.lineTo(rx + 0.3, 1.2); ctx.closePath();
    ctx.fillStyle = liquidGradient(ctx, f, info.bottom); ctx.fill();
    ctx.restore();
    gn.bubbles(ctx, 9, { x0: -0.7, y0: -0.95, x1: 0.7, y1: 0.3 }, rnd);
    ctx.beginPath(); g.ellipsePath(ctx, 0, f, rx, ry);                // surface veil over what pokes up
    ctx.fillStyle = 'rgba(212,247,176,0.4)'; ctx.fill();
    ctx.save(); ctx.lineCap = 'round';
    ctx.beginPath(); g.halfEllipse(ctx, 0, f, rx, ry, 'front');
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.035; ctx.stroke();
    ctx.restore();
    gn.iceCube(ctx, -0.16, f + 0.06, 0.3, -8);                        // floating cube, half under
    ctx.save(); ctx.translate(-0.16, f + 0.06); ctx.rotate(rad(-8));    // its submerged half, tinted
    ctx.beginPath(); ctx.rect(-0.16, 0.01, 0.32, 0.16); ctx.fillStyle = 'rgba(61,190,110,0.4)'; ctx.fill();
    ctx.restore();
    floatingLeaf(ctx, gn, -0.42, f - 0.02, -105);
    floatingLeaf(ctx, gn, 0.22, f + 0.1, 70);
  }

  /** Step 7 for the jug: strong band x -0.78..-0.60 (alpha 0.6), belly reflection arc (0.5), sparkle dot. */
  function jugHighlights(ctx, g, info) {
    var pts = [], arc = [], i, y;
    for (i = 0; i <= 14; i++) { y = -1.22 + 1.35 * i / 14; pts.push([-(info.hw(y) - 0.22), y]); }
    g.streak(ctx, pts, 0.14, 0.6);
    for (i = 0; i <= 12; i++) { y = -0.78 + 0.85 * i / 12; arc.push([info.hw(y) - 0.15 - 0.05 * Math.sin(Math.PI * i / 12), y]); }
    g.streak(ctx, arc, 0.07, 0.5);
    ctx.beginPath(); g.ellipsePath(ctx, -0.56, -1.56, 0.1, 0.1); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
    g.sparkle(ctx, -0.56, -1.56, 0.11, 0.95);
  }

  function quadPoint(q, t) {
    var u = 1 - t;
    return [u * u * q[0] + 2 * u * t * q[2] + t * t * q[4], u * u * q[1] + 2 * u * t * q[3] + t * t * q[5]];
  }
  /** Closed subpath of a quadratic stroke of width w (offset polylines), so glass.edge can outline it. */
  function traceQuadBand(c, q, w) {
    var n = 24, i, t, p, d, len, L = [], R = [];
    for (i = 0; i <= n; i++) {
      t = i / n; p = quadPoint(q, t);
      d = [2 * (1 - t) * (q[2] - q[0]) + 2 * t * (q[4] - q[2]), 2 * (1 - t) * (q[3] - q[1]) + 2 * t * (q[5] - q[3])];
      len = Math.sqrt(d[0] * d[0] + d[1] * d[1]) || 1;
      L.push([p[0] - d[1] / len * w / 2, p[1] + d[0] / len * w / 2]);
      R.push([p[0] + d[1] / len * w / 2, p[1] - d[0] / len * w / 2]);
    }
    c.moveTo(L[0][0], L[0][1]);
    for (i = 1; i <= n; i++) c.lineTo(L[i][0], L[i][1]);
    for (i = n; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
    c.closePath();
  }

  /** The C-shaped glass handle (tint, edge, outline), then its yellow highlight along the outer curve. */
  function handle(ctx, g, icon) {
    var band = function (c) { traceQuadBand(c, HANDLE, 0.14); };
    ctx.save();
    ctx.beginPath(); ctx.rect(-4, -6, 8, 10); traceJug(ctx, g); ctx.clip('evenodd');   // outside the jug only
    g.fillBody(ctx, band, 1.4);
    g.edge(ctx, band);
    var q = HANDLE.slice(); q[0] -= 0.03; q[2] -= 0.03; q[4] -= 0.03;
    ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.quadraticCurveTo(q[2], q[3], q[4], q[5]);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.025; ctx.lineCap = 'round'; ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(HANDLE_HI[0], HANDLE_HI[1]);
    ctx.quadraticCurveTo(HANDLE_HI[2], HANDLE_HI[3], HANDLE_HI[4], HANDLE_HI[5]);
    ctx.globalAlpha *= 0.9; ctx.strokeStyle = HANDLE_HL; ctx.lineWidth = icon ? 0.07 : 0.04; ctx.stroke();
    ctx.restore();
  }

  /** Neck ribbon: the band between two front half-ellipses (upper y0/rx0, lower y1/rx1), folds, sheen. */
  function ribbon(ctx, g, icon) {
    var K = g.K_RIM, y0 = icon ? -1.48 : -1.45, r0 = icon ? 0.80 : 0.81, y1 = icon ? -1.32 : -1.35, r1 = 0.84, gr;
    function band(c) {
      c.moveTo(-r0, y0); c.ellipse(0, y0, r0, K * r0, 0, Math.PI, 0, true);
      c.lineTo(r1, y1); c.ellipse(0, y1, r1, K * r1, 0, 0, Math.PI, false); c.closePath();
    }
    ctx.save();
    ctx.beginPath(); band(ctx); ctx.fillStyle = GOLD; ctx.fill();
    ctx.save(); ctx.clip();
    gr = ctx.createLinearGradient(-0.84, 0, 0.84, 0);                  // wraps round the neck
    gr.addColorStop(0, 'rgba(170,110,0,0.45)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.12)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(170,110,0,0.5)');
    ctx.fillStyle = gr; ctx.fillRect(-1, -1.9, 2, 1.2);
    ctx.strokeStyle = 'rgba(217,164,0,0.75)'; ctx.lineWidth = 0.014; ctx.lineCap = 'round';   // folds
    [-0.62, -0.3, 0.05, 0.62].forEach(function (x, i) {
      var t0 = Math.sqrt(Math.max(0, 1 - (x / r0) * (x / r0))), t1 = Math.sqrt(Math.max(0, 1 - (x / r1) * (x / r1)));
      ctx.beginPath(); ctx.moveTo(x, y0 + K * r0 * t0); ctx.lineTo(x + (i % 2 ? 0.04 : -0.04), y1 + K * r1 * t1); ctx.stroke();
    });
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, -1.40, 0.82, K * 0.82, 0, Math.PI * 0.94, Math.PI * 0.06, true);   // sheen
    ctx.strokeStyle = GOLD_SHEEN; ctx.lineWidth = icon ? 0.035 : 0.022; ctx.lineCap = 'round'; ctx.stroke();
    ctx.lineWidth = 0.018; ctx.strokeStyle = GOLD_EDGE;
    ctx.beginPath(); g.halfEllipse(ctx, 0, y0, r0, K * r0, 'front'); ctx.stroke();
    ctx.beginPath(); g.halfEllipse(ctx, 0, y1, r1, K * r1, 'front'); ctx.stroke();
    ctx.restore();
  }

  /** A ribbon tail along a quadratic from (x0,y0) to (x1,y1), width w, ending in a V notch. */
  function tail(ctx, x0, y0, cx, cy, x1, y1, w) {
    var q = [x0, y0, cx, cy, x1, y1], n = 10, i, t, p, d, len, L = [], R = [], end, dir;
    for (i = 0; i <= n; i++) {
      t = i / n; p = quadPoint(q, t);
      d = [2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx), 2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy)];
      len = Math.sqrt(d[0] * d[0] + d[1] * d[1]) || 1; dir = [d[0] / len, d[1] / len];
      var hw = w / 2 * (0.85 + 0.25 * t);
      L.push([p[0] - dir[1] * hw, p[1] + dir[0] * hw]); R.push([p[0] + dir[1] * hw, p[1] - dir[0] * hw]);
    }
    end = [x1 - dir[0] * 0.05, y1 - dir[1] * 0.05];
    ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
    for (i = 1; i <= n; i++) ctx.lineTo(L[i][0], L[i][1]);
    ctx.lineTo(end[0], end[1]);
    for (i = n; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
    ctx.closePath();
    ctx.fillStyle = GOLD; ctx.fill();
    ctx.strokeStyle = GOLD_EDGE; ctx.lineWidth = 0.014; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); p = quadPoint(q, 0.15); ctx.moveTo(p[0], p[1]);
    for (i = 3; i <= 8; i++) { p = quadPoint(q, i / 10); ctx.lineTo(p[0], p[1]); }
    ctx.strokeStyle = 'rgba(255,240,160,0.8)'; ctx.lineWidth = 0.014; ctx.stroke();
  }
  /** One bow loop (length l, width w) from the knot along angle a (degrees). */
  function loop(ctx, x, y, a, l, w) {
    var h = w / 2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rad(a));
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(l * 0.3, -h * 1.7, l * 1.1, -h * 1.4, l, 0);
    ctx.bezierCurveTo(l * 1.1, h * 1.4, l * 0.3, h * 1.7, 0, 0); ctx.closePath();
    ctx.fillStyle = GOLD; ctx.fill();
    ctx.strokeStyle = GOLD_EDGE; ctx.lineWidth = 0.014; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(l * 0.62, h * 0.05, l * 0.26, h * 0.42, 0, 0, TAU);   // inner fold
    ctx.fillStyle = 'rgba(217,164,0,0.6)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(l * 0.15, -h * 0.55); ctx.quadraticCurveTo(l * 0.6, -h * 1.15, l * 0.95, -h * 0.45);
    ctx.strokeStyle = GOLD_SHEEN; ctx.lineWidth = 0.016; ctx.lineCap = 'round'; ctx.stroke();
    ctx.restore();
  }
  /**
   * The bow. 4.3 places it at (0.30, -1.40) with tails to (0.18, -1.00) / (0.48, -1.05), but the ribbon front
   * at x = 0.30 lies lower (front half-ellipse), so the whole bow is shifted down by dy to sit on the ribbon.
   */
  function bow(ctx, g) {
    var bx = 0.30, by = -1.40 + g.K_RIM * 0.82 * Math.sqrt(1 - (bx / 0.82) * (bx / 0.82)), dy = by + 1.40;
    loop(ctx, bx, by, -145, 0.22, 0.14);
    loop(ctx, bx, by, -35, 0.22, 0.14);
    ctx.beginPath(); ctx.arc(bx, by, 0.06, 0, TAU); ctx.fillStyle = GOLD; ctx.fill();
    ctx.strokeStyle = GOLD_EDGE; ctx.lineWidth = 0.016; ctx.stroke();
    ctx.beginPath(); ctx.arc(bx - 0.015, by - 0.018, 0.022, 0, TAU); ctx.fillStyle = GOLD_SHEEN; ctx.fill();
    tail(ctx, bx - 0.025, by + 0.035, bx - 0.12, by + 0.2, 0.18, -1.00 + dy, 0.075);
    tail(ctx, bx + 0.025, by + 0.035, bx + 0.12, by + 0.18, 0.48, -1.05 + dy, 0.075);
  }

  function paint(ctx, h, opts) {
    var g = h.glass, gn = h.garnish, icon = !!(opts && opts.icon), P = jugProfile(g);
    g.paint(ctx, {
      profile: P, tier: 9, path: function (c) { traceJug(c, g); },
      liquid: { fill: -1.35, colors: LIQ, surface: SURFACE },
      condensation: 6, rim: false, highlights: false,
      back: function (c) { gn.citrusWedge(c, 0.80, -1.80, 0.24, 28, gn.PAL.lime); },          // step 1
      contents: function (c, info) { contents(c, info, g, gn); },                          // step 4
      front: function (c, info) {
        rimWithSpout(c, g);                                                                 // step 6
        jugHighlights(c, g, info);                                                          // step 7
        gn.citrusWheel(c, 0.55, -1.95, 0.32, 12, gn.PAL.lemon, 8);                          // step 8
        c.save(); c.beginPath(); c.arc(0.55, -1.95, 0.32, 0, TAU); c.clip();               // rim through the slot
        c.globalAlpha *= 0.45; g.rim(c, RIM_Y, RIM_RX, 'back'); c.restore();
        gn.sprig(c, -0.2, -2.0, [-40, 0, 40], 0.3, 0.15, gn.PAL.mint);
        handle(c, g, icon);
        ribbon(c, g, icon);
        bow(c, g);
      }
    }, opts);
  }

  art.tiers[9] = {
    key: '#0F8A5F',
    accent: GOLD,
    paint: paint,
    particles: [{ shape: 'wedge', color: '#FFE45C' }, { shape: 'wedge', color: '#A6DB4F' },
      { shape: 'circle', color: '#C9E86B' }, { shape: 'leaf', color: '#2E9E4F' }],
    // Live jug sparkles (3.8) sit on the two highlight points; ANCHOR coordinates (authoring y - 0.45), R-units.
    sparkles: [[-0.56, -2.01], [0.75, -0.8]]
  };
  if (typeof module === 'object' && module && module.exports) module.exports = art.tiers[9];
})(typeof globalThis !== 'undefined' ? globalThis : this);
