// tests/run.js: zero-dependency test runner (zero-dependency, same runner as cocktail-merge).
// Usage: node tests/run.js [filter]   (filter = substring of a test file name, optional)
'use strict';
var fs = require('fs');
var path = require('path');

var tests = [];
global.test = function (name, fn) { tests.push({ name: name, fn: fn }); };

var dir = __dirname;
var filter = process.argv[2] || '';
var files = fs.readdirSync(dir)
  .filter(function (f) { return /\.test\.js$/.test(f) && f.indexOf(filter) !== -1; })
  .sort();

files.forEach(function (f) {
  try {
    require(path.join(dir, f));
  } catch (e) {
    // A file that cannot load counts as one failed test, and the others still run.
    tests.push({ name: f + ' (load)', fn: function () { throw e; } });
  }
});

var passed = 0, finished = false;
// A test promise that never settles lets Node drain the event loop and exit without a summary:
// count that as a failure instead of a silent exit 0.
process.on('exit', function () {
  if (!finished) { console.log('✗ the run ended before the summary (an unsettled test promise?)'); process.exitCode = 1; }
});
(async function () {
  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    try {
      await t.fn();
      passed += 1;
      console.log('✓ ' + t.name);
    } catch (e) {
      console.log('✗ ' + t.name + ': ' + (e && e.message ? e.message : String(e)));
    }
  }
  console.log(passed + '/' + tests.length + ' passed');
  finished = true;
  if (passed !== tests.length) process.exitCode = 1;
  if (tests.length === 0) { console.log('✗ no tests ran' + (filter ? ' (filter "' + filter + '")' : '')); process.exitCode = 1; }
})();
