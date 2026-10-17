// src/art/tier1-shot.js: the T1 Tequila Shot painter (DESIGN 4.3), registered as CM.art.tiers[1].
// Browser file (Canvas 2D only, Safari 15 safe). paint(ctx, h, opts) receives a ctx that sprites.js has
// already put into AUTHORING coordinates (R-units, base at y = +0.45, the glass rises toward negative y);
// h = {glass: CM.art.glass, garnish: CM.art.garnish}; opts.icon selects icon mode (no T1 differences).
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var art = CM.art = CM.art || {};
  art.tiers = art.tiers || {};

  var KEY = '#F5C542';
  var RIM_Y = -0.95, RIM_RX = 0.95;
  var WHEEL = { x: 0.6, y: -1.0, r: 0.42, rot: -20, seg: 8 };

  /**
   * Re-draws the glass in front of the lower third of a garnish slotted onto the rim (4.3 T3 technique,
   * used here for the lime wheel): inside the wheel's lower third, the part below the front rim gets a
   * glass-tint wash, then the glass edge and the front rim stroke are drawn again over the fruit.
   */
  function slotOver(ctx, g, info, cx, cy, r) {
    var ry = g.K_RIM * info.rimRx;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.03, 0, Math.PI * 2); ctx.clip();
    ctx.beginPath(); ctx.rect(cx - r - 0.2, cy + r / 3, 2 * r + 0.4, r + 0.2); ctx.clip();
    ctx.save();
    ctx.beginPath(); info.traceBody(ctx); ctx.clip();
    ctx.beginPath(); ctx.moveTo(-info.rimRx - 2, info.rimY); ctx.lineTo(-info.rimRx, info.rimY);
    ctx.ellipse(0, info.rimY, info.rimRx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(info.rimRx + 2, info.rimY); ctx.lineTo(info.rimRx + 2, 2); ctx.lineTo(-info.rimRx - 2, 2); ctx.closePath();
    ctx.clip();
    ctx.fillStyle = g.COL.tint; ctx.fillRect(cx - r - 0.2, cy - r, 2 * r + 0.4, 2 * r + 0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(cx - r - 0.2, cy - r, 2 * r + 0.4, 2 * r + 0.4);
    ctx.restore();
    g.edge(ctx, info.traceBody);
    g.rim(ctx, info.rimY, info.rimRx, 'front');
    ctx.restore();
  }

  /** Salt crystals along the left rim: 6 white specks r 0.04, each with a faint grey shadow so it reads on glass. */
  function saltRim(ctx, gar, rnd) {
    var arc = { cx: 0, cy: RIM_Y, rx: RIM_RX, ry: 0.42 * RIM_RX, a0: 118, a1: 238 };
    var shadowArc = { cx: 0.006, cy: RIM_Y + 0.014, rx: RIM_RX, ry: arc.ry, a0: arc.a0, a1: arc.a1 };
    gar.specks(ctx, 6, shadowArc, 0.045, 'rgba(70,80,90,0.35)', rnd);
    gar.specks(ctx, 6, arc, 0.04, ['#FFFFFF', '#F4F4F4'], rnd);
    // a few finer grains scattered just under the rim line
    gar.specks(ctx, 5, { cx: 0, cy: RIM_Y + 0.03, rx: RIM_RX - 0.02, ry: arc.ry, a0: 128, a1: 222 }, 0.022,
      'rgba(255,255,255,0.9)', rnd);
  }

  function paint(ctx, h, opts) {
    var g = h.glass, gar = h.garnish;
    var P = g.profile(0.70, 0.45, [['L', 0.95, -0.95]]);
    return g.paint(ctx, {
      profile: P, tier: 1, baseThick: 0.18, baseFill: g.COL.block,
      liquid: { fill: -0.55, colors: ['#FFD966', '#E8A317'], surface: '#FFE89A' },
      contents: function (c, info) {
        // a warm glow at the bottom of the tequila and two rising bubbles
        var gr = c.createRadialGradient(-0.1, 0.1, 0.02, -0.1, 0.1, 0.6);
        gr.addColorStop(0, 'rgba(255,240,170,0.35)'); gr.addColorStop(1, 'rgba(255,240,170,0)');
        c.fillStyle = gr; c.fillRect(-1, info.fill, 2, info.bottom - info.fill + 0.4);
        gar.bubbles(c, 3, { x0: -0.4, y0: -0.4, x1: 0.35, y1: 0.12 }, info.rnd);
      },
      condensation: 4,
      front: function (c, info) {
        saltRim(c, gar, info.rnd);
        gar.citrusWheel(c, WHEEL.x, WHEEL.y, WHEEL.r, WHEEL.rot, gar.PAL.lime, WHEEL.seg);
        slotOver(c, g, info, WHEEL.x, WHEEL.y, WHEEL.r);
      }
    }, opts);
  }

  art.tiers[1] = {
    key: KEY,
    name: 'Tequila Shot',
    paint: paint,
    // Merge particles (4.3): lime squares #A6DB4F (3 px) and white salt dots.
    particles: [
      { shape: 'square', color: '#A6DB4F', size: 3 },
      { shape: 'circle', color: '#FFFFFF' }
    ]
  };
  if (typeof module === 'object' && module && module.exports) module.exports = art.tiers[1];
})(typeof globalThis !== 'undefined' ? globalThis : this);
