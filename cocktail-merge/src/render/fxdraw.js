// src/render/fxdraw.js: draws the event-owned FX pools of fx.js (DESIGN 3.8, 5.10 steps 5, 8, 10, 11):
// light rays, merge rings, particles, confetti, floating texts, flying coins, jug sparkles, and the screen-space
// danger vignette, win flash and lose dim. Browser file (Canvas 2D, Safari 15 safe); split from fx.js to keep
// both files small. Sets CM.render.fxdraw. Nothing here allocates per frame except the rare ray gradients.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var render = CM.render = CM.render || {};
  var fx = render.fx, ease = render.ease, P = CM.projection;
  var F = (CM.config && CM.config.FX) || {};
  var TAU = Math.PI * 2;
  function v(name, d) { return typeof F[name] === 'number' ? F[name] : d; }
  function c01(t) { return t < 0 ? 0 : (t > 1 ? 1 : t); }
  function k(lay) { return lay.uiK || lay.kX / 3.4; }
  var fp = { X: 0, Y: 0, rx: 0, ry: 0 };

  /** Step 5 (behind the glasses): tier >= 7 light rays; T9 and the win alternate yellow and green. */
  function rays(ctx, lay, t) {
    var a = fx.pools.rays, i, j, r, e, p, L, n = v('RAYS', 8), hw = Math.PI / n / 2, gr;
    for (i = 0; i < a.length; i++) {
      r = a[i]; if (!r.on) continue;
      e = (t - r.t0) / r.ms; if (e >= 1) { r.on = false; continue; } if (e < 0) continue;
      P.footprint(lay, r.x, r.y, r.r, fp);
      L = 3.2 * fp.rx * (v('RAYS_SCALE0', 0.5) + (v('RAYS_SCALE1', 1.4) - v('RAYS_SCALE0', 0.5)) * ease.outCubic(e));
      ctx.save(); ctx.translate(fp.X, fp.Y - 0.9 * fp.rx); ctx.rotate(v('RAYS_SPIN', 0.8) * (t - r.t0) / 1000);
      ctx.globalAlpha = 1 - ease.inQuad(e);
      for (j = 0; j < n; j++) {
        gr = ctx.createRadialGradient(0, 0, 0, 0, 0, L);
        var col = r.win ? (j % 2 ? F.RAYS_WIN_B || 'rgba(95,208,138,0.30)' : F.RAYS_WIN_A || 'rgba(255,210,63,0.40)') : (F.RAYS_COLOR || 'rgba(255,240,180,0.35)');
        gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(255,240,180,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, L, j * TAU / n - hw, j * TAU / n + hw); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Step 8: merge rings (footprint ellipse r -> 2.1r, width 5 -> 1 px*k, alpha 0.9 -> 0) and particles. */
  function over(ctx, lay, t) {
    var a = fx.pools.rings, u = k(lay), i, o, e, s, ms = v('RING_MS', 380);
    for (i = 0; i < a.length; i++) {
      o = a[i]; if (!o.on) continue;
      e = (t - o.t0) / ms; if (e >= 1) { o.on = false; continue; } if (e < 0) continue;
      e = ease.outCubic(e); s = 1 + (v('RING_SCALE', 2.1) - 1) * e;
      P.footprint(lay, o.x, o.y, o.r, fp);
      ctx.globalAlpha = v('RING_ALPHA', 0.9) * (1 - e); ctx.strokeStyle = o.col;
      ctx.lineWidth = (v('RING_W0', 5) + (v('RING_W1', 1) - v('RING_W0', 5)) * e) * u;
      ctx.beginPath(); ctx.ellipse(fp.X, fp.Y, fp.rx * s, fp.ry * s, 0, 0, TAU); ctx.stroke();
    }
    a = fx.pools.parts;
    var fade = v('PARTICLE_FADE', 0.4);
    for (i = 0; i < a.length; i++) {
      o = a[i]; if (!o.on) continue;
      e = (t - o.t0) / o.life; if (e < 0) continue;
      ctx.globalAlpha = e > 1 - fade ? c01((1 - e) / fade) : 1;
      shape(ctx, o.shape, o.x, o.y, o.size, o.rot, o.col);
    }
    ctx.globalAlpha = 1;
  }
  function shape(ctx, sh, x, y, s, rot, col) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = col; ctx.beginPath();
    switch (sh) {
      case 'square': ctx.rect(-s / 2, -s / 2, s, s); break;
      case 'leaf': ctx.ellipse(0, 0, s, s * 0.42, 0, 0, TAU); break;
      case 'petal': ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * 0.8, -s * 0.1, 0, s * 0.6); ctx.quadraticCurveTo(-s * 0.8, -s * 0.1, 0, -s); break;
      case 'teardrop': ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * 0.55, 0, s * 0.5, s * 0.3); ctx.arc(0, s * 0.3, s * 0.5, 0, Math.PI); ctx.quadraticCurveTo(-s * 0.55, 0, 0, -s); break;
      case 'wedge': ctx.moveTo(0, 0); ctx.arc(0, 0, s * 0.8, 0, Math.PI); ctx.closePath(); break;
      case 'ring': ctx.arc(0, 0, s * 0.5, 0, TAU); ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, s * 0.25); ctx.stroke(); ctx.restore(); return;
      default: ctx.arc(0, 0, s * 0.5, 0, TAU);
    }
    ctx.fill(); ctx.restore();
  }

  /** Confetti (screen px): 8x14 px*k rectangles flipping about their long axis. */
  function confetti(ctx, t) {
    var a = fx.pools.conf, i, o, e, life = v('CONFETTI_LIFE_MS', 2500);
    for (i = 0; i < a.length; i++) {
      o = a[i]; if (!o.on || t < o.t0) continue;
      e = (t - o.t0) / life;
      ctx.globalAlpha = e > 0.8 ? c01((1 - e) / 0.2) : 1;
      ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.rot); ctx.scale(1, 0.25 + 0.75 * Math.abs(Math.cos(o.flip)));
      ctx.fillStyle = o.col; ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** Step 10 (world px): score floaters, chain labels and "Fiesta!" (3.8). */
  function texts(ctx, lay, t) {
    var a = fx.pools.texts, u = k(lay), i, o, e, ms, rise, sc, al, x, lo = lay.stage.x, hi = lay.stage.x + lay.S;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (i = 0; i < a.length; i++) {
      o = a[i]; if (!o.on) continue;
      ms = o.kind === 0 ? v('FLOATER_MS', 800) : (o.kind === 1 ? v('CHAIN_MS', 900) : 1300);
      e = (t - o.t0) / ms; if (e >= 1) { o.on = false; continue; } if (e < 0) continue;
      al = c01((ms - (t - o.t0)) / 300);
      ctx.font = o.font;
      if (!o.w) o.w = Math.max(ctx.measureText(o.a).width, o.b ? 0.8 * ctx.measureText(o.b).width : 0);
      x = Math.max(lo + o.w / 2 + 6, Math.min(hi - o.w / 2 - 6, o.x));
      ctx.save(); ctx.globalAlpha = al;
      if (o.kind === 0) {
        rise = v('FLOATER_RISE', 36) * u * ease.outCubic(e);
        ctx.translate(x, o.y - rise);
        ctx.lineWidth = 2 * v('FLOATER_STROKE_PX', 3) * Math.max(0.8, u); ctx.strokeStyle = F.FLOATER_STROKE || '#6B3A0A';
        ctx.strokeText(o.a, 0, 0); ctx.fillStyle = F.FLOATER_FILL || '#FFE07A'; ctx.fillText(o.a, 0, 0);
      } else {
        sc = 0.3 + 0.7 * ease.outBack(c01((t - o.t0) / v('CHAIN_POP_MS', 250)));
        rise = v('CHAIN_RISE', 30) * u * ease.outCubic(e);
        ctx.translate(x, o.y - rise); ctx.scale(sc, sc);
        if (!o.grad) {
          o.grad = ctx.createLinearGradient(0, -o.size / 2, 0, o.size / 2);
          o.grad.addColorStop(0, F.CHAIN_GRAD0 || '#FFD23F'); o.grad.addColorStop(1, F.CHAIN_GRAD1 || '#FF7B1C');
        }
        ctx.lineWidth = 2 * v('CHAIN_STROKE_PX', 4) * Math.max(0.8, u); ctx.strokeStyle = F.CHAIN_STROKE || '#7A3A00';
        ctx.strokeText(o.a, 0, 0); ctx.fillStyle = o.grad; ctx.fillText(o.a, 0, 0);
        if (o.b) {
          ctx.translate(0, o.size * 0.95); ctx.scale(0.8, 0.8);
          ctx.strokeText(o.b, 0, 0); ctx.fillText(o.b, 0, 0);
        }
      }
      ctx.restore();
    }
  }

  var coinCv = null;
  /** Coins flying (screen px) from a tier >= 5 merge to the HUD coin icon along a quadratic bezier. */
  function coins(ctx, lay, t) {
    var a = fx.pools.coins, i, o, e, u = k(lay), h = lay.hud && lay.hud.coin, x1, y1, cx, cy, x, y, s;
    if (!h) return;
    if (!coinCv && CM.art && CM.art.paintCoin) { coinCv = root.document.createElement('canvas'); coinCv.width = coinCv.height = 64; CM.art.paintCoin(coinCv); }
    if (!coinCv) return;
    x1 = lay.stage.x + h.x + h.w / 2; y1 = lay.stage.y + h.y + h.h / 2;
    for (i = 0; i < a.length; i++) {
      o = a[i]; if (!o.on || t < o.t0) continue;
      e = (t - o.t0) / o.ms; if (e >= 1) { o.on = false; continue; }
      e = ease.inCubic(e); cx = (o.x0 + x1) / 2 - 0.1 * lay.S; cy = Math.min(o.y0, y1) - 0.2 * lay.S;
      x = (1 - e) * (1 - e) * o.x0 + 2 * (1 - e) * e * cx + e * e * x1;
      y = (1 - e) * (1 - e) * o.y0 + 2 * (1 - e) * e * cy + e * e * y1;
      s = 24 * u * (1 - 0.25 * e);
      ctx.drawImage(coinCv, x - s / 2, y - s / 2, s, s);
    }
  }

  /** A four-point white sparkle of radius s at (x, y). */
  function sparkle(ctx, x, y, s) {
    if (s <= 0.2) return;
    ctx.beginPath(); ctx.moveTo(x, y - s);
    ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s);
    ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s);
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
  }

  var vig = { g: null, h: 0 };
  /**
   * Step 11 (screen px, no shake or zoom): red bottom danger vignette (level 2, alpha 0.35 * dangerTicks / GRACE),
   * the WIN_SEQ pale-yellow flash (0.35 -> 0 over 120 ms) and the LOSE_SEQ / OVER_MENU dim (fades in over 600 ms).
   */
  function screen(ctx, app, g, vw, vh, t) {
    if (g && g.dangerLevel === 2 && g.dangerTicks > 0) {
      if (!vig.g || vig.h !== vh) {
        vig.g = ctx.createLinearGradient(0, vh * 0.5, 0, vh); vig.h = vh;
        vig.g.addColorStop(0, 'rgba(255,40,40,0)'); vig.g.addColorStop(1, 'rgba(255,40,40,1)');
      }
      ctx.globalAlpha = v('VIGNETTE_ALPHA', 0.35) * c01(g.dangerTicks / ((g.rules && g.rules.GRACE_TICKS) || 600));
      ctx.fillStyle = vig.g; ctx.fillRect(0, vh * 0.5, vw, vh * 0.5);
    }
    var s = fx.seq, st = app && app.state, e;
    if (s.winT0 >= 0 && (st === 'WIN_SEQ' || st === 'PLAY')) {
      e = (t - s.winT0) / v('WIN_FLASH_MS', 120);
      if (e < 1 && e >= 0) { ctx.globalAlpha = v('WIN_FLASH_ALPHA', 0.35) * (1 - e); ctx.fillStyle = F.WIN_FLASH || 'rgb(255,246,200)'; ctx.fillRect(0, 0, vw, vh); }
    }
    if (s.loseT0 >= 0 && (st === 'LOSE_SEQ' || st === 'OVER_MENU')) {
      ctx.globalAlpha = c01((t - s.loseT0) / v('LOSE_DIM_MS', 600));
      ctx.fillStyle = F.LOSE_DIM || 'rgba(40,20,10,0.35)'; ctx.fillRect(0, 0, vw, vh);
    }
    ctx.globalAlpha = 1;
  }

  render.fxdraw = { rays: rays, over: over, confetti: confetti, texts: texts, coins: coins, sparkle: sparkle, screen: screen, shape: shape };
})(typeof globalThis !== 'undefined' ? globalThis : this);
