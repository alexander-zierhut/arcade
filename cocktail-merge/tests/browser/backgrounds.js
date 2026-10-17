// tests/browser/backgrounds.js: renders every background scene (src/art/backgrounds.js) at 390x844 and 1280x800
// into docs/preview/backgrounds.png via tests/browser/backgrounds.html. A review tool, not a test.
// Run with `node tests/browser/backgrounds.js`. Exits 1 on any console error, page error or failed image load.
'use strict';
var fs = require('fs');
var path = require('path');
var url = require('url');
var chrome = require('./chrome.js');

var ROOT = path.resolve(__dirname, '..', '..');
var OUT = path.join(ROOT, 'docs', 'preview', 'backgrounds.png');

async function main() {
  var browser, errors = [];
  try { browser = await chrome.launchChrome(); } catch (e) { console.error(e && e.message || e); process.exit(1); }
  try {
    var page = await browser.newPage({ viewport: { width: 2400, height: 1900 }, deviceScaleFactor: 1 });
    page.on('console', function (m) { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
    page.on('pageerror', function (e) { errors.push('[pageerror] ' + (e && e.stack || e)); });
    page.on('requestfailed', function (r) { errors.push('[load failed] ' + r.url()); });
    await page.goto(url.pathToFileURL(path.join(__dirname, 'backgrounds.html')).href, { waitUntil: 'load' });
    await page.waitForSelector('body[data-done="1"]', { timeout: 30000 });
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    await page.screenshot({ path: OUT, fullPage: false });
    console.log('Wrote ' + path.relative(ROOT, OUT));
  } catch (e) {
    errors.push(String(e && e.stack || e));
  } finally {
    await browser.close();
  }
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
}

main();
