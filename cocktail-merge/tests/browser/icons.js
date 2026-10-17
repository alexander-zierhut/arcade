// tests/browser/icons.js: renders the favicon set from the Cosmopolitan painter (tier 3) with the system Chrome:
// assets/icons/favicon-32.png, favicon-64.png, apple-touch-icon.png (180), icon-512.png, then favicon.ico via
// a tiny Node ICO writer (PNG-in-ICO, supported by every current browser). Run: node tests/browser/icons.js
'use strict';
var fs = require('fs'), path = require('path');
var chrome = require('./chrome.js');
var ROOT = path.resolve(__dirname, '..', '..'), OUT = path.join(ROOT, 'assets', 'icons');
var SIZES = { 'favicon-32.png': 32, 'favicon-64.png': 64, 'apple-touch-icon.png': 180, 'icon-512.png': 512 };
var PAGE = '<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent">'
  + ['dedication', 'config', 'art/glass', 'art/garnish', 'art/tier3-cosmo'].map(function (f) { return '<script src="../../src/' + f + '.js"></script>'; }).join('')
  + '<canvas id="c"></canvas></body>';

function ico(pngs) {   // pngs: [{size, buf}] -> Buffer of an ICO with PNG entries
  var n = pngs.length, head = Buffer.alloc(6 + 16 * n), off = head.length, parts = [head];
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(n, 4);
  pngs.forEach(function (p, i) {
    var e = 6 + 16 * i;
    head.writeUInt8(p.size >= 256 ? 0 : p.size, e); head.writeUInt8(p.size >= 256 ? 0 : p.size, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(p.buf.length, e + 8); head.writeUInt32LE(off, e + 12);
    off += p.buf.length; parts.push(p.buf);
  });
  return Buffer.concat(parts);
}

(async function () {
  var browser = await chrome.launchChrome();
  var page = await browser.newPage();
  var harness = path.join(__dirname, 'icons.html'); fs.writeFileSync(harness, PAGE);
  var errors = []; page.on('pageerror', function (e) { errors.push(e.message); });
  await page.goto('file://' + harness); await page.waitForTimeout(300);
  var pngs = [];
  for (var name in SIZES) {
    var size = SIZES[name];
    var dataUrl = await page.evaluate(function (size) {
      var c = document.getElementById('c'); c.width = c.height = size;
      var ctx = c.getContext('2d'), G = CM.art.glass, h = { glass: CM.art.glass, garnish: CM.art.garnish };
      var box = G.spriteBox(3), rp = size / Math.max(box.w, box.h) * 0.98;          // fit the sprite box into the square
      ctx.clearRect(0, 0, size, size);
      ctx.save(); ctx.translate(size / 2, size / 2 + (box.ay - box.h / 2) * rp);  // centre the box
      G.applyAnchor(ctx, rp); CM.art.tiers[3].paint(ctx, h, { icon: size <= 64 }); ctx.restore();
      return c.toDataURL('image/png');
    }, size);
    var buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    fs.writeFileSync(path.join(OUT, name), buf);
    if (size <= 64) pngs.push({ size: size, buf: buf });
    console.log('wrote', name, buf.length, 'bytes');
  }
  fs.writeFileSync(path.join(OUT, 'favicon.ico'), ico(pngs));
  console.log('wrote favicon.ico (' + pngs.length + ' PNG entries)');
  fs.unlinkSync(harness);
  await browser.close();
  if (errors.length) { console.error('page errors:', errors); process.exit(1); }
})().catch(function (e) { console.error('icons failed:', e.message); process.exit(1); });
