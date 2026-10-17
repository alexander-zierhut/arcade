// src/art/backgrounds.js: the image beach scenes behind the table (DESIGN 4.5 amendment "backgrounds").
// Browser file (Canvas 2D + new Image(), Safari 15 safe). One scene is picked at random per new game, never the
// same as the previous game; the procedural beach of scenery.js stays the fallback while an image is loading,
// when it fails, or when no scene is configured. All drawing is in canvas CSS px (the caller applies dpr).
//
// Fit rule (portrait first): the image is scaled uniformly so that
//   1. it covers the full canvas width plus the overdraw margin and a sway pad on both sides,
//   2. its horizon (scene.horizonFrac of its height) lands at HORIZON_AT * lay.farY,
//   3. its top covers the canvas top (-margin),
//   4. its bottom reaches toward the canvas bottom, but zooming for that is capped at ZOOM_MAX x the scale of 1-3;
// it is then shifted so the image x-fraction scene.anchorX sits at the stage centre (clamped to keep it covering).
// Below the image bottom a ground fill in the scene's sand colour (soft seam, seeded speckles) finishes the canvas.
// Between the horizon and the table's far edge, where the tallest far glasses rise, a light haze calms the scene.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var art = CM.art = CM.art || {};
  var A = 'assets/backgrounds/';
  var CRAFTPIX = 'Beach 2D Backgrounds by CraftPix.net (craftpix.net), OGA-BY 3.0';
  var LAST_KEY = 'cocktailMerge.v1.scene';

  // The same list as CONFIG.BACKGROUNDS (docs/amendments/backgrounds-config.md); config wins when present.
  // horizonFrac: horizon row / image height (measured). anchorX: image x-fraction kept at the stage centre.
  // ground: [fill, speck] below the image. haze: [r, g, b, alpha] over the headroom band (horizon -> far edge).
  // layers (optional parallax): drawn in order; speed = drift in px/s per uiK (wraps; the layer must tile),
  // sway = horizontal sway amplitude in px per uiK (period SWAY_S). top/bottom = the layer's opaque rows as
  // fractions of the image height (cache size only). If any layer fails to load, `file` is used flat.
  var DEFAULT_LIST = [
    { key: 'beach-bar', file: A + 'craftpix-beach-bar.png', w: 1920, h: 1080, horizonFrac: 0.524, anchorX: 0.3,
      ground: ['#F1F2BC', '#DCDB9E'], haze: [255, 251, 236, 0.16], credit: CRAFTPIX,
      layers: [
        { file: A + 'beach-bar-layers/sky.png', top: 0, bottom: 1, speed: 0, sway: 0 },
        { file: A + 'beach-bar-layers/cloud.png', top: 0.06, bottom: 0.47, speed: 4, sway: 0 },
        { file: A + 'beach-bar-layers/sea.png', top: 0.38, bottom: 1, speed: 0, sway: 1.5 },
        { file: A + 'beach-bar-layers/land.png', top: 0.69, bottom: 1, speed: 0, sway: 0 },
        { file: A + 'beach-bar-layers/decor.png', top: 0.31, bottom: 1, speed: 0, sway: 0 }
      ] },
    { key: 'palms-parasol', file: A + 'craftpix-palms-parasol.png', w: 1920, h: 1080, horizonFrac: 0.487,
      anchorX: 0.47, ground: ['#FFD91C', '#F2C200'], haze: [255, 250, 230, 0.18], credit: CRAFTPIX },
    { key: 'island-sailboat', file: A + 'craftpix-island-sailboat.png', w: 1920, h: 1080, horizonFrac: 0.451,
      anchorX: 0.4, ground: ['#FEE883', '#EBD06A'], haze: [255, 252, 240, 0.14], credit: CRAFTPIX },
    { key: 'sunset', file: A + 'craftpix-sunset.png', w: 1920, h: 1080, horizonFrac: 0.470, anchorX: 0.47,
      ground: ['#1F1915', '#2E241D'], haze: [255, 196, 120, 0.10], credit: CRAFTPIX },
    { key: 'day-beach', file: A + 'spriteattack-day-beach.png', w: 3000, h: 2000, horizonFrac: 0.518,
      anchorX: 0.42, ground: ['#F6E46C', '#E2CC52'], haze: [255, 252, 238, 0.16], credit: '' },
    { key: 'sunflowers', file: A + 'sunflower-sunset.jpg', w: 1536, h: 1024, horizonFrac: 0.46,
      anchorX: 0.5, ground: ['#A9D64A', '#86BD3C'], haze: [255, 236, 190, 0.14], credit: '' },
    { key: 'bruecke', file: A + 'muengstener-bruecke.jpg', w: 1536, h: 1024, horizonFrac: 0.50,
      anchorX: 0.5, ground: ['#9CD24A', '#7FB838'], haze: [235, 250, 220, 0.10], credit: '' },
    { key: 'schwebebahn', file: A + 'schwebebahn-wuppertal.jpg', w: 1536, h: 1024, horizonFrac: 0.62,
      anchorX: 0.45, ground: ['#7FBF3A', '#5FA32C'], haze: [230, 248, 215, 0.10], credit: '' }
  ];
  var DEFAULTS = { HORIZON_AT: 0.55, ZOOM_MAX: 1.25, PAD: 4, SWAY_S: 14, SEAM: 0.06 };

  var imgs = {};        // file -> { img, state: 'loading' | 'ok' | 'error', cbs: [] }
  var cur = null;       // current scene object
  var mode = 'none';    // 'none' | 'loading' | 'layers' | 'flat' | 'failed' for the current scene
  var ver = 0;          // bumps on every scene/mode change: the renderer rebuilds its static background then
  var caches = { key: '', groups: [] };
  var lastKey = null;
  var base = '';        // URL prefix for pages outside the project root (the review harness passes '../../')

  function cfg() { return (CM.config && CM.config.BACKGROUNDS) || null; }
  function opt(n) { var c = cfg(); return (c && typeof c[n] === 'number') ? c[n] : DEFAULTS[n]; }
  function list() { var c = cfg(); return (c && c.scenes && c.scenes.length) ? c.scenes : DEFAULT_LIST; }
  function find(key) { var l = list(); for (var i = 0; i < l.length; i++) if (l[i].key === key) return l[i]; return null; }
  function uK(lay) { return lay.uiK || lay.kX / 3.4; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  // ---------------------------------------------------------------- choice and persistence ----
  /** Pure pick: a scene key for u in [0, 1), never prevKey when there is more than one scene. */
  function pick(prevKey, u) {
    var l = list(), keys = [], i;
    for (i = 0; i < l.length; i++) if (l[i].key !== prevKey || l.length === 1) keys.push(l[i].key);
    if (!keys.length) return null;
    return keys[clamp(Math.floor((u >= 0 && u < 1 ? u : 0) * keys.length), 0, keys.length - 1)];
  }
  function readLast() {
    if (lastKey !== null) return lastKey;
    try { lastKey = root.localStorage.getItem(LAST_KEY) || ''; } catch (e) { lastKey = ''; }
    return lastKey;
  }
  function writeLast(key) {
    lastKey = key;
    try { root.localStorage.setItem(LAST_KEY, key); } catch (e) { /* file://, private mode: memory only */ }
  }

  // ---------------------------------------------------------------- loading ----
  function loadImg(file, cb) {
    var rec = imgs[file];
    if (rec && rec.state !== 'loading') { cb(rec.state === 'ok'); return; }
    if (rec) { rec.cbs.push(cb); return; }
    rec = imgs[file] = { img: new Image(), state: 'loading', cbs: [cb] };
    function settle(ok) {
      if (rec.state !== 'loading') return;
      rec.state = ok ? 'ok' : 'error';
      var cbs = rec.cbs; rec.cbs = [];
      cbs.forEach(function (f) { try { f(ok); } catch (e) { if (root.console) root.console.warn('backgrounds:', e); } });
    }
    rec.img.onload = function () { settle(rec.img.naturalWidth > 0); };
    rec.img.onerror = function () { settle(false); };
    rec.img.src = base + file;
  }
  function loadAll(files, cb) {
    var n = files.length, okAll = true;
    if (!n) { cb(true); return; }
    files.forEach(function (f) { loadImg(f, function (ok) { okAll = okAll && ok; if (--n === 0) cb(okAll); }); });
  }
  function img(file) { var r = imgs[file]; return r && r.state === 'ok' ? r.img : null; }

  /** Makes `key` current and loads it (layers first, then the flat file). done(ok) once settled. */
  function setScene(key, done) {
    var sc = find(key);
    cur = sc; mode = sc ? 'loading' : 'none'; ver++; release();
    if (!sc) { if (done) done(false); return; }
    function finish(m) {
      if (cur !== sc) return;              // another scene was chosen meanwhile
      mode = m; ver++; release();
      if (done) done(m !== 'failed');
    }
    function flat() { loadImg(sc.file, function (ok) { finish(ok ? 'flat' : 'failed'); }); }
    if (sc.layers && sc.layers.length) {
      loadAll(sc.layers.map(function (l) { return l.file; }), function (ok) { if (ok) finish('layers'); else flat(); });
    } else flat();
  }

  /**
   * New game: picks a scene other than the previous game's (u defaults to Math.random()), remembers it and loads it.
   * done(key, ok) runs once the image settled or after timeoutMs (then ok = false and the procedural beach shows
   * until the image arrives; version() changes when it does). Returns the key (null when no scene is listed).
   */
  function start(u, done, timeoutMs) {
    var key = pick(readLast(), typeof u === 'number' ? u : Math.random()), called = false, timer = 0;
    function once(ok) { if (called) return; called = true; if (timer) root.clearTimeout(timer); if (done) done(key, ok); }
    if (!key) { once(false); return null; }
    writeLast(key);
    if (timeoutMs > 0) timer = root.setTimeout(function () { once(false); }, timeoutMs);
    setScene(key, once);
    return key;
  }

  // ---------------------------------------------------------------- geometry ----
  /** Where scene sc's image goes for this layout: {s, x, y, w, h, hY, bottom, pad} in canvas CSS px. */
  function fit(sc, lay, vw, vh, margin) {
    var m = margin || 0, pad = opt('PAD') * uK(lay), L = -m - pad, R = vw + m + pad;
    var hY = opt('HORIZON_AT') * lay.farY, hf = sc.horizonFrac, W = sc.w, H = sc.h;
    var sW = (R - L) / W, sTop = (hY + m) / (hf * H), sBot = (vh + m - hY) / ((1 - hf) * H);
    var s0 = Math.max(sW, sTop), s = Math.max(s0, Math.min(sBot, s0 * opt('ZOOM_MAX')));
    var w = W * s, h = H * s, cx = typeof lay.cx === 'number' ? lay.cx : vw / 2;
    var x = clamp(cx - sc.anchorX * w, R - w, L), y = hY - sc.horizonFrac * h;
    return { s: s, x: x, y: y, w: w, h: h, hY: hY, bottom: y + h, pad: pad };
  }

  // ---------------------------------------------------------------- painting ----
  /** Ground below the image, the soft seam over its last rows, and the headroom haze. */
  function paintOverlay(ctx, sc, lay, f, vw, vh, m) {
    var u = uK(lay), g = sc.ground || ['#F2D6A2', '#E5C287'], seam = opt('SEAM') * f.h, gr, i, r;
    if (f.bottom < vh + m) {
      gr = ctx.createLinearGradient(0, f.bottom - seam, 0, f.bottom + 1);
      gr.addColorStop(0, hexA(g[0], 0)); gr.addColorStop(1, g[0]);
      ctx.fillStyle = gr; ctx.fillRect(-m - f.pad, f.bottom - seam, vw + 2 * (m + f.pad), seam + 1);
      ctx.fillStyle = g[0]; ctx.fillRect(-m - f.pad, f.bottom, vw + 2 * (m + f.pad), vh + m - f.bottom);
      gr = ctx.createLinearGradient(0, f.bottom, 0, vh + m);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(90,60,20,0.10)');
      ctx.fillStyle = gr; ctx.fillRect(-m - f.pad, f.bottom, vw + 2 * (m + f.pad), vh + m - f.bottom);
      r = art.glass && art.glass.mulberry32 ? art.glass.mulberry32(7331) : Math.random;
      ctx.fillStyle = g[1];
      var n = Math.round(clamp((vw + 2 * m) * (vh + m - f.bottom) / 900, 0, 900));
      for (i = 0; i < n; i++) {
        var sz = (1 + r()) * Math.max(1, 0.8 * u);
        ctx.fillRect(-m + r() * (vw + 2 * m), f.bottom + 2 + r() * (vh + m - f.bottom), sz, sz);
      }
    }
    var hz = sc.haze, top = f.hY, bot = lay.farY;
    if (hz && hz[3] > 0 && bot > top) {
      gr = ctx.createLinearGradient(0, top, 0, bot + 0.06 * vh);
      gr.addColorStop(0, rgba(hz, 0)); gr.addColorStop(0.75, rgba(hz, hz[3])); gr.addColorStop(1, rgba(hz, 0));
      ctx.fillStyle = gr; ctx.fillRect(-m - f.pad, top, vw + 2 * (m + f.pad), bot + 0.06 * vh - top);
    }
  }
  function hexA(hex, a) {
    var n = parseInt(String(hex).replace('#', ''), 16) || 0;
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function drawLayer(ctx, l, f, sc, x, w) {
    var im = img(l.file);
    if (!im) return;
    var sy0 = l.top * im.naturalHeight, sy1 = l.bottom * im.naturalHeight;
    ctx.drawImage(im, 0, sy0, im.naturalWidth, sy1 - sy0, x === undefined ? f.x : x, f.y + l.top * f.h,
      w === undefined ? f.w : w, (l.bottom - l.top) * f.h);
  }
  function isLive(l) { return (l.speed || 0) !== 0 || (l.sway || 0) !== 0; }

  /** Splits the layers into [static base run] + later groups: each live layer alone, static runs merged. */
  function groupsOf(sc) {
    var out = [], g = null;
    sc.layers.forEach(function (l, i) {
      if (isLive(l)) { out.push(g = { live: true, layers: [l] }); g = null; }
      else if (g && !g.live) g.layers.push(l);
      else out.push(g = { live: false, layers: [l], base: i === 0 });
    });
    return out;
  }

  /**
   * Static part, same contract as CM.art.paintBackground: ctx origin = screen (-margin, -margin). Returns false
   * (and draws nothing) when no scene is ready, so the caller paints the procedural beach instead.
   * A flat scene is drawn here completely; a layered scene draws only its base run (the sky), and paintLive draws
   * the rest every frame.
   */
  function paint(ctx, lay, vw, vh, margin) {
    if (!cur || (mode !== 'flat' && mode !== 'layers')) return false;
    var m = margin || 0, f = fit(cur, lay, vw, vh, m), sc = cur;
    ctx.save(); ctx.translate(m, m);
    ctx.fillStyle = (sc.ground && sc.ground[0]) || '#F2D6A2'; ctx.fillRect(-m, -m, vw + 2 * m, vh + 2 * m);
    if (mode === 'flat') {
      var im = img(sc.file);
      if (im) ctx.drawImage(im, f.x, f.y, f.w, f.h);
      paintOverlay(ctx, sc, lay, f, vw, vh, m);
    } else {
      var gs = groupsOf(sc);
      if (gs[0] && gs[0].base) gs[0].layers.forEach(function (l) { drawLayer(ctx, l, f, sc); });
    }
    ctx.restore();
    return true;
  }

  function release() {
    caches.groups.forEach(function (g) { if (g.canvas) { g.canvas.width = 0; g.canvas.height = 0; } });
    caches = { key: '', groups: [] };
  }
  /** Pre-scaled caches for every non-base group of a layered scene (rebuilt when layout or scene changes). */
  function buildCaches(lay, vw, vh) {
    var dpr = lay.dpr || 1, m = Math.ceil(12 * uK(lay)), sc = cur, f = fit(sc, lay, vw, vh, m);
    var key = [sc.key, mode, vw, vh, dpr, lay.farY, lay.cx, ver].join('|');
    if (caches.key === key) return;
    release();
    var gs = groupsOf(sc), last = -1;
    gs.forEach(function (g, i) { if (!g.live) last = i; });
    if (last < 1) { gs.push({ live: false, layers: [], overlayOnly: true }); last = gs.length - 1; }
    gs.forEach(function (g, i) {
      if (g.base) return;
      var top = 1, bot = 0;
      g.layers.forEach(function (l) { top = Math.min(top, l.top); bot = Math.max(bot, l.bottom); });
      var y0 = g.layers.length ? f.y + top * f.h : f.y + 0.3 * f.h, y1 = g.layers.length ? f.y + bot * f.h : f.bottom;
      var tile = g.live && g.layers[0].speed, x0 = f.x, w = tile ? Math.round(f.w * dpr) / dpr : f.w;
      if (i === last) { y0 = Math.min(y0, f.hY); y1 = vh + m; x0 = Math.min(f.x, -m - f.pad); w = Math.max(f.w, vw + 2 * (m + f.pad)); }
      var cv = root.document.createElement('canvas');
      cv.width = Math.max(1, Math.ceil(w * dpr)); cv.height = Math.max(1, Math.ceil((y1 - y0) * dpr));
      var c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
      g.layers.forEach(function (l) { if (tile) drawLayer(c, l, f, sc, x0, w); else drawLayer(c, l, f, sc); });
      if (i === last) paintOverlay(c, sc, lay, f, vw, vh, m);
      g.canvas = cv; g.x = x0; g.y = y0; g.w = w; g.h = y1 - y0; g.dpr = dpr;   // a drifting tile is whole device px wide: seamless wrap
    });
    caches = { key: key, groups: gs.filter(function (g) { return !g.base; }), fit: f };
  }

  /**
   * Live part of a layered scene, drawn right after the cached static background (instead of
   * CM.art.paintBackgroundLive): drifting clouds, the slightly swaying sea, then the front layers with the ground and
   * the haze. Returns false when the current scene has nothing live (flat or not ready): then draw nothing more.
   * reduced = true (prefers-reduced-motion) freezes drift and sway.
   */
  function paintLive(ctx, lay, vw, vh, nowMs, reduced) {
    if (!cur || mode !== 'layers') return false;
    buildCaches(lay, vw, vh);
    var t = reduced ? 0 : (nowMs || 0) / 1000, u = uK(lay), m = Math.ceil(12 * u);
    caches.groups.forEach(function (g) {
      if (!g.canvas) return;
      var l = g.layers[0], dx = 0;
      if (g.live && l.speed) {
        var off = ((l.speed * u * t) % g.w + g.w) % g.w, x;
        for (x = g.x + off - g.w; x < vw + m + g.w; x += g.w) {
          if (x + g.w > -m - caches.fit.pad) ctx.drawImage(g.canvas, Math.round(x * g.dpr) / g.dpr, g.y, g.w, g.h);
        }
        return;
      }
      if (g.live && l.sway) dx = l.sway * u * Math.sin(2 * Math.PI * t / opt('SWAY_S'));
      ctx.drawImage(g.canvas, g.x + dx, g.y, g.w, g.h);
    });
    return true;
  }

  /** Unique non-empty credit lines of every listed scene (the title screen shows them, 3.5). */
  function credits() {
    var out = [];
    list().forEach(function (sc) { if (sc.credit && out.indexOf(sc.credit) < 0) out.push(sc.credit); });
    return out;
  }

  art.backgrounds = {
    DEFAULT_LIST: DEFAULT_LIST,
    list: list,
    pick: pick,
    start: start,
    setScene: setScene,
    current: function () { return cur ? cur.key : null; },
    state: function () { return mode; },
    isReady: function () { return mode === 'flat' || mode === 'layers'; },
    hasLive: function () { return mode === 'layers'; },
    version: function () { return ver; },
    fit: fit,
    paint: paint,
    paintLive: paintLive,
    credits: credits,
    setBase: function (b) { base = b || ''; },
    release: release
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
