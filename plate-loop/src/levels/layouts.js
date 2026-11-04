// src/levels/layouts.js: the board templates (belt path, box slots, neighbours) in design units; no DOM
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};

  var PLATE = 40;

  // ---- the rounded closed path -------------------------------------------------------------
  // The polyline is walked in its given order (clockwise on screen, y down). Every vertex is replaced by a circular arc
  // of radius `corner` tangent to both edges. s = 0 is the start of the first straight run, i.e. the end of the
  // arc at path[0]. Pieces: { type:'line'|'arc', s0, len, ... } in order of s.
  var cache = {};

  function pieces(path, corner) {
    var key = corner + ':' + JSON.stringify(path);
    if (cache[key]) return cache[key];
    var n = path.length, i, v = [];
    for (i = 0; i < n; i++) {
      var p = path[(i + n - 1) % n], c = path[i], q = path[(i + 1) % n];
      var ix = c.x - p.x, iy = c.y - p.y, il = Math.sqrt(ix * ix + iy * iy);
      var ox = q.x - c.x, oy = q.y - c.y, ol = Math.sqrt(ox * ox + oy * oy);
      ix /= il; iy /= il; ox /= ol; oy /= ol;
      var cross = ix * oy - iy * ox, dot = ix * ox + iy * oy;
      var phi = Math.atan2(Math.abs(cross), dot);
      var t = corner * Math.tan(phi / 2);
      var sign = cross >= 0 ? 1 : -1;
      var ax = c.x - ix * t, ay = c.y - iy * t;            // arc start
      var bx = c.x + ox * t, by = c.y + oy * t;            // arc end
      var cx = ax + sign * (-iy) * corner, cy = ay + sign * ix * corner;   // arc centre
      v.push({ ax: ax, ay: ay, bx: bx, by: by, cx: cx, cy: cy, sign: sign, phi: phi, a0: Math.atan2(ay - cy, ax - cx) });
    }
    var out = [], s = 0;
    function addLine(x0, y0, x1, y1) {
      var len = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
      if (len < 1e-9) return;
      out.push({ type: 'line', s0: s, len: len, x0: x0, y0: y0, dx: (x1 - x0) / len, dy: (y1 - y0) / len });
      s += len;
    }
    function addArc(a) {
      var len = corner * a.phi;
      if (len < 1e-9) return;
      out.push({ type: 'arc', s0: s, len: len, cx: a.cx, cy: a.cy, r: corner, a0: a.a0, sign: a.sign, phi: a.phi });
      s += len;
    }
    for (i = 0; i < n; i++) {
      var nx = v[(i + 1) % n];
      addLine(v[i].bx, v[i].by, nx.ax, nx.ay);
      addArc(nx);
    }
    out.total = s;
    cache[key] = out;
    return out;
  }

  function measure(path, corner) { return pieces(path, corner).total; }

  function pieceAt(pc, s) {
    for (var i = 0; i < pc.length; i++) {
      if (s < pc[i].s0 + pc[i].len || i === pc.length - 1) return pc[i];
    }
    return pc[0];
  }

  // pointAt(layout, s) -> { x, y, angle }  (angle in radians, direction of travel, atan2 convention with y down)
  function pointAt(layout, s) {
    var pc = pieces(layout.path, layout.corner), L = pc.total;
    s = ((s % L) + L) % L;
    var p = pieceAt(pc, s), u = s - p.s0;
    if (p.type === 'line') {
      return { x: p.x0 + p.dx * u, y: p.y0 + p.dy * u, angle: Math.atan2(p.dy, p.dx) };
    }
    var a = p.a0 + p.sign * u / p.r;
    return {
      x: p.cx + p.r * Math.cos(a), y: p.cy + p.r * Math.sin(a),
      angle: Math.atan2(p.sign * Math.cos(a), -p.sign * Math.sin(a))
    };
  }

  // project(layout, x, y) -> { s, x, y, d }: the nearest point of the rounded path to (x, y), its arc length and distance
  function project(layout, x, y) {
    var pc = pieces(layout.path, layout.corner), best = null;
    for (var i = 0; i < pc.length; i++) {
      var p = pc[i], u, qx, qy;
      if (p.type === 'line') {
        u = (x - p.x0) * p.dx + (y - p.y0) * p.dy;
        u = Math.max(0, Math.min(p.len, u));
        qx = p.x0 + p.dx * u; qy = p.y0 + p.dy * u;
      } else {
        var rel = p.sign * (Math.atan2(y - p.cy, x - p.cx) - p.a0);
        rel = ((rel % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        if (rel > p.phi) rel = (rel - p.phi < 2 * Math.PI - rel) ? p.phi : 0;   // outside the arc: nearer end
        u = rel * p.r;
        var a = p.a0 + p.sign * rel;
        qx = p.cx + p.r * Math.cos(a); qy = p.cy + p.r * Math.sin(a);
      }
      var d = Math.sqrt((x - qx) * (x - qx) + (y - qy) * (y - qy));
      if (!best || d < best.d) best = { s: p.s0 + u, x: qx, y: qy, d: d };
    }
    return best;
  }

  // ---- slots -------------------------------------------------------------------------------
  function mouthPoint(slot) {
    switch (slot.mouth) {
      case 'left': return { x: slot.x, y: slot.y + slot.h / 2 };
      case 'right': return { x: slot.x + slot.w, y: slot.y + slot.h / 2 };
      case 'up': return { x: slot.x + slot.w / 2, y: slot.y };
      default: return { x: slot.x + slot.w / 2, y: slot.y + slot.h };   // 'down'
    }
  }

  function finish(layout) {
    layout.perimeter = measure(layout.path, layout.corner);
    var ids = [], id;
    for (id in layout.slots) if (Object.prototype.hasOwnProperty.call(layout.slots, id)) {
      var m = mouthPoint(layout.slots[id]);
      layout.slots[id].s = Math.round(project(layout, m.x, m.y).s * 100) / 100;
      ids.push(id);
    }
    // drawing order: boxes never overlap, so any order is correct; ascending s keeps each run increasing
    ids.sort(function (a, b) { return layout.slots[a].s - layout.slots[b].s; });
    layout.order = ids;
    return layout;
  }

  function chain(prefix, count, neighbours) {
    for (var i = 1; i <= count; i++) {
      var list = [];
      if (i > 1) list.push(prefix + (i - 1));
      if (i < count) list.push(prefix + (i + 1));
      neighbours[prefix + i] = list;
    }
  }

  // ring-2col: belt round the edge (centreline inset 28), two columns of 7 horizontal boxes inside.
  // Inner width between the clearance lines (inset + plate/2 + 4) is 360 - 2*52 = 256, so two columns of 124 + gap 8.
  function ringTwoCol() {
    var INSET = 28, W = 360, H = 634, BW = 124, BH = 44, PITCH = 48, ROWS = 7;
    var y0 = (H - ((ROWS - 1) * PITCH + BH)) / 2;                        // 151
    var xL = INSET + PLATE / 2 + 4, xR = W - INSET - PLATE / 2 - 4 - BW;  // 52, 184
    var slots = {}, neighbours = {}, i;
    for (i = 1; i <= ROWS; i++) {
      slots['L' + i] = { x: xL, y: y0 + (i - 1) * PITCH, w: BW, h: BH, mouth: 'left', s: 0 };
      slots['R' + i] = { x: xR, y: y0 + (i - 1) * PITCH, w: BW, h: BH, mouth: 'right', s: 0 };
    }
    chain('L', ROWS, neighbours);
    chain('R', ROWS, neighbours);
    return finish({
      name: 'ring-2col',
      path: [{ x: INSET, y: INSET }, { x: W - INSET, y: INSET }, { x: W - INSET, y: H - INSET }, { x: INSET, y: H - INSET }],
      corner: 24, perimeter: 0, plate: PLATE, slots: slots, neighbours: neighbours, order: []
    });
  }

  // counter: wide ring across the middle band (centreline y 168..468, x 28..332), five vertical boxes above (mouth down),
  // five below (mouth up), two horizontal boxes inside (I1 right, I2 left).
  function counter() {
    var X0 = 28, X1 = 332, YT = 168, YB = 468, CL = PLATE / 2 + 4;       // clearance 24
    var BL = 132, BT = 44, PITCH = 54, slots = {}, neighbours = {}, i;
    for (i = 0; i < 5; i++) {
      var x = 180 - BT / 2 + (i - 2) * PITCH;
      slots['T' + (i + 1)] = { x: x, y: YT - CL - BL, w: BT, h: BL, mouth: 'down', s: 0 };
      slots['B' + (i + 1)] = { x: x, y: YB + CL, w: BT, h: BL, mouth: 'up', s: 0 };
    }
    var midY = (YT + YB) / 2;                                            // 318
    slots.I1 = { x: X1 - CL - BL, y: midY - 4 - BT, w: BL, h: BT, mouth: 'right', s: 0 };
    slots.I2 = { x: X0 + CL, y: midY + 4, w: BL, h: BT, mouth: 'left', s: 0 };
    chain('T', 5, neighbours);
    chain('B', 5, neighbours);
    neighbours.I1 = ['I2'];
    neighbours.I2 = ['I1'];
    return finish({
      name: 'counter',
      path: [{ x: X0, y: YT }, { x: X1, y: YT }, { x: X1, y: YB }, { x: X0, y: YB }],
      corner: 40, perimeter: 0, plate: PLATE, slots: slots, neighbours: neighbours, order: []
    });
  }

  // ---- public API --------------------------------------------------------------------------
  var layouts = {
    'ring-2col': ringTwoCol(),
    'counter': counter(),
    list: function () { return ['ring-2col', 'counter']; },
    // mouths(layout, boxIds, dir) -> [{ box: index into boxIds, s }] in travel-direction units
    mouths: function (layout, boxIds, dir) {
      var out = [];
      for (var i = 0; i < boxIds.length; i++) {
        var slot = layout.slots[boxIds[i]];
        if (!slot) throw new Error('layout ' + layout.name + ': unknown box id ' + boxIds[i]);
        out.push({ box: i, s: dir === 'ccw' ? layout.perimeter - slot.s : slot.s });
      }
      return out;
    },
    measure: measure,
    pointAt: pointAt,
    project: project,
    mouthPoint: mouthPoint
  };

  PL.layouts = layouts;
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.layouts;
})(typeof window !== 'undefined' ? window : globalThis);
