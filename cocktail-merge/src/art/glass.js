// src/art/glass.js: the shared glass recipe of DESIGN 4.2, the anchor transform and the sprite bounds table.
// Browser file (Canvas 2D only, Safari 15 safe). Sets CM.art.glass. Everything is in R-units
// (1.0 = collider radius) and AUTHORING coordinates: base at y = +0.45, the body rises toward negative y.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var art = CM.art = CM.art || {};
  var VIEW = (CM.config && CM.config.VIEW) || {};

  var BASE_Y = 0.45, EDGE_W = 0.06, OUTLINE_W = 0.035, INSET = 0.06;
  var K_BASE = VIEW.K_BASE || 0.55, K_RIM = VIEW.K_RIM || 0.42;
  var COL = {
    tint: 'rgba(220,245,255,0.28)', edge: 'rgba(255,255,255,0.85)', outline: 'rgba(40,60,80,0.35)',
    block: 'rgba(230,250,255,0.5)'
  };
  // Sprite bounds (4.2): anchor coordinates x in [-1.45, 1.45], y in [-TOPA[t], +0.6]; T8/T9 add 0.2 glow padding.
  var TOPA = [0, 1.95, 1.85, 1.95, 2.50, 2.10, 2.90, 3.55, 2.75, 2.75];   // T4 Mojito highball (x0.86), T5 Margarita coupe (x1.08)
  var X_HALF = 1.45, Y_BOTTOM = 0.6, GLOW_PAD = 0.2;

  /** Seeded RNG (mulberry32). Returns a function giving floats in [0, 1). */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** The per-tier pattern RNG of 4.2: mulberry32(1000 + tier). Create a fresh one per paint call. */
  function rngFor(tier) { return mulberry32(1000 + tier); }
  /** Degrees to radians. */
  function rad(deg) { return deg * Math.PI / 180; }

  function parseColor(c) {
    var m;
    if (c.charAt(0) === '#') {
      var h = c.slice(1);
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      var n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
    }
    m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return [128, 128, 128, 1];
    var p = m[1].split(',');
    return [+p[0], +p[1], +p[2], p.length > 3 ? +p[3] : 1];
  }
  /**
   * Mixes a colour toward white (amt > 0) or black (amt < 0); amt in [-1, 1]. Accepts #rgb, #rrggbb,
   * rgb() or rgba(); returns 'rgba(r,g,b,a)'. `alpha` (optional) replaces the alpha.
   */
  function shade(color, amt, alpha) {
    var c = parseColor(color), t = amt < 0 ? 0 : 255, k = Math.min(1, Math.abs(amt));
    var out = [0, 1, 2].map(function (i) { return Math.round(c[i] + (t - c[i]) * k); });
    return 'rgba(' + out.join(',') + ',' + (alpha === undefined ? c[3] : alpha) + ')';
  }

  // ---- Sprite cache geometry (used by sprites.js) ----
  /** Cache resolution of 4.2: device px per R-unit, min(220, ceil(R*kX*dpr*1.15)). */
  function cacheRp(R, kX, dpr) { return Math.min(220, Math.ceil(R * kX * dpr * 1.15)); }
  /** Sprite rect in R-units for tier t: {ax, ay, w, h, pad}; (ax, ay) is the anchor offset from the top-left. */
  function spriteBox(t) {
    var pad = t >= 8 ? GLOW_PAD : 0;
    return { ax: X_HALF + pad, ay: TOPA[t] + pad, w: 2 * X_HALF + 2 * pad, h: TOPA[t] + Y_BOTTOM + 2 * pad, pad: pad };
  }
  /**
   * The anchor transform. With the ctx origin already on the anchor pixel, scales to R-units (rp px per R)
   * and shifts into authoring coordinates (translate(0, -0.45)), so painters can use the 4.3 numbers as is.
   */
  function applyAnchor(ctx, rp) { ctx.scale(rp, rp); ctx.translate(0, -BASE_Y); }

  // ---- Profiles: a glass outline as its right side, from the bottom up to the rim ----
  function sampleSeg(sx, sy, s, xs, ys) {
    var n = s[0] === 'L' ? 1 : 24, i, t, u;
    for (i = 1; i <= n; i++) {
      t = i / n; u = 1 - t;
      if (s[0] === 'L') { xs.push(s[1]); ys.push(s[2]); }
      else if (s[0] === 'Q') {
        xs.push(u * u * sx + 2 * u * t * s[1] + t * t * s[3]);
        ys.push(u * u * sy + 2 * u * t * s[2] + t * t * s[4]);
      } else {
        xs.push(u * u * u * sx + 3 * u * u * t * s[1] + 3 * u * t * t * s[3] + t * t * t * s[5]);
        ys.push(u * u * u * sy + 3 * u * u * t * s[2] + 3 * u * t * t * s[4] + t * t * t * s[6]);
      }
    }
  }
  /**
   * Builds a Profile: the right half of a symmetric glass, starting at the bottom (x0, y0) and rising to
   * the rim. segs: ['L', x, y] | ['Q', cx, cy, x, y] | ['C', c1x, c1y, c2x, c2y, x, y]; y must decrease.
   * The last point is the rim (half-width rimRx at rimY). Returns {x0, y0, segs, xs, ys, rimRx, rimY}.
   */
  function profile(x0, y0, segs) {
    var xs = [x0], ys = [y0], sx = x0, sy = y0;
    segs.forEach(function (s) {
      sampleSeg(sx, sy, s, xs, ys);
      sx = s[s.length - 2]; sy = s[s.length - 1];
    });
    return { x0: x0, y0: y0, segs: segs, xs: xs, ys: ys, rimRx: sx, rimY: sy };
  }
  /** Outer half-width of profile P at height y (clamped to the bottom / rim widths outside its range). */
  function halfWidthAt(P, y) {
    var xs = P.xs, ys = P.ys, i, t;
    if (y >= ys[0]) return xs[0];
    for (i = 0; i < ys.length - 1; i++) {
      if (y <= ys[i] && y >= ys[i + 1]) {
        t = ys[i] === ys[i + 1] ? 1 : (ys[i] - y) / (ys[i] - ys[i + 1]);
        return xs[i] + (xs[i + 1] - xs[i]) * t;
      }
    }
    return xs[xs.length - 1];
  }
  /** Adds an ellipse subpath (no beginPath). */
  function ellipsePath(ctx, x, y, rx, ry) {
    ctx.moveTo(x + rx, y);
    ctx.ellipse(x, y, Math.max(rx, 1e-4), Math.max(ry, 1e-4), 0, 0, Math.PI * 2);
  }
  /** Adds half an ellipse as an open subpath: part 'front' (lower half) or 'back' (upper half). */
  function halfEllipse(ctx, x, y, rx, ry, part) {
    rx = Math.max(rx, 1e-4); ry = Math.max(ry, 1e-4);
    if (part === 'front') { ctx.moveTo(x - rx, y); ctx.ellipse(x, y, rx, ry, 0, Math.PI, 0, true); }
    else { ctx.moveTo(x + rx, y); ctx.ellipse(x, y, rx, ry, 0, 0, -Math.PI, true); }
  }
  /**
   * Adds the closed outer body subpath of P (no beginPath): right side, back half of the rim ellipse
   * (ry = K_RIM*rx), mirrored left side, front half of the bottom ellipse (ry = K_BASE*x0).
   */
  function traceBody(ctx, P) {
    var segs = P.segs, i, s, px, py;
    ctx.moveTo(P.x0, P.y0);
    segs.forEach(function (q) {
      if (q[0] === 'L') ctx.lineTo(q[1], q[2]);
      else if (q[0] === 'Q') ctx.quadraticCurveTo(q[1], q[2], q[3], q[4]);
      else ctx.bezierCurveTo(q[1], q[2], q[3], q[4], q[5], q[6]);
    });
    ctx.ellipse(0, P.rimY, P.rimRx, K_RIM * P.rimRx, 0, 0, -Math.PI, true);
    for (i = segs.length - 1; i >= 0; i--) {
      s = segs[i];
      px = i > 0 ? segs[i - 1][segs[i - 1].length - 2] : P.x0;
      py = i > 0 ? segs[i - 1][segs[i - 1].length - 1] : P.y0;
      if (s[0] === 'L') ctx.lineTo(-px, py);
      else if (s[0] === 'Q') ctx.quadraticCurveTo(-s[1], s[2], -px, py);
      else ctx.bezierCurveTo(-s[3], s[4], -s[1], s[2], -px, py);
    }
    if (P.x0 > 1e-3) ctx.ellipse(0, P.y0, P.x0, K_BASE * P.x0, 0, Math.PI, 0, true);
    ctx.closePath();
  }
  /**
   * Adds the closed interior subpath of P (no beginPath): the outline inset by `inset` (default 0.06),
   * with its floor at bottomY (default P.y0 - inset). This is the liquid/contents clip of 4.2 step 3.
   */
  function traceInner(ctx, P, inset, bottomY) {
    var d = inset === undefined ? INSET : inset, by = bottomY === undefined ? P.y0 - d : bottomY;
    var bx = Math.max(0, halfWidthAt(P, by) - d), rx = Math.max(0.01, P.rimRx - d), i, xr = [], yr = [];
    xr.push(bx); yr.push(by);
    for (i = 0; i < P.ys.length; i++) {
      if (P.ys[i] < by) { xr.push(Math.max(0, P.xs[i] - d)); yr.push(P.ys[i]); }
    }
    ctx.moveTo(bx, by);
    for (i = 1; i < xr.length; i++) ctx.lineTo(xr[i], yr[i]);
    ctx.ellipse(0, P.rimY, rx, K_RIM * rx, 0, 0, -Math.PI, true);
    for (i = xr.length - 1; i >= 0; i--) ctx.lineTo(-xr[i], yr[i]);
    if (bx > 1e-3) ctx.ellipse(0, by, bx, K_BASE * bx, 0, Math.PI, 0, true);
    ctx.closePath();
  }
  /** Runs fn() with the ctx clipped to the subpath added by trace(ctx); save/restore included. */
  function withClip(ctx, trace, fn) {
    ctx.save(); ctx.beginPath(); trace(ctx); ctx.clip(); fn(); ctx.restore();
  }

  // ---- The steps of 4.2 ----
  /** Step 2: fills the body with glass-tint plus a faint Fresnel brightening toward both edges. */
  function fillBody(ctx, trace, halfW) {
    var w = halfW || 0.95, gr = ctx.createLinearGradient(-w, 0, w, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.22, 'rgba(255,255,255,0)');
    gr.addColorStop(0.78, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.14)');
    ctx.beginPath(); trace(ctx);
    ctx.fillStyle = COL.tint; ctx.fill(); ctx.fillStyle = gr; ctx.fill();
  }
  /** Step 2 extra: a solid glass base block of height `thick` above P.y0 (T1, T2, T5), with a lit top ring. */
  function baseBlock(ctx, P, thick, color) {
    var ty = P.y0 - thick, rx = halfWidthAt(P, ty) - 0.03;
    withClip(ctx, function (c) { traceBody(c, P); }, function () {
      ctx.fillStyle = color || COL.block;
      ctx.beginPath(); ctx.rect(-2, ty, 4, 3); ellipsePath(ctx, 0, ty, rx, K_BASE * rx); ctx.fill();
      ctx.beginPath(); ellipsePath(ctx, 0, ty, rx, K_BASE * rx);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 0.03; ctx.stroke();
    });
  }
  /**
   * Step 3: the liquid, clipped to traceIn. L = {fill: y of the surface, surface: colour,
   * colors: [top, ..., bottom] OR stops: [[t, colour], ...] with t 0 = bottom, 1 = surface,
   * rx: surface half-width, bottom: lowest interior y, refract (default true), glint (default true)}.
   */
  function liquid(ctx, traceIn, L) {
    var y = L.fill, rx = L.rx, ry = K_RIM * rx, bot = L.bottom, gr, i, n;
    ctx.save(); ctx.beginPath(); traceIn(ctx); ctx.clip();
    if (L.alpha !== undefined) ctx.globalAlpha *= L.alpha;
    gr = ctx.createLinearGradient(0, bot, 0, y);
    if (L.stops) L.stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
    else for (n = L.colors.length, i = 0; i < n; i++) gr.addColorStop(n === 1 ? 0 : 1 - i / (n - 1), L.colors[i]);
    ctx.fillStyle = gr; ctx.fillRect(-2, y, 4, bot - y + 1);
    if (L.refract !== false) {            // refraction band: dark walls, a bright band left of centre
      gr = ctx.createLinearGradient(-rx, 0, rx, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0.14)'); gr.addColorStop(0.14, 'rgba(255,255,255,0.05)');
      gr.addColorStop(0.26, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.4, 'rgba(255,255,255,0)');
      gr.addColorStop(0.82, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = gr; ctx.fillRect(-2, y, 4, bot - y + 1);
    }
    ctx.beginPath(); ellipsePath(ctx, 0, y, rx, ry); ctx.fillStyle = L.surface; ctx.fill();
    ctx.beginPath(); ellipsePath(ctx, -0.18 * rx, y - 0.2 * ry, 0.55 * rx, 0.45 * ry);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();
    ctx.lineCap = 'round';
    ctx.beginPath(); halfEllipse(ctx, 0, y, rx, ry, 'back');
    ctx.strokeStyle = shade(L.surface, -0.25, 0.55); ctx.lineWidth = 0.025; ctx.stroke();
    ctx.beginPath(); halfEllipse(ctx, 0, y, rx, ry, 'front');
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.035; ctx.stroke();
    if (L.glint !== false) {
      ctx.beginPath(); ctx.ellipse(-0.35 * rx, y - 0.1 * ry, 0.125, 0.025, rad(-6), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
    }
    ctx.restore();
  }
  /** Step 5: glass-edge stroke 0.06 on the subpath, plus a glass-outline band 0.035 just outside it. */
  function edge(ctx, trace, edgeW) {
    var w = edgeW || EDGE_W;
    ctx.save(); ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.rect(-4, -6, 8, 10); trace(ctx); ctx.clip('evenodd');
    ctx.beginPath(); trace(ctx); ctx.strokeStyle = COL.outline; ctx.lineWidth = w + 2 * OUTLINE_W; ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.lineJoin = 'round';
    ctx.beginPath(); trace(ctx); ctx.strokeStyle = COL.edge; ctx.lineWidth = w; ctx.stroke();
    ctx.restore();
  }
  /** Step 6: the rim ellipse (ry = K_RIM*rx): white 0.07 at alpha 0.9 in front, 0.5 behind. part: 'both'|'front'|'back'. */
  function rim(ctx, y, rx, part) {
    var p = part || 'both';
    ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 0.07;
    if (p !== 'front') {
      ctx.beginPath(); halfEllipse(ctx, 0, y, rx, K_RIM * rx, 'back');
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.stroke();
    }
    if (p !== 'back') {
      ctx.beginPath(); halfEllipse(ctx, 0, y, rx, K_RIM * rx, 'front');
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
    }
    ctx.restore();
  }
  /** Strokes a polyline pts [[x, y], ...] in white at width w and peak alpha a, fading at both ends, round caps. */
  function streak(ctx, pts, w, a) {
    if (pts.length < 2) return;
    var y0 = pts[0][1], y1 = pts[pts.length - 1][1], gr = ctx.createLinearGradient(0, y0, 0, y1 === y0 ? y0 + 1e-3 : y1);
    gr.addColorStop(0, 'rgba(255,255,255,' + 0.25 * a + ')'); gr.addColorStop(0.25, 'rgba(255,255,255,' + a + ')');
    gr.addColorStop(0.8, 'rgba(255,255,255,' + a + ')'); gr.addColorStop(1, 'rgba(255,255,255,' + 0.3 * a + ')');
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = w; ctx.strokeStyle = gr;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke(); ctx.restore();
  }
  /** A four-point star sparkle of radius r (white). */
  function sparkle(ctx, x, y, r, a) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = 'rgba(255,255,255,' + (a === undefined ? 0.95 : a) + ')';
    ctx.beginPath(); ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(0, 0, r, 0); ctx.quadraticCurveTo(0, 0, 0, r);
    ctx.quadraticCurveTo(0, 0, -r, 0); ctx.quadraticCurveTo(0, 0, 0, -r);
    ctx.fill(); ctx.restore();
  }
  /**
   * Step 7: left streak (alpha 0.55, w 0.10, 15-80 % of the height), right streak (0.25, w 0.05) and the
   * sparkle dot r 0.05 at the upper left, following profile P. o (optional): {left: [f0, f1], right: [f0, f1],
   * inset: 0.17, y0, y1 (height range, default P.y0..P.rimY), sparkle: true}.
   */
  function highlights(ctx, P, o) {
    o = o || {};
    var y0 = o.y0 === undefined ? P.y0 : o.y0, y1 = o.y1 === undefined ? P.rimY : o.y1, ins = o.inset || 0.17;
    function side(sign, f, d) {
      var pts = [], i, y;
      for (i = 0; i <= 12; i++) {
        y = y0 + (y1 - y0) * (f[0] + (f[1] - f[0]) * i / 12);
        pts.push([sign * Math.max(0.03, halfWidthAt(P, y) - d), y]);
      }
      return pts;
    }
    streak(ctx, side(-1, o.left || [0.15, 0.8], ins), 0.10, 0.55);
    streak(ctx, side(1, o.right || [0.3, 0.7], ins - 0.03), 0.05, 0.25);
    if (o.sparkle !== false) {
      var sy = y0 + (y1 - y0) * 0.88;
      if (P.rimRx > 0 && y1 < y0) sy = Math.min(y0, Math.max(sy, P.rimY + K_RIM * P.rimRx + 0.1));   // on the wall, below the front rim
      var sx = -Math.max(0.05, halfWidthAt(P, sy) - ins - 0.12);
      ctx.beginPath(); ellipsePath(ctx, sx, sy, 0.1, 0.1); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
      ctx.beginPath(); ellipsePath(ctx, sx, sy, 0.05, 0.05); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
    }
  }
  /** Step 9: the base ellipse at (0, y), ry = K_BASE*rx, stroked glass-edge (back half fainter). */
  function base(ctx, y, rx) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 0.045;
    ctx.beginPath(); halfEllipse(ctx, 0, y, rx, K_BASE * rx, 'back'); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke();
    ctx.beginPath(); halfEllipse(ctx, 0, y, rx, K_BASE * rx, 'front'); ctx.strokeStyle = COL.edge; ctx.stroke();
    ctx.restore();
  }
  /** Draws a glass stem (tint, edge, highlight) from y top to y bottom, width w, centred on x = 0. */
  function stem(ctx, top, bottom, w) {
    function tr(c) { c.rect(-w / 2, top, w, bottom - top); }
    fillBody(ctx, tr, w / 2); edge(ctx, tr, 0.03);
    streak(ctx, [[-w * 0.18, top + 0.05], [-w * 0.18, bottom - 0.04]], w * 0.28, 0.6);
  }
  /** Draws a glass foot disc at y with half-width rx (ry = K_BASE*rx) and a 0.04 thickness, tint + edges. */
  function foot(ctx, y, rx) {
    function tr(c) {
      c.moveTo(-rx, y); c.ellipse(0, y, rx, K_BASE * rx, 0, Math.PI, 0, false);
      c.lineTo(rx, y + 0.04); c.ellipse(0, y + 0.04, rx, K_BASE * rx, 0, 0, Math.PI, false); c.closePath();
    }
    fillBody(ctx, tr, rx); edge(ctx, tr, 0.04);
  }
  /** Small condensation droplet (white body, dark lower crescent, highlight) of radius r. */
  function droplet(ctx, x, y, r) {
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.15, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.15, 0, rad(20), rad(160));
    ctx.strokeStyle = 'rgba(40,60,80,0.28)'; ctx.lineWidth = r * 0.3; ctx.stroke();
    ctx.beginPath(); ellipsePath(ctx, x - 0.35 * r, y - 0.4 * r, 0.3 * r, 0.3 * r);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
  }
  /** Scatters n droplets over profile P between height fractions f0..f1 (default 0.1..0.7), capped below
   *  the front rim (rimY + K_RIM*rimRx + 0.08) so they never sit over the open mouth of a low glass. */
  function condensation(ctx, P, n, rnd, f0, f1) {
    var a = f0 === undefined ? 0.1 : f0, b = f1 === undefined ? 0.7 : f1, i, y, hw;
    var span = P.rimY - P.y0, bMax = span < 0 ? (P.rimY + K_RIM * P.rimRx + 0.08 - P.y0) / span : b;
    b = Math.min(b, bMax); a = Math.min(a, b);
    for (i = 0; i < n; i++) {
      y = P.y0 + span * (a + (b - a) * rnd());
      hw = Math.max(0, halfWidthAt(P, y) - 0.1);
      droplet(ctx, (rnd() * 2 - 1) * hw, y, 0.018 + 0.03 * rnd());
    }
  }

  /**
   * The whole 4.2 recipe, steps 1-9, for a glass described by a profile. spec = {
   *   profile: P (required), tier (seeds info.rnd), path: trace(ctx) overriding the outer subpath (e.g. a spout),
   *   baseThick: 0, baseFill, stem: {top, bottom, w}, foot: {y, rx} (also becomes the step-9 base),
   *   liquid: {fill, surface, colors | stops, refract, glint, alpha} or null,
   *   back(ctx, info), contents(ctx, info) (inside the interior clip, after the liquid), front(ctx, info),
   *   highlights: options for highlights() or false, rim: false to skip step 6, base: false to skip step 9,
   *   condensation: droplet count (default 0) }.
   * info = {P, rnd, opts, rimY, rimRx, bottom (interior floor y), fill, surfaceRx, hw(y), innerHw(y), traceBody, traceInner}.
   */
  function paint(ctx, spec, opts) {
    var P = spec.profile, d = INSET, thick = spec.baseThick || 0;
    var bottom = P.y0 - Math.max(d, thick), L = spec.liquid;
    var trB = spec.path || function (c) { traceBody(c, P); };
    var trI = function (c) { traceInner(c, P, d, bottom); };
    var bx = Math.max(0, halfWidthAt(P, bottom) - d);
    var info = {
      P: P, rnd: rngFor(spec.tier || 0), opts: opts || {}, rimY: P.rimY, rimRx: P.rimRx, bottom: bottom,
      fill: L ? L.fill : null, surfaceRx: L ? Math.max(0.02, halfWidthAt(P, L.fill) - d) : 0,
      hw: function (y) { return halfWidthAt(P, y); },
      innerHw: function (y) { return Math.max(0, halfWidthAt(P, y) - d); },
      traceBody: trB, traceInner: trI, liquid: L
    };
    if (spec.back) spec.back(ctx, info);                                        // 1
    if (spec.foot) foot(ctx, spec.foot.y, spec.foot.rx);                        // 2
    if (spec.stem) stem(ctx, spec.stem.top, spec.stem.bottom, spec.stem.w);
    fillBody(ctx, trB, Math.max(P.rimRx, 0.95));
    if (thick > 0) baseBlock(ctx, P, thick, spec.baseFill);
    if (L) {                                                                    // 3
      liquid(ctx, trI, {
        fill: L.fill, surface: L.surface, colors: L.colors, stops: L.stops, rx: info.surfaceRx,
        bottom: bottom + K_BASE * bx, refract: L.refract, glint: L.glint, alpha: L.alpha
      });
    }
    if (spec.contents) withClip(ctx, trI, function () { spec.contents(ctx, info); });  // 4
    if (spec.condensation) withClip(ctx, trB, function () { condensation(ctx, P, spec.condensation, info.rnd); });
    edge(ctx, trB);                                                             // 5
    if (spec.rim !== false) rim(ctx, P.rimY, P.rimRx);                          // 6
    if (spec.highlights !== false) highlights(ctx, P, spec.highlights);         // 7
    if (spec.front) spec.front(ctx, info);                                      // 8
    if (spec.base !== false) {                                                  // 9
      if (spec.foot) base(ctx, spec.foot.y, spec.foot.rx); else base(ctx, P.y0, P.x0);
    }
    return info;
  }

  var G = {
    BASE_Y: BASE_Y, K_BASE: K_BASE, K_RIM: K_RIM, EDGE_W: EDGE_W, OUTLINE_W: OUTLINE_W, INSET: INSET,
    TOPA: TOPA, X_HALF: X_HALF, Y_BOTTOM: Y_BOTTOM, GLOW_PAD: GLOW_PAD, COL: COL,
    mulberry32: mulberry32, rngFor: rngFor, rad: rad, shade: shade,
    cacheRp: cacheRp, spriteBox: spriteBox, applyAnchor: applyAnchor,
    profile: profile, halfWidthAt: halfWidthAt, ellipsePath: ellipsePath, halfEllipse: halfEllipse,
    traceBody: traceBody, traceInner: traceInner, withClip: withClip,
    fillBody: fillBody, baseBlock: baseBlock, liquid: liquid, edge: edge, rim: rim, streak: streak,
    sparkle: sparkle, highlights: highlights, base: base, stem: stem, foot: foot,
    droplet: droplet, condensation: condensation, paint: paint
  };
  art.glass = G;
  if (typeof module === 'object' && module && module.exports) module.exports = G;
})(typeof globalThis !== 'undefined' ? globalThis : this);
