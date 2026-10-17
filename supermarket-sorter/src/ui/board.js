// src/ui/board.js: the board view coordinator (DESIGN 7.2-7.4): geometry for the rack shapes, side belts and the
// horizontal belt; building compartments (back layer, dim, pips, chains), items and belts; pointer input with drag,
// tap-to-move, belt picks (moving sources), bunny collects and spend arming. Animations live in ui/boardfx.js.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var ui = SS.ui = SS.ui || {};
  var C = SS.config || {};
  var doc = root.document;
  // Geometry constants (px): rack padding, gap between compartments, plank height, headroom above the items, gap between
  // rack and belts. Belt widths and cell pitches are derived from the slot width so that a product has ONE size everywhere.
  var PAD = 8, GAP = 5, PLANK = 12, HEAD = 6, GAPB = 5, BELT_PLANK = 15, BELT_PAD = 4;   // BELT_PLANK: the cell's bottom gap (5) + its board (10)
  var BELT_W_K = 1.12;                  // side shelf width in slot widths (the widest product shows 0.9 of a slot)
  var H_VISIBLE = 5;                    // visible cells of the bottom shelf (it spans the whole board width)
  var X = { root: null, shelfEl: null, locksEl: null, itemsEl: null, fxEl: null, game: null, geo: null, els: {}, handlers: {}, enabled: false,
    drag: null, selected: 0, hover: -1, armSpend: false, avail: { x: 0, y: 0, w: 320, h: 480 }, timers: [], opts: {} };

  function later(fn, ms) { var t = root.setTimeout(function () { X.timers.splice(X.timers.indexOf(t), 1); fn(); }, ms); X.timers.push(t); return t; }
  function cancelTimers() { X.timers.forEach(function (t) { root.clearTimeout(t); }); X.timers = []; }
  function dpr() { return Math.min(root.devicePixelRatio || 1, C.DPR_CAP || 2); }

  // ---------- geometry ----------
  /** computeGeometry(board, area, { moving }) -> the pixel layout of one cabinet (docs/ART-STYLE.md, DESIGN 0.5 v0.3.1).
   *  One slot width s drives everything: compartments are 3 s wide and HEAD + MAX_H s + PLANK high; the side columns
   *  are BELT_W_K s wide and their cells are exactly the rack rows (one visible cell per row, cells beyond that scroll);
   *  the bottom shelf spans the full cabinet width. s is the largest value that fits the area, capped at SLOT_MAX_PX. */
  function computeGeometry(b, area, o) {
    o = o || {};
    var hasBelts = b.belts.some(function (bt) { return bt.id === 'L' || bt.id === 'R'; }), hasH = b.belts.some(function (bt) { return bt.id === 'H'; });
    var maxH = (SS.sprites && SS.sprites.MAX_H) || 1.7, rows = 0, maxCol = 0, ci;
    for (ci = 0; ci < b.comps.length; ci++) { rows = Math.max(rows, b.comps[ci].row + 1); if (typeof b.comps[ci].col === 'number') maxCol = Math.max(maxCol, b.comps[ci].col); }
    var ncols = Math.max(2, maxCol + 1, b.shape === 'G' ? (b.cols || 1) : 2);
    if (b.shape === 'G') ncols = Math.max(1, b.cols || maxCol + 1);
    var cellPad = BELT_PLANK + BELT_PAD;
    // width: W = 3 ncols s + 2 PAD + (ncols-1) GAP + [belts] 2 (BELT_W_K s + GAPB)
    var wConst = 2 * PAD + (ncols - 1) * GAP + (hasBelts ? 2 * GAPB : 0), wCoef = 3 * ncols + (hasBelts ? 2 * BELT_W_K : 0);
    var sW = (area.w - wConst) / wCoef;
    // height: rack + [H] (GAPB + maxH s + cellPad); the side columns never exceed the rack
    var stackConst = 2 * PAD + rows * (HEAD + PLANK) + (rows - 1) * GAP + (hasH ? GAPB + cellPad : 0), stackCoef = rows * maxH + (hasH ? maxH : 0);
    var sH = (area.h - stackConst) / stackCoef;
    var s = Math.max(14, Math.min(sW, sH, C.SLOT_MAX_PX || 92));
    var slotW = s, compW = 3 * s, compH = HEAD + maxH * s + PLANK, hRow = hasH ? maxH * s + cellPad : 0;
    var rackW = ncols * compW + 2 * PAD + (ncols - 1) * GAP, rackH = 2 * PAD + rows * compH + (rows - 1) * GAP, stackH = rackH + (hasH ? GAPB + hRow : 0);
    var beltW = hasBelts ? Math.round(BELT_W_K * s) : 0, sideW = hasBelts ? beltW + GAPB : 0;
    var W = rackW + 2 * sideW, F = stackH;
    var rack = { x: sideW, y: 0, w: rackW, h: rackH }, comps = [];
    for (ci = 0; ci < b.comps.length; ci++) {
      var c = b.comps[ci], x;
      if (c.col === 'c') x = rack.x + PAD + (rackW - 2 * PAD - compW) / 2; else x = rack.x + PAD + c.col * (compW + GAP);
      comps.push({ x: x, y: rack.y + PAD + c.row * (compH + GAP), w: compW, h: compH });
    }
    var belts = {}, pitch = compH + GAP;
    if (hasBelts) {
      var by = rack.y + PAD, bh = rows * pitch;                           // cell k sits exactly on rack row k
      belts.L = { x: 0, y: by, w: beltW, h: bh, axis: 'y', pitch: pitch, Wv: rows };
      belts.R = { x: W - beltW, y: by, w: beltW, h: bh, axis: 'y', pitch: pitch, Wv: rows };
    }
    if (hasH) belts.H = { x: 0, y: rack.y + rackH + GAPB, w: W, h: hRow, axis: 'x', pitch: W / H_VISIBLE, Wv: H_VISIBLE };
    return { x: Math.round(area.x + (area.w - W) / 2), y: Math.round(area.y + (area.h - F) / 2), w: W, h: F, rack: rack, comps: comps, belts: belts,
      compW: compW, compH: compH, slotW: slotW, rows: rows, cols: ncols, hasBelts: hasBelts, hasH: hasH, beltPlank: BELT_PLANK, pad: PAD, gap: GAP, gapB: GAPB, plank: PLANK };
  }
  function compRect(ci) { return X.geo.comps[ci]; }
  function tileOf(type) { return X.geo.slotW * SS.sprites.scale(type); }
  function slotPos(ci, s, tile) { var cr = compRect(ci); return { x: cr.x + (s + 0.5) * X.geo.slotW - tile / 2, y: cr.y + cr.h - PLANK - 0.95 * tile }; }
  function compAt(px, py) {
    if (!X.geo) return -1;
    for (var ci = 0; ci < X.geo.comps.length; ci++) { var r = X.geo.comps[ci]; if (px >= r.x - GAP / 2 && px < r.x + r.w + GAP / 2 && py >= r.y - GAP / 2 && py < r.y + r.h + GAP / 2) return ci; }
    return -1;
  }
  /** compNear(px, py, maxD) -> the compartment whose rect is nearest to the point (within maxD px), or -1. Forgiving targets:
   *  a drop on the plank, in a gap or just beside the rack still lands in the obvious compartment. */
  function compNear(px, py, maxD, skip) {
    if (!X.geo) return -1;
    var best = -1, bestD = maxD;
    for (var ci = 0; ci < X.geo.comps.length; ci++) {
      if (ci === skip) continue;
      var r = X.geo.comps[ci], dx = Math.max(r.x - px, 0, px - (r.x + r.w)), dy = Math.max(r.y - py, 0, py - (r.y + r.h)), d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = ci; }
    }
    return best;
  }
  /** dropTarget(px, py, el) -> the compartment a drag should land in: under the finger, else nearest to the sprite's foot, else nearest to the finger. */
  /** refuseReason(id, ci) -> 'locked' | 'full' | 'same' | 'source' | '' for a move that canMove refused (the toast says why). */
  function refuseReason(id, ci) {
    var b = X.game.board, it = b.items[id]; if (!it || ci < 0) return '';
    if (it.at === 'c' && it.comp === ci) return 'same';
    if (!SS.board.isOpen(b, ci)) return 'locked';
    if (it.at === 'c' && !SS.board.isOpen(b, it.comp)) return 'source';
    if (SS.board.firstFree(b, ci) < 0) return 'full';
    return '';
  }
  /** tryShift(id, px) -> true when the product was rearranged to the free slot nearest to px in its own compartment. */
  function tryShift(id, px) {
    var b = X.game.board, it = b.items[id]; if (!it || it.at !== 'c') return false;
    var slot = nearestFreeSlot(it.comp, px);
    if (slot < 0 || slot === it.slot || !SS.board.canShift(b, id, slot)) return false;
    var events = X.handlers.onShift ? X.handlers.onShift(id, slot) : null;
    if (!(events && events.length)) return false;
    var el = X.els[id]; if (el) { el.classList.remove('drag', 'sel', 'hand'); el.style.setProperty('--move-ms', (C.SPRING_MS || 180) + 'ms'); place(el, it.comp, slot); }
    X.selected = 0;
    syncShadows();                                                     // the contact shadow follows the product to its new slot
    return true;
  }
  function dropTarget(px, py, el, from) {
    var ci = compAt(px, py);
    if (ci === from) return -2;                                        // dropped back home: a shift to a free slot, else a cancel
    if (ci >= 0 || !X.geo) return ci;
    var snap = X.geo.compH * 0.55;
    if (el) {
      var m = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(el.style.transform || ''), tile = parseFloat(el.style.width) || X.geo.slotW;
      if (m) { ci = compNear(parseFloat(m[1]) + tile / 2, parseFloat(m[2]) + tile * 0.9, snap, from); if (ci >= 0) return ci; }
    }
    return compNear(px, py, snap, from);
  }
  function itemAt(px, py) {
    var ci = compAt(px, py); if (ci < 0) return 0;
    var cr = compRect(ci), s = Math.floor((px - cr.x) / X.geo.slotW);
    if (s < 0 || s > 2) return 0;
    return X.game.board.comps[ci].slots[s] || 0;
  }
  /** backAt(ci, px): true when the slot under px is empty in front but shows a product of the next layer. */
  function backAt(ci, px) {
    var c = X.game.board.comps[ci], s = Math.floor((px - compRect(ci).x) / X.geo.slotW);
    if (s < 0 || s > 2 || c.slots[s] || !c.back.length) return false;
    var t = c.back[0].t[s]; return t !== null && t !== undefined && !(t !== '*' && X.game.board.swept[t]);
  }
  function nearestFreeSlot(ci, px) {
    var slots = X.game.board.comps[ci].slots, best = -1, bestD = 1e9;
    for (var s = 0; s < 3; s++) { if (slots[s]) continue; var cx = compRect(ci).x + (s + 0.5) * X.geo.slotW, d = Math.abs(cx - px); if (d < bestD) { bestD = d; best = s; } }
    return best;
  }
  function place(el, ci, s, extra) {
    var tile = parseFloat(el.style.width) || X.geo.slotW, p = slotPos(ci, s, tile);
    el.style.transform = 'translate3d(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px,0)' + (extra || '');
  }

  // ---------- building ----------
  function makeItem(it, tile) {
    var el;
    if (it.sil && it.type !== '*') {
      el = SS.sprites.silhouette(it.type, it.sil, Math.ceil(tile * dpr()));
      el.className = 'item sil';
    } else {
      el = doc.createElement('img'); el.className = 'item' + (it.type === '*' ? ' bunny' : ''); el.draggable = false; el.alt = ''; el.src = SS.sprites.url(it.type);
    }
    el.setAttribute('data-id', String(it.id)); el.setAttribute('data-type', it.type);
    el.style.width = tile + 'px'; el.style.height = tile + 'px';
    return el;
  }
  /** makeBackItem(type, sil, tile): the darkened copy of a product in the next layer (ART-STYLE: light shelf, dark back items). */
  function makeBackItem(type, sil, tile) {
    var el = SS.sprites.shaded(type, sil, Math.ceil(tile * dpr()));
    el.className = 'item back'; el.setAttribute('data-type', type);
    el.style.width = tile + 'px'; el.style.height = tile + 'px';
    return el;
  }
  function buildComp(ci) {
    var b = X.game.board, c = b.comps[ci], r = compRect(ci), d = doc.createElement('div');
    d.className = 'comp'; d.setAttribute('data-ci', String(ci));
    d.style.left = r.x + 'px'; d.style.top = (r.y - X.geo.rack.y) + 'px'; d.style.width = r.w + 'px'; d.style.height = r.h + 'px';   // the cabinet (#shelf) spans the whole width
    var shadows = doc.createElement('div'); shadows.className = 'shadows';                                  // one soft contact shadow per slot (ART-STYLE 1)
    for (var k = 0; k < 3; k++) { var sh = doc.createElement('i'); sh.style.left = ((k + 0.5) * X.geo.slotW - 0.42 * X.geo.slotW) + 'px'; sh.style.width = (0.84 * X.geo.slotW) + 'px'; sh.style.height = Math.max(4, 0.16 * X.geo.slotW) + 'px'; shadows.appendChild(sh); }
    d.appendChild(shadows);
    var glow = doc.createElement('div'); glow.className = 'glow'; d.appendChild(glow);                 // match / spend flash: an opacity animation on the compositor
    var backs = doc.createElement('div'); backs.className = 'backs'; d.appendChild(backs);
    var pips = doc.createElement('div'); pips.className = 'pips'; d.appendChild(pips);
    var plank = doc.createElement('div'); plank.className = 'plank'; d.appendChild(plank);
    X.shelfEl.appendChild(d);
    renderBack(ci);
    renderLock(ci);
    return d;
  }
  function compEl(ci) { return X.shelfEl.querySelector('.comp[data-ci="' + ci + '"]'); }
  /** buildBoards(): the continuous shelf boards of the cabinet, one per rack row, spanning the side columns too. */
  function buildBoards() {
    var g = X.geo, rows = {};
    g.comps.forEach(function (r) { rows[Math.round(r.y)] = r; });
    Object.keys(rows).forEach(function (k) {
      var r = rows[k], b = doc.createElement('div'); b.className = 'board-row';
      b.style.top = (r.y - g.rack.y + r.h - g.plank) + 'px'; b.style.height = (g.plank + 4) + 'px';
      X.shelfEl.appendChild(b);
    });
    var top = doc.createElement('div'); top.className = 'board-top'; X.shelfEl.appendChild(top);
  }
  /** renderBack(ci): draws the darkened next layer and the depth pips from the model. */
  function renderBack(ci) {
    var c = X.game.board.comps[ci], d = compEl(ci), backs = d.querySelector('.backs'), pips = d.querySelector('.pips'), r = compRect(ci);
    backs.innerHTML = ''; pips.innerHTML = '';
    var next = c.back.length ? c.back[0] : null;
    d.classList.toggle('has-back', !!next);
    if (next) {
      for (var k = 0; k < 3; k++) {
        var t = next.t[k]; if (t === null || (t !== '*' && X.game.board.swept[t])) continue;
        var tile = tileOf(t) * 0.78, el = makeBackItem(t, next.sil[k], tile);
        var p = slotPos(ci, k, tile);
        el.style.transform = 'translate3d(' + (p.x - r.x).toFixed(1) + 'px,' + (p.y - r.y - r.h * 0.14).toFixed(1) + 'px,0)';
        backs.appendChild(el);
      }
    }
    var deeper = Math.max(0, c.back.length - 1);
    if (deeper && X.opts.showDepth) { for (var i = 0; i < Math.min(4, deeper); i++) pips.appendChild(doc.createElement('i')); if (deeper > 4) { var sp = doc.createElement('span'); sp.textContent = '+'; pips.appendChild(sp); } }
  }
  function renderLock(ci) {
    var b = X.game.board, c = b.comps[ci], old = X.locksEl.querySelector('[data-ci="' + ci + '"]');
    if (old) old.parentNode.removeChild(old);
    if (!c.lockAt || b.matches >= c.lockAt) return;
    var r = compRect(ci), l = doc.createElement('div');
    l.className = 'lock'; l.setAttribute('data-ci', String(ci));
    l.style.left = r.x + 'px'; l.style.top = r.y + 'px'; l.style.width = r.w + 'px'; l.style.height = r.h + 'px';
    var c1 = doc.createElement('div'); c1.className = 'chain c1'; l.appendChild(c1);
    var c2 = doc.createElement('div'); c2.className = 'chain c2'; l.appendChild(c2);
    var badge = doc.createElement('div'); badge.className = 'badge'; badge.textContent = String(c.lockAt - b.matches); l.appendChild(badge);
    X.locksEl.appendChild(l);
  }
  /** flashComp(ci, colour, ms): lights the compartment up briefly (opacity animation of the glow overlay: no style recalc per frame). */
  function flashComp(ci, colour, ms) {
    var d = compEl(ci), g = d && d.querySelector('.glow'); if (!g) return;
    if (doc.body.classList.contains('reduced-motion')) return;
    g.style.background = colour || '#FFF6B8';
    if (g.animate) g.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: ms || 350, easing: 'ease-out' });
  }
  /** syncShadows(): a contact shadow only under occupied slots (rack) and filled cells (belts). */
  function syncShadows() {
    var b = X.game && X.game.board; if (!b || !X.geo) return;
    for (var ci = 0; ci < b.comps.length; ci++) { var d = compEl(ci); if (!d) continue; var sh = d.querySelectorAll('.shadows i'); for (var k = 0; k < 3 && k < sh.length; k++) { var on = !!b.comps[ci].slots[k]; if (sh[k].classList.contains('on') !== on) sh[k].classList.toggle('on', on); } }
    b.belts.forEach(function (bt, bi) { bt.cells.forEach(function (cell, k) { var c = ui.belts.cellEl(bi, k); if (!c) return; var has = !!cell.item && !cell.barred; if (c.classList.contains('has-item') !== has) c.classList.toggle('has-item', has); }); });
  }
  function buildItems() {
    X.itemsEl.innerHTML = ''; X.els = {};
    var b = X.game.board;
    for (var id in b.items) {
      var it = b.items[id];
      if (it.at !== 'c') continue;
      var el = makeItem(it, tileOf(it.type));
      place(el, it.comp, it.slot);
      X.itemsEl.appendChild(el); X.els[it.id] = el;
    }
  }
  /** beltSpeed(): the belt speed to animate with. A side column shows one cell per rack row; a belt with more cells than that
   *  must scroll even in a still level (at the slowest drift, DRIFT100), otherwise its hidden products could never be taken. */
  var DRIFT100 = 8;
  function beltSpeed() {
    var g = X.game, lvl = g.level, v = lvl.beltSpeed100 || 0, rows = X.geo ? X.geo.rows : 6;
    var needs = g.board.belts.some(function (bt) { return (bt.id === 'L' || bt.id === 'R') && bt.cells.length > rows; });
    if (g.mode === 'relaxed' && X.opts.stillBelts && !needs) return 0;
    if (v <= 0 && needs) return DRIFT100;
    return v;
  }
  function beltsMoving() { return beltSpeed() > 0; }
  function buildBelts() {
    var g = X.game, lvl = g.level, v = beltSpeed(), moving = v > 0;
    ui.belts.build(X.root, g.board, X.geo, { speed100: v, moving: moving, phaseMs: 0, tileOf: tileOf,
      makeItem: function (it, tile) { var el = makeItem(it, tile); X.els[it.id] = el; return el; } });
    if (SS.rules && g.mode === 'timed') ui.belts.setRate(SS.rules.rampRate(g));
  }
  /** rebuild(): everything from the model (level start, undo, resize). */
  function rebuild() {
    cancelTimers(); X.drag = null; X.selected = 0; X.hover = -1; X.armSpend = false; X.root.classList.remove('arm-spend');
    var g = X.game;
    if (!g) { X.shelfEl.innerHTML = ''; X.locksEl.innerHTML = ''; X.itemsEl.innerHTML = ''; X.fxEl.innerHTML = ''; ui.belts.destroy(); X.els = {}; return; }
    X.geo = computeGeometry(g.board, X.avail, {});
    X.root.style.left = X.geo.x + 'px'; X.root.style.top = X.geo.y + 'px'; X.root.style.width = X.geo.w + 'px'; X.root.style.height = X.geo.h + 'px';
    X.shelfEl.innerHTML = ''; X.locksEl.innerHTML = ''; X.fxEl.innerHTML = '';
    X.shelfEl.style.left = '0px'; X.shelfEl.style.top = X.geo.rack.y + 'px'; X.shelfEl.style.width = X.geo.w + 'px'; X.shelfEl.style.height = X.geo.rack.h + 'px';
    X.shelfEl.classList.toggle('with-sides', X.geo.hasBelts);
    buildBoards();
    for (var ci = 0; ci < g.board.comps.length; ci++) buildComp(ci);
    buildItems();
    buildBelts();
    syncShadows();
  }

  // ---------- public ----------
  function init(el, h) {
    X.root = el; X.handlers = h || {};
    X.shelfEl = el.querySelector('#shelf'); X.locksEl = el.querySelector('#locks'); X.itemsEl = el.querySelector('#items'); X.fxEl = el.querySelector('#fx');
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    root.addEventListener('pointerup', function (ev) { if (X.drag && ev.pointerId === X.drag.pid) onUp(ev); });
  }
  function setGame(g, opts) { X.game = g; X.opts = opts || X.opts; rebuild(); }
  function setOptions(opts) { for (var k in opts) X.opts[k] = opts[k]; }
  function layout(area) { X.avail = area; if (X.game) rebuild(); }
  function setEnabled(on) { X.enabled = !!on; if (!on) { endDrag(true); select(0); setHover(-1); } }
  function armSpend(on) { X.armSpend = !!on; X.root.classList.toggle('arm-spend', X.armSpend); select(0); if (X.armSpend) { var b = X.game.board; for (var ci = 0; ci < b.comps.length; ci++) compEl(ci).classList.toggle('can-spend', SS.board.isOpen(b, ci) && !SS.board.frontEmpty(b, ci)); } else { var all = X.shelfEl.querySelectorAll('.can-spend'); for (var i = 0; i < all.length; i++) all[i].classList.remove('can-spend'); } }

  // ---------- input ----------
  function local(ev) { var r = X.root.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  function select(id) {
    if (X.selected && X.els[X.selected]) { var old = X.els[X.selected]; old.classList.remove('sel', 'hand'); if (old._beltHome) returnToBelt(old); }
    X.selected = id && X.els[id] ? id : 0;
    if (X.selected) X.els[X.selected].classList.add('sel');
  }
  function setHover(ci, id) {
    if (X.hover === ci) return;
    if (X.hover >= 0) { var old = compEl(X.hover); if (old) old.classList.remove('target', 'full-target'); }
    X.hover = ci;
    if (ci < 0) return;
    var b = X.game.board, it = b.items[id], el = compEl(ci);
    if (!el || !it || (it.at === 'c' && it.comp === ci)) { X.hover = -1; return; }
    el.classList.add(SS.board.isOpen(b, ci) && SS.board.firstFree(b, ci) >= 0 ? 'target' : 'full-target');
  }
  /** liftFromBelt(id): moves a belt item's element into the item layer at its current position (R22). */
  function liftFromBelt(id) {
    var it = X.game.board.items[id], el = X.els[id];
    if (!it || it.at !== 'b' || !el) return null;
    var tile = parseFloat(el.style.width), r = ui.belts.itemRect(it.belt, it.cell, tile);
    if (!r) return null;
    el._beltHome = { belt: it.belt, cell: it.cell };
    el.style.transition = 'none';
    el.style.transform = 'translate3d(' + r.x.toFixed(1) + 'px,' + r.y.toFixed(1) + 'px,0)';
    X.itemsEl.appendChild(el);
    void el.offsetWidth; el.style.transition = '';
    ui.belts.reserve(it.belt, it.cell, true);
    return r;
  }
  function returnToBelt(el) {
    var home = el._beltHome; if (!home) return;
    el._beltHome = null;
    ui.belts.reserve(home.belt, home.cell, false);
    var tile = parseFloat(el.style.width), r = ui.belts.itemRect(home.belt, home.cell, tile);
    el.classList.remove('drag', 'hand', 'sel');
    if (r) { el.style.setProperty('--move-ms', '300ms'); el.style.transform = 'translate3d(' + r.x.toFixed(1) + 'px,' + r.y.toFixed(1) + 'px,0)'; }
    later(function () { if (el._beltHome === null && el.parentNode === X.itemsEl) ui.belts.setItem(home.belt, home.cell, el); }, 310);
  }
  function onDown(ev) {
    if (!X.enabled || !X.game || X.drag) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (X.handlers.onTouch) X.handlers.onTouch();
    var p = local(ev), b = X.game.board, ci = compAt(p.x, p.y);
    if (ci < 0 && X.selected && X.geo) ci = compNear(p.x, p.y, X.geo.compH * 0.55);        // a tap just beside the target still counts
    if (X.armSpend) { if (ci >= 0 && X.handlers.onSpend) { var se = X.handlers.onSpend(ci); if (se && se.length) { armSpend(false); apply(se, false); } } else armSpend(false); ev.preventDefault(); return; }
    var id = itemAt(p.x, p.y), fromBelt = false;
    if (!id) {
      var hit = ui.belts.hit(ev.clientX, ev.clientY);
      if (hit) { id = b.belts[hit.beltIndex].cells[hit.cell].item; fromBelt = !!id; if (id) ui.belts.flash(hit.beltIndex, hit.cell); }
    }
    if (id && b.items[id] && b.items[id].type === '*') {
      if (X.handlers.onCollect) { var ce = X.handlers.onCollect(id); if (ce && ce.length) apply(ce, false); }
      ev.preventDefault(); return;
    }
    if (id && b.items[id] && b.items[id].at === 'c' && !SS.board.isOpen(b, b.items[id].comp)) { if (X.handlers.onLockedTap) X.handlers.onLockedTap(b.items[id].comp); id = 0; }
    if (!id && ci >= 0 && !SS.board.isOpen(b, ci) && !X.selected) { if (X.handlers.onLockedTap) X.handlers.onLockedTap(ci); }
    else if (!id && ci >= 0 && !X.selected && backAt(ci, p.x)) { if (X.handlers.onBackTap) X.handlers.onBackTap(ci); }
    X.drag = { id: id, pid: ev.pointerId, x0: p.x, y0: p.y, moved: false, comp: ci, fromBelt: fromBelt };
    if (id) {
      var el = X.els[id], it = b.items[id];
      if (fromBelt) { if (X.selected && X.selected !== id) select(0); var r = liftFromBelt(id); if (!r) { X.drag = null; return; } X.drag.ox = p.x - r.x; X.drag.oy = p.y - r.y; }
      else { var sp = slotPos(it.comp, it.slot, parseFloat(el.style.width)); X.drag.ox = p.x - sp.x; X.drag.oy = p.y - sp.y; X.drag.from = it.comp; }
    }
    try { X.root.setPointerCapture(ev.pointerId); } catch (e) { /* older engines */ }
    ev.preventDefault();
  }
  function onMove(ev) {
    if (!X.drag || ev.pointerId !== X.drag.pid) return;
    var p = local(ev), d = X.drag;
    if (!d.moved) {
      var slop = C.TAP_SLOP_PX || 8;
      if (Math.abs(p.x - d.x0) < slop && Math.abs(p.y - d.y0) < slop) return;
      if (!d.id) return;
      d.moved = true;
      if (X.selected && X.selected !== d.id) select(0);
      var el = X.els[d.id]; el.classList.add('drag'); el.classList.remove('land', 'sel', 'hand'); X.root.classList.add('dragging');
      if (X.handlers.onPick) X.handlers.onPick(d.id);
    }
    var el2 = X.els[d.id], x = p.x - d.ox, y = p.y - d.oy - 8;
    el2.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) scale(' + (C.DRAG_LIFT || 1.12) + ')';
    setHover(compAt(p.x, p.y), d.id);
  }
  function onUp(ev) {
    if (!X.drag || ev.pointerId !== X.drag.pid) return;
    var p = local(ev), d = X.drag, b = X.game.board; X.drag = null;
    setHover(-1); X.root.classList.remove('dragging');
    if (d.moved) {
      var el = X.els[d.id], ci = dropTarget(p.x, p.y, el, typeof d.from === 'number' ? d.from : -1);
      if (ci === -2 && tryShift(d.id, p.x)) return;
      if (ci >= 0 && SS.board.canMove(b, d.id, ci)) {
        var slot = nearestFreeSlot(ci, p.x), events = X.handlers.onDrop ? X.handlers.onDrop(d.id, ci, slot) : null;
        if (events && events.length) { el.classList.remove('drag'); var home = el._beltHome; el._beltHome = null; if (home) ui.belts.reserve(home.belt, home.cell, false); apply(events, true); return; }
      }
      springBack(el, d);
      if (ci >= 0 && X.handlers.onRefused) X.handlers.onRefused(d.id, ci, refuseReason(d.id, ci));
      return;
    }
    // a tap
    if (d.id) {
      var it = b.items[d.id];
      if (X.selected && X.selected !== d.id && it && it.at === 'c' && !(b.items[X.selected].at === 'c' && b.items[X.selected].comp === it.comp) && SS.board.canMove(b, X.selected, it.comp)) { tryMove(X.selected, it.comp, p.x); if (d.fromBelt) returnToBelt(X.els[d.id]); return; }
      if (X.selected === d.id) { select(0); return; }
      select(d.id);
      if (d.fromBelt) handSpot(d.id);
      return;
    }
    if (X.selected && d.comp >= 0) { var sit = b.items[X.selected]; if (sit && sit.at === 'c' && sit.comp === d.comp) { if (!tryShift(X.selected, p.x)) select(0); } else tryMove(X.selected, d.comp, p.x); }
    else if (X.selected) select(0);
  }
  /** handSpot(id): a tap-selected belt product waits still at the belt's inner edge (R23). */
  function handSpot(id) {
    var el = X.els[id], it = X.game.board.items[id], home = el._beltHome; if (!el || !home) return;
    var bg = X.geo.belts[X.game.board.belts[home.belt].id], tile = parseFloat(el.style.width), r = ui.belts.itemRect(home.belt, home.cell, tile);
    var x = bg.axis === 'y' ? (bg.x === 0 ? bg.x + bg.w + 4 : bg.x - tile - 4) : r.x, y = bg.axis === 'y' ? Math.min(Math.max(r.y, 0), X.geo.rack.h - tile) : bg.y - tile - 4;
    el.classList.add('hand'); el.style.setProperty('--move-ms', '200ms');
    el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) scale(1.08)';
  }
  function onCancel(ev) { if (X.drag && (!ev || ev.pointerId === X.drag.pid)) endDrag(true); }
  function endDrag(spring) { if (!X.drag) return; var d = X.drag; X.drag = null; setHover(-1); X.root.classList.remove('dragging'); if (d.moved && spring && X.els[d.id]) springBack(X.els[d.id], d); }
  function springBack(el, d) {
    el.classList.remove('drag');
    if (el._beltHome) { returnToBelt(el); return; }
    el.style.setProperty('--move-ms', (C.SPRING_MS || 180) + 'ms');
    var it = X.game.board.items[d.id]; if (it && it.at === 'c') place(el, it.comp, it.slot);
  }
  function tryMove(id, ci, px) {
    var b = X.game.board;
    if (!SS.board.canMove(b, id, ci)) { if (X.handlers.onRefused) X.handlers.onRefused(id, ci, refuseReason(id, ci)); return; }
    var slot = nearestFreeSlot(ci, px), el = X.els[id], events = X.handlers.onDrop ? X.handlers.onDrop(id, ci, slot) : null;
    if (events && events.length) { X.selected = 0; if (el) { el.classList.remove('sel', 'hand'); el._beltHome = null; } apply(events, false); }
    else select(0);
  }
  function apply(events, dropped) { if (ui.boardfx) ui.boardfx.apply(events, dropped); later(syncShadows, 0); }

  ui.board = { init: init, setGame: setGame, setOptions: setOptions, layout: layout, setEnabled: setEnabled, armSpend: armSpend, rebuild: rebuild, apply: apply,
    geometry: function () { return X.geo; }, compAt: compAt, compNear: compNear, itemAt: itemAt, select: select, computeGeometry: computeGeometry, renderBack: renderBack, renderLock: renderLock,
    // shared with ui/boardfx.js (the animations need the same state, elements and geometry helpers)
    shared: { X: X, later: later, makeItem: makeItem, place: place, slotPos: slotPos, compRect: compRect, compEl: compEl, tileOf: tileOf, syncShadows: syncShadows, flashComp: flashComp } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
