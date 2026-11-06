// tests/browser/scene.spec.js: the picture must match the engine. On BOTH belt directions: every plate is drawn
// where the engine says it is (the arc position of sim.plates()[i].s through the layout's pointAt, in pixels), a
// tap plans one departure per piece (+DEPART_FIRST_MS, then every DEPART_GAP_MS) on reserved plates (trapdoors: the
// reserved plate sinks where it is and rises at the mouth), the scene starts the first piece's slide out of the box at
// once, the pieces are on plates after the last departure, no two plates ever overlap, and a riding piece moves in the
// belt's travel direction. Written after a playtest in which a counter-clockwise level drew every plate
// mirrored and flights crossed the screen. Exports run({ browser, url, ok }) for tests/browser/run.js; runs alone
// with `node tests/browser/scene.spec.js`.
'use strict';
var path = require('path');

var FIX = {
  cw: { id: 901, tier: 'easy', seed: 1, layout: 'ring-2col', dir: 'cw', N: 6, kinds: 1,
    boxes: [{ id: 'L2', pieces: [0, 0, 0] }, { id: 'R5', pieces: [0] }, { id: 'L6', pieces: [] }] },
  // ccw: the left lane runs downward, so the full box sits low and the empty box above it is never reached first
  ccw: { id: 902, tier: 'easy', seed: 1, layout: 'ring-2col', dir: 'ccw', N: 6, kinds: 1,
    boxes: [{ id: 'L6', pieces: [0, 0, 0] }, { id: 'R5', pieces: [0] }, { id: 'L2', pieces: [] }] },
  counter: { id: 903, tier: 'easy', seed: 1, layout: 'counter', dir: 'ccw', N: 7, kinds: 1,
    boxes: [{ id: 'T2', pieces: [0, 0, 0] }, { id: 'B4', pieces: [0] }, { id: 'I1', pieces: [] }] }
};

