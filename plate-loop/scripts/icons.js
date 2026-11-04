// scripts/icons.js: renders assets/icons/icon-192.png, icon-512.png and apple-touch-icon.png (180) from
// assets/sprites/icon.svg with the system Chrome. Usage: node scripts/icons.js
'use strict';
var fs = require('fs');
var path = require('path');
var launchChrome = require(path.join(__dirname, '..', '..', 'tests', 'chrome.js')).launchChrome;
var root = path.join(__dirname, '..');
var svg = fs.readFileSync(path.join(root, 'assets', 'sprites', 'icon.svg'), 'utf8');
var OUT = [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]];
(async function () {
  var browser = await launchChrome();
  for (var i = 0; i < OUT.length; i++) {
    var size = OUT[i][1];
    var page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#2B1B14}img{display:block;width:' + size + 'px;height:' + size + 'px}</style><img src="data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') + '">');
    await page.waitForTimeout(100);
    var out = path.join(root, 'assets', 'icons', OUT[i][0]);
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log('wrote ' + out);
  }
  await browser.close();
})().catch(function (e) { console.error(e); process.exit(1); });
