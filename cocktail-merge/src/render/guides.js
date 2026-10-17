// src/render/guides.js: the player-facing guides drawn by the render pipeline (DESIGN 5.10 steps 4, 5, 7 and the
// ?debug=1 overlay): the perspective aim guide with the gold merge hint, the launcher cooldown ring and chevron,
// the cancel badge, the first-run hand hint, and the debug colliders and readout. Browser file (Canvas 2D,
// Safari 15 safe); split from frame.js to keep both small. Sets CM.render.guides. World px (frame applies the view).
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var render = CM.render = CM.render || {};
  var P = CM.projection;
  var F = (CM.config && CM.config.FX) || {};
  var TAU = Math.PI * 2;
  var BROWN = '#7A4A22', GOLD = '#FFD23F', RED = '#FF4D4D';
  function v(name, d) { return typeof F[name] === 'number' ? F[name] : d; }
  function k(lay) { return lay.uiK || lay.kX / 3.4; }
  function num(x, d) { return typeof x === 'number' ? x : d; }
  var fp = { X: 0, Y: 0, rx: 0, ry: 0 }, pt = { X: 0, Y: 0 };

  // firstHit is a static snapshot of the board (5.10 step 4); recomputed only when tick, aim or tier change.
  var hc = { g: null, tick: -1, aim: NaN, cur: 0, n: -1, hit: null };
  function aimHit(g, r) {
    if (hc.g !== g || hc.tick !== g.tick || hc.aim !== g.aimX || hc.cur !== g.current || hc.n !== g.bodies.length) {
      hc.g = g; hc.tick = g.tick; hc.aim = g.aimX; hc.cur = g.current; hc.n = g.bodies.length;
      hc.hit = CM.game.firstHit(g, g.aimX, r);
    }
    return hc.hit;
  }
  function ellipse(ctx, f, grow) { ctx.beginPath(); ctx.ellipse(f.X, f.Y, f.rx * grow, f.ry * grow, 0, 0, TAU); }

  /**
   * Step 4: dots every 6 u from y = LAUNCH_Y - r to the hit, radius 2 px*uiK*s(y), alpha 0.55 -> 0.25, then a ghost
   * footprint at the hit. Gold (#FFD23F, 4 Hz glow) only for a guaranteed same-tier merge; blocked = red ghost at the
   * launcher and no dots; cancel state = grey at alpha 0.3; cooldown = alpha 0.35.
   */
  function aim(ctx, lay, app, g, t) {
    if (!g || !app || app.state !== 'PLAY' || (g.phase !== 'ready' && g.phase !== 'cooldown')) return;
    var ru = g.rules || {}, r = ru.RADII[g.current], LY = num(ru.LAUNCH_Y, 144), hit = aimHit(g, r), u = k(lay);
    if (!hit) return;
    var cancel = !!(app.intents && app.intents.cancel), base = cancel ? 0.3 : (g.phase === 'cooldown' ? 0.35 : 1);
    ctx.save();
    if (hit.blocked) {
      P.footprint(lay, g.aimX, LY, r, fp);
      ctx.globalAlpha = 0.18 * base; ctx.fillStyle = RED; ellipse(ctx, fp, 1); ctx.fill();
      ctx.globalAlpha = 0.9 * base; ctx.strokeStyle = RED; ctx.lineWidth = 2.5 * u; ctx.stroke();
      ctx.restore(); return;
    }
    var gold = false;
    if (!cancel && hit.id > 0 && hit.tier === g.current) {
      var travel = Math.floor((LY - hit.y) / (num(ru.V0, 150) * num(ru.DT, 1 / 240)));
      gold = !!hit.launched || hit.age + travel >= num(ru.MERGE_IMMUNE_TICKS, 24);
    }
    var col = cancel ? '#9C9C9C' : (gold ? GOLD : '#FFFFFF'), pulse = gold ? 0.5 + 0.5 * Math.sin(TAU * 4 * t / 1000) : 0;
    var y0 = LY - r, yEnd = hit.y + r, n = Math.max(1, Math.floor((y0 - yEnd) / 6)), i, y, s, rad;
    ctx.fillStyle = col;
    for (i = 0; i <= n; i++) {
      y = y0 - 6 * i; if (y <= yEnd) break;
      P.project(lay, g.aimX, y, pt); s = P.scaleAt(y); rad = 2 * u * s * (gold ? 1.15 : 1);
      if (gold) { ctx.globalAlpha = 0.35 * pulse * base; ctx.beginPath(); ctx.arc(pt.X, pt.Y, rad * 2.4, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = (0.55 - 0.30 * i / n) * base; ctx.beginPath(); ctx.arc(pt.X, pt.Y, rad, 0, TAU); ctx.fill();
    }
    P.footprint(lay, g.aimX, hit.y, r, fp);
    ctx.globalAlpha = (gold ? 0.22 + 0.18 * pulse : 0.14) * base; ellipse(ctx, fp, 1); ctx.fill();
    if (gold) { ctx.globalAlpha = 0.35 * pulse * base; ctx.strokeStyle = GOLD; ctx.lineWidth = 6 * u; ellipse(ctx, fp, 1.04); ctx.stroke(); }
    ctx.globalAlpha = 0.85 * base; ctx.strokeStyle = col; ctx.lineWidth = 2 * u;
    if (ctx.setLineDash && !gold) ctx.setLineDash([5 * u, 4 * u]);
    ellipse(ctx, fp, 1); ctx.stroke();
    ctx.restore();
  }

  /**
   * Step 5, launcher marks: the cooldown ring (2 px*k white arc, alpha 0.7, clockwise from 12 o'clock over the
   * cooldown; full orange #FFB347 while a refused launch flashes) and the white chevron at y = 158 under the
   * rendered launcher x. L = fx.launcherAt(); x is the sim x of the drawn launcher.
   */
  function launcherMarks(ctx, lay, g, L, x, r) {
    var u = k(lay), ru = g.rules || {}, cd = num(ru.COOLDOWN_TICKS, 96), frac;
    P.footprint(lay, x, num(ru.LAUNCH_Y, 144), r, fp); fp.X += L.offPx;
    if (L.flash || g.phase === 'cooldown') {
      frac = L.flash ? 1 : Math.max(0, Math.min(1, 1 - g.cooldown / cd));
      ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = v('COOLDOWN_RING_PX', 2) * u;
      ctx.globalAlpha = L.flash ? 0.95 : v('COOLDOWN_RING_ALPHA', 0.7); ctx.strokeStyle = L.flash ? (F.NOT_READY_COLOR || '#FFB347') : '#FFFFFF';
      ctx.beginPath(); ctx.ellipse(fp.X, fp.Y, fp.rx * 1.2, fp.ry * 1.2, 0, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.stroke();
      ctx.restore();
    }
    P.project(lay, x, v('CHEVRON_Y', 158), pt);
    var w = v('CHEVRON_PX', 10) * u, h = 0.8 * w, cx = pt.X + L.offPx, cy = pt.Y;
    ctx.beginPath(); ctx.moveTo(cx, cy - h / 2); ctx.lineTo(cx + w / 2, cy + h / 2); ctx.lineTo(cx - w / 2, cy + h / 2); ctx.closePath();
    ctx.lineJoin = 'round'; ctx.lineWidth = 2 * u; ctx.strokeStyle = BROWN; ctx.stroke(); ctx.fillStyle = '#FFFFFF'; ctx.fill();
  }

  /** Step 7: the red cancel badge (#FF4D4D disc, white X, 18 px*k) at the launcher's upper right. */
  function cancelBadge(ctx, lay, X, Y, rpx) {
    var u = k(lay), d = 18 * u, x = X + 0.85 * rpx, y = Y - 1.7 * rpx, a = 0.22 * d;
    ctx.beginPath(); ctx.arc(x, y, d / 2, 0, TAU); ctx.fillStyle = RED; ctx.fill();
    ctx.lineWidth = 1.5 * u; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
    ctx.lineCap = 'round'; ctx.lineWidth = 2.4 * u; ctx.beginPath();
    ctx.moveTo(x - a, y - a); ctx.lineTo(x + a, y + a); ctx.moveTo(x + a, y - a); ctx.lineTo(x - a, y + a); ctx.stroke();
  }

  /** Step 7: first-run hint (save.best === 0, before the first launch): a hand sliding +-20 u along y = 152, 1.6 s period. */
  function handHint(ctx, lay, app, g, t) {
    if (!g || !app || app.state !== 'PLAY' || !app.save || app.save.best !== 0 || g.launches !== 0) return;
    var u = k(lay), x = 50 + 20 * Math.sin(TAU * t / 1600), s = 34 * u / 34;
    P.project(lay, x, 152, pt);
    ctx.save(); ctx.translate(pt.X, pt.Y); ctx.scale(s, s);
    ctx.beginPath();                                   // a pointing hand, fingertip at (0, -2)
    ctx.moveTo(-3.5, 2); ctx.lineTo(-3.5, -12); ctx.arc(0, -12, 3.5, Math.PI, 0); ctx.lineTo(3.5, -1);
    ctx.arc(6.3, -1, 2.8, Math.PI, 0); ctx.arc(11.6, 0.5, 2.6, Math.PI, 0); ctx.lineTo(14.2, 10);
    ctx.quadraticCurveTo(14, 20, 5, 21); ctx.lineTo(-1, 21); ctx.quadraticCurveTo(-6, 20, -9, 13);
    ctx.lineTo(-12, 6); ctx.quadraticCurveTo(-13.5, 2.5, -10, 2.5); ctx.quadraticCurveTo(-7, 3, -3.5, 8); ctx.closePath();
    ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = BROWN; ctx.stroke(); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    ctx.restore();
    P.project(lay, 50, 152, pt);
    ctx.save(); ctx.font = '800 ' + Math.max(15, Math.round(15 * u)) + 'px ' + render.fx.FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 4; ctx.strokeStyle = BROWN; ctx.strokeText('Drag here', pt.X, pt.Y - 30 * u);
    ctx.fillStyle = '#FFFFFF'; ctx.fillText('Drag here', pt.X, pt.Y - 30 * u);
    ctx.restore();
  }

  /** ?debug=1 colliders: every body's exact footprint (cyan, 1 px) with a short red tick at Y(y + r) (5.10). */
  function colliders(ctx, lay, g, alpha) {
    if (!g) return;
    var b = g.bodies, i, o, x, y;
    ctx.save(); ctx.lineWidth = 1;
    for (i = 0; i < b.length; i++) {
      o = b[i]; x = o.px + (o.x - o.px) * alpha; y = o.py + (o.y - o.py) * alpha;
      P.footprint(lay, x, y, o.r, fp);
      ctx.strokeStyle = '#00E5FF'; ellipse(ctx, fp, 1); ctx.stroke();
      ctx.strokeStyle = '#FF0000'; ctx.beginPath(); ctx.moveTo(fp.X - 4, fp.Y + fp.ry); ctx.lineTo(fp.X + 4, fp.Y + fp.ry); ctx.stroke();
    }
    ctx.restore();
  }
  /** ?debug=1 readout (screen px, below the DOM HUD at y0): FPS, steps, sim/work ms, bodies, danger, seed, tick, pool growths, errors, view. */
  function readout(ctx, app, g, extra, y0) {
    var s = (app && app.stats) || {}, lines = [
      'fps ' + (s.fps || 0) + '  steps ' + (s.steps || 0) + '  sim ' + (s.simMs || 0).toFixed(2) + ' ms  work ' + (s.workMs || 0).toFixed(2) + ' ms',
      g ? 'bodies ' + g.bodies.length + '  danger ' + g.dangerTicks + '  threat ' + g.threatTicks + '  lvl ' + g.dangerLevel : 'no game',
      g ? 'seed ' + g.seed + '  tick ' + g.tick + '  pool+ ' + ((g.world && g.world.poolGrowths) || 0) + '  ' + g.mode : '',
      extra || ''
    ], errs = (app && app.errors) || {}, e = Object.keys(errs).map(function (n) { return n + ':' + errs[n]; }).join(' ');
    if (e) lines.push('errors ' + e);
    ctx.save(); ctx.font = '11px ui-monospace, Menlo, Consolas, monospace'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    y0 = y0 || 4; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(4, y0, 330, 14 * lines.length + 6);
    ctx.fillStyle = '#B8FFB8';
    lines.forEach(function (l, i) { ctx.fillText(l, 8, y0 + 3 + 14 * i); });
    ctx.restore();
  }

  /** Bomb reticle (owner feature): while aiming, the blast circle's table footprint at the chosen spot. */
  function bombReticle(ctx, lay, app, g, t) {
    var it = app && app.intents;
    if (!g || !it || !it.bombMode || app.state !== 'PLAY') return;
    var ru = g.rules || {}, R = (CM.game.bombRadius ? CM.game.bombRadius(ru) : 16.5), u = k(lay);
    var at = it.bombAt || { x: (ru.W || 100) / 2, y: (ru.L || 160) * 0.55 }, pulse = 0.5 + 0.5 * Math.sin(TAU * t / 700);
    P.footprint(lay, at.x, at.y, R, fp);
    ctx.save();
    ctx.beginPath(); ctx.ellipse(fp.X, fp.Y, fp.rx, fp.ry, 0, 0, TAU);
    ctx.fillStyle = 'rgba(255, 90, 60, ' + (0.14 + 0.08 * pulse).toFixed(3) + ')'; ctx.fill();
    ctx.setLineDash([8 * u, 6 * u]); ctx.lineDashOffset = -t / 40;
    ctx.lineWidth = 3 * u; ctx.strokeStyle = it.bombAt ? RED : 'rgba(255,255,255,0.8)'; ctx.stroke();
    ctx.setLineDash([]);
    P.project(lay, at.x, at.y, pt);
    ctx.lineWidth = 2 * u; ctx.strokeStyle = RED; ctx.beginPath();            // crosshair
    ctx.moveTo(pt.X - 10 * u, pt.Y); ctx.lineTo(pt.X + 10 * u, pt.Y); ctx.moveTo(pt.X, pt.Y - 7 * u); ctx.lineTo(pt.X, pt.Y + 7 * u); ctx.stroke();
    if (!it.bombAt) {
      ctx.font = '900 ' + Math.round(15 * u) + 'px ' + (render.fx ? render.fx.FONT : 'sans-serif'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4 * u; ctx.strokeStyle = BROWN; ctx.fillStyle = '#FFF8E1';
      ctx.strokeText('Tap the table to blast', pt.X, fp.Y - fp.ry - 14 * u); ctx.fillText('Tap the table to blast', pt.X, fp.Y - fp.ry - 14 * u);
    }
    ctx.restore();
  }

  render.guides = { aim: aim, launcherMarks: launcherMarks, cancelBadge: cancelBadge, handHint: handHint, colliders: colliders, readout: readout, bombReticle: bombReticle };
})(typeof globalThis !== 'undefined' ? globalThis : this);
