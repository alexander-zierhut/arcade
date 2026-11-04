// scripts/render-svg.js: rasterises SVG files with the system Chrome (the same renderer the game uses).
// Usage: node scripts/render-svg.js <out.png> <size> <file.svg> [file.svg ...]
//   one file  -> out.png is that sprite at <size> px wide (height follows the viewBox)
//   many files -> out.png is a contact sheet, every sprite in a <size> px cell on the counter colour, with its name
// Also: node scripts/render-svg.js --check <file.svg> ...  validates XML, viewBox/width/height, no <script>/<image>/href.
'use strict';
var fs = require('fs');
var path = require('path');
var launchChrome = require(path.join(__dirname, '..', '..', 'tests', 'chrome.js')).launchChrome;

function check(file) {
  var s = fs.readFileSync(file, 'utf8'), bad = [];
  if (!/^\s*<svg[\s>]/.test(s.replace(/^<\?xml[^>]*>\s*/, ''))) bad.push('does not start with <svg');
  if (!/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(s)) bad.push('no xmlns');
  if (!/viewBox="0 0 \d+ \d+"/.test(s)) bad.push('viewBox must be "0 0 W H"');
  if (!/\bwidth="\d+"/.test(s) || !/\bheight="\d+"/.test(s)) bad.push('width/height attributes missing');
  if (/<script|<image|<foreignObject|href=|url\(http/i.test(s)) bad.push('script/image/foreignObject/href/external url not allowed');
  if (/<text/i.test(s)) bad.push('<text> not allowed (fonts differ per device); draw letters as paths');
  if (/<filter|<pattern|<mask/i.test(s)) bad.push('filter/pattern/mask not allowed (keep it flat)');
  if (s.length > 8000) bad.push('over 8 KB (' + s.length + ')');
  var ids = (s.match(/\bid="([^"]+)"/g) || []).map(function (m) { return m.slice(4, -1); });
  var base = path.basename(file, '.svg');
  ids.forEach(function (id) { if (id.indexOf(base + '-') !== 0) bad.push('id "' + id + '" must start with "' + base + '-"'); });
  try { require('child_process').execFileSync('xmllint', ['--noout', file], { stdio: 'pipe' }); } catch (e) { bad.push('xmllint: ' + String(e.stderr || e.message).split('\n')[0]); }
  return bad;
}

(async function () {
  var args = process.argv.slice(2);
  if (args[0] === '--check') {
    var fail = 0;
    args.slice(1).forEach(function (f) { var b = check(f); if (b.length) { fail++; console.log('FAIL ' + f + '\n  ' + b.join('\n  ')); } else console.log('ok   ' + f); });
    process.exit(fail ? 1 : 0);
  }
  var out = args[0], size = parseInt(args[1], 10), files = args.slice(2);
  if (!out || !size || !files.length) { console.log('usage: render-svg.js <out.png> <size> <file.svg> ...  |  --check <file.svg> ...'); process.exit(2); }
  var cells = files.map(function (f) {
    var svg = fs.readFileSync(f, 'utf8');
    return '<div class="c"><img src="data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') + '" style="width:' + size + 'px"><span>' + path.basename(f, '.svg') + '</span></div>';
  });
  var single = files.length === 1;
  var html = '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#2B1B14;font:12px sans-serif;color:#F4EBDD}' +
    '.s{display:flex;flex-wrap:wrap;gap:8px;padding:8px;width:' + (single ? size : Math.min(files.length, 6) * (size + 16) + 16) + 'px}' +
    '.c{display:flex;flex-direction:column;align-items:center;gap:4px;background:#3b2a20;padding:4px;border-radius:6px}' +
    'img{display:block;image-rendering:auto}' + (single ? '.c{background:none;padding:0}.s{padding:0}span{display:none}' : '') + '</style>' +
    '<div class="s" id="s">' + cells.join('') + '</div>';
  var browser = await launchChrome();
  var page = await browser.newPage();
  await page.setContent(html);
  await page.waitForTimeout(100);
  var el = await page.$('#s');
  await el.screenshot({ path: out, omitBackground: single });
  await browser.close();
  console.log('wrote ' + out);
})().catch(function (e) { console.error(e); process.exit(1); });
