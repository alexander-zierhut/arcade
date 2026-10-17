// tests/browser/contact-sheet.js: the colour contact sheet and the readability sheet (DESIGN 6.2).
// Run with `npm run preview`. A review tool, not a test; never needed to play.
// Opens tests/browser/contact-sheet.html via file:// in the system Chrome (playwright-core) and writes
//   docs/preview/cocktails.png        1600x2100 colour sheet (viewport screenshot, not fullPage)
//   docs/preview/cocktails-small.png  all 9 sprites at 28 px tall, colour and greyscale
// Exits 1 on any console error or page error (a failed load of an optional assets/tier-N.png is ignored),
// or when Chrome cannot be started (it then prints how to set CHROME_PATH).
'use strict';
var fs = require('fs');
var path = require('path');
var url = require('url');
var chrome = require('./chrome.js');

var ROOT = path.resolve(__dirname, '..', '..');
var HARNESS = path.join(__dirname, 'contact-sheet.html');
var OUT_DIR = path.join(ROOT, 'docs', 'preview');
var OPTIONAL_ASSET = /assets\/tier-[1-9]\.png/;

function isIgnorable(msg) {
  var loc = (msg.location && msg.location()) || {};
  var text = msg.text() || '';
  return /Failed to load resource/.test(text) && OPTIONAL_ASSET.test(String(loc.url || ''));
}

async function render(browser, query, viewport, shoot, outFile, errors) {
  var page = await browser.newPage({ viewport: viewport, deviceScaleFactor: 1 });
  page.on('console', function (msg) {
    var type = msg.type();
    if ((type === 'error' || type === 'warning') && !isIgnorable(msg)) {
      var line = '[' + query + ' ' + type + '] ' + msg.text();
      // sprites.js only warns when a painter throws (it then draws a stand-in): that is a failure too.
      if (type === 'error' || /failed|stand-in/i.test(msg.text())) errors.push(line);
      else console.warn(line);
    }
  });
  page.on('pageerror', function (err) { errors.push('[' + query + ' pageerror] ' + (err && err.stack || err)); });
  page.on('requestfailed', function (req) {
    if (!OPTIONAL_ASSET.test(req.url())) errors.push('[' + query + ' load failed] ' + req.url());
  });
  var href = url.pathToFileURL(HARNESS).href + query;
  await page.goto(href, { waitUntil: 'load' });
  await page.waitForSelector('body[data-done="1"]', { timeout: 20000 });
  await shoot(page, outFile);
  await page.close();
}

async function main() {
  var browser;
  try {
    browser = await chrome.launchChrome();
  } catch (e) {
    console.error(e && e.message || e);
    process.exit(1);
  }
  var errors = [];
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    var big = path.join(OUT_DIR, 'cocktails.png');
    var small = path.join(OUT_DIR, 'cocktails-small.png');
    await render(browser, '', { width: 1600, height: 2100 }, function (page, file) {
      return page.screenshot({ path: file, fullPage: false });
    }, big, errors);
    await render(browser, '?sheet=small', { width: 1600, height: 900 }, function (page, file) {
      return page.locator('#small').screenshot({ path: file });
    }, small, errors);
    console.log('Wrote ' + path.relative(ROOT, big) + ' and ' + path.relative(ROOT, small));
  } catch (e) {
    errors.push('contact sheet failed: ' + (e && e.stack || e));
  } finally {
    await browser.close();
  }
  if (errors.length) {
    console.error('Contact sheet problems (' + errors.length + '):\n  ' + errors.join('\n  '));
    process.exit(1);
  }
}

main();
