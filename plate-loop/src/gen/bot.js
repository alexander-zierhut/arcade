// src/gen/bot.js: the tick-accurate bot (plan 5.3): replays abstract solutions in PL.sim, and plays with a skill level
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};
  var model = PL.model || (typeof require === 'function' ? require('../engine/model.js') : null);
  var rules = PL.rules || (typeof require === 'function' ? require('../engine/rules.js') : null);
  var sim = PL.sim || (typeof require === 'function' ? require('../engine/sim.js') : null);
  // gen/* files may load in any order in the browser: neighbours are looked up when first needed
  var rng, solver;
  function deps() {
    rng = rng || PL.rng || (typeof require === 'function' ? require('./rng.js') : null);
    solver = solver || PL.solver || (typeof require === 'function' ? require('./solver.js') : null);
  }

  var TICK = 16;                       // ms of sim time per step
  var MOVE_BUDGET_MS = 60000;          // sim time one abstract move may take

  function layoutOf(level, opts) {
    var l = opts && opts.layout;
    if (!l) {
      var lm = PL.layouts || (typeof require === 'function' ? require('../levels/layouts.js') : null);
      l = lm && lm[level.layout];
    }
    if (!l) throw new Error('bot: layout missing');
    return l;
  }

  function create(level, layout) { return sim.create(level, { perimeter: layout.perimeter, layout: layout }); }

  // nothing on the belt and no ejection still reserved
  function beltEmpty(s) {
    var i;
    for (i = 0; i < s.state.belt.length; i++) if (s.state.belt[i]) return false;
    for (i = 0; i < s.state.boxes.length; i++) if (s.state.boxes[i].pending > 0) return false;
    return true;
  }

  // ---------------------------------------------------------------- certify

  function kindsOf(box) {
    var out = [], i;
    for (i = 0; i < box.pieces.length; i++) out.push(box.pieces[i].k);
    return out;
  }

  // the kinds in `have` (back to front) are the beginning of the planned final content `want`
  function isPrefix(have, want) {
    var i;
    if (have.length > want.length) return false;
    for (i = 0; i < have.length; i++) if (have[i] !== want[i]) return false;
    return true;
  }

  // certify(level, moves, { layout, trace? }) -> { won, ticks, taps, reason }
  // For every abstract move: wait for an empty belt, work out with solver.applyMove what every box should hold after the
  // move, tap the source, and whenever a box holds something that is not the beginning of its planned content (a piece
  // of the run landed in an empty box on the way) tap that box to kick the piece out again. A kick takes the whole front
  // run of that box, so it may spit out a piece the box held before; those come back or go on by themselves.
  function certify(level, moves, opts) {
    deps();
    var layout = layoutOf(level, opts), s = create(level, layout), ticks = 0, taps = 0, mi, move, box, plan, budget, ev, i, b,
      r, pending, trace = (opts && opts.trace) || null, nbox, want;

    function result(won, reason) { return { won: won, ticks: ticks, taps: taps, reason: reason }; }
    function log(msg) { if (trace) trace(msg); }

    for (mi = 0; mi < moves.length; mi++) {
      move = moves[mi];
      budget = MOVE_BUDGET_MS / TICK;
      while (!beltEmpty(s)) {
        if (s.status !== 'play') break;
        if (budget-- <= 0) return result(false, 'move ' + mi + ': the belt never emptied');
        sim.tick(s, TICK);
        ticks++;
      }
      if (s.status === 'won') return result(true, null);
      if (s.status === 'lost') return result(false, 'move ' + mi + ': the level was lost');
      box = s.state.boxes[move.box];
      if (!box) return result(false, 'move ' + mi + ': no such box ' + move.box);
      if (!rules.unit(box)) return result(false, 'move ' + mi + ': box ' + box.id + ' is empty');
      try { plan = solver.applyMove(s.state, move, layout).state; }
      catch (err) { return result(false, 'move ' + mi + ': ' + err.message); }
      nbox = s.state.boxes.length;
      want = [];
      for (i = 0; i < nbox; i++) want.push(kindsOf(plan.boxes[i]));
      log('move ' + mi + ' tap ' + box.id + ' t=' + Math.round(s.time));
      r = sim.tap(s, move.box);
      if (!r.ok) return result(false, 'move ' + mi + ': tap on ' + box.id + ' refused (' + r.reason + ')');
      taps++;
      budget = MOVE_BUDGET_MS / TICK;
      while (true) {
        ev = sim.tick(s, TICK);
        ticks++;
        if (trace) for (i = 0; i < ev.length; i++) {
          if (ev[i].type === 'eject' || ev[i].type === 'land' || ev[i].type === 'close') log('  ' + ev[i].type + ' ' + s.state.boxes[ev[i].box].id + (ev[i].piece ? ' k' + ev[i].piece.k : '') + ' t=' + Math.round(ev[i].time));
        }
        if (s.status !== 'play') break;
        pending = false;
        for (b = 0; b < nbox; b++) {
          if (s.state.boxes[b].pending > 0 || isPrefix(kindsOf(s.state.boxes[b]), want[b])) continue;
          pending = true;
          r = rules.canEject(s.state, b);
          if (r.ok) {
            log('  kick ' + s.state.boxes[b].id);
            sim.tap(s, b);
            taps++;
          } else if (r.reason !== 'full' && r.reason !== 'pair' && r.reason !== 'pending') {
            return result(false, 'move ' + mi + ': a piece is stuck in box ' + s.state.boxes[b].id + ' (' + r.reason + ')');
          }
        }
        if (!pending && beltEmpty(s)) break;
        if (budget-- <= 0) return result(false, 'move ' + mi + ': the run did not settle in time');
      }
      if (s.status === 'won') return result(true, null);
      if (s.status === 'lost') return result(false, 'move ' + mi + ': the level was lost');
    }
    return result(s.status === 'won', s.status === 'won' ? null : 'all moves played, level not won');
  }

  // ---------------------------------------------------------------- play

  // value of tapping box b now, judged on a copy: 3 closes a box, 2 lands on a matching box, 1 lands in an empty box,
  // 0 rides on without a taker, -1 not tappable
  function tapValue(state, b, order) {
    var ce = rules.canEject(state, b), st, k, plate = 0, free = [], i, u, plates, c, X, n, box, ord, ok, j;
    if (!ce.ok) return -1;
    st = model.clone(state);
    for (i = 0; i < st.belt.length; i++) if (st.belt[i] === null) free.push(i);
    k = ce.k;
    while (plate < k) {
      u = rules.unit(st.boxes[b]);
      plates = u.size === 2 ? [free[plate], free[plate + 1]] : [free[plate]];
      rules.ejectUnit(st, b, plates);
      plate += u.size;
    }
    c = st.belt[free[0]].k;
    ord = order[b];
    for (i = 0; i < ord.length; i++) {
      X = ord[i];
      if (!rules.wouldLand(st, free[0], X)) continue;
      box = st.boxes[X];
      n = box.pieces.length;
      if (n === 0) return 1;
      if (n + k === 4) {
        ok = true;
        for (j = 0; j < n; j++) if (box.pieces[j].k !== c) ok = false;
        if (ok) return 3;
      }
      return 2;
    }
    return 0;
  }

  // the tap a greedy player makes: best value, ties at random; nothing legal -> -1
  function chooseTap(s, order, r, randomShare) {
    var state = s.state, vals = [], best = -2, i, v, pool = [], legal = [];
    for (i = 0; i < state.boxes.length; i++) {
      v = tapValue(state, i, order);
      vals.push(v);
      if (v >= 0) legal.push(i);
      if (v > best) best = v;
    }
    if (!legal.length) return -1;
    if (randomShare && r.next() < randomShare) return r.pick(legal);
    if (best >= 2) {
      for (i = 0; i < vals.length; i++) if (vals[i] === best) pool.push(i);
      return r.pick(pool);
    }
    return r.pick(legal);
  }

  // ---------------------------------------------------------------- the juggler: a human-like real-time player
  //
  // Thinks a lap ahead in the real sim: at every decision it clones the sim, tries each possible tap (and doing nothing),
  // runs the clone for `lookMs`, scores the result (closed boxes, matched runs, pieces riding without a home, hopeless
  // positions) and takes the best tap when it beats waiting. Unlike the solver it uses the belt as a buffer and taps
  // while pieces are still riding, which is what a human does with four plates.
  function score(st) {
    var i, j, b, n, sc = 0, closed = 0, riders = 0, homeless = 0, p, k, matched = 0, groups = 0, prev;
    if (rules.isHopeless(st)) return -1e6;
    for (i = 0; i < st.boxes.length; i++) {
      b = st.boxes[i];
      if (b.closed) { closed++; continue; }
      n = b.pieces.length;
      prev = -1;
      for (j = 0; j < n; j++) { k = b.pieces[j].k; if (k !== prev) { groups++; prev = k; } }
      if (n > 1 && groups === 1) matched += n;          // a pure box: its pieces are home
    }
    for (i = 0; i < st.belt.length; i++) {
      p = st.belt[i];
      if (!p) continue;
      riders++;
      for (j = 0; j < st.boxes.length; j++) if (rules.accepts(st, j, p.k)) break;
      if (j === st.boxes.length) homeless++;
    }
    sc = closed * 100 + matched * 6 - groups * 4 - riders * 2 - homeless * 15;
    if (rules.isStuck(st)) sc -= 1e5;
    return sc;
  }
  function cloneSim(s) {
    var c = { state: model.clone(s.state), belt: { N: s.belt.N, perimeter: s.belt.perimeter, spacing: s.belt.spacing, dir: s.belt.dir, mouths: s.belt.mouths, pos: s.belt.pos.slice(), up: s.belt.up.slice(), travel: s.belt.travel, phase: s.belt.phase },
      speed: s.speed, time: s.time, status: s.status, log: [], lapMs: s.lapMs, plateWidth: s.plateWidth, skip: s.skip.slice() };
    return c;
  }
  function tryOut(s, tapBox, lookMs) {
    var c = cloneSim(s), t = 0, r;
    if (tapBox >= 0) { r = sim.tap(c, tapBox); if (!r.ok) return -Infinity; }
    while (t < lookMs && c.status === 'play') { sim.tick(c, TICK * 2); t += TICK * 2; }
    if (c.status === 'won') return 1e7;
    if (c.status === 'lost') return -1e7;
    return score(c.state) + (tapBox >= 0 ? 0 : -1);    // waiting costs a little: a tie goes to acting
  }
  function juggle(level, o) {
    var layout = layoutOf(level, o), s = create(level, layout), r = rng.create(o.seed === undefined ? 1 : o.seed), taps = 0, ticks = 0,
      limit = 20 * 60 * 1000 / TICK, lookMs = o.lookMs || Math.round(s.lapMs * 1.25), every = o.everyMs || 400, since = every, b, best, bestB, v, cands, nb = s.state.boxes.length, ce, j;
    while (s.status === 'play' && ticks < limit && taps < 600) {
      if (since >= every) {
        since = 0;
        cands = [];
        for (b = 0; b < nb; b++) { ce = rules.canEject(s.state, b); if (ce.ok) cands.push(b); }
        if (cands.length) {
          best = tryOut(s, -1, lookMs); bestB = -1;
          r.shuffle(cands);
          for (j = 0; j < cands.length; j++) { v = tryOut(s, cands[j], lookMs); if (v > best) { best = v; bestB = cands[j]; } }
          if (bestB >= 0) { sim.tap(s, bestB); taps++; }
        }
      }
      sim.tick(s, TICK); ticks++; since += TICK;
    }
    return { won: s.status === 'won', taps: taps, ticks: ticks };
  }

  // play(level, { layout, skill: 'perfect' | 'greedy' | 'sloppy' | 'juggler', seed, maxNodes }) -> { won, taps, ticks }
  function play(level, opts) {
    deps();
    var o = opts || {}, layout = layoutOf(level, o), skill = o.skill || 'greedy', seed = o.seed === undefined ? 1 : o.seed,
      res, r, s, order, taps = 0, ticks = 0, limit, b, wait, sloppy;
    if (skill === 'perfect') {
      res = solver.solve(level, { layout: layout, maxNodes: o.maxNodes || 200000 });
      if (!res.solvable) return { won: false, taps: 0, ticks: 0, reason: res.unknown ? 'unknown' : 'unsolvable' };
      res = certify(level, res.moves, { layout: layout });
      return { won: res.won, taps: res.taps, ticks: res.ticks, reason: res.reason };
    }
    if (skill === 'juggler') return juggle(level, o);
    sloppy = skill === 'sloppy';
    r = rng.create(seed);
    s = create(level, layout);
    order = solver.downstream(level, layout);
    limit = 20 * 60 * 1000 / TICK;          // twenty minutes of sim time
    wait = 0;
    while (s.status === 'play' && ticks < limit && taps < 600) {
      if (wait > 0) {
        sim.tick(s, TICK);
        ticks++;
        wait--;
        continue;
      }
      if (!beltEmpty(s) && !(sloppy && r.next() < (o.inFlight === undefined ? 0.02 : o.inFlight))) {      // a sloppy player sometimes taps with pieces still in flight
        sim.tick(s, TICK);
        ticks++;
        continue;
      }
      b = chooseTap(s, order, r, sloppy ? (o.randomShare === undefined ? 0.3 : o.randomShare) : 0);
      if (b >= 0) {
        sim.tap(s, b);
        taps++;
      }
      wait = sloppy ? 6 + r.int(40) : 1;           // sloppy players tap again after 0.1 - 0.8 s
    }
    return { won: s.status === 'won', taps: taps, ticks: ticks };
  }

  PL.bot = { certify: certify, play: play, beltEmpty: beltEmpty, juggle: juggle };
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.bot;
})(typeof window !== 'undefined' ? window : globalThis);
