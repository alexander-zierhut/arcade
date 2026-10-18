// src/ui/boardfx.js: animates the events of the rules on the board DOM (DESIGN 7.5, 8.4). The model has already changed
// when apply() runs; this file only moves, pops, reveals, bars, chains and sparkles. Browser-only; sets SS.ui.boardfx.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var ui = SS.ui = SS.ui || {};
  var C = SS.config || {};
  var doc = root.document;
  function I() { return ui.board.shared; }
  function X() { return I().X; }

  /** apply(events, dropped): dropped = the first move came from a real drag (snaps faster). */
  function apply(events, dropped) {
    var x = X(), moveMs = C.MOVE_MS || 220, delay = 0, i;
    if (!x.game) return;
    for (i = 0; i < events.length; i++) {
      var e = events[i];
      switch (e.type) {
        case 'move': delay = flyMove(e, dropped ? (C.SPRING_MS || 180) : moveMs); break;
        case 'take': delay = flyTake(e, dropped ? (C.SPRING_MS || 180) : moveMs); break;
        case 'bar': (function (ev) { I().later(function () { ui.belts.bar(ev.beltIndex, ev.cell); }, 120); })(e); break;
        case 'match': (function (m, d) { I().later(function () { popMatch(m); }, d); })(e, delay); delay += 60; break;
        case 'reveal': (function (r, d) { I().later(function () { reveal(r); }, d + 120); })(e, delay); delay += 160; break;
        case 'lockTick': (function (l) { I().later(function () { lockTick(l); }, 200); })(e); break;
        case 'unlock': (function (l) { I().later(function () { unlock(l); }, 250); })(e); break;
        case 'beltAppear': (function (b) { I().later(function () { ui.belts.appear(b.beltIndex); }, 300); })(e); break;
        case 'sweep': (function (s, d) { I().later(function () { sweep(s); }, d + 150); })(e, delay); delay += 300; break;
        case 'collect': collect(e); break;
        case 'spend': spend(e); delay = 450; break;
        case 'warnSpace': I().later(warnSpace, delay + 250); break;
        case 'undo': I().later(function () { ui.board.rebuild(); }, 0); break;
        case 'cleared': (function (d) { I().later(celebrate, d + 200); })(e, delay); break;
        case 'beltSpeed': ui.belts.setRate(e.rate); break;
        default: break;
      }
    }
    if (x.game && x.game.mode === 'timed' && SS.rules) ui.belts.setRate(SS.rules.rampRate(x.game));
    if (I().syncShadows) { I().later(I().syncShadows, 0); I().later(I().syncShadows, delay + 400); }
  }
  function flyMove(e, ms) {
    var x = X(), el = x.els[e.item]; if (!el) return 0;
    el.style.setProperty('--move-ms', ms + 'ms'); el.classList.remove('drag', 'sel', 'hand');
    I().place(el, e.to, e.toSlot);
    I().later(function () { el.classList.add('land'); I().later(function () { el.classList.remove('land'); }, 260); }, ms);
    return ms;
  }
  function flyTake(e, ms) {
    var x = X(), el = x.els[e.item]; if (!el) return 0;
    if (el.parentNode !== x.itemsEl) {                               // not dragged (hint or bot): start from the cell's current place
      var tile = parseFloat(el.style.width), r = ui.belts.itemRect(e.beltIndex, e.cell, tile);
      el.style.transition = 'none'; if (r) el.style.transform = 'translate3d(' + r.x + 'px,' + r.y + 'px,0)';
      x.itemsEl.appendChild(el); void el.offsetWidth; el.style.transition = '';
    }
    el._beltHome = null; ui.belts.reserve(e.beltIndex, e.cell, false);
    el.style.setProperty('--move-ms', ms + 'ms'); el.classList.remove('drag', 'sel', 'hand');
    I().place(el, e.to, e.toSlot);
    I().later(function () { el.classList.add('land'); I().later(function () { el.classList.remove('land'); }, 260); }, ms);
    return ms;
  }
  function popMatch(m) {
    var x = X(), cr = I().compRect(m.comp), cx = cr.x + cr.w / 2, cy = cr.y + cr.h / 2;
    I().flashComp(m.comp, '#FFF6B8', 350);
    m.items.forEach(function (id, k) {
      var el = x.els[id]; if (!el) return;
      var tile = parseFloat(el.style.width), p = I().slotPos(m.comp, m.slots[k], tile);
      if (el.classList.contains('sil')) {                        // colour in before the pop (R-S2)
        var real = I().makeItem({ id: id, type: m.product, sil: 0 }, tile); real.style.transform = el.style.transform; real.style.transition = 'none';
        el.parentNode.replaceChild(real, el); x.els[id] = el = real; void el.offsetWidth; el.style.transition = '';
      }
      delete x.els[id];
      I().later(function () {
        el.classList.add('pop');
        el.style.transform = 'translate3d(' + p.x.toFixed(1) + 'px,' + (p.y - 14).toFixed(1) + 'px,0) scale(1.35)';
        I().later(function () { if (el.parentNode) el.parentNode.removeChild(el); }, C.MATCH_MS || 320);
      }, el.classList.contains('sil') ? 150 : 0);
    });
    burst(cx, cy, m.combo > 1 ? 14 : 9);
    if (m.points) points(cx, cy - x.geo.slotW * 0.5, '+' + m.points, m.combo > 1);
    else points(cx, cy - x.geo.slotW * 0.5, m.combo > 1 ? 'x' + m.combo : '✓', m.combo > 1);
  }
  function reveal(r) {
    var x = X(), b = x.game.board;
    r.layer.forEach(function (entry) {
      var it = b.items[entry.id]; if (!it || x.els[entry.id]) return;
      var el = I().makeItem(it, I().tileOf(it.type));
      I().place(el, r.comp, entry.slot);
      el.classList.add('arrive');
      x.itemsEl.appendChild(el); x.els[entry.id] = el;
      I().later(function () { el.classList.remove('arrive'); }, 260);
    });
    ui.board.renderBack(r.comp);
  }
  function lockTick(l) {
    var el = X().locksEl.querySelector('[data-ci="' + l.comp + '"]'); if (!el) return;
    var badge = el.querySelector('.badge'); badge.textContent = String(l.left); badge.classList.remove('pop'); void badge.offsetWidth; badge.classList.add('pop');
  }
  function unlock(l) {
    var el = X().locksEl.querySelector('[data-ci="' + l.comp + '"]'); if (!el) return;
    el.classList.add('open');
    I().later(function () { if (el.parentNode) el.parentNode.removeChild(el); ui.board.renderBack(l.comp); }, 320);
  }
  function sweep(s) {
    var x = X();
    s.items.forEach(function (entry) {
      var el = x.els[entry.id]; if (!el) return;
      delete x.els[entry.id];
      el.classList.add('fade');
      I().later(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    });
    for (var ci = 0; ci < x.game.board.comps.length; ci++) ui.board.renderBack(ci);
  }
  function collect(e) {
    var x = X(), el = x.els[e.item]; if (!el) return;
    delete x.els[e.item];
    if (el.parentNode !== x.itemsEl) { var tile = parseFloat(el.style.width), r = e.where === 'belt' ? ui.belts.itemRect(e.ref.beltIndex, e.ref.cell, tile) : null; el.style.transition = 'none'; if (r) el.style.transform = 'translate3d(' + r.x + 'px,' + r.y + 'px,0)'; x.itemsEl.appendChild(el); void el.offsetWidth; el.style.transition = ''; }
    var target = doc.getElementById('btn-bunny'), rr = x.root.getBoundingClientRect(), tx = 20, ty = -60;   // flies to the bunny button in the HUD
    if (target) { var tr = target.getBoundingClientRect(); tx = tr.left + tr.width / 2 - rr.left - parseFloat(el.style.width) / 2; ty = tr.top - rr.top; }
    el.classList.add('fly'); el.classList.remove('bunny');
    el.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0) scale(0.5)'; el.style.opacity = '0.2';
    burst(parseFloat(el.style.width) / 2 + (parseFloat((el.style.transform.match(/translate3d\(([-\d.]+)px/) || [0, 0])[1])), 0, 8);
    I().later(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 650);
  }
  function spend(e) {
    var x = X(), cr = I().compRect(e.comp);
    I().flashComp(e.comp, '#FFE27A', 450);
    e.removed.forEach(function (entry) {
      var el = x.els[entry.id]; if (!el) return; delete x.els[entry.id];
      el.classList.add('pop'); el.style.transform += ' scale(1.3)';
      I().later(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 420);
    });
    burst(cr.x + cr.w / 2, cr.y + cr.h / 2, 16, ['#F2B632', '#FFD36B', '#FFF0C2', '#FFFFFF']);
    ui.board.renderBack(e.comp);
  }
  function warnSpace() {
    var x = X(), b = x.game.board;
    for (var ci = 0; ci < b.comps.length; ci++) if (SS.board.isOpen(b, ci) && SS.board.firstFree(b, ci) >= 0) { var el = I().compEl(ci); if (el) { el.classList.remove('warn-slot'); void el.offsetWidth; el.classList.add('warn-slot'); } return; }
  }
  function burst(cx, cy, n, colors) {
    var x = X();
    if (SS.lowGfx) n = Math.ceil(n / 2);
    if (doc.body.classList.contains('reduced-motion')) return;
    colors = colors || ['#F7C948', '#F28C28', '#3FA34D', '#4FA3E8', '#F26B9E', '#FFFFFF'];
    var reduced = doc.body.classList.contains('reduced-motion');
    for (var i = 0; i < n; i++) {
      var d = doc.createElement('i'), a = (i / n) * Math.PI * 2, r = x.geo.slotW * (0.9 + ((i * 37) % 10) / 10 * 0.9);
      d.className = 'burst'; d.style.background = colors[i % colors.length];
      var x0 = cx - 5, y0 = cy - 5, x1 = x0 + Math.cos(a) * r, y1 = y0 + Math.sin(a) * r;
      d.style.transform = 'translate(' + x0.toFixed(1) + 'px,' + y0.toFixed(1) + 'px)';
      x.fxEl.appendChild(d);
      // explicit keyframes run on the compositor (keyframes that read CSS variables ran on the main thread: a style recalc per frame)
      if (d.animate && !reduced) d.animate([{ transform: 'translate(' + x0.toFixed(1) + 'px,' + y0.toFixed(1) + 'px) scale(1)', opacity: 1 }, { transform: 'translate(' + x1.toFixed(1) + 'px,' + y1.toFixed(1) + 'px) scale(0.2)', opacity: 0 }], { duration: 500, easing: 'ease-out', fill: 'forwards' });
      (function (el) { I().later(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 520); })(d);
    }
  }
  function points(cx, cy, text, combo) {
    var x = X(), d = doc.createElement('div'), x0 = (cx - 40).toFixed(1), reduced = doc.body.classList.contains('reduced-motion');
    d.className = 'points' + (combo ? ' combo' : ''); d.textContent = text;
    d.style.transform = 'translate(' + x0 + 'px,' + cy.toFixed(1) + 'px)'; d.style.width = '80px'; d.style.textAlign = 'center';
    x.fxEl.appendChild(d);
    if (d.animate) d.animate([{ transform: 'translate(' + x0 + 'px,' + cy.toFixed(1) + 'px) scale(0.6)', opacity: 0, offset: 0 }, { transform: 'translate(' + x0 + 'px,' + (cy - 10).toFixed(1) + 'px) scale(1.1)', opacity: 1, offset: 0.2 }, { transform: 'translate(' + x0 + 'px,' + (cy - 56).toFixed(1) + 'px) scale(1)', opacity: 0, offset: 1 }], { duration: reduced ? 400 : 800, easing: 'ease-out', fill: 'forwards' });
    I().later(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 820);
  }
  function celebrate() {
    var x = X(); if (!x.geo) return;
    for (var i = 0; i < (SS.lowGfx ? 3 : 6); i++) (function (k) { I().later(function () { burst(x.geo.w * (0.2 + ((k * 53) % 10) / 10 * 0.6), x.geo.h * (0.2 + ((k * 31) % 10) / 10 * 0.6), 12); }, k * 120); })(i);
  }

  ui.boardfx = { apply: apply, celebrate: celebrate, burst: burst, points: points };
})(typeof globalThis !== 'undefined' ? globalThis : this);
