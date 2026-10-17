// tests/items-check.js: text-level checks of product SVGs against docs/ART-SPEC.md sections 1, 2.5 and 5.
// Usage: node tests/items-check.js [file.svg ...]   (no arguments: every file in assets/items/ plus the manifests)
// Exits 1 when any file fails. Geometry (floor line, bounds, centring) is checked by tests/browser/items-render.js.
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var ITEMS = path.join(ROOT, 'assets', 'items');
var MANIFESTS = path.join(ITEMS, 'manifest');
var CLASSES = ['bottle', 'carton', 'can', 'jar', 'bag', 'box', 'tub', 'loose'];
var FORBIDDEN_TAG = /<(image|filter|fe[A-Z][A-Za-z]*|mask|pattern|script|style|foreignObject|a|animate[A-Za-z]*|set|marker|symbol|switch|video|audio|iframe)\b/;
var ALLOWED_TAG = /^(svg|g|title|path|rect|circle|ellipse|line|polyline|polygon|text|tspan|defs|linearGradient|radialGradient|stop|clipPath)$/;
var FONT = 'Arial, Helvetica, sans-serif';

function checkSvg(file) {
  var errs = [], warns = [];
  var src;
  try { src = fs.readFileSync(file, 'utf8'); } catch (e) { return { errs: ['cannot read: ' + e.message], warns: [] }; }
  var bytes = Buffer.byteLength(src, 'utf8');
  if (bytes > 9216) errs.push('file is ' + bytes + ' bytes (hard limit 9216)');
  else if (bytes > 8192) warns.push('file is ' + bytes + ' bytes (target under 8192)');

  var head = src.replace(/^﻿/, '').replace(/^\s*<\?xml[^>]*\?>\s*/, '').replace(/^\s*<!DOCTYPE[^>]*>\s*/, '');
  var rootMatch = head.match(/^\s*<svg\b([^>]*)>/);
  if (!rootMatch) errs.push('does not start with an <svg> root');
  else {
    var attrs = rootMatch[1];
    if (!/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(attrs)) errs.push('root lacks xmlns="http://www.w3.org/2000/svg"');
    if (!/viewBox="0 0 100 100"/.test(attrs)) errs.push('root viewBox must be "0 0 100 100"');
    if (!/\swidth="100"/.test(attrs)) errs.push('root width must be "100"');
    if (!/\sheight="100"/.test(attrs)) errs.push('root height must be "100"');
    var afterRoot = head.slice(rootMatch[0].length).replace(/^\s+/, '');
    if (!/^<title>[^<]{1,60}<\/title>/.test(afterRoot)) errs.push('<title>Name</title> must be the first child of <svg>');
  }
  if (!/<\/svg>\s*$/.test(src)) errs.push('does not end with </svg>');

  var forb = src.match(FORBIDDEN_TAG);
  if (forb) errs.push('forbidden element <' + forb[1] + '>');
  var tags = src.match(/<([A-Za-z][A-Za-z0-9]*)\b/g) || [];
  var count = 0, gradients = 0, texts = 0;
  tags.forEach(function (t) {
    var name = t.slice(1);
    count += 1;
    if (!ALLOWED_TAG.test(name)) errs.push('element <' + name + '> is not in the allowed list');
    if (name === 'linearGradient' || name === 'radialGradient') gradients += 1;
    if (name === 'text') texts += 1;
  });
  if (count > 45) errs.push(count + ' elements (limit 45; v3 target 40)');
  if (gradients > 6) errs.push(gradients + ' gradients (limit 6)');
  if (texts > 1) errs.push(texts + ' <text> elements (limit 1, v3)');
  if (/<use\b/.test(src)) errs.push('<use> is not allowed (Chrome misreports its bounding box)');
  if (/<g\b[^>]*\sopacity=/.test(src)) errs.push('opacity on a <g> (use fill-opacity / stroke-opacity on the shape)');
  if (/\sclass="/.test(src)) errs.push('class attribute (use presentation attributes)');
  if (/\sstyle="/.test(src)) errs.push('style attribute (use presentation attributes)');
  if (/<!--/.test(src)) errs.push('comments are not allowed');
  var hrefs = src.match(/\s(?:xlink:)?href="([^"]*)"/g) || [];
  hrefs.forEach(function (h) { if (!/href="#/.test(h)) errs.push('external reference ' + h.trim()); });
  if (/url\((?!#)/.test(src)) errs.push('url() must reference an internal id');
  var fonts = src.match(/font-family="([^"]*)"/g) || [];
  fonts.forEach(function (f) { if (f !== 'font-family="' + FONT + '"') errs.push('font-family must be "' + FONT + '", got ' + f); });
  var textBodies = src.match(/<text\b[^>]*>([\s\S]*?)<\/text>/g) || [];
  textBodies.forEach(function (tb) {
    var word = tb.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
    if (word.length > 9) errs.push('label text "' + word + '" is longer than 9 characters');
    if (!/font-weight="900"/.test(tb)) warns.push('label text should use font-weight="900"');
    var fs = /font-size="([\d.]+)"/.exec(tb);
    if (fs && (+fs[1] < 11 || +fs[1] > 16)) warns.push('label font-size ' + fs[1] + ' outside 11-16');
  });
  // v3 (docs/ART-STYLE.md): no black outline; volume comes from gradients; a rim stroke in a dark tint at most 1.5 wide
  if (/stroke="#(2A1B12|1F1410|000000|1E100A)"/.test(src)) errs.push('black outline (v3 forbids it: use the rim tint, stroke-width 1.5, stroke-opacity 0.7)');
  var widths = src.match(/stroke-width="([\d.]+)"/g) || [];
  widths.forEach(function (w) { var v = parseFloat(w.replace(/[^\d.]/g, '')); if (v > 2) errs.push('stroke-width ' + v + ' (v3 allows at most 2; the rim is 1.5)'); });
  if (!/<(linear|radial)Gradient\b/.test(src)) errs.push('no gradient (v3: every body is shaded with a gradient)');
  if (!/stop-color="#1E100A" stop-opacity="0\.(3|4)/.test(src)) warns.push('no base occlusion gradient (#1E100A to opacity 0.38) found');
  var coords = src.replace(/(?:fill|stroke|stop)-opacity="[^"]*"/g, '').replace(/\sopacity="[^"]*"/g, '').replace(/offset="[^"]*"/g, '');
  if (/\d\.\d{2,}/.test(coords)) warns.push('coordinates with more than one decimal');
  return { errs: errs, warns: warns };
}

function checkManifest(file, known) {
  var errs = [];
  var m;
  try { m = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return ['invalid JSON: ' + e.message]; }
  if (!m || typeof m.category !== 'string' || !/^[a-z][a-z0-9-]*$/.test(m.category)) errs.push('category must be a kebab-case string');
  if (!Array.isArray(m.items) || !m.items.length) { errs.push('items must be a non-empty array'); return errs; }
  m.items.forEach(function (it, i) {
    var where = 'items[' + i + ']';
    if (!it || typeof it !== 'object') { errs.push(where + ' is not an object'); return; }
    if (typeof it.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(it.id)) errs.push(where + '.id must be kebab-case');
    else if (m.category && it.id.indexOf(m.category + '-') !== 0) errs.push(where + '.id must start with "' + m.category + '-"');
    if (it.file !== it.id + '.svg') errs.push(where + '.file must be id + ".svg"');
    if (it.file && !fs.existsSync(path.join(ITEMS, it.file))) errs.push(where + ': ' + it.file + ' does not exist');
    if (typeof it.name !== 'string' || !it.name.trim()) errs.push(where + '.name missing');
    if (CLASSES.indexOf(it['class']) < 0) errs.push(where + '.class must be one of ' + CLASSES.join(', '));
    ['color', 'accent'].forEach(function (k) { if (!/^#[0-9A-Fa-f]{6}$/.test(it[k] || '')) errs.push(where + '.' + k + ' must be a #RRGGBB colour'); });
    if (typeof it.label !== 'string') errs.push(where + '.label must be a string (may be "")');
    if (typeof it.icon !== 'string' || !it.icon) errs.push(where + '.icon missing');
    if (typeof it.description !== 'string' || !it.description) errs.push(where + '.description missing');
    if (known) { if (known[it.id]) errs.push(where + ': duplicate id ' + it.id + ' (also in ' + known[it.id] + ')'); known[it.id] = path.basename(file); }
  });
  return errs;
}

function main() {
  var args = process.argv.slice(2);
  var svgs = [], manifests = [];
  if (args.length) {
    args.forEach(function (a) { if (/\.json$/.test(a)) manifests.push(path.resolve(a)); else svgs.push(path.resolve(a)); });
  } else {
    if (fs.existsSync(ITEMS)) svgs = fs.readdirSync(ITEMS).filter(function (f) { return /\.svg$/.test(f); }).sort().map(function (f) { return path.join(ITEMS, f); });
    if (fs.existsSync(MANIFESTS)) manifests = fs.readdirSync(MANIFESTS).filter(function (f) { return /\.json$/.test(f) && f !== 'geometry.json' && f !== 'geometry-2d.json' && f !== 'silhouette-overrides.json'; }).sort().map(function (f) { return path.join(MANIFESTS, f); });
  }
  var failed = 0, known = {};
  svgs.forEach(function (f) {
    var r = checkSvg(f), rel = path.relative(ROOT, f);
    if (r.errs.length) { failed += 1; console.log('✗ ' + rel); r.errs.forEach(function (e) { console.log('    error: ' + e); }); }
    else console.log('✓ ' + rel + (r.warns.length ? ' (' + r.warns.length + ' warning' + (r.warns.length > 1 ? 's' : '') + ')' : ''));
    r.warns.forEach(function (w) { console.log('    warn: ' + w); });
  });
  manifests.forEach(function (f) {
    var errs = checkManifest(f, known), rel = path.relative(ROOT, f);
    if (errs.length) { failed += 1; console.log('✗ ' + rel); errs.forEach(function (e) { console.log('    error: ' + e); }); }
    else console.log('✓ ' + rel);
  });
  if (!svgs.length && !manifests.length) { console.log('nothing to check'); process.exitCode = 1; return; }
  console.log((svgs.length + manifests.length - failed) + '/' + (svgs.length + manifests.length) + ' files pass');
  if (failed) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { checkSvg: checkSvg, checkManifest: checkManifest };
