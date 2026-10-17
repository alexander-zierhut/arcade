// src/art/tier7-pinacolada.js: the T7 Pina Colada tiki mug painter (DESIGN 4.3), registered as CM.art.tiers[7].
// Browser file (Canvas 2D only, Safari 15 safe). paint(ctx, h, opts) receives a ctx already in AUTHORING
// coordinates (R-units, base at y = +0.45, body rising toward negative y); h = {glass, garnish}.
// The mug is opaque ceramic, not a profile glass, so it calls the glass helpers directly instead of glass.paint.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var art = CM.art = CM.art || {};
  art.tiers = art.tiers || {};

  var TAU = Math.PI * 2;
  var GLAZE_LIGHT = '#34C3B5', GLAZE_DARK = '#1E8A80', LIP = '#5FE0D2', CARVE = '#145E57';
  var FOAM = '#FFF6E0', FOAM_SHADE = '#F2E2BF', CINNAMON = '#C88A4A';
  var PINE = '#FFD54A', PINE_RIND = '#D9A21B', PINE_LEAF = '#3FA34D';
  var UMB_A = '#FF6FA8', UMB_B = '#FFD1E3', STICK = '#F5E6C8';

  // Mug body: half-widths 0.92 bottom (+0.45) / 0.95 belly / 0.85 top (-1.45), as a profile for the glass helpers.
  function mugProfile(g) {
    return g.profile(0.92, 0.45, [['Q', 0.96, 0.05, 0.95, -0.45], ['Q', 0.94, -1.0, 0.85, -1.45]]);
  }

  /** Rounded rectangle subpath (no beginPath). */
  function rrect(c, x, y, w, h, r) {
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  /**
   * A carved recess: the same shape shifted down 0.03 in the light glaze (the highlighted lower edge),
   * then the dark recess, then a soft inner shadow under its upper edge (y0..y1 = the shape's extent).
   */
  function carve(ctx, trace, y0, y1) {
    ctx.save(); ctx.translate(0, 0.03); ctx.beginPath(); trace(ctx); ctx.fillStyle = LIP; ctx.fill(); ctx.restore();
    ctx.beginPath(); trace(ctx); ctx.fillStyle = CARVE; ctx.fill();
    ctx.save(); ctx.clip();
    var gr = ctx.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, 'rgba(0,20,18,0.45)'); gr.addColorStop(0.45, 'rgba(0,20,18,0)');
    ctx.fillStyle = gr; ctx.fillRect(-1.2, y0 - 0.05, 2.4, y1 - y0 + 0.1);
    ctx.restore();
  }

  // Horizontal features follow the barrel: a line at base y bends up toward the sides.
  function bandY(x, base) {
    var t = Math.min(1, Math.abs(x) / 0.93);
    return base - 0.3 * (1 - Math.sqrt(1 - t * t));
  }
  /** Brow band at -1.05 with 6 zigzag teeth hanging below it. */
  function traceBrow(c) {
    var i, x, n = 24, step = 1.9 / 6;
    c.moveTo(-1.0, bandY(-1.0, -1.025));
    for (i = 0; i <= n; i++) { x = -0.98 + 1.96 * i / n; c.lineTo(x, bandY(x, -1.025)); }
    c.lineTo(1.0, bandY(1.0, -0.955));
    for (i = 6; i >= 1; i--) {
      x = -0.95 + step * i; c.lineTo(x, bandY(x, -0.955));
      x -= step / 2; c.lineTo(x, bandY(x, -0.885));
    }
    c.lineTo(-0.95, bandY(-0.95, -0.955)); c.lineTo(-1.0, bandY(-1.0, -0.955)); c.closePath();
  }
  function traceEyes(c) {
    c.moveTo(-0.13, -0.75); c.ellipse(-0.35, -0.75, 0.22, 0.15, 0, 0, TAU);
    c.moveTo(0.57, -0.75); c.ellipse(0.35, -0.75, 0.22, 0.15, 0, 0, TAU);
  }
  function traceNose(c) {
    c.moveTo(-0.07, -0.64); c.lineTo(0.07, -0.64);
    c.lineTo(0.17, -0.45); c.quadraticCurveTo(0.18, -0.42, 0.14, -0.42);
    c.lineTo(-0.14, -0.42); c.quadraticCurveTo(-0.18, -0.42, -0.17, -0.45); c.closePath();
  }
  function traceMouth(c) { rrect(c, -0.5, -0.36, 1.0, 0.22, 0.06); }
  /** Darker glaze ring around the foot of the mug (a turned base band). */
  function traceFootBand(c) {
    c.moveTo(-0.95, 0.3);
    c.ellipse(0, 0.3, 0.95, 0.46, 0, Math.PI, 0, true);
    c.lineTo(1.0, 1.2); c.lineTo(-1.0, 1.2); c.closePath();
  }

  function paintBody(ctx, g, P) {
    var trB = function (c) { g.traceBody(c, P); };
    var gr = ctx.createRadialGradient(-0.35, -0.6, 0.05, -0.35, -0.6, 1.55);
    gr.addColorStop(0, GLAZE_LIGHT); gr.addColorStop(0.55, '#2BAA9E'); gr.addColorStop(1, GLAZE_DARK);
    ctx.beginPath(); trB(ctx); ctx.fillStyle = gr; ctx.fill();
    g.withClip(ctx, trB, function () {
      var cyl = ctx.createLinearGradient(-0.95, 0, 0.95, 0);    // barrel shading: lit left, shaded right
      cyl.addColorStop(0, 'rgba(255,255,255,0.10)'); cyl.addColorStop(0.18, 'rgba(255,255,255,0)');
      cyl.addColorStop(0.62, 'rgba(0,30,28,0)'); cyl.addColorStop(1, 'rgba(0,30,28,0.32)');
      ctx.fillStyle = cyl; ctx.fillRect(-1.2, -2, 2.4, 3.2);
      ctx.beginPath(); traceFootBand(ctx); ctx.fillStyle = 'rgba(16,90,82,0.45)'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 0.3, 0.95, 0.46, 0, Math.PI * 0.97, Math.PI * 0.03, true);
      ctx.strokeStyle = 'rgba(95,224,210,0.55)'; ctx.lineWidth = 0.03; ctx.stroke();
      carve(ctx, traceBrow, -1.35, -0.9);
      carve(ctx, traceEyes, -0.9, -0.6);
      carve(ctx, traceNose, -0.64, -0.42);
      carve(ctx, traceMouth, -0.36, -0.14);
      paintFaceDetails(ctx);
      // ceramic highlight: a white alpha 0.35 vertical ellipse at (-0.6, -0.5), 0.10 x 0.55
      ctx.beginPath(); ctx.ellipse(-0.6, -0.5, 0.10, 0.55, 0, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(-0.61, -0.52, 0.05, 0.45, 0, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(0.74, -0.35, 0.03, 0.3, 0, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
    });
  }

  function paintFaceDetails(ctx) {
    var i, s, x;
    for (s = -1; s <= 1; s += 2) {                                     // glowing pupils
      ctx.beginPath(); ctx.arc(s * 0.33, -0.74, 0.09, 0, TAU); ctx.fillStyle = 'rgba(255,231,168,0.25)'; ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.33, -0.74, 0.05, 0, TAU); ctx.fillStyle = '#FFE7A8'; ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.33 - 0.015, -0.755, 0.015, 0, TAU); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    }
    for (i = 0; i < 4; i++) {                                          // 4 cream teeth
      x = -0.45 + i * 0.235;
      ctx.beginPath(); rrect(ctx, x, -0.33, 0.195, 0.16, 0.03); ctx.fillStyle = '#F3E6C8'; ctx.fill();
      ctx.beginPath(); rrect(ctx, x, -0.23, 0.195, 0.06, 0.03); ctx.fillStyle = 'rgba(160,130,80,0.25)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 0.04, -0.3); ctx.lineTo(x + 0.11, -0.3);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.02; ctx.lineCap = 'round'; ctx.stroke();
    }
  }

  /** The raised lip band just under the rim (front half), in the light glaze. */
  function paintLip(ctx) {
    ctx.beginPath(); ctx.moveTo(-0.85, -1.45);
    ctx.ellipse(0, -1.45, 0.85, 0.357, 0, Math.PI, 0, true);
    ctx.lineTo(0.875, -1.40); ctx.ellipse(0, -1.40, 0.875, 0.365, 0, 0, Math.PI, false); ctx.closePath();
    ctx.fillStyle = LIP; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -1.40, 0.875, 0.365, 0, Math.PI * 0.98, Math.PI * 0.02, true);
    ctx.strokeStyle = 'rgba(20,94,87,0.6)'; ctx.lineWidth = 0.025; ctx.stroke();
  }

  // Foam: a puffy dome (ellipse rx 0.86 ry 0.3 at -1.45 plus a 0.18 bulge) overflowing the lip by 0.05.
  function foamTop(x) {
    var t = Math.min(1, Math.abs(x) / 0.9), s = Math.sqrt(1 - t * t);
    var puff = 0.04 * Math.abs(Math.sin((x + 0.9) / 1.8 * Math.PI * 3.5));
    return -1.45 - 0.3 * s - 0.18 * s * s - puff;
  }
  function foamFront(x) {
    var t = Math.min(1, Math.abs(x) / 0.9), s = Math.sqrt(1 - t * t), d = 0;
    d += 0.11 * Math.exp(-Math.pow((x + 0.45) / 0.06, 2));            // three drips over the lip
    d += 0.07 * Math.exp(-Math.pow((x - 0.08) / 0.05, 2));
    d += 0.13 * Math.exp(-Math.pow((x - 0.52) / 0.055, 2));
    return -1.45 + 0.375 * s + d;
  }
  function traceFoam(c) {
    var i, n = 72, x;
    c.moveTo(-0.9, -1.45);
    for (i = 0; i <= n; i++) { x = -0.9 + 1.8 * i / n; c.lineTo(x, foamTop(x)); }
    for (i = n; i >= 0; i--) { x = -0.9 + 1.8 * i / n; c.lineTo(x, foamFront(x)); }
    c.closePath();
  }
  function paintFoam(ctx, gn, rnd) {
    ctx.beginPath(); traceFoam(ctx); ctx.fillStyle = FOAM; ctx.fill();
    ctx.save(); ctx.clip();
    var gr = ctx.createRadialGradient(-0.3, -1.78, 0.05, -0.1, -1.55, 1.0);
    gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.45, 'rgba(242,226,191,0)');
    gr.addColorStop(1, FOAM_SHADE);
    ctx.fillStyle = gr; ctx.fillRect(-1, -2.1, 2, 1.2);
    ctx.strokeStyle = 'rgba(214,190,140,0.55)'; ctx.lineWidth = 0.018; ctx.lineCap = 'round';
    [[-0.5, -1.62, 0.16], [0.05, -1.72, 0.2], [0.45, -1.55, 0.15], [-0.15, -1.38, 0.18], [0.3, -1.3, 0.12]]
      .forEach(function (b) {                                          // soft puff contours
        ctx.beginPath(); ctx.arc(b[0], b[1], b[2], Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
      });
    gn.specks(ctx, 6, { x0: -0.55, y0: -1.82, x1: 0.5, y1: -1.45 }, [0.025, 0.038], CINNAMON, rnd);
    ctx.restore();
    ctx.beginPath(); traceFoam(ctx); ctx.strokeStyle = 'rgba(200,170,120,0.55)'; ctx.lineWidth = 0.022; ctx.stroke();
  }

  /** Pineapple wedge at (x, y): flesh #FFD54A, crosshatched rind #D9A21B, 3 spiky leaves #3FA34D. */
  function pineapple(ctx, gn, x, y, rot) {
    var r = 0.52, cy = 0.32, a0 = -2.3, a1 = -0.84, i, a, gr;
    ctx.save(); ctx.translate(x, y); ctx.rotate(gn.rad(rot));
    [-28, 4, 34].forEach(function (ang, k) {                           // spiky leaves behind the rind
      gn.leaf(ctx, 0.06 + 0.07 * k, cy - r + 0.06, 0.42 + 0.08 * (k % 2), 0.11, ang, PINE_LEAF);
    });
    function sector(rr) { ctx.beginPath(); ctx.arc(0, cy, rr, a0, a1); ctx.arc(0, cy, 0.1, a1, a0, true); ctx.closePath(); }
    sector(r); ctx.fillStyle = PINE_RIND; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(150,100,10,0.55)'; ctx.lineWidth = 0.01;   // diamond crosshatch on the rind
    for (i = -9; i <= 9; i++) {
      ctx.beginPath(); ctx.moveTo(i * 0.09 - 0.35, -0.45); ctx.lineTo(i * 0.09 + 0.35, 0.25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * 0.09 + 0.35, -0.45); ctx.lineTo(i * 0.09 - 0.35, 0.25); ctx.stroke();
    }
    ctx.restore();
    gr = ctx.createRadialGradient(0, cy, 0.08, 0, cy, r * 0.88);
    gr.addColorStop(0, '#FFF4C2'); gr.addColorStop(0.3, '#FFE584'); gr.addColorStop(1, PINE);
    sector(r * 0.87); ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = 'rgba(240,180,40,0.45)'; ctx.lineWidth = 0.012; ctx.lineCap = 'round';   // flesh fibres
    for (i = 1; i < 9; i++) {
      a = a0 + (a1 - a0) * i / 9;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 0.16, cy + Math.sin(a) * 0.16);
      ctx.lineTo(Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, cy, 0.1, a0, a1); ctx.strokeStyle = '#FFF8D8'; ctx.lineWidth = 0.03; ctx.stroke();
    sector(r); ctx.strokeStyle = '#B98512'; ctx.lineWidth = 0.02; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, cy, r * 0.78, a0 + 0.12, a0 + 0.6);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 0.03; ctx.stroke();
    ctx.restore();
  }

  // Paper umbrella: canopy radius 0.7 centred (-0.35, -2.25), tilted 20 deg, 6 panels, stick into the foam.
  var UMB_X = -0.35, UMB_Y = -2.25, UMB_R = 0.7, UMB_ROT = -20;
  function umbrellaFrame(ctx, gn) { ctx.translate(UMB_X, UMB_Y); ctx.rotate(gn.rad(UMB_ROT)); }
  function umbrellaStick(ctx, gn) {
    ctx.save(); umbrellaFrame(ctx, gn); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -UMB_R - 0.1); ctx.lineTo(0, 0.82);
    ctx.strokeStyle = '#B9A47C'; ctx.lineWidth = 0.06; ctx.stroke();
    ctx.strokeStyle = STICK; ctx.lineWidth = 0.035; ctx.stroke();
    ctx.restore();
  }
  function meridian(c, xe, up) {
    var i, n = 10, p;
    for (i = 0; i <= n; i++) {
      p = (up ? n - i : i) / n * Math.PI / 2;
      c.lineTo(xe * Math.sin(p), -UMB_R * Math.cos(p));
    }
  }
  function umbrellaCanopy(ctx, gn) {
    var xs = [], i, w, gr;
    for (i = 0; i <= 6; i++) xs.push(-UMB_R * Math.cos(Math.PI * i / 6));
    ctx.save(); umbrellaFrame(ctx, gn); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    function panel(c, i) {
      w = xs[i + 1] - xs[i];
      c.moveTo(0, -UMB_R); meridian(c, xs[i], false);
      c.quadraticCurveTo((xs[i] + xs[i + 1]) / 2, 0.02 + 0.28 * w, xs[i + 1], 0);
      meridian(c, xs[i + 1], true); c.closePath();
    }
    for (i = 0; i < 6; i++) {
      ctx.beginPath(); panel(ctx, i); ctx.fillStyle = i % 2 ? UMB_B : UMB_A; ctx.fill();
    }
    ctx.beginPath(); for (i = 0; i < 6; i++) panel(ctx, i);
    ctx.save(); ctx.clip();
    gr = ctx.createRadialGradient(-0.25, -0.45, 0.05, 0, -0.2, 0.95);
    gr.addColorStop(0, 'rgba(255,255,255,0.45)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)');
    gr.addColorStop(1, 'rgba(120,10,50,0.22)');
    ctx.fillStyle = gr; ctx.fillRect(-0.8, -0.8, 1.6, 1);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.02;    // ribs
    for (i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, -UMB_R); meridian(ctx, xs[i], false); ctx.stroke(); }
    ctx.beginPath();                                                    // scalloped edge
    ctx.moveTo(xs[0], 0);
    for (i = 0; i < 6; i++) {
      w = xs[i + 1] - xs[i];
      ctx.quadraticCurveTo((xs[i] + xs[i + 1]) / 2, 0.02 + 0.28 * w, xs[i + 1], 0);
    }
    ctx.strokeStyle = '#D9478A'; ctx.lineWidth = 0.025; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xs[0], 0); meridian(ctx, xs[0], true); meridian(ctx, xs[6], false);
    ctx.strokeStyle = 'rgba(190,40,100,0.55)'; ctx.lineWidth = 0.02; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -UMB_R - 0.02, 0.045, 0, TAU); ctx.fillStyle = STICK; ctx.fill();
    ctx.strokeStyle = '#B9A47C'; ctx.lineWidth = 0.015; ctx.stroke();
    ctx.restore();
  }

  function paint(ctx, h) {   // (ctx, h, opts): T7 has no icon-mode variant
    var g = h.glass, gn = h.garnish, rnd = g.rngFor(7), P = mugProfile(g);
    umbrellaStick(ctx, gn);                                           // 1: back garnish (stick)
    paintBody(ctx, g, P);                                             // glaze, carved face, highlight
    paintLip(ctx);
    ctx.save(); ctx.beginPath(); g.traceBody(ctx, P);                // outline 0.06
    ctx.strokeStyle = CARVE; ctx.lineWidth = 0.06; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
    paintFoam(ctx, gn, rnd);                                          // top
    pineapple(ctx, gn, 0.66, -1.62, 24);                               // front garnish
    gn.cherry(ctx, 0.2, -1.75, 0.14, '#C3102F');
    umbrellaCanopy(ctx, gn);
  }

  art.tiers[7] = {
    key: '#2EB5A8',
    paint: paint,
    particles: [{ shape: 'square', color: PINE }, { shape: 'circle', color: FOAM }]
  };
  if (typeof module === 'object' && module && module.exports) module.exports = art.tiers[7];
})(typeof globalThis !== 'undefined' ? globalThis : this);
