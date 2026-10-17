// src/art/scenery.js: background, table, roof, contact shadows and the danger line (DESIGN 4.4-4.6, 3.8).
// Browser file (Canvas 2D only, Safari 15 safe); everything draws in canvas CSS px (the caller applies dpr).
// Static (cached): paintBackground, paintTable, paintRoof. Live: paintBackgroundLive, paintRoofLights, paintShadow, paintDangerLine.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var art = CM.art = CM.art || {};
  var TAU = Math.PI * 2;
  var C = {
    skyTop: '#6CC9F2', skyHor: '#BDEBFF', seaDeep: '#1CA7C9', seaShal: '#47D1D0', sand: '#F2D6A2', sandDark: '#E5C287',
    sandLight: '#FBE7C2', trunk: '#8B5A2B', ring: '#6E4420', leaf: '#3E9B3A', leafDark: '#2D7A2A', leafLight: '#5BBE4A',
    nut: '#6B4423', thatch: '#C9A15A', thatchDark: '#A87D3C', thatchLight: '#E0BE73', beam: '#7A4A22', twine: '#8B6B3E',
    bulb: '#FFE08A', wood: '#D6A465', bevel: '#A8743F', woodHi: '#ECC487', apronTop: '#9A5E2C', apronBot: '#6E3F1A',
    bench: '#C58A4E', benchGap: '#8C5426', tFar: '#F1DDB0', tNear: '#E9CF98', star: '#F7A35C'
  };
  var KEYS = [null, '#F5C542', '#B3561C', '#FF5C8A', '#C6E05A', '#4CC97A', '#FF4F2E', '#2EB5A8', '#9B5DE5', '#0F8A5F'];

  function rng(seed) { return art.glass.mulberry32(seed); }   // every scenery pattern is seeded and stable
  function rr(r, a, b) { return a + (b - a) * r(); }
  function P(lay, x, y) { var p = CM.projection.project(lay, x, y); return [p.X, p.Y]; }
  function poly(ctx, pts) { ctx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
  function quad(lay, x0, y0, x1, y1) { return [P(lay, x0, y0), P(lay, x1, y0), P(lay, x1, y1), P(lay, x0, y1)]; }
  function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  function k(lay) { return lay.uiK || lay.kX / 3.4; }
  function devScale(ctx) {                   // shadowBlur ignores the transform: CSS px -> device px
    try { var m = ctx.getTransform && ctx.getTransform(); return m ? Math.sqrt(m.a * m.a + m.b * m.b) || 1 : 1; } catch (e) { return 1; }
  }
  function dangerY(rules) { return (rules && rules.DANGER_Y) || (CM.config && CM.config.TABLE && CM.config.TABLE.DANGER_Y) || 130; }
  function keyColor(t) { var T = CM.config && CM.config.TIERS && CM.config.TIERS[t]; return (T && T.color) || KEYS[t] || '#FFFFFF'; }
  function band(lay) { return { skyB: 0.6 * lay.farY, seaB: 0.85 * lay.farY }; }   // 4.5 bands, canvas px

  // ---------------------------------------------------------------- small shapes ----
  /** Five-arm starfish of radius r (inner 0.42r), centred, with lighter dots. */
  function starfish(ctx, r, col, rot) {
    ctx.save(); ctx.rotate(rot || 0); ctx.beginPath();
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2 + i * TAU / 5, b = a + Math.PI / 5;
      if (i === 0) ctx.moveTo(r * Math.cos(a), r * Math.sin(a));
      ctx.quadraticCurveTo(0.3 * r * Math.cos(b - 0.35), 0.3 * r * Math.sin(b - 0.35), 0.42 * r * Math.cos(b), 0.42 * r * Math.sin(b));
      ctx.quadraticCurveTo(0.3 * r * Math.cos(b + 0.35), 0.3 * r * Math.sin(b + 0.35), r * Math.cos(b + Math.PI / 5), r * Math.sin(b + Math.PI / 5));
    }
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = 'rgba(160,80,20,0.35)'; ctx.lineWidth = r * 0.06; ctx.stroke();
    ctx.fillStyle = 'rgba(255,225,180,0.8)';
    for (i = 0; i < 5; i++) { a = -Math.PI / 2 + i * TAU / 5; ctx.beginPath(); ctx.arc(0.55 * r * Math.cos(a), 0.55 * r * Math.sin(a), r * 0.07, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  /** Scallop shell of radius r: a ribbed fan with a hinge. */
  function shell(ctx, r, col, rot) {
    ctx.save(); ctx.rotate(rot || 0); ctx.beginPath(); ctx.moveTo(0, 0.35 * r);
    for (var i = 0; i <= 6; i++) {
      var a = Math.PI * (1.15 + 0.7 * i / 6);
      ctx.quadraticCurveTo(r * 1.08 * Math.cos(a - 0.06), r * 1.08 * Math.sin(a - 0.06), r * Math.cos(a), r * Math.sin(a));
    }
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = 'rgba(170,110,70,0.45)'; ctx.lineWidth = r * 0.07; ctx.lineCap = 'round';
    for (i = 1; i < 6; i++) { a = Math.PI * (1.15 + 0.7 * i / 6); ctx.beginPath(); ctx.moveTo(0, 0.3 * r); ctx.lineTo(0.85 * r * Math.cos(a), 0.85 * r * Math.sin(a)); ctx.stroke(); }
    ctx.fillStyle = col; ctx.fillRect(-0.28 * r, 0.25 * r, 0.56 * r, 0.22 * r);
    ctx.restore();
  }
  /** Draws fn() in the table plane at sim (x, y): units are table units, foreshortened by c(y) (3.2). */
  function onTable(ctx, lay, x, y, fn) {
    var pr = CM.projection, p = pr.project(lay, x, y), h = lay.kX * pr.scaleAt(y);
    ctx.save(); ctx.translate(p.X, p.Y); ctx.scale(h, h * pr.ratioAt(lay, y)); fn(); ctx.restore();
  }

  // ---------------------------------------------------------------- background (4.5) ----
  /**
   * Static background for a vw x vh canvas plus an overdraw `margin` (ceil(12*uiK) px) on every side. The ctx
   * origin is the margin canvas's top-left = screen (-margin, -margin); the renderer draws it at (-margin, -margin).
   * opts.static = true leaves out the live parts (clouds, sea sparkles, foam, palms) for paintBackgroundLive.
   */
  function paintBackground(ctx, lay, vw, vh, margin, opts) {
    var m = margin || 0, B = band(lay), S = lay.S, sx = lay.stage.x, u = k(lay), r = rng(4511), gr, i, x, s;
    ctx.save(); ctx.translate(m, m);
    gr = ctx.createLinearGradient(0, -m, 0, B.skyB); gr.addColorStop(0, C.skyTop); gr.addColorStop(1, C.skyHor);
    ctx.fillStyle = gr; ctx.fillRect(-m, -m, vw + 2 * m, B.skyB + m + 1);
    gr = ctx.createLinearGradient(0, B.skyB, 0, B.seaB); gr.addColorStop(0, C.seaShal); gr.addColorStop(1, C.seaDeep);
    ctx.fillStyle = gr; ctx.fillRect(-m, B.skyB, vw + 2 * m, B.seaB - B.skyB + 1);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-m, B.skyB, vw + 2 * m, Math.max(1, u));   // horizon haze
    gr = ctx.createLinearGradient(0, B.seaB, 0, B.seaB + 14 * u); gr.addColorStop(0, C.sandDark); gr.addColorStop(1, C.sand);
    ctx.fillStyle = C.sand; ctx.fillRect(-m, B.seaB, vw + 2 * m, vh - B.seaB + m);
    ctx.fillStyle = gr; ctx.fillRect(-m, B.seaB, vw + 2 * m, 14 * u);
    for (i = 0; i < 400; i++) {
      ctx.fillStyle = r() < 0.5 ? C.sandDark : C.sandLight; s = rr(r, 1, 2);
      ctx.fillRect(rr(r, -m, vw + m), rr(r, B.seaB + 4, vh + m), s, s);
    }
    var fy = lay.strip ? (lay.strip.bottom + vh) / 2 : vh - 12, fs = 9 * u;       // foreground under the strip
    [[0.18, starfish, C.star], [0.36, shell, '#F8DCC8'], [0.55, shell, C.sandLight], [0.74, starfish, '#F28C66'],
      [0.9, shell, '#F6E3CF']].forEach(function (d, j) {
      ctx.save(); ctx.translate(sx + d[0] * S, fy + (j % 2 ? 2 : -1) * u); ctx.scale(1, 0.8);
      d[1](ctx, fs * (d[1] === shell ? 0.8 : 1), d[2], rr(r, -0.6, 0.6)); ctx.restore();
    });
    var bw = 0.085 * S;
    for (x = 0; x < 6 && (sx - x * S > -m - bw || sx + S + x * S < vw + m + bw); x += 0.42) {
      bench(ctx, sx + 0.01 * S - x * S - bw / 2, bw, vh, u); bench(ctx, sx + 0.99 * S + x * S - bw / 2, bw, vh, u);
    }
    if (!(opts && opts.static)) paintBackgroundLive(ctx, lay, vw, vh, 0, true);
    ctx.restore();
  }
  /** A side bench seen from above (35-80 % H, 4.5): three lengthwise planks with dark gaps on two cross battens. */
  function bench(ctx, x, w, H, u) {
    var y0 = 0.35 * H, y1 = 0.8 * H, gap = Math.max(1.5, 2 * u), pw = (w - 2 * gap) / 3, i, px;
    ctx.fillStyle = 'rgba(80,45,15,0.2)'; ctx.fillRect(x + 4 * u, y0 + 6 * u, w, y1 - y0);          // cast shadow
    ctx.fillStyle = C.benchGap;
    [0.12, 0.88].forEach(function (f) { ctx.fillRect(x - 3 * u, y0 + f * (y1 - y0) - 4 * u, w + 6 * u, 8 * u); });
    for (i = 0; i < 3; i++) {
      px = x + i * (pw + gap);
      ctx.fillStyle = C.bench; ctx.fillRect(px, y0, pw, y1 - y0);
      ctx.fillStyle = 'rgba(255,230,180,0.4)'; ctx.fillRect(px, y0, Math.max(1, pw * 0.2), y1 - y0);
      ctx.fillStyle = 'rgba(110,63,26,0.35)'; ctx.fillRect(px + pw - Math.max(1, pw * 0.12), y0, Math.max(1, pw * 0.12), y1 - y0);
      ctx.fillRect(px, y1 - 2 * u, pw, 2 * u);
      ctx.strokeStyle = 'rgba(140,84,38,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px + pw * 0.55, y0 + 0.2 * (y1 - y0)); ctx.lineTo(px + pw * 0.5, y0 + 0.7 * (y1 - y0)); ctx.stroke();
    }
  }
  /** One palm (4.5): base at (x, y), height h, lean dir (-1 left, +1 right), sway in radians about the base. */
  function palm(ctx, x, y, h, dir, sway) {
    var i, t, gr, p, w, L = [], R = [];
    ctx.save(); ctx.translate(x, y); ctx.rotate(sway || 0);
    function at(t) { var v = 1 - t; return [2 * v * t * 0.02 * h * dir + t * t * 0.22 * dir * h, 2 * v * t * -0.55 * h - t * t * h]; }
    function wAt(t) { return h * (0.05 - 0.022 * t); }
    for (i = 0; i <= 16; i++) { t = i / 16; p = at(t); w = wAt(t); L.push([p[0] - w, p[1]]); R.push([p[0] + w, p[1]]); }
    ctx.beginPath(); poly(ctx, L.concat(R.reverse()));
    gr = ctx.createLinearGradient(-0.06 * h, 0, 0.06 * h, 0);
    gr.addColorStop(0, C.ring); gr.addColorStop(0.45, C.trunk); gr.addColorStop(1, '#A87442');
    ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = C.ring; ctx.lineWidth = Math.max(1, 0.008 * h); ctx.lineCap = 'round';
    for (i = 1; i <= 9; i++) {                                            // 9 trunk rings
      p = at(i / 10.5); w = wAt(i / 10.5);
      ctx.beginPath(); ctx.moveTo(p[0] - w, p[1] - 0.004 * h); ctx.quadraticCurveTo(p[0], p[1] + 0.012 * h, p[0] + w, p[1] - 0.004 * h); ctx.stroke();
    }
    var top = at(1), angs = [-168, -138, -108, -78, -48, -18, 12];
    for (i = 0; i < 7; i++) frond(ctx, top[0], top[1], h * (0.36 + 0.06 * Math.sin(i * 1.7)), angs[i] + 6 * dir, h);
    ctx.fillStyle = C.nut;
    [[-0.03, 0.035], [0.025, 0.04], [0, 0.065]].forEach(function (o) { ctx.beginPath(); ctx.arc(top[0] + o[0] * h, top[1] + o[1] * h, 0.032 * h, 0, TAU); ctx.fill(); });
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(top[0] - 0.04 * h, top[1] + 0.025 * h, 0.01 * h, 0, TAU); ctx.fill();
    ctx.restore();
  }
  /** A drooping frond with 10 notches per side; the upper half lit, the lower half dark, a dark midrib. */
  function frond(ctx, x, y, len, angDeg, h) {
    var a = angDeg * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), droop = 0.35 * len, n = 10, i, t;
    function spine(t) { return [x + dx * len * t, y + dy * len * t + droop * t * t]; }
    function side(sgn) {
      var pts = [], p, q, nx, ny, nl, w;
      for (i = 0; i <= 2 * n; i++) {
        t = i / (2 * n); p = spine(t); q = spine(Math.min(1, t + 0.01));
        nx = p[1] - q[1]; ny = q[0] - p[0]; nl = Math.sqrt(nx * nx + ny * ny) || 1;
        w = 0.075 * h * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.7) * (i % 2 ? 0.55 : 1);
        pts.push([p[0] + sgn * nx / nl * w + dx * (i % 2 ? 0 : 0.02 * h), p[1] + sgn * ny / nl * w]);
      }
      return pts;
    }
    var base = [spine(0)], lit = dx >= 0;
    ctx.beginPath(); poly(ctx, base.concat(side(-1), [spine(1)])); ctx.fillStyle = lit ? C.leafLight : C.leaf; ctx.fill();
    ctx.beginPath(); poly(ctx, base.concat(side(1), [spine(1)])); ctx.fillStyle = lit ? C.leaf : C.leafLight; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y);
    for (i = 1; i <= 12; i++) { t = spine(i / 12); ctx.lineTo(t[0], t[1]); }
    ctx.strokeStyle = C.leafDark; ctx.lineWidth = Math.max(1, 0.009 * h); ctx.stroke();
  }
  /** Palm bases (4.5): 8 % and 92 % of S, plus one extra per side 0.3 S outside a wider canvas. [x, y, dir, phase] */
  function palmSpots(lay, vw) {
    var S = lay.S, sx = lay.stage.x, f = lay.farY, out = [[sx + 0.08 * S, 0.9 * f, -1, 0], [sx + 0.92 * S, 0.85 * f, 1, Math.PI / 2]];
    if (vw > S + 1) out.push([sx - 0.3 * S, 0.88 * f, -1, 1.1], [sx + 1.3 * S, 0.87 * f, 1, 2.3]);
    return out;
  }
  /**
   * Live background parts (3.8), canvas px, drawn right after the cached background: 3 clouds drifting 3 px/s,
   * 12 twinkling sea sparkles, the foam line and the palms (+-2 deg at 0.25 Hz; reduced = true stops the sway).
   */
  function paintBackgroundLive(ctx, lay, vw, vh, nowMs, reduced) {
    var t = (nowMs || 0) / 1000, u = k(lay), B = band(lay), S = lay.S, H = lay.H || vh, r = rng(911), i;
    var roofB = 0.085 * H, span = vw + 160 * u;
    ctx.save();
    for (i = 0; i < 3; i++) {
      var cr = rr(r, 18, 34) * u, x0 = rr(r, 0, vw), cy = roofB + (B.skyB - roofB) * rr(r, 0.25, 0.7);
      var cx = ((x0 + 3 * u * t) % span + span) % span - 80 * u;
      if (B.skyB - roofB < 0.6 * cr) cy = Math.max(cy, roofB + 0.4 * cr);
      ctx.beginPath();          // one path, one fill: overlapping puffs keep a uniform alpha 0.8
      [[-1.1, 0.25, 0.62], [-0.4, -0.2, 0.92], [0.45, -0.05, 0.8], [1.15, 0.3, 0.55]].forEach(function (c) {
        ctx.moveTo(cx + (c[0] + c[2]) * cr, cy + c[1] * cr); ctx.arc(cx + c[0] * cr, cy + c[1] * cr, c[2] * cr, 0, TAU);
      });
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    }
    for (i = 0; i < 12; i++) {
      var sxp = rr(r, 0, vw), syp = rr(r, B.skyB + 3, B.seaB - 4), hz = rr(r, 0.5, 1.2), ph = rr(r, 0, TAU);
      var b = 0.5 + 0.5 * Math.sin(TAU * hz * t + ph), sz = 3.2 * u * (0.4 + 0.6 * b);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.65 * b).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(sxp, syp - sz); ctx.quadraticCurveTo(sxp, syp, sxp + sz, syp);
      ctx.quadraticCurveTo(sxp, syp, sxp, syp + sz); ctx.quadraticCurveTo(sxp, syp, sxp - sz, syp);
      ctx.quadraticCurveTo(sxp, syp, sxp, syp - sz); ctx.fill();
    }
    var amp = 0.004 * H, lam = 0.18 * S, fw = 3.5 * u, x, pts = [];
    for (x = -20; x <= vw + 26; x += 6) pts.push([x, B.seaB + amp * Math.sin(TAU * x / lam + 0.3 * t)]);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1] - fw);
    pts.forEach(function (p) { ctx.lineTo(p[0], p[1] - fw); });
    for (i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], pts[i][1] + fw * 0.6);
    ctx.closePath(); ctx.fillStyle = 'rgba(233,251,248,0.92)'; ctx.fill();
    ctx.beginPath(); pts.forEach(function (p, j) { ctx[j ? 'lineTo' : 'moveTo'](p[0], p[1] + fw * 1.6); });
    ctx.strokeStyle = 'rgba(200,160,100,0.35)'; ctx.lineWidth = Math.max(1, u); ctx.stroke();     // wet line
    palmSpots(lay, vw).forEach(function (p) {          // height 22 % H, capped so the crown stays below the roof
      palm(ctx, p[0], p[1], Math.max(0.1 * H, Math.min(0.22 * H, p[1] - 0.12 * H)), p[2],
        reduced ? 0 : (2 * Math.PI / 180) * Math.sin(TAU * 0.25 * t + p[3]));
    });
    ctx.restore();
  }

  // ---------------------------------------------------------------- table (4.4) ----
  /** The cached table (frame, apron, glass-over-sand surface, launch zone), canvas px; uses rules.DANGER_Y. */
  function paintTable(ctx, lay, rules) {
    var DY = dangerY(rules), kx = lay.kX, r = rng(7), i, j, gr;
    var O = quad(lay, -5, -5, 105, 165), I = quad(lay, 0, 0, 100, 160);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var ax0 = O[3][0], ax1 = O[2][0], ay = O[3][1], ah = 6 * kx, lw = 0.08 * lay.S;
    ctx.fillStyle = '#5A3315';                                   // legs, peeking below the apron
    ctx.fillRect(ax0 + 0.03 * lay.S, ay + ah - 2, lw, 5 * kx); ctx.fillRect(ax1 - 0.03 * lay.S - lw, ay + ah - 2, lw, 5 * kx);
    gr = ctx.createLinearGradient(0, ay, 0, ay + ah);
    gr.addColorStop(0, C.apronTop); gr.addColorStop(1, C.apronBot);
    ctx.fillStyle = gr; ctx.fillRect(ax0, ay, ax1 - ax0, ah);
    ctx.strokeStyle = 'rgba(185,129,70,0.35)'; ctx.lineWidth = 1;
    for (i = 1; i <= 3; i++) {
      var gy = ay + ah * i / 4.2; ctx.beginPath(); ctx.moveTo(ax0 + rr(r, 4, 30), gy);
      ctx.bezierCurveTo((ax0 + ax1) * 0.4, gy + rr(r, -2, 2), (ax0 + ax1) * 0.6, gy + rr(r, -2, 2), ax1 - rr(r, 4, 30), gy); ctx.stroke();
    }
    ctx.fillStyle = C.woodHi; ctx.fillRect(ax0, ay, ax1 - ax0, 1);
    ctx.beginPath(); poly(ctx, O); ctx.fillStyle = C.wood; ctx.fill();   // frame top face
    ctx.strokeStyle = 'rgba(185,129,70,0.4)';                           // 6 broken grain lines per side
    [[O[0], O[1], I[0], I[1]], [O[1], O[2], I[1], I[2]], [O[2], O[3], I[2], I[3]], [O[3], O[0], I[3], I[0]]].forEach(function (sd) {
      for (j = 0; j < 6; j++) {
        var f = (j + 0.5) / 6, a = lerp(sd[0], sd[2], f), b = lerp(sd[1], sd[3], f), t0 = rr(r, 0, 0.15), t1, p0, p1;
        ctx.lineWidth = rr(r, 0.6, 1.3);
        for (; t0 < 0.95; t0 = t1 + rr(r, 0.04, 0.12)) {
          t1 = Math.min(1, t0 + rr(r, 0.2, 0.55)); p0 = lerp(a, b, t0); p1 = lerp(a, b, t1);
          ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
        }
      }
    });
    ctx.strokeStyle = 'rgba(140,84,38,0.6)'; ctx.lineWidth = 1.2;      // mitred corner seams
    for (i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(O[i][0], O[i][1]); ctx.lineTo(I[i][0], I[i][1]); ctx.stroke(); }
    ctx.save(); ctx.beginPath(); poly(ctx, O); ctx.clip();               // 1 px outer highlight
    ctx.beginPath(); poly(ctx, O); ctx.strokeStyle = C.woodHi; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();

    ctx.save(); ctx.beginPath(); poly(ctx, I); ctx.clip();              // surface: glass over sand
    var yF = I[0][1], yN = I[2][1], x0 = I[3][0], wT = I[2][0] - x0;
    gr = ctx.createLinearGradient(0, yF, 0, yN); gr.addColorStop(0, C.tFar); gr.addColorStop(1, C.tNear);
    ctx.fillStyle = gr; ctx.fillRect(x0 - 2, yF - 2, wT + 4, yN - yF + 4);
    ctx.strokeStyle = 'rgba(215,182,122,0.15)';                         // 18 sand ripples
    for (i = 0; i < 18; i++) {
      var ry = 5 + i * 150 / 18 + rr(r, -2, 2), amp = rr(r, 0.6, 1.4), fq = rr(r, 0.08, 0.16), ph = rr(r, 0, TAU), p;
      ctx.lineWidth = Math.max(1, 0.5 * kx * CM.projection.scaleAt(ry)); ctx.beginPath();
      for (j = 0; j <= 20; j++) { p = P(lay, j * 5, ry + amp * Math.sin(j * 5 * fq + ph)); ctx[j ? 'lineTo' : 'moveTo'](p[0], p[1]); }
      ctx.stroke();
    }
    ctx.globalAlpha = 0.5;                                              // 6 shells, 2 starfish, 10 pebbles (seed 7)
    var pebbles = ['#C9B79A', '#B8A588', '#D9CDB5', '#BFAE92'];
    function pebble(sz, rot, col) {
      ctx.beginPath(); ctx.ellipse(0, 0, sz, sz * 0.75, rot, 0, TAU); ctx.fillStyle = col; ctx.fill();
      ctx.beginPath(); ctx.ellipse(-0.25 * sz, -0.2 * sz, sz * 0.35, sz * 0.22, rot, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
    }
    for (i = 0; i < 18; i++) {
      var ix = rr(r, 6, 94), iy = rr(r, 8, 154), rot = rr(r, 0, TAU), sz = rr(r, 0.6, 1.3);
      onTable(ctx, lay, ix, iy, function () {
        if (i < 6) shell(ctx, 2.3, '#FBE7D8', rot); else if (i < 8) starfish(ctx, 2.9, C.star, rot); else pebble(sz, rot, pebbles[i % 4]);
      });
    }
    ctx.globalAlpha = 1;
    [[0.3, 0.4], [0.68, 0.14]].forEach(function (b) {                  // two diagonal sheen bands
      ctx.save(); ctx.translate(x0 + wT * b[0], (yF + yN) / 2); ctx.rotate(0.45);
      var bw = wT * b[1], g2 = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
      g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(0.5, 'rgba(255,255,255,0.12)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g2; ctx.fillRect(-bw / 2, -2 * (yN - yF) - wT, bw, 4 * (yN - yF) + 2 * wT); ctx.restore();
    });
    ctx.fillStyle = 'rgba(120,80,30,0.06)'; ctx.beginPath(); poly(ctx, quad(lay, 0, DY, 100, 160)); ctx.fill();   // launch zone
    ctx.save();                                                         // inner frame shadow (2 u), cast inward
    ctx.shadowColor = 'rgba(0,0,0,0.26)'; ctx.shadowBlur = 2 * kx * devScale(ctx);
    ctx.beginPath(); ctx.rect(x0 - 4 * wT, yF - 4 * wT, 9 * wT, 9 * wT); poly(ctx, I);
    ctx.fillStyle = '#000'; ctx.fill('evenodd'); ctx.restore();
    ctx.beginPath(); poly(ctx, I); ctx.strokeStyle = 'rgba(159,227,230,0.5)'; ctx.lineWidth = 3; ctx.stroke();   // 1.5 px cyan edge
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(-1e4, -1e4, 2e4, 2e4); poly(ctx, I); ctx.clip('evenodd');   // 2 px inner bevel
    ctx.beginPath(); poly(ctx, I); ctx.strokeStyle = C.bevel; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
    ctx.restore();
  }

  // ---------------------------------------------------------------- roof (4.5) ----
  function catenaryY(H, f) { return 0.075 * H + 0.03 * H * (1 - (Math.cosh(1.2 * (2 * f - 1)) - 1) / (Math.cosh(1.2) - 1)); }
  function bulbSpots(lay, vw) {               // 9 bulbs per stage-width span, [x, y, phase]
    var S = lay.S, sx = lay.stage.x, out = [], n, i, r = rng(77);
    for (n = -Math.ceil((sx + 20) / S); sx + n * S < vw + 20; n++) {
      for (i = 0; i < 9; i++) out.push([sx + (n + (i + 0.5) / 9) * S, catenaryY(lay.H, (i + 0.5) / 9), rr(r, 0, TAU)]);
    }
    return out;
  }
  /** Bulbs 5x7 px*uiK with a radial glow r 14 px*uiK (4.5), twinkling 0.75-1.0 at 0.7 Hz; nowMs null = full. */
  var GLOW = null;
  function glowSprite() {
    if (GLOW) return GLOW;
    var c = root.document.createElement('canvas'), x; c.width = c.height = 64; x = c.getContext('2d');
    var g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,216,107,1)'); g.addColorStop(1, 'rgba(255,216,107,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    GLOW = c; return c;
  }
  function paintRoofLights(ctx, lay, vw, nowMs) {
    var u = k(lay), t = (nowMs || 0) / 1000, live = typeof nowMs === 'number';
    ctx.save();
    bulbSpots(lay, vw).forEach(function (b) {
      var br = live ? 0.875 + 0.125 * Math.sin(TAU * 0.7 * t + b[2]) : 1, x = b[0], y = b[1] + 5 * u;
      ctx.globalAlpha = 0.45 * br;                                    // cached glow sprite (perf): no gradient per bulb per frame
      ctx.drawImage(glowSprite(), x - 14 * u, y - 14 * u, 28 * u, 28 * u);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#5A3A14'; ctx.fillRect(x - 1.6 * u, b[1] - 0.5 * u, 3.2 * u, 2.6 * u);
      ctx.globalAlpha = 0.55 + 0.45 * (br - 0.75) / 0.25;
      ctx.beginPath(); ctx.ellipse(x, y, 2.5 * u, 3.5 * u, 0, 0, TAU); ctx.fillStyle = C.bulb; ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.ellipse(x - 0.8 * u, y - 1.2 * u, 0.7 * u, 1.1 * u, 0, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
    });
    ctx.restore();
  }
  /**
   * The roof layer (4.5) across the canvas width vw (plus a small overdraw): thatch band 0-6 % H with 140 straw
   * strokes and a hem of 36 teeth per stage width, the beam at 5.5-6.5 % H, the twine catenaries, and the bulbs
   * unless opts.static (then paintRoofLights draws them live every frame).
   */
  function paintRoof(ctx, lay, vw, opts) {
    var H = lay.H, S = lay.S, u = k(lay), m = Math.ceil(12 * u) + 4, r = rng(305), i, n, gr, x0 = -m, wAll = vw + 2 * m;
    ctx.save(); ctx.lineCap = 'round';
    var nT = Math.ceil(36 * wAll / S), tw = wAll / nT;                 // hem teeth (behind the beam)
    ctx.beginPath(); ctx.moveTo(x0, 0.055 * H);
    for (i = 0; i < nT; i++) {
      ctx.lineTo(x0 + (i + 0.5 + rr(r, -0.15, 0.15)) * tw, 0.062 * H + rr(r, 6, 14) * u); ctx.lineTo(x0 + (i + 1) * tw, 0.062 * H);
    }
    ctx.lineTo(x0 + wAll, 0.055 * H); ctx.closePath();
    gr = ctx.createLinearGradient(0, 0.06 * H, 0, 0.062 * H + 14 * u);
    gr.addColorStop(0, C.thatch); gr.addColorStop(1, C.thatchDark);
    ctx.fillStyle = gr; ctx.fill(); ctx.strokeStyle = 'rgba(122,74,34,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    gr = ctx.createLinearGradient(0, -m, 0, 0.06 * H);
    gr.addColorStop(0, C.thatchLight); gr.addColorStop(0.35, C.thatch); gr.addColorStop(1, '#B88F4C');
    ctx.fillStyle = gr; ctx.fillRect(x0, -m, wAll, 0.06 * H + m);
    n = Math.round(140 * wAll / S); ctx.lineWidth = 2;
    for (i = 0; i < n; i++) {
      var sx = rr(r, x0, x0 + wAll), sy = rr(r, -m, 0.05 * H), len = rr(r, 20, 40) * u, a = rr(r, -6, 6) * Math.PI / 180;
      ctx.strokeStyle = r() < 0.5 ? 'rgba(168,125,60,0.6)' : 'rgba(224,190,115,0.6)';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.sin(a) * len, Math.min(0.062 * H, sy + Math.cos(a) * len)); ctx.stroke();
    }
    gr = ctx.createLinearGradient(0, 0.065 * H, 0, 0.065 * H + 4 * u);
    gr.addColorStop(0, 'rgba(60,30,10,0.3)'); gr.addColorStop(1, 'rgba(60,30,10,0)');
    ctx.fillStyle = gr; ctx.fillRect(x0, 0.065 * H, wAll, 4 * u);
    ctx.fillStyle = C.beam; ctx.fillRect(x0, 0.055 * H, wAll, 0.01 * H);
    ctx.fillStyle = 'rgba(236,196,135,0.35)'; ctx.fillRect(x0, 0.055 * H, wAll, Math.max(1, 0.0015 * H));
    ctx.strokeStyle = C.twine; ctx.lineWidth = 2;                       // twine catenaries, one per stage width
    var sx0 = lay.stage.x;
    for (n = -Math.ceil((sx0 + m) / S); sx0 + n * S < vw + m; n++) {
      ctx.beginPath();
      for (i = 0; i <= 24; i++) ctx[i ? 'lineTo' : 'moveTo'](sx0 + (n + i / 24) * S, catenaryY(H, i / 24));
      ctx.stroke();
    }
    ctx.restore();
    if (!(opts && opts.static)) paintRoofLights(ctx, lay, vw, null);
  }

  // ---------------------------------------------------------------- shadows and the danger line (4.6, 4.4) ----
  var shadowSprite = null, causticSprites = [];
  function radialSprite(size, stops) {
    var c = root.document.createElement('canvas'), x, g, h = size / 2;
    c.width = c.height = size; x = c.getContext('2d'); g = x.createRadialGradient(h, h, 0, h, h, h);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    return c;
  }
  /** Contact shadow (a pre-rendered radial sprite stretched to footprint fp) plus the tier-key caustic (4.6). */
  function paintShadow(ctx, fp, tier) {
    if (!shadowSprite) shadowSprite = radialSprite(128, [[0, 'rgba(60,35,10,0.30)'], [0.75, 'rgba(60,35,10,0.24)'], [1, 'rgba(60,35,10,0)']]);
    var c = causticSprites[tier], sh = art.glass.shade, col = keyColor(tier);
    if (!c) c = causticSprites[tier] = radialSprite(64, [[0, sh(col, 0, 0.16)], [0.6, sh(col, 0, 0.13)], [1, sh(col, 0, 0)]]);
    ctx.drawImage(shadowSprite, fp.X - fp.rx, fp.Y - fp.ry, 2 * fp.rx, 2 * fp.ry);
    var cx = fp.X - 0.15 * fp.rx, cy = fp.Y + 0.10 * fp.ry, rx = 0.7 * fp.rx, ry = 0.7 * fp.ry;
    ctx.drawImage(c, cx - rx, cy - ry, 2 * rx, 2 * ry);
  }
  /**
   * The danger line at y = rules.DANGER_Y: dashes 3 u / gaps 2 u, round caps, width max(2 px, 0.6*vScale).
   * Level 0 white 0.75; 1 orange #FFB347 0.9; 2 red #FF4D4D, width pulsing 2 -> 4 px*uiK at 4 Hz (3.8).
   * alpha (default 1) multiplies everything (0.5 for the second pass through the launcher).
   */
  function paintDangerLine(ctx, lay, rules, level, nowMs, alpha) {
    var pr = CM.projection, DY = dangerY(rules), s = pr.scaleAt(DY), Y = pr.project(lay, 0, DY).Y;
    var w = Math.max(2, 0.6 * lay.A * s * s / lay.F), col = '#FFFFFF', a = 0.75, d, pass, keep;
    if (level === 2) { col = '#FF4D4D'; a = 1; w = Math.max(w, (3 + Math.sin(TAU * 4 * (nowMs || 0) / 1000)) * k(lay)); }
    else if (level === 1) { col = '#FFB347'; a = 0.9; }
    ctx.save(); ctx.lineCap = 'round';
    ctx.globalAlpha *= (alpha === undefined ? 1 : alpha);
    keep = ctx.globalAlpha;
    for (pass = 0; pass < 2; pass++) {        // pass 0: a faint brown under-stroke so the dashes read on sand
      ctx.beginPath();
      for (d = 1; d < 100; d += 5) { ctx.moveTo(pr.project(lay, d, DY).X, Y + 1 - pass); ctx.lineTo(pr.project(lay, d + 3, DY).X, Y + 1 - pass); }
      ctx.strokeStyle = pass ? col : 'rgba(110,63,26,0.22)'; ctx.lineWidth = pass ? w : w + 1;
      ctx.globalAlpha = pass ? keep * a : keep; ctx.stroke();
    }
    ctx.restore();
  }

  var api = { paintBackground: paintBackground, paintBackgroundLive: paintBackgroundLive, paintTable: paintTable, paintRoof: paintRoof,
    paintRoofLights: paintRoofLights, paintShadow: paintShadow, paintDangerLine: paintDangerLine, paintPalm: palm };
  Object.keys(api).forEach(function (n) { art[n] = api[n]; });
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
