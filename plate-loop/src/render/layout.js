// src/render/layout.js: design space (360 x 634 units) -> pixels for the current viewport, plus the belt path sampler.
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};

  var DESIGN_W = 360, DESIGN_H = 634;

  // ---- belt path: rounded closed polyline, walked clockwise --------------------------------------
  // Used only when PL.layouts.pointAt is not available; otherwise the layouts module is the single
  // source of truth for the geometry (so belt, plates and mouths agree by construction).

  function buildPath(tpl) {
    var pts = tpl.path, n = pts.length, corner = tpl.corner || 0, i, segs = [], total = 0;
    var corners = [];
    for (i = 0; i < n; i++) {
      var p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
      var d1x = p1.x - p0.x, d1y = p1.y - p0.y, l1 = Math.sqrt(d1x * d1x + d1y * d1y);
      var d2x = p2.x - p1.x, d2y = p2.y - p1.y, l2 = Math.sqrt(d2x * d2x + d2y * d2y);
      d1x /= l1; d1y /= l1; d2x /= l2; d2y /= l2;
      var cross = d1x * d2y - d1y * d2x, dot = d1x * d2x + d1y * d2y;
      var phi = Math.atan2(Math.abs(cross), dot);                 // turn angle
      var r = corner, t = r * Math.tan(phi / 2);
      var tmax = Math.min(l1, l2) / 2;
      if (phi < 1e-6) { t = 0; r = 0; } else if (t > tmax) { t = tmax; r = t / Math.tan(phi / 2); }
      var ax = p1.x - d1x * t, ay = p1.y - d1y * t, bx = p1.x + d2x * t, by = p1.y + d2y * t;
      var sgn = cross > 0 ? 1 : -1;
      var nx = -d1y * sgn, ny = d1x * sgn;                         // towards the turn side
      corners.push({ ax: ax, ay: ay, bx: bx, by: by, r: r, phi: phi, sgn: sgn, cx: ax + nx * r, cy: ay + ny * r, a: 0 });
      corners[i].a = Math.atan2(ay - corners[i].cy, ax - corners[i].cx);
    }
    // walk: arc of corner i, then the line to corner i+1
    for (i = 0; i < n; i++) {
      var c = corners[i], nxt = corners[(i + 1) % n];
      if (c.r > 0) {
        segs.push({ arc: true, len: c.r * c.phi, cx: c.cx, cy: c.cy, r: c.r, a0: c.a, da: c.phi * c.sgn, s0: total });
        total += c.r * c.phi;
      }
      var lx = nxt.ax - c.bx, ly = nxt.ay - c.by, ll = Math.sqrt(lx * lx + ly * ly);
      if (ll > 1e-6) {
        segs.push({ arc: false, len: ll, x0: c.bx, y0: c.by, dx: lx / ll, dy: ly / ll, s0: total });
        total += ll;
      }
    }
    function pointAt(s) {
      s = ((s % total) + total) % total;
      var k = 0;
      while (k < segs.length - 1 && s >= segs[k].s0 + segs[k].len) k++;
      var g = segs[k], f = s - g.s0;
      if (g.arc) {
        var a = g.a0 + (f / g.r) * (g.da > 0 ? 1 : -1);
        return { x: g.cx + Math.cos(a) * g.r, y: g.cy + Math.sin(a) * g.r, angle: a + (g.da > 0 ? 1 : -1) * Math.PI / 2 };
      }
      return { x: g.x0 + g.dx * f, y: g.y0 + g.dy * f, angle: Math.atan2(g.dy, g.dx) };
    }
    return { perimeter: total, pointAt: pointAt };
  }

  // sampler(tpl) -> { perimeter, pointAt(sCw) }, cached on the template
  function sampler(tpl) {
    if (tpl._plSampler) return tpl._plSampler;
    var res;
    if (PL.layouts && typeof PL.layouts.pointAt === 'function') {
      res = { perimeter: tpl.perimeter, pointAt: function (s) { return PL.layouts.pointAt(tpl, s); } };
    } else {
      var own = buildPath(tpl), k = tpl.perimeter ? own.perimeter / tpl.perimeter : 1;
      res = { perimeter: tpl.perimeter || own.perimeter, pointAt: function (s) { return own.pointAt(s * k); } };
    }
    tpl._plSampler = res;
    return res;
  }

  // points of the belt centreline every `step` units: [{x, y, angle}]
  function samplePath(tpl, step) {
    var sm = sampler(tpl), per = sm.perimeter, n = Math.max(8, Math.round(per / step)), out = [], i;
    for (i = 0; i < n; i++) out.push(sm.pointAt(per * i / n));
    return out;
  }

  // the box the board content occupies in design units (belt band + all slots)
  function contentBox(tpl) {
    if (!tpl) return { x: 0, y: 0, w: DESIGN_W, h: DESIGN_H };
    if (tpl._plBox) return tpl._plBox;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, half = (tpl.plate || 40) / 2 + 3, i, id;
    function add(x, y, e) { x0 = Math.min(x0, x - e); y0 = Math.min(y0, y - e); x1 = Math.max(x1, x + e); y1 = Math.max(y1, y + e); }
    if (tpl.path) {
      var pts = samplePath(tpl, 12);
      for (i = 0; i < pts.length; i++) add(pts[i].x, pts[i].y, half);
    }
    for (id in tpl.slots) {
      if (!tpl.slots.hasOwnProperty(id)) continue;
      var s = tpl.slots[id];
      x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x + s.w); y1 = Math.max(y1, s.y + s.h);
    }
    if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = DESIGN_W; y1 = DESIGN_H; }
    tpl._plBox = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    return tpl._plBox;
  }

  // compute(template, { w, h }, opts) -> { scale, ox, oy, w, h, gutter, box }
  // The board content (belt band and boxes) is fitted into the viewport with a 16 px gutter all round, aspect kept,
  // centred. x_px = ox + x_design * scale.
  function compute(tpl, vp, opts) {
    var w = vp.w, h = vp.h, box = contentBox(tpl);
    // 16 px gutter, but only 6 px on small phones (narrower than 420 or shorter than 700 px) so boxes stay as big as possible
    var gutter = opts && opts.gutter != null ? opts.gutter : (w < 420 || h < 700 ? 6 : 16);
    var scale = Math.min((w - 2 * gutter) / box.w, (h - 2 * gutter) / box.h);
    if (!(scale > 0)) scale = Math.max(0.1, Math.min(w / DESIGN_W, h / DESIGN_H));
    var ox = (w - box.w * scale) / 2 - box.x * scale;
    var oy = (h - box.h * scale) / 2 - box.y * scale;
    return { scale: scale, ox: ox, oy: oy, w: w, h: h, gutter: gutter, box: box };
  }

  function pt(L, x, y) { return { x: L.ox + x * L.scale, y: L.oy + y * L.scale }; }
  function rect(L, r) { return { x: L.ox + r.x * L.scale, y: L.oy + r.y * L.scale, w: r.w * L.scale, h: r.h * L.scale }; }
  function inv(L, px, py) { return { x: (px - L.ox) / L.scale, y: (py - L.oy) / L.scale }; }
  // arc length (clockwise units of the template) -> pixels { x, y, angle }
  function arc(L, tpl, s) {
    var p = sampler(tpl).pointAt(s);
    return { x: L.ox + p.x * L.scale, y: L.oy + p.y * L.scale, angle: p.angle };
  }

  PL.layout = {
    DESIGN_W: DESIGN_W, DESIGN_H: DESIGN_H,
    compute: compute, contentBox: contentBox, sampler: sampler, samplePath: samplePath,
    pt: pt, rect: rect, inv: inv, arc: arc
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.layout;
})(typeof window !== 'undefined' ? window : globalThis);
