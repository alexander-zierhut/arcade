// tests/purity.test.js: test 55 (DESIGN 6.2). Pure files stay free of browser, time and
// randomness globals, and every source file stays small (the many-small-files rule, 5.1).
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var SRC = path.join(ROOT, 'src');
var MAX_LINES = 450;
var FORBIDDEN = /\b(window|document|navigator|localStorage|sessionStorage|performance|requestAnimationFrame|setTimeout|setInterval|Date|AudioContext)\b|Math\.random/;

function rel(p) { return path.relative(ROOT, p).split(path.sep).join('/'); }

function walk(dir, out) {
  fs.readdirSync(dir).sort().forEach(function (name) {
    var p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  });
  return out;
}

function pureFiles() {
  var list = ['config.js', 'physics.js', 'projection.js'].map(function (f) { return path.join(SRC, f); });
  var gameDir = path.join(SRC, 'game');
  fs.readdirSync(gameDir).filter(function (f) { return /\.js$/.test(f); }).sort()
    .forEach(function (f) { list.push(path.join(gameDir, f)); });
  return list;
}

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}

function count(text, needle) { return text.split(needle).length - 1; }

function lineCount(text) {
  var n = text.split('\n').length;
  return /\n$/.test(text) ? n - 1 : n;
}

test('55 purity: pure files use no browser, time or randomness globals', function () {
  var files = pureFiles();
  assert.ok(files.length >= 11, 'expected config, physics, projection and the 8 game parts');
  files.forEach(function (p) {
    var name = rel(p);
    assert.ok(fs.existsSync(p), name + ' exists');
    var text = fs.readFileSync(p, 'utf8');
    assert.strictEqual(count(text, '/* @pure-begin */'), 1, name + ': exactly one @pure-begin');
    assert.strictEqual(count(text, '/* @pure-end */'), 1, name + ': exactly one @pure-end');
    var a = text.indexOf('/* @pure-begin */');
    var b = text.indexOf('/* @pure-end */');
    assert.ok(a < b, name + ': @pure-begin precedes @pure-end');
    var body = stripComments(text.slice(a + '/* @pure-begin */'.length, b));
    var m = body.match(FORBIDDEN);
    assert.ok(!m, name + ': forbidden reference "' + (m && m[0]) + '" in the pure section');
    assert.ok(!/\bwindow\b/.test(text), name + ': the word window appears in the file');
  });
});

test('55 purity: the 8 game parts register under CM.gameParts and load in Node', function () {
  ['spawn', 'merge', 'danger', 'aim', 'state', 'save', 'chime'].forEach(function (part) {
    var p = path.join(SRC, 'game', part + '.js');
    var text = fs.readFileSync(p, 'utf8');
    assert.ok(text.indexOf('gameParts.' + part) >= 0, rel(p) + ' registers CM.gameParts.' + part);
    assert.ok(require(p), rel(p) + ' loads');
  });
  var game = require(path.join(SRC, 'game', 'game.js'));
  assert.strictEqual(typeof game.tick, 'function');
});

test('55 file size: every src/**/*.js and *.css file has at most ' + MAX_LINES + ' lines', function () {
  var files = walk(SRC, []).filter(function (p) { return /\.(js|css)$/.test(p); });
  assert.ok(files.length > 0);
  var tooLong = files.filter(function (p) {
    return lineCount(fs.readFileSync(p, 'utf8')) > MAX_LINES;
  }).map(function (p) { return rel(p) + ' (' + lineCount(fs.readFileSync(p, 'utf8')) + ')'; });
  assert.deepStrictEqual(tooLong, [], 'files over ' + MAX_LINES + ' lines: ' + tooLong.join(', '));
});

