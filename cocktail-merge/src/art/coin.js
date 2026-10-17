// src/art/coin.js: the HUD coin icon (DESIGN 3.4, palette 4.1). Browser file (Canvas 2D only, Safari 15
// safe). Sets CM.art.paintCoin(canvas). The coin is painted to fit the canvas's smaller side, centred.
// A canvas still at the HTML default size (300x150) is first resized to 64x64 (3.4: "a 64-px canvas").
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var art = CM.art = CM.art || {};
  var TAU = Math.PI * 2;

  var COL = {
    light: '#FFE58A', coin: '#FFC93C', dark: '#E89B14', rim: '#C77A0A',
    edge: '#A9650A', star: '#E8A317', starHi: '#FFF4B8', starLo: '#B8730A'
  };

  /** Adds a five-point star subpath centred on (x, y): outer radius ro, inner ri, first point up. */
  function starPath(ctx, x, y, ro, ri) {
    var i, a, r;
    for (i = 0; i < 10; i++) {
      a = -Math.PI / 2 + i * Math.PI / 5;
      r = i % 2 ? ri : ro;
      if (i === 0) ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
      else ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }
    ctx.closePath();
  }

  function disc(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(r, 0.01), 0, TAU); }

  /**
   * Paints the coin of 3.4 into `canvas`: radial gradient #FFE58A -> #FFC93C -> #E89B14, a #C77A0A rim
   * (6 % of the diameter), an embossed #E8A317 star with a #FFF4B8 highlight, a coin edge for thickness
   * and a soft gloss. Clears the canvas first; never reads pixels back.
   */
  function paintCoin(canvas) {
    if (!canvas || !canvas.getContext) return;
    if ((canvas.width === 300 && canvas.height === 150) || !canvas.width || !canvas.height) {
      canvas.width = 64; canvas.height = 64;
    }
    var W = canvas.width, H = canvas.height, ctx = canvas.getContext('2d');
    var size = Math.min(W, H), r = size * 0.45, cx = W / 2, cy = H / 2 - size * 0.025;
    var rimW = 0.12 * r, gr;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Soft contact shadow and the coin's edge (thickness), slightly below the face.
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 1.02, r * 0.7, r * 0.1, 0, 0, TAU);
    ctx.fillStyle = 'rgba(110,60,10,0.18)'; ctx.fill();
    disc(ctx, cx, cy + r * 0.07, r);
    ctx.fillStyle = COL.edge; ctx.fill();

    // Face: radial gradient lit from the upper left.
    disc(ctx, cx, cy, r);
    gr = ctx.createRadialGradient(cx - 0.32 * r, cy - 0.38 * r, 0.05 * r, cx, cy, 1.15 * r);
    gr.addColorStop(0, COL.light); gr.addColorStop(0.5, COL.coin); gr.addColorStop(1, COL.dark);
    ctx.fillStyle = gr; ctx.fill();

    // Rim (6 % of the diameter) with a lit upper-left arc and a darker lower-right arc.
    disc(ctx, cx, cy, r - rimW / 2);
    ctx.strokeStyle = COL.rim; ctx.lineWidth = rimW; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r - rimW / 2, Math.PI * 0.95, Math.PI * 1.55);
    ctx.strokeStyle = 'rgba(255,236,160,0.75)'; ctx.lineWidth = rimW * 0.38; ctx.lineCap = 'round'; ctx.stroke();

    // Inner engraved ring: dark groove plus a light lip just below it (reads as stamped metal).
    disc(ctx, cx, cy + 0.02 * r, 0.76 * r);
    ctx.strokeStyle = 'rgba(255,244,184,0.7)'; ctx.lineWidth = 0.035 * r; ctx.stroke();
    disc(ctx, cx, cy, 0.76 * r);
    ctx.strokeStyle = COL.star; ctx.lineWidth = 0.04 * r; ctx.stroke();

    // Embossed star: dark offset (lower right), highlight offset (upper left), then the star itself.
    ctx.lineJoin = 'round';
    ctx.beginPath(); starPath(ctx, cx + 0.035 * r, cy + 0.045 * r, 0.5 * r, 0.21 * r);
    ctx.fillStyle = 'rgba(184,115,10,0.75)'; ctx.fill();
    ctx.beginPath(); starPath(ctx, cx - 0.03 * r, cy - 0.035 * r, 0.5 * r, 0.21 * r);
    ctx.fillStyle = COL.starHi; ctx.fill();
    ctx.beginPath(); starPath(ctx, cx, cy, 0.48 * r, 0.2 * r);
    gr = ctx.createLinearGradient(cx - 0.4 * r, cy - 0.45 * r, cx + 0.4 * r, cy + 0.45 * r);
    gr.addColorStop(0, '#F4B630'); gr.addColorStop(1, COL.star);
    ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = 'rgba(184,115,10,0.35)'; ctx.lineWidth = 0.02 * r; ctx.stroke();

    // Gloss: a soft crescent at the upper left and a small glint.
    ctx.save();
    disc(ctx, cx, cy, r - rimW); ctx.clip();
    ctx.beginPath(); ctx.ellipse(cx - 0.3 * r, cy - 0.52 * r, 0.55 * r, 0.26 * r, -0.5, 0, TAU);
    gr = ctx.createRadialGradient(cx - 0.3 * r, cy - 0.52 * r, 0, cx - 0.3 * r, cy - 0.52 * r, 0.55 * r);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.fill();
    ctx.restore();
    disc(ctx, cx - 0.5 * r, cy - 0.42 * r, 0.06 * r);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();

    ctx.restore();
  }

  art.paintCoin = paintCoin;
  if (typeof module === 'object' && module && module.exports) module.exports = { paintCoin: paintCoin };
})(typeof globalThis !== 'undefined' ? globalThis : this);
