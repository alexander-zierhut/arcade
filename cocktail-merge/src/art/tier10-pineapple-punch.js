// src/art/tier10-pineapple-punch.js: the T10 Pineapple Punch painter (DESIGN 4.3), registered as CM.art.tiers[10].
// Browser file (Canvas 2D only, Safari 15 safe). paint(ctx, h, opts) receives a ctx already in AUTHORING
// coordinates (R-units, base at y = +0.45, body rising toward negative y); h = {glass, garnish}.
// A mid-size, round-bellied "fishbowl" punch goblet (belly wider than the mouth, thick short stem, wide foot): the one
// shape no other tier has. Pineapple-gold drink, ice, pineapple chunks, two straws, a cherry, and a pineapple
// ring with a leaf crown slotted on the rim. opts.icon thickens straws, rind and crown veins a little.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var art = CM.art = CM.art || {};
  art.tiers = art.tiers || {};

  var TAU = Math.PI * 2;
  var RIM_Y = -1.3, RIM_RX = 0.70, FILL = -0.98;
  var STOPS = [[0, '#E0800C'], [0.5, '#FFA62B'], [1, '#FFE38A']], SURFACE = '#FFEBA6';
  var RING = [0.46, -1.27, 0.34];                       // pineapple ring: x, y, r
  var LEAF = { dark: '#2E9E4F', light: '#5FD27A', vein: '#B6EDB0' };

  function rad(d) { return d * Math.PI / 180; }

  /** Round belly 0.95 at -0.5, closing to a 0.70 mouth at -1.3. Bowl floor at +0.2 above a thick stem. */
  function outer(g) {
    return g.profile(0.1, 0.2, [
      ['C', 0.55, 0.2, 0.95, -0.1, 0.95, -0.5],
      ['C', 0.95, -0.9, 0.80, -1.12, RIM_RX, RIM_Y]
    ]);
  }
  function belowFront(c, y, rx, ry) {
    c.moveTo(-3, y); c.lineTo(-rx, y); c.ellipse(0, y, rx, ry, 0, Math.PI, 0, true);
    c.lineTo(3, y); c.lineTo(3, 4); c.lineTo(-3, 4); c.closePath();
  }
  function aboveFront(c, y, rx, ry) {
    c.moveTo(-3, -5); c.lineTo(3, -5); c.lineTo(3, y); c.lineTo(rx, y);
    c.ellipse(0, y, rx, ry, 0, 0, Math.PI, false); c.lineTo(-3, y); c.closePath();
  }
  function clipped(c, trace, fn) { c.save(); c.beginPath(); trace(c); c.clip(); fn(); c.restore(); }

  var STRAW = [-0.1, -0.15, -0.5, -2.2], STRAW_W = 0.13;
  /** One glass straw: a transparent tube (glass tint, dark outline, bright edge), dimmed and warmed below the surface. */
  function glassStraw(c, g, icon, below) {
    var w = icon ? 0.16 : STRAW_W, dx = STRAW[2] - STRAW[0], dy = STRAW[3] - STRAW[1], len = Math.sqrt(dx * dx + dy * dy);
    var nx = -dy / len * w / 2, ny = dx / len * w / 2;
    function tube(cc) {
      cc.moveTo(STRAW[0] + nx, STRAW[1] + ny); cc.lineTo(STRAW[2] + nx, STRAW[3] + ny);
      cc.lineTo(STRAW[2] - nx, STRAW[3] - ny); cc.lineTo(STRAW[0] - nx, STRAW[1] - ny); cc.closePath();
    }
    c.save();
    if (below) c.globalAlpha *= 0.6;
    c.beginPath(); tube(c); c.fillStyle = below ? 'rgba(255,190,90,0.22)' : 'rgba(220,245,255,0.2)'; c.fill();
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(STRAW[0] - nx, STRAW[1] - ny); c.lineTo(STRAW[2] - nx, STRAW[3] - ny);   // thin dark edge (right)
    c.strokeStyle = below ? 'rgba(150,70,0,0.35)' : 'rgba(40,60,80,0.4)'; c.lineWidth = icon ? 0.03 : 0.018; c.stroke();
    c.beginPath(); c.moveTo(STRAW[0] + nx, STRAW[1] + ny); c.lineTo(STRAW[2] + nx, STRAW[3] + ny);   // thin bright edge (left)
    c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = icon ? 0.035 : 0.022; c.stroke();
    c.beginPath(); c.ellipse(STRAW[2], STRAW[3], w / 2, w / 2 * g.K_RIM, Math.atan2(dy, dx), 0, TAU);
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 0.018; c.stroke();
    c.restore();
  }

  /** A pineapple chunk: golden cube with a darker top and a crosshatched rind side. */
  function chunk(c, x, y, s, rot) {
    var k = s * 0.24, L = -s / 2, T = -s / 2, R = s / 2, B = s / 2;
    c.save(); c.translate(x, y); c.rotate(rad(rot)); c.lineJoin = 'round'; c.lineWidth = s * 0.06; c.strokeStyle = 'rgba(190,120,0,0.7)';
    c.beginPath(); c.rect(L, T + k, s - k, s - k); c.fillStyle = '#FFD84D'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(L, T + k); c.lineTo(L + k, T); c.lineTo(R, T); c.lineTo(R - k, T + k); c.closePath();
    c.fillStyle = '#FFEE96'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(R - k, T + k); c.lineTo(R, T); c.lineTo(R, B - k); c.lineTo(R - k, B); c.closePath();
    c.fillStyle = '#D9A21B'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(L + s * 0.14, T + k + s * 0.14); c.lineTo(L + s * 0.14, B - s * 0.2);
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = s * 0.07; c.lineCap = 'round'; c.stroke();
    c.restore();
  }

  /** Ice cube with a crisper look: a faint dark under-outline, a bright white edge and a highlight corner. */
  function ice(c, gn, x, y, sz, rot) {
    var h = sz / 2;
    c.save(); c.translate(x, y); c.rotate(rad(rot)); c.lineJoin = 'round';
    c.beginPath(); c.rect(-h, -h, sz, sz); c.strokeStyle = 'rgba(150,70,0,0.3)'; c.lineWidth = 0.05; c.stroke();
    c.restore();
    gn.iceCube(c, x, y, sz, rot);
    c.save(); c.translate(x, y); c.rotate(rad(rot)); c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); c.rect(-h, -h, sz, sz); c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 0.03; c.stroke();
    c.beginPath(); c.moveTo(-h * 0.75, h * 0.1); c.lineTo(-h * 0.75, -h * 0.75); c.lineTo(h * 0.1, -h * 0.75);
    c.strokeStyle = '#FFFFFF'; c.lineWidth = 0.05; c.stroke();
    c.restore();
  }

  /** Steps 3-4: gradient drink, straws (dim below the surface), chunks, ice, bubbles, floating cherry. */
  function drink(c, g, gn, info) {
    var rx = info.surfaceRx, ry = g.K_RIM * rx;
    function sub(cc) { belowFront(cc, FILL, rx, ry); }
    function air(cc) { aboveFront(cc, FILL, rx, ry); }
    clipped(c, sub, function () { glassStraw(c, g, false, true); });
    clipped(c, air, function () { glassStraw(c, g, false, false); });
    chunk(c, 0.18, -0.2, 0.24, 12); chunk(c, -0.52, -0.3, 0.22, -18); chunk(c, 0.52, -0.55, 0.2, 25);
    clipped(c, sub, function () { c.fillStyle = 'rgba(255,150,20,0.1)'; c.fillRect(-1.2, FILL, 2.4, 2); });   // tints the chunks only
    ice(c, gn, -0.32, -0.62, 0.4, 12);
    ice(c, gn, 0.3, -0.66, 0.38, -14);
    ice(c, gn, -0.05, -0.22, 0.36, 28);
    gn.bubbles(c, 10, { x0: -0.7, y0: -0.85, x1: 0.7, y1: 0.1 }, info.rnd);
    ice(c, gn, -0.42, FILL + 0.02, 0.38, -10);                   // floating cubes poke above the surface
    ice(c, gn, 0.12, FILL + 0.06, 0.34, 16);
    c.save(); c.lineCap = 'round'; c.beginPath(); g.halfEllipse(c, 0, FILL, rx, ry, 'front');
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 0.035; c.stroke(); c.restore();
    gn.cherry(c, 0.14, FILL + 0.1, 0.15, '#C3102F', { stem: false });
  }

  /** Spiky crown: 7 narrow leaves fanning from the top of the ring. */
  function crown(c, gn, icon) {
    var x = RING[0] + 0.02, y = RING[1] - RING[2] + 0.06, angs = [-62, -40, -20, 0, 20, 40, 62], lens = [0.42, 0.54, 0.62, 0.68, 0.6, 0.52, 0.4];
    angs.forEach(function (a, i) { gn.leaf(c, x, y, lens[i], icon ? 0.12 : 0.1, a, LEAF); });
  }

  /** The ring: rind, pith, golden flesh with a crosshatch of "eyes" and a pale core. */
  function ring(c, icon) {
    var x = RING[0], y = RING[1], r = RING[2], i, gr;
    c.save(); c.translate(x, y); c.rotate(rad(10));
    c.beginPath(); c.arc(0.03, 0.045, r, 0, TAU); c.fillStyle = 'rgba(90,40,10,0.14)'; c.fill();
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = '#C98A12'; c.fill();
    c.beginPath(); c.arc(0, 0, r * 0.86, 0, TAU); c.fillStyle = '#FFF2B8'; c.fill();
    gr = c.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r * 0.8);
    gr.addColorStop(0, '#FFEC7A'); gr.addColorStop(1, '#FFC93C');
    c.beginPath(); c.arc(0, 0, r * 0.78, 0, TAU); c.fillStyle = gr; c.fill();
    c.save(); c.beginPath(); c.arc(0, 0, r * 0.78, 0, TAU); c.clip();
    c.strokeStyle = 'rgba(217,150,20,0.55)'; c.lineWidth = icon ? 0.03 : 0.02;
    for (i = -3; i <= 3; i++) {
      c.beginPath(); c.moveTo(-r, i * r * 0.27 - r); c.lineTo(r, i * r * 0.27 + r); c.stroke();
      c.beginPath(); c.moveTo(-r, i * r * 0.27 + r); c.lineTo(r, i * r * 0.27 - r); c.stroke();
    }
    c.restore();
    c.beginPath(); c.arc(0, 0, r * 0.2, 0, TAU); c.fillStyle = '#FFF6D0'; c.fill();
    c.strokeStyle = '#E0B040'; c.lineWidth = 0.02; c.stroke();
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.strokeStyle = 'rgba(160,100,0,0.7)'; c.lineWidth = 0.025; c.stroke();
    c.restore();
  }

  /** The ring slotted on the right rim: the part inside the glass is tinted, the front rim runs over it. */
  /** The notch: a wedge cut from the ring's lower edge in towards its centre (half-angle NOTCH_A, apex at 0.2 r). */
  var NOTCH_A = 15, NOTCH_DIR = 70;      // half-angle; axis angle (deg, clockwise from +x): normal to the rim's tangent there
  function notchPts() {
    var r = RING[2], a0 = rad(NOTCH_DIR - NOTCH_A), a1 = rad(NOTCH_DIR + NOTCH_A), a = rad(NOTCH_DIR), R = r * 1.25;
    return [[RING[0] + Math.cos(a) * r * 0.2, RING[1] + Math.sin(a) * r * 0.2],
      [RING[0] + Math.cos(a0) * R, RING[1] + Math.sin(a0) * R], [RING[0] + Math.cos(a1) * R, RING[1] + Math.sin(a1) * R]];
  }
  function notchPath(c) {
    var p = notchPts(); c.moveTo(p[0][0], p[0][1]); c.lineTo(p[1][0], p[1][1]); c.lineTo(p[2][0], p[2][1]); c.closePath();
  }
  /** The two cut faces: a darker flesh strip along each side of the notch, with a fine edge. */
  function cutFaces(c) {
    var p = notchPts(), k, q, dx, dy, len, nx, ny, w = 0.035, sgn = [1, -1];
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); c.arc(RING[0], RING[1], RING[2], 0, TAU); c.clip();
    for (k = 1; k <= 2; k++) {
      q = p[k]; dx = q[0] - p[0][0]; dy = q[1] - p[0][1]; len = Math.sqrt(dx * dx + dy * dy);
      nx = -dy / len * w * sgn[k - 1]; ny = dx / len * w * sgn[k - 1];
      c.beginPath(); c.moveTo(p[0][0], p[0][1]); c.lineTo(q[0], q[1]); c.lineTo(q[0] + nx, q[1] + ny); c.lineTo(p[0][0] + nx, p[0][1] + ny);
      c.closePath(); c.fillStyle = '#E3A41C'; c.fill();
      c.beginPath(); c.moveTo(p[0][0], p[0][1]); c.lineTo(q[0], q[1]);
      c.strokeStyle = 'rgba(150,90,0,0.8)'; c.lineWidth = 0.02; c.stroke();
    }
    c.restore();
  }
  function slottedRing(c, g, info, icon) {
    var r = RING[2], ry = g.K_RIM * RIM_RX;
    crown(c, info.gn, icon);
    c.save(); c.beginPath(); c.rect(-3, -4, 6, 6); notchPath(c); c.clip('evenodd');   // the cut: glass shows through
    ring(c, icon);
    c.save();
    c.beginPath(); c.arc(RING[0], RING[1], r + 0.02, 0, TAU); c.clip();
    c.beginPath(); info.traceBody(c); c.clip();
    c.beginPath(); belowFront(c, RIM_Y, RIM_RX, ry); c.clip();
    c.fillStyle = 'rgba(220,245,255,0.38)'; c.fillRect(RING[0] - r - 0.1, RING[1] - r - 0.1, 2 * r + 0.2, 2 * r + 0.2);
    c.restore();
    c.restore();
    cutFaces(c);
    c.save(); c.beginPath(); c.arc(RING[0], RING[1], r + 0.05, 0, TAU); c.clip();
    g.rim(c, RIM_Y, RIM_RX, 'front'); c.restore();
    c.save(); c.beginPath(); c.arc(RING[0], RING[1], r, 0, TAU); c.clip();       // the far rim shows through the slice
    c.globalAlpha *= 0.45; g.rim(c, RIM_Y, RIM_RX, 'back'); c.restore();
  }

  function paint(ctx, h, opts) {
    var g = h.glass, gn = h.garnish, icon = !!(opts && opts.icon), P = outer(g);
    return g.paint(ctx, {
      profile: P, tier: 10,
      stem: { top: 0.18, bottom: 0.43, w: 0.2 },
      foot: { y: 0.45, rx: 0.62 },
      liquid: { fill: FILL, stops: STOPS, surface: SURFACE },
      contents: function (c, info) { drink(c, g, gn, info); },
      condensation: 6,
      highlights: { left: [0.2, 0.86], right: [0.3, 0.68], sparkle: false },
      front: function (c, info) {
        info.gn = gn;
        clipped(c, function (cc) { aboveFront(cc, RIM_Y, RIM_RX, g.K_RIM * RIM_RX); }, function () { glassStraw(c, g, icon, false); });
        // sparkle on the belly highlight
        c.beginPath(); g.ellipsePath(c, -0.62, -0.9, 0.1, 0.1); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fill();
        g.sparkle(c, -0.62, -0.9, 0.11, 0.95);
        slottedRing(c, g, info, icon);
      }
    }, opts);
  }

  art.tiers[10] = {
    key: '#FFA62B',
    accent: '#2E9E4F',
    paint: paint,
    particles: [{ shape: 'wedge', color: '#FFD84D' }, { shape: 'wedge', color: '#FFA62B' },
      { shape: 'circle', color: '#FFEB8A' }, { shape: 'leaf', color: '#2E9E4F' }]
  };
  if (typeof module === 'object' && module && module.exports) module.exports = art.tiers[10];
})(typeof globalThis !== 'undefined' ? globalThis : this);
