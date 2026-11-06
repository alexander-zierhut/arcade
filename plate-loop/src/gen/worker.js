// src/gen/worker.js: the endless-mode level search off the main thread. main.js starts it as a Web Worker; it loads the
// engine and the generator with importScripts and answers one message at a time:
//   { id, cmd: 'init', scripts: [urls] }                                      -> { id, ok }   (loads the engine; first message)
//   { id, cmd: 'search', tier, seed, allow, hardness, candidates, budgetMs }  -> { id, ok, level, hard, candidates, outside, ms }
//   { id, cmd: 'replay', code }                                                -> { id, ok, level, hard, code }
// Progress while searching: { id, progress: n, hard: H }. Errors: { id, ok: false, error }.
// The same module also runs inline (no Worker API): main.js calls PL.search.run(msg, post) directly.
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};
  var isWorker = typeof root.importScripts === 'function' && typeof root.document === 'undefined';

  // In a worker the engine files are loaded on the page's `init` message, which lists their addresses: the site build
  // gives every script a content-hashed name, so the worker cannot know the file names on its own.
  function load(urls) {
    if (PL.generator || !isWorker) return;
    root.importScripts.apply(root, urls);
  }

  function now() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }

  // run(msg, post): executes one command and posts the replies through post(obj). Synchronous; the caller decides the thread.
  function run(msg, post) {
    var gen = PL.generator, t0 = now(), res;
    try {
      if (msg.cmd === 'init') { load(msg.scripts || []); post({ id: msg.id, ok: !!PL.generator }); return; }
      if (!PL.generator) { post({ id: msg.id, ok: false, error: 'engine not loaded' }); return; }
      if (msg.cmd === 'search') {
        res = gen.generate({
          tier: msg.tier, seed: msg.seed, allow: msg.allow, hardness: msg.hardness, look: msg.look || 0, hardest: !!msg.hardest, candidates: msg.candidates || 80,
          budgetMs: msg.budgetMs || 12000, now: now,
          onCandidate: function (n, h) { post({ id: msg.id, progress: n, hard: h }); }
        });
        if (!res) { post({ id: msg.id, ok: false, error: 'no level' }); return; }
        post({ id: msg.id, ok: true, level: res.level, hard: res.hard, candidates: res.candidates || 1, outside: !!res.outside, ms: now() - t0 });
      } else if (msg.cmd === 'replay') {
        res = gen.replay(msg.code);
        if (!res) { post({ id: msg.id, ok: false, error: 'bad code' }); return; }
        post({ id: msg.id, ok: true, level: res.level, hard: res.level.hard, code: res.code, ms: now() - t0 });
      } else {
        post({ id: msg.id, ok: false, error: 'unknown command' });
      }
    } catch (e) {
      post({ id: msg.id, ok: false, error: String(e && e.message || e) });
    }
  }

  PL.search = { run: run };
  if (isWorker) {
    root.onmessage = function (ev) { run(ev.data || {}, function (reply) { root.postMessage(reply); }); };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.search;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
