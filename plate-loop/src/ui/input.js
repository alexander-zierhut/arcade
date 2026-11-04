// src/ui/input.js: canvas pointer -> scene.hit -> onTap(boxIndex). Taps only (short press, no drag), single touch.
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};

  var MAX_MS = 600, MAX_MOVE = 14;
  var handlers = [];   // one entry per attached canvas

  function attach(canvas, onTap, scene) {
    detach(canvas);
    var down = {};           // pointerId -> { x, y, t }
    var count = 0, spoiled = false;

    function pos(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function onDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var p = pos(e);
      if (!down[e.pointerId]) count++;
      down[e.pointerId] = { x: p.x, y: p.y, t: e.timeStamp };
      if (count > 1) spoiled = true;          // multi-touch: never a tap
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    }
    function onMove(e) {
      var d = down[e.pointerId];
      if (!d) return;
      var p = pos(e), dx = p.x - d.x, dy = p.y - d.y;
      if (dx * dx + dy * dy > MAX_MOVE * MAX_MOVE) spoiled = true;
    }
    function end(e, isCancel) {
      var d = down[e.pointerId];
      if (!d) return;
      delete down[e.pointerId];
      count = Math.max(0, count - 1);
      var wasSpoiled = spoiled;
      if (count === 0) spoiled = false;
      if (isCancel || wasSpoiled) return;
      var p = pos(e), dx = p.x - d.x, dy = p.y - d.y;
      if (dx * dx + dy * dy > MAX_MOVE * MAX_MOVE) return;
      if (e.timeStamp - d.t > MAX_MS) return;
      var sc = scene || canvas.plScene || (PL.scene && PL.scene.current);
      if (!sc) return;
      var idx = sc.hit(p.x, p.y);
      if (idx >= 0 && onTap) onTap(idx);
    }
    function onUp(e) { end(e, false); }
    function onCancel(e) { end(e, true); }
    function onCtx(e) { e.preventDefault(); }

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('contextmenu', onCtx);

    handlers.push({
      canvas: canvas,
      off: function () {
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onCancel);
        canvas.removeEventListener('contextmenu', onCtx);
      }
    });
  }

  // detach(canvas) removes that canvas's handlers; detach() removes all
  function detach(canvas) {
    var i;
    for (i = handlers.length - 1; i >= 0; i--) {
      if (!canvas || handlers[i].canvas === canvas) { handlers[i].off(); handlers.splice(i, 1); }
    }
  }

  PL.input = { attach: attach, detach: detach };
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.input;
})(typeof window !== 'undefined' ? window : globalThis);
