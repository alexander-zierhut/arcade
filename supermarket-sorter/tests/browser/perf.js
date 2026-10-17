// tests/browser/perf.js: performance measurement of the real page in the system Chrome at a CPU slowdown (a low-end phone).
// Plays timed level 40 (both side belts and the bottom belt moving, items selected and dragged, the solver moving every
// 300 ms) and relaxed level 24, and reports: frame intervals (p50/p95/max, long frames), layout and style-recalc counts and
// durations, script time, DOM nodes and animations, heap, and a trace summary (time per event type: paint, layout, style,
// composite, script). Usage: node tests/browser/perf.js [--cpu=4] [--seconds=6] [--tag=name]  -> prints a table and writes
// docs/proof/perf-<tag>.json. Numbers are for comparison between runs on the same machine, not absolute phone numbers.
'use strict';
var fs = require('fs'), path = require('path');
var chrome = require('./chrome.js');
var ROOT = path.resolve(__dirname, '..', '..');
var PAGE = 'file://' + path.join(ROOT, 'index.html');
var args = {}; process.argv.slice(2).forEach(function (a) { var m = /^--([a-z]+)=(.*)$/.exec(a); if (m) args[m[1]] = m[2]; });
var CPU = parseFloat(args.cpu || '4'), SECONDS = parseFloat(args.seconds || '6'), TAG = args.tag || 'run';
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function waitState(page, s, ms) { try { await page.waitForFunction(function (s) { return window.SS && SS.app && SS.app.ctx.state === s; }, s, { timeout: ms || 8000, polling: 50 }); return true; } catch (e) { return false; } }
async function dismissCoach(page) { for (var i = 0; i < 6; i++) { if (!(await page.evaluate(function () { return SS.ui.coach && SS.ui.coach.isOpen(); }))) break; await page.tap('#coach button'); await sleep(150); } }
function metricsMap(m) { var o = {}; m.metrics.forEach(function (x) { o[x.name] = x.value; }); return o; }

async function scenario(page, cdp, mode, level, withDrag) {
  await page.evaluate(function (a) { SS.app.ctx.mode = a.mode; SS.app.debug = true; SS.app.loadLevel(a.n); }, { mode: mode, n: level });
  await waitState(page, 'INTRO', 15000); await page.tap('button[data-act="intro-go"]'); await waitState(page, 'PLAY', 5000); await dismissCoach(page);
  await page.evaluate(function () { SS.game.start(SS.app.ctx.game); });
  await sleep(500);
  var m0 = metricsMap(await cdp.send('Performance.getMetrics'));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', options: 'sampling-frequency=10000' });
  // the player: select an item (bob animation), the solver moves every 300 ms, a real touch drag every 1.5 s
  var play = page.evaluate(function (a) {
    return new Promise(function (resolve) {
      var frames = [], last = performance.now(), t0 = last, moves = 0, actionMs = [];
      function raf(t) { frames.push(t - last); last = t; if (t - t0 < a.ms) requestAnimationFrame(raf); else finish(); }
      requestAnimationFrame(raf);
      var iv = setInterval(function () {
        var g = SS.app.ctx.game; if (!g || g.status !== 'playing') return;
        var b = g.board, ids = Object.keys(b.items).filter(function (id) { return b.items[id].at === 'c' && b.items[id].type !== '*'; });
        if (ids.length && !a.noselect) SS.ui.board.select(+ids[moves % ids.length]);
        var t1 = performance.now(), m = SS.solver.hint(b, 8000);
        if (m) { var ev = SS.app.onDrop(m.item, m.to, SS.board.firstFree(b, m.to)); if (ev) SS.ui.board.apply(ev, false); }
        actionMs.push(performance.now() - t1); moves += 1;
      }, 300);
      function finish() { clearInterval(iv); frames.sort(function (x, y) { return x - y; }); var n = frames.length;
        resolve({ frames: n, p50: frames[Math.floor(n * 0.5)], p95: frames[Math.floor(n * 0.95)], max: frames[n - 1], long: frames.filter(function (f) { return f > 33; }).length, moves: moves,
          actionP95: actionMs.sort(function (x, y) { return x - y; })[Math.floor(actionMs.length * 0.95)] || 0 }); }
    });
  }, { ms: SECONDS * 1000, noselect: !!args.noselect });
  if (withDrag) {
    for (var d = 0; d < Math.floor(SECONDS / 1.5); d++) {
      await sleep(1200);
      var pick = await page.evaluate(function () { var b = SS.app.ctx.game.board, g = SS.ui.board.geometry(), rr = document.getElementById('board').getBoundingClientRect(); for (var id in b.items) { var it = b.items[id]; if (it.at !== 'c' || it.type === '*') continue; var c = g.comps[it.comp]; return { x: rr.left + c.x + (it.slot + 0.5) * g.slotW, y: rr.top + c.y + c.h - 12 - g.slotW * 0.5 }; } return null; });
      if (!pick) break;
      var cdp2 = await page.context().newCDPSession(page);
      async function touch(type, x, y) { await cdp2.send('Input.dispatchTouchEvent', { type: type, touchPoints: type === 'touchEnd' ? [] : [{ x: x, y: y, radiusX: 4, radiusY: 4, force: 1 }] }); }
      await touch('touchStart', pick.x, pick.y);
      for (var i = 1; i <= 10; i++) { await touch('touchMove', pick.x + i * 6, pick.y - i * 3); await sleep(16); }
      await touch('touchEnd', pick.x + 60, pick.y - 30); await cdp2.detach();
    }
  }
  var r = await play;
  var trace = [];
  cdp.on('Tracing.dataCollected', function (e) { trace = trace.concat(e.value); });
  var done = new Promise(function (res) { cdp.once('Tracing.tracingComplete', res); });
  await cdp.send('Tracing.end'); await done;
  var m1 = metricsMap(await cdp.send('Performance.getMetrics'));
  var byName = {};
  trace.forEach(function (ev) { if (ev.ph !== 'X' || !ev.dur) return; var n = ev.name; byName[n] = (byName[n] || 0) + ev.dur / 1000; });
  var groups = { paint: ['Paint', 'PaintImage', 'RasterTask', 'ImageDecodeTask', 'Decode Image', 'Draw LazyPixelRef', 'GPUTask'], layout: ['Layout', 'UpdateLayoutTree', 'PrePaint', 'HitTest', 'IntersectionObserverController::computeIntersections'], style: ['RecalcStyle', 'UpdateLayoutTree', 'ScheduleStyleRecalculation'], composite: ['CompositeLayers', 'UpdateLayer', 'UpdateLayerTree', 'Commit', 'Layerize'], script: ['FunctionCall', 'EvaluateScript', 'v8.run', 'TimerFire', 'EventDispatch', 'RunMicrotasks', 'V8.GCScavenger', 'MinorGC', 'MajorGC'], animation: ['Animation', 'ComputeIntersections', 'UpdateAnimations'] };
  var summary = {};
  for (var gname in groups) summary[gname] = Math.round(groups[gname].reduce(function (s, n) { return s + (byName[n] || 0); }, 0));
  var top = Object.keys(byName).sort(function (a, b) { return byName[b] - byName[a]; }).slice(0, 10).map(function (n) { return n + ' ' + Math.round(byName[n]) + 'ms'; });
  var dom = await page.evaluate(function () { return { nodes: document.getElementsByTagName('*').length, anims: document.getAnimations().length, items: document.querySelectorAll('.item').length }; });
  return { mode: mode, level: level, frames: r, actionP95: Math.round(r.actionP95 * 10) / 10,
    layouts: Math.round(m1.LayoutCount - m0.LayoutCount), recalcs: Math.round(m1.RecalcStyleCount - m0.RecalcStyleCount),
    layoutMs: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000), styleMs: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000),
    scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000), taskMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000),
    heapMB: Math.round(m1.JSHeapUsedSize / 1048576 * 10) / 10, dom: dom, trace: summary, top: top };
}

