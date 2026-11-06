// src/gen/simsolver.js: the solver that searches on the real belt (plan R29c).
//
// The abstract solver needs an empty belt between moves, and any abstract model of riders diverges from the real
// landings (pieces dropped at different moments meet the boxes in a different order). So this solver searches on the
// simulation itself: a node is a snapshot of the sim, a move is "tap box b now, then let the belt run until it has
// settled" (every planned departure done and either the belt empty or a whole lap without a landing: a rider that
// finds no home in one lap finds none until a box changes). The plan is the list of taps with their sim times; replaying
// them in a fresh sim (bot.certifyPlan) gives the same game, because the sim is deterministic (R24).
// Cost: settling a node is a lap of ticks (about 2 ms); the search is a depth-first walk with a transposition table on
// the position (boxes + riders by kind and plate, phase quantised) and closing-first move ordering, capped by maxNodes.
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};
  var model = PL.model || (typeof require === 'function' ? require('../engine/model.js') : null);
  var rules = PL.rules || (typeof require === 'function' ? require('../engine/rules.js') : null);
  var sim = PL.sim || (typeof require === 'function' ? require('../engine/sim.js') : null);
  var config = PL.config || (typeof require === 'function' ? require('../config.js') : null);
  function layoutsMod() { return PL.layouts || (typeof require === 'function' ? require('../levels/layouts.js') : null); }

  var TICK = 16;

  function cloneSim(s) {
    var b = s.belt;
    return { state: model.clone(s.state), belt: { N: b.N, perimeter: b.perimeter, spacing: b.spacing, dir: b.dir, mouths: b.mouths, pos: b.pos.slice(), up: b.up.slice(), travel: b.travel, phase: b.phase },
      speed: s.speed, time: s.time, status: s.status, log: [], lapMs: s.lapMs, plateWidth: s.plateWidth, skip: s.skip.slice() };
  }
  function pending(st) {
    var i;
    for (i = 0; i < st.boxes.length; i++) if (st.boxes[i].pending > 0) return true;
    return false;
  }
  function riders(st) {
    var n = 0, i;
    for (i = 0; i < st.belt.length; i++) if (st.belt[i]) n++;
    return n;
  }
  // run the sim until it has settled: departures done, then either no rider or a lap without a landing
  function settle(s, lapTicks) {
    var t = 0, ev, i, sinceLand = 0, limit = 8 * lapTicks;
    while (s.status === 'play' && t < limit) {
      ev = sim.tick(s, TICK); t++;
      sinceLand++;
      for (i = 0; i < ev.length; i++) if (ev[i].type === 'land' || ev[i].type === 'eject') sinceLand = 0;
      if (!pending(s.state) && (riders(s.state) === 0 || sinceLand >= lapTicks)) break;
    }
  }
  function key(s) {
    var st = s.state, parts = [], i, q = s.belt.spacing / 4;
    for (i = 0; i < st.belt.length; i++) if (st.belt[i]) parts.push(st.belt[i].k + '@' + Math.round(s.belt.pos[i] / q));
    parts.sort();
    return model.hash(st) + '/' + parts.join(',');
  }
  function score(s, before) {
    var st = s.state, i, b, groups = 0, prev, j;
    for (i = 0; i < st.boxes.length; i++) {
      b = st.boxes[i];
      if (b.closed) continue;
      prev = -1;
      for (j = 0; j < b.pieces.length; j++) if (b.pieces[j].k !== prev) { groups++; prev = b.pieces[j].k; }
    }
    return (st.closedKinds.length - before) * 100 - groups * 2 - riders(st) * 3;
  }

  // solve(level, { layout, maxNodes = 4000, maxDepth = 120 }) -> { solvable: true, plan: [{ box, time }], nodes, ms }
  //   | { solvable: false, nodes } | { unknown: true, nodes }
  function solve(level, opts) {
    var o = opts || {}, layout = o.layout || layoutsMod()[level.layout], maxNodes = o.maxNodes || 4000, maxDepth = o.maxDepth || 120,
      s0 = sim.create(level, { perimeter: layout.perimeter, layout: layout, lapMs: config ? config.LAP_MS : 8000 }),
      lapTicks = Math.ceil(s0.lapMs / TICK), nodes = 0, tt = new Set(), plan = [], aborted = false, nb = s0.state.boxes.length;
    function dfs(s, depth) {
      var k, i, ch = [], c, r, st = s.state;
      if (s.status === 'won') return true;
      if (s.status !== 'play' || depth > maxDepth) return false;
      if (rules.isHopeless(st)) return false;
      k = key(s);
      if (tt.has(k)) return false;
      if (++nodes > maxNodes) { aborted = true; return false; }
      tt.add(k);
      for (i = 0; i < nb; i++) {
        if (!rules.canEject(st, i).ok) continue;
        c = cloneSim(s);
        r = sim.tap(c, i);
        if (!r.ok) continue;
        settle(c, lapTicks);
        ch.push({ box: i, time: s.time, sim: c, score: score(c, st.closedKinds.length) + (c.status === 'won' ? 1e6 : 0) - (c.status === 'lost' ? 1e6 : 0) });
      }
      ch.sort(function (a, b) { return b.score - a.score; });
      for (i = 0; i < ch.length; i++) {
        if (ch[i].sim.status === 'lost') continue;
        plan.push({ box: ch[i].box, time: ch[i].time });
        if (dfs(ch[i].sim, depth + 1)) return true;
        plan.pop();
        if (aborted) return false;
      }
      return false;
    }
    var t0 = Date.now ? Date.now() : 0;
    if (dfs(s0, 0)) return { solvable: true, plan: plan.slice(), nodes: nodes, ms: Date.now() - t0 };
    if (aborted) return { unknown: true, nodes: nodes, ms: Date.now() - t0 };
    return { solvable: false, nodes: nodes, ms: Date.now() - t0 };
  }

  // certifyPlan(level, plan, { layout }) -> { won, ticks }: taps at the recorded sim times in a fresh sim (R24)
  function certifyPlan(level, plan, opts) {
    var layout = (opts && opts.layout) || layoutsMod()[level.layout], s = sim.create(level, { perimeter: layout.perimeter, layout: layout, lapMs: config ? config.LAP_MS : 8000 }),
      i, ticks = 0, lapTicks = Math.ceil(s.lapMs / TICK), r, left;
    for (i = 0; i < plan.length; i++) {
      while (s.time < plan[i].time - 1e-9 && s.status === 'play') { sim.tick(s, Math.min(TICK, plan[i].time - s.time)); ticks++; }
      if (s.status !== 'play') break;
      r = sim.tap(s, plan[i].box);
      if (!r.ok) return { won: false, ticks: ticks, reason: 'tap ' + i + ' refused (' + r.reason + ')' };
    }
    left = 12 * lapTicks;
    while (left-- > 0 && s.status === 'play') { sim.tick(s, TICK); ticks++; }
    return { won: s.status === 'won', ticks: ticks, reason: s.status === 'won' ? null : 'not won (' + s.status + ')' };
  }

  // playGuided(level, { layout, maxSteps = 160 }) -> { won, plan: [{ box, time }], steps, ms }
  // Model-predictive play on the real belt: at every step the parking solver (parksolver.js) is run from the
  // current real position (boxes and riders) and its first tap is made; the belt settles; repeat. A divergence between
  // the abstract landings and the real ones is corrected by the next re-plan. The result is a certified plan (taps with
  // sim times, replayable by certifyPlan) whenever the game is won.
  // the best-looking tap for a planner that sees no plan: closes, then merges, then an empty box, else nothing
  function greedyTap(s) {
    var st = s.state, best = -1, bestV = 0, b, ce, v, i, n, X, kind, box;
    for (b = 0; b < st.boxes.length; b++) {
      ce = rules.canEject(st, b);
      if (!ce.ok) continue;
      box = st.boxes[b]; kind = box.pieces[box.pieces.length - 1].k; v = 0.5;
      for (X = 0; X < st.boxes.length; X++) {
        if (X === b) continue;
        n = st.boxes[X].pieces.length;
        if (rules.accepts(st, X, kind)) { v = Math.max(v, n === 0 ? 1 : (n + ce.k >= 4 ? 3 : 2)); }
      }
      if (v > bestV) { bestV = v; best = b; }
    }
    return best;
  }
  function playGuided(level, opts) {
    var o = opts || {}, layout = o.layout || layoutsMod()[level.layout], parksolver = PL.parksolver || (typeof require === 'function' ? require('./parksolver.js') : null),
      s = sim.create(level, { perimeter: layout.perimeter, layout: layout, lapMs: config ? config.LAP_MS : 8000 }), lapTicks = Math.ceil(s.lapMs / TICK),
      plan = [], steps = 0, maxSteps = o.maxSteps || 200, maxPlans = o.maxPlans || 40, t0 = Date.now(), r, tapRes, plans = 0, i, waits;
    while (s.status === 'play' && steps < maxSteps) {
      if (++plans > maxPlans) return { won: false, plan: plan, steps: steps, ms: Date.now() - t0, reason: 'too many re-plans' };
      r = parksolver.solve(level, { layout: layout, from: s, maxNodes: o.maxNodes || 30000, rng: o.rng || null, noise: o.noise });
      if (!r.solvable && o.fallback) {                           // a limited planner that sees no way: it taps the best-looking box and hopes
        var g = greedyTap(s);
        if (g >= 0) { tapRes = sim.tap(s, g); if (tapRes.ok) { plan.push({ box: g, time: s.time }); steps++; settle(s, lapTicks); continue; } }
      }
      if (!r.solvable) {
        if (riders(s.state) === 0 && !pending(s.state)) return { won: false, plan: plan, steps: steps, ms: Date.now() - t0, reason: r.unknown ? 'unknown' : 'unsolvable' };
        settle(s, lapTicks);                                    // riders may still land; then look again
        if (riders(s.state) === 0 && !pending(s.state)) continue;
        settle(s, lapTicks);
        continue;
      }
      // follow the plan while its taps are accepted; a refusal (full belt, pending box) waits a little, then re-plans
      for (i = 0; i < r.taps.length && s.status === 'play' && steps < maxSteps; i++) {
        waits = 0;
        for (;;) {
          tapRes = sim.tap(s, r.taps[i]);
          if (tapRes.ok) break;
          if (tapRes.reason !== 'full' && tapRes.reason !== 'pending' && tapRes.reason !== 'pair') break;
          if (++waits > 3) break;
          settle(s, lapTicks);
          if (s.status !== 'play') break;
        }
        if (!tapRes.ok) break;                                    // re-plan from here
        plan.push({ box: r.taps[i], time: s.time });
        steps++;
        settle(s, lapTicks);
      }
      if (s.status === 'play' && i >= r.taps.length) settle(s, 2 * lapTicks);
    }
    return { won: s.status === 'won', plan: plan, steps: steps, ms: Date.now() - t0, reason: s.status === 'won' ? null : s.status };
  }

  PL.simsolver = { solve: solve, certifyPlan: certifyPlan, playGuided: playGuided };
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.simsolver;
})(typeof window !== 'undefined' ? window : globalThis);
