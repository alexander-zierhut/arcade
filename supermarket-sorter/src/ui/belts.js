// src/ui/belts.js: the take-only shelves in the DOM (DESIGN 7.3 belt animation, 7.4 input with moving sources).
// One <div class="belt"> per belt with Nb absolutely positioned cells; each cell animates on the compositor with the Web
// Animations API (a linear loop; the hidden cells wrap outside the window). The rules never see time: the hit test reads
// the cells' live rects once per pointerdown. Browser-only; sets SS.ui.belts.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var ui = SS.ui = SS.ui || {};
  var doc = root.document;
  var PLANK = 8;                        // keep in sync with BELT_PLANK in ui/board.js (geometry.beltPlank)
  var rootEl, board = null, geo = null, belts = [], rate = 1000, paused = false, opts = {};

  function el(tag, cls) { var e = doc.createElement(tag); if (cls) e.className = cls; return e; }

  /** build(rootElement, boardModel, geometry, options): rebuilds every belt. options: { speed100, moving, reduced, makeItem(it, tile) } */
  function build(rootElement, b, g, o) {
    destroy();
    rootEl = rootElement; board = b; geo = g; opts = o || {}; PLANK = g.beltPlank || PLANK;
    b.belts.forEach(function (belt, bi) {
      var bg = geo.belts[belt.id];
      if (!bg) return;
      var box = el('div', 'belt belt-' + belt.id + (belt.appeared ? '' : ' pending'));
      box.style.left = bg.x + 'px'; box.style.top = bg.y + 'px'; box.style.width = bg.w + 'px'; box.style.height = bg.h + 'px';
      box.appendChild(el('div', 'rail'));
      var rec = { id: belt.id, index: bi, box: box, cells: [], anims: [], geo: bg, moving: !!(opts.moving && (opts.speed100 || 0) > 0), rate: rate };
      belts.push(rec);                                            // registered first: setItem() looks the record up by index
      var Nb = belt.cells.length, pitch = bg.pitch;
      for (var k = 0; k < Nb; k++) {
        var cell = el('div', 'cell' + (belt.cells[k].barred ? ' barred' : ''));
        cell.setAttribute('data-k', String(k));
        if (bg.axis === 'y') { cell.style.width = bg.w + 'px'; cell.style.height = pitch + 'px'; }
        else { cell.style.width = pitch + 'px'; cell.style.height = bg.h + 'px'; }
        cell.appendChild(el('div', 'tray'));
        var sh = el('i', 'shadow'); sh.style.height = Math.max(4, 0.16 * geo.slotW) + 'px'; cell.appendChild(sh);
        cell.appendChild(el('div', 'cplank'));
        cell.appendChild(el('div', 'bars'));
        var still = !rec.moving || Nb <= bg.Wv;
        var pos = still ? k * (Nb > bg.Wv ? pitch * bg.Wv / Nb : pitch) : k * pitch;
        cell.style.transform = bg.axis === 'y' ? 'translate3d(0,' + pos + 'px,0)' : 'translate3d(' + pos + 'px,0,0)';
        box.appendChild(cell);
        rec.cells.push(cell);
        var item = belt.cells[k].item ? b.items[belt.cells[k].item] : null;
        if (item && opts.makeItem) setItem(bi, k, opts.makeItem(item, tileFor(bg, item.type)));
      }
      rootEl.appendChild(box);
      if (rec.moving && Nb > bg.Wv && belt.appeared) animate(rec);
    });
  }
  /** tileFor(bg, type): the SAME tile a product gets on the rack (one size everywhere); the cells were sized to hold it. */
  function tileFor(bg, type) { return opts.tileOf ? opts.tileOf(type) : geo.slotW * SS.sprites.scale(type); }
  function itemPos(bg, tile) {
    var cw = bg.axis === 'y' ? bg.w : bg.pitch, ch = bg.axis === 'y' ? bg.pitch : bg.h;
    return { x: (cw - tile) / 2, y: ch - PLANK - 0.95 * tile };
  }
  function recOf(bi) { return belts.filter(function (r) { return r.index === bi; })[0] || null; }
  /** setItem(beltIndex, k, itemEl|null): places an item element inside a cell (or removes it). */
  function setItem(bi, k, itemEl) {
    var rec = recOf(bi);
    if (!rec) return;
    var cell = rec.cells[k], old = cell.querySelector('.item');
    if (old && old !== itemEl) old.parentNode.removeChild(old);
    if (!itemEl) return;
    var tile = parseFloat(itemEl.style.width) || tileFor(rec.geo, itemEl.getAttribute('data-type') || ''), p = itemPos(rec.geo, tile);
    itemEl.style.transition = 'none'; itemEl.style.transform = 'translate3d(' + p.x + 'px,' + p.y + 'px,0)';
    itemEl.classList.remove('drag', 'hand', 'sel');
    cell.appendChild(itemEl); cell.classList.add('has-item');
    void itemEl.offsetWidth; itemEl.style.transition = '';
  }
  function animate(rec) {
    var bg = rec.geo, Nb = rec.cells.length, pitch = bg.pitch, v = (opts.speed100 || 20) / 100;
    var duration = Nb / v * 1000, travel = Nb * pitch;
    rec.anims = rec.cells.map(function (cell, k) {
      var from = bg.axis === 'y' ? 'translate3d(0,' + (travel - pitch) + 'px,0)' : 'translate3d(' + (travel - pitch) + 'px,0,0)';
      var to = bg.axis === 'y' ? 'translate3d(0,' + (-pitch) + 'px,0)' : 'translate3d(' + (-pitch) + 'px,0,0)';
      var a = cell.animate([{ transform: from }, { transform: to }], { duration: duration, iterations: Infinity, easing: 'linear' });
      a.currentTime = ((Nb - 1 - k) / Nb) * duration + (opts.phaseMs || 0);
      try { a.playbackRate = rate / 1000; } catch (e) { /* older engines */ }
      if (paused) a.pause();
      return a;
    });
  }
  /** hit(clientX, clientY) -> { beltIndex, cell } for an available cell under the point (inflated 10 px), or null. */
  function hit(cx, cy) {
    for (var i = 0; i < belts.length; i++) {
      var rec = belts[i], belt = board.belts[rec.index];
      if (!belt.appeared) continue;
      var bb = rec.box.getBoundingClientRect();
      if (cx < bb.left - 10 || cx > bb.right + 10 || cy < bb.top - 10 || cy > bb.bottom + 10) continue;
      for (var k = 0; k < rec.cells.length; k++) {
        if (belt.cells[k].barred || !belt.cells[k].item) continue;
        var r = rec.cells[k].getBoundingClientRect(), lag = rec.moving ? ((opts.speed100 || 20) / 100) * rec.geo.pitch * 0.15 : 0;
        var top = r.top - 10, bottom = r.bottom + 10 + (rec.geo.axis === 'y' ? lag : 0), left = r.left - 10, right = r.right + 10 + (rec.geo.axis === 'x' ? lag : 0);
        if (cx >= left && cx <= right && cy >= top && cy <= bottom) return { beltIndex: rec.index, cell: k, rect: r };
      }
    }
    return null;
  }
  /** cellRect(beltIndex, k) -> the cell's live rect relative to the board root. */
  function cellRect(bi, k) {
    var rec = recOf(bi);
    if (!rec) return null;
    var r = rec.cells[k].getBoundingClientRect(), rr = rootEl.getBoundingClientRect();
    return { x: r.left - rr.left, y: r.top - rr.top, w: r.width, h: r.height, rec: rec };
  }
  /** itemRect(beltIndex, k, tile) -> where the item of that cell sits now, relative to the board root. */
  function itemRect(bi, k, tile) {
    var c = cellRect(bi, k); if (!c) return null;
    var p = itemPos(c.rec.geo, tile);
    return { x: c.x + p.x, y: c.y + p.y, w: tile, h: tile };
  }
  function cellEl(bi, k) { var rec = recOf(bi); return rec ? rec.cells[k] : null; }
  function reserve(bi, k, on) { var c = cellEl(bi, k); if (c) c.classList.toggle('reserved', !!on); }
  function bar(bi, k) { var c = cellEl(bi, k); if (c) { c.classList.add('barred'); c.classList.remove('has-item'); } checkDone(bi); }
  function unbar(bi, k) { var c = cellEl(bi, k); if (c) c.classList.remove('barred'); }
  function checkDone(bi) {
    var rec = recOf(bi); if (!rec) return;
    var all = board.belts[bi].cells.every(function (cell) { return cell.barred; });
    if (all) { rec.box.classList.add('done'); rec.anims.forEach(function (a) { try { a.pause(); } catch (e) { /* gone */ } }); }
  }
  function appear(bi) {
    var rec = recOf(bi); if (!rec) return;
    rec.box.classList.remove('pending'); rec.box.classList.add('appear');
    if (rec.moving && rec.cells.length > rec.geo.Wv && !rec.anims.length) animate(rec);
  }
  function pause() { paused = true; belts.forEach(function (rec) { rec.anims.forEach(function (a) { try { a.pause(); } catch (e) { /* gone */ } }); }); }
  function resume() { paused = false; belts.forEach(function (rec) { if (rec.box.classList.contains('done')) return; rec.anims.forEach(function (a) { try { a.play(); } catch (e) { /* gone */ } }); }); }
  /** setRate(permille): belt playback rate. Only touches the animations when the rate changed: setting playbackRate (even to the same
   *  value) re-syncs every composited cell animation and ran them on the main thread for seconds (one style recalc per cell per frame). */
  function setRate(permille) {
    if (permille === rate && belts.every(function (rec) { return rec.rate === permille; })) return;
    rate = permille;
    belts.forEach(function (rec) { if (rec.rate === permille) return; rec.rate = permille; rec.anims.forEach(function (a) { try { a.playbackRate = permille / 1000; } catch (e) { /* older engines */ } }); });
  }
  function phaseMs() { var out = {}; belts.forEach(function (rec) { if (rec.anims[0]) { try { out[rec.id] = rec.anims[0].currentTime % (rec.anims[0].effect.getTiming().duration || 1); } catch (e) { /* gone */ } } }); return out; }
  function destroy() { belts.forEach(function (rec) { rec.anims.forEach(function (a) { try { a.cancel(); } catch (e) { /* gone */ } }); if (rec.box.parentNode) rec.box.parentNode.removeChild(rec.box); }); belts = []; }
  function flash(bi, k) { var c = cellEl(bi, k); if (c) { c.classList.add('hit'); root.setTimeout(function () { c.classList.remove('hit'); }, 300); } }

  ui.belts = { build: build, destroy: destroy, hit: hit, cellRect: cellRect, itemRect: itemRect, cellEl: cellEl, setItem: setItem, reserve: reserve, bar: bar, unbar: unbar,
    appear: appear, pause: pause, resume: resume, setRate: setRate, phaseMs: phaseMs, tileFor: tileFor, flash: flash, count: function () { return belts.length; } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