async function newPage(browser, w, h) {
  var ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  var page = await ctx.newPage();
  var problems = [];
  page.on('pageerror', function (e) { problems.push('pageerror: ' + (e && e.message || e)); });
  page.on('console', function (m) { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  return { ctx: ctx, page: page, problems: problems };
}

/** Starts a fixture level straight through the app (no title clicks): injects it as the only level and starts it. */
async function startFixture(page, level) {
  await page.evaluate(function (lv) {
    var PL = window.PlateLoop;
    lv = JSON.parse(JSON.stringify(lv)); lv.id = 1;
    PL.levels = [lv];
    try { PL.save.patch({ level: 1, seen: { howto: ['basics', 'hidden', 'pair', 'wrap', 'ice', 'lock', 'oneway'] } }); } catch (e) { /* older save shape */ }
    if (window.Arcade && Arcade.closeSheet) Arcade.closeSheet();
    PL.app.start(1);
  }, level);
  await page.waitForFunction(function () { return window.PlateLoop.app.state === 'PLAY' && !!PlateLoop.app.sim && !!PlateLoop.app.scene; }, null, { timeout: 8000 });
  await page.waitForTimeout(120);
}

/** probe(): everything the checks compare, computed in the page from the engine and the scene. */
function probeFn() {
  var PL = window.PlateLoop, app = PL.app, sim = app.sim, sc = app.scene, st = sim.state;
  var tpl = PL.layouts[st.level.layout], L = sc.layout();
  var plates = (typeof sim.plates === 'function') ? sim.plates() : PL.sim.plates(sim);
  var out = { dir: st.dir, N: st.N, plates: [], staged: (typeof sc.staged === 'function') ? sc.staged() : null, pending: st.boxes.map(function (b) { return b.pending || 0; }) };
  for (var i = 0; i < plates.length; i++) {
    var p = plates[i], e = PL.layouts.pointAt(tpl, p.s), drawn = (typeof sc.platePoint === 'function') ? sc.platePoint(p.plate) : null;
    out.plates.push({ i: p.plate, s: p.s, piece: !!p.piece, expect: { x: L.ox + e.x * L.scale, y: L.oy + e.y * L.scale }, drawn: drawn });
  }
  out.spacingPx = (sim.belt && sim.belt.spacing ? sim.belt.spacing : tpl.perimeter / st.N) * L.scale;
  out.perimeter = tpl.perimeter;
  out.mouth = [];
  for (var b = 0; b < st.boxes.length; b++) out.mouth.push((typeof sc.mouthPoint === 'function') ? sc.mouthPoint(b) : null);
  return out;
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

async function run(opts) {
  var browser = opts.browser, url = opts.url, ok = opts.ok;
  var P = await newPage(browser, 390, 844), page = P.page;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(function () { return window.PlateLoop && PlateLoop.app && PlateLoop.app.state === 'TITLE'; }, null, { timeout: 15000 });

  var names = Object.keys(FIX);
  for (var n = 0; n < names.length; n++) {
    var name = names[n], lv = FIX[name];
    await startFixture(page, lv);
    var pr = await page.evaluate(probeFn);
    ok(pr.dir === lv.dir && pr.N === lv.N, name + ': fixture started (dir ' + pr.dir + ', N ' + pr.N + ')');
    ok(typeof pr.staged === 'number' && pr.plates[0].drawn, name + ': the scene exposes platePoint() and staged()');

    // A. every plate is drawn where the engine puts it, on 12 consecutive frames
    var worst = 0, frames = 0;
    for (var f = 0; f < 12; f++) {
      pr = await page.evaluate(probeFn);
      for (var i = 0; i < pr.plates.length; i++) if (pr.plates[i].drawn) worst = Math.max(worst, dist(pr.plates[i].drawn, pr.plates[i].expect));
      frames++;
      await page.waitForTimeout(40);
    }
    ok(worst < 3, name + ': plates are drawn at the engine\'s arc positions on ' + frames + ' frames (worst ' + worst.toFixed(1) + ' px, limit 3)');

    // B. travel direction: the arc value of a plate grows for cw and shrinks for ccw (modulo the wrap)
    var s0 = (await page.evaluate(probeFn)).plates[0].s;
    await page.waitForTimeout(300);
    var pr2 = await page.evaluate(probeFn), s1 = pr2.plates[0].s, per = await page.evaluate(function () { return PlateLoop.layouts[PlateLoop.app.sim.state.level.layout].perimeter; });
    var ds = ((s1 - s0) % per + per) % per;   // in [0, per)
    var forward = lv.dir === 'cw' ? (ds > 0 && ds < per / 2) : (ds > per / 2);
    ok(forward, name + ': plates travel in the belt\'s direction (ds ' + ds.toFixed(1) + ' of ' + per.toFixed(0) + ')');

    // C. tap the 3-piece box with a real pointer (trapdoor model): the three pieces are on real plates at once,
    //    those plates were teleported to the mouth (eject events at the tap, teleported: true), the sink/rise
    //    animation finishes within a second, no two plates ever overlap, and the pieces then land and win.
    var after0 = await page.evaluate(probeFn);
    var rect = await page.evaluate(function () { var sc = PlateLoop.app.scene, r = sc.boxRect(0), L = sc.layout(), c = document.querySelector('canvas').getBoundingClientRect(); return { x: c.left + L.ox + (r.x + r.w / 2) * L.scale, y: c.top + L.oy + (r.y + r.h / 2) * L.scale }; });   // boxRect is in design units
    await page.evaluate(function () { window.__n0 = PlateLoop.app.sim.log.length; });
    await page.mouse.click(rect.x, rect.y);
    // scheduled departures: the tap reserves the plates (from behind the mouth) and plans the departures at
    // +DEPART_FIRST_MS, +GAP, +GAP; the pieces are on plates only after the last departure
    var plan = await page.evaluate(function () {
      var sim = PlateLoop.app.sim, ev = sim.log.slice(window.__n0), t = ev.filter(function (e) { return e.type === 'tapped'; })[0];
      var t0 = t && typeof t.time === 'number' ? t.time : sim.time;   // measure from the tap event's own time, not from a later read
      return { tapped: !!t, k: t ? t.k : 0, plan: t && t.plan ? t.plan.map(function (q) { return { plate: q.plate, departAt: q.departAt - t0 }; }) : [], time: sim.time,
        cfg: { first: PlateLoop.config.DEPART_FIRST_MS, gap: PlateLoop.config.DEPART_GAP_MS } };
    });
    ok(plan.tapped && plan.k === 3 && plan.plan.length === 3, name + ': the tap was accepted and plans 3 departures (k ' + plan.k + ', plan ' + plan.plan.length + ')');
    var expectT = plan.plan.map(function (q, j) { return plan.cfg.first + j * plan.cfg.gap; });
    var tOk = plan.plan.every(function (q, j) { return Math.abs(q.departAt - expectT[j]) < 40; });
    ok(tOk, name + ': departures are scheduled at +' + expectT.join('/+') + ' ms (got ' + plan.plan.map(function (q) { return q.departAt.toFixed(0); }).join('/') + ')');
    var feedback = await page.evaluate(function () { var sc = PlateLoop.app.scene; return typeof sc.staged === 'function' ? sc.staged() : -1; });
    ok(feedback === 3, name + ': the scene shows all 3 pieces leaving right after the tap (staged ' + feedback + ')');
    var pl0 = await page.evaluate(function () { return PlateLoop.app.sim.state.belt.filter(function (p) { return !!p; }).length; });
    ok(pl0 === 0, name + ': no piece is on a plate before the first departure (' + pl0 + ')');
    var lastAt = expectT[expectT.length - 1] + 400;
    await page.waitForTimeout(lastAt);
    var afterAll = await page.evaluate(function () {
      var sim = PlateLoop.app.sim, ev = sim.log.slice(window.__n0), ej = ev.filter(function (e) { return e.type === 'eject'; });
      return { ejects: ej.length, teleported: ej.filter(function (e) { return e.teleported; }).length, onPlates: sim.state.belt.filter(function (p) { return !!p; }).length + ev.filter(function (e) { return e.type === 'land'; }).length, pieces: sim.state.boxes[0].pieces.length };
    });
    ok(afterAll.ejects === 3 && afterAll.teleported === 3, name + ': all 3 departures happened on teleported plates (' + afterAll.ejects + ')');
    ok(afterAll.onPlates === 3 && afterAll.pieces === 0, name + ': after the last departure the 3 pieces are on plates (or landed) and the box is empty');
    var minGap = 1e9, framesC = 0;
    var tEnd = Date.now() + 700;
    while (Date.now() < tEnd) {
      var pr3 = await page.evaluate(probeFn);
      var ss = pr3.plates.map(function (p) { return p.s; }).sort(function (a, b) { return a - b; }), per3 = pr3.perimeter;
      for (var q = 0; q < ss.length; q++) { var g = (q + 1 < ss.length ? ss[q + 1] : ss[0] + per3) - ss[q]; if (g < minGap) minGap = g; }
      framesC++;
      await page.waitForTimeout(40);
    }
    var plateU = await page.evaluate(function () { return PlateLoop.layouts[PlateLoop.app.sim.state.level.layout].plate; });
    ok(minGap >= plateU * 0.85, name + ': no two plates overlap after the departures (' + framesC + ' frames, smallest gap ' + minGap.toFixed(1) + ' units, plate ' + plateU + ')');
    await page.waitForTimeout(600);
    ok((await page.evaluate(probeFn)).staged === 0, name + ': the departure animations are over (staged 0)');
    await page.waitForFunction(function () { return PlateLoop.app.sim.status === 'won'; }, null, { timeout: 30000 }).catch(function () {});
    ok(await page.evaluate(function () { return PlateLoop.app.sim.status; }) === 'won', name + ': the fixture is won (the pieces landed in the matching box)');
    await page.evaluate(function () { PlateLoop.app.toTitle(); });
    await page.waitForFunction(function () { return PlateLoop.app.state === 'TITLE'; }, null, { timeout: 5000 });
  }
  ok(P.problems.length === 0, 'scene: no console or page errors (' + P.problems.join(' | ').slice(0, 300) + ')');
  await P.ctx.close();
}

module.exports = { run: run, FIXTURES: FIX };

if (require.main === module) {
  (async function () {
    var serve = require('./serve.js').serve;
    var launchChrome = require(path.join(__dirname, 'chrome.js')).launchChrome;
    var srv = await serve(path.resolve(__dirname, '..', '..'));
    var browser = await launchChrome();
    var checks = 0, failed = 0;
    function ok(c, m) { checks++; if (!c) { failed++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }
    try { await run({ browser: browser, url: srv.url, ok: ok }); }
    catch (e) { failed++; console.log('  FAIL scene.spec threw: ' + (e && e.stack || e)); }
    await browser.close(); srv.close();
    console.log(checks + ' checks, ' + (checks - failed) + ' ok, ' + failed + ' failed');
    process.exit(failed ? 1 : 0);
  })();
}
