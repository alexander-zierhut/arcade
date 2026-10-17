// tests/projection.test.js: projection and layout (DESIGN 6.2, tests 48-54).
'use strict';
var assert = require('assert');
var config = require('../src/config.js');
var P = require('../src/projection.js');

var TABLE = config.TABLE;
var L = TABLE.L;
var LAUNCH_Y = TABLE.LAUNCH_Y;
var VIEW = config.VIEW;

function radius(t, mode) {
  if (t === 1) return config.TIERS[1].radius;
  var scale = mode === 'relaxed' ? config.MODES.relaxed.RADIUS_SCALE : 1;
  if (typeof scale !== 'number') scale = 1;
  return config.TIERS[t].radius * scale;
}
function dangerY(mode) {
  var m = config.MODES[mode] || {};
  return typeof m.DANGER_Y === 'number' ? m.DANGER_Y : TABLE.DANGER_Y;
}

function mulberry32(a) {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function near(a, b, eps, msg) {
  assert.ok(Math.abs(a - b) <= eps, (msg || '') + ' expected ' + b + ' got ' + a + ' (eps ' + eps + ')');
}

var SIZES = [[360, 640], [360, 780], [375, 667], [390, 844], [412, 915], [768, 1024], [1366, 768], [1920, 1080]];
var SAFES = [{ top: 0, bottom: 0 }, { top: 47, bottom: 34 }];

function layoutFor(vw, vh, safe) {
  return P.computeLayout(vw, vh, 2, safe || { top: 0, bottom: 0 }, { coarse: vw < 500 });
}
function Y(lay, y) { return P.project(lay, 50, y).Y; }

test('48 layout solve: stage, cNear, headroom, strip clearance, T1 size', function () {
  SIZES.forEach(function (sz) {
    SAFES.forEach(function (safe) {
      var vw = sz[0], vh = sz[1];
      var lay = layoutFor(vw, vh, safe);
      var tag = vw + 'x' + vh + ' safe ' + safe.top + '/' + safe.bottom + ': ';
      assert.strictEqual(lay.stage.w, Math.min(vw, Math.round(0.62 * vh)), tag + 'S');
      assert.strictEqual(lay.stage.h, vh, tag + 'H');
      assert.ok(lay.cNear >= 0.85 && lay.cNear <= 0.98, tag + 'cNear ' + lay.cNear);
      assert.ok(lay.farY >= lay.hud.bottom + 0.12 * vh - 0.5, tag + 'farY ' + lay.farY);
      assert.ok(lay.nearY + 10 * lay.kX <= lay.strip.top + 1e-9, tag + 'near edge vs strip');
      near(lay.farY, lay.nearY - 0.28 * lay.A, 1e-9, tag + 'farY = nearY - 0.28A');
      assert.ok(lay.strip.bottom <= vh - safe.bottom, tag + 'strip above safe bottom');
      assert.ok(lay.hud.top >= safe.top, tag + 'hud below safe top');
      near(lay.uiK, lay.kX / 3.4, 1e-12, tag + 'uiK');
      assert.strictEqual(lay.needsPortrait, false, tag + 'needsPortrait');
      if (vw < 500) {
        var d = 2 * radius(1, 'standard') * lay.kX * P.scaleAt(LAUNCH_Y);
        assert.ok(d >= 30, tag + 'T1 diameter ' + d);   // rev 4: T1 r 5.2 (smaller glasses), >= 30 px on phones
      }
    });
  });
  assert.strictEqual(P.computeLayout(844, 390, 2, { top: 0, bottom: 0 }, { coarse: true }).needsPortrait, true);
  assert.strictEqual(P.computeLayout(844, 390, 2, { top: 0, bottom: 0 }, { coarse: false }).needsPortrait, false);
  assert.strictEqual(P.computeLayout(1024, 768, 2, { top: 0, bottom: 0 }, { coarse: true }).needsPortrait, false);
});

test('48b reference values of 3.2 (safe areas 0)', function () {
  var REF = [ // vw, vh, S, kX, cNear, far, danger, launcher, near
    [360, 640, 360, 3.142, 0.98, 175, 444, 482, 530],
    [360, 780, 360, 3.142, 0.98, 301, 570, 608, 656],
    [375, 667, 375, 3.273, 0.98, 183, 463, 503, 552],
    [390, 844, 390, 3.404, 0.98, 326, 617, 659, 710],
    [412, 915, 412, 3.596, 0.98, 367, 674, 719, 773],
    [768, 1024, 635, 5.542, 0.887, 276, 705, 767, 843],
    [1366, 768, 476, 4.154, 0.887, 207, 529, 575, 632],
    [1920, 1080, 670, 5.847, 0.886, 292, 744, 809, 889]
  ];
  REF.forEach(function (r) {
    var lay = layoutFor(r[0], r[1]);
    var tag = r[0] + 'x' + r[1] + ': ';
    assert.strictEqual(lay.stage.w, r[2], tag + 'S');
    near(lay.kX, r[3], 0.001, tag + 'kX');
    near(lay.cNear, r[4], 0.001, tag + 'cNear');
    near(lay.farY, r[5], 1, tag + 'far');
    near(Y(lay, 130), r[6], 1, tag + 'danger');
    near(Y(lay, 144), r[7], 1, tag + 'launcher');
    near(lay.nearY, r[8], 1, tag + 'near');
  });
});

function inside(rc, S, H) {
  return rc.x >= -1e-9 && rc.y >= -1e-9 && rc.x + rc.w <= S + 1e-9 && rc.y + rc.h <= H + 1e-9 && rc.w > 0 && rc.h > 0;
}
function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

test('49 HUD rects inside the stage, disjoint; icon box fits its slot', function () {
  [[360, 640], [375, 667], [390, 844], [1920, 1080]].forEach(function (sz) {
    SAFES.forEach(function (safe) {
      var lay = layoutFor(sz[0], sz[1], safe);
      var hud = lay.hud, S = lay.stage.w, H = lay.stage.h;
      var tag = sz[0] + 'x' + sz[1] + ' safe ' + safe.top + ': ';
      var names = ['coin', 'pill', 'best', 'pause', 'mute', 'next', 'label'];
      names.forEach(function (n) { assert.ok(inside(hud[n], S, H), tag + n + ' inside stage'); });
      var pairs = ['pill', 'best', 'pause', 'mute', 'next', 'label'];
      for (var i = 0; i < pairs.length; i++) {
        for (var j = i + 1; j < pairs.length; j++) {
          assert.ok(!overlaps(hud[pairs[i]], hud[pairs[j]]), tag + pairs[i] + ' vs ' + pairs[j]);
        }
        var shouldHit = pairs[i] === 'pill';
        assert.strictEqual(overlaps(hud.coin, hud[pairs[i]]), shouldHit, tag + 'coin vs ' + pairs[i]);
      }
      assert.ok(lay.strip.iconBox.w <= lay.strip.slotW, tag + 'iconBox.w');
      assert.ok(lay.strip.iconBox.h > 0 && lay.strip.iconBox.h <= lay.strip.h, tag + 'iconBox.h');
      assert.ok(lay.strip.top >= hud.bottom, tag + 'strip below HUD');
      assert.ok(lay.strip.x >= 0 && lay.strip.x + lay.strip.w <= S + 1e-9, tag + 'strip inside stage');
    });
  });
  // The worked example of 3.4 (390x844): coin 16..74, pill 45..201, hudBottom 91.
  var h = layoutFor(390, 844).hud;
  assert.strictEqual(h.coin.x, 16); assert.strictEqual(h.coin.x + h.coin.w, 74);
  assert.strictEqual(h.pill.x, 45); assert.strictEqual(h.pill.x + h.pill.w, 201);
  assert.strictEqual(h.bottom, 91);
});

test('50 project, scaleAt, monotonic Y', function () {
  SIZES.forEach(function (sz) {
    var lay = layoutFor(sz[0], sz[1]);
    var p = P.project(lay, 50, 160);
    near(p.X, lay.cx, 1e-9, 'X'); near(p.Y, lay.nearY, 1e-9, 'Y');
    near(lay.cx, lay.stage.x + lay.stage.w / 2, 1e-9, 'cx');
    var prev = -Infinity;
    for (var y = 0; y <= 160; y += 0.5) {
      var yy = Y(lay, y);
      assert.ok(yy > prev, 'Y strictly increasing at y ' + y);
      prev = yy;
    }
    near(Y(lay, 0), lay.farY, 1e-9, 'far edge');
  });
  near(P.scaleAt(0), 0.72, 1e-12, 'scaleAt(0)');
  near(P.scaleAt(160), 1, 1e-12, 'scaleAt(160)');
  near(P.scaleAt(130), 0.9320, 1e-4, 'scaleAt(130)');
  near(P.scaleAt(144), 0.9626, 1e-4, 'scaleAt(144)');
  var out = { X: 0, Y: 0 };
  assert.strictEqual(P.project(layoutFor(390, 844), 20, 40, out), out, 'out reused');
});

test('51 round trips', function () {
  SIZES.forEach(function (sz) {
    var lay = layoutFor(sz[0], sz[1]);
    [6, 37.3, 50, 94].forEach(function (x) {
      near(P.unprojectX(lay, P.project(lay, x, 144).X, 144), x, 1e-9, 'unprojectX ' + x);
    });
    for (var y = 0; y <= 160; y += 7.3) {
      near(P.unprojectY(lay, P.project(lay, 33, y).Y), y, 1e-6, 'unprojectY ' + y);
    }
  });
});

test('52 straight aim lines', function () {
  SIZES.forEach(function (sz) {
    var lay = layoutFor(sz[0], sz[1]);
    var a = P.project(lay, 20, 0), b = P.project(lay, 20, 80), c = P.project(lay, 20, 160);
    var cross = (b.X - a.X) * (c.Y - a.Y) - (b.Y - a.Y) * (c.X - a.X);
    assert.ok(Math.abs(cross) < 1e-6, 'cross ' + cross);
  });
});

test('53 footprint and danger agreement', function () {
  var rnd = mulberry32(53);
  SIZES.forEach(function (sz) {
    var lay = layoutFor(sz[0], sz[1]);
    for (var y = 0; y <= 160; y += 1) {
      var c = P.ratioAt(lay, y);
      assert.ok(c >= 0.61 && c <= 0.98 && c < 1, 'ratioAt ' + c);
    }
    for (var i = 0; i < 200; i++) {
      var r = 6 + rnd() * 16;
      var x = r + rnd() * (100 - 2 * r);
      var yy = r + rnd() * (160 - 2 * r);
      var fp = P.footprint(lay, x, yy, r);
      near(fp.Y + fp.ry, Y(lay, yy + r), 1e-9, 'lowest pixel');
      near(fp.Y - fp.ry, Y(lay, yy - r), 1e-9, 'highest pixel');
      near(fp.X, P.project(lay, x, yy).X, 1e-9, 'centre X');
      near(fp.rx, r * lay.kX * P.scaleAt(yy), 1e-9, 'rx');
      assert.ok(fp.ry < fp.rx, 'never seen from below');
    }
    ['standard', 'relaxed'].forEach(function (mode) {
      var DY = dangerY(mode), r5 = radius(5, mode);
      var lineY = Y(lay, DY);
      var over = P.footprint(lay, 50, DY + 0.1 - r5, r5);
      var under = P.footprint(lay, 50, DY - 0.1 - r5, r5);
      assert.ok(over.Y + over.ry > lineY, mode + ' over the line reads below it');
      assert.ok(under.Y + under.ry < lineY, mode + ' short of the line reads above it');
      assert.ok(Y(lay, LAUNCH_Y - radius(4, mode)) > lineY, mode + ' launcher glass never over the line');
    });
  });
});

test('54 zoom inversion', function () {
  SIZES.forEach(function (sz) {
    var lay = layoutFor(sz[0], sz[1]);
    var about = P.project(lay, 30, 60);
    var view = { zoom: 1.10, aboutX: about.X, aboutY: about.Y };
    [6, 22.5, 50, 77.7, 94].forEach(function (x) {
      var pt = P.project(lay, x, LAUNCH_Y);
      var zx = view.aboutX + (pt.X - view.aboutX) * view.zoom;
      var zy = view.aboutY + (pt.Y - view.aboutY) * view.zoom;
      var res = P.unprojectPointer(lay, view, zx, zy);
      near(res.x, x, 1e-9, 'x');
      near(res.sy, pt.Y, 1e-9, 'sy');
    });
    var plain = P.unprojectPointer(lay, { zoom: 1, aboutX: 0, aboutY: 0 }, P.project(lay, 41, LAUNCH_Y).X, 300);
    near(plain.x, 41, 1e-9, 'zoom 1'); near(plain.sy, 300, 1e-12, 'sy at zoom 1');
  });
});

test('layout guards: degenerate inputs stay finite', function () {
  [[1, 1], [100, 120], [320, 200], [2560, 400]].forEach(function (sz) {
    var lay = P.computeLayout(sz[0], sz[1], 3, null, null);
    ['kX', 'cNear', 'A', 'nearY', 'farY', 'cx', 'uiK'].forEach(function (k) {
      assert.ok(isFinite(lay[k]), sz + ' ' + k);
    });
    assert.ok(lay.kX > 0, 'kX > 0');
    assert.strictEqual(lay.dpr, 2, 'dpr capped');
  });
});
