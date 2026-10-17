// src/art/garnish.js: reusable garnish and contents helpers of DESIGN 4.2, plus the fruit palettes.
// Browser file (Canvas 2D only, Safari 15 safe). Sets CM.art.garnish. All sizes are R-units; all angles
// are DEGREES (as in 4.3); every helper saves and restores the ctx state it changes.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var art = CM.art = CM.art || {};
  var glass = art.glass;               // loaded earlier (5.1 script order)
  var shade = glass.shade, rad = glass.rad;
  var TAU = Math.PI * 2;

  /** Fruit and leaf palettes (4.2). Citrus: {rind, pith, flesh, seg}; leaves: {dark, light, vein}. */
  var PAL = {
    lime:   { rind: '#3F8F2A', pith: '#EAF7C8', flesh: '#A6DB4F', seg: '#D8F28A' },
    orange: { rind: '#E86A00', pith: '#FFE3B3', flesh: '#FF9F1C', seg: '#FFC85C' },
    lemon:  { rind: '#E8C21A', pith: '#FFF7CC', flesh: '#FFE45C', seg: '#FFF0A0' },
    mint:   { dark: '#2E9E4F', light: '#5FD27A', vein: '#8FD99A' },
    leaf:   { dark: '#3E9B3A', light: '#5BBE4A', vein: '#9BDB86' }   // palm-leaf tokens (4.1), e.g. T8
  };

  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(r, 1e-4), 0, TAU); }
  function begin(ctx, x, y, rot, o) {
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rad(rot));
    if (o && o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    if (o && o.squash) ctx.scale(1, o.squash);
  }
  function leafPal(pal) {
    return typeof pal === 'string' ? { dark: pal, light: shade(pal, 0.25), vein: shade(pal, 0.5) } : (pal || PAL.mint);
  }

  /**
   * Citrus wheel seen face-on: rind 0.16r, pith 0.07r, flesh with juicy segments, segment lines 0.05r,
   * centre dot. (x, y) centre, r radius, rot degrees, pal a citrus palette (PAL.lime/orange/lemon),
   * nSeg segments (default 8). o (optional): {alpha, squash: y-scale for a tilted wheel, e.g. 0.6}.
   */
  function citrusWheel(ctx, x, y, r, rot, pal, nSeg, o) {
    var n = nSeg || 8, rf = r * 0.77, i, a, a0, a1;
    begin(ctx, x, y, rot, o);
    circle(ctx, 0, 0, r); ctx.fillStyle = pal.rind; ctx.fill();
    ctx.lineWidth = r * 0.035; ctx.strokeStyle = shade(pal.rind, -0.35); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.92, rad(195), rad(285));
    ctx.lineCap = 'round'; ctx.lineWidth = r * 0.05; ctx.strokeStyle = shade(pal.rind, 0.4); ctx.stroke();
    circle(ctx, 0, 0, r * 0.84); ctx.fillStyle = pal.pith; ctx.fill();
    for (i = 0; i < n; i++) {                      // juicy segments: radial gradient seg -> flesh
      a0 = TAU * i / n + rad(4); a1 = TAU * (i + 1) / n - rad(4);
      var gr = ctx.createRadialGradient(0, 0, rf * 0.15, 0, 0, rf);
      gr.addColorStop(0, pal.seg); gr.addColorStop(0.7, pal.flesh); gr.addColorStop(1, shade(pal.flesh, -0.08));
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, rf, a0, a1); ctx.closePath();
      ctx.fillStyle = gr; ctx.fill();
      a = (a0 + a1) / 2;                          // juice sacs: two light flecks per segment
      ctx.fillStyle = shade(pal.seg, 0.35, 0.75);
      ctx.beginPath(); ctx.ellipse(Math.cos(a) * rf * 0.62, Math.sin(a) * rf * 0.62, rf * 0.12, rf * 0.05, a, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(Math.cos(a) * rf * 0.36, Math.sin(a) * rf * 0.36, rf * 0.07, rf * 0.03, a, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = pal.pith; ctx.lineWidth = r * 0.05; ctx.lineCap = 'round';
    for (i = 0; i < n; i++) {
      a = TAU * i / n;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * rf, Math.sin(a) * rf); ctx.stroke();
    }
    circle(ctx, 0, 0, r * 0.09); ctx.fillStyle = pal.pith; ctx.fill();
    circle(ctx, -r * 0.3, -r * 0.3, r * 0.22); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();
    ctx.restore();
  }

  /**
   * Citrus wedge: a half-disc sector of the wheel. At rot 0 the straight cut edge is on top (y = 0) and
   * the rind arc hangs below, as when perched on a rim. (x, y) = centre of the cut edge; nSeg default 4.
   * o (optional): {alpha}.
   */
  function citrusWedge(ctx, x, y, r, rot, pal, nSeg, o) {
    var n = nSeg || 4, rf = r * 0.77, i, a;
    begin(ctx, x, y, rot, o);
    ctx.beginPath(); ctx.arc(0, r * 0.06, r, 0, Math.PI); ctx.closePath();          // rind depth
    ctx.fillStyle = shade(pal.rind, -0.25); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI); ctx.closePath();
    ctx.fillStyle = pal.rind; ctx.fill();
    ctx.lineWidth = r * 0.035; ctx.strokeStyle = shade(pal.rind, -0.35); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.84, 0, Math.PI); ctx.closePath(); ctx.fillStyle = pal.pith; ctx.fill();
    var gr = ctx.createRadialGradient(0, 0, rf * 0.1, 0, 0, rf);
    gr.addColorStop(0, pal.seg); gr.addColorStop(0.75, pal.flesh); gr.addColorStop(1, shade(pal.flesh, -0.08));
    ctx.beginPath(); ctx.arc(0, 0, rf, 0, Math.PI); ctx.closePath(); ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = pal.pith; ctx.lineWidth = r * 0.05; ctx.lineCap = 'round';
    for (i = 1; i < n; i++) {
      a = Math.PI * i / n;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * rf, Math.sin(a) * rf); ctx.stroke();
    }
    ctx.fillStyle = shade(pal.seg, 0.35, 0.75);
    for (i = 0; i < n; i++) {
      a = Math.PI * (i + 0.5) / n;
      ctx.beginPath(); ctx.ellipse(Math.cos(a) * rf * 0.58, Math.sin(a) * rf * 0.58, rf * 0.13, rf * 0.05, a, 0, TAU); ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(-r * 0.97, 0); ctx.lineTo(r * 0.97, 0);              // cut-edge sheen
    ctx.lineWidth = r * 0.06; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.stroke();
    ctx.restore();
  }

  /**
   * Almond leaf from two quadratics, with a light right half, a midrib and side veins. (x, y) = stalk end,
   * len length, w full width, ang degrees: 0 points straight up, positive turns clockwise. pal = a leaf
   * palette {dark, light, vein} (PAL.mint, PAL.leaf) or one colour string. o (optional): {alpha}.
   */
  function leaf(ctx, x, y, len, w, ang, pal, o) {
    var p = leafPal(pal), i, t;
    begin(ctx, x, y, ang, o);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-w, -len * 0.45, 0, -len); ctx.quadraticCurveTo(w, -len * 0.45, 0, 0);
    ctx.fillStyle = p.dark; ctx.fill();
    ctx.lineWidth = Math.max(0.008, w * 0.06); ctx.strokeStyle = shade(p.dark, -0.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(w, -len * 0.45, 0, -len); ctx.closePath();
    ctx.fillStyle = p.light; ctx.fill();
    ctx.strokeStyle = p.vein; ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(0.01, w * 0.09);
    ctx.beginPath(); ctx.moveTo(0, len * 0.05); ctx.quadraticCurveTo(w * 0.08, -len * 0.5, 0, -len * 0.92); ctx.stroke();
    ctx.lineWidth = Math.max(0.006, w * 0.05); ctx.globalAlpha *= 0.7;
    for (i = 1; i <= 3; i++) {
      t = -len * (0.2 + 0.2 * i);
      ctx.beginPath(); ctx.moveTo(0, t + len * 0.04); ctx.lineTo(-w * 0.28, t - len * 0.06);
      ctx.moveTo(0, t + len * 0.04); ctx.lineTo(w * 0.28, t - len * 0.06); ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Sprig: one leaf per angle in `angs` (degrees, 0 = up), all from (x, y), each len x w, plus a short stalk.
   * Example (T5): sprig(ctx, -0.3, -1.85, [-60, -20, 20, 60], 0.35, 0.16, PAL.mint).
   */
  function sprig(ctx, x, y, angs, len, w, pal) {
    var p = leafPal(pal);
    ctx.save(); ctx.strokeStyle = shade(p.dark, -0.2); ctx.lineWidth = Math.max(0.015, w * 0.18); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len * 0.45); ctx.stroke(); ctx.restore();
    angs.forEach(function (a, i) { leaf(ctx, x, y, len * (i % 2 ? 1 : 0.88), w, a, p); });
  }

  /**
   * Cherry: glossy body of radius r in colour col, highlight dot r 0.25r at (-0.35r, -0.35r), stem
   * #5B3A1A curving up 1.6r. o (optional): {stem: false to omit, stemDir: -1 to curve the stem left, alpha}.
   */
  function cherry(ctx, x, y, r, col, o) {
    o = o || {};
    var dir = o.stemDir || 1;
    begin(ctx, x, y, 0, o);
    if (o.stem !== false) {
      ctx.beginPath(); ctx.moveTo(0, -r * 0.75);
      ctx.quadraticCurveTo(-dir * r * 0.15, -r * 1.9, dir * r * 0.55, -r * 2.4);
      ctx.strokeStyle = '#5B3A1A'; ctx.lineWidth = r * 0.13; ctx.lineCap = 'round'; ctx.stroke();
    }
    var gr = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r * 1.05);
    gr.addColorStop(0, shade(col, 0.3)); gr.addColorStop(0.55, col); gr.addColorStop(1, shade(col, -0.4));
    ctx.beginPath(); ctx.moveTo(0, -r * 0.78);
    ctx.bezierCurveTo(r * 0.45, -r * 1.1, r * 1.05, -r * 0.6, r * 0.98, 0);
    ctx.arc(0, 0, r * 0.98, 0, Math.PI);
    ctx.bezierCurveTo(-r * 1.05, -r * 0.6, -r * 0.45, -r * 1.1, 0, -r * 0.78);
    ctx.fillStyle = gr; ctx.fill();
    circle(ctx, -r * 0.35, -r * 0.35, r * 0.25); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
    circle(ctx, r * 0.35, r * 0.4, r * 0.09); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
    ctx.restore();
  }

  function strawLeg(ctx, ax, ay, bx, by, w, base, stripe, phase, roundStart, openEnd) {
    var len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)), h = w / 2, s, gr;
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(Math.atan2(by - ay, bx - ax));
    function body() {
      ctx.beginPath();
      if (roundStart) { ctx.moveTo(0, h); ctx.arc(0, 0, h, Math.PI / 2, -Math.PI / 2); } else ctx.moveTo(0, -h);
      ctx.lineTo(len, -h); ctx.lineTo(len, h); ctx.lineTo(0, h); ctx.closePath();
    }
    body(); ctx.fillStyle = base; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = stripe;
    for (s = -w * 1.2 - phase; s < len + w; s += w * 1.2) {
      ctx.beginPath(); ctx.moveTo(s, -h); ctx.lineTo(s + w * 0.45, -h);
      ctx.lineTo(s + w * 0.45 - w * 0.6, h); ctx.lineTo(s - w * 0.6, h); ctx.closePath(); ctx.fill();
    }
    gr = ctx.createLinearGradient(0, -h, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.08)');
    gr.addColorStop(0.6, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = gr; ctx.fillRect(-h, -h, len + w, w);
    ctx.restore();
    body(); ctx.lineWidth = w * 0.1; ctx.strokeStyle = shade(base, -0.4, 0.8); ctx.lineJoin = 'round'; ctx.stroke();
    if (openEnd) {
      ctx.beginPath(); ctx.ellipse(len, 0, w * 0.2, h, 0, 0, TAU);
      ctx.fillStyle = shade(base, -0.5); ctx.fill();
      ctx.lineWidth = w * 0.1; ctx.strokeStyle = shade(base, 0.2); ctx.stroke();
    }
    ctx.restore();
    return len;
  }

  /**
   * Striped drinking straw from its low end (x0, y0) to its top (x1, y1), width w, colour base, diagonal
   * stripes of colour stripe every 1.2w, round low end and an open top (dark ellipse). bend (optional):
   * true = 30 deg, or degrees (positive = clockwise on screen): the top 30 % turns about the knee at 70 %,
   * with a ribbed joint. o (optional): {alpha}.
   */
  function straw(ctx, x0, y0, x1, y1, w, base, stripe, bend, o) {
    var b = bend === true ? 30 : (bend || 0);
    ctx.save(); if (o && o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    if (!b) { strawLeg(ctx, x0, y0, x1, y1, w, base, stripe, 0, true, true); ctx.restore(); return; }
    var kx = x0 + (x1 - x0) * 0.7, ky = y0 + (y1 - y0) * 0.7, c = Math.cos(rad(b)), s = Math.sin(rad(b));
    var dx = x1 - kx, dy = y1 - ky, ex = kx + dx * c - dy * s, ey = ky + dx * s + dy * c;
    var len = strawLeg(ctx, x0, y0, kx, ky, w, base, stripe, 0, true, false);
    strawLeg(ctx, kx, ky, ex, ey, w, base, stripe, -(len % (w * 1.2)), false, true);
    circle(ctx, kx, ky, w * 0.52); ctx.fillStyle = base; ctx.fill();
    ctx.lineWidth = w * 0.08; ctx.strokeStyle = shade(base, -0.3); ctx.stroke();
    for (var i = -1; i <= 1; i++) {                 // ribs across the joint
      var a = Math.atan2(y1 - y0, x1 - x0) + rad(b / 2) + Math.PI / 2, ox = Math.cos(a - Math.PI / 2) * i * w * 0.2;
      var oy = Math.sin(a - Math.PI / 2) * i * w * 0.2;
      ctx.beginPath(); ctx.moveTo(kx + ox - Math.cos(a) * w * 0.45, ky + oy - Math.sin(a) * w * 0.45);
      ctx.lineTo(kx + ox + Math.cos(a) * w * 0.45, ky + oy + Math.sin(a) * w * 0.45);
      ctx.lineWidth = w * 0.07; ctx.strokeStyle = shade(base, -0.25, 0.8); ctx.stroke();
    }
    ctx.restore();
  }

  /** Cocktail pick: a thin stick from (x0, y0) to (x1, y1) in col (default white) with a small ball end at (x1, y1). */
  function pick(ctx, x0, y0, x1, y1, col) {
    var c = col || '#FFFFFF';
    ctx.save(); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.strokeStyle = shade(c, -0.35); ctx.lineWidth = 0.05; ctx.stroke();
    ctx.strokeStyle = c; ctx.lineWidth = 0.03; ctx.stroke();
    circle(ctx, x1, y1, 0.045); ctx.fillStyle = c; ctx.fill();
    ctx.restore();
  }

  /**
   * Ice cube centred at (x, y), side s, rot degrees: front face rgba(255,255,255,0.40), lighter top face
   * alpha 0.65, a dimmer side face, edges rgba(255,255,255,0.85), an inner glint. o: {h: height (default s), alpha}.
   */
  function iceCube(ctx, x, y, s, rot, o) {
    var w = s, h = (o && o.h) || s, k = w * 0.18, t = h * 0.2, L = -w / 2, T = -h / 2, R = w / 2, B = h / 2;
    begin(ctx, x, y, rot, o);
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(0.015, s * 0.045); ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    function face(pts, fill) {
      ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
      for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.stroke();
    }
    face([L, T + t, R - k, T + t, R - k, B, L, B], 'rgba(255,255,255,0.40)');
    face([L, T + t, L + k, T, R, T, R - k, T + t], 'rgba(255,255,255,0.65)');
    face([R - k, T + t, R, T, R, B - t, R - k, B], 'rgba(255,255,255,0.26)');
    ctx.beginPath(); ctx.moveTo(L + w * 0.12, T + t + h * 0.12); ctx.lineTo(L + w * 0.12, B - h * 0.18);
    ctx.lineCap = 'round'; ctx.lineWidth = s * 0.07; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(L + w * 0.35, T + t + h * 0.3); ctx.lineTo(L + w * 0.55, T + t + h * 0.42);
    ctx.lineTo(L + w * 0.5, T + t + h * 0.6);
    ctx.lineWidth = s * 0.025; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke();
    ctx.restore();
  }

  /**
   * Crushed ice: n small irregular translucent quads scattered over region {x0, y0, x1, y1}, sizes
   * 0.08-0.16 (o.size overrides the max), using rnd (a glass.rngFor(tier) function) for placement.
   */
  function crushedIce(ctx, n, region, rnd, o) {
    var mx = (o && o.size) || 0.16, i, j, cx, cy, sz, a;
    ctx.save(); ctx.lineJoin = 'round';
    for (i = 0; i < n; i++) {
      cx = region.x0 + (region.x1 - region.x0) * rnd(); cy = region.y0 + (region.y1 - region.y0) * rnd();
      sz = mx * (0.5 + 0.5 * rnd()); a = rnd() * TAU;
      ctx.beginPath();
      for (j = 0; j < 4; j++) {
        var rr = sz * (0.6 + 0.4 * rnd()), aa = a + j * Math.PI / 2;
        if (j === 0) ctx.moveTo(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr);
        else ctx.lineTo(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr);
      }
      ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,' + (0.45 + 0.25 * rnd()) + ')'; ctx.fill();
      ctx.lineWidth = 0.015; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
    }
    ctx.restore();
  }

  /** n bubble rings (r 0.03-0.06, white alpha 0.6, tiny highlight) scattered over region {x0, y0, x1, y1} with rnd. */
  function bubbles(ctx, n, region, rnd) {
    var i, x, y, r;
    ctx.save();
    for (i = 0; i < n; i++) {
      x = region.x0 + (region.x1 - region.x0) * rnd(); y = region.y0 + (region.y1 - region.y0) * rnd();
      r = 0.03 + 0.03 * rnd();
      circle(ctx, x, y, r); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = Math.max(0.008, r * 0.3); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
      circle(ctx, x - r * 0.35, y - r * 0.35, r * 0.28); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
    }
    ctx.restore();
  }

  /**
   * n dots of radius r (number, or [rMin, rMax]) over region {x0, y0, x1, y1}, colours cycling through
   * cols (string or array). For salt, frost, sugar, cinnamon. With region {cx, cy, rx, ry, a0, a1}
   * (degrees; default the front half 0..180) the dots go along that ellipse arc instead, evenly spaced.
   */
  function specks(ctx, n, region, r, cols, rnd) {
    var c = typeof cols === 'string' ? [cols] : cols, i, x, y, rr, a;
    ctx.save();
    for (i = 0; i < n; i++) {
      if (region.rx !== undefined) {
        var a0 = region.a0 === undefined ? 0 : region.a0, a1 = region.a1 === undefined ? 180 : region.a1;
        a = rad(a0 + (a1 - a0) * (n === 1 ? 0.5 : i / (n - 1)));
        x = region.cx + Math.cos(a) * region.rx; y = region.cy + Math.sin(a) * region.ry;
      } else {
        x = region.x0 + (region.x1 - region.x0) * rnd(); y = region.y0 + (region.y1 - region.y0) * rnd();
      }
      rr = typeof r === 'number' ? r : r[0] + (r[1] - r[0]) * rnd();
      circle(ctx, x, y, rr); ctx.fillStyle = c[i % c.length]; ctx.fill();
    }
    ctx.restore();
  }

  art.garnish = {
    PAL: PAL, lime: PAL.lime, orange: PAL.orange, lemon: PAL.lemon, mint: PAL.mint, leafGreen: PAL.leaf,
    citrusWheel: citrusWheel, citrusWedge: citrusWedge, leaf: leaf, sprig: sprig, cherry: cherry,
    straw: straw, pick: pick, iceCube: iceCube, crushedIce: crushedIce, bubbles: bubbles, specks: specks,
    shade: shade, rad: rad
  };
  if (typeof module === 'object' && module && module.exports) module.exports = art.garnish;
})(typeof globalThis !== 'undefined' ? globalThis : this);
