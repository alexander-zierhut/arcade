// tests/browser/run.js: the browser smoke test for v0.2. Drives the real index.html in the system Chrome (playwright-core)
// through file://, as a phone (390x844, DPR 2, touch). Checks the title, intro and coach marks, a real touch drag, tap-to-move,
// pause/resume, reload + continue, a solver-driven clear with the win card, level 12 timed with moving belts (animations
// running, a real touch take on a moving cell that bars it), bunny collect and spend, the stuck sheet, timeout + +30 s,
// the language toggle, three viewports and frame timing. Screenshots in docs/preview/smoke-*.png. Exits 1 on any failure.
'use strict';
var fs = require('fs');
var path = require('path');
var chrome = require('./chrome.js');
var ROOT = path.resolve(__dirname, '..', '..');
var PAGE = 'file://' + path.join(ROOT, 'index.html');
var OUT = path.join(ROOT, 'docs', 'preview');
var failures = [];
function fail(msg) { failures.push(msg); console.log('  ✗ ' + msg); }
function ok(msg) { console.log('  ✓ ' + msg); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function watch(page, errors) {
  page.on('pageerror', function (e) { errors.push('pageerror: ' + (e && e.message || e)); });
  page.on('console', function (m) { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', function (r) { errors.push('load failed: ' + r.url()); });
}
function state(page) { return page.evaluate(function () { return window.SS && SS.app && SS.app.ctx.state; }); }
async function waitState(page, s, ms) {
  try { await page.waitForFunction(function (s) { return window.SS && SS.app && SS.app.ctx.state === s; }, s, { timeout: ms || 6000, polling: 50 }); return true; } catch (e) { return false; }
}
async function dismissCoach(page) { for (var i = 0; i < 6; i++) { var open = await page.evaluate(function () { return SS.ui.coach && SS.ui.coach.isOpen(); }); if (!open) break; await page.tap('#coach button'); await sleep(250); } }
async function startLevel(page, mode, n) {
  await page.evaluate(function (a) { SS.app.ctx.mode = a.mode; SS.app.loadLevel(a.n); }, { mode: mode, n: n });
  await waitState(page, 'INTRO', 8000);
  await page.tap('button[data-act="intro-go"]');
  await waitState(page, 'PLAY', 4000);
  await dismissCoach(page);
  await sleep(300);
}
function slotCenter(page, ci, slot) {
  return page.evaluate(function (a) {
    var g = SS.ui.board.geometry(), r = document.getElementById('board').getBoundingClientRect(), c = g.comps[a.ci];
    return { x: r.left + c.x + (a.slot + 0.5) * g.slotW, y: r.top + c.y + c.h - 12 - g.slotW * 0.5 };
  }, { ci: ci, slot: slot });
}
async function touchDrag(page, from, to, steps) {
  var cdp = await page.context().newCDPSession(page);
  async function touch(type, x, y) { await cdp.send('Input.dispatchTouchEvent', { type: type, touchPoints: type === 'touchEnd' ? [] : [{ x: x, y: y, radiusX: 4, radiusY: 4, force: 1 }] }); }
  await touch('touchStart', from.x, from.y);
  steps = steps || 12;
  for (var i = 1; i <= steps; i++) { await touch('touchMove', from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps); await sleep(16); }
  await touch('touchEnd', to.x, to.y);
  await cdp.detach();
}
async function solveThroughApp(page, maxMs) {
  return page.evaluate(function (maxMs) {
    return new Promise(function (resolve) {
      var t0 = performance.now(), moves = 0;
      var iv = setInterval(function () {
        var g = SS.app.ctx.game;
        if (!g || g.status !== 'playing' || performance.now() - t0 > maxMs) { clearInterval(iv); return resolve({ moves: moves, status: g && g.status }); }
        var b = g.board, collected = false;
        for (var id in b.items) if (b.items[id].type === '*') { var ce = SS.app.onCollect(+id); if (ce) { SS.ui.board.apply(ce, false); collected = true; break; } }
        if (collected) return;
        var m = SS.solver.hint(b, 20000);
        if (!m) { clearInterval(iv); return resolve({ moves: moves, status: 'nohint' }); }
        var ev = SS.app.onDrop(m.item, m.to, SS.board.firstFree(b, m.to));
        if (ev) { SS.ui.board.apply(ev, false); moves += 1; }
      }, 70);
    });
  }, maxMs || 30000);
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  var browser = await chrome.launchChrome();
  try {
    var ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    var page = await ctx.newPage(), errors = [];
    watch(page, errors);
    await page.goto(PAGE);
    if (await waitState(page, 'TITLE', 6000)) ok('boots to TITLE'); else fail('did not reach TITLE (state ' + (await state(page)) + ')');
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, 'smoke-title.png') });

    // ---- relaxed L1: intro, coach, real drag ----
    await page.tap('[data-act="play-relaxed"]');
    if (await waitState(page, 'INTRO', 8000)) ok('relaxed starts with the intro card'); else fail('INTRO not reached');
    var introTitle = await page.evaluate(function () { return document.querySelector('#ov-intro .js-title').textContent; });
    if (/Level 1/.test(introTitle)) ok('intro card shows the level'); else fail('intro title: ' + introTitle);
    await page.tap('button[data-act="intro-go"]');
    await waitState(page, 'PLAY', 4000);
    var coachOpen = await page.evaluate(function () { return SS.ui.coach.isOpen(); });
    if (coachOpen) ok('coach mark shown on level 1'); else fail('no coach mark');
    await page.screenshot({ path: path.join(OUT, 'smoke-coach.png') });
    await dismissCoach(page); await sleep(300);
    var before = await page.evaluate(function () { return { moves: SS.app.ctx.game.moves }; });
    var mv = await page.evaluate(function () { var m = SS.solver.hint(SS.app.ctx.game.board, 20000); var it = SS.app.ctx.game.board.items[m.item]; return { item: m.item, fromComp: it.comp, fromSlot: it.slot, to: m.to, slot: SS.board.firstFree(SS.app.ctx.game.board, m.to) }; });
    await touchDrag(page, await slotCenter(page, mv.fromComp, mv.fromSlot), await slotCenter(page, mv.to, mv.slot));
    await sleep(500);
    var after = await page.evaluate(function (id) { var it = SS.app.ctx.game.board.items[id]; return { comp: it ? it.comp : -1, moves: SS.app.ctx.game.moves }; }, mv.item);
    if ((after.comp === mv.to || after.comp === -1) && after.moves === before.moves + 1) ok('touch drag moved an item'); else fail('drag: ' + JSON.stringify({ mv: mv, after: after }));
    await page.screenshot({ path: path.join(OUT, 'smoke-play.png') });

    // ---- tap-to-move ----
    if (await page.evaluate(function () { return SS.app.ctx.game.status === 'playing'; })) {
      var mv2 = await page.evaluate(function () { var m = SS.solver.hint(SS.app.ctx.game.board, 20000); if (!m) return null; var it = SS.app.ctx.game.board.items[m.item]; return { item: m.item, fromComp: it.comp, fromSlot: it.slot, to: m.to, slot: SS.board.firstFree(SS.app.ctx.game.board, m.to) }; });
      if (mv2) {
        await page.touchscreen.tap((await slotCenter(page, mv2.fromComp, mv2.fromSlot)).x, (await slotCenter(page, mv2.fromComp, mv2.fromSlot)).y); await sleep(150);
        var sel = await page.evaluate(function () { return document.querySelectorAll('.item.sel').length; });
        var tc = await slotCenter(page, mv2.to, mv2.slot); await page.touchscreen.tap(tc.x, tc.y); await sleep(500);
        var after2 = await page.evaluate(function (a) { var it = SS.app.ctx.game.board.items[a.item]; return { comp: it ? it.comp : -1, moves: SS.app.ctx.game.moves }; }, mv2);
        if (sel === 1 && (after2.comp === mv2.to || after2.comp === -1) && after2.moves === before.moves + 2) ok('tap-to-move works'); else fail('tap-to-move: sel=' + sel + ' ' + JSON.stringify(after2));
      }
    }
    // ---- pause / resume / reload + continue ----
    await page.tap('#btn-pause');
    if (await waitState(page, 'PAUSE', 2000)) ok('pause'); else fail('pause');
    await page.screenshot({ path: path.join(OUT, 'smoke-pause.png') });
    await page.tap('[data-act="resume"]');
    if (await waitState(page, 'PLAY', 2000)) ok('resume'); else fail('resume');
    var hashBefore = await page.evaluate(function () { return SS.board.hash(SS.app.ctx.game.board) + '|' + SS.app.ctx.game.moves; });
    await page.reload(); await waitState(page, 'TITLE', 6000);
    await page.tap('[data-act="play-relaxed"]');
    if (await waitState(page, 'INTRO', 8000)) ok('stored board offered again after reload'); else fail('no INTRO after reload');
    await page.tap('button[data-act="intro-go"]'); await waitState(page, 'PLAY', 4000); await dismissCoach(page); await sleep(200);
    var hashAfter = await page.evaluate(function () { return SS.board.hash(SS.app.ctx.game.board) + '|' + SS.app.ctx.game.moves; });
    if (hashAfter === hashBefore) ok('reload restores the exact board and move count'); else fail('continue mismatch\n   ' + hashBefore + '\n   ' + hashAfter);

    // ---- solver clears L1 through the real app; win card; next level ----
    var res = await solveThroughApp(page, 20000);
    if (res.status === 'won') ok('solver cleared level 1 through the app (' + res.moves + ' moves)'); else fail('level 1 not cleared: ' + JSON.stringify(res));
    await sleep(1500);
    if (await page.evaluate(function () { return !document.getElementById('ov-win').hidden; })) ok('win card shown'); else fail('win card not shown');
    await page.screenshot({ path: path.join(OUT, 'smoke-win.png') });
    await page.tap('[data-act="next"]');
    if (await waitState(page, 'INTRO', 8000)) ok('next level intro'); else fail('next level');
    var lvl = await page.evaluate(function () { return SS.app.ctx.game.level.n; });
    if (lvl === 2) ok('level 2 loads'); else fail('level after next: ' + lvl);
    var reached = await page.evaluate(function () { return SS.app.ctx.save.records.relaxed.reached; });
    if (reached === 2) ok('progress recorded (reached 2)'); else fail('reached ' + reached);

    // ---- relaxed L3: layers reveal ----
    await startLevel(page, 'relaxed', 3);
    var backs = await page.evaluate(function () { return document.querySelectorAll('.comp.has-back').length; });
    if (backs >= 2) ok('level 3 shows darkened back layers (' + backs + ')'); else fail('no back layers at L3: ' + backs);
    await page.screenshot({ path: path.join(OUT, 'smoke-layers.png') });
    res = await solveThroughApp(page, 40000);
    if (res.status === 'won') ok('solver cleared level 3 with reveals (' + res.moves + ' moves)'); else fail('level 3: ' + JSON.stringify(res));

    // ---- relaxed L6: bunny collect + spend ----
    await startLevel(page, 'relaxed', 6);
    var bunnyPlaced = await page.evaluate(function () { var b = SS.app.ctx.game.board; return b.comps.some(function (c) { return c.back.some(function (l) { return l.t.indexOf('*') >= 0; }); }); });
    if (bunnyPlaced) ok('level 6 has a bunny in a back layer'); else fail('no bunny at L6');
    res = await solveThroughApp(page, 40000);
    if (res.status === 'won') ok('solver cleared level 6 (bunny collected on the way)'); else fail('level 6: ' + JSON.stringify(res));

    // ---- relaxed L7: lock ----
    await startLevel(page, 'relaxed', 7);
    var locks = await page.evaluate(function () { return document.querySelectorAll('.lock').length; });
    if (locks === 1) ok('level 7 shows one chained compartment'); else fail('locks at L7: ' + locks);
    await page.screenshot({ path: path.join(OUT, 'smoke-lock.png') });

    // ---- timed L12: moving belts, real take, bars ----
    await startLevel(page, 'timed', 12);
    var belts = await page.evaluate(function () { return { belts: document.querySelectorAll('.belt').length, cells: document.querySelectorAll('.cell').length, anims: document.getAnimations().length, speed: SS.app.ctx.game.level.beltSpeed100 }; });
    if (belts.belts === 2 && belts.anims >= belts.cells - 2 && belts.speed === 20) ok('timed level 12: two belts, ' + belts.cells + ' cells, ' + belts.anims + ' running animations'); else fail('belts: ' + JSON.stringify(belts));
    var cellItems = await page.evaluate(function () { var b = SS.app.ctx.game.board, model = 0; b.belts.forEach(function (bt) { bt.cells.forEach(function (c) { if (c.item) model += 1; }); }); return { dom: document.querySelectorAll('.cell .item').length, model: model }; });
    if (cellItems.dom === cellItems.model && cellItems.model > 0) ok('every belt cell with a product shows its sprite (' + cellItems.dom + ')'); else fail('belt sprites: ' + JSON.stringify(cellItems));
    await page.screenshot({ path: path.join(OUT, 'smoke-belts.png') });
    // find a visible belt cell with an item and a compartment with a free slot; touch-drag it
    var pick = await page.evaluate(function () {
      var b = SS.app.ctx.game.board, rr = document.getElementById('board').getBoundingClientRect(), g = SS.ui.board.geometry();
      for (var bi = 0; bi < b.belts.length; bi++) for (var k = 0; k < b.belts[bi].cells.length; k++) {
        var cell = b.belts[bi].cells[k]; if (cell.barred || !cell.item || b.items[cell.item].type === '*') continue;
        var r = SS.ui.belts.cellRect(bi, k); if (!r) continue;
        if (r.y < 10 || r.y + r.h > g.rack.h - 10) continue;
        for (var ci = 0; ci < b.comps.length; ci++) if (SS.board.canMove(b, cell.item, ci)) { var c = g.comps[ci], s = SS.board.firstFree(b, ci); return { item: cell.item, bi: bi, k: k, from: { x: rr.left + r.x + r.w / 2, y: rr.top + r.y + r.h / 2 }, to: { x: rr.left + c.x + (s + 0.5) * g.slotW, y: rr.top + c.y + c.h - 12 - g.slotW * 0.5 }, ci: ci }; }
      }
      return null;
    });
    if (!pick) fail('no belt pick available');
    else {
      await touchDrag(page, pick.from, pick.to, 14); await sleep(600);
      var took = await page.evaluate(function (a) { var b = SS.app.ctx.game.board, it = b.items[a.item]; return { at: it ? it.at : 'gone', comp: it ? it.comp : -1, barred: b.belts[a.bi].cells[a.k].barred, cls: document.querySelector('.belt-' + b.belts[a.bi].id + ' .cell[data-k="' + a.k + '"]').className, started: SS.app.ctx.game.started }; }, pick);
      if ((took.at === 'c' && took.comp === pick.ci) || took.at === 'gone') ok('real touch take from a moving belt cell'); else fail('take: ' + JSON.stringify(took));
      if (took.barred && /barred/.test(took.cls)) ok('the taken cell is barred'); else fail('bar: ' + JSON.stringify(took));
      if (took.started) ok('the clock started on the first touch'); else fail('clock not started');
    }
    // frame timing while the solver plays part of the level with belts moving
    var perf = await page.evaluate(function () {
      return new Promise(function (resolve) {
        var frames = [], last = performance.now(), n = 0;
        function raf(t) { frames.push(t - last); last = t; if (n < 240) { n += 1; requestAnimationFrame(raf); } else { frames.sort(function (a, b) { return a - b; }); resolve({ p50: frames[Math.floor(frames.length * 0.5)], p95: frames[Math.floor(frames.length * 0.95)], max: frames[frames.length - 1] }); } }
        requestAnimationFrame(raf);
        var iv = setInterval(function () { var g = SS.app.ctx.game; if (!g || g.status !== 'playing') { clearInterval(iv); return; } var b = g.board; for (var id in b.items) if (b.items[id].type === '*') { var ce = SS.app.onCollect(+id); if (ce) { SS.ui.board.apply(ce, false); return; } } var m = SS.solver.hint(b, 10000); if (!m) { clearInterval(iv); return; } var ev = SS.app.onDrop(m.item, m.to, SS.board.firstFree(b, m.to)); if (ev) SS.ui.board.apply(ev, false); }, 120);
        setTimeout(function () { clearInterval(iv); }, 4500);
      });
    });
    console.log('    frame intervals with moving belts (headless): p50 ' + perf.p50.toFixed(1) + ' ms, p95 ' + perf.p95.toFixed(1) + ' ms, max ' + perf.max.toFixed(1) + ' ms');
    if (perf.p95 < 40) ok('p95 frame interval under 40 ms'); else fail('p95 frame interval ' + perf.p95.toFixed(1) + ' ms');

    // ---- v0.3: one product size everywhere (rack, side shelves, bottom shelf); v0.3.3: one HUD row, nothing under the board ----
    await startLevel(page, 'timed', 40);
    var sizes = await page.evaluate(function () {
      var byType = {}, bad = [];
      Array.prototype.forEach.call(document.querySelectorAll('#items .item, .cell .item'), function (el) { var t = el.getAttribute('data-type'), w = el.style.width; if (!t) return; if (byType[t] && byType[t] !== w) bad.push(t + ' ' + byType[t] + ' vs ' + w); byType[t] = w; });
      var g = SS.ui.board.geometry(), hud = document.getElementById('hud').getBoundingClientRect(), board = document.getElementById('board').getBoundingClientRect();
      return { bad: bad, types: Object.keys(byType).length, hudH: hud.height, hudBottom: hud.bottom, boardTop: board.top, boardBottom: board.bottom, vh: innerHeight, vw: innerWidth, slotW: g.slotW, hasH: g.hasH, hW: g.belts.H && g.belts.H.w, boardW: g.w, sideCells: g.belts.L && g.belts.L.Wv, rows: g.rows };
    });
    if (!sizes.bad.length && sizes.types > 5) ok('timed L40: every product has one tile size on rack, side shelves and bottom shelf (' + sizes.types + ' types, slot ' + sizes.slotW.toFixed(1) + ' px)'); else fail('tile sizes differ: ' + sizes.bad.join(', '));
    // the board sits between the band and the bottom edge and is limited by one of them: it spans the width, or it runs down to the edge
    var limited = sizes.boardW >= sizes.vw - 10 || sizes.boardBottom >= sizes.vh - 12;
    if (sizes.hudH <= 60 && sizes.boardTop >= sizes.hudBottom + 4 && sizes.boardBottom <= sizes.vh - 4 && limited) ok('one HUD row (' + sizes.hudH + ' px) above, nothing below the board (' + sizes.boardTop.toFixed(0) + '..' + sizes.boardBottom.toFixed(0) + ' of ' + sizes.vh + ')'); else fail('layout: ' + JSON.stringify(sizes));
    if (sizes.sideCells === sizes.rows && sizes.hW === sizes.boardW) ok('side columns show one cell per rack row (' + sizes.rows + ') and the bottom shelf spans the cabinet'); else fail('cabinet: ' + JSON.stringify(sizes));
    if (sizes.boardW >= sizes.vw - 10 && sizes.slotW >= 42) ok('at 390x844 the cabinet with belts and bottom shelf spans the width (' + sizes.boardW.toFixed(0) + ' of ' + sizes.vw + ' px, slot ' + sizes.slotW.toFixed(1) + ' px; was 36 in v0.2, 40 in v0.3)'); else fail('cabinet width ' + sizes.boardW + ' of ' + sizes.vw + ', slot ' + sizes.slotW);
    // forgiving drop: release the finger in the gap just below the target compartment, the item still lands there
    var fg = await page.evaluate(function () {
      var b = SS.app.ctx.game.board, g = SS.ui.board.geometry(), r = document.getElementById('board').getBoundingClientRect(), m = SS.solver.hint(b, 20000), it = m && b.items[m.item], to = m && m.to;
      if (!it || it.at !== 'c') { it = null; for (var id in b.items) { var x = b.items[id]; if (x.at !== 'c' || x.type === '*' || !SS.board.isOpen(b, x.comp)) continue; for (var ci = 0; ci < b.comps.length; ci++) if (ci !== x.comp && SS.board.canMove(b, +id, ci)) { it = x; to = ci; break; } if (it) break; } }
      if (!it) return null;
      var c = g.comps[to];
      return { item: it.id, fromComp: it.comp, fromSlot: it.slot, to: to, drop: { x: r.left + c.x + c.w / 2, y: r.top + c.y + c.h + 2 } };
    });
    if (fg) {
      var movesBefore = await page.evaluate(function () { return SS.app.ctx.game.moves; });
      await touchDrag(page, await slotCenter(page, fg.fromComp, fg.fromSlot), fg.drop, 12); await sleep(500);
      var landed = await page.evaluate(function (a) { var it = SS.app.ctx.game.board.items[a.item]; return { comp: it ? it.comp : -1, moves: SS.app.ctx.game.moves }; }, fg);
      if ((landed.comp === fg.to || landed.comp === -1) && landed.moves === movesBefore + 1) ok('a drop released just below the compartment (on the plank gap) still lands in it'); else fail('forgiving drop: ' + JSON.stringify({ fg: fg, landed: landed }));
    } else fail('no rack move available for the forgiving-drop check');
    // turbo level 27: belts at least 1.08 cells/s (v0.3.2, 40% slower than the 1.8 of v0.3)
    var turbo = await page.evaluate(function () { var lv = SS.levels.get('timed', 27, SS.catalog); return { turbo: lv.turbo, v: lv.beltSpeed100 }; });
    if (turbo.turbo && turbo.v >= 108 && turbo.v <= 180) ok('level 27 is a turbo level with ' + turbo.v / 100 + ' cells/s'); else fail('turbo: ' + JSON.stringify(turbo));

    // ---- timeout + extend + serie ----
    var lvlBeforeTimeout = await page.evaluate(function () { return SS.app.ctx.game.level.n; });
    await page.evaluate(function () { SS.app.ctx.game.timeLeftMs = 1200; SS.game.start(SS.app.ctx.game); });
    await sleep(2500);
    if ((await state(page)) === 'TIMEOUT' && await page.evaluate(function () { return !document.getElementById('ov-timeout').hidden; })) ok('timeout card with +30 s'); else fail('timeout state ' + (await state(page)));
    await page.screenshot({ path: path.join(OUT, 'smoke-timeout.png') });
    await page.tap('[data-act="extend"]');
    if (await waitState(page, 'PLAY', 2000) && await page.evaluate(function () { return SS.app.ctx.game.timeLeftMs === 30000; })) ok('+30 s resumes play'); else fail('extend');
    await page.evaluate(function () { SS.app.ctx.game.timeLeftMs = 800; });
    await sleep(2200);
    if ((await state(page)) === 'LOSE' && await page.evaluate(function () { return !document.getElementById('ov-serie').hidden; })) ok('second timeout banks the Serie'); else fail('serie card: state ' + (await state(page)));
    await page.screenshot({ path: path.join(OUT, 'smoke-serie.png') });
    await page.tap('[data-act="retry"]');
    if (await waitState(page, 'INTRO', 8000) && (await page.evaluate(function () { return SS.app.ctx.game.level.n; })) === lvlBeforeTimeout) ok('the same level restarts, progress kept'); else fail('retry after serie');

    // ---- stuck sheet (constructed board) ----
    await page.evaluate(function () {
      var lv = { n: 99, tag: 'normal', shape: 'G', rows: 3, cols: 1, comps: [{ layers: [['a', 'b', 'c']], row: 0, col: 0 }, { layers: [['a', 'b', 'c']], row: 1, col: 0 }, { layers: [['a', 'b', null]], row: 2, col: 0 }], belts: [{ id: 'L', cells: ['c'] }], par: 3, timeMs: 0, types: ['a', 'b', 'c'], mode: 'relaxed', witness: [] };
      SS.app.ctx.mode = 'relaxed'; SS.app.ctx.levelNo = 99; SS.app.ctx.game = SS.game.createGame(lv, 'relaxed'); SS.ui.hud.reset(); SS.ui.board.setGame(SS.app.ctx.game, {}); SS.app.setState('PLAY'); SS.ui.board.setEnabled(true);
      var b = SS.app.ctx.game.board, ev = SS.app.onDrop(b.belts[0].cells[0].item, 2, 2); SS.ui.board.apply(ev, false);
    });
    await sleep(400);
    if (await page.evaluate(function () { return !document.getElementById('ov-stuck').hidden; })) ok('stuck sheet appears when the rack is full'); else fail('no stuck sheet');
    await page.screenshot({ path: path.join(OUT, 'smoke-stuck.png') });
    await page.tap('#ov-stuck [data-act="undo"]'); await sleep(300);
    if (await page.evaluate(function () { return document.getElementById('ov-stuck').hidden && SS.app.ctx.game.moves === 1 && SS.board.totalFree(SS.app.ctx.game.board) === 1; })) ok('undo from the stuck sheet restores the board'); else fail('undo from stuck');

    // ---- progress export / import round trip (settings buttons exist; export has a version; import restores after a wipe) ----
    await page.reload(); await waitState(page, 'TITLE', 6000);
    await page.tap('[data-act="settings"]'); await sleep(200);
    var btns = await page.evaluate(function () { return !!document.getElementById('btn-export') && !!document.getElementById('btn-import'); });
    if (btns) ok('settings show export and import buttons'); else fail('export/import buttons missing');
    var exp = await page.evaluate(function () { var t = SS.ui.storage.exportAll(); var o = JSON.parse(t); return { text: t, app: o.app, format: o.format, version: o.version, saveVersion: o.saveVersion, reached: o.save.records.relaxed.reached }; });
    if (exp.app === 'supermarket-sorter' && exp.format >= 1 && exp.version === (await page.evaluate(function () { return SS.config.VERSION; })) && exp.saveVersion >= 2) ok('export carries app, format, version ' + exp.version + ' and save version ' + exp.saveVersion); else fail('export header: ' + JSON.stringify(exp));
    // a fresh browser context = a new player: import there (a wipe in the same page would be undone by the save-on-hide)
    var ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    var page2 = await ctx2.newPage(); watch(page2, errors);
    await page2.goto(PAGE); await waitState(page2, 'TITLE', 6000);
    var fresh = await page2.evaluate(function () { return SS.app.ctx.save.records.relaxed.reached; });
    var imported = await page2.evaluate(function (t) { return SS.main.importProgressText(t) && SS.app.ctx.save.records.relaxed.reached; }, exp.text);
    if (fresh === 1 && imported === exp.reached && exp.reached >= 2) ok('import restores the progress for a new player (relaxed level ' + imported + ')'); else fail('import: fresh=' + fresh + ' imported=' + imported + ' expected=' + exp.reached);
    await page2.reload(); await waitState(page2, 'TITLE', 6000);
    var kept = await page2.evaluate(function () { return SS.app.ctx.save.records.relaxed.reached; });
    if (kept === exp.reached) ok('imported progress persists across a reload'); else fail('after reload: ' + kept);
    var fixture = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'export-v' + (await page.evaluate(function () { return SS.config.VERSION; })) + '.json'), 'utf8');
    var ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    var page3 = await ctx3.newPage(); watch(page3, errors);
    await page3.goto(PAGE); await waitState(page3, 'TITLE', 6000);
    var fx = await page3.evaluate(function (t) { return SS.main.importProgressText(t) && SS.app.ctx.save.records.timed.best; }, fixture);
    if (fx === 3900) ok('the release fixture imports in the browser'); else fail('fixture import: ' + fx);
    await ctx2.close(); await ctx3.close();

    // ---- debug entry: ?level=34&mode=timed loads the level and records nothing ----
    var ctx4 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    var page4 = await ctx4.newPage(); watch(page4, errors);
    await page4.goto(PAGE + '?level=34&mode=timed');
    var dbg = await waitState(page4, 'INTRO', 15000) && await page4.evaluate(function () { return SS.app.ctx.debug && SS.app.ctx.game.level.n === 34 && SS.app.ctx.mode === 'timed'; });
    if (dbg) ok('?level=34&mode=timed opens level 34 in test mode'); else fail('debug entry: state ' + (await state(page4)));
    await page4.tap('button[data-act="intro-go"]'); await waitState(page4, 'PLAY', 4000); await dismissCoach(page4);
    await page4.evaluate(function () { var g = SS.app.ctx.game; var m = SS.solver.hint(g.board, 20000); if (m) { var ev = SS.app.onDrop(m.item, m.to, SS.board.firstFree(g.board, m.to)); if (ev) SS.ui.board.apply(ev, false); } });
    await sleep(300);
    var dbgSaved = await page4.evaluate(function () { return { run: SS.ui.storage.loadRun('timed'), reached: SS.app.ctx.save.records.timed.reached }; });
    if (!dbgSaved.run && dbgSaved.reached === 1) ok('test mode stores no board and no progress'); else fail('test mode leaked into the save: ' + JSON.stringify(dbgSaved));
    await ctx4.close();
    // ---- what's new: a player with progress sees the card once; the NEU badge goes away ----
    var ctx5 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    var page5 = await ctx5.newPage(); watch(page5, errors);
    await page5.goto(PAGE); await waitState(page5, 'TITLE', 6000);
    await page5.evaluate(function (t) { SS.main.importProgressText(t); SS.app.ctx.save.seenVersion = ''; SS.app.writeSave(); }, fixture);
    await page5.reload(); await waitState(page5, 'TITLE', 6000); await sleep(400);
    var wn = await page5.evaluate(function () { return !document.getElementById('ov-whatsnew').hidden; });
    if (wn) ok('what\'s-new card opens once for a player with progress'); else fail('what\'s-new card not shown');
    await page5.tap('#ov-whatsnew [data-act="close"]'); await sleep(300);
    var wn2 = await page5.evaluate(function () { return { seen: SS.app.ctx.save.seenVersion, badgeHidden: document.querySelector('.new-badge').hidden }; });
    if (wn2.seen === (await page.evaluate(function () { return SS.config.VERSION; })) && wn2.badgeHidden) ok('closing it records the version and hides the NEU badge'); else fail('what\'s-new close: ' + JSON.stringify(wn2));
    await ctx5.close();

    // ---- language + viewports ----
    await page.evaluate(function () { SS.main.setLang('de'); });
    var de = await page.evaluate(function () { return document.querySelector('[data-act="play-timed"]').textContent; });
    if (/Gegen die Zeit/.test(de)) ok('language toggle to German'); else fail('language toggle: ' + de);
    await page.evaluate(function () { SS.main.setLang('en'); });
    for (var i = 0; i < 2; i++) {
      var vp = [{ width: 360, height: 640 }, { width: 1280, height: 800 }][i];
      await page.setViewportSize(vp); await page.reload(); await waitState(page, 'TITLE', 6000); await sleep(300);
      var fit = await page.evaluate(function () { var r = document.querySelector('[data-act="play-relaxed"]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; });
      if (fit) ok('title fits at ' + vp.width + 'x' + vp.height); else fail('title does not fit at ' + vp.width + 'x' + vp.height);
      await page.screenshot({ path: path.join(OUT, 'smoke-title-' + vp.width + 'x' + vp.height + '.png') });
    }
    if (errors.length) errors.forEach(function (e) { fail(e); }); else ok('no page errors');

    // ---- layout at four phone widths (one-row HUD in both modes, combo line, pause card, title) ----
    await require('./layout.js').run(browser, PAGE, { ok: ok, fail: fail, waitState: waitState });
  } finally { await browser.close(); }
  console.log(failures.length ? failures.length + ' failure(s)' : 'all browser checks passed');
  if (failures.length) process.exitCode = 1;
}
main().catch(function (e) { console.error(e && e.stack || e); process.exit(1); });
