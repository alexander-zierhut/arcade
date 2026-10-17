// src/game/board.js: the shelf model, v2 (DESIGN 1, 8.1). Pure: SS.board in the browser, module.exports in Node.
// A board has compartments (front row of 3 fixed slots + a queue of back layers that advance as a whole), locks that
// open after N matches, take-only belts (cells with a stack, barred after the take), golden bunnies ('*'), an orphan
// sweep (types with 1-2 copies left vanish) and the exact progress test. Items are { id, type, sil, at, comp, slot |
// belt, cell }. Positions inside a front never matter for the rules; they matter for the view only.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var MATCH_SIZE = 3, CAP = 3, BUNNY = '*';

  // ---------- creation ----------
  function emptySlots() { return [0, 0, 0]; }
  function mint(b, type, sil) { var id = b.nextId++; b.items[id] = { id: id, type: type, sil: sil || 0, at: 'c', comp: -1, slot: -1, belt: -1, cell: -1 }; return b.items[id]; }
  function layerOf(src, sils) {
    var t = [null, null, null], s = [0, 0, 0];
    for (var k = 0; k < CAP; k++) { var v = src && src[k]; t[k] = (v === undefined || v === null || v === '' || v === '.') ? null : v; s[k] = (sils && sils[k]) || 0; }
    return { t: t, sil: s };
  }

  /** createBoard(spec) -> Board.
   *  spec: { shape, rows, cols, comps: [{ layers: [[t|null|'*' x3], ...], sil?: [[0|'#hex' x3], ...], lockAt?, row, col }],
   *         belts?: [{ id, axis, appearAt?, cells: [t | { t, sil } | [ {t,sil}, ... ]] }] } */
  function createBoard(spec) {
    var b = { v: 2, shape: spec.shape || 'G', rows: spec.rows || 0, cols: spec.cols || 0, cap: CAP, comps: [], belts: [], items: {},
      remaining: {}, matchable: 0, matches: 0, bunnies: 0, swept: {}, nextId: 1, count: 0 };
    var comps = spec.comps || [], ci, k;
    for (ci = 0; ci < comps.length; ci++) {
      var c = comps[ci], layers = c.layers || [[]], sils = c.sil || [];
      var comp = { slots: emptySlots(), back: [], lockAt: c.lockAt || 0, row: c.row === undefined ? ci : c.row, col: c.col === undefined ? 0 : c.col };
      var front = layerOf(layers[0], sils[0]);
      for (k = 0; k < CAP; k++) if (front.t[k] !== null) { var it = mint(b, String(front.t[k]), front.sil[k]); it.comp = ci; it.slot = k; comp.slots[k] = it.id; }
      for (var li = 1; li < layers.length; li++) comp.back.push(layerOf(layers[li], sils[li]));
      b.comps.push(comp);
    }
    (spec.belts || []).forEach(function (bs) {
      var belt = { id: bs.id, axis: bs.axis || (bs.id === 'H' ? 'x' : 'y'), appearAt: bs.appearAt || 0, appeared: !(bs.appearAt > 0), cells: [] };
      (bs.cells || []).forEach(function (cs, k) {
        var stack = [];
        var arr = Array.isArray(cs) ? cs : [cs];
        arr.forEach(function (e) { if (e === null || e === undefined || e === '' || e === '.') return; stack.push(typeof e === 'object' ? { t: String(e.t), sil: e.sil || 0 } : { t: String(e), sil: 0 }); });
        var cell = { stack: stack, item: 0, barred: stack.length === 0 };
        if (stack.length) { var top = mint(b, stack[0].t, stack[0].sil); top.at = 'b'; top.belt = b.belts.length; top.cell = k; cell.item = top.id; }
        belt.cells.push(cell);
      });
      b.belts.push(belt);
    });
    recount(b);
    return b;
  }

  /** recount(b): rebuilds remaining, matchable and count from fronts, back layers and belt stacks. */
  function recount(b) {
    var rem = {}, ci, k, s;
    function add(t) { if (t === null || t === BUNNY) return; rem[t] = (rem[t] || 0) + 1; }
    for (ci = 0; ci < b.comps.length; ci++) {
      var c = b.comps[ci];
      for (k = 0; k < CAP; k++) if (c.slots[k]) add(b.items[c.slots[k]].type);
      for (var li = 0; li < c.back.length; li++) for (k = 0; k < CAP; k++) if (!b.swept[c.back[li].t[k]]) add(c.back[li].t[k]);
    }
    for (var bi = 0; bi < b.belts.length; bi++) for (k = 0; k < b.belts[bi].cells.length; k++) {
      var st = b.belts[bi].cells[k].stack;
      for (s = 0; s < st.length; s++) add(st[s].t);
    }
    b.remaining = rem;
    var total = 0, m = 0;
    for (var t in rem) { total += rem[t]; if (rem[t] >= MATCH_SIZE) m += rem[t]; }
    b.count = total; b.matchable = m;
    return b;
  }

  // ---------- queries ----------
  function isOpen(b, ci) { var c = b.comps[ci]; return !c.lockAt || b.matches >= c.lockAt; }
  function frontEmpty(b, ci) { var s = b.comps[ci].slots; return !s[0] && !s[1] && !s[2]; }
  function freeSlots(b, ci) { var s = b.comps[ci].slots, n = 0; for (var k = 0; k < CAP; k++) if (!s[k]) n += 1; return n; }
  function firstFree(b, ci) { var s = b.comps[ci].slots; for (var k = 0; k < CAP; k++) if (!s[k]) return k; return -1; }
  function totalFree(b) { var n = 0; for (var ci = 0; ci < b.comps.length; ci++) if (isOpen(b, ci)) n += freeSlots(b, ci); return n; }
  function typeAt(b, ci, s) { var id = b.comps[ci].slots[s]; return id ? b.items[id].type : null; }
  function item(b, id) { return b.items[id] || null; }
  /** typesIn(b, ci) -> { type: count } over the front (bunnies included under '*'). */
  function typesIn(b, ci) {
    var s = b.comps[ci].slots, out = {};
    for (var k = 0; k < CAP; k++) if (s[k]) { var t = b.items[s[k]].type; out[t] = (out[t] || 0) + 1; }
    return out;
  }
  function matchIn(b, ci) {
    var counts = typesIn(b, ci);
    for (var t in counts) if (t !== BUNNY && counts[t] >= MATCH_SIZE) return t;
    return null;
  }
  function beltAvailable(b, bi, k) { var belt = b.belts[bi]; return !!(belt && belt.appeared && belt.cells[k] && !belt.cells[k].barred && belt.cells[k].item); }
  /** counts(b) -> { F, c: {t: n}, s: {t: n}, Hk, bunnyReachable, spendable } in one pass (DESIGN 1.9). */
  function counts(b) {
    var F = 0, c = {}, s = {}, Hk = 0, bunny = false, spendable = false, ci, k;
    for (ci = 0; ci < b.comps.length; ci++) {
      if (!isOpen(b, ci)) continue;
      var comp = b.comps[ci], filled = 0;
      for (k = 0; k < CAP; k++) {
        var id = comp.slots[k];
        if (!id) { F += 1; continue; }
        filled += 1;
        var t = b.items[id].type;
        if (t === BUNNY) bunny = true; else { c[t] = (c[t] || 0) + 1; spendable = true; }
      }
      if (comp.back.length) Hk += 1;
    }
    for (var bi = 0; bi < b.belts.length; bi++) {
      var belt = b.belts[bi];
      if (!belt.appeared) continue;
      for (k = 0; k < belt.cells.length; k++) {
        var cell = belt.cells[k];
        if (cell.barred || !cell.item) continue;
        var tt = b.items[cell.item].type;
        if (tt === BUNNY) bunny = true; else s[tt] = (s[tt] || 0) + 1;
      }
    }
    return { F: F, c: c, s: s, Hk: Hk, bunnyReachable: bunny, spendable: spendable };
  }
  /** progressPossible(b): exact test of DESIGN 1.9. */
  function progressPossible(b) {
    if (b.matchable === 0) return true;                       // already won
    var q = counts(b), t;
    if (b.bunnies > 0 && q.spendable) return true;
    if (q.bunnyReachable) return true;
    if (q.F < 1) return false;
    for (t in q.c) { var ct = Math.min(q.c[t], 3); if (q.c[t] + (q.s[t] || 0) >= 3 && q.F >= 3 - ct) return true; }
    for (t in q.s) if (!q.c[t] && q.s[t] >= 3 && q.F >= 3) return true;
    return q.F >= 3 && q.Hk > 0;
  }
  function isCleared(b) { return b.matchable === 0; }

  // ---------- actions (no reveal here: game.js orchestrates reveals, sweeps and thresholds) ----------
  function canMove(b, itemId, toComp, toSlot) {
    var it = b.items[itemId];
    if (!it || toComp < 0 || toComp >= b.comps.length || !isOpen(b, toComp)) return false;
    if (it.type === BUNNY) return false;
    if (it.at === 'c') { if (toComp === it.comp || !isOpen(b, it.comp)) return false; }
    else if (!beltAvailable(b, it.belt, it.cell)) return false;
    if (typeof toSlot === 'number' && toSlot >= 0) return toSlot < CAP && !b.comps[toComp].slots[toSlot];
    return firstFree(b, toComp) >= 0;
  }
  function removeItem(b, id) {
    var it = b.items[id];
    if (!it) return null;
    if (it.at === 'c') { if (it.comp >= 0 && b.comps[it.comp].slots[it.slot] === id) b.comps[it.comp].slots[it.slot] = 0; }
    else { var cell = b.belts[it.belt].cells[it.cell]; if (cell.item === id) { cell.item = 0; cell.stack.shift(); } }
    delete b.items[id];
    if (it.type !== BUNNY) { b.remaining[it.type] = (b.remaining[it.type] || 1) - 1; if (b.remaining[it.type] <= 0) delete b.remaining[it.type]; b.count -= 1; }
    return it;
  }
  /** bar(b, bi, k, reason) -> bar event or null: bars an empty cell; a non-empty stack gets a new top item instead. */
  function bar(b, bi, k, reason) {
    var cell = b.belts[bi].cells[k];
    if (cell.stack.length) { var top = mint(b, cell.stack[0].t, cell.stack[0].sil); top.at = 'b'; top.belt = bi; top.cell = k; cell.item = top.id; return null; }
    if (cell.barred) return null;
    cell.barred = true;
    return { type: 'bar', belt: b.belts[bi].id, beltIndex: bi, cell: k, reason: reason };
  }
  function clearMatch(b, ci, type) {
    var slots = b.comps[ci].slots, items = [], where = [];
    for (var s = 0; s < CAP && items.length < MATCH_SIZE; s++) {
      var id = slots[s];
      if (id && b.items[id].type === type) { items.push(id); where.push(s); removeItem(b, id); }
    }
    b.matches += 1;
    refreshMatchable(b);
    return { type: 'match', comp: ci, product: type, items: items, slots: where };
  }
  function refreshMatchable(b) { var m = 0; for (var t in b.remaining) if (b.remaining[t] >= MATCH_SIZE) m += b.remaining[t]; b.matchable = m; }

  /** move(b, itemId, toComp, toSlot?) -> [move|take, bar?, match?] or null. */
  function move(b, itemId, toComp, toSlot) {
    if (!canMove(b, itemId, toComp, toSlot)) return null;
    var it = b.items[itemId], events = [];
    var dest = (typeof toSlot === 'number' && toSlot >= 0) ? toSlot : firstFree(b, toComp);
    if (it.at === 'c') {
      b.comps[it.comp].slots[it.slot] = 0;
      events.push({ type: 'move', item: it.id, product: it.type, from: it.comp, fromSlot: it.slot, to: toComp, toSlot: dest });
    } else {
      var bi = it.belt, k = it.cell, cell = b.belts[bi].cells[k];
      cell.item = 0; cell.stack.shift();
      events.push({ type: 'take', item: it.id, product: it.type, belt: b.belts[bi].id, beltIndex: bi, cell: k, to: toComp, toSlot: dest });
      var be = bar(b, bi, k, 'take'); if (be) events.push(be);
    }
    it.at = 'c'; it.comp = toComp; it.slot = dest; it.belt = -1; it.cell = -1;
    b.comps[toComp].slots[dest] = it.id;
    var m = matchIn(b, toComp);
    if (m) events.push(clearMatch(b, toComp, m));
    return events;
  }

  /** canShift(b, itemId, toSlot): a front product may be rearranged to a free slot of its own compartment (v0.3.1, owner). */
  function canShift(b, itemId, toSlot) {
    var it = b.items[itemId];
    return !!(it && it.at === 'c' && it.type !== BUNNY && isOpen(b, it.comp) && toSlot >= 0 && toSlot < CAP && toSlot !== it.slot && !b.comps[it.comp].slots[toSlot]);
  }
  /** shift(b, itemId, toSlot) -> [shift] or null: moves a product within its compartment; nothing else changes. */
  function shift(b, itemId, toSlot) {
    if (!canShift(b, itemId, toSlot)) return null;
    var it = b.items[itemId], from = it.slot;
    b.comps[it.comp].slots[from] = 0; b.comps[it.comp].slots[toSlot] = it.id; it.slot = toSlot;
    return [{ type: 'shift', item: it.id, product: it.type, comp: it.comp, fromSlot: from, toSlot: toSlot }];
  }
  /** reveal(b, ci) -> reveal events (0..n): advances back layers while the front is empty (DESIGN R-L1..R-L3). */
  function reveal(b, ci) {
    var comp = b.comps[ci], events = [];
    while (frontEmpty(b, ci) && comp.back.length) {
      var layer = comp.back.shift(), placed = [];
      for (var k = 0; k < CAP; k++) {
        var t = layer.t[k];
        if (t === null || (t !== BUNNY && b.swept[t])) continue;
        var it = mint(b, t, layer.sil[k]); it.comp = ci; it.slot = k; comp.slots[k] = it.id;
        placed.push({ id: it.id, product: t, slot: k, sil: it.sil });
      }
      if (!placed.length) continue;                            // a layer emptied by the sweep: skip it
      var next = comp.back.length ? comp.back[0] : null, nextOut = [];
      if (next) for (var j = 0; j < CAP; j++) if (next.t[j] !== null && (next.t[j] === BUNNY || !b.swept[next.t[j]])) nextOut.push({ product: next.t[j], slot: j, sil: next.sil[j] });
      events.push({ type: 'reveal', comp: ci, layer: placed, next: nextOut, depthLeft: comp.back.length });
    }
    return events;
  }

  /** collect(b, ref) -> [collect, bar?] or null. ref = { comp, slot } | { belt (index), cell } | { item }. */
  function collect(b, ref) {
    var id = ref.item || (ref.comp !== undefined ? b.comps[ref.comp].slots[ref.slot] : b.belts[ref.belt].cells[ref.cell].item);
    var it = b.items[id];
    if (!it || it.type !== BUNNY) return null;
    if (it.at === 'c' ? !isOpen(b, it.comp) : !beltAvailable(b, it.belt, it.cell)) return null;
    var where = it.at === 'c' ? { where: 'comp', comp: it.comp, slot: it.slot } : { where: 'belt', belt: b.belts[it.belt].id, beltIndex: it.belt, cell: it.cell };
    removeItem(b, id);
    b.bunnies += 1;
    var events = [{ type: 'collect', item: id, where: where.where, ref: where, bunnies: b.bunnies }];
    if (where.where === 'belt') { var be = bar(b, where.beltIndex, where.cell, 'collect'); if (be) events.push(be); }
    return events;
  }
  /** spend(b, ci) -> [spend] or null: clears the WHOLE compartment (front and every back layer) of an open compartment
   *  that holds at least one product (owner: the bunny "frees a compartment"). Bunnies inside are collected. */
  function spend(b, ci) {
    if (b.bunnies < 1 || ci < 0 || ci >= b.comps.length || !isOpen(b, ci)) return null;
    var comp = b.comps[ci], slots = comp.slots, removed = [], hasProduct = false, k, li;
    for (k = 0; k < CAP; k++) if (slots[k] && b.items[slots[k]].type !== BUNNY) hasProduct = true;
    for (li = 0; li < comp.back.length && !hasProduct; li++) for (k = 0; k < CAP; k++) if (comp.back[li].t[k] !== null && comp.back[li].t[k] !== BUNNY) hasProduct = true;
    if (!hasProduct) return null;
    for (k = 0; k < CAP; k++) if (slots[k]) { var it = removeItem(b, slots[k]); removed.push({ id: it.id, product: it.type, slot: k }); if (it.type === BUNNY) b.bunnies += 1; }
    var hidden = 0;
    for (li = 0; li < comp.back.length; li++) for (k = 0; k < CAP; k++) { var t = comp.back[li].t[k]; if (t === null) continue; if (t === BUNNY) b.bunnies += 1; else hidden += 1; }
    comp.back = [];
    b.bunnies -= 1;
    recount(b);
    return [{ type: 'spend', comp: ci, removed: removed, hidden: hidden, bunnies: b.bunnies }];
  }
  /** sweepOrphans(b) -> [sweep?, bar*]: removes every reachable copy of types with 1-2 copies left (DESIGN R-W2). */
  function sweepOrphans(b) {
    var orphans = [], t, events = [];
    for (t in b.remaining) if (b.remaining[t] >= 1 && b.remaining[t] < MATCH_SIZE) orphans.push(t);
    if (!orphans.length) return events;
    var gone = [], ci, k, bi;
    orphans.forEach(function (o) { b.swept[o] = 1; });
    for (var id in b.items) {
      var it = b.items[id];
      if (b.swept[it.type]) {
        gone.push(it.at === 'c' ? { id: it.id, product: it.type, comp: it.comp, slot: it.slot } : { id: it.id, product: it.type, belt: b.belts[it.belt].id, beltIndex: it.belt, cell: it.cell });
        var at = it.at, bi2 = it.belt, cell = it.cell;
        removeItem(b, it.id);
        if (at === 'b') { var be = bar(b, bi2, cell, 'orphan'); if (be) events.push(be); }
      }
    }
    orphans.forEach(function (o) { delete b.remaining[o]; });
    for (bi = 0; bi < b.belts.length; bi++) for (k = 0; k < b.belts[bi].cells.length; k++) {       // hidden stack copies
      var st = b.belts[bi].cells[k].stack;
      for (var s = st.length - 1; s >= 0; s--) if (b.swept[st[s].t]) st.splice(s, 1);
    }
    recount(b);
    for (ci = 0; ci < b.comps.length; ci++) { /* back-layer copies are dropped on reveal (R-L3) */ }
    events.unshift({ type: 'sweep', products: orphans, items: gone });
    return events;
  }
  /** applyThresholds(b, prevMatches) -> [lockTick*, unlock*, beltAppear*] after matches changed. */
  function applyThresholds(b, prevMatches) {
    var events = [], ci, bi;
    if (b.matches === prevMatches) return events;
    for (ci = 0; ci < b.comps.length; ci++) {
      var c = b.comps[ci];
      if (!c.lockAt) continue;
      if (b.matches >= c.lockAt) { c.lockAt = 0; events.push({ type: 'unlock', comp: ci }); }
      else events.push({ type: 'lockTick', comp: ci, left: c.lockAt - b.matches });
    }
    for (bi = 0; bi < b.belts.length; bi++) {
      var belt = b.belts[bi];
      if (!belt.appeared && b.matches >= belt.appearAt) { belt.appeared = true; events.push({ type: 'beltAppear', belt: belt.id, beltIndex: bi }); }
    }
    return events;
  }
  /** resolve(b, prevMatches, swept) -> events in the normative order after an action (DESIGN 2.2 steps 3-5):
   *  reveal loop over every open compartment (reveal*, cascade match*), then the orphan sweep when a non-match removal
   *  happened (sweep, bar*, reveals again), then thresholds (lockTick*, unlock*, beltAppear*) with one more reveal loop
   *  for compartments that just opened. */
  function resolve(b, prevMatches, swept) {
    var events = [], guard = 0;
    function revealLoop() {
      var changed = true;
      while (changed && guard++ < 200) {
        changed = false;
        for (var ci = 0; ci < b.comps.length; ci++) {
          if (!isOpen(b, ci) || !frontEmpty(b, ci) || !b.comps[ci].back.length) continue;
          var ev = reveal(b, ci);
          if (!ev.length) continue;
          changed = true;
          for (var i = 0; i < ev.length; i++) events.push(ev[i]);
          var m;
          while ((m = matchIn(b, ci))) { var me = clearMatch(b, ci, m); me.cascade = true; events.push(me); changed = true; }
        }
      }
    }
    revealLoop();
    if (swept) { var se = sweepOrphans(b); for (var k = 0; k < se.length; k++) events.push(se[k]); if (se.length) revealLoop(); }
    var th = applyThresholds(b, prevMatches);
    for (var j = 0; j < th.length; j++) events.push(th[j]);
    if (th.length) revealLoop();
    return events;
  }

  /** resolveAll(b): clears triples present at creation (v1 behaviour); returns match events. */
  function resolveAll(b) {
    var events = [];
    for (var ci = 0; ci < b.comps.length; ci++) { var m; while ((m = matchIn(b, ci))) events.push(clearMatch(b, ci, m)); }
    return events;
  }

  // ---------- serialisation ----------
  function snapshot(b) {
    var comps = b.comps.map(function (c) {
      var front = [];
      for (var k = 0; k < CAP; k++) { var id = c.slots[k]; front.push(id ? { t: b.items[id].type, sil: b.items[id].sil || 0 } : null); }
      return { front: front, back: c.back.map(function (l) { return { t: l.t.slice(), sil: l.sil.slice() }; }), lockAt: c.lockAt, row: c.row, col: c.col };
    });
    var belts = b.belts.map(function (belt) {
      return { id: belt.id, axis: belt.axis, appearAt: belt.appearAt, appeared: belt.appeared,
        cells: belt.cells.map(function (cell) { return { stack: cell.stack.map(function (e) { return { t: e.t, sil: e.sil || 0 }; }), barred: cell.barred }; }) };
    });
    return { v: 2, shape: b.shape, rows: b.rows, cols: b.cols, comps: comps, belts: belts, matches: b.matches, bunnies: b.bunnies, swept: b.swept };
  }
  function restore(snap) {
    var spec = { shape: snap.shape, rows: snap.rows, cols: snap.cols, comps: [], belts: [] };
    snap.comps.forEach(function (c) {
      var layers = [c.front.map(function (e) { return e ? e.t : null; })].concat(c.back.map(function (l) { return l.t; }));
      var sils = [c.front.map(function (e) { return e ? e.sil : 0; })].concat(c.back.map(function (l) { return l.sil; }));
      spec.comps.push({ layers: layers, sil: sils, lockAt: c.lockAt, row: c.row, col: c.col });
    });
    snap.belts.forEach(function (belt) { spec.belts.push({ id: belt.id, axis: belt.axis, appearAt: belt.appearAt, cells: belt.cells.map(function (cell) { return cell.stack; }) }); });
    var b = createBoard(spec);
    b.matches = snap.matches || 0; b.bunnies = snap.bunnies || 0; b.swept = snap.swept || {};
    snap.belts.forEach(function (belt, bi) { b.belts[bi].appeared = belt.appeared; belt.cells.forEach(function (cell, k) { if (cell.barred) b.belts[bi].cells[k].barred = true; }); });
    recount(b);
    return b;
  }
  /** clone(b): structural deep copy that keeps item ids (undo, search and the view rely on stable ids). */
  function clone(b) {
    var c = { v: 2, shape: b.shape, rows: b.rows, cols: b.cols, cap: b.cap, comps: [], belts: [], items: {}, remaining: {}, matchable: b.matchable, matches: b.matches, bunnies: b.bunnies, swept: {}, nextId: b.nextId, count: b.count };
    var ci, k, id;
    for (ci = 0; ci < b.comps.length; ci++) {
      var o = b.comps[ci];
      c.comps.push({ slots: o.slots.slice(), back: o.back.map(function (l) { return { t: l.t.slice(), sil: l.sil.slice() }; }), lockAt: o.lockAt, row: o.row, col: o.col });
    }
    for (k = 0; k < b.belts.length; k++) {
      var belt = b.belts[k];
      c.belts.push({ id: belt.id, axis: belt.axis, appearAt: belt.appearAt, appeared: belt.appeared, cells: belt.cells.map(function (cell) { return { stack: cell.stack.map(function (e) { return { t: e.t, sil: e.sil }; }), item: cell.item, barred: cell.barred }; }) });
    }
    for (id in b.items) { var it = b.items[id]; c.items[id] = { id: it.id, type: it.type, sil: it.sil, at: it.at, comp: it.comp, slot: it.slot, belt: it.belt, cell: it.cell }; }
    for (var t in b.remaining) c.remaining[t] = b.remaining[t];
    for (var w in b.swept) c.swept[w] = b.swept[w];
    return c;
  }
  function hash(b) {
    var parts = [];
    for (var ci = 0; ci < b.comps.length; ci++) {
      var c = b.comps[ci], row = [];
      for (var k = 0; k < CAP; k++) row.push(c.slots[k] ? b.items[c.slots[k]].type : '-');
      parts.push(row.join(',') + (c.back.length ? '/' + c.back.length : '') + (c.lockAt && b.matches < c.lockAt ? '!' : ''));
    }
    var belts = b.belts.map(function (belt) { return belt.id + (belt.appeared ? '' : '?') + ':' + belt.cells.map(function (cell) { return cell.barred ? 'x' : (cell.item ? b.items[cell.item].type : '-'); }).join(','); });
    return parts.join('|') + (belts.length ? '#' + belts.join(';') : '') + '#m' + b.matches + 'b' + b.bunnies;
  }
  function canonical(b) {
    var parts = [];
    for (var ci = 0; ci < b.comps.length; ci++) {
      var c = b.comps[ci], row = [];
      for (var k = 0; k < CAP; k++) if (c.slots[k]) row.push(b.items[c.slots[k]].type);
      row.sort();
      parts.push(row.join(',') + '/' + c.back.length);
    }
    parts.sort();
    return parts.join('|');
  }
  /** legalMoves(b) -> [{ item, to }] (centre moves and takes; collects excluded). */
  function legalMoves(b) {
    var out = [], free = [], ci;
    for (ci = 0; ci < b.comps.length; ci++) free.push(isOpen(b, ci) && firstFree(b, ci) >= 0);
    for (var id in b.items) {
      var it = b.items[id];
      if (it.type === BUNNY) continue;
      if (it.at === 'c' ? !isOpen(b, it.comp) : !beltAvailable(b, it.belt, it.cell)) continue;
      for (ci = 0; ci < b.comps.length; ci++) if (free[ci] && !(it.at === 'c' && ci === it.comp)) out.push({ item: it.id, to: ci });
    }
    return out;
  }

  var board = {
    MATCH_SIZE: MATCH_SIZE, CAP: CAP, BUNNY: BUNNY,
    createBoard: createBoard, recount: recount, item: item, typeAt: typeAt,
    isOpen: isOpen, frontEmpty: frontEmpty, freeSlots: freeSlots, firstFree: firstFree, totalFree: totalFree, typesIn: typesIn, matchIn: matchIn,
    beltAvailable: beltAvailable, counts: counts, progressPossible: progressPossible, isCleared: isCleared,
    canMove: canMove, canShift: canShift, shift: shift, move: move, clearMatch: clearMatch, reveal: reveal, collect: collect, spend: spend, sweepOrphans: sweepOrphans,
    applyThresholds: applyThresholds, resolve: resolve, resolveAll: resolveAll, bar: bar,
    snapshot: snapshot, restore: restore, clone: clone, hash: hash, canonical: canonical, legalMoves: legalMoves
  };
  SS.board = board;
  if (typeof module !== 'undefined' && module.exports) module.exports = board;
})(typeof globalThis !== 'undefined' ? globalThis : this);
