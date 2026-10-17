// src/assets.js: loads the sprites (assets/sprites/*.svg) and rasterises each once into an offscreen canvas, so the
// renderer draws bitmaps (fast) instead of re-rasterising SVG at every size. get(name) returns the canvas, or
// null until the sprite is loaded; the renderer draws a flat shape in that case, so a missing file never breaks
// the game. The manifest also carries the sprite's aspect ratio so the renderer can size it by width alone.
(function (root) {
  'use strict';
  var PM = root.PM = root.PM || {};

  // name -> [file, raster width in px]; height follows the viewBox
  var MANIFEST = {
    'penguin-a': ['penguin-a.svg', 96], 'penguin-b': ['penguin-b.svg', 96], 'penguin-big': ['penguin-big.svg', 128],
    seal: ['seal.svg', 96], 'seal-b': ['seal-b.svg', 96], walrus: ['walrus.svg', 512],
    wall: ['wall.svg', 512], 'wall-cracked': ['wall-cracked.svg', 512],
    'gate-good': ['gate-good.svg', 512], 'gate-bad': ['gate-bad.svg', 512],
    'ice-block': ['ice-block.svg', 160], fish: ['fish.svg', 64], snowball: ['snowball.svg', 32],
    'iceberg-1': ['iceberg-1.svg', 256], 'iceberg-2': ['iceberg-2.svg', 256], 'iceberg-3': ['iceberg-3.svg', 256],
    mountain: ['mountain.svg', 1024], confetti: ['confetti.svg', 64]
  };

  var sprites = {}, aspect = {}, pending = 0, loaded = 0, failed = [];

  function rasterise(name, img) {
    var w = MANIFEST[name][1];
    var vb = (img.width && img.height) ? img.height / img.width : 1;
    var h = Math.round(w * vb);
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    try { c.getContext('2d').drawImage(img, 0, 0, w, h); } catch (e) { failed.push(name); return; }
    sprites[name] = c; aspect[name] = vb;
  }

  /** load(base, done): starts loading every sprite from base + file; done(status) when all settled. */
  function load(base, done) {
    var names = Object.keys(MANIFEST);
    pending = names.length;
    names.forEach(function (name) {
      var img = new Image();
      img.onload = function () { rasterise(name, img); loaded++; if (--pending === 0 && done) done(status()); };
      img.onerror = function () { failed.push(name); if (--pending === 0 && done) done(status()); };
      img.src = base + MANIFEST[name][0];
    });
  }

  function status() { return { loaded: loaded, failed: failed.slice(), total: Object.keys(MANIFEST).length }; }
  function get(name) { return sprites[name] || null; }
  function aspectOf(name) { return aspect[name] || 1; }

  PM.assets = { load: load, get: get, aspect: aspectOf, status: status, MANIFEST: MANIFEST };
})(typeof window !== 'undefined' ? window : globalThis);
