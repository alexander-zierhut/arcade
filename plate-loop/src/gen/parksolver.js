// src/gen/parksolver.js: the strict solver extended by a parking lot (plan R29c).
//
// The strict solver (solver.js) only moves a run that has a destination. On the real belt a run without a home can be
// sent anyway: its pieces ride until a box accepts them, and that is how the original's hard levels are played (the
// loop as a buffer, "never back to zero until the end"). This solver adds exactly that to the strict model: a state is
// the boxes plus the parked pieces (a multiset of kinds, at most N, the plates they occupy); a move is either a strict
// move (solver.expand: a run to a destination, kicks through empty boxes) or a park (tap a box: its run goes to the
// lot, as far as free plates allow); after every move the lot drains: a parked piece lands in the first box (by belt
// order from the tapped box) that accepts its kind, repeated until nothing lands. The search is the strict solver's
// depth-first walk with a transposition table. A plan is a tap sequence; it is realised on the real belt by guided
// play (simsolver.playGuided re-plans from the real position after every tap), which is the certification.
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};
  var model = PL.model || (typeof require === 'function' ? require('../engine/model.js') : null);
  var solver = PL.solver || (typeof require === 'function' ? require('./solver.js') : null);
  function layoutsMod() { return PL.layouts || (typeof require === 'function' ? require('../levels/layouts.js') : null); }

  var I = solver._internal, cnt = I.cnt, pcAt = I.pcAt;

  function runOf(c, free) {          // the front run of content c that fits on `free` plates (hidden ends it, pairs need 2)
    var n = cnt(c), i = n - 1, kinds = [], first = true, p, kb, k0;
    if (!n || free <= 0) return kinds;
    k0 = (pcAt(c, i) & 15) - 1;
    while (i >= 0) {
      p = pcAt(c, i);
      if (!first && (p & 128)) break;
      if (i >= 1 && (pcAt(c, i - 1) & 16)) {
        kb = (pcAt(c, i - 1) & 15) - 1;
        if (!first && (((p & 15) - 1) !== k0 || kb !== k0 || (pcAt(c, i - 1) & 128))) break;
        if (kinds.length + 2 > free) break;
        kinds.push((p & 15) - 1, kb); i -= 2;
        if (first && kb !== k0) break;
      } else {
        if (!first && ((p & 15) - 1) !== k0) break;
        if (kinds.length + 1 > free) break;
        kinds.push((p & 15) - 1); i -= 1;
      }
      first = false;
    }
    return kinds;
  }
  function take(ctx, t, b, k) {
    var c = t[2 * b], n = cnt(c), keep = n - k;
    t[2 * b] = keep <= 0 ? 0 : (keep >= 4 ? c : (c & ((1 << (8 * keep)) - 1)));
    if (ctx.hasKeys || ctx.hasHidden) I.settleBox(ctx, t, b);
  }
  function accepts(t, X, c) {
    var n;
    if (t[2 * X + 1]) return false;
    n = cnt(t[2 * X]);
    return n === 0 || (n < 4 && ((pcAt(t[2 * X], n - 1) & 15) - 1) === c);
  }
  // the lot drains: parked pieces land where a box accepts them (matching boxes before empty ones, belt order from `from`)
  function drain(ctx, t, lot, order, from) {
    var changed = true, i, j, X, ord, c, n, landed = false;
    while (changed) {
      changed = false;
      for (i = 0; i < lot.length; i++) {
        c = lot[i]; ord = order[from];
        var dest = -1, emptyDest = -1;
        for (j = 0; j < ord.length; j++) {
          X = ord[j];
          if (!accepts(t, X, c)) continue;
          n = cnt(t[2 * X]);
          if (n > 0) { dest = X; break; }
          if (emptyDest < 0 && !ctx.oneway[X]) emptyDest = X;
        }
        if (dest < 0) dest = emptyDest;
        if (dest < 0) continue;
        I.land(ctx, t, dest, c, 1);
        lot.splice(i, 1); i--; changed = true; landed = true;
      }
    }
    return landed;
  }
  function keyOf(ctx, t, lot) {
    return I.keyOf(ctx, t) + '|' + lot.slice().sort(function (a, b) { return a - b; }).join(',');
  }
  function expand(ctx, t, lot, N, order) {
    var out = [], ch, i, b, run, t2, lot2, before = t[2 * ctx.nb];
    if (!lot.length) {                                    // strict moves need an empty belt
      ch = I.expand(ctx, t);
      for (i = 0; i < ch.length; i++) out.push({ box: ch[i].box, t: ch[i].s, lot: [], score: (ch[i].s[2 * ctx.nb] - before) * 100 + ch[i].score / 10 });
    }
    for (b = 0; b < ctx.nb; b++) {                        // park moves: the run rides, the lot drains
      if (t[2 * b + 1] || ctx.oneway[b] || !t[2 * b]) continue;
      run = runOf(t[2 * b], N - lot.length);
      if (!run.length) continue;
      t2 = t.slice(); take(ctx, t2, b, run.length);
      lot2 = lot.concat(run);
      drain(ctx, t2, lot2, order, b);
      out.push({ box: b, t: t2, lot: lot2, score: (t2[2 * ctx.nb] - before) * 100 - lot2.length * 4 - 1 });
    }
    return out;
  }

  // solve(level, { layout, maxNodes = 30000, from? }) -> { solvable: true, taps: [box...], nodes } | { solvable: false, nodes } | { unknown: true, nodes }
  // `from`: a real sim; its riders become the lot, its outboxes too.
  function solve(level, opts) {
    var o = opts || {}, layout = o.layout || layoutsMod()[level.layout], st0, comp, ctx, nb, N = o.capacity || level.N, order, maxNodes = o.maxNodes || 30000,
      nodes = 0, tt = new Set(), path = [], aborted = false, lot0 = [], i, q, t0, noise = o.rng ? (o.noise || 3) : 0;
    if (o.from) {
      st0 = model.clone(o.from.state);
      for (i = 0; i < st0.belt.length; i++) if (st0.belt[i]) { lot0.push(st0.belt[i].k); st0.belt[i] = null; }
      for (i = 0; i < st0.boxes.length; i++) { for (q = 0; q < st0.boxes[i].outbox.length; q++) lot0.push(st0.boxes[i].outbox[q].k); st0.boxes[i].outbox = []; st0.boxes[i].pending = 0; }
    }
    comp = I.compile(level, layout, st0); ctx = comp.ctx; nb = ctx.nb;
    order = solver.downstream(level, layout, nb, 1e-6);
    t0 = comp.s0.slice();
    if (lot0.length) drain(ctx, t0, lot0, order, 0);
    function dfs(t, lot, depth) {
      var k, ch, i;
      if (t[2 * nb] >= ctx.kinds) return true;
      if (aborted || depth > 300) return false;
      k = keyOf(ctx, t, lot);
      if (tt.has(k)) return false;
      if (++nodes > maxNodes) { aborted = true; return false; }
      tt.add(k);
      ch = expand(ctx, t, lot, N, order);
      if (noise) for (i = 0; i < ch.length; i++) ch[i].score += o.rng.next() * noise;   // a limited, fallible planner: random ties
      ch.sort(function (a, b) { return b.score - a.score; });
      for (i = 0; i < ch.length; i++) {
        path.push(ch[i].box);
        if (dfs(ch[i].t, ch[i].lot, depth + 1)) return true;
        path.pop();
        if (aborted) return false;
      }
      return false;
    }
    if (t0[2 * nb] >= ctx.kinds) return { solvable: true, taps: [], nodes: 0 };
    if (dfs(t0, lot0, 0)) return { solvable: true, taps: path.slice(), nodes: nodes };
    if (aborted) return { unknown: true, nodes: nodes };
    return { solvable: false, nodes: nodes };
  }

  // analyze(level, { layout, maxStates = 60000, lookahead }) -> { solvable, states, capped, look: { k: win chance } }
  // The whole position graph of the parking model (boxes + lot), with the lookahead players of solver.analyze: a player
  // who never makes a move that is provably lost within k plies and picks uniformly among the rest. Because the lot is
  // in the model, this is the planning-depth measure that fits buffer levels (and strict ones, which it contains).
  function analyze(level, opts) {
    var o = opts || {}, layout = o.layout || layoutsMod()[level.layout], comp = I.compile(level, layout), ctx = comp.ctx, nb = ctx.nb, N = level.N,
      order = solver.downstream(level, layout, nb, 1e-6), maxStates = o.maxStates || 60000, states = [], lots = [], index = new Map(), out = [], capped = false,
      i, j, k, s, ch, won, win, changed, look = {}, dead, nd, ks, kmax, filtered, cur, it, delta, acc, nv, v, m, n;
    function id(t, lot) {
      var kk = keyOf(ctx, t, lot), ix = index.get(kk);
      if (ix !== undefined) return ix;
      if (states.length >= maxStates) { capped = true; return -1; }
      ix = states.length; index.set(kk, ix); states.push(t); lots.push(lot);
      return ix;
    }
    id(comp.s0, []);
    for (i = 0; i < states.length; i++) {
      s = states[i];
      if (s[2 * nb] >= ctx.kinds) { out.push([]); continue; }
      ch = expand(ctx, s, lots[i], N, order);
      cur = [];
      for (j = 0; j < ch.length; j++) { k = id(ch[j].t, ch[j].lot); if (k >= 0 && cur.indexOf(k) < 0) cur.push(k); }
      out.push(cur);
    }
    won = []; for (i = 0; i < states.length; i++) won.push(states[i][2 * nb] >= ctx.kinds);
    win = won.slice(); changed = true;
    while (changed) { changed = false; for (i = 0; i < states.length; i++) { if (win[i]) continue; for (j = 0; j < out[i].length; j++) if (win[out[i][j]]) { win[i] = true; changed = true; break; } } }
    function iterate(adj) {
      v = []; for (m = 0; m < states.length; m++) v.push(won[m] ? 1 : 0);
      for (it = 0; it < 600; it++) {
        delta = 0;
        for (m = 0; m < states.length; m++) {
          if (won[m] || !win[m] || !adj[m].length) continue;
          acc = 0; for (n = 0; n < adj[m].length; n++) acc += v[adj[m][n]];
          nv = acc / adj[m].length; if (Math.abs(nv - v[m]) > delta) delta = Math.abs(nv - v[m]); v[m] = nv;
        }
        if (delta < 1e-6) break;
      }
      return v[0];
    }
    if (win[0] && !capped) {
      dead = []; for (i = 0; i < states.length; i++) dead.push(!win[i] && !won[i] && out[i].length === 0);
      ks = o.lookahead || [0, 2, 4, 6, 8, 12, 16]; kmax = ks[ks.length - 1];
      for (k = 0; k <= kmax; k++) {
        if (k > 0) { nd = []; for (i = 0; i < states.length; i++) { if (won[i]) { nd.push(false); continue; } if (!out[i].length) { nd.push(true); continue; } for (j = 0; j < out[i].length && dead[out[i][j]]; j++) { /* count */ } nd.push(j === out[i].length); } dead = nd; }
        if (ks.indexOf(k) < 0) continue;
        filtered = [];
        for (i = 0; i < states.length; i++) { cur = []; for (j = 0; j < out[i].length; j++) if (!dead[out[i][j]]) cur.push(out[i][j]); filtered.push(cur.length ? cur : out[i]); }
        look[k] = iterate(filtered);
      }
    }
    return { solvable: win[0], states: states.length, capped: capped, look: look };
  }

  // depth(level, { layout }) -> the smallest lot capacity (1..N) at which the level is solvable, or 0 (strict) or -1 (none)
  // A level that needs all N slots of the belt in flight at once has no slack at all (the original's "only 4 slots").
  function depth(level, opts) {
    var o = opts || {}, c, r;
    for (c = 0; c <= level.N; c++) {
      r = solve(level, { layout: o.layout, capacity: c || 0.5, maxNodes: o.maxNodes || 30000 });   // capacity 0.5: no park move fits (strict only)
      if (r.solvable) return c;
    }
    return -1;
  }

  PL.parksolver = { solve: solve, analyze: analyze, depth: depth };
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.parksolver;
})(typeof window !== 'undefined' ? window : globalThis);
