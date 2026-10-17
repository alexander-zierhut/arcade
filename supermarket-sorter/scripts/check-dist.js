#!/usr/bin/env node
// scripts/check-dist.js: every product in the catalog must have a sprite in dist/ (both item sets).
// Run by scripts/release.mjs after copying (see release.json). Usage: node scripts/check-dist.js
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.resolve(__dirname, '..');
var c = require(path.join(ROOT, 'dist', 'src', 'art', 'catalog.js'));
var missing = 0;
c.ids.forEach(function (id) {
  ['items', 'items-2d'].forEach(function (d) {
    if (!fs.existsSync(path.join(ROOT, 'dist', 'assets', d, id + '.svg'))) { console.log('MISSING sprite ' + d + '/' + id); missing = 1; }
  });
});
process.exit(missing);