// Owner rule (ES2018 for Safari 15) for EVERY source file: no syntax newer than ES2018.
// The scanner blanks comments, string/template literals and regex literals first, so colours
// like '#FFD23F' or text like 'a ?? b' inside strings never trip it.
function codeOnly(src) {
  var out = '', i = 0, n = src.length, prev = '';
  function sig() { var m = out.match(/(\S)\s*$/); return m ? m[1] : ''; }
  function word() { var m = out.match(/([A-Za-z_$][\w$]*)\s*$/); return m ? m[1] : ''; }
  while (i < n) {
    var c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { var e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; out += ' '; continue; }
    if (c === '"' || c === "'" || c === '`') {
      var q = c, depth = 0; i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (q === '`' && src[i] === '$' && src[i + 1] === '{') { depth++; i += 2; continue; }
        if (q === '`' && depth && src[i] === '}') { depth--; i++; continue; }
        if (src[i] === q && !depth) { i++; break; }
        i++;
      }
      out += '""'; continue;
    }
    if (c === '/') {
      prev = sig();
      var w = word();
      if (!prev || '(,=:[!&|?{};+-*%<>~^'.indexOf(prev) >= 0 || /^(return|typeof|case|in|of|void|delete|throw|new)$/.test(w)) {
        var cls = false; i++;
        while (i < n && src[i] !== '\n') {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false;
          else if (src[i] === '/' && !cls) { i++; break; }
          i++;
        }
        while (i < n && /[a-z]/.test(src[i])) i++;
        out += '/r/'; continue;
      }
    }
    out += c; i++;
  }
  return out;
}

// Depth-1 text of every class body (nested braces and parentheses removed).
function classMembers(code) {
  var re = /\bclass\b[^{;]*\{/g, m, all = [];
  while ((m = re.exec(code))) {
    var i = m.index + m[0].length, depth = 1, paren = 0, text = '';
    for (; i < code.length && depth > 0; i++) {
      var c = code[i];
      if (c === '{') depth++; else if (c === '}') depth--;
      else if (c === '(') paren++; else if (c === ')') paren--;
      else if (depth === 1 && paren === 0) text += c;
      if (depth === 1 && paren === 0 && c === '}') text += ';';
    }
    all.push(text);
  }
  return all;
}

var NEWER = [
  [/\?\.(?!\d)/, 'optional chaining ?.'], [/\?\?/, 'nullish coalescing ??'],
  [/\|\|=|&&=/, 'logical assignment'], [/\bcatch\s*\{/, 'optional catch binding'],
  [/\b\d[\d_]*_\d/, 'numeric separator'], [/#[A-Za-z_$]/, 'private name #x']
];
function syntaxProblems(src) {
  var code = codeOnly(src), out = [];
  NEWER.forEach(function (p) { if (p[0].test(code)) out.push(p[1]); });
  classMembers(code).forEach(function (body) {
    if (/(^|[;\s])(static\s+)?[A-Za-z_$][\w$]*\s*=/.test(body)) out.push('class field');
  });
  return out;
}

test('55 syntax: the ES2018 guard itself flags newer syntax and ignores strings/comments', function () {
  ['a?.b', 'a ?? b', 'x ||= 1', 'try {} catch {}', 'var n = 1_000;', 'class A { #x = 1; }',
    'class A { y = 2; m() {} }', 'class A { static z = 3 }'].forEach(function (src) {
    assert.ok(syntaxProblems(src).length > 0, 'not flagged: ' + src);
  });
  ['var c = "#FFD23F ?? a?.b";', '// a?.b ??\nvar x = 1;', 'var r = /a?.b/g;', 'var t = `${a} ?? b`;',
    'var y = a ? .5 : 1;', 'class A { constructor(a = 1) { this.a = a; } m(x) { return x; } }',
    'try {} catch (e) {}', 'var tier1_2 = 3;', 'var q = x / 2 / y;'].forEach(function (src) {
    assert.deepStrictEqual(syntaxProblems(src), [], 'false positive: ' + src);
  });
});

test('55 syntax: every src/**/*.js file is ES2018 (Safari 15)', function () {
  var files = walk(SRC, []).filter(function (p) { return /\.js$/.test(p); });
  assert.ok(files.length >= 11);
  var bad = [];
  files.forEach(function (p) {
    var probs = syntaxProblems(fs.readFileSync(p, 'utf8'));
    if (probs.length) bad.push(rel(p) + ': ' + probs.join(', '));
  });
  assert.deepStrictEqual(bad, []);
});
