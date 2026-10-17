// src/art/tier5-margarita.js: the T4 Margarita painter (DESIGN 4.3). A wide, shallow coupe ("sombrero"),
// clearly different from T3's deep V: a frosty lime-yellow drink, a thick salt rim and a lime wedge perched
// outside the left rim. Browser file (Canvas 2D only, Safari 15 safe); registers CM.art.tiers[5].
// All numbers are R-units in authoring coordinates (base at y = +0.45, the glass rises toward negative y).
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var art = CM.art = CM.art || {};
  art.tiers = art.tiers || {};

  // Deeper than the 4.3 numbers (owner feedback): rim at -0.95, bowl bottom at -0.10, so the drink shows a
  // real body through the glass below its surface instead of only a thin disc.
  var RIM_Y = -0.95, RIM_RX = 0.95, FILL = -0.80, BOWL_Y = -0.10;
  var LIQ_TOP = '#F0F59A', LIQ_BOTTOM = '#B5D43B', SURFACE = '#F7FAC8', FROST = '#FAFDD8';
  var SALT = ['#FFFFFF', '#E9E9E9'];

  /** Outer bowl: from the stem (half-width 0.07 at -0.10), cubic sides (controls (0.55,-0.12), (0.96,-0.42)) to the rim. */
  function bowl(g) { return g.profile(0.07, BOWL_Y, [['C', 0.55, BOWL_Y - 0.02, 0.96, -0.42, RIM_RX, RIM_Y]]); }
  /** Interior of the bowl (the outer bowl inset by about 0.06), used as the liquid clip. */
  function bowlInner(g) { return g.profile(0.02, BOWL_Y - 0.07, [['C', 0.48, BOWL_Y - 0.09, 0.9, -0.44, 0.89, RIM_Y]]); }

  /** Region below the front half of the ellipse (0, y, rx, ry); adds a subpath only. */
  function belowFront(c, y, rx, ry) {
    c.moveTo(-3, y); c.lineTo(-rx, y); c.ellipse(0, y, rx, ry, 0, Math.PI, 0, true);
    c.lineTo(3, y); c.lineTo(3, 4); c.lineTo(-3, 4); c.closePath();
  }

  /** Step 3/4: the shallow frozen drink inside the coupe, with a radial depth tint and frosty speckles. */
  function drink(c, g, PI, rnd) {
    var rx = g.halfWidthAt(PI, FILL), ry = g.K_RIM * rx, i, x, y, r, n, gr;
    var trIn = function (cc) { g.traceBody(cc, PI); };
    g.liquid(c, trIn, { fill: FILL, surface: SURFACE, colors: [LIQ_TOP, LIQ_BOTTOM], rx: rx, bottom: BOWL_Y });
    // the visible side of the drink below the surface: a slightly deeper lime band
    g.withClip(c, trIn, function () {
      c.save(); c.beginPath(); belowFront(c, FILL, rx, ry); c.clip();
      var gb = c.createLinearGradient(0, FILL, 0, BOWL_Y);
      gb.addColorStop(0, 'rgba(198,224,90,0.22)'); gb.addColorStop(1, 'rgba(150,190,40,0.5)');
      c.fillStyle = gb; c.fillRect(-1, FILL, 2, BOWL_Y - FILL + 0.1);
      c.beginPath(); c.ellipse(-0.42, (FILL + BOWL_Y) / 2 + 0.12, 0.09, 0.2, g.rad(-28), 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,230,0.35)'; c.fill();             // a soft refraction glow in the body
      c.restore();
    });
    // surface depth: brighter centre-left, a lime ring toward the glass wall (radial, squashed to the ellipse)
    c.save();
    c.beginPath(); g.ellipsePath(c, 0, FILL, rx, ry); c.clip();
    c.translate(0, FILL); c.scale(1, g.K_RIM);
    gr = c.createRadialGradient(-0.25 * rx, -0.2 * rx, 0.05, 0, 0, rx);
    gr.addColorStop(0, 'rgba(255,255,236,0.5)'); gr.addColorStop(0.3, 'rgba(225,240,140,0.12)');
    gr.addColorStop(0.68, 'rgba(198,224,90,0.42)'); gr.addColorStop(1, 'rgba(160,195,45,0.68)');
    c.fillStyle = gr; c.fillRect(-rx, -rx, 2 * rx, 2 * rx);
    c.restore();
    // 12 frosty speckles scattered over the surface (rejection sampling inside 85 % of the ellipse)
    c.save();
    for (n = 0, i = 0; n < 12 && i < 200; i++) {
      x = (rnd() * 2 - 1) * 0.85 * rx; y = (rnd() * 2 - 1) * 0.85 * ry;
      r = 0.022 + 0.02 * rnd();
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) > 0.72) continue;
      n++;
      c.beginPath(); c.arc(x, FILL + y, r, 0, Math.PI * 2); c.fillStyle = FROST; c.fill();
      c.beginPath(); c.arc(x - r * 0.3, FILL + y - r * 0.3, r * 0.4, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.95)'; c.fill();
    }
    c.restore();
    g.sparkle(c, -0.42 * rx, FILL - 0.25 * ry, 0.07, 0.9);
  }

  /**
   * The salt rim: a thick white band (0.19 at the front, thinning toward the back) on the rim's outer side,
   * never hanging below the bowl outline, with a soft shadow under it, a grey inner edge that separates it
   * from the pale drink, a crust of angular crystals along its lower edge, plus 24 salt dots (r 0.04, alternating #FFFFFF / #E9E9E9) every
   * 15 deg +- 4 deg along the rim ellipse.
   */
  function saltRim(c, g, gn, P, rnd) {
    var ry = g.K_RIM * RIM_RX, ox = RIM_RX + 0.01, oy = ry + 0.13, oc = RIM_Y + 0.065, gr, i, a, x, y;
    c.save();
    // clip: the glass body OR anything above the rim line (both subpaths wound the same way: a union)
    c.beginPath(); g.traceBody(c, P);
    c.moveTo(-3, -4); c.lineTo(-3, RIM_Y); c.lineTo(3, RIM_Y); c.lineTo(3, -4); c.closePath();
    c.clip();
    function band(cc) { g.ellipsePath(cc, 0, oc, ox, oy); g.ellipsePath(cc, 0, RIM_Y, RIM_RX - 0.012, ry - 0.012); }
    c.beginPath(); g.halfEllipse(c, 0, oc + 0.03, ox - 0.02, oy, 'front');    // shadow on the glass under the band
    c.strokeStyle = 'rgba(70,95,40,0.2)'; c.lineWidth = 0.05; c.stroke();
    gr = c.createLinearGradient(0, RIM_Y - ry, 0, oc + oy);
    gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(0.55, '#FBFCFC'); gr.addColorStop(0.85, '#F1F4F5');
    gr.addColorStop(1, '#DDE3E6');
    c.beginPath(); band(c); c.fillStyle = gr; c.fill('evenodd');
    // crystalline texture inside the band
    c.save(); c.beginPath(); band(c); c.clip('evenodd');
    gn.specks(c, 46, { x0: -1.0, y0: RIM_Y - ry - 0.06, x1: 1.0, y1: oc + oy }, [0.01, 0.022],
      ['#E3E8EB', '#FFFFFF', '#D6DDE1', '#FFFFFF'], rnd);
    c.restore();
    // a soft grey lower edge for definition, then a rough crust of grains along it
    c.lineCap = 'round';
    c.beginPath(); g.halfEllipse(c, 0, oc, ox, oy, 'front');
    c.strokeStyle = 'rgba(110,125,135,0.5)'; c.lineWidth = 0.022; c.stroke();
    c.beginPath(); g.ellipsePath(c, 0, RIM_Y, RIM_RX - 0.012, ry - 0.012);   // inner edge against the drink
    c.strokeStyle = 'rgba(110,125,135,0.4)'; c.lineWidth = 0.018; c.stroke();
    for (i = 0; i < 30; i++) {                      // angular crystals along the lower edge
      a = g.rad(10 + 160 * (i + 0.5) / 30 + (rnd() * 4 - 2));
      x = Math.cos(a) * (ox - 0.01); y = oc + Math.sin(a) * (oy - 0.01);
      c.save(); c.translate(x, y); c.rotate(rnd() * Math.PI);
      var q = 0.026 + 0.016 * rnd();
      c.fillStyle = 'rgba(90,105,115,0.35)'; c.fillRect(-q / 2 + 0.008, -q / 2 + 0.01, q, q);
      c.fillStyle = i % 3 ? '#FFFFFF' : '#EEF2F4'; c.fillRect(-q / 2, -q / 2, q, q);
      c.restore();
    }
    c.restore();
    // 24 salt dots along the rim ellipse, each with a faint grey shadow
    c.save();
    for (i = 0; i < 24; i++) {
      a = g.rad(i * 15 + (rnd() * 8 - 4));
      x = Math.cos(a) * RIM_RX; y = RIM_Y + Math.sin(a) * ry;
      c.beginPath(); c.arc(x + 0.008, y + 0.012, 0.04, 0, Math.PI * 2);
      c.fillStyle = 'rgba(90,100,110,0.28)'; c.fill();
      c.beginPath(); c.arc(x, y, 0.04, 0, Math.PI * 2); c.fillStyle = SALT[i % 2]; c.fill();
    }
    c.restore();
  }

  /** A soft shadow under a half-disc wedge (same transform as citrusWedge), so the garnish sits on the glass. */
  function wedgeShadow(c, g, x, y, r, rot) {
    c.save(); c.translate(x + 0.03, y + 0.045); c.rotate(g.rad(rot));
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI); c.closePath();
    c.fillStyle = 'rgba(40,60,20,0.18)'; c.fill();
    c.restore();
  }

  var VISUAL_SCALE = 1.08;   // owner: the coupe looked too small for its slot (collider unchanged)
  function paint(ctx, h, opts) {
    var g = h.glass, gn = h.garnish, P = bowl(g), PI = bowlInner(g), info;
    ctx.save();
    ctx.translate(0, g.BASE_Y); ctx.scale(VISUAL_SCALE, VISUAL_SCALE); ctx.translate(0, -g.BASE_Y);
    info = g.paint(ctx, {
      profile: P, tier: 5,
      stem: { top: BOWL_Y - 0.02, bottom: 0.35, w: 0.09 },
      foot: { y: 0.45, rx: 0.6 },
      liquid: null,                                   // drawn in contents, clipped to the true bowl interior
      contents: function (c, info) { drink(c, g, PI, info.rnd); },
      highlights: { left: [0.05, 0.6], right: [0.1, 0.55], inset: 0.12, sparkle: false },
      front: function (c, info) {
        saltRim(c, g, gn, P, info.rnd);
        wedgeShadow(c, g, -1.0, -0.95, 0.40, -35);
        gn.citrusWedge(c, -1.0, -0.95, 0.40, -35, gn.PAL.lime, 4);
        g.sparkle(c, -0.58, -1.13, 0.09);
        g.sparkle(c, 0.02, 0.0, 0.05, 0.8);         // a glint on the stem
      }
    }, opts);
    ctx.restore();
    return info;
  }

  art.tiers[5] = {
    key: 'margarita', name: 'Margarita', color: '#C6E05A', paint: paint,
    // 4.3: lime-yellow droplets and salt
    particles: [
      { shape: 'circle', color: '#C6E05A' }, { shape: 'circle', color: '#E6F28C' },
      { shape: 'square', color: '#FFFFFF' }, { shape: 'square', color: '#E9E9E9' }
    ]
  };
  if (typeof module === 'object' && module && module.exports) module.exports = art.tiers[5];
})(typeof globalThis !== 'undefined' ? globalThis : this);
