// tests/browser/items-render.js: renders every product SVG in assets/items/ in the system Chrome, checks the
// geometry rules of docs/ART-SPEC.md section 1 (floor line, bounds, centring, class box) and writes contact sheets:
//   docs/preview/items-sheet.png      all items at 100 px tiles on a shelf-coloured background, grouped by category
//   docs/preview/items-small.png      all items at 60 px tiles (the phone size) to judge readability
//   docs/preview/items-<category>.png one sheet per category (only with --per-category)
// Prints one line per item and exits 1 when a rule is broken. Usage: node tests/browser/items-render.js [--per-category] [slug ...]
//   --check-only          do not write geometry.json or the shared sheets (safe to run many in parallel)
//   --sheet <file.png>    write one labelled 150 px contact sheet of the selected items to that path
'use strict';
var fs = require('fs');
var path = require('path');
var chrome = require('./chrome.js');

var ROOT = path.resolve(__dirname, '..', '..');
var ARGV = process.argv.slice(2);
function opt(name) { var i = ARGV.indexOf(name); return i >= 0 ? ARGV[i + 1] : null; }
var ITEMS = opt('--dir') ? path.resolve(opt('--dir')) : path.join(ROOT, 'assets', 'items');            // --dir assets/items-2d: another sprite set, same manifests
var MANIFESTS = path.join(ROOT, 'assets', 'items', 'manifest');
var GEOMETRY_OUT = opt('--geometry') ? path.resolve(opt('--geometry')) : path.join(MANIFESTS, 'geometry.json');
var OUT = path.join(ROOT, 'docs', 'preview');
var STROKE = 3;                               // ART-SPEC 2.1: getBBox ignores the stroke, so half of it is added back
var BOX = {                                   // ART-SPEC v2 section 3, outline included: [minW, maxW, minH, maxH]
  bottle: [40, 50, 86, 91], carton: [48, 58, 84, 91], can: [48, 58, 74, 88], jar: [54, 62, 72, 84],
  bag: [56, 66, 82, 91], box: [54, 64, 82, 91], tub: [56, 64, 68, 80], loose: [52, 66, 56, 91]
};

function readManifests() {
  var out = [];
  if (!fs.existsSync(MANIFESTS)) return out;
  fs.readdirSync(MANIFESTS).filter(function (f) { return /\.json$/.test(f) && f !== 'geometry.json' && f !== 'geometry-2d.json' && f !== 'silhouette-overrides.json'; }).sort().forEach(function (f) {
    try {
      var m = JSON.parse(fs.readFileSync(path.join(MANIFESTS, f), 'utf8'));
      (m.items || []).forEach(function (it) { it.category = m.category; out.push(it); });
    } catch (e) { console.log('✗ manifest ' + f + ': ' + e.message); process.exitCode = 1; }
  });
  return out;
}

function sheetHtml(items, tile, cols, labels) {
  var cell = tile + 8;
  var html = '<!doctype html><body style="margin:0;background:#D9A86B;font:700 10px Arial,sans-serif;color:#2A1B12">';
  html += '<div style="display:grid;grid-template-columns:repeat(' + cols + ',' + cell + 'px);gap:0;padding:8px;width:' + (cols * cell + 16) + 'px">';
  items.forEach(function (it) {
    var svg = fs.readFileSync(path.join(ITEMS, it.file), 'utf8').replace(/<svg /, '<svg data-id="' + it.id + '" style="width:' + tile + 'px;height:' + tile + 'px;display:block" ');
    html += '<div style="width:' + cell + 'px;height:' + (cell + (labels ? 12 : 0)) + 'px;padding:4px;box-sizing:border-box;border-bottom:3px solid #8C5A2B;background:linear-gradient(#E9BE86,#D9A86B)">' + svg +
      (labels ? '<div style="text-align:center;overflow:hidden;white-space:nowrap;font-size:9px">' + it.id.replace(/^[a-z]+-/, '') + '</div>' : '') + '</div>';
  });
  return html + '</div></body>';
}

function checkGeometry(it, bb) {
  var errs = [];
  var left = bb.x - STROKE / 2, right = bb.x + bb.width + STROKE / 2, top = bb.y - STROKE / 2, bottom = bb.y + bb.height + STROKE / 2;
  var w = right - left, h = bottom - top, cx = (left + right) / 2;
  if (Math.abs(bottom - 95) > 1.2) errs.push('bottom at ' + bottom.toFixed(1) + ' (floor line is 95 ± 1)');
  if (left < 7.5) errs.push('left edge at ' + left.toFixed(1) + ' (< 8)');
  if (right > 92.5) errs.push('right edge at ' + right.toFixed(1) + ' (> 92)');
  if (top < 3.5) errs.push('top at ' + top.toFixed(1) + ' (< 4)');
  if (Math.abs(cx - 50) > 2.2) errs.push('centre at x=' + cx.toFixed(1) + ' (50 ± 2)');
  var box = BOX[it['class']];
  if (box) {
    if (w < box[0] - 2 || w > box[1] + 2) errs.push('width ' + w.toFixed(1) + ' outside ' + it['class'] + ' range ' + box[0] + '-' + box[1]);
    if (h < box[2] - 2 || h > box[3] + 2) errs.push('height ' + h.toFixed(1) + ' outside ' + it['class'] + ' range ' + box[2] + '-' + box[3]);
  } else errs.push('unknown class ' + it['class']);
  return { errs: errs, w: w, h: h, bottom: bottom, cx: cx };
}

