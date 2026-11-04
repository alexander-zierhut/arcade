// src/render/sprites.js: loads the SVG sprites of docs/ART.md, rasterises each once into an offscreen canvas, tints on demand.
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};

  var KINDS = ['salmon', 'tuna', 'tamago', 'ebi', 'unagi', 'ikura', 'kappa', 'tekka', 'california', 'inari', 'tako', 'uni'];
  var PROPS = ['plate', 'cloche', 'clip', 'padlock', 'keytag', 'noreturn', 'stamp', 'box-open', 'box-closed'];
  var ALL = KINDS.concat(PROPS);
  var LOCK_COLOURS = ['#3BA55D', '#4F7CFF', '#F2C14E', '#E05297'];

  var texts = {};        // name -> svg source
  var canvases = {};     // name -> canvas
  var aspects = {};      // name -> height / width
  var tints = {};        // 'name|#HEX' -> canvas
  var failed = [], loaded = 0, base = '';
  var api = { version: 0 };   // bumped whenever a canvas appears later (tints), so cached layers can redraw

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function pixelWidth(name) {
    var dpr = root.devicePixelRatio || 1;
    if (name === 'box-open' || name === 'box-closed') return clamp(Math.round(132 * dpr * 1.0), 132, 400);
    var units = name === 'plate' ? 52 : 44;     // roughly the design width the sprite is drawn at
    return clamp(Math.round(units * dpr * 1.1), 64, 128);
  }

  function viewBox(text) {
    var m = /viewBox="\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*"/.exec(text);
    return m ? { w: parseFloat(m[1]), h: parseFloat(m[2]) } : { w: 64, h: 64 };
  }

  // rasterise svg text at `px` wide into a canvas; cb(canvas|null)
  function raster(text, px, cb, target) {
    var vb = viewBox(text), h = Math.max(1, Math.round(px * vb.h / vb.w));
    var sized = text.replace(/<svg\b([^>]*)>/, function (all, attrs) {
      attrs = attrs.replace(/\swidth="[^"]*"/, '').replace(/\sheight="[^"]*"/, '');
      return '<svg' + attrs + ' width="' + px + '" height="' + h + '">';
    });
    var img = new root.Image();
    img.onload = function () {
      var cv = target || root.document.createElement('canvas');
      cv.width = px; cv.height = h;
      var c = cv.getContext('2d');
      c.clearRect(0, 0, px, h);
      c.drawImage(img, 0, 0, px, h);
      cb(cv);
    };
    img.onerror = function () { cb(null); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized);
  }

  function hex6(h) {
    h = String(h || '#FF00FF').replace('#', '');
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    return ('#' + h).toUpperCase();
  }
  function darker(h, f) {
    var s = hex6(h).slice(1), out = '#', i;
    for (i = 0; i < 3; i++) {
      var v = Math.round(parseInt(s.substr(i * 2, 2), 16) * (1 - f)).toString(16);
      out += v.length < 2 ? '0' + v : v;
    }
    return out.toUpperCase();
  }

  function get(name) { return canvases[name] || null; }
  function aspect(name) { return aspects[name] || 1; }
  function status() { return { loaded: loaded, failed: failed.slice(), total: ALL.length }; }

  // tinted(name, hex): copy with #FF00FF -> hex and #CC00CC -> hex darkened by 15 %. Synchronous: returns a canvas that may
  // still be empty for a moment when the colour was not preloaded; api.version is bumped when it is filled.
  function tinted(name, hex) {
    hex = hex6(hex);
    var key = name + '|' + hex;
    if (tints[key]) return tints[key];
    var text = texts[name];
    if (!text) return null;
    var px = pixelWidth(name), vb = viewBox(text);
    var cv = root.document.createElement('canvas');
    cv.width = px; cv.height = Math.max(1, Math.round(px * vb.h / vb.w));
    tints[key] = cv;
    var src = text.replace(/#FF00FF/gi, hex).replace(/#CC00CC/gi, darker(hex, 0.15));
    raster(src, px, function (res) { if (res) api.version++; else delete tints[key]; }, cv);
    return cv;
  }

  function fetchText(url, cb) {
    var x = new root.XMLHttpRequest();
    x.open('GET', url, true);
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      if ((x.status >= 200 && x.status < 300) && x.responseText) cb(x.responseText);
      else cb(null);
    };
    try { x.send(); } catch (e) { cb(null); }
  }

  // load(base, done, progress): base = folder url of the sprites ('assets/sprites/'); done(status); progress(fraction 0..1)
  function load(baseUrl, done, progress) {
    base = baseUrl || '';
    if (base && base.charAt(base.length - 1) !== '/') base += '/';
    var remaining = ALL.length, settled = 0;
    function step() {
      settled++;
      if (progress) { try { progress(settled / (ALL.length + 1)); } catch (e) { /* ignore */ } }
    }
    function finishFiles() {
      // preload the lock colours so tinted() is ready when the scene first asks
      var jobs = LOCK_COLOURS.length * 2, left = jobs, i;
      if (!texts.padlock && !texts.keytag) { if (progress) progress(1); if (done) done(status()); return; }
      function one() { if (--left === 0) { if (progress) progress(1); if (done) done(status()); } }
      var before = api.version;
      for (i = 0; i < LOCK_COLOURS.length; i++) {
        ['padlock', 'keytag'].forEach(function (nm, idx) {
          var hx = LOCK_COLOURS[i];
          if (!texts[nm]) { one(); return; }
          var key = nm + '|' + hex6(hx);
          if (tints[key]) { one(); return; }
          var px = pixelWidth(nm), vb = viewBox(texts[nm]);
          var cv = root.document.createElement('canvas');
          cv.width = px; cv.height = Math.max(1, Math.round(px * vb.h / vb.w));
          tints[key] = cv;
          var src = texts[nm].replace(/#FF00FF/gi, hex6(hx)).replace(/#CC00CC/gi, darker(hx, 0.15));
          raster(src, px, function (res) { if (!res) delete tints[key]; one(); }, cv);
        });
      }
      api.version = before + 1;
    }
    ALL.forEach(function (name) {
      fetchText(base + name + '.svg', function (text) {
        if (!text) { failed.push(name); step(); if (--remaining === 0) finishFiles(); return; }
        texts[name] = text;
        var vb = viewBox(text);
        aspects[name] = vb.h / vb.w;
        raster(text, pixelWidth(name), function (cv) {
          if (cv) { canvases[name] = cv; loaded++; } else failed.push(name);
          step();
          if (--remaining === 0) finishFiles();
        });
      });
    });
  }

  api.KINDS = KINDS;
  api.LOCK_COLOURS = LOCK_COLOURS;
  api.load = load;
  api.get = get;
  api.aspect = aspect;
  api.status = status;
  api.tinted = tinted;
  api.darker = darker;
  PL.sprites = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