async function main() {
  var browser = await chrome.launchChrome();
  try {
    var ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    var page = await ctx.newPage(), errors = [];
    page.on('pageerror', function (e) { errors.push(String(e && e.message || e)); });
    var cdp = await ctx.newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    await page.goto(PAGE); await waitState(page, 'TITLE');
    var out = { tag: TAG, cpu: CPU, seconds: SECONDS, date: new Date().toISOString().slice(0, 19), scenarios: [] };
    out.scenarios.push(await scenario(page, cdp, 'timed', 40, true));
    out.scenarios.push(await scenario(page, cdp, 'relaxed', 24, false));
    out.scenarios.forEach(function (s) {
      console.log(s.mode + ' L' + s.level + ' @ cpu x' + CPU + ', ' + SECONDS + ' s: frames p50 ' + s.frames.p50.toFixed(1) + ' p95 ' + s.frames.p95.toFixed(1) + ' max ' + s.frames.max.toFixed(1) + ' ms, long(>33ms) ' + s.frames.long + '/' + s.frames.frames + ', moves ' + s.frames.moves + ', action p95 ' + s.actionP95 + ' ms');
      console.log('   layouts ' + s.layouts + ' (' + s.layoutMs + ' ms), style recalcs ' + s.recalcs + ' (' + s.styleMs + ' ms), script ' + s.scriptMs + ' ms, tasks ' + s.taskMs + ' ms, heap ' + s.heapMB + ' MB, DOM ' + s.dom.nodes + ' nodes, ' + s.dom.anims + ' animations, ' + s.dom.items + ' items');
      console.log('   trace ms: paint ' + s.trace.paint + ', layout ' + s.trace.layout + ', style ' + s.trace.style + ', composite ' + s.trace.composite + ', script ' + s.trace.script + ' | top: ' + s.top.join(', '));
    });
    if (errors.length) console.log('page errors: ' + errors.join(' | '));
    var dir = path.join(ROOT, 'docs', 'proof'); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'perf-' + TAG + '.json'), JSON.stringify(out, null, 1));
  } finally { await browser.close(); }
}
main().catch(function (e) { console.error(e && e.stack || e); process.exit(1); });
