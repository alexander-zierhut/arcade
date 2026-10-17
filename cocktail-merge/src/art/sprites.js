// src/art/sprites.js: paintTier dispatch (override picture or procedural painter), the in-world sprite
// caches with their white/red silhouettes and the baked T8/T9 glow, and paintIcon for the HUD (DESIGN
// 4.2, 4.3, 3.4). Browser file (Canvas 2D only, Safari 15 safe: no ctx.filter, no OffscreenCanvas).
// Nothing here ever reads pixels back (getImageData/toDataURL), so file:// override pictures are fine.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var art = CM.art = CM.art || {};

  var SILHOUETTE = '#3A2A1A', FLASH = '#FFFFFF', DANGER = '#FF3B3B';
  var GLOW = { 8: 'rgba(255,240,180,0.55)', 9: 'rgba(255,210,63,0.65)' };
  var SIL_PASSES = 3;     // silhouettes stack the sprite 3x first, so the faint glass body reads solid
  var KEYS = [null, '#F5C542', '#B3561C', '#FF5C8A', '#C6E05A', '#4CC97A', '#FF4F2E', '#2EB5A8', '#9B5DE5', '#0F8A5F'];
  var RADII = [0, 5.2, 5.92, 7.2, 8.48, 9.92, 11.52, 13.28, 15.2, 17.6];   // fallback only; config TIERS[t].radius wins

  function warn(msg, e) { if (root.console && root.console.warn) root.console.warn(msg, e); }
  function keyColor(t) {
    var T = CM.config && CM.config.TIERS && CM.config.TIERS[t];
    return (T && T.color) || KEYS[t] || '#CCCCCC';
  }
  function newCanvas(w, h) {
    var c = root.document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  function helpers() { return { glass: art.glass, garnish: art.garnish }; }
  function override(t) { return typeof art.overrideImage === 'function' ? art.overrideImage(t) : null; }

  /**
   * Sprite bounds of tier t in R-units: {ax, ay, w, h, pad}; (ax, ay) is the anchor's offset from the
   * top-left corner. Procedural tiers use the 4.2 table (glass.spriteBox); an override uses its picture
   * rect (4.3). `padded` adds the 0.2 glow padding for T8/T9 (in-world sprites); icons pass false.
   */
  function spriteBounds(t, padded) {
    var pad = padded && t >= 8 ? art.glass.GLOW_PAD : 0, ov = override(t), top, bot, half;
    if (ov) {
      half = ov.rect.w / 2; top = Math.min(ov.rect.y, -0.05); bot = Math.max(ov.rect.y + ov.rect.h, 0.05);
      return { ax: half + pad, ay: -top + pad, w: 2 * half + 2 * pad, h: bot - top + 2 * pad, pad: pad };
    }
    var b = art.glass.spriteBox(t);
    if (!padded && b.pad) {
      return { ax: b.ax - b.pad, ay: b.ay - b.pad, w: b.w - 2 * b.pad, h: b.h - 2 * b.pad, pad: 0 };
    }
    return b;
  }

  /** Minimal stand-in glass, used only if a tier painter is missing or throws (keeps the game playable). */
  function fallbackPaint(ctx, t) {
    var g = art.glass, k = keyColor(t);
    g.paint(ctx, {
      profile: g.profile(0.8, 0.45, [['L', 0.95, -1.0]]), tier: t, baseThick: 0.15,
      liquid: { fill: -0.5, colors: [g.shade(k, 0.15), g.shade(k, -0.25)], surface: g.shade(k, 0.45) }
    }, {});
  }

  /**
   * Draws tier t with the ctx origin on the anchor pixel, rp px per R-unit (5.5). Uses the override picture
   * when one loaded (2.0 R wide, bottom-centre at anchor (0, +0.40)), else CM.art.tiers[t].paint in
   * authoring coordinates (glass.applyAnchor does the -0.45 translate). opts.icon selects icon mode (3.4).
   */
  function paintTier(ctx, tier, rp, opts) {
    var o = opts || {}, ov = override(tier), p = art.tiers && art.tiers[tier];
    ctx.save();
    if (ov) {
      ctx.scale(rp, rp);
      ctx.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(ov.img, ov.rect.x, ov.rect.y, ov.rect.w, ov.rect.h);
    } else {
      art.glass.applyAnchor(ctx, rp);
      if (p && typeof p.paint === 'function') p.paint(ctx, helpers(), o);
      else fallbackPaint(ctx, tier);
    }
    ctx.restore();
  }

  /** Paints tier t into a fresh canvas of box (R-units) at rp; a throwing painter falls back to a stand-in. */
  function renderTier(t, rp, box, opts) {
    var c = newCanvas(box.w * rp, box.h * rp), x = c.getContext('2d');
    try {
      x.translate(box.ax * rp, box.ay * rp); paintTier(x, t, rp, opts);
      return c;
    } catch (e) {
      warn('Cocktail Merge: painter for tier ' + t + ' failed; using a stand-in.', e);
      c = newCanvas(box.w * rp, box.h * rp); x = c.getContext('2d');
      x.translate(box.ax * rp, box.ay * rp); x.scale(rp, rp); x.translate(0, -0.45); fallbackPaint(x, t);
      return c;
    }
  }

  /** A same-size single-colour silhouette of src (source-in), with the alpha stacked SIL_PASSES times. */
  function silhouette(src, color) {
    var c = newCanvas(src.width, src.height), x = c.getContext('2d'), i;
    for (i = 0; i < SIL_PASSES; i++) x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  /**
   * Baked glow (4.2): the finished sprite on top of its own blurred halo. The halo is the shadow of the
   * solid white silhouette, cast from far off-canvas back onto the canvas (shadowOffsetX), so the sprite
   * itself is drawn only once and its transparent glass is not doubled.
   */
  function withGlow(base, white, color, blur) {
    var c = newCanvas(base.width, base.height), x = c.getContext('2d'), off = base.width + 64;
    x.save();
    x.shadowColor = color; x.shadowBlur = blur; x.shadowOffsetX = off; x.shadowOffsetY = 0;
    x.drawImage(white, -off, 0);
    x.restore();
    x.drawImage(base, 0, 0);
    return c;
  }

  var cache = null;   // {sig, kd, sprites}

  /**
   * Builds (or returns the cached) in-world sprites: an array indexed by tier 1..9 (index 0 is null) of
   * Sprite = {canvas, white, red, ax, ay, rp, w, h, axPx, ayPx, tier}. ax, ay, w, h are R-units (as the
   * 4.2 table and 3.4's icon fit use them); the anchor pixel in the canvas is (axPx, ayPx) = (ax*rp, ay*rp).
   * radii: indexed by tier (rules.RADII); missing entries fall back to the Standard radii.
   * Rebuilds only when kX*dpr changed by more than 2 %, a radius changed or the override set changed
   * (3.1); pass force = true to rebuild anyway. Never uses icon mode.
   */
  function buildSprites(lay, radii, force) {
    var g = art.glass, dpr = lay.dpr || 1, kd = lay.kX * dpr, t, R = [], sig;
    for (t = 1; t <= 9; t++) R[t] = (radii && radii[t] > 0) ? radii[t] : RADII[t];
    sig = R.slice(1).join(',') + '|' + (typeof art.overrideMask === 'function' ? art.overrideMask() : 0);
    if (!force && cache && cache.sig === sig && Math.abs(kd / cache.kd - 1) <= 0.02) return cache.sprites;

    var out = [null], rp, box, base, white, red, canvas;
    for (t = 1; t <= 9; t++) {
      rp = g.cacheRp(R[t], lay.kX, dpr);
      box = spriteBounds(t, true);
      base = renderTier(t, rp, box);
      white = silhouette(base, FLASH);
      red = silhouette(base, DANGER);
      canvas = GLOW[t] ? withGlow(base, white, GLOW[t], 0.25 * rp) : base;
      out.push({
        canvas: canvas, white: white, red: red, ax: box.ax, ay: box.ay, rp: rp, w: box.w, h: box.h,
        axPx: box.ax * rp, ayPx: box.ay * rp, tier: t
      });
    }
    cache = { sig: sig, kd: kd, sprites: out };
    return out;
  }

  /** Desaturates src to 30 % saturation (CSS saturate(0.3)) with the 'saturation' blend, keeping its alpha. */
  function desaturate(src) {
    var c = newCanvas(src.width, src.height), x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'saturation';
    if (x.globalCompositeOperation !== 'saturation') return src;      // blend unsupported: alpha only
    x.globalAlpha = 0.7; x.fillStyle = '#808080'; x.fillRect(0, 0, c.width, c.height);
    x.globalAlpha = 1; x.globalCompositeOperation = 'destination-in'; x.drawImage(src, 0, 0);
    return c;
  }

  /**
   * Paints the HUD icon of tier t into `canvas` at its current pixel size (strip slots, NEXT, collection,
   * toast; 3.4). Always icon mode ({icon: true}). Fit: scale = min(H / spriteH, W / spriteW) from the
   * unpadded bounds (the override's picture rect when one loaded), centred horizontally, bottom-aligned.
   * state: 'none' = silhouette #3A2A1A at 85 %; 'earlier' = alpha 0.45 at 30 % saturation;
   * 'run' = full colour; 'best' = full colour over a gold halo (radial #FFE36B alpha 0.7 -> 0).
   * The halo's 1 Hz scale pulse and the gold underline are CSS (hud.css), not painted here.
   */
  function paintIcon(canvas, tier, state) {
    if (!canvas || !canvas.getContext) return;
    var W = canvas.width, H = canvas.height, ctx = canvas.getContext('2d');
    var b = spriteBounds(tier, false), s = Math.min(H / b.h, W / b.w);
    var axp = W / 2 - (b.w / 2 - b.ax) * s, ayp = H - (b.h - b.ay) * s, icon, gr;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    icon = newCanvas(W, H);
    try {
      var ic = icon.getContext('2d');
      ic.translate(axp, ayp); paintTier(ic, tier, s, { icon: true });
    } catch (e) {
      warn('Cocktail Merge: icon for tier ' + tier + ' failed; using a stand-in.', e);
      icon = newCanvas(W, H);
      var fc = icon.getContext('2d');
      fc.translate(axp, ayp); fc.scale(s, s); fc.translate(0, -0.45); fallbackPaint(fc, tier);
    }
    if (state === 'none') {
      ctx.globalAlpha = 0.85; ctx.drawImage(silhouette(icon, SILHOUETTE), 0, 0);
    } else if (state === 'earlier') {
      ctx.globalAlpha = 0.45; ctx.drawImage(desaturate(icon), 0, 0);
    } else {
      if (state === 'best') {
        ctx.save();
        ctx.translate(W / 2, H * 0.55); ctx.scale(W / 2, H * 0.5);
        gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        gr.addColorStop(0, 'rgba(255,227,107,0.7)'); gr.addColorStop(0.55, 'rgba(255,227,107,0.35)');
        gr.addColorStop(1, 'rgba(255,227,107,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.drawImage(icon, 0, 0);
    }
    ctx.restore();
  }

  art.paintTier = paintTier;
  art.buildSprites = buildSprites;
  art.paintIcon = paintIcon;
  art.spriteBounds = spriteBounds;
  art.keyColor = keyColor;
  if (typeof module === 'object' && module && module.exports) {
    module.exports = { paintTier: paintTier, buildSprites: buildSprites, paintIcon: paintIcon,
      spriteBounds: spriteBounds, keyColor: keyColor };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
