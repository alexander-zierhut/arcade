// src/engine/rules.js: R5-R21 as pure functions on a state (they mutate the given state and return events)
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};
  var model = PL.model || (typeof require === 'function' ? require('./model.js') : null);

  var pub = model.pub;

  function front(box) {
    return box.pieces.length ? box.pieces[box.pieces.length - 1] : null;
  }

  // the next ejectable unit (R16): { size: 1|2, pieces: [front, (pairMate)] } or null
  function unit(box) { return model.frontUnit(box); }

  // sizes of the units that leave on one tap, in order (R5, R16). A pair belongs to the run only when both of
  // its pieces are of the run's kind; a pair at the front always leaves as a unit of 2 (its kinds may differ)
  // and then only continues the run when both of its kinds match.
  function runUnits(box) {
    var p = box.pieces, i = p.length - 1, sizes = [], c, q;
    if (i < 0) return sizes;
    c = p[i].k;
    if (p[i].pair !== null && i >= 1 && p[i - 1].pair === p[i].pair) {
      sizes.push(2);
      if (p[i - 1].k !== c) return sizes;
      i -= 2;
    } else {
      sizes.push(1);
      i -= 1;
    }
    while (i >= 0) {
      q = p[i];
      if (q.hidden) break;                  // a run ends at a hidden piece, whatever its kind: it is revealed, then tap again
      if (q.pair !== null && i >= 1 && p[i - 1].pair === q.pair) {
        if (q.k === c && p[i - 1].k === c && !p[i - 1].hidden) { sizes.push(2); i -= 2; } else break;
      } else if (q.k === c) {
        sizes.push(1);
        i -= 1;
      } else break;
    }
    return sizes;
  }

  // number of pieces of the front's kind that leave on one tap, ignoring free plates
  function runLength(box) {
    var sizes = runUnits(box), n = 0, i;
    for (i = 0; i < sizes.length; i++) n += sizes[i];
    return n;
  }

  function emptyPlates(state) {
    var n = 0, i;
    for (i = 0; i < state.belt.length; i++) if (state.belt[i] === null) n++;
    return n;
  }

  // box.pending is always box.outbox.length (kept as a number for compatibility)
  function syncPending(box) { box.pending = box.outbox.length; }

  // the next unit leaving the tapped box: the first piece of the outbox, or it together with its pair mate
  function pendingUnit(box) {
    var o = box.outbox;
    if (!o.length) return null;
    if (o[0].pair !== null && o.length >= 2 && o[1].pair === o[0].pair) return { size: 2, pieces: [o[0], o[1]] };
    return { size: 1, pieces: [o[0]] };
  }

  // empty plates not reserved by pending ejections (R5)
  function freePlates(state) {
    var n = emptyPlates(state), i;
    for (i = 0; i < state.boxes.length; i++) n -= state.boxes[i].pending;
    return n < 0 ? 0 : n;
  }

  // why a box cannot be ejected at all (independent of the belt), or null
  function blocked(box) {
    if (box.closed) return 'closed';
    if (model.isCovered(box)) return 'covered';
    if (box.oneway) return 'oneway';
    if (!box.pieces.length) return 'empty';
    return null;
  }

  // { ok: true, k } | { ok: false, reason }
  function canEject(state, boxIndex) {
    var box = state.boxes[boxIndex], why, free, sizes, k, i;
    if (box.outbox.length > 0) return { ok: false, reason: 'pending' };
    why = blocked(box);
    if (why) return { ok: false, reason: why };
    free = freePlates(state);
    if (free <= 0) return { ok: false, reason: 'full' };
    sizes = runUnits(box);
    k = 0;
    for (i = 0; i < sizes.length; i++) {
      if (sizes[i] === 2) {
        // a bound pair needs 2 free plates (R16); they need not be neighbours, every piece gets its own plate
        if (free - k >= 2) k += 2; else break;
      } else if (k + 1 <= free) {
        k += 1;
      } else break;
    }
    if (k === 0) return { ok: false, reason: 'pair' };
    return { ok: true, k: k };
  }

  function endPouringOf(state, boxIndex) {
    var c;
    for (c in state.pouring) {
      if (Object.prototype.hasOwnProperty.call(state.pouring, c) && state.pouring[c] === boxIndex) delete state.pouring[c];
    }
  }

  // rules.tap(state, boxIndex) -> { ok: true, k, events } | { ok: false, reason }. The tap (R5): the k pieces that
  // canEject allows leave box.pieces AT ONCE into box.outbox (front piece first, pair ids kept); the new front is
  // revealed and keys released right away (R7, R15, R19). events: [tapped {box, k, pieces}, reveal*, unlock*].
  function tap(state, boxIndex) {
    var r = canEject(state, boxIndex), box, ev, tapped, moved = [], u, j, pc;
    if (!r.ok) return r;
    box = state.boxes[boxIndex];
    tapped = { type: 'tapped', box: boxIndex, k: r.k, pieces: moved };
    ev = [tapped];
    endPouringOf(state, boxIndex);          // R9: a tapped box stops pouring
    while (box.outbox.length < r.k) {
      u = unit(box);
      for (j = 0; j < u.size; j++) {
        pc = box.pieces.pop();
        box.outbox.push(pc);
        moved.push({ id: pc.id, k: pc.k, key: pc.key, pair: pc.pair });
      }
      model.settle(state, ev);              // the piece behind is the front now: reveal it, release its key
    }
    syncPending(box);
    return { ok: true, k: r.k, events: ev };
  }

  // moves the next unit of the box onto the given plates (1 or 2 plate indices, in the order front, mate): the first
  // unit of the box's outbox after a tap. With an empty outbox it takes the unit straight from box.pieces (the
  // abstract solver's way: no tap, the reveals happen now).
  function ejectUnit(state, boxIndex, plates) {
    var box = state.boxes[boxIndex], why, u, events = [], j, pc, plate, direct = box.outbox.length === 0;
    if (direct) {
      why = blocked(box);
      if (why) throw new Error('ejectUnit: box ' + box.id + ' is ' + why);
      u = unit(box);
    } else {
      u = pendingUnit(box);
    }
    if (!plates || plates.length !== u.size) throw new Error('ejectUnit: box ' + box.id + ' needs ' + u.size + ' plate(s)');
    for (j = 0; j < plates.length; j++) {
      if (state.belt[plates[j]] !== null) throw new Error('ejectUnit: plate ' + plates[j] + ' is not free');
      if (j && plates[j] === plates[0]) throw new Error('ejectUnit: plates must differ');
    }
    if (direct) endPouringOf(state, boxIndex);
    for (j = 0; j < plates.length; j++) {
      pc = direct ? box.pieces.pop() : box.outbox.shift();
      plate = plates[j];
      state.belt[plate] = { id: pc.id, k: pc.k, key: pc.key, from: boxIndex };
      events.push({ type: 'eject', box: boxIndex, plate: plate, piece: pub(pc), pair: pc.pair });
    }
    syncPending(box);
    if (direct) model.settle(state, events);   // R7, R15, R19: reveal and key release on exposure
    return events;
  }

  // R8 only: open, not covered, and empty or front kind == kind with room. Ignores pouring (R9).
  function accepts(state, boxIndex, kind) {
    var box = state.boxes[boxIndex], n = box.pieces.length;
    if (box.closed || model.isCovered(box)) return false;
    if (n === 0) return true;
    return n < 4 && box.pieces[n - 1].k === kind;
  }

  function onBelt(state, kind) {
    var n = 0, i;
    for (i = 0; i < state.belt.length; i++) if (state.belt[i] && state.belt[i].k === kind) n++;
    return n;
  }

  // pieces of `kind` that are on their way: on the plates, plus those in the outbox of a tapped box (still leaving;
  // a bound pair counts its members one by one)
  function inTransit(state, kind) {
    var n = onBelt(state, kind), b, j, o;
    for (b = 0; b < state.boxes.length; b++) {
      o = state.boxes[b].outbox;
      for (j = 0; j < o.length; j++) if (o[j].k === kind) n++;
    }
    return n;
  }

  // R10b: a box D that the c pieces in transit could complete: non-empty, open, uncovered, front kind c with room,
  // nobody pulling pieces out of it, D.pieces.length + transit >= 4. A one-way box can be such a D.
  function completes(state, d, kind, transit) {
    var box = state.boxes[d];
    return box.pieces.length > 0 && box.pending === 0 && accepts(state, d, kind) && box.pieces.length + transit >= 4;
  }

  function completable(state, kind, transit) {
    var d;
    for (d = 0; d < state.boxes.length; d++) if (completes(state, d, kind, transit)) return true;
    return false;
  }

  // Does the piece on this plate land in this box as it passes the mouth? A kind skips boxes only to complete a box:
  //   R9   the pouring box attracts the kind past other boxes only while it can be completed (count + transit >= 4);
  //   R10b an empty box lets the piece ride on while some matching box can be completed;
  //   otherwise R8 + R10: the first accepting box. A box that is still pushing out a run (pending > 0) lets pieces
  //   pass. tryLand and isStuck both use exactly this.
  function wouldLand(state, plateIndex, boxIndex) {
    var piece = state.belt[plateIndex], box = state.boxes[boxIndex], p, t;
    if (!piece || box.pending > 0) return false;
    t = inTransit(state, piece.k);
    p = state.pouring[piece.k];
    if (p !== undefined && p !== boxIndex && completes(state, p, piece.k, t)) return false;      // R9
    if (!accepts(state, boxIndex, piece.k)) return false;                                         // R8
    if (box.pieces.length === 0 && completable(state, piece.k, t)) return false;                  // R10b
    return true;
  }

  // The plate's piece passes this mouth. Events [land, close?, unwrap*, thaw*, unlock?, reveal?] or [] when it rides on.
  function tryLand(state, plateIndex, boxIndex) {
    var piece = state.belt[plateIndex], box = state.boxes[boxIndex], events, np, kind, i, j, nb, allSame;
    if (!wouldLand(state, plateIndex, boxIndex)) return [];
    kind = piece.k;

    state.belt[plateIndex] = null;
    np = { id: piece.id, k: kind, hidden: false, key: piece.key, pair: null };
    box.pieces.push(np);
    events = [{ type: 'land', box: boxIndex, plate: plateIndex, piece: pub(np) }];
    if (inTransit(state, kind) > 0) state.pouring[kind] = boxIndex; else delete state.pouring[kind];

    allSame = box.pieces.length === 4;
    for (i = 0; allSame && i < 4; i++) if (box.pieces[i].k !== kind) allSame = false;
    if (allSame) {                          // R12
      box.closed = true;
      state.closedKinds.push(kind);
      delete state.pouring[kind];
      events.push({ type: 'close', box: boxIndex, kind: kind });
      for (i = 0; i < state.boxes.length; i++) {      // R17
        if (state.boxes[i].wrap === kind) {
          state.boxes[i].wrap = null;
          events.push({ type: 'unwrap', box: i });
        }
      }
      nb = state.neighbours[boxIndex] || [];          // R18
      for (j = 0; j < nb.length; j++) {
        if (state.boxes[nb[j]].ice) {
          state.boxes[nb[j]].ice = false;
          events.push({ type: 'thaw', box: nb[j] });
        }
      }
    }
    model.settle(state, events);            // R15, R19 (the landed piece, boxes that just uncovered)
    return events;
  }

  // R4: every kind sits in a closed box
  function isWon(state) {
    return state.kinds > 0 ? state.closedKinds.length >= state.kinds : false;
  }

  // R13/R14: the position is terminal when nothing can land on any lap (wouldLand is false for every plate and
  // box: pouring and R10b only pick the box, a piece with an accepting box always has one that takes it), no pending ejection can proceed, and no box can be
  // tapped. With every plate full that is exactly R13 (a tap needs a free plate). With free plates it is only
  // reached when the unit of every tappable box is a bound pair that does not fit, or nothing is tappable.
  function isStuck(state) {
    var i, b, u, empties = emptyPlates(state);
    for (i = 0; i < state.belt.length; i++) {
      if (!state.belt[i]) continue;
      for (b = 0; b < state.boxes.length; b++) {
        if (wouldLand(state, i, b)) return false;
      }
    }
    for (b = 0; b < state.boxes.length; b++) {
      if (state.boxes[b].pending > 0) {
        u = pendingUnit(state.boxes[b]);
        if (!u || u.size <= empties) return false;
      }
      if (canEject(state, b).ok) return false;
    }
    return true;
  }

  function endPouring(state, kind) { delete state.pouring[kind]; }

  PL.rules = {
    front: front, unit: unit, pendingUnit: pendingUnit, tap: tap, syncPending: syncPending, runLength: runLength, freePlates: freePlates, canEject: canEject,
    ejectUnit: ejectUnit, accepts: accepts, tryLand: tryLand, wouldLand: wouldLand, isWon: isWon, isStuck: isStuck,
    endPouring: endPouring, endPouringOf: endPouringOf
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.rules;
})(typeof window !== 'undefined' ? window : globalThis);
