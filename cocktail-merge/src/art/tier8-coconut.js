// src/art/tier8-coconut.js: the T8 Coconut Cocktail painter (DESIGN 4.3), registered as CM.art.tiers[8].
// Browser file (Canvas 2D only, Safari 15 safe). paint(ctx, h, opts) receives a ctx already in AUTHORING
// coordinates (R-units, base at y = +0.45, body rising toward negative y); h = {glass, garnish}.
// A half coconut is not a profile glass, so this calls the helpers directly. The baked glow is added by sprites.js.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var art = CM.art = CM.art || {};
  art.tiers = art.tiers || {};

  var TAU = Math.PI * 2;
  var RIM_Y = -0.6, RIM_RX = 0.95, RIM_RY = 0.34, BOT_Y = 0.45;
  var SHELL = ['#A87444', '#7A4A22', '#4A2C12'], FIBRE = '#3A220C', CUT = '#5A3518', MEAT = '#FFF8EC';
  var DRINK_LIGHT = '#C9A6FF', DRINK_DEEP = '#7B3FD1', RIPPLE = '#D9C2FF';
  // Seat: the 4.3 numbers put the shell's lowest point ON the anchor (the centre of the footprint), so the
  // nut looked as if it hovered above its shadow. The whole drawing is shifted down by SEAT, which puts the
  // flattened bottom at anchor +0.40 (where a glass's base-ellipse front sits, +0.47) and the rim at -0.65.
  var SEAT = 0.40;

  // Ring geometry of the cut top: outer rim, cut ring 0.05, meat ring 0.08, then the hollow.
  var R_CUT = RIM_RX - 0.05, R_IN = R_CUT - 0.08, K = RIM_RY / RIM_RX;
  function ring(c, rx, dy) { c.moveTo(rx, RIM_Y + (dy || 0)); c.ellipse(0, RIM_Y + (dy || 0), rx, K * rx, 0, 0, TAU); }

  /** Shell silhouette: back half of the rim ellipse on top, a rounded lower half down to +0.45. */
  function traceShell(c) {
    c.moveTo(RIM_RX, RIM_Y);
    c.bezierCurveTo(RIM_RX + 0.02, -0.1, 0.62, BOT_Y, 0, BOT_Y);
    c.bezierCurveTo(-0.62, BOT_Y, -RIM_RX - 0.02, -0.1, -RIM_RX, RIM_Y);
    c.ellipse(0, RIM_Y, RIM_RX, RIM_RY, 0, Math.PI, TAU, false);
    c.closePath();
  }
  /** Shell half-width at height y (for fibre placement), from a sampled outline. */
  function shellHw(y) {
    var t = Math.max(0, Math.min(1, (y - RIM_Y) / (BOT_Y - RIM_Y)));
    return RIM_RX * Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.4)));
  }

  function paintShell(ctx, g, rnd) {
    var gr = ctx.createRadialGradient(-0.35, -0.4, 0.05, -0.1, -0.2, 1.25);
    gr.addColorStop(0, SHELL[0]); gr.addColorStop(0.5, SHELL[1]); gr.addColorStop(1, SHELL[2]);
    ctx.beginPath(); traceShell(ctx); ctx.fillStyle = gr; ctx.fill();
    g.withClip(ctx, traceShell, function () {
      var i, j, s, y0, len, y, x, n = 6, curve;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (i = 0; i < 28; i++) {                       // 20 dark fibres, then 8 faint light ones
        s = -0.92 + 1.84 * rnd(); y0 = RIM_Y + 0.1 + 0.85 * rnd(); len = 0.18 + 0.22 * rnd();
        curve = (rnd() - 0.5) * 0.08;
        ctx.beginPath();
        for (j = 0; j <= n; j++) {
          y = Math.min(BOT_Y - 0.02, y0 + len * j / n);
          x = s * shellHw(y) + curve * Math.sin(Math.PI * j / n);
          if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        if (i < 20) { ctx.strokeStyle = 'rgba(58,34,12,0.5)'; ctx.lineWidth = 0.018 + 0.012 * rnd(); }
        else { ctx.strokeStyle = 'rgba(205,160,110,0.3)'; ctx.lineWidth = 0.014; }
        ctx.stroke();
      }
      var hl = ctx.createLinearGradient(-0.95, 0, 0.2, 0);    // soft sheen on the lit side
      hl.addColorStop(0, 'rgba(255,230,190,0)'); hl.addColorStop(0.25, 'rgba(255,230,190,0.22)');
      hl.addColorStop(0.55, 'rgba(255,230,190,0)');
      ctx.fillStyle = hl; ctx.fillRect(-1, RIM_Y, 1.3, 1.1);
      ctx.beginPath(); ctx.ellipse(0.05, 0.62, 1.1, 0.5, 0, 0, TAU);   // occlusion toward the table
      ctx.fillStyle = 'rgba(30,15,5,0.25)'; ctx.fill();
    });
    g.streak(ctx, [[-0.78, -0.42], [-0.74, -0.2], [-0.62, 0.02], [-0.45, 0.18]], 0.07, 0.35);
    ctx.save(); ctx.beginPath(); traceShell(ctx);
    ctx.strokeStyle = FIBRE; ctx.lineWidth = 0.06; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
  }

  /** The cut top: brown cut ring 0.05, white meat ring 0.08, the meat-lined hollow and the drink inside. */
  function paintTop(ctx, g, gn, rnd) {
    var gr;
    ctx.beginPath(); ring(ctx, RIM_RX); ctx.fillStyle = CUT; ctx.fill();
    ctx.beginPath(); ring(ctx, R_CUT); ctx.fillStyle = MEAT; ctx.fill();
    ctx.beginPath(); ring(ctx, R_IN);                        // hollow: the inner meat wall, shaded at the back
    gr = ctx.createLinearGradient(0, RIM_Y - K * R_IN, 0, RIM_Y + K * R_IN);
    gr.addColorStop(0, '#E2D3BC'); gr.addColorStop(0.5, '#F6EDDD'); gr.addColorStop(1, '#FFFFFF');
    ctx.fillStyle = gr; ctx.fill();
    g.withClip(ctx, function (c) { ring(c, R_IN); }, function () {
      var dy = 0.05, rx = R_IN - 0.02, ry = K * rx;
      gr = ctx.createRadialGradient(-0.22, RIM_Y + dy - 0.05, 0.03, -0.05, RIM_Y + dy, rx * 1.05);
      gr.addColorStop(0, DRINK_LIGHT); gr.addColorStop(0.55, '#9F6BEA'); gr.addColorStop(1, DRINK_DEEP);
      ctx.beginPath(); ctx.ellipse(0, RIM_Y + dy, rx, ry, 0, 0, TAU); ctx.fillStyle = gr; ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, RIM_Y + dy, rx, ry, 0, Math.PI, TAU, false);   // meniscus at the back
      ctx.strokeStyle = 'rgba(70,20,130,0.45)'; ctx.lineWidth = 0.025; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0.06, RIM_Y + dy + 0.01, 0.42, 0.14, 0, 0, TAU);   // ripple
      ctx.strokeStyle = RIPPLE; ctx.lineWidth = 0.025; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0.06, RIM_Y + dy + 0.01, 0.22, 0.07, 0, 0, TAU);
      ctx.strokeStyle = 'rgba(217,194,255,0.6)'; ctx.lineWidth = 0.018; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-0.3, RIM_Y + dy - 0.06, 0.18, 0.035, -0.1, 0, TAU);   // sheen
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
      gn.iceCube(ctx, -0.32, RIM_Y + 0.14, 0.15, -12, { h: 0.12 });   // 3 ice bits
      gn.iceCube(ctx, 0.3, RIM_Y + 0.17, 0.13, 18, { h: 0.1 });
      gn.iceCube(ctx, 0.02, RIM_Y + 0.21, 0.12, 6, { h: 0.09 });
    });
    ctx.beginPath(); ctx.ellipse(0, RIM_Y, (R_CUT + R_IN) / 2, K * (R_CUT + R_IN) / 2, 0, rad(200), rad(290));
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.025; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, RIM_Y, R_IN, K * R_IN, 0, rad(10), rad(170));          // meat lip shadow
    ctx.strokeStyle = 'rgba(160,130,95,0.45)'; ctx.lineWidth = 0.018; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, RIM_Y, RIM_RX, RIM_RY, 0, rad(15), rad(165));          // cut-ring front edge
    ctx.strokeStyle = 'rgba(40,20,5,0.6)'; ctx.lineWidth = 0.02; ctx.stroke();
  }
  function rad(d) { return d * Math.PI / 180; }

  /** A bendy straw rising out of the drink; the part under the surface (y >= cutY) is not drawn. */
  function straw(ctx, gn, x0, y0, x1, y1, col, bend, cutY) {
    ctx.save(); ctx.beginPath(); ctx.rect(-2, -3, 4, cutY + 3); ctx.clip();
    gn.straw(ctx, x0, y0, x1, y1, 0.11, col, '#FFFFFF', bend);
    ctx.restore();
    var ex = x0 + (x1 - x0) * (cutY - y0) / (y1 - y0);
    ctx.beginPath(); ctx.ellipse(ex, cutY, 0.09, 0.03, 0, 0, TAU);
    ctx.strokeStyle = 'rgba(217,194,255,0.85)'; ctx.lineWidth = 0.018; ctx.stroke();
  }

  /** Hibiscus: 5 petals r 0.30, radial #FF6F91 -> #E0245E, centre #B3123E, stamen #FFD23F with 4 dots. */
  function hibiscus(ctx, x, y, r) {
    var i, a, gr;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.88); ctx.rotate(rad(-8));
    gr = ctx.createRadialGradient(0, 0, r * 0.08, 0, 0, r);
    gr.addColorStop(0, '#FF6F91'); gr.addColorStop(0.55, '#F2487A'); gr.addColorStop(1, '#E0245E');
    for (i = 0; i < 5; i++) {
      a = -Math.PI / 2 + i * TAU / 5;
      ctx.save(); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.bezierCurveTo(r * 0.35, -r * 0.55, r * 1.05, -r * 0.5, r * 1.0, 0);
      ctx.quadraticCurveTo(r * 1.06, r * 0.12, r * 0.92, r * 0.2);       // ruffled tip
      ctx.bezierCurveTo(r * 0.9, r * 0.5, r * 0.35, r * 0.5, 0, 0);
      ctx.fillStyle = gr; ctx.fill();
      ctx.strokeStyle = 'rgba(150,10,50,0.55)'; ctx.lineWidth = r * 0.04; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.15, 0); ctx.quadraticCurveTo(r * 0.55, -r * 0.05, r * 0.85, -r * 0.1);
      ctx.moveTo(r * 0.2, r * 0.05); ctx.quadraticCurveTo(r * 0.55, r * 0.2, r * 0.8, r * 0.22);
      ctx.strokeStyle = 'rgba(255,190,210,0.6)'; ctx.lineWidth = r * 0.03; ctx.stroke();
      ctx.restore();
    }
    gr = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.38);
    gr.addColorStop(0, '#B3123E'); gr.addColorStop(0.7, 'rgba(179,18,62,0.6)'); gr.addColorStop(1, 'rgba(179,18,62,0)');
    ctx.beginPath(); ctx.arc(0, 0, r * 0.38, 0, TAU); ctx.fillStyle = gr; ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round';           // stamen
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(r * 0.25, -r * 0.35, r * 0.62, -r * 0.62);
    ctx.strokeStyle = '#E8B400'; ctx.lineWidth = r * 0.1; ctx.stroke();
    ctx.strokeStyle = '#FFD23F'; ctx.lineWidth = r * 0.06; ctx.stroke();
    [[0.62, -0.62], [0.75, -0.6], [0.6, -0.76], [0.73, -0.74]].forEach(function (p) {
      ctx.beginPath(); ctx.arc(r * p[0], r * p[1], r * 0.065, 0, TAU); ctx.fillStyle = '#FFD23F'; ctx.fill();
      ctx.strokeStyle = '#D9A400'; ctx.lineWidth = r * 0.02; ctx.stroke();
    });
    ctx.restore();
  }

  /** Frangipani: 5 overlapping white petals r 0.2 in a pinwheel, yellow centre #FFE27A. */
  function frangipani(ctx, x, y, r) {
    var i, gr;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.9);
    for (i = 0; i < 5; i++) {
      ctx.save(); ctx.rotate(rad(-90 + 72 * i));
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.bezierCurveTo(r * 0.2, -r * 0.45, r * 0.95, -r * 0.6, r * 1.05, -r * 0.12);
      ctx.bezierCurveTo(r * 1.1, r * 0.25, r * 0.5, r * 0.28, 0, 0);
      gr = ctx.createLinearGradient(0, 0, r, 0);
      gr.addColorStop(0, '#FFE27A'); gr.addColorStop(0.35, '#FFF6D8'); gr.addColorStop(1, '#FFFFFF');
      ctx.fillStyle = gr; ctx.fill();
      ctx.strokeStyle = 'rgba(190,170,140,0.75)'; ctx.lineWidth = r * 0.05; ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.18, 0, TAU); ctx.fillStyle = '#FFE27A'; ctx.fill();
    ctx.beginPath(); ctx.arc(-r * 0.05, -r * 0.05, r * 0.07, 0, TAU); ctx.fillStyle = '#FFF4C0'; ctx.fill();
    ctx.restore();
  }

  /** A dark contact patch where the flattened bottom rests on the table (centred on the anchor). */
  function contact(ctx) {
    var gr;
    ctx.save(); ctx.translate(0, BOT_Y - 0.03); ctx.scale(1, 0.2);
    gr = ctx.createRadialGradient(0, 0, 0.05, 0, 0, 0.72);
    gr.addColorStop(0, 'rgba(45,25,8,0.6)'); gr.addColorStop(0.65, 'rgba(45,25,8,0.35)'); gr.addColorStop(1, 'rgba(45,25,8,0)');
    ctx.beginPath(); ctx.arc(0, 0, 0.72, 0, TAU); ctx.fillStyle = gr; ctx.fill();
    ctx.restore();
  }

  function paint(ctx, h) {   // (ctx, h, opts): T8 has no icon-mode variant
    var g = h.glass, gn = h.garnish, rnd = g.rngFor(8);
    ctx.save(); ctx.translate(0, SEAT);
    contact(ctx);
    paintShell(ctx, g, rnd);
    paintTop(ctx, g, gn, rnd);
    straw(ctx, gn, -0.02, -0.3, -0.3, -1.9, '#FFD23F', -30, RIM_Y - 0.02);   // yellow, bends left
    straw(ctx, gn, 0.2, -0.3, 0.42, -1.9, '#FF5C8A', 30, RIM_Y + 0.02);      // pink, bends right
    gn.leaf(ctx, -0.4, -0.72, 0.8, 0.36, -52, gn.PAL.leaf);                // palm leaf behind the flowers
    hibiscus(ctx, -0.55, -0.8, 0.30);
    frangipani(ctx, 0.5, -0.75, 0.2);
    ctx.restore();
  }

  art.tiers[8] = {
    key: '#9B5DE5',
    paint: paint,
    particles: [{ shape: 'petal', color: '#FF3D6E' }, { shape: 'petal', color: '#FFFFFF' },
      { shape: 'circle', color: '#9B5DE5' }]
  };
  if (typeof module === 'object' && module && module.exports) module.exports = art.tiers[8];
})(typeof globalThis !== 'undefined' ? globalThis : this);
