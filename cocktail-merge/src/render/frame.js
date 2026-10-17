// src/render/frame.js: CM.render.init / resize / draw / view, the render pipeline of DESIGN 5.10.
// Browser file (Canvas 2D, Safari 15 safe). Uses the art caches (CM.art.buildSprites, paintTable, paintBackground,
// paintRoof), the image scenes (CM.art.backgrounds) when ready, and fx.js / fxdraw.js / guides.js for the rest.
// Transforms: "screen" = dpr * (win zoom about its screen centre) + shake, for the background and the roof;
// "world" = dpr * (headroom zoom, then win zoom) + shake, for everything on the table. The vignette, flash and dim
// use dpr only. Headroom (owner item 2): when computeLayout leaves too little room above the far edge for the
// tallest sprite standing at y = r, a base zoom about (cx, nearY) shrinks the world slightly; render.view() returns
// the composite zoom, so input inversion (projection.unprojectPointer) stays exact.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var render = CM.render = CM.render || {};
  var P = CM.projection, art = CM.art, fx = render.fx, fxd = render.fxdraw, gd = render.guides;
  var CFG = CM.config || {}, F = CFG.FX || {}, TABLE = CFG.TABLE || { DANGER_Y: 130, LAUNCH_Y: 144 };
  var TAU = Math.PI * 2, SAND = '#F2D6A2', LONG_ID = 1e9;
  var cv = null, ctx = null, lay = null, bgLay = null, dpr = 1, vw = 1, vh = 1, mg = 0, uK = 1, debug = false;
  // Static scene layer (perf, owner's phone report): background + table + roof live on a second canvas (#game-bg)
  // under the game canvas and are redrawn only when their inputs change. Phones (pointer: coarse) and lowFx
  // freeze the parallax layers so the whole scene can be static. Shake and the win zoom fall back to one canvas.
  var bcv = null, bctx = null, SL = { lay: null, dpr: 0, z: 0, ver: -1, cur: null, ready: null, DY: 0, frozen: null, mode: '' };
  var LITE = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
  var C = { bg: null, bgMode: '', bgVer: -1, bgLay: null, bgDpr: 0, table: null, tLay: null, tDpr: 0, tDY: 0, tb: { x: 0, y: 0, w: 1, h: 1 },
    roof: null, rLay: null, rDpr: 0, spr: null, sRadii: null, sLay: null, sDpr: 0, aura: null };
  var head = { lay: null, radii: undefined, z: 1, farTop: 0 };
  var fp = { X: 0, Y: 0, rx: 0, ry: 0 }, pt = { X: 0, Y: 0 }, lk = {}, gs = {};
  var items = [], order = [], nItems = 0;
  var own = { cap: 2, sum: 0, n: 0, t0: 0 };
  var fonts = [], DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

  function clock() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }
  function newCanvas(w, h) { var c = root.document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function release(c) { if (c) { c.width = 0; c.height = 0; } return null; }
  function radiusOf(radii, t) { return (radii && radii[t]) || (CFG.TIERS && CFG.TIERS[t] && CFG.TIERS[t].radius) || 10; }

  function init(canvas) {
    cv = canvas;
    bcv = root.document && root.document.getElementById('game-bg');
    bctx = bcv ? bcv.getContext('2d') : null;   // alpha: a freshly resized canvas is transparent (page shows sand), never black
    if (!bctx) bcv = null;
    ctx = cv.getContext('2d', { alpha: !!bctx }) || cv.getContext('2d');
    try { debug = /[?&]debug=1(&|$)/.test(root.location.search); } catch (e) { debug = false; }
    if (debug && root.document) {
      root.document.addEventListener('keydown', function (ev) {      // key 9: two touching T8s (5.10)
        var a = CM.app && CM.app.ctx, g = a && a.game;
        if (ev.key !== '9' || !g || a.state !== 'PLAY') return;
        CM.game.debugAddBody(g, 8, 40, 30, 0, 0, { age: 24, cleared: true });
        CM.game.debugAddBody(g, 8, 60, 30, 0, 0, { age: 24, cleared: true });
      });
    }
  }
  function setBacking(d) {
    dpr = d;
    var W = Math.max(1, Math.round(vw * d)), H = Math.max(1, Math.round(vh * d));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    if (cv.style) { cv.style.width = vw + 'px'; cv.style.height = vh + 'px'; }
    if (bcv) {
      if (bcv.width !== W || bcv.height !== H) { bcv.width = W; bcv.height = H; }
      if (bcv.style) { bcv.style.width = vw + 'px'; bcv.style.height = vh + 'px'; }
      SL.lay = null;                                                     // force a static redraw
    }
    // Bilinear on purpose (deviation from 4.2's 'high'): sprites are always drawn at 0.55-1.03x their cache
    // resolution, where bilinear looks the same, and 'high'/'medium' rebuild mipmaps of canvas sources on every
    // drawImage (measured 3x the frame cost in Chrome).
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'low';
  }
  function resize(l) {
    if (!l || !ctx) return;
    lay = l; vw = l.vw; vh = l.vh; uK = l.uiK || l.kX / 3.4; mg = Math.ceil(12 * uK);
    setBacking(Math.min(l.dpr || 1, own.cap));
    head.lay = null; fx.setLayout(l);
  }
  function effDpr(app) { var cap = (app && typeof app.dprCap === 'number') ? app.dprCap : own.cap; return Math.min(lay.dpr || 1, cap); }

  /** Owner item 2: the tallest sprite (TOPA * R above its anchor) standing at y = r must clear the HUD and the roof. */
  function headroom(radii) {
    head.lay = lay; head.radii = radii;
    var lim = Math.max(lay.hud ? lay.hud.bottom : 0, 0.105 * lay.H + 9 * uK) + 4, top = Infinity, t, R, b;
    for (t = 1; t <= 9; t++) {
      R = radiusOf(radii, t); b = art.spriteBounds ? art.spriteBounds(t, false) : art.glass.spriteBox(t);
      P.footprint(lay, 50, R, R, fp);
      top = Math.min(top, fp.Y - b.ay * R * lay.kX * P.scaleAt(R));
    }
    var by = lay.nearY, z = top >= lim ? 1 : Math.max(0.75, (by - lim) / (by - top));
    head.z = z; fx.setBase(z, lay.cx, by);
    bgLay = Object.create(lay); bgLay.farY = by - z * (by - lay.farY);
    head.farTop = by - z * (by - P.project(lay, 50, -5, pt).Y);
  }
  function sprites(radii) {
    if (C.spr && C.sRadii === radii && C.sLay === lay && C.sDpr === dpr) return C.spr;
    C.sRadii = radii; C.sLay = lay; C.sDpr = dpr;
    C.spr = art.buildSprites({ kX: lay.kX, dpr: dpr }, radii);
    return C.spr;
  }
  function tableCache(DY) {
    if (C.table && C.tLay === lay && C.tDpr === dpr && C.tDY === DY) return;
    C.tLay = lay; C.tDpr = dpr; C.tDY = DY; release(C.table);
    var x0 = P.project(lay, -5, 165, pt).X - 4, x1 = P.project(lay, 105, 165, pt).X + 4;
    var y0 = P.project(lay, 50, -5, pt).Y - 4, y1 = P.project(lay, 50, 165, pt).Y + 11 * lay.kX + 4, b = C.tb;
    b.x = x0; b.y = y0; b.w = x1 - x0; b.h = y1 - y0;
    C.table = newCanvas(b.w * dpr, b.h * dpr);
    var c = C.table.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
    art.paintTable(c, lay, { DANGER_Y: DY });
  }
  function bgCache(mode, ver, paint) {
    if (C.bg && C.bgMode === mode && C.bgVer === ver && C.bgLay === bgLay && C.bgDpr === dpr) return;
    C.bgMode = mode; C.bgVer = ver; C.bgLay = bgLay; C.bgDpr = dpr; release(C.bg);
    C.bg = newCanvas((vw + 2 * mg) * dpr, (vh + 2 * mg) * dpr);
    var c = C.bg.getContext('2d'); c.scale(dpr, dpr); paint(c);
  }
  function paintProc(c) { art.paintBackground(c, bgLay, vw, vh, mg, { static: true }); }
  function paintImg(c) { art.backgrounds.paint(c, bgLay, vw, vh, mg); }

  /** Step 2: the image scene when ready (either backgrounds API), else the procedural beach of 4.5. */
  function background(app, t, red, c, frozen) {
    var BG = art.backgrounds, key = app && app.bgKey;
    c = c || ctx;
    if (BG && typeof BG.draw === 'function' && typeof BG.ready === 'function') {
      if (key && BG.ready(key)) {
        c.save(); c.translate(-mg, -mg); BG.draw(c, key, vw + 2 * mg, vh + 2 * mg, head.farTop + mg, t); c.restore();
        return;
      }
    } else if (BG && typeof BG.paint === 'function' && BG.isReady && BG.isReady()) {
      bgCache('img', BG.version ? BG.version() : 0, paintImg);
      c.drawImage(C.bg, -mg, -mg, vw + 2 * mg, vh + 2 * mg);
      if (BG.paintLive) BG.paintLive(c, bgLay, vw, vh, frozen ? 0 : t, red || frozen);
      return;
    }
    bgCache('proc', 0, paintProc);
    c.drawImage(C.bg, -mg, -mg, vw + 2 * mg, vh + 2 * mg);
    art.paintBackgroundLive(c, bgLay, vw, vh, frozen ? 0 : t, red || frozen);
  }
  /** Is the current scene animated (drifting clouds / sway) and allowed to animate? */
  function sceneLive(app) {
    if (LITE || (app && app.lowFx)) return false;
    var BG = art.backgrounds;
    if (BG && typeof BG.hasLive === 'function') return !!BG.hasLive();
    return !(BG && BG.isReady && BG.isReady());                           // the procedural beach animates
  }
  function roofCache() {
    if (C.roof && C.rLay === lay && C.rDpr === dpr) return;
    C.rLay = lay; C.rDpr = dpr; release(C.roof);
    var h = Math.ceil(0.13 * lay.H + 26 * uK) + mg;
    C.roof = newCanvas((vw + 2 * mg) * dpr, h * dpr); C.roof.hCss = h;
    var c = C.roof.getContext('2d'); c.scale(dpr, dpr); c.translate(mg, mg); art.paintRoof(c, lay, vw, { static: true });
  }
  function roof(t, skipStatic) {
    roofCache();
    if (!skipStatic) ctx.drawImage(C.roof, -mg, -mg, vw + 2 * mg, C.roof.hCss);
    art.paintRoofLights(ctx, lay, vw, t);
  }
  function roofStatic(c) {
    roofCache();
    c.drawImage(C.roof, -mg, -mg, vw + 2 * mg, C.roof.hCss);
  }

  function screenT(v, sh, c) { var z = v.zw; (c || ctx).setTransform(dpr * z, 0, 0, dpr * z, dpr * (v.sx * (1 - z) + sh.x), dpr * (v.sy * (1 - z) + sh.y)); }
  function worldT(v, sh, c) { (c || ctx).setTransform(dpr * v.Z, 0, 0, dpr * v.Z, dpr * (v.Tx + sh.x), dpr * (v.Ty + sh.y)); }
  var NOSHAKE = { x: 0, y: 0 };

  /** Redraws the static canvas when any of its inputs changed; returns true when it is in use. */
  function staticLayer(app, g, v, t, red) {
    var BG = art.backgrounds, DY = g ? g.rules.DANGER_Y : TABLE.DANGER_Y;
    var ver = (BG && BG.version) ? BG.version() : 0, cur = (BG && BG.current) ? BG.current() : null;
    var ready = !!(BG && BG.isReady && BG.isReady()), frozen = true;
    if (SL.lay === lay && SL.dpr === dpr && SL.z === head.z && SL.ver === ver && SL.cur === cur && SL.ready === ready && SL.DY === DY && SL.frozen === frozen) return true;
    SL.lay = lay; SL.dpr = dpr; SL.z = head.z; SL.ver = ver; SL.cur = cur; SL.ready = ready; SL.DY = DY; SL.frozen = frozen;
    bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.globalAlpha = 1;
    bctx.fillStyle = SAND; bctx.fillRect(0, 0, bcv.width, bcv.height);
    screenT(v, NOSHAKE, bctx); background(app, t, red, bctx, true);
    worldT(v, NOSHAKE, bctx); tableCache(DY); bctx.drawImage(C.table, C.tb.x, C.tb.y, C.tb.w, C.tb.h);
    screenT(v, NOSHAKE, bctx); roofStatic(bctx);
    return true;
  }

  /** Danger fuse (3.8): from both table edges toward the centre, f = dangerTicks / GRACE of each half. */
  function fuse(g) {
    if (!(g.dangerTicks > 0)) return;
    var ru = g.rules, f = Math.min(1, g.dangerTicks / (ru.GRACE_TICKS || 600)), DY = ru.DANGER_Y, Y = P.project(lay, 0, DY, pt).Y;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = (F.FUSE_PX || 4) * uK;
    ctx.strokeStyle = g.overIds && g.overIds.length ? (F.LINE2_COLOR || '#FF4D4D') : (F.LINE1_COLOR || '#FFB347');
    ctx.beginPath();
    ctx.moveTo(P.project(lay, 0.5, DY, pt).X, Y); ctx.lineTo(P.project(lay, Math.max(0.5, 50 * f), DY, pt).X, Y);
    ctx.moveTo(P.project(lay, 99.5, DY, pt).X, Y); ctx.lineTo(P.project(lay, Math.min(99.5, 100 - 50 * f), DY, pt).X, Y);
    ctx.stroke(); ctx.restore();
  }

  function item() { var it = items[nItems]; if (!it) { it = items[nItems] = { X: 0, Y: 0, rx: 0, ry: 0 }; } nItems++; order.push(it); return it; }
  function fill(it, kind, id, tier, x, y, r) {
    it.kind = kind; it.id = id; it.tier = tier; it.x = x; it.y = y; it.r = r;
    it.pop = 1; it.sq = 0; it.rot = 0; it.alpha = 1; it.flash = 0; it.red = 0; it.offPx = 0;
    P.footprint(lay, x, y, r, it);
    return it;
  }
  function byDepth(a, b) { return (a.y - b.y) || (a.id - b.id); }
  /** Step 6 list: bodies at interpolated positions, merge ghosts and the launcher glass, with their FX looks. */
  function collect(app, g, alpha, t, L) {
    nItems = 0; order.length = 0;
    var b = g.bodies, i, o, x, y, it, blink = g.dangerLevel === 2 && Math.floor(t / 125) % 2 === 0, ov = g.overIds || [];
    for (i = 0; i < b.length; i++) {
      o = b[i]; x = o.px + (o.x - o.px) * alpha; y = o.py + (o.y - o.py) * alpha;
      fx.look(o.id, t, lk);
      it = fill(item(), 0, o.id, o.tier, x + lk.offU, y, o.r);
      it.pop = lk.pop; it.sq = lk.sq; it.rot = lk.rot; it.flash = lk.flash; it.red = lk.red;
      if (blink && ov.indexOf(o.id) >= 0) it.red = Math.max(it.red, F.OVER_BLINK_ALPHA || 0.5);
      if (o.tier === 9) fx.note(o.id, x, y);
    }
    for (i = 0; i < fx.ghosts.length; i++) {
      o = fx.ghosts[i]; if (!o.on || !fx.ghostAt(o, t, gs)) continue;
      it = fill(item(), 1, -1 - i, gs.tier, gs.x, gs.y, gs.r);
      it.pop = gs.scale; it.alpha = gs.alpha; it.sq = gs.sq; it.rot = gs.rot;
    }
    if (g.phase !== 'over' && L.fly === -1 && g.current > 0) {
      var r = g.rules.RADII[g.current];
      x = Math.max(r, Math.min(100 - r, L.x));
      it = fill(item(), 2, LONG_ID, g.current, x, g.rules.LAUNCH_Y || 144, r);
      it.pop = 1 + (F.IDLE_PULSE || 0.02) * Math.sin(TAU * (F.IDLE_HZ || 1.2) * t / 1000); it.offPx = L.offPx;
      return it;
    }
    return null;
  }
  function drawSprite(sp, X, Y, sc, sq, rot, alpha, flash, red) {
    ctx.save(); ctx.translate(X, Y); if (rot) ctx.rotate(rot); ctx.scale(sc * (1 + 0.5 * sq), sc * (1 - sq));
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(sp.canvas, -sp.axPx, -sp.ayPx);
    if (flash > 0) { ctx.globalAlpha = flash * alpha; ctx.drawImage(sp.white, -sp.axPx, -sp.ayPx); }
    if (red > 0) { ctx.globalAlpha = red; ctx.drawImage(sp.red, -sp.axPx, -sp.ayPx); }
    ctx.restore();
  }
  function rpxOf(it) { return it.r * lay.kX * P.scaleAt(it.y) * it.pop; }
  function numberDisc(it) {         // optional tier numbers (4.3): cream disc at anchor offset (0.6, -0.25) * Rpx
    var R = rpxOf(it), d = Math.max(18, 0.7 * R), x = it.X + it.offPx + 0.6 * R, y = it.Y - 0.25 * R;
    ctx.beginPath(); ctx.arc(x, y, d / 2, 0, TAU); ctx.fillStyle = '#FFF3D6'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#7A4A22'; ctx.stroke();
    var px = Math.round(Math.max(13, 0.5 * d));
    ctx.fillStyle = '#7A4A22'; ctx.font = fonts[px] || (fonts[px] = '800 ' + px + 'px ' + fx.FONT);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(DIGITS[it.tier], x, y + 0.5);
  }
  function aura(it, t) {             // jug aura (3.8): yellow-gold radial behind every T9, pulsing 1 +- 0.06 at 1 Hz
    if (!C.aura) {
      C.aura = newCanvas(64, 64); var c = C.aura.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,210,63,0.35)'); g.addColorStop(1, 'rgba(255,210,63,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    }
    var s = (F.AURA_SCALE || 1.4) * (1 + (F.AURA_PULSE || 0.06) * Math.sin(TAU * (F.AURA_HZ || 1) * t / 1000)), rx = it.rx * s, ry = it.ry * s;
    ctx.drawImage(C.aura, it.X - rx, it.Y - ry, 2 * rx, 2 * ry);
  }
  function sparkles(it, t) {         // 2 white four-point sparkles on the T9 highlight points, 1.5 s period, offset 0.75 s
    var pts = (art.tiers && art.tiers[9] && art.tiers[9].sparkles) || [[-0.56, -2.01], [0.75, -0.8]], R = rpxOf(it), i, ph;
    for (i = 0; i < pts.length; i++) {
      ph = ((t / 1000 + i * (F.SPARKLE_OFFSET_S || 0.75)) / (F.SPARKLE_PERIOD_S || 1.5)) % 1;
      fxd.sparkle(ctx, it.X + pts[i][0] * R, it.Y + pts[i][1] * R, 0.16 * R * Math.sin(Math.PI * ph));
    }
  }

  /** Steps 3-8 in world space. */
  function world(app, g, alpha, t, L, skipTable) {
    var ru = g.rules, spr = sprites(ru.RADII), i, it, sp, launcher, show = !!(app.save && app.save.showNumbers);
    if (!skipTable) { tableCache(ru.DANGER_Y); ctx.drawImage(C.table, C.tb.x, C.tb.y, C.tb.w, C.tb.h); }
    art.paintDangerLine(ctx, lay, ru, g.dangerLevel, t);
    fuse(g);
    gd.aim(ctx, lay, app, g, t);
    launcher = collect(app, g, alpha, t, L);
    for (i = 0; i < nItems; i++) {                                        // 5. shadow pass
      it = items[i]; if (it.kind === 1) continue;
      art.paintShadow(ctx, it, it.tier);
      if (it.tier === 9) aura(it, t);
    }
    if (launcher) gd.launcherMarks(ctx, lay, g, L, launcher.x, launcher.r);
    fxd.rays(ctx, lay, t);
    order.sort(byDepth);                                                 // 6. bodies far -> near
    for (i = 0; i < order.length; i++) {
      it = order[i]; sp = spr[it.tier]; if (!sp) continue;
      drawSprite(sp, it.X + it.offPx, it.Y, it.r * lay.kX * P.scaleAt(it.y) * it.pop / sp.rp, it.sq, it.rot, it.alpha, it.flash, it.red);
      if (show && it.kind !== 1) numberDisc(it);
    }
    if (launcher && (sp = spr[launcher.tier])) {                         // 7. line through the launcher, badge, hint
      var sc = launcher.r * lay.kX * P.scaleAt(launcher.y) * launcher.pop / sp.rp;
      ctx.save(); ctx.beginPath();
      ctx.rect(launcher.X + launcher.offPx - sp.axPx * sc, launcher.Y - sp.ayPx * sc, sp.canvas.width * sc, sp.canvas.height * sc); ctx.clip();
      art.paintDangerLine(ctx, lay, ru, g.dangerLevel, t, 0.5); ctx.restore();
      if (app.state === 'PLAY' && app.intents && app.intents.cancel) gd.cancelBadge(ctx, lay, launcher.X + launcher.offPx, launcher.Y, rpxOf(launcher));
    }
    gd.handHint(ctx, lay, app, g, t);
    if (gd.bombReticle) gd.bombReticle(ctx, lay, app, g, t);
    fxd.over(ctx, lay, t);                                               // 8. rings, particles, jug sparkles
    for (i = 0; i < nItems; i++) if (items[i].tier === 9 && items[i].kind === 0) sparkles(items[i], t);
    if (debug) gd.colliders(ctx, lay, g, alpha);
  }
  /** NEXT -> launcher (3.8): from the NEXT box centre along a quadratic bezier (control 20 % S above the midpoint). */
  function nextFly(g, L, v) {
    var h = lay.hud && lay.hud.next, spr = C.spr; if (L.fly < 0 || !h || !spr || !spr[L.flyTier] || !g.rules) return;
    var r = g.rules.RADII[L.flyTier], LY = g.rules.LAUNCH_Y || 144, x1, y1, x0, y0, cx, cy, e = L.fly, X, Y, sp = spr[L.flyTier];
    x0 = (lay.stage.x + h.x + h.w / 2 - v.Tx) / v.Z; y0 = (lay.stage.y + h.y + h.h / 2 - v.Ty) / v.Z;     // screen -> world
    P.footprint(lay, Math.max(r, Math.min(100 - r, L.x)), LY, r, fp); x1 = fp.X; y1 = fp.Y;
    cx = (x0 + x1) / 2; cy = (y0 + y1) / 2 - 0.2 * lay.S;
    X = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * cx + e * e * x1; Y = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * cy + e * e * y1;
    drawSprite(sp, X, Y, r * lay.kX * P.scaleAt(LY) * ((F.NEXT_FLY_SCALE0 || 0.6) + (1 - (F.NEXT_FLY_SCALE0 || 0.6)) * e) / sp.rp, 0, 0, 1, 0, 0);
  }

  /** draw(app, alpha, realDt, nowMs) (5.5, 5.10); app = CM.app.ctx. */
  function draw(app, alpha, realDt, nowMs) {
    if (!ctx || !app || !app.lay) return;
    if (app.lay !== lay) resize(app.lay);
    var w0 = clock(), t = typeof nowMs === 'number' ? nowMs : w0, d = effDpr(app);
    if (d !== dpr) setBacking(d);
    var g = app.state === 'TITLE' ? app.attract : (app.state === 'BOOT' ? null : app.game);
    if (g && !g.rules) g = null;
    if (g) fx.bindGame(g);
    var radii = g ? g.rules.RADII : null;
    if (head.lay !== lay || head.radii !== radii) headroom(radii);
    fx.update(t, realDt || 0, g ? g.aimX : undefined);
    var v = fx.view, sh = fx.shakeOffset(t), red = fx.reduced(), L = fx.launcherAt(t);
    var useStatic = !!bctx && (typeof v.zw === 'number' ? v.zw : v.zoom) === 1 && !sh.x && !sh.y && !sceneLive(app);   // win zoom only: the headroom zoom is constant
    render.lastStatic = useStatic;                                              // test hook
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;                     // 1. clear
    if (useStatic) {
      staticLayer(app, g, v, t, red);                                           // scene on #game-bg (redrawn on change only)
      ctx.clearRect(0, 0, cv.width, cv.height);
    } else {
      ctx.fillStyle = SAND; ctx.fillRect(0, 0, cv.width, cv.height);
      screenT(v, sh); background(app, t, red, ctx, !sceneLive(app));             // 2. background on the game canvas
    }
    worldT(v, sh);
    if (g) world(app, g, alpha > 0 ? Math.min(1, alpha) : 0, t, L, useStatic);  // 3-8
    else if (!useStatic) { tableCache(TABLE.DANGER_Y); ctx.drawImage(C.table, C.tb.x, C.tb.y, C.tb.w, C.tb.h); }
    ctx.setTransform(dpr, 0, 0, dpr, dpr * sh.x, dpr * sh.y); fxd.confetti(ctx, t);
    screenT(v, sh); roof(t, useStatic);                                         // 9. roof over the glasses (lights always live)
    worldT(v, sh); fxd.texts(ctx, lay, t);                                       // 10. floaters, labels
    if (g) nextFly(g, L, v);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);                                     // 11. screen space
    fxd.coins(ctx, lay, t);
    fxd.screen(ctx, app, g, vw, vh, t);
    if (debug) gd.readout(ctx, app, g, 'dpr ' + dpr + '  headroom zoom ' + head.z.toFixed(3) + '  view ' + v.zoom.toFixed(3), (lay.hud ? lay.hud.bottom : 0) + 6);
    if (typeof app.dprCap !== 'number') fallback(clock() - w0, t, app);
  }
  /** Own adaptive fallback (7, item 7), used only when the app loop does not provide ctx.dprCap. */
  function fallback(ms, t, app) {
    if (app.state !== 'PLAY' || own.cap <= 1) { own.sum = 0; own.n = 0; own.t0 = t; return; }
    own.sum += ms; own.n++;
    if (t - own.t0 < 2000) return;
    if (own.sum / own.n > 12) { own.cap = own.cap > 1.5 ? 1.5 : 1; app.lowFx = true; }
    own.sum = 0; own.n = 0; own.t0 = t;
  }
  function view() { return fx.view; }

  render.init = init;
  render.resize = resize;
  render.draw = draw;
  render.view = view;
  render.headroom = function () { return head.z; };
  render.debugStatic = function () { return { bgCanvas: !!bctx, lastStatic: !!render.lastStatic, zw: fx.view.zw, lite: LITE, shake: fx.shakeOffset(0) }; };
})(typeof globalThis !== 'undefined' ? globalThis : this);
