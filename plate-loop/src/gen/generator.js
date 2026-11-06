// src/gen/generator.js: levels by reverse play (plan 5.4): deal, place modifiers, solve, band check, certify
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};
  var config = PL.config || (typeof require === 'function' ? require('../config.js') : null);
  var model = PL.model || (typeof require === 'function' ? require('../engine/model.js') : null);
  // gen/* files may load in any order in the browser: neighbours are looked up when first needed
  var rng, solver, bot;
  function deps() {
    rng = rng || PL.rng || (typeof require === 'function' ? require('./rng.js') : null);
    solver = solver || PL.solver || (typeof require === 'function' ? require('./solver.js') : null);
    bot = bot || PL.bot || (typeof require === 'function' ? require('./bot.js') : null);
  }

  function layoutsMod() { return PL.layouts || (typeof require === 'function' ? require('../levels/layouts.js') : null); }

  var MODS = ['pair', 'wrap', 'ice', 'lock', 'oneway'];     // the modifier kinds that count towards `mods` (hidden has its own band)
  var ALL = ['hidden', 'pair', 'wrap', 'ice', 'lock', 'oneway'];
  var ATTEMPTS = 40;                                         // derived seeds tried before generate gives up
  var SOLVE_NODES = 40000;                                   // node budget of the solver inside generate
  var IMPROVE_NODES = 3000;                                  // extra nodes spent shortening the first solution
  var LOCK_IDS = ['A', 'B', 'C'];

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function rint(r, lo, hi) { return lo + r.int(hi - lo + 1); }
  function contains(a, x) { return a.indexOf(x) >= 0; }

  // ---------------------------------------------------------------- reverse play (step 2)

  function topRun(pile) {
    var n = pile.length, c, r = 0;
    if (!n) return 0;
    c = pile[n - 1];
    while (r < n && pile[n - 1 - r] === c) r++;
    return r;
  }

  function mixed(pile) {
    var i;
    for (i = 1; i < pile.length; i++) if (pile[i] !== pile[0]) return true;
    return false;
  }

  function emptiesOf(piles) {
    var n = 0, i;
    for (i = 0; i < piles.length; i++) if (!piles[i].length) n++;
    return n;
  }

  // the dealt position is acceptable: empties in the band, nothing starts with four of a kind, enough boxes mixed,
  // one-way boxes holding at most one piece
  function dealt(piles, oneway, lo, hi) {
    var e = emptiesOf(piles), i, nonEmpty = 0, mix = 0;
    if (e < lo || e > hi) return false;
    for (i = 0; i < piles.length; i++) {
      if (!piles[i].length) continue;
      nonEmpty++;
      if (piles[i].length === 4 && !mixed(piles[i])) return false;
      if (oneway[i] && piles[i].length > 1) return false;
      if (mixed(piles[i])) mix++;
    }
    return mix * 10 >= nonEmpty * 6;
  }

  // deal({ kinds, boxes, empties: [lo, hi], oneway: n, rng, minSteps, maxSteps })
  //   -> { piles: [[kind, ...] back to front], oneway: [box index, ...] } or null
  // Starts from the solved position (every kind alone in a box of four, the other boxes empty) and plays the forward
  // move backwards: take m pieces of the front run of a box D and put them on the front of another box S that has
  // room and a different front kind (or is empty) and is not one-way. Forward that is "eject S's run, land it in D",
  // which needs D to accept: so D must be left empty or with the same kind in front (m < run, or m = everything).
  function spreadOf(piles) {
    var n = 0, i;
    for (i = 0; i < piles.length; i++) if (piles[i].length && piles[i].length < 4) n++;
    return n;
  }

  function deal(o) {
    var tries = o.tries === undefined ? 6 : o.tries, res = null;
    while (tries-- > 0 && !res) res = deal1(o);
    return res;
  }

  function deal1(o) {
    var K = o.kinds, nb = o.boxes, r = o.rng, lo = o.empties[0], hi = o.empties[1], piles = [], oneway = [], idx = [], i, j, steps = 0,
      minSteps = o.minSteps === undefined ? 2 * K : o.minSteps, cap = o.maxSteps === undefined ? 60 * K + 200 : o.maxSteps,
      cands, c, D, S, m, run, w, total, pick, e, list = [], eT, e0, sp0, e1, sp1, u0, u1, lenD, lenS;
    for (i = 0; i < nb; i++) { piles.push(i < K ? [i, i, i, i] : []); oneway.push(false); idx.push(i); }
    r.shuffle(idx);
    for (i = 0; i < (o.oneway || 0) && i < nb; i++) { oneway[idx[i]] = true; list.push(idx[i]); }
    eT = lo + r.int(hi - lo + 1);                     // the number of empty boxes the walk steers to
    while (steps < cap) {
      if (steps >= minSteps && dealt(piles, oneway, lo, hi)) return { piles: piles, oneway: list.slice().sort(function (a, b) { return a - b; }) };
      e0 = emptiesOf(piles);
      sp0 = spreadOf(piles);
      u0 = 4 * Math.abs(e0 - eT) + sp0;
      cands = [];
      total = 0;
      for (D = 0; D < nb; D++) {
        lenD = piles[D].length;
        if (!lenD) continue;
        c = piles[D][lenD - 1];
        run = topRun(piles[D]);
        for (m = 1; m <= run; m++) {
          if (!(m < run || m === lenD)) continue;
          for (S = 0; S < nb; S++) {
            lenS = piles[S].length;
            if (S === D || oneway[S] || lenS + m > 4) continue;
            if (lenS && piles[S][lenS - 1] === c) continue;
            if (!lenS && m === lenD) continue;                 // a whole box into an empty one: the same position
            w = m === 1 ? 3 : (m < run ? 2 : 1);
            if (oneway[D]) w *= lenD > 1 ? (steps >= minSteps ? 8 : 0.3) : 0.2;
            e1 = e0 + (m === lenD ? 1 : 0) - (lenS ? 0 : 1);
            sp1 = sp0 - ((lenD < 4 ? 1 : 0) + (lenS > 0 && lenS < 4 ? 1 : 0)) + ((lenD - m > 0 && lenD - m < 4) ? 1 : 0) + ((lenS + m < 4) ? 1 : 0);
            u1 = 4 * Math.abs(e1 - eT) + sp1;
            w *= Math.exp(-0.9 * (u1 - u0));
            cands.push({ D: D, S: S, m: m, w: w });
            total += w;
          }
        }
      }
      if (!cands.length) return steps >= minSteps && dealt(piles, oneway, lo, hi) ? { piles: piles, oneway: list.slice().sort(function (a, b) { return a - b; }) } : null;
      pick = r.next() * total;
      for (j = 0; j < cands.length - 1; j++) {
        pick -= cands[j].w;
        if (pick < 0) break;
      }
      c = cands[j];
      for (i = 0; i < c.m; i++) piles[c.S].push(piles[c.D].pop());
      steps++;
    }
    return null;
  }

  // ---------------------------------------------------------------- slots

  // connected chains of the layout's neighbour graph restricted to the slot ids, each ordered end to end
  function chainsOf(layout) {
    var ids = Object.keys(layout.slots), seen = {}, out = [], i, j, id, comp, stack, x, ends, cur, prev, nxt, nb;
    ids.sort();
    for (i = 0; i < ids.length; i++) {
      id = ids[i];
      if (seen[id]) continue;
      comp = [];
      stack = [id];
      seen[id] = true;
      while (stack.length) {
        x = stack.pop();
        comp.push(x);
        nb = layout.neighbours[x] || [];
        for (j = 0; j < nb.length; j++) if (!seen[nb[j]]) { seen[nb[j]] = true; stack.push(nb[j]); }
      }
      ends = comp.filter(function (q) { return (layout.neighbours[q] || []).length <= 1; });
      cur = ends.length ? ends.sort()[0] : comp.sort()[0];
      prev = null;
      id = [];
      while (cur) {
        id.push(cur);
        nxt = null;
        nb = layout.neighbours[cur] || [];
        for (j = 0; j < nb.length; j++) if (nb[j] !== prev && contains(comp, nb[j]) && !contains(id, nb[j])) { nxt = nb[j]; break; }
        prev = cur;
        cur = nxt;
      }
      out.push(id);
    }
    return out;
  }

  // pickSlots(layout, n, rng) -> n slot ids: contiguous windows of the layout's chains (columns, rows), in the layout's drawing order
  function pickSlots(layout, n, r) {
    var chains = chainsOf(layout), counts = [], free = [], i, tot = 0, pick, c, chosen = [], off, k;
    for (i = 0; i < chains.length; i++) { counts.push(0); free.push(chains[i].length); tot += chains[i].length; }
    if (n > tot) throw new Error('generator: ' + n + ' boxes do not fit layout ' + layout.name);
    for (k = 0; k < n; k++) {
      pick = r.next() * free.reduce(function (a, b) { return a + b; }, 0);
      for (c = 0; c < chains.length - 1; c++) {
        pick -= free[c];
        if (pick < 0) break;
      }
      counts[c]++;
      free[c]--;
    }
    for (i = 0; i < chains.length; i++) {
      if (!counts[i]) continue;
      off = r.int(chains[i].length - counts[i] + 1);
      for (k = 0; k < counts[i]; k++) chosen.push(chains[i][off + k]);
    }
    return layout.order.filter(function (id) { return contains(chosen, id); });
  }

  // ---------------------------------------------------------------- modifier placement (step 3)

  function enc(p) {
    if (p.hidden && p.key) return 'hk:' + p.key + ':' + p.k;
    if (p.hidden) return 'h:' + p.k;
    if (p.key) return 'k:' + p.key + ':' + p.k;
    return p.k;
  }

  function neighboursIn(layout, slots, id) {
    return (layout.neighbours[id] || []).filter(function (x) { return contains(slots, x); });
  }

  // place({ piles, slots, layout, oneway: [idx], rng, mods: [kind names to place], hidden: [lo, hi] share, allow, tier })
  //   -> { boxes: [{ id, pieces, mods? }], placed: { pair, wrap, ice, lock, oneway, hidden } }
  // piles[i] sits in slots[i]. Only the modifier kinds in `mods` are placed (and 'hidden' when `hidden` is given).
  function place(o) {
    var r = o.rng, piles = o.piles, slots = o.slots, layout = o.layout, n = piles.length, mods = o.mods || [], tier = o.tier || 'normal',
      boxes = [], cover = [], i, j, b, placed = { pair: 0, wrap: 0, ice: 0, lock: 0, oneway: 0, hidden: 0 }, locks = [], cnt, tries, cand, id, t, g, kinds, k;

    for (i = 0; i < n; i++) {
      b = { id: slots[i], pcs: [], mods: {} };
      for (j = 0; j < piles[i].length; j++) b.pcs.push({ k: piles[i][j], hidden: false, key: null, pair: false });
      boxes.push(b);
      cover.push(false);
    }

    function plainBoxes() {
      var out = [];
      for (var q = 0; q < n; q++) if (boxes[q].pcs.length && !cover[q] && !boxes[q].mods.oneway) out.push(q);
      return out;
    }

    // one-way boxes were chosen when dealing
    if (contains(mods, 'oneway')) {
      for (i = 0; i < (o.oneway || []).length; i++) { boxes[o.oneway[i]].mods.oneway = true; placed.oneway++; }
    }

    // locks: 1-2 adjacent boxes under a shutter, the key on a piece elsewhere
    if (contains(mods, 'lock')) {
      cnt = tier === 'hard' || tier === 'extreme' ? 1 + (r.next() < 0.3 ? 1 : 0) : 1;
      for (t = 0; t < cnt; t++) {
        cand = plainBoxes();
        if (!cand.length) break;
        g = [cand[r.int(cand.length)]];
        if (r.next() < 0.45) {
          kinds = neighboursIn(layout, slots, slots[g[0]]).map(function (x) { return slots.indexOf(x); }).filter(function (x) { return contains(cand, x); });
          if (kinds.length) g.push(kinds[r.int(kinds.length)]);
        }
        id = LOCK_IDS[locks.length];
        for (j = 0; j < g.length; j++) { boxes[g[j]].mods.lock = id; cover[g[j]] = true; }
        locks.push({ id: id, boxes: g });
      }
    }
    // the neighbours (box indices) of box q that are plain right now: uncovered, not one-way, in the level
    function plainNeighbours(q) {
      return neighboursIn(layout, slots, slots[q]).map(function (x) { return slots.indexOf(x); })
        .filter(function (x) { return !cover[x] && !boxes[x].mods.oneway; });
    }
    // the boxes that are the only plain neighbour of a frozen box: no later cover may take them
    function keep() {
      var out = {}, q, pn;
      for (q = 0; q < n; q++) {
        if (!boxes[q].mods.ice) continue;
        pn = plainNeighbours(q);
        if (pn.length === 1) out[pn[0]] = true;
      }
      return out;
    }
    // ice: a box that keeps at least one plain neighbour (the one that can close and thaw it); two neighbours preferred
    if (contains(mods, 'ice')) {
      cnt = rint(r, 1, 2);
      for (t = 0; t < cnt; t++) {
        kinds = keep();
        cand = plainBoxes().filter(function (q) { return !kinds[q] && plainNeighbours(q).length > 0; });
        g = cand.filter(function (q) { return plainNeighbours(q).length > 1; });
        if (g.length && r.next() < 0.7) cand = g;
        if (!cand.length) break;
        i = cand[r.int(cand.length)];
        boxes[i].mods.ice = true;
        cover[i] = true;
        placed.ice++;
      }
    }
    // wrap: a kind that the box does not hold
    if (contains(mods, 'wrap')) {
      cnt = rint(r, 1, 2);
      for (t = 0; t < cnt; t++) {
        g = keep();
        cand = plainBoxes().filter(function (q) { return !g[q]; });
        if (!cand.length) break;
        i = cand[r.int(cand.length)];
        kinds = [];
        for (k = 0; k < o.kinds; k++) if (piles[i].indexOf(k) < 0) kinds.push(k);
        if (!kinds.length) continue;
        boxes[i].mods.wrap = kinds[r.int(kinds.length)];
        cover[i] = true;
        placed.wrap++;
      }
    }
    // keys: on a piece of an uncovered box, mostly not on the front
    for (t = 0; t < locks.length; t++) {
      cand = [];
      for (i = 0; i < n; i++) {
        if (cover[i]) continue;
        for (j = 0; j < boxes[i].pcs.length; j++) {
          if (boxes[i].pcs[j].key) continue;
          cand.push({ i: i, j: j, front: j === boxes[i].pcs.length - 1 });
        }
      }
      if (!cand.length) continue;
      g = cand.filter(function (q) { return !q.front; });
      if (!g.length || r.next() < 0.2) g = cand;
      g = g[r.int(g.length)];
      boxes[g.i].pcs[g.j].key = locks[t].id;
      placed.lock++;
    }
    // bound pairs: two neighbouring pieces of one box
    if (contains(mods, 'pair')) {
      cnt = rint(r, 1, tier === 'easy' ? 2 : 3);
      for (t = 0; t < cnt; t++) {
        cand = [];
        for (i = 0; i < n; i++) {
          for (j = 0; j + 1 < boxes[i].pcs.length; j++) {
            if (boxes[i].pcs[j].pair || (j > 0 && boxes[i].pcs[j - 1].pair)) continue;
            if (boxes[i].pcs[j + 1].pair || boxes[i].pcs[j].key || boxes[i].pcs[j + 1].key) continue;
            cand.push({ i: i, j: j });
          }
        }
        if (!cand.length) break;
        g = cand[r.int(cand.length)];
        boxes[g.i].pcs[g.j].pair = true;
        placed.pair++;
      }
    }
    // hidden pieces: never the front piece (nor the mate of a bound pair at the front)
    if (o.hidden) {
      cand = [];
      for (i = 0; i < n; i++) {
        var len = boxes[i].pcs.length, top = len - 1;
        if (top >= 1 && boxes[i].pcs[top - 1].pair) top--;
        for (j = 0; j < top; j++) cand.push({ i: i, j: j });
      }
      r.shuffle(cand);
      cnt = Math.min(cand.length, o.hidden);
      for (t = 0; t < cnt; t++) { boxes[cand[t].i].pcs[cand[t].j].hidden = true; placed.hidden++; }
    }

    return {
      boxes: boxes.map(function (bx) {
        var pieces = [], q = 0, e = {}, x;
        while (q < bx.pcs.length) {
          if (bx.pcs[q].pair) { pieces.push(['p', enc(bx.pcs[q]), enc(bx.pcs[q + 1])]); q += 2; }
          else { pieces.push(enc(bx.pcs[q])); q++; }
        }
        e.id = bx.id;
        e.pieces = pieces;
        for (x in bx.mods) if (has(bx.mods, x)) { e.mods = bx.mods; break; }
        return e;
      }),
      placed: placed
    };
  }

  // ---------------------------------------------------------------- metrics and bands

  // metrics(level, solution, layout) -> { moves, tightness, forced, emptyBoxes, hiddenShare, mods, N, kinds, extraBoxes, boxes }
  function metrics(level, solution, layout) {
    deps();
    layout = layout || layoutsMod()[level.layout];
    var st = model.parse(level, { layout: layout, raw: true }), i, j, b, total = 0, hidden = 0, empty = 0, kinds = {}, pairs = 0, cur, res, ev, maxK = 0, forced = 0;
    for (i = 0; i < st.boxes.length; i++) {
      b = st.boxes[i];
      if (!b.pieces.length) empty++;
      for (j = 0; j < b.pieces.length; j++) {
        total++;
        if (b.pieces[j].hidden) hidden++;
        if (b.pieces[j].pair !== null) pairs++;
      }
      if (b.wrap !== null) kinds.wrap = true;
      if (b.ice) kinds.ice = true;
      if (b.lock !== null) kinds.lock = true;
      if (b.oneway) kinds.oneway = true;
    }
    if (pairs) kinds.pair = true;
    // tightness and forced moves along the solution
    cur = model.parse(level, { layout: layout });
    var comp = solver._internal.compile(level, layout, model.clone(cur)), sIn = comp.s0, ex, alive, c2;
    for (i = 0; i < solution.length; i++) {
      res = solver.applyMove(cur, solution[i], layout);
      ex = res.k / level.N;
      if (ex > maxK) maxK = ex;
      ex = solver._internal.expand(comp.ctx, sIn);
      alive = 0;
      for (j = 0; j < ex.length; j++) {
        if (ex[j].s[2 * comp.ctx.nb] >= comp.ctx.kinds || solver._internal.expand(comp.ctx, ex[j].s).length) alive++;
      }
      if (alive === 1) forced++;
      c2 = null;
      for (j = 0; j < ex.length; j++) {
        if (ex[j].box === solution[i].box && ex[j].dest === solution[i].dest && (ex[j].dest2 < 0 ? solution[i].dest2 === undefined : ex[j].dest2 === solution[i].dest2)) c2 = ex[j];
      }
      sIn = c2 ? c2.s : sIn;
      cur = res.state;
    }
    return {
      moves: solution.length, tightness: Math.round(maxK * 1000) / 1000, forced: forced, emptyBoxes: empty,
      hiddenShare: total ? hidden / total : 0, mods: Object.keys(kinds).length,
      N: level.N, kinds: level.kinds, boxes: level.boxes.length, extraBoxes: level.boxes.length - level.kinds
    };
  }

  function inRange(x, r) { return x >= r[0] - 1e-9 && x <= r[1] + 1e-9; }

  // inBand(metrics, tier, allow?) -> bool. allow (optional) relaxes the lower bounds a restricted level cannot reach.
  function inBand(m, tier, allow) {
    var band = config.TIERS[tier], modsLo = band.mods[0], hidLo = band.hidden[0], avail;
    if (!band) return false;
    if (allow) {
      avail = MODS.filter(function (x) { return contains(allow, x); }).length;
      if (modsLo > avail) modsLo = avail;
      if (!contains(allow, 'hidden')) hidLo = 0;
    }
    return inRange(m.N, band.N) && inRange(m.kinds, band.kinds) && inRange(m.extraBoxes, band.extraBoxes) &&
      inRange(m.emptyBoxes, band.emptyBoxes) && m.hiddenShare >= hidLo - 1e-9 && m.hiddenShare <= band.hidden[1] + 1e-9 &&
      m.mods >= modsLo && m.mods <= band.mods[1];
  }

  // ---------------------------------------------------------------- generate

  // one attempt with one derived seed -> { level, solution, metrics } or { fail: reason }
  function attempt(tier, seed, opts, band, layoutObj, name) {
    deps();
    var r = rng.create(seed), allow = opts.allow || ALL, K, extra, nb, N, dir, T, modKinds, nOne, hiddenCnt, slots, dl, perm, piles, i,
      pl, level, errs, sol, m, cert, total, lo, hi, modPool, mm, layoutNames, avail, ids;
    // size of the level
    if (opts.layoutSlots) {
      nb = opts.layoutSlots.length;
      avail = [];
      for (K = band.kinds[0]; K <= band.kinds[1]; K++) if (nb - K >= band.extraBoxes[0] && nb - K <= band.extraBoxes[1]) avail.push(K);
      if (!avail.length) return { fail: 'slots' };
      K = avail[r.int(avail.length)];
      extra = nb - K;
    } else {
      K = rint(r, band.kinds[0], band.kinds[1]);
      extra = rint(r, band.extraBoxes[0], band.extraBoxes[1]);
      nb = K + extra;
    }
    if (K > config.KIND_NAMES.length) return { fail: 'kinds' };
    if (layoutObj && !opts.layoutSlots && nb > Object.keys(layoutObj.slots).length) {    // a fixed layout too small: fewer kinds
      nb = Object.keys(layoutObj.slots).length;
      K = nb - extra;
      if (K < band.kinds[0]) return { fail: 'layout' };
    }
    N = rint(r, band.N[0], band.N[1]);
    dir = r.next() < 0.5 ? 'cw' : 'ccw';
    // layout and slots
    if (!layoutObj) {
      layoutNames = layoutsMod().list().filter(function (nm) { return Object.keys(layoutsMod()[nm].slots).length >= nb; });
      if (!layoutNames.length) return { fail: 'layout' };
      name = layoutNames[r.int(layoutNames.length)];
      layoutObj = layoutsMod()[name];
    }
    slots = opts.layoutSlots ? opts.layoutSlots.slice() : pickSlots(layoutObj, nb, r);
    // modifiers
    modPool = r.shuffle(MODS.filter(function (x) { return contains(allow, x); }));
    mm = Math.min(rint(r, band.mods[0], band.mods[1]), modPool.length);
    modKinds = modPool.slice(0, mm);
    nOne = contains(modKinds, 'oneway') ? Math.min(rint(r, 1, 2), band.emptyBoxes[1]) : 0;   // a one-way box starts empty: it is one of the band's empty boxes
    total = 4 * K;
    hiddenCnt = 0;
    if (contains(allow, 'hidden')) {
      lo = Math.ceil(band.hidden[0] * total - 1e-9);
      hi = Math.floor(band.hidden[1] * total + 1e-9);
      hiddenCnt = rint(r, lo, Math.max(lo, hi));
    }
    // deal
    dl = deal({ kinds: K, boxes: nb, empties: [band.emptyBoxes[0], band.emptyBoxes[1]], oneway: nOne, rng: r, minSteps: opts.scramble ? Math.round(2 * K * opts.scramble) : undefined });
    if (!dl) return { fail: 'deal' };
    perm = [];
    for (i = 0; i < nb; i++) perm.push(i);
    r.shuffle(perm);
    piles = [];
    for (i = 0; i < nb; i++) piles.push(dl.piles[perm[i]]);
    ids = dl.oneway.map(function (x) { return perm.indexOf(x); });
    pl = place({ piles: piles, slots: slots, layout: layoutObj, oneway: ids, rng: r, mods: modKinds, hidden: hiddenCnt, tier: tier, kinds: K });
    level = { id: opts.id || 0, tier: tier, seed: seed, layout: layoutObj.name, dir: dir, N: N, kinds: K, boxes: pl.boxes };
    errs = model.validate(level, { layout: layoutObj });
    if (errs.length) return { fail: 'validate', errs: errs };
    sol = solver.solve(level, { layout: layoutObj, maxNodes: opts.maxNodes || SOLVE_NODES, improve: IMPROVE_NODES });
    if (!sol.solvable) return { fail: sol.unknown ? 'unknown' : 'unsolvable' };
    m = metrics(level, sol.moves, layoutObj);
    if (!inBand(m, tier, allow)) return { fail: 'band' };
    cert = bot.certify(level, sol.moves, { layout: layoutObj });
    if (!cert.won) return { fail: 'certify', reason: cert.reason };
    return { level: level, solution: sol.moves, metrics: m };
  }

  // ---------------------------------------------------------------- hardness
  //
  // hardness(level, layout) -> H = -log10(pNatural) of solver.analyze: 0 = a player tapping at random wins every time,
  // 1 = wins one game in ten, 2 = one in a hundred, 3 = one in a thousand. Capped at 6. generate attaches it to the
  // level as `level.hard` (2 decimals) when it was computed.
  function hardness(level, layout) {
    deps();
    var a = solver.analyze(level, { layout: layout || layoutsMod()[level.layout], maxStates: 30000 });
    if (!a.solvable) return { H: -1, analysis: a };
    var H = Math.min(6, Math.round(100 * -Math.log10(Math.max(1e-6, a.pNatural))) / 100);
    return { H: H === 0 ? 0 : H, analysis: a };      // never -0 (JSON writes 0, strict equality would not)
  }

  // The ten difficulty levels of the endless chooser (and of the level codes): the structure band, the hardness window and
  // the time the live search may spend. 9 and 10 play with nothing hidden (luck must not decide); 10 has no upper
  // bound: the search keeps the hardest candidate it finds within its budget.
  var DIFFICULTY = [
    null,
    { tier: 'easy',    H: [0, 0.3],    budgetMs: 2500 },
    { tier: 'normal',  H: [0.5, 1.0],  budgetMs: 4000 },
    { tier: 'normal',  H: [1.0, 1.5],  budgetMs: 5000 },
    { tier: 'hard',    H: [1.3, 1.8],  budgetMs: 5000 },
    { tier: 'hard',    H: [1.8, 2.3],  budgetMs: 6000 },
    { tier: 'hard',    H: [2.2, 2.8],  budgetMs: 8000 },
    { tier: 'extreme', H: [2.5, 3.1],  budgetMs: 10000 },
    { tier: 'extreme', H: [3.0, 3.6],  budgetMs: 12000 },
    { tier: 'extreme', H: [3.5, 4.2],  budgetMs: 15000, noLuck: true },
    { tier: 'extreme', H: [4.0, 9],    budgetMs: 20000, noLuck: true, hardest: true }
  ];

  // generate({ tier, seed, layout?, allow?, layoutSlots?, id?, maxNodes?, scramble?, hardness?, hardest?, candidates?, budgetMs?, now?, onCandidate? })
  //   -> { level, solution, metrics, attempts, hard, analysis, candidates } or null
  // Without `hardness`: deterministic for (tier, seed, allow, layout, layoutSlots): up to 40 seeds derived from `seed`,
  // the first that yields a solvable, in-band, certified level wins.
  // With `hardness: [lo, hi]` (H, see hardness()): every certified candidate is analysed; the first one inside the
  // window is returned at once. When the budget runs out (`candidates` analysed candidates, default 60, or `budgetMs`
  // of wall time measured with `now()`), the candidate closest to the window is returned (above the window is
  // preferred over below it, so a search for very hard levels keeps the hardest it found). Returns null only when no
  // candidate could be made at all. With `hardest: true` the search never stops early and returns the hardest candidate
  // of the budget. `onCandidate(n, H)` is called per analysed candidate (for a progress line).
  function generate(opts) {
    deps();
    var tier = opts.tier, band = config.TIERS[tier], r, j, seed, layoutObj, res, name, fails = {}, win = opts.hardness || null,
      limit, best = null, bestScore = Infinity, h, score, t0, now = opts.now || null, made = 0;
    if (!band) throw new Error('generator: unknown tier ' + tier);
    if (opts.layout) {
      layoutObj = typeof opts.layout === 'string' ? layoutsMod()[opts.layout] : opts.layout;
      if (!layoutObj || !layoutObj.slots) throw new Error('generator: unknown layout ' + opts.layout);
      name = layoutObj.name;
    }
    r = rng.create(opts.seed);
    limit = win ? 4 * (opts.candidates || 60) + ATTEMPTS : ATTEMPTS;
    t0 = now ? now() : 0;
    for (j = 0; j < limit; j++) {
      seed = r.int(2147483647);
      res = attempt(tier, seed, opts, band, layoutObj, name);
      if (!res.level) { fails[res.fail] = (fails[res.fail] || 0) + 1; continue; }
      if (!win) { res.attempts = j + 1; return res; }
      h = hardness(res.level, layoutsMod()[res.level.layout]);
      made++;
      res.hard = h.H; res.analysis = h.analysis; res.level.hard = h.H;
      if (opts.onCandidate) opts.onCandidate(made, h.H);
      if (!opts.hardest && h.H >= win[0] && h.H <= win[1]) { res.attempts = j + 1; res.candidates = made; return res; }
      score = opts.hardest ? -h.H : (h.H > win[1] ? (h.H - win[1]) : (win[0] - h.H) * 4);     // below the window costs four times as much as above it; `hardest` keeps the maximum
      if (score < bestScore) { bestScore = score; best = res; best.attempts = j + 1; }
      if (made >= (opts.candidates || 60)) break;
      if (now && now() - t0 > (opts.budgetMs || 1e12)) break;
    }
    generate.lastFails = fails;
    if (best) { best.candidates = made; best.outside = !(best.hard >= win[0] && best.hard <= win[1]); }
    return best;
  }

  // ---------------------------------------------------------------- level codes
  //
  // A generated level is identified by its structure tier, the derived seed of the attempt that made it and the allowed
  // mechanics; replaying it is one deterministic attempt. The code the player sees is
  //     L<difficulty><flags>-<seed>        e.g. L8-1Z4K7Q, L10n-M7YRGY, L7npk-3ZZ2
  // L = code format 1 (CODE_VERSION; a later incompatible generator gets a new letter and keeps decoding old ones or
  // refuses them knowingly), difficulty 1-10, flags = the mechanics switched OFF (n hidden, p pair, w wrap, i ice,
  // k lock, o one-way; none = everything on), seed in a 32-symbol alphabet without I, L, O, U. tests/codes.test.js
  // freezes a set of codes to their level fingerprints: a change that alters a shared level fails there on purpose.
  var CODE_VERSION = 1, CODE_LETTER = 'L';
  var ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';     // 32 symbols, no I, L, O, U (typing from a photo)
  var FLAG_OF = { hidden: 'n', pair: 'p', wrap: 'w', ice: 'i', lock: 'k', oneway: 'o' };
  var MECH_OF = { n: 'hidden', p: 'pair', w: 'wrap', i: 'ice', k: 'lock', o: 'oneway' };
  // disabled(x) -> the list of mechanics switched off, from a list, a "no luck" boolean or nothing
  function disabledOf(x) {
    var out = [], i;
    if (x === true) return ['hidden'];
    if (!Array.isArray(x)) return out;
    for (i = 0; i < ALL.length; i++) if (contains(x, ALL[i])) out.push(ALL[i]);
    return out;
  }
  function encodeCode(difficulty, disabled, seed) {
    var v = seed >>> 0, out = '', list = disabledOf(disabled), flags = '', i;
    for (i = 0; i < ALL.length; i++) if (contains(list, ALL[i])) flags += FLAG_OF[ALL[i]];
    do { out = ALPHABET.charAt(v % 32) + out; v = Math.floor(v / 32); } while (v > 0);
    return CODE_LETTER + difficulty + flags + '-' + out;
  }
  function decodeCode(code) {
    var str = String(code || '').toUpperCase().replace(/\s+/g, ''), m, i, v = 0, d, seedPart, flags, disabled = [];
    m = /^L(10|[1-9])([NPWIKO]*)-([0-9A-Z]{1,7})$/.exec(str) || /^L(10|[1-9])()([0-9A-Z]{1,7})$/.exec(str);
    if (!m) return null;
    flags = m[2];
    for (i = 0; i < flags.length; i++) {
      d = MECH_OF[flags.charAt(i).toLowerCase()];
      if (!contains(disabled, d)) disabled.push(d);
    }
    seedPart = m[3].replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');     // read from a photo: O is 0, I and L are 1, U is V
    for (i = 0; i < seedPart.length; i++) {
      d = ALPHABET.indexOf(seedPart.charAt(i));
      if (d < 0) return null;
      v = v * 32 + d;
    }
    if (v > 4294967295) return null;
    return { version: CODE_VERSION, difficulty: Number(m[1]), disabled: disabledOf(disabled), noLuck: contains(disabled, 'hidden'), seed: v >>> 0 };
  }
  // allowOf(disabled | noLuck) -> the mechanics a level may use
  function allowOf(x) {
    var list = disabledOf(x);
    return ALL.filter(function (m) { return !contains(list, m); });
  }
  function replay(code) {
    deps();
    var d = typeof code === 'string' ? decodeCode(code) : code, diff, band, res, disabled;
    if (!d || !DIFFICULTY[d.difficulty]) return null;
    diff = DIFFICULTY[d.difficulty];
    band = config.TIERS[diff.tier];
    disabled = disabledOf(d.disabled || (d.noLuck ? ['hidden'] : []));
    if (diff.noLuck && !contains(disabled, 'hidden')) disabled.push('hidden');
    res = attempt(diff.tier, d.seed, { allow: allowOf(disabled) }, band, null, null);
    if (!res.level) return null;
    res.level.hard = hardness(res.level).H;
    res.disabled = disabled;
    res.code = encodeCode(d.difficulty, disabled, d.seed);
    return res;
  }

  PL.generator = {
    generate: generate, metrics: metrics, inBand: inBand, deal: deal, place: place, pickSlots: pickSlots, attempt: attempt,
    hardness: hardness, DIFFICULTY: DIFFICULTY, encodeCode: encodeCode, decodeCode: decodeCode, replay: replay, allowOf: allowOf, disabledOf: disabledOf,
    CODE_VERSION: CODE_VERSION, MECHANICS: ALL.slice(),
    ATTEMPTS: ATTEMPTS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.generator;
})(typeof window !== 'undefined' ? window : globalThis);
