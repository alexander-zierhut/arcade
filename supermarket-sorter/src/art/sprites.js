// src/art/sprites.js: product image URLs and preloading. Products from SS.catalog load as assets/items/<id>.svg;
// unknown ids get a procedural placeholder (a coloured tile with the first letters) so the game never shows a broken image.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var art = SS.art = SS.art || {};
  var cache = {}, loaded = {}, images = {}, silCache = {};
  var flat = false;                                                       // settings "2D-Produkte": the v0.3.0 flat set in assets/items-2d
  function dir() { return flat ? 'assets/items-2d/' : 'assets/items/'; }
  /** setFlat(on): switches the sprite set; the caller preloads the level's products again and rebuilds the board. */
  function setFlat(on) { on = !!on; if (on === flat) return false; flat = on; cache = {}; loaded = {}; images = {}; silCache = {}; return true; }
  // Visual size (ART-SPEC v2 section 3): the tile is slotW * K, with K chosen per product from its measured bounding box
  // (catalog w/h in viewBox units) so that every product shows TARGET_W/100 of a slot in width, whatever its class, and no
  // product is taller than MAX_H slots. The same K is used on the rack, the side shelves and the bottom shelf (one size).
  var TARGET_W = 93, MAX_H = 1.7;
  var CLASS_K = { bottle: 2.0, carton: 1.7, can: 1.7, jar: 1.55, bag: 1.45, box: 1.5, tub: 1.5, loose: 1.5 };   // fallback without geometry
  var PALETTE = ['#E8453C', '#F28C28', '#F7C948', '#9BCB3C', '#3FA34D', '#2BB3A3', '#4FA3E8', '#2F6BD6', '#8E5BD9', '#F26B9E', '#8C5A2B'];

  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; }
  function known(id) { return !!(SS.catalog && SS.catalog.byId && SS.catalog.byId[id]); }

  function placeholder(id) {
    var h = hash(String(id)), color = PALETTE[h % PALETTE.length], shape = (h >> 4) % 3;
    var letters = String(id).replace(/^[a-z]+-/, '').replace(/-/g, ' ').slice(0, 2).toUpperCase();
    var body = shape === 0 ? '<rect x="22" y="12" width="56" height="82" rx="10" fill="' + color + '" stroke="#2A1B12" stroke-width="3"/>'
      : shape === 1 ? '<path d="M38 8h24v12l8 10v62a4 4 0 0 1-4 4H34a4 4 0 0 1-4-4V30l8-10z" fill="' + color + '" stroke="#2A1B12" stroke-width="3" stroke-linejoin="round"/>'
      : '<rect x="18" y="28" width="64" height="66" rx="8" fill="' + color + '" stroke="#2A1B12" stroke-width="3"/><rect x="24" y="16" width="52" height="14" rx="4" fill="#FFF6E0" stroke="#2A1B12" stroke-width="3"/>';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + body +
      '<rect x="30" y="46" width="40" height="28" rx="6" fill="#FFF6E0" stroke="#2A1B12" stroke-width="2"/>' +
      '<text x="50" y="67" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="18" text-anchor="middle" fill="#2A1B12">' + letters + '</text>' +
      '<rect x="26" y="20" width="10" height="40" rx="5" fill="#FFFFFF" fill-opacity="0.35"/></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /** url(id) -> image URL for a product id ('*' is the golden bunny). */
  function url(id) {
    if (cache[id]) return cache[id];
    cache[id] = id === '*' ? dir() + 'special-golden-bunny.svg' : known(id) ? dir() + id + '.svg' : placeholder(id);
    return cache[id];
  }
  /** shape(id, size) -> an offscreen canvas with the product's alpha shape, or null when the image is not loaded. */
  function shape(id, size) {
    var doc = root.document, img = images[id];
    if (!(img && img.complete && img.naturalWidth > 0)) return null;
    var c = doc.createElement('canvas'); c.width = size; c.height = size;
    try { c.getContext('2d').drawImage(img, 0, 0, size, size); } catch (e) { return null; }
    return c;
  }
  /** silhouette(id, colour, size) -> a <canvas> showing the product's one-colour shape (DESIGN 1.7, 7.3). v0.3.1: the shape
   *  gets a dark rim, a top-to-bottom sheen and a "?" badge so that it reads as a riddle item, not as a back-layer item. */
  function silhouette(id, colour, size) {
    var key = id + '|' + colour + '|' + size, src = silCache[key];
    var doc = root.document, cv = doc.createElement('canvas');
    cv.width = size; cv.height = size;
    var ctx = cv.getContext('2d');
    if (!src) {
      src = doc.createElement('canvas'); src.width = size; src.height = size;
      var sctx = src.getContext('2d'), sh = shape(id, size);
      if (sh) {
        try {
          var r = Math.max(1, Math.round(size * 0.025));
          // dark rim: the shape dilated by r in eight directions
          for (var a = 0; a < 8; a++) sctx.drawImage(sh, Math.round(Math.cos(a * Math.PI / 4) * r), Math.round(Math.sin(a * Math.PI / 4) * r));
          sctx.globalCompositeOperation = 'source-in'; sctx.fillStyle = '#1E100A'; sctx.fillRect(0, 0, size, size);
          sctx.globalCompositeOperation = 'source-over'; sctx.drawImage(sh, 0, 0);
          sctx.globalCompositeOperation = 'source-atop';
          var g = sctx.createLinearGradient(0, 0, size * 0.6, size);
          g.addColorStop(0, lighten(colour, 0.35)); g.addColorStop(0.5, colour); g.addColorStop(1, lighten(colour, -0.3));
          sctx.fillStyle = g; sctx.fillRect(0, 0, size, size);
          sctx.globalCompositeOperation = 'source-over';
          badge(sctx, size);
        } catch (e) { fallbackSil(sctx, size, colour); }
      } else fallbackSil(sctx, size, colour);
      silCache[key] = src;
    }
    try { ctx.drawImage(src, 0, 0); } catch (e) { fallbackSil(ctx, size, colour); }
    return cv;
  }
  function badge(ctx, size) {
    var r = size * 0.11, x = size * 0.78, y = size * 0.2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.02); ctx.strokeStyle = '#1E100A'; ctx.stroke();
    ctx.fillStyle = '#1E100A'; ctx.font = '900 ' + Math.round(r * 1.5) + 'px Arial, Helvetica, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', x, y + r * 0.06);
  }
  function lighten(hex, k) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex); if (!m) return hex;
    function ch(h) { var v = parseInt(h, 16); v = k >= 0 ? v + (255 - v) * k : v * (1 + k); return ('0' + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2); }
    return '#' + ch(m[1]) + ch(m[2]) + ch(m[3]);
  }
  /** shaded(id, sil, size) -> a <canvas> with the product darkened for the next layer (ART-STYLE: light shelf, dark back items). */
  function shaded(id, sil, size) {
    var key = 'dark|' + id + '|' + (sil || '') + '|' + size, src = silCache[key];
    var doc = root.document, cv = doc.createElement('canvas');
    cv.width = size; cv.height = size;
    var ctx = cv.getContext('2d');
    if (!src) {
      src = doc.createElement('canvas'); src.width = size; src.height = size;
      var sctx = src.getContext('2d'), base = sil && id !== '*' ? silhouette(id, sil, size) : shape(id, size);
      if (base) {
        try {
          sctx.drawImage(base, 0, 0);
          sctx.globalCompositeOperation = 'source-atop'; sctx.fillStyle = 'rgba(40, 24, 14, 0.72)'; sctx.fillRect(0, 0, size, size);
          sctx.globalCompositeOperation = 'source-over';
        } catch (e) { fallbackSil(sctx, size, '#6B4A2B'); }
      } else fallbackSil(sctx, size, '#6B4A2B');
      silCache[key] = src;
    }
    try { ctx.drawImage(src, 0, 0); } catch (e) { fallbackSil(ctx, size, '#6B4A2B'); }
    return cv;
  }
  function fallbackSil(ctx, size, colour) {
    ctx.fillStyle = colour;
    ctx.beginPath(); ctx.moveTo(size * 0.3, size * 0.95); ctx.lineTo(size * 0.3, size * 0.25); ctx.lineTo(size * 0.42, size * 0.1); ctx.lineTo(size * 0.58, size * 0.1); ctx.lineTo(size * 0.7, size * 0.25); ctx.lineTo(size * 0.7, size * 0.95); ctx.closePath(); ctx.fill();
  }

  /** preload(ids, cb, timeoutMs?): loads every image once; cb() after all settled or the timeout. */
  function preload(ids, cb, timeoutMs) {
    var pending = 0, done = false, timer = 0;
    function settle() { pending -= 1; if (pending <= 0) finish(); }
    function finish() { if (done) return; done = true; if (timer) root.clearTimeout(timer); if (cb) cb(); }
    ids.concat(['*']).forEach(function (id) {
      if (loaded[id]) return;
      pending += 1;
      var img = new root.Image();
      images[id] = img;
      img.onload = function () { loaded[id] = true; settle(); };
      img.onerror = function () { cache[id] = placeholder(id); img.src = cache[id]; loaded[id] = true; settle(); };
      img.src = url(id);
    });
    if (pending === 0) finish();
    else timer = root.setTimeout(finish, timeoutMs || 2500);
  }

  /** scale(id) -> tile size in slot widths: the product fills TARGET_W % of a slot in width, capped at MAX_H slots of height. */
  function scale(id) {
    if (id === '*') return 1.3;                                        // the golden bunny (76 x 85 units): a little larger than life
    var c = SS.catalog && SS.catalog.byId && SS.catalog.byId[id];
    if (!c) return 1.5;
    var w = flat && c.w2 > 0 ? c.w2 : c.w, h = flat && c.h2 > 0 ? c.h2 : c.h;
    if (w > 0 && h > 0) return Math.round(Math.min(TARGET_W / w, MAX_H * 100 / h) * 1000) / 1000;
    return CLASS_K[c.cls] || 1.5;
  }

  /** name(id) -> display name or the id. */
  function name(id) { var c = SS.catalog && SS.catalog.byId && SS.catalog.byId[id]; return c ? c.name : id; }

  art.sprites = { url: url, preload: preload, placeholder: placeholder, name: name, scale: scale, silhouette: silhouette, shaded: shaded, setFlat: setFlat, isFlat: function () { return flat; }, image: function (id) { return images[id] || null; }, MAX_H: MAX_H, TARGET_W: TARGET_W, CLASS_K: CLASS_K };
  SS.sprites = art.sprites;
})(typeof globalThis !== 'undefined' ? globalThis : this);
