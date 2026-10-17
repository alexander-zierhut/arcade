// src/render/fx.js: easings and the FX system of DESIGN 3.8 (render-only; never affects the sim).
// Browser file (Canvas 2D, Safari 15 safe). Sets CM.render.fx, CM.render.shake, CM.render.setZoom and
// CM.render.ease. frame.js (loaded next) reads the per-body looks, ghosts, launcher state and view from here.
// Coordinates: "world" = canvas CSS px as returned by CM.projection (before the view zoom); "screen" = canvas
// CSS px after the view zoom. Every pool is pre-allocated; the hot paths allocate nothing.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var render = CM.render = CM.render || {};
  var F = (CM.config && CM.config.FX) || {};
  var TABLE = (CM.config && CM.config.TABLE) || { LAUNCH_Y: 144 };
  var TAU = Math.PI * 2;
  var FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  function v(name, d) { return typeof F[name] === 'number' ? F[name] : d; }

  var ease = {
    outCubic: function (t) { t = 1 - t; return 1 - t * t * t; },
    inCubic: function (t) { return t * t * t; },
    outBack: function (t) { var u = t - 1; return 1 + 2.70158 * u * u * u + 1.70158 * u * u; },
    inOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
    inQuad: function (t) { return t * t; }
  };
  function c01(t) { return t < 0 ? 0 : (t > 1 ? 1 : t); }
  function clock() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }
  // Event stamps live on the draw timeline (the nowMs passed to draw): the last frame's nowMs plus the real time
  // since, so consume() between frames lines up with the next draw whatever clock the caller uses.
  var tl = { t: -1, c: 0 };
  function stamp() { return tl.t < 0 ? clock() : tl.t + (clock() - tl.c); }
  function rnd(a, b) { return a + (b - a) * Math.random(); }
  var mq = null;
  function reduced() {
    try { if (!mq && root.matchMedia) mq = root.matchMedia('(prefers-reduced-motion: reduce)'); return !!(mq && mq.matches); } catch (e) { return false; }
  }
  function keyColor(t) { var T = CM.config && CM.config.TIERS && CM.config.TIERS[t]; return (T && T.color) || '#FFFFFF'; }
  function pool(n, make) { var a = [], i; for (i = 0; i < n; i++) a.push(make()); return a; }
  function take(arr, st) { var o = arr[st.i]; st.i = (st.i + 1) % arr.length; o.on = true; return o; }   // oldest recycled

  var lay = null, game = null, uK = 1, nowMs = 0;
  function R(t) { var r = game && game.rules && game.rules.RADII; return (r && r[t]) || ((CM.config.TIERS[t] || {}).radius || 10); }
  function proj(x, y) { return CM.projection.project(lay, x, y, tmpP); }
  function rpx(x, y, r) { return r * lay.kX * CM.projection.scaleAt(y); }
  var tmpP = { X: 0, Y: 0 };

  // ---- per-body state (3.8 "FX state ownership"): Map keyed by body id, deleted with the body ----
  var bodies = new Map();
  function B(id) {
    var s = bodies.get(id);
    if (!s) { s = { popT0: -1, flashT0: -1, sq: 0, sqv: 0, wobA: 0, wobT0: 0, offU: 0, offT0: -1, blinkT0: -1, blinkN: 0, x: 0, y: 0, seen: false }; bodies.set(id, s); }
    return s;
  }
  var POP0 = v('POP_START', 0.55), POPK = v('POP_PEAK', 1.18), POPU = v('POP_UP_MS', 110), POPE = v('POP_END_MS', 260);
  function popOf(s, t) {
    if (s.popT0 < 0) return 1;
    var a = t - s.popT0;
    if (a < 0) return POP0;
    if (a >= POPE) { s.popT0 = -1; return 1; }
    if (a < POPU) return POP0 + (POPK - POP0) * ease.outCubic(a / POPU);
    return POPK + (1 - POPK) * ease.inOutSine((a - POPU) / (POPE - POPU));
  }
  function wobOf(s, t) {
    if (!s.wobA) return 0;
    var a = Math.max(0, t - s.wobT0) / 1000;
    if (a > 0.9) { s.wobA = 0; return 0; }
    return s.wobA * Math.exp(-a / v('WOBBLE_TAU', 0.18)) * Math.sin(TAU * v('WOBBLE_HZ', 5) * a);
  }
  /** Fills `out` with the live look of body id: pop, sq, rot, offU (sim-x offset), flash (alpha), red (alpha). */
  function look(id, t, out) {
    var s = bodies.get(id), a;
    out.pop = 1; out.sq = 0; out.rot = 0; out.offU = 0; out.flash = 0; out.red = 0;
    if (!s) return out;
    out.pop = popOf(s, t); out.sq = s.sq; out.rot = reduced() ? 0 : wobOf(s, t);
    if (s.offT0 >= 0) { a = (t - s.offT0) / v('LAUNCH_BLEND_MS', 60); if (a >= 1) s.offT0 = -1; else out.offU = s.offU * (1 - c01(a)); }
    if (s.flashT0 >= 0) { a = (t - s.flashT0) / v('FLASH_MS', 140); if (a >= 1) s.flashT0 = -1; else out.flash = v('FLASH_ALPHA', 0.85) * (1 - c01(a)); }
    if (s.blinkT0 >= 0) {
      a = t - s.blinkT0; var bl = v('BLINK_MS', 150);
      if (a >= s.blinkN * 2 * bl) s.blinkT0 = -1; else if (a >= 0 && (a % (2 * bl)) < bl) out.red = 0.6;
    }
    return out;
  }
  var stepDt = 0;
  function stepSpring(s) {
    if (s.sq === 0 && s.sqv === 0) return;
    var n = Math.ceil(stepDt / 0.004), h = stepDt / Math.max(1, n), K = v('SQUASH_K', 420), D = v('SQUASH_DAMP', 16), i;
    for (i = 0; i < n; i++) { s.sqv += (-K * s.sq - D * s.sqv) * h; s.sq += s.sqv * h; }
    if (Math.abs(s.sq) < 1e-4 && Math.abs(s.sqv) < 1e-3) { s.sq = 0; s.sqv = 0; }
  }

  // ---- event-owned pools ----
  var ghosts = pool(16, function () { return { on: false, tier: 1, x0: 0, y0: 0, x1: 0, y1: 0, r: 1, t0: 0, ms: 90, s1: 0.7, pop: 1, sq: 0, rot: 0 }; });
  var rings = pool(24, function () { return { on: false, x: 0, y: 0, r: 1, col: '#fff', t0: 0 }; });
  var rays = pool(6, function () { return { on: false, x: 0, y: 0, r: 1, t0: 0, ms: 600, win: false }; });
  var parts = pool(v('PARTICLE_POOL', 256), function () { return { on: false, x: 0, y: 0, vx: 0, vy: 0, size: 3, t0: 0, life: 500, rot: 0, spin: 0, shape: 'circle', col: '#fff' }; });
  var conf = pool(240, function () { return { on: false, x: 0, y: 0, vx: 0, vy: 0, w: 8, h: 14, rot: 0, spin: 0, flip: 0, col: '#fff', t0: 0 }; });
  var texts = pool(16, function () { return { on: false, kind: 0, a: '', b: '', x: 0, y: 0, size: 16, t0: 0, font: '', grad: null, w: 0 }; });
  var coins = pool(18, function () { return { on: false, x0: 0, y0: 0, t0: 0, ms: 500 }; });
  var st = { g: { i: 0 }, r: { i: 0 }, y: { i: 0 }, p: { i: 0 }, c: { i: 0 }, t: { i: 0 }, k: { i: 0 } };
  var launcher = { x: 50, init: false, shakeT0: -1e9, flyOn: false, flyT0: 0, flyTier: 1 };
  var seq = { winT0: -1, loseT0: -1, winX: 0, winY: 0 };

  function ghost(tier, x0, y0, x1, y1, r, ms, s1, src, t) {
    var g = take(ghosts, st.g);
    g.tier = tier; g.x0 = x0; g.y0 = y0; g.x1 = x1; g.y1 = y1; g.r = r; g.t0 = t; g.ms = ms; g.s1 = s1;
    g.pop = src ? popOf(src, t) : 1; g.sq = src ? src.sq : 0; g.rot = src ? wobOf(src, t) : 0;
  }
  /** Current ghost state into `out` ({x, y, r, tier, scale, alpha, sq, rot}); false when finished. */
  function ghostAt(g, t, out) {
    var a = (t - g.t0) / g.ms;
    if (a >= 1) { g.on = false; return false; }
    a = c01(a); var e = ease.inQuad(a);
    out.x = g.x0 + (g.x1 - g.x0) * e; out.y = g.y0 + (g.y1 - g.y0) * e; out.r = g.r; out.tier = g.tier;
    out.scale = g.pop * (1 + (g.s1 - 1) * e); out.alpha = 1 - e; out.sq = g.sq; out.rot = g.rot;
    return true;
  }
  function ring(x, y, r, col, t0) { var o = take(rings, st.r); o.x = x; o.y = y; o.r = r; o.col = col; o.t0 = t0; }
  function burst(tier, X, Y, t) {
    var defs = (CM.art && CM.art.tiers && CM.art.tiers[tier] && CM.art.tiers[tier].particles) || [{ shape: 'circle', color: keyColor(tier) }];
    var n = Math.min(v('PARTICLES_MAX', 26), v('PARTICLES_BASE', 8) + v('PARTICLES_PER_TIER', 2) * tier), i, p, d, a, sp;
    if (reduced()) n = Math.ceil(n / 2);
    if (CM.app && CM.app.ctx && CM.app.ctx.lowFx) n = Math.ceil(n / 2);
    for (i = 0; i < n; i++) {
      p = take(parts, st.p); d = defs[i % defs.length]; a = rnd(0, TAU);
      sp = rnd(v('PARTICLE_SPEED_MIN', 80), v('PARTICLE_SPEED_MAX', 220)) * uK;
      p.x = X; p.y = Y; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.size = (d.size || rnd(v('PARTICLE_SIZE_MIN', 2), v('PARTICLE_SIZE_MAX', 5))) * uK;
      p.t0 = t; p.life = rnd(v('PARTICLE_LIFE_MIN', 450), v('PARTICLE_LIFE_MAX', 700));
      p.rot = rnd(0, TAU); p.spin = rnd(-1, 1) * v('PARTICLE_SPIN', 6); p.shape = d.shape || 'circle'; p.col = d.color || '#fff';
    }
  }
  function text(kind, a, b, x, y, size, t) {
    if (kind === 1) for (var i = 0; i < texts.length; i++) if (texts[i].on && texts[i].kind === 1) texts[i].on = false;   // newest chain label only
    var o = take(texts, st.t);
    o.kind = kind; o.a = a; o.b = b || ''; o.x = x; o.y = y; o.size = size; o.t0 = t; o.grad = null; o.w = 0;
    o.font = '900 ' + Math.round(size) + 'px ' + FONT;
  }
  var WP = F.WIN_PALETTE || ['#0F8A5F', '#5FD08A', '#FFD23F', '#FFE98A', '#FFFFFF'], WW = F.WIN_PALETTE_WEIGHTS || [30, 20, 30, 10, 10];
  function palette() { var u = Math.random() * 100, i; for (i = 0; i < WW.length; i++) { u -= WW[i]; if (u < 0) return WP[i]; } return WP[0]; }
  /** Confetti in screen px from (x, y); angle range in radians (screen, y down), speed range px/s (already * uiK). */
  function confetti(n, x, y, a0, a1, s0, s1, t) {
    if (CM.app && CM.app.ctx && CM.app.ctx.lowFx) n = Math.ceil(n / 2);
    for (var i = 0; i < n; i++) {
      var c = take(conf, st.c), a = rnd(a0, a1), sp = rnd(s0, s1);
      c.x = x; c.y = y; c.vx = Math.cos(a) * sp; c.vy = Math.sin(a) * sp; c.w = 8 * uK; c.h = 14 * uK;
      c.rot = rnd(0, TAU); c.spin = rnd(-1, 1) * v('CONFETTI_SPIN', 8); c.flip = rnd(0, TAU); c.col = palette(); c.t0 = t + rnd(0, 120);
    }
  }
  function anchorTop(tier, x, y, r) {      // world px just above the glass top
    var b = CM.art && CM.art.spriteBounds ? CM.art.spriteBounds(tier, false) : { ay: 2 };
    var p = proj(x, y); return p.Y - (CM.projection.footprint(lay, x, y, r, tmpF).ry) - 0.85 * b.ay * rpx(x, y, r);
  }
  var tmpF = { X: 0, Y: 0, rx: 0, ry: 0 };

  // ---- view: shake and zoom (5.5) ----
  var shk = { amp: 0, t0: 0, tau: 120, until: 0 }, shOut = { x: 0, y: 0 };
  /** shake(px[, ms]): amplitude in px*uiK, random per frame, decaying exp(-t/0.12 s); with ms: decays over ms. */
  function shake(px, ms) {
    var t = stamp(), tau = ms ? ms / 3 : v('SHAKE_TAU', 0.12) * 1000;
    if (shakeNow(t) > px) return;
    shk.amp = px; shk.t0 = t; shk.tau = tau; shk.until = t + (ms || tau * 5);
  }
  function shakeNow(t) { return (t >= shk.until || !shk.amp) ? 0 : shk.amp * Math.exp(-(t - shk.t0) / shk.tau); }
  function shakeOffset(t) {
    var a = reduced() ? 0 : shakeNow(t) * uK;
    shOut.x = a ? rnd(-a, a) : 0; shOut.y = a ? rnd(-a, a) : 0; return shOut;
  }
  var zm = { from: 1, to: 1, t0: 0, ms: 0, ax: 0, ay: 0 }, base = { z: 1, x: 0, y: 0 };
  var view = { zoom: 1, aboutX: 0, aboutY: 0, Z: 1, Tx: 0, Ty: 0, zw: 1, sx: 0, sy: 0 };
  function zoomNow(t) {
    if (zm.ms <= 0 || t >= zm.t0 + zm.ms) return zm.to;
    return zm.from + (zm.to - zm.from) * ease.inOutSine(c01((t - zm.t0) / zm.ms));
  }
  /** setZoom(target, about {x, y} in world px (null keeps the last), ms): eased with easeInOutSine. */
  function setZoom(target, about, ms) {
    var t = stamp();
    if (reduced()) target = 1;
    zm.from = zoomNow(t); zm.to = target > 0 ? target : 1; zm.t0 = t; zm.ms = ms || 0;
    if (about) { zm.ax = typeof about.x === 'number' ? about.x : (about.X || 0); zm.ay = typeof about.y === 'number' ? about.y : (about.Y || 0); }
  }
  /** Base (headroom) zoom of frame.js, applied under the win zoom, about (x, y) world px. */
  function setBase(z, x, y) { base.z = z; base.x = x; base.y = y; }
  /** Composite world -> screen map P' = Z*P + T and its {zoom, about} form for input inversion (5.5 view()). */
  function updateView(t) {
    var zw = zoomNow(t), z0 = base.z, Z = z0 * zw;
    var Tx = base.x * (1 - z0) + z0 * zm.ax * (1 - zw), Ty = base.y * (1 - z0) + z0 * zm.ay * (1 - zw), d = 1 - Z;
    view.Z = Z; view.Tx = Tx; view.Ty = Ty; view.zw = zw;
    view.sx = base.x + z0 * (zm.ax - base.x); view.sy = base.y + z0 * (zm.ay - base.y);   // win-zoom centre on screen
    if (Math.abs(d) < 1e-9 && Math.abs(Tx) + Math.abs(Ty) < 1e-6) { view.zoom = 1; view.aboutX = 0; view.aboutY = 0; return view; }
    if (Math.abs(d) < 1e-4) { d = 1e-4; Z = 1 - d; }
    view.zoom = Z; view.aboutX = Tx / d; view.aboutY = Ty / d;
    return view;
  }

  // ---- consume (5.5) ----
  function findBody(g, id) { var b = g.bodies, i; for (i = 0; i < b.length; i++) if (b[i].id === id) return b[i]; return null; }
  function impact(g, id, e) {
    var s = B(id), b = findBody(g, id), vn = e.vn;
    if (vn > v('SQUASH_VN', 20)) s.sq = Math.max(s.sq, Math.min(v('SQUASH_MAX', 0.10), (vn - 20) / v('SQUASH_DIV', 700)));
    if (vn > v('WOBBLE_VN', 30) && b) {
      var A = Math.min(v('WOBBLE_MAX', 0.12), (vn - v('WOBBLE_V0', 18)) / v('WOBBLE_DIV', 400)), t = stamp();
      if (Math.abs(wobOf(s, t)) < A) { s.wobA = A * (e.x > b.x ? -1 : 1); s.wobT0 = t; }
    }
  }
  function merge(g, e, t) {
    var sa = bodies.get(e.a), sb = bodies.get(e.b), rp = R(e.tier - 1), rc = R(e.tier), k = uK, p, top;
    ghost(e.tier - 1, e.ax, e.ay, e.x, e.y, rp, v('GHOST_MS', 90), v('GHOST_SCALE', 0.7), sa, t);
    ghost(e.tier - 1, e.bx, e.by, e.x, e.y, rp, v('GHOST_MS', 90), v('GHOST_SCALE', 0.7), sb, t);
    bodies.delete(e.a); bodies.delete(e.b);
    var s = B(e.id); s.popT0 = t; s.flashT0 = t; s.sq = 0; s.sqv = 0; s.wobA = 0;
    ring(e.x, e.y, rc, keyColor(e.tier), t);
    if (e.tier >= v('RING2_MIN_TIER', 6)) ring(e.x, e.y, rc, e.tier === 9 ? '#FFD23F' : '#FFFFFF', t + v('RING2_DELAY_MS', 80));
    p = proj(e.x, e.y); var cy = p.Y - 0.9 * rpx(e.x, e.y, rc);
    burst(e.tier, p.X, cy, t);
    if (e.tier >= 7) { var r = take(rays, st.y); r.x = e.x; r.y = e.y; r.r = rc; r.t0 = t; r.ms = v('RAYS_MS', 600); r.win = e.tier === 9; }
    top = anchorTop(e.tier, e.x, e.y, rc);
    if (e.points > 0) text(0, '+' + e.points, '', p.X, top, Math.max(v('FLOATER_MIN_PX', 13), v('FLOATER_PX', 16) * k), t);
    if (e.depth >= 2) {
      var words = F.CHAIN_WORDS || [], w = words[Math.min(e.depth, words.length - 1)] || '';
      var cs = Math.min(v('CHAIN_PX_MAX', 34), v('CHAIN_PX0', 18) + v('CHAIN_PX_PER_DEPTH', 3) * e.depth) * k;
      text(1, 'CHAIN ×' + e.depth, w, p.X, top - 0.9 * Math.max(13, 16 * k) - (w ? 1.6 : 0.7) * cs, cs, t);
    }
    var sh = (F.SHAKE_BY_TIER || [])[e.tier] || 0;
    if (sh) shake(Math.min(v('SHAKE_MAX', 9), sh + Math.max(0, e.depth - 2)));
    if (e.tier >= v('COIN_FLY_MIN_TIER', 5)) coinsFrom(p.X, cy, Math.min(v('COIN_FLY_MAX', 6), 3 + e.tier - 5), t);
  }
  function coinsFrom(X, Y, n, t) {
    var sx = view.Z * X + view.Tx, sy = view.Z * Y + view.Ty, i, c;     // world -> screen now
    for (i = 0; i < n; i++) {
      c = take(coins, st.k); c.x0 = sx; c.y0 = sy; c.t0 = t + i * v('COIN_STAGGER_MS', 60);
      c.ms = rnd(v('COIN_FLY_MIN_MS', 450), v('COIN_FLY_MAX_MS', 650));
    }
  }
  function jug(g, e, t) {
    var r9 = R(9), sa = bodies.get(e.a), sb = bodies.get(e.b), p = proj(e.x, e.y), k = uK;
    ghost(9, sa && sa.seen ? sa.x : e.x - r9, sa && sa.seen ? sa.y : e.y, e.x, e.y, r9, v('FIESTA_GHOST_MS', 250), 0, sa, t);
    ghost(9, sb && sb.seen ? sb.x : e.x + r9, sb && sb.seen ? sb.y : e.y, e.x, e.y, r9, v('FIESTA_GHOST_MS', 250), 0, sb, t);
    bodies.delete(e.a); bodies.delete(e.b);
    burst(9, p.X, p.Y - rpx(e.x, e.y, r9), t);
    ring(e.x, e.y, r9, keyColor(9), t); ring(e.x, e.y, r9, '#FFD23F', t + 80);
    text(2, 'Fiesta!', '', p.X, p.Y - 2.2 * rpx(e.x, e.y, r9), v('FIESTA_PX', 34) * k, t);
    if (e.points > 0) text(0, '+' + e.points, '', p.X, p.Y - 1.2 * rpx(e.x, e.y, r9), Math.max(13, 16 * k), t);
    confetti(v('FIESTA_CONFETTI', 80), view.Z * p.X + view.Tx, view.Z * p.Y + view.Ty - 40 * k, -Math.PI * 0.85, -Math.PI * 0.15, 300 * k, 750 * k, t);
    shake(8);
  }
  /** Bomb (owner feature): every cleared glass flies into the blast centre as a ghost, then a burst, rings and BOOM! */
  function bomb(g, e, t) {
    var p = proj(e.x, e.y), k = uK, i, b, s;
    for (i = 0; i < e.removed.length; i++) {
      b = e.removed[i]; s = bodies.get(b.id);
      ghost(b.tier, b.x, b.y, e.x, e.y, b.r, v('FIESTA_GHOST_MS', 250) + 20 * (i % 5), 0, s, t);
      bodies.delete(b.id);
    }
    burst(9, p.X, p.Y, t); burst(6, p.X, p.Y - 10 * k, t + 60);
    ring(e.x, e.y, e.r * 0.35, '#FF4D4D', t); ring(e.x, e.y, e.r * 0.6, '#FFD23F', t + 70); ring(e.x, e.y, e.r, '#FFFFFF', t + 140);
    text(2, 'BOOM!', '', p.X, p.Y - 40 * k, v('FIESTA_PX', 34) * k, t);
    if (e.points > 0) text(0, '+' + e.points, '', p.X, p.Y - 12 * k, Math.max(13, 16 * k), t + 80);
    shake(14);
  }
  function consume(events, g, l) {
    if (!events || !g) return;
    if (l) setLayout(l);
    bindGame(g);
    var t = stamp(), attract = !!(CM.app && CM.app.ctx && CM.app.ctx.attract === g && CM.app.ctx.game !== g), i, e, s;
    for (i = 0; i < events.length; i++) {
      e = events[i];
      switch (e.type) {
        case 'impact': impact(g, e.a, e); if (e.b !== null && e.b !== undefined) impact(g, e.b, e); break;
        case 'merge': merge(g, e, t); break;
        case 'jugBurst': jug(g, e, t); break;
        case 'bomb': bomb(g, e, t); break;
        case 'launch':
          launcher.flyOn = false;
          s = B(e.id); s.sq = v('LAUNCH_SQUASH', -0.12); s.sqv = 0;
          if (launcher.init) { s.offU = launcher.x - e.x; s.offT0 = t; }
          launcher.x = e.x;
          break;
        case 'next': launcher.flyOn = true; launcher.flyT0 = t + v('NEXT_FLY_DELAY_MS', 120); launcher.flyTier = e.current; break;
        case 'launchBlocked': s = B(e.blockerId); s.blinkT0 = t; s.blinkN = v('BLOCKER_BLINKS', 2); notReady(); break;
        case 'lose':
          if (attract) break;
          seq.loseT0 = t; shake(v('LOSE_SHAKE_PX', 5), v('LOSE_SHAKE_MS', 400));
          for (var j = 0; e.ids && j < e.ids.length; j++) { s = B(e.ids[j]); s.blinkT0 = t; s.blinkN = 3; }
          break;
        case 'win':
          if (attract) break;
          var wb = findBody(g, e.id);
          seq.winT0 = t;
          if (wb) {
            var wp = proj(wb.x, wb.y), wr = rpx(wb.x, wb.y, wb.r), y = take(rays, st.y);
            y.x = wb.x; y.y = wb.y; y.r = wb.r; y.t0 = t; y.ms = 1500; y.win = true;
            setZoom(v('WIN_ZOOM', 1.10), { x: wp.X, y: wp.Y - wr }, v('WIN_ZOOM_MS', 600));
          }
          var S = lay.S, sx = lay.stage.x, H = lay.H, s0 = v('CONFETTI_SPEED_MIN', 600) * uK, s1 = v('CONFETTI_SPEED_MAX', 1100) * uK;
          var half = Math.round(v('WIN_CONFETTI', 140) / 2), d2r = Math.PI / 180;
          confetti(half, sx, H, -80 * d2r, -60 * d2r, s0, s1, t);
          confetti(half, sx + S, H, -Math.PI + 60 * d2r, -Math.PI + 80 * d2r, s0, s1, t);
          break;
        default: break;
      }
    }
  }
  function notReady() { launcher.shakeT0 = stamp(); }

  function setLayout(l) { lay = l; uK = l.uiK || l.kX / 3.4; }
  function bindGame(g) {
    if (g === game) return;
    game = g; bodies.clear(); launcher.init = false; launcher.flyOn = false;
    for (var i = 0; i < ghosts.length; i++) ghosts[i].on = false;
  }
  function clear() {
    bodies.clear();
    [ghosts, rings, rays, parts, conf, texts, coins].forEach(function (a) { for (var i = 0; i < a.length; i++) a[i].on = false; });
    launcher.init = false; launcher.flyOn = false; launcher.shakeT0 = -1e9;
    seq.winT0 = -1; seq.loseT0 = -1; shk.amp = 0; zm.from = zm.to = 1; zm.ms = 0;
  }

  /** Per frame (frame.js): springs, launcher smoothing, particle and confetti integration. dt in s. */
  function update(t, dt, aimX) {
    nowMs = t; tl.t = t; tl.c = clock(); stepDt = Math.min(dt, 0.1);
    if (stepDt > 0) bodies.forEach(stepSpring);
    if (typeof aimX === 'number') {
      if (!launcher.init) { launcher.x = aimX; launcher.init = true; }
      else launcher.x += (aimX - launcher.x) * (1 - Math.exp(-v('AIM_SMOOTH', 25) * stepDt));
    }
    var i, p, dr = Math.exp(-v('PARTICLE_DRAG', 3) * stepDt), dc = Math.exp(-v('CONFETTI_DRAG', 0.6) * stepDt), gC = v('CONFETTI_GRAVITY', 900) * uK;
    for (i = 0; i < parts.length; i++) {
      p = parts[i]; if (!p.on) continue;
      if (t - p.t0 >= p.life) { p.on = false; continue; }
      p.vx *= dr; p.vy *= dr; p.x += p.vx * stepDt; p.y += p.vy * stepDt; p.rot += p.spin * stepDt;
    }
    for (i = 0; i < conf.length; i++) {
      p = conf[i]; if (!p.on || t < p.t0) continue;
      if (t - p.t0 >= v('CONFETTI_LIFE_MS', 2500)) { p.on = false; continue; }
      p.vy += gC * stepDt; p.vx *= dc; p.vy *= dc; p.x += p.vx * stepDt; p.y += p.vy * stepDt; p.rot += p.spin * stepDt; p.flip += 6 * stepDt;
    }
    updateView(t);
  }
  /** Launcher render state: x (sim u, smoothed), shake offset in px, ring flash, NEXT fly progress. */
  var lOut = { x: 50, offPx: 0, flash: false, fly: -1, flyTier: 1 };
  function launcherAt(t) {
    var a = t - launcher.shakeT0, ms = v('NOT_READY_MS', 180);
    lOut.x = launcher.x; lOut.offPx = 0; lOut.flash = a >= 0 && a < ms; lOut.fly = -1; lOut.flyTier = launcher.flyTier;
    if (lOut.flash && !reduced()) lOut.offPx = v('NOT_READY_SHAKE_PX', 4) * uK * Math.sin(TAU * v('NOT_READY_CYCLES', 3) * a / ms) * (1 - a / ms);
    if (launcher.flyOn) {
      a = (t - launcher.flyT0) / v('NEXT_FLY_MS', 260);
      if (a >= 1) launcher.flyOn = false; else lOut.fly = a < 0 ? 0 : ease.outCubic(a);
      if (a < 0) lOut.fly = -2;          // waiting out the 120 ms delay: launcher empty
    }
    return lOut;
  }
  /** Records a T9's position (jug ghosts of a later jugBurst start there). */
  function note(id, x, y) { var s = B(id); s.x = x; s.y = y; s.seen = true; }

  render.ease = ease;
  render.shake = shake;
  render.setZoom = setZoom;
  render.fx = {
    consume: consume, clear: clear, notReady: notReady, update: update, look: look, ghosts: ghosts, ghostAt: ghostAt,
    launcherAt: launcherAt, note: note, setBase: setBase, view: view, shakeOffset: shakeOffset, setLayout: setLayout,
    bindGame: bindGame, reduced: reduced, seq: seq, clock: stamp,
    pools: { rings: rings, rays: rays, parts: parts, conf: conf, texts: texts, coins: coins }, FONT: FONT
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
