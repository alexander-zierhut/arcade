// src/engine/sim.js: the deterministic real-time driver (belt + rules); no DOM, no timers, no clock
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};
  var config = PL.config || (typeof require === 'function' ? require('../config.js') : null);
  var model = PL.model || (typeof require === 'function' ? require('./model.js') : null);
  var rules = PL.rules || (typeof require === 'function' ? require('./rules.js') : null);
  var belt = PL.belt || (typeof require === 'function' ? require('./belt.js') : null);

  function norm(x, P) {
    var r = x % P;
    if (r < 0) r += P;
    return r;
  }

  // mouths of the layout in travel-direction units: [{ box: boxIndex, s }]
  function mouthsOf(state, layout, perimeter) {
    var out = [], i, slot, s;
    for (i = 0; i < state.boxes.length; i++) {
      slot = layout.slots && layout.slots[state.boxes[i].id];
      if (!slot || typeof slot.s !== 'number') throw new Error('sim: layout has no mouth for box ' + state.boxes[i].id);
      s = state.dir === 'ccw' ? norm(perimeter - slot.s, perimeter) : norm(slot.s, perimeter);
      out.push({ box: i, s: s });
    }
    return out;
  }

  // sim.create(level, { layout, perimeter?, lapMs?, mouths? })
  // mouths (optional) overrides the layout: [{ box, s }] already in travel-direction units.
  function create(level, opts) {
    var o = opts || {}, layout = o.layout || null, state, perimeter, lapMs, b, s, i;
    state = model.parse(level, { layout: layout });
    perimeter = o.perimeter || (layout && layout.perimeter);
    if (!(perimeter > 0)) throw new Error('sim: perimeter missing (opts.perimeter or layout.perimeter)');
    lapMs = o.lapMs || (config ? config.LAP_MS : 8000);
    if (!o.mouths && !layout) throw new Error('sim: layout missing');
    b = belt.create({ N: state.N, perimeter: perimeter, dir: state.dir, mouths: o.mouths || mouthsOf(state, layout, perimeter) });
    s = { state: state, belt: b, speed: perimeter / lapMs, time: 0, status: 'play', log: [], lapMs: lapMs,
      plateWidth: o.plate || (layout && layout.plate) || 40, skip: [] };
    for (i = 0; i < state.N; i++) s.skip.push(-1);
    for (i = 0; i < state.initialEvents.length; i++) {
      state.initialEvents[i].time = 0;
      s.log.push(state.initialEvents[i]);
    }
    return s;
  }

  function stamp(s, events, t, out) {
    var i;
    for (i = 0; i < events.length; i++) {
      events[i].time = t;
      s.log.push(events[i]);
      out.push(events[i]);
    }
  }

  function checkEnd(s, t, out) {
    var ev;
    if (s.status !== 'play') return;
    if (rules.isWon(s.state)) {
      s.status = 'won';
      ev = [{ type: 'won' }];
    } else if (rules.isStuck(s.state)) {
      s.status = 'lost';
      ev = [{ type: 'lost' }];
    } else return;
    stamp(s, ev, t, out);
  }

  function refuse(s, boxIndex, reason) {
    var ev = [{ type: 'refuse', box: boxIndex, reason: reason }], out = [];
    stamp(s, ev, s.time, out);
    return { ok: false, k: 0, reason: reason, events: out };
  }

  // The plates reserved by planned departures (outbox pieces that carry a plate), as a lookup by plate index.
  function reservedPlates(st) {
    var r = {}, b, o, j;
    for (b = 0; b < st.boxes.length; b++) {
      o = st.boxes[b].outbox;
      for (j = 0; j < o.length; j++) if (o[j].plate !== undefined) r[o[j].plate] = true;
    }
    return r;
  }

  // sim.tap(s, boxIndex) -> { ok, k, reason, events }. A successful tap (R5) moves the k pieces out of the box into
  // box.outbox at once and reserves a plate for each (the free, unreserved plate that reaches the mouth soonest, i.e.
  // the nearest one behind it). Unit j (a bound pair is one unit with two plates) departs at
  // departAt = s.time + DEPART_FIRST_MS + j * DEPART_GAP_MS: then sim.tick lifts the reserved plate behind the mouth,
  // puts the piece on it and emits eject. Events now, all stamped s.time: tapped { box, k, pieces, plan: [{ piece,
  // plate, from, departAt }] }, reveal*, unlock*. A refused tap logs and returns a `refuse` event.
  function tap(s, boxIndex) {
    var state = s.state, r, out = [], box, mi, res, j, u, i, p, pc, plan = [], isFree;
    if (s.status !== 'play') return refuse(s, boxIndex, 'over');
    if (boxIndex < 0 || boxIndex >= state.boxes.length || Math.floor(boxIndex) !== boxIndex) return refuse(s, boxIndex, 'nobox');
    r = rules.tap(state, boxIndex);
    if (!r.ok) return refuse(s, boxIndex, r.reason);
    box = state.boxes[boxIndex];
    mi = belt.mouthIndex(s.belt, boxIndex);
    res = reservedPlates(state);
    isFree = function (q) { return state.belt[q] === null && !res[q]; };
    i = 0; j = 0;
    while (i < box.outbox.length) {
      u = box.outbox[i].pair !== null && i + 1 < box.outbox.length && box.outbox[i + 1].pair === box.outbox[i].pair ? 2 : 1;
      for (p = 0; p < u; p++) {
        pc = box.outbox[i + p];
        pc.plate = mi >= 0 ? belt.nextFree(s.belt, mi, isFree) : -1;
        if (pc.plate < 0) { delete pc.plate; continue; }
        res[pc.plate] = true;
        pc.departAt = s.time + config.DEPART_FIRST_MS + j * config.DEPART_GAP_MS;
        plan.push({ piece: model.pub(pc), plate: pc.plate, from: belt.platePos(s.belt, pc.plate), departAt: pc.departAt });
      }
      i += u;
      j++;
    }
    r.events[0].plan = plan;
    stamp(s, r.events, s.time, out);
    return { ok: true, k: r.k, reason: null, events: out };
  }

  // the earliest planned departure of any box, or Infinity
  function nextDeparture(s) {
    var best = Infinity, b, o;
    for (b = 0; b < s.state.boxes.length; b++) {
      o = s.state.boxes[b].outbox;
      if (o.length && o[0].departAt !== undefined && o[0].departAt < best) best = o[0].departAt;
    }
    return best;
  }

  // A unit departs: its reserved plates (or, if one is not free, the nearest free unreserved ones) are lifted out of
  // the belt and dropped behind the mouth (the first EPS before it, a pair mate one plate width further, further still
  // while another plate is closer than 0.9 width), the pieces go on them. Returns false when no plate was found.
  function depart(s, boxIndex, t, out) {
    var st = s.state, b = s.belt, box = st.boxes[boxIndex], mi = belt.mouthIndex(b, boxIndex), u = rules.pendingUnit(box),
      plates = [], froms = [], tos = [], offset = belt.EPS, j, p, drop, ev, res, departAt = u.pieces[0].departAt;
    res = reservedPlates(st);
    for (j = 0; j < u.size; j++) {
      p = u.pieces[j].plate;
      if (p === undefined || st.belt[p] !== null || plates.indexOf(p) >= 0) {
        p = belt.nearest(b, mi, function (q) { return st.belt[q] === null && plates.indexOf(q) < 0 && !res[q]; });
      }
      if (p < 0) return false;
      plates.push(p);
    }
    for (j = 0; j < plates.length; j++) {
      froms.push(belt.platePos(b, plates[j]));
      drop = belt.dropBehind(b, plates[j], mi, offset, s.plateWidth);
      offset = drop.offset + s.plateWidth;
      tos.push(belt.platePos(b, plates[j]));
      s.skip[plates[j]] = mi;                 // not eligible to land anywhere before it has crossed this mouth
    }
    ev = rules.ejectUnit(st, boxIndex, plates);
    for (j = 0; j < ev.length; j++) {
      ev[j].from = froms[j];
      ev[j].to = tos[j];
      ev[j].teleported = true;
      ev[j].departAt = departAt;
    }
    stamp(s, ev, departAt, out);
    return true;
  }

  // all departures planned for t or earlier, earliest first (ties: lower box index)
  function departDue(s, t, out) {
    var b, best, bt, o;
    for (;;) {
      best = -1; bt = Infinity;
      for (b = 0; b < s.state.boxes.length; b++) {
        o = s.state.boxes[b].outbox;
        if (o.length && o[0].departAt !== undefined && o[0].departAt <= t + 1e-9 && o[0].departAt < bt) { bt = o[0].departAt; best = b; }
      }
      if (best < 0) return;
      if (!depart(s, best, t, out)) {          // no plate at all (cannot happen): try again after one gap
        o = s.state.boxes[best].outbox;
        o[0].departAt = t + config.DEPART_GAP_MS;
        if (o[1] !== undefined && o[1].pair !== null && o[1].pair === o[0].pair) o[1].departAt = o[0].departAt;
      }
    }
  }

  // one crossing: plate `c.plate` has its centre on the mouth of box `c.box`
  function crossing(s, c) {
    var st = s.state, plate = c.plate;
    if (st.belt[plate] === null) return [];
    // a dropped plate is not eligible to land anywhere until it has crossed its own source mouth (its departure)
    if (s.skip[plate] >= 0) {
      if (s.skip[plate] === c.mouth) s.skip[plate] = -1;
      return [];
    }
    return rules.tryLand(st, plate, c.box);
  }

  // moves the belt from time a to time b (ms) and handles the crossings in order
  function stepBelt(s, a, b, out) {
    var ds = (b - a) * s.speed, cs, i, t, ev;
    if (!(ds > 0)) return;
    cs = belt.advance(s.belt, ds);
    for (i = 0; i < cs.length; i++) {
      t = a + cs[i].at / s.speed;
      ev = crossing(s, cs[i]);
      if (ev.length) {
        stamp(s, ev, t, out);
        checkEnd(s, t, out);
      }
    }
  }

  // [t0, t1]: the belt runs, but is stopped at every planned departure so that it happens at its exact time
  function interval(s, t0, t1, out) {
    var dep;
    for (;;) {
      dep = nextDeparture(s);
      if (dep <= t0 + 1e-9) { departDue(s, t0, out); continue; }
      if (dep >= t1) { stepBelt(s, t0, t1, out); return; }
      stepBelt(s, t0, dep, out);
      t0 = dep;
    }
  }

  // sim.tick(s, dtMs) -> events of this tick, each with .time (the instant of its crossing or departure, ms since the start)
  function tick(s, dtMs) {
    var out = [], n, step, k, t0, t1, maxStep, tStart = s.time;
    if (!(dtMs > 0)) return out;
    maxStep = (s.belt.spacing * 0.5) / s.speed;
    n = Math.max(1, Math.ceil(dtMs / maxStep));
    step = dtMs / n;
    for (k = 0; k < n; k++) {
      t0 = tStart + step * k;
      t1 = k === n - 1 ? tStart + dtMs : tStart + step * (k + 1);
      interval(s, t0, t1, out);
      s.time = t1;
    }
    departDue(s, s.time, out);
    checkEnd(s, s.time, out);
    return out;
  }

  // sim.plates(s) -> [{ plate, s (layout clockwise arc length, for layouts.pointAt), piece }]
  function plates(s) {
    var out = [], i;
    for (i = 0; i < s.state.N; i++) out.push({ plate: i, s: belt.platePos(s.belt, i), piece: s.state.belt[i] });
    return out;
  }

  function freePlates(s) { return rules.freePlates(s.state); }

  // sim.nextEjectPlate(s, boxIndex) -> the free, unreserved plate a tap on that box would reserve first, or -1
  function nextEjectPlate(s, boxIndex) {
    var mi = belt.mouthIndex(s.belt, boxIndex), res = reservedPlates(s.state);
    if (mi < 0) return -1;
    return belt.nextFree(s.belt, mi, function (p) { return s.state.belt[p] === null && !res[p]; });
  }

  PL.sim = { create: create, tap: tap, tick: tick, plates: plates, freePlates: freePlates, nextEjectPlate: nextEjectPlate };
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.sim;
})(typeof window !== 'undefined' ? window : globalThis);
