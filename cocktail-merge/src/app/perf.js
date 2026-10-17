// src/app/perf.js: frame-time recorder and the debug report export (owner request: a file to send when the game
// feels sluggish). Browser-only; adds CM.app.perf. loop.js calls record() once per frame. The ring buffer keeps
// the last 1800 frames (about 30 s at 60 Hz); the report also carries the environment, settings and game state.
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var app = CM.app = CM.app || {};
  var MAX = 1800, samples = [], longFrames = [], frames = 0, t0 = 0, baseline = Infinity;

  function record(dtMs, workMs, simMs, steps, nowMs) {
    var c = app.ctx, g = c && c.game;
    if (!t0) t0 = nowMs;
    frames++;
    if (dtMs > 3 && dtMs < baseline) baseline = dtMs;          // the display period, from the fastest frame seen
    var s = { t: Math.round(nowMs - t0), dt: Math.round(dtMs * 100) / 100, work: Math.round(workMs * 100) / 100,
      sim: Math.round(simMs * 100) / 100, steps: steps, bodies: g ? g.bodies.length : 0, state: c ? c.state : '' };
    samples.push(s); if (samples.length > MAX) samples.shift();
    if (dtMs > 50 && longFrames.length < 200) longFrames.push(s);
  }
  function pct(arr, key, p) {
    if (!arr.length) return 0;
    var v = arr.map(function (s) { return s[key]; }).sort(function (a, b) { return a - b; });
    return v[Math.min(v.length - 1, Math.floor(p * v.length))];
  }
  function aggregates(arr) {
    var sum = 0; for (var i = 0; i < arr.length; i++) sum += arr[i].dt;
    return { frames: arr.length, fps_est: arr.length ? Math.round(10000 / (sum / arr.length)) / 10 : 0,
      dt_p50: pct(arr, 'dt', 0.5), dt_p95: pct(arr, 'dt', 0.95), dt_p99: pct(arr, 'dt', 0.99), dt_max: pct(arr, 'dt', 1),
      work_p50: pct(arr, 'work', 0.5), work_p95: pct(arr, 'work', 0.95), work_max: pct(arr, 'work', 1),
      sim_p95: pct(arr, 'sim', 0.95), bodies_max: pct(arr, 'bodies', 1) };
  }
  function report() {
    var c = app.ctx || {}, g = c.game, nav = root.navigator || {}, scr = root.screen || {}, cv = root.document && root.document.querySelector('canvas');
    var mem = root.performance && root.performance.memory;
    return {
      kind: 'cocktail-merge debug report', version: 1, exportedAt: new Date().toISOString(), page: root.location ? root.location.href : '',
      env: { userAgent: nav.userAgent, platform: nav.platform, hardwareConcurrency: nav.hardwareConcurrency || null, deviceMemoryGB: nav.deviceMemory || null,
        devicePixelRatio: root.devicePixelRatio, dprCap: c.dprCap, lowFx: !!c.lowFx, viewport: [root.innerWidth, root.innerHeight],
        screen: [scr.width, scr.height], canvasPx: cv ? [cv.width, cv.height] : null, displayPeriodMs: isFinite(baseline) ? baseline : null,
        memoryMB: mem ? { used: Math.round(mem.usedJSHeapSize / 1048576), total: Math.round(mem.totalJSHeapSize / 1048576) } : null,
        reducedMotion: !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) },
      settings: c.save ? JSON.parse(JSON.stringify(c.save)) : null,
      scene: c.bgKey || null, errors: c.errors || {},
      game: g ? { seed: g.seed, mode: g.mode, tick: g.tick, score: g.score, launches: g.launches, merges: g.merges, highestTier: g.highestTier,
        bodies: g.bodies.length, phase: g.phase } : null,
      uptimeS: Math.round((samples.length ? samples[samples.length - 1].t : 0) / 100) / 10, totalFrames: frames,
      aggregates_all: aggregates(samples), aggregates_last10s: aggregates(samples.slice(-600)),
      longFrames: longFrames, samples: samples
    };
  }
  // Downloads the report as a .json file (a Blob link click; works on iOS Safari 15+ and Android browsers).
  function exportReport() {
    var doc = root.document; if (!doc) return null;
    var text = JSON.stringify(report(), null, 1), name = 'cocktail-debug-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    try {
      var blob = new root.Blob([text], { type: 'application/json' }), url = root.URL.createObjectURL(blob);
      var a = doc.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; doc.body.appendChild(a); a.click();
      root.setTimeout(function () { root.URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 1500);
    } catch (e) { if (root.console) root.console.warn('[CM] export failed', e); return null; }
    return name;
  }
  app.perf = { record: record, report: report, exportReport: exportReport, aggregates: aggregates,
    baseline: function () { return baseline; } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