async function main() {
  var args = process.argv.slice(2);
  var perCat = args.indexOf('--per-category') >= 0, checkOnly = args.indexOf('--check-only') >= 0;
  var sheetAt = args.indexOf('--sheet') >= 0 ? args[args.indexOf('--sheet') + 1] : null;
  var slugs = args.filter(function (a, i) { return a.indexOf('--') !== 0 && args[i - 1] !== '--sheet' && args[i - 1] !== '--dir' && args[i - 1] !== '--geometry'; });
  var items = readManifests().filter(function (it) { return !slugs.length || slugs.indexOf(it.category) >= 0; });
  if (!items.length) { console.log('no items found (manifests in ' + MANIFESTS + ')'); process.exitCode = 1; return; }
  items.forEach(function (it) { if (!fs.existsSync(path.join(ITEMS, it.file))) { console.log('✗ ' + it.id + ': missing file ' + it.file); process.exitCode = 1; } });
  items = items.filter(function (it) { return fs.existsSync(path.join(ITEMS, it.file)); });
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  var browser = await chrome.launchChrome();
  var failed = 0;
  try {
    var page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 2 });
    var pageErrors = [];
    page.on('pageerror', function (e) { pageErrors.push(String(e)); });
    page.on('console', function (m) { if (m.type() === 'error') pageErrors.push(m.text()); });

    // geometry pass at 100 px
    await page.setContent(sheetHtml(items, 100, 8, true));
    var boxes = await page.evaluate(function () {
      var out = {};
      Array.prototype.forEach.call(document.querySelectorAll('svg[data-id]'), function (s) {
        var bb;
        try { bb = s.getBBox(); } catch (e) { bb = null; }
        out[s.getAttribute('data-id')] = bb ? { x: bb.x, y: bb.y, width: bb.width, height: bb.height } : null;
      });
      return out;
    });
    var geometry = {};
    items.forEach(function (it) {
      var bb = boxes[it.id];
      if (!bb || !(bb.width > 0)) { failed += 1; console.log('✗ ' + it.id + ': nothing rendered (parse error?)'); return; }
      var r = checkGeometry(it, bb);
      geometry[it.id] = { w: Math.round(r.w * 10) / 10, h: Math.round(r.h * 10) / 10 };
      if (r.errs.length) { failed += 1; console.log('✗ ' + it.id + ' [' + it['class'] + '] ' + r.w.toFixed(0) + 'x' + r.h.toFixed(0) + ': ' + r.errs.join('; ')); }
      else console.log('✓ ' + it.id + ' [' + it['class'] + '] ' + r.w.toFixed(0) + 'x' + r.h.toFixed(0));
    });
    if (sheetAt) {
      var perRow = Math.min(8, items.length);
      await page.setContent(sheetHtml(items, 150, perRow, true));
      await page.setViewportSize({ width: perRow * 158 + 16, height: Math.ceil(items.length / perRow) * 170 + 16 });
      await page.screenshot({ path: path.resolve(sheetAt), fullPage: true });
    }
    if (checkOnly) { pageErrors.forEach(function (e) { failed += 1; console.log('✗ page error: ' + e); }); console.log((items.length - failed) + '/' + items.length + ' items pass geometry (check only)'); if (failed) process.exitCode = 1; return; }
    fs.writeFileSync(GEOMETRY_OUT, JSON.stringify(geometry, null, 1));
    if (opt('--dir')) { pageErrors.forEach(function (e) { failed += 1; console.log('✗ page error: ' + e); }); console.log((items.length - failed) + '/' + items.length + ' items pass geometry; ' + path.relative(ROOT, GEOMETRY_OUT) + ' written (no sheets for an alternative set)'); if (failed) process.exitCode = 1; return; }
    await page.setViewportSize({ width: 8 * 108 + 16, height: Math.ceil(items.length / 8) * 120 + 16 });
    await page.screenshot({ path: path.join(OUT, 'items-sheet.png'), fullPage: true });

    await page.setContent(sheetHtml(items, 60, 10, false));
    await page.setViewportSize({ width: 10 * 68 + 16, height: Math.ceil(items.length / 10) * 68 + 16 });
    await page.screenshot({ path: path.join(OUT, 'items-small.png'), fullPage: true });

    if (perCat) {
      var cats = {};
      items.forEach(function (it) { (cats[it.category] = cats[it.category] || []).push(it); });
      for (var c in cats) {
        await page.setContent(sheetHtml(cats[c], 150, cats[c].length, true));
        await page.setViewportSize({ width: cats[c].length * 158 + 16, height: 190 });
        await page.screenshot({ path: path.join(OUT, 'items-' + c + '.png'), fullPage: true });
      }
    }
    pageErrors.forEach(function (e) { failed += 1; console.log('✗ page error: ' + e); });
  } finally {
    await browser.close();
  }
  console.log((items.length - failed) + '/' + items.length + ' items pass geometry; sheets in docs/preview/items-sheet.png and items-small.png');
  if (failed) process.exitCode = 1;
}

main().catch(function (e) { console.error(e && e.stack || e); process.exit(1); });
