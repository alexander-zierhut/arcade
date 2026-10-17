// src/ui/coach.js: coach marks (DESIGN 7.6): one sentence per new mechanic, shown once (save.seenTips), with one big
// button. Pauses clock and belts while shown. Browser-only; sets SS.ui.coach.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var ui = SS.ui = SS.ui || {};
  var doc = root.document, el = null, queue = [], onClose = null, current = null;
  function build() {
    if (el) return;
    el = doc.createElement('div'); el.id = 'coach'; el.className = 'coach'; el.hidden = true;
    el.innerHTML = '<div class="coach-card"><div class="coach-hand" aria-hidden="true"></div><p class="coach-text"></p><button class="btn btn-primary" type="button">Alles klar</button></div>';
    doc.getElementById('app').appendChild(el);
    el.querySelector('button').addEventListener('click', function () { dismiss(); });
  }
  /** show(key, text, cb): shows a coach mark now (or queues it behind the current one). cb runs when it is dismissed. */
  function show(key, text, cb) {
    build();
    if (current) { queue.push({ key: key, text: text, cb: cb }); return; }
    current = { key: key, cb: cb };
    el.querySelector('.coach-text').textContent = text;
    el.querySelector('button').textContent = SS.t('ok');
    el.hidden = false;
    if (ui.hooks && ui.hooks.onCoachOpen) ui.hooks.onCoachOpen(key);
  }
  function dismiss() {
    if (!el || !current) return;
    var c = current; current = null; el.hidden = true;
    if (c.cb) c.cb(c.key);
    if (ui.hooks && ui.hooks.onCoachClose) ui.hooks.onCoachClose(c.key);
    var next = queue.shift();
    if (next) show(next.key, next.text, next.cb);
  }
  function isOpen() { return !!current; }
  function clear() { queue = []; if (current) { current = null; el.hidden = true; } }
  ui.coach = { show: show, dismiss: dismiss, isOpen: isOpen, clear: clear };
})(typeof globalThis !== 'undefined' ? globalThis : this);
