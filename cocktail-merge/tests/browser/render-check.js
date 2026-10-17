// tests/browser/render-check.js: headless render check (DESIGN 5.10). A review tool, not a test.
// Opens tests/browser/render-check.html via file:// at 390x844 in the system Chrome (playwright-core) and writes
// docs/preview/render-check.png. Usage:
//   node tests/browser/render-check.js [query] [outFile] [WxH] [dpr]
// e.g. node tests/browser/render-check.js "?scene=sunset&state=danger" /tmp/x.png 375x667 2
// Exits 1 on a page error, a console error or a failed stage/draw.
'use strict';
var path = require('path');
var url = require('url');
var fs = require('fs');
var chrome = require('./chrome.js');

var ROOT = path.resolve(__dirname, '..', '..');
var query = process.argv[2] || '';
var out = process.argv[3] || path.join(ROOT, 'docs', 'preview', 'render-check.png');
var size = (process.argv[4] || '390x844').split('x').map(Number);
var dpr = Number(process.argv[5] || 1);
var OPTIONAL = /assets\/tier-[1-9]\.png/;

async function main() {
  var browser;
  try { browser = await chrome.launchChrome(); } catch (e) { console.error(e && e.message || e); process.exit(1); }
  var errors = [];
  try {
    var page = await browser.newPage({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: dpr });
    page.on('console', function (m) { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    page.on('pageerror', function (e) { errors.push('pageerror: ' + (e && e.stack || e)); });
    page.on('requestfailed', function (r) { if (!OPTIONAL.test(r.url())) errors.push('load failed: ' + r.url()); });
    await page.goto(url.pathToFileURL(path.join(__dirname, 'render-check.html')).href + query, { waitUntil: 'load' });
    await page.waitForSelector('body[data-done="1"]', { timeout: 20000, state: 'attached' });
    var msg = await page.evaluate(function () { return document.body.getAttribute('data-msg'); });
    if (!/^ok/.test(msg)) errors.push(msg);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out });
    console.log(msg + '\nWrote ' + path.relative(ROOT, out));
  } catch (e) {
    errors.push('render check failed: ' + (e && e.stack || e));
  } finally { await browser.close(); }
  if (errors.length) { console.error('Problems (' + errors.length + '):\n  ' + errors.join('\n  ')); process.exit(1); }
}
main();
