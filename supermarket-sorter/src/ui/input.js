// src/ui/input.js: page-level guards for phones (pinch zoom, double-tap zoom, callout, rubber-band scrolling) and the
// keyboard shortcuts outside the board. The board's own pointer handling lives in ui/board.js.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var ui = SS.ui = SS.ui || {};
  var doc = root.document;

  function installGuards() {
    var nonPassive = { passive: false };
    function stop(ev) { ev.preventDefault(); }
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (n) { doc.addEventListener(n, stop, nonPassive); });
    doc.addEventListener('touchmove', function (ev) {
      // let scrollable cards scroll; block everything else (rubber-band, pull-to-refresh)
      var el = ev.target;
      while (el && el !== doc.body) { if (el.classList && el.classList.contains('scroll')) return; el = el.parentNode; }
      ev.preventDefault();
    }, nonPassive);
    doc.addEventListener('dblclick', stop, nonPassive);
    doc.addEventListener('contextmenu', stop, nonPassive);
    // double-tap zoom: iOS ignores user-scalable=no in some versions; swallow fast second taps outside buttons
    var lastTap = 0;
    doc.addEventListener('touchend', function (ev) {
      var now = Date.now();
      if (now - lastTap < 300 && !(ev.target && ev.target.closest && ev.target.closest('button'))) ev.preventDefault();
      lastTap = now;
    }, nonPassive);
  }

  /** installKeys(handler): handler(code) for Escape, KeyP, KeyM, KeyR, KeyH. */
  function installKeys(handler) {
    doc.addEventListener('keydown', function (ev) {
      if (ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (['Escape', 'KeyP', 'KeyM', 'KeyR', 'KeyH', 'Space'].indexOf(ev.code) < 0) return;
      if (handler(ev.code)) ev.preventDefault();
    });
  }

  ui.input = { installGuards: installGuards, installKeys: installKeys };
})(typeof globalThis !== 'undefined' ? globalThis : this);
