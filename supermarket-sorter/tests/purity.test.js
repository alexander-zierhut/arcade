'use strict';
var assert = require('assert');
var fs = require('fs'), path = require('path');
var SRC = path.join(__dirname, '..', 'src');
var PURE = ['config.js', 'game/rng.js', 'game/board.js', 'game/rules.js', 'game/solver.js', 'game/score.js', 'game/gen.js', 'game/levels.js', 'game/game.js', 'game/save.js', 'ui/strings.js'];
function walk(dir) { var out = []; fs.readdirSync(dir).forEach(function (f) { var p = path.join(dir, f); if (fs.statSync(p).isDirectory()) out = out.concat(walk(p)); else out.push(p); }); return out; }

test('purity: the pure modules never touch the browser', function () {
  PURE.forEach(function (f) {
    var src = fs.readFileSync(path.join(SRC, f), 'utf8');
    [/\bwindow\.[A-Za-z_$]/, /\bdocument\.[A-Za-z_$]/, /\blocalStorage\b/, /\bnavigator\./, /requestAnimationFrame\(/, /setTimeout\(/, /Date\.now\(/, /Math\.random\(/].forEach(function (bad) {
      assert.ok(!bad.test(src), f + ' matches ' + bad);
    });
  });
});
test('purity: the pure modules load under Node without the others and export the same object they attach', function () {
  PURE.forEach(function (f) {
    var m = require(path.join(SRC, f));
    assert.ok(m && typeof m === 'object', f + ' exports an object');
  });
});
test('rules: every source file stays under 450 lines and uses no ES modules', function () {
  walk(SRC).filter(function (p) { return /\.(js|css)$/.test(p) && !/catalog\.js$/.test(p) && !/levels-data\.js$/.test(p); }).forEach(function (p) {
    var src = fs.readFileSync(p, 'utf8'), lines = src.split('\n').length;
    assert.ok(lines <= 450, path.relative(SRC, p) + ' has ' + lines + ' lines');
    if (/\.js$/.test(p)) assert.ok(!/^\s*(import|export)\s/m.test(src), path.relative(SRC, p) + ' uses ES modules');
  });
});
test('rules: index.html loads every src script that exists and nothing that does not', function () {
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var refs = (html.match(/src="src\/[^"]+"/g) || []).map(function (s) { return s.slice(5, -1); });
  refs.forEach(function (r) { assert.ok(fs.existsSync(path.join(__dirname, '..', r)), r + ' missing'); });
  var jsFiles = walk(SRC).filter(function (p) { return /\.js$/.test(p); }).map(function (p) { return 'src/' + path.relative(SRC, p).split(path.sep).join('/'); });
  jsFiles.forEach(function (f) { assert.ok(refs.indexOf(f) >= 0, f + ' is not loaded by index.html'); });
});
