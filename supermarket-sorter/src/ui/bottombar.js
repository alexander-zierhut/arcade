// src/ui/bottombar.js: the slim action row at the bottom: Rückgängig, Goldhase (with count, arms a spend), Tipp (relaxed
// only). Pause lives in the HUD. Browser-only; sets SS.ui.bottombar.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var ui = SS.ui = SS.ui || {};
  var doc = root.document, el = {}, handlers = {};
  function init(h) {
    handlers = h || {};
    el.bar = doc.getElementById('bottombar'); el.undo = doc.getElementById('btn-undo'); el.bunny = doc.getElementById('btn-bunny'); el.hint = doc.getElementById('btn-hint');
    el.bunnyCount = doc.getElementById('bunny-count');
    el.undo.addEventListener('click', function () { if (handlers.onUndo) handlers.onUndo(); });
    el.bunny.addEventListener('click', function () { if (handlers.onBunny) handlers.onBunny(); });
    el.hint.addEventListener('click', function () { if (handlers.onHint) handlers.onHint(); });
  }
  function show(on) { if (el.bar) el.bar.hidden = !on; }
  function height() { return el.bar && !el.bar.hidden ? el.bar.offsetHeight : 0; }
  var last = {};
  function set(key, value, fn) { if (last[key] === value) return; last[key] = value; fn(value); }
  /** update(g): enables what the state allows (writes the DOM only when a value changed: it runs every frame in timed play). */
  function update(g) {
    if (!el.bar || !g) return;
    set('undo', !(g.undo && g.undo.length) || g.status === 'won', function (v) { el.undo.disabled = v; });
    var n = g.board.bunnies;
    set('n', n, function (v) { el.bunnyCount.textContent = String(v); el.bunny.classList.toggle('has', v > 0); });
    set('bunnyOff', n < 1 || g.status !== 'playing', function (v) { el.bunny.disabled = v; });
    set('hintHidden', g.mode !== 'relaxed', function (v) { el.hint.hidden = v; });
    set('hintOff', g.status !== 'playing', function (v) { el.hint.disabled = v; });
  }
  var armed = false;
  function setArmed(on) { armed = !!on; if (el.bunny) el.bunny.classList.toggle('armed', armed); }
  function isArmed() { return armed; }
  function pulse(name) { var b = el[name]; if (!b) return; b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); }
  function applyLang() {
    var t = SS.t;
    if (el.undo) el.undo.querySelector('.lbl').textContent = t('undo');
    if (el.bunny) el.bunny.querySelector('.lbl').textContent = t('bunny');
    if (el.hint) el.hint.querySelector('.lbl').textContent = t('hint');
  }
  ui.bottombar = { init: init, show: show, update: update, setArmed: setArmed, isArmed: isArmed, pulse: pulse, applyLang: applyLang, height: height };
})(typeof globalThis !== 'undefined' ? globalThis : this);
