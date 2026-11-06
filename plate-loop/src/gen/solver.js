// src/gen/solver.js: the abstract level solver (plan 5.2): one run in flight at a time, dest = any box downstream
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};
  var model = PL.model || (typeof require === 'function' ? require('../engine/model.js') : null);
  var rules = PL.rules || (typeof require === 'function' ? require('../engine/rules.js') : null);

  function layoutsMod() { return PL.layouts || (typeof require === 'function' ? require('../levels/layouts.js') : null); }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  // ------------------------------------------------------------------------------------------------
  // The abstract moves
  //
  // A move is { box, dest } (plus dest2 for a bound pair of two different kinds at the front, whose two pieces go to
  // two boxes). `box` ejects its whole front run (k = min(run, N) = run, since a box holds at most 4 and N >= 4), the
  // belt being empty at that moment; the run is routed to `dest`, a box downstream of `box` (belt order from its mouth,
  // wrapping round, `box` itself last) that accepts the run's kind (R8) after the ejection and has room for all of it.
  // The player gets the pieces past the boxes in between by kicking them out again (a tap on that box), which works
  // for an EMPTY intermediate box only: a non-empty matching box (or a one-way box) in between blocks the way, so
  // scanning stops there (that box can be the dest, nothing beyond it can).
  // bot.certify replays moves in the real sim and is the judge of realisability.
  //
  // The search runs on a compact encoding of the state (arrays of small ints, below); applyMove does the same
  // transition on the real engine state (rules.ejectUnit + rules.tryLand), and tests/gen.test.js checks that
  // both agree on random walks.
  //
  // Box content: one int (32 bits, may be negative), 8 bits per piece, slot 0 = back. Piece: bits 0-3 kind + 1
  // (1..13), bit 4 "bound to the next piece towards the front", bits 5-6 key index (lock index + 1) while that lock
  // is still closed, bit 7 hidden (a run ends at a hidden piece; the new front is revealed at once). Status: bit 0 closed, bit 1 ice, bits 2-5 wrap
  // (kind + 1), bits 6-7 lock (lock index + 1). A closed box is stored as content 0. State = [content0,
  // status0, content1, status1, ..., closedCount].
  // ------------------------------------------------------------------------------------------------

  function cnt(c) { return c === 0 ? 0 : ((c >>> 24) ? 4 : ((c >>> 16) ? 3 : ((c >>> 8) ? 2 : 1))); }
  function pcAt(c, j) { return (c >>> (8 * j)) & 255; }
  var PAIRS = 16 | (16 << 8) | (16 << 16) | (16 << 24);
  function norm(x, P) { var r = x % P; return r < 0 ? r + P : r; }

  // Boxes in the order a piece put on the belt at the source's mouth meets their mouths: the others by distance along
  // the belt, the source itself last (offset 0).
  function downstream(level, layout, count, offset) {
    var P = layout.perimeter, nb = count === undefined ? level.boxes.length : count, off = offset || 0, s = [], out = [], i, j, slot, ord, d;
    for (i = 0; i < nb; i++) {
      slot = layout.slots && layout.slots[level.boxes[i].id];
      if (!slot || typeof slot.s !== 'number') throw new Error('solver: layout has no mouth for box ' + level.boxes[i].id);
      s.push(level.dir === 'ccw' ? norm(P - slot.s, P) : norm(slot.s, P));
    }
    for (i = 0; i < nb; i++) {
      ord = [];
      for (j = 0; j < nb; j++) {
        if (j === i && !off) continue;
        d = j === i ? off : norm(s[j] - s[i] + off, P);
        if (j !== i && !off && d <= 1e-9) d = 1e-6 * (j + 1);
        ord.push({ j: j, d: d });
      }
      ord.sort(function (a, b) { return a.d - b.d; });
      out.push(ord.map(function (o) { return o.j; }));
      if (!off) out[i].push(i);
    }
    return out;
  }

  // up[i][j]: how far box j's mouth lies UPSTREAM of box i's mouth along the belt (0 < d <= perimeter)
  function upstreamDist(level, layout, count) {
    var P = layout.perimeter, nb = count, pos = [], out = [], i, j, row, d;
    for (i = 0; i < nb; i++) {
      d = layout.slots[level.boxes[i].id].s;
      pos.push(level.dir === 'ccw' ? norm(P - d, P) : norm(d, P));
    }
    for (i = 0; i < nb; i++) {
      row = [];
      for (j = 0; j < nb; j++) row.push(j === i ? P : (norm(pos[i] - pos[j], P) || P));
      out.push(row);
    }
    return out;
  }

  // ---------------------------------------------------------------- compile / convert

  function fromState(ctx, st) {
    var nb = ctx.nb, s = new Array(2 * nb + 1), i, j, b, c, p, k, li, status, closed = 0, n;
    for (i = 0; i < st.belt.length; i++) if (st.belt[i]) throw new Error('solver: the belt must be empty');
    for (i = 0; i < nb; i++) {
      b = st.boxes[i];
      if (b.closed) { s[2 * i] = 0; s[2 * i + 1] = 1; closed++; continue; }
      c = 0;
      n = b.pieces.length;
      for (j = 0; j < n; j++) {
        p = b.pieces[j];
        k = (p.k + 1) | 0;
        if (p.pair !== null && j + 1 < n && b.pieces[j + 1].pair === p.pair) k |= 16;
        if (p.key !== null && has(ctx.lockIndex, p.key) && !st.locks[p.key].open) k |= (ctx.lockIndex[p.key] + 1) << 5;
        if (p.hidden) k |= 128;
        c |= k << (8 * j);
      }
      status = 0;
      if (b.ice) status |= 2;
      if (b.wrap !== null) status |= (b.wrap + 1) << 2;
      if (b.lock !== null) { li = ctx.lockIndex[b.lock]; status |= (li + 1) << 6; }
      s[2 * i] = c;
      s[2 * i + 1] = status;
    }
    s[2 * nb] = closed;
    return s;
  }

  // compile(level, layout, parsed?) -> { ctx, s0 }
  function compile(level, layout, parsed) {
    var st = parsed || model.parse(level, { layout: layout }), nb = st.boxes.length, ctx, ids, i, j, b;
    if (!layout) throw new Error('solver: layout missing');
    ids = Object.keys(st.locks).sort();
    if (ids.length > 3) throw new Error('solver: at most 3 locks');
    if (st.kinds > 14) throw new Error('solver: at most 14 kinds');
    ctx = {
      nb: nb, N: st.N, kinds: st.kinds, dir: st.dir, order: downstream(level, layout, nb), up: upstreamDist(level, layout, nb), plate: layout.plate || 40, nbrs: st.neighbours,
      oneway: [], lockIds: ids, lockIndex: {}, lockBoxes: [], hasKeys: ids.length > 0, hasIce: false, hasWrap: false,
      hasMixedPair: false, hasHidden: false
    };
    for (i = 0; i < ids.length; i++) {
      ctx.lockIndex[ids[i]] = i;
      ctx.lockBoxes.push(st.locks[ids[i]].boxes.map(function (x) { return st.index[x]; }));
    }
    for (i = 0; i < nb; i++) {
      b = st.boxes[i];
      ctx.oneway.push(b.oneway ? 1 : 0);
      if (b.ice) ctx.hasIce = true;
      if (b.wrap !== null) ctx.hasWrap = true;
      for (j = 0; j < b.pieces.length; j++) if (b.pieces[j].hidden) ctx.hasHidden = true;
      for (j = 0; j + 1 < b.pieces.length; j++) {
        if (b.pieces[j].pair !== null && b.pieces[j + 1].pair === b.pieces[j].pair && b.pieces[j].k !== b.pieces[j + 1].k) ctx.hasMixedPair = true;
      }
    }
    return { ctx: ctx, s0: fromState(ctx, st), state: st };
  }

  // ---------------------------------------------------------------- transitions on the compact state

  function iceNeighbour(ctx, t, X) {
    var l = ctx.nbrs[X], j;
    for (j = 0; j < l.length; j++) if (t[2 * l[j] + 1] & 2) return true;
    return false;
  }

  function openLock(ctx, t, key) {
    var lb = ctx.lockBoxes[key - 1], j, b, c, slot, n, p, i;
    for (j = 0; j < lb.length; j++) t[2 * lb[j] + 1] &= 0x3F;
    for (i = 0; i < ctx.nb; i++) {
      c = t[2 * i];
      n = cnt(c);
      for (slot = 0; slot < n; slot++) {
        p = pcAt(c, slot);
        if (((p >>> 5) & 3) === key) c &= ~(96 << (8 * slot));
      }
      t[2 * i] = c;
    }
    for (j = 0; j < lb.length; j++) { b = lb[j]; settleBox(ctx, t, b); }
  }

  // reveal (R15) and key release (R19) for the front unit of box i, if it is open
  function settleBox(ctx, t, i) {
    var c, n, u, j, key, lb;
    if (t[2 * i + 1]) return;
    c = t[2 * i];
    n = cnt(c);
    if (!n) return;
    u = (n >= 2 && (pcAt(c, n - 2) & 16)) ? 2 : 1;
    if (ctx.hasHidden) {
      for (j = 0; j < u; j++) c &= ~(128 << (8 * (n - 1 - j)));
      t[2 * i] = c;
    }
    for (j = 0; j < u; j++) {
      key = (pcAt(c, n - 1 - j) >>> 5) & 3;
      if (key) {
        lb = ctx.lockBoxes[key - 1];
        if (((t[2 * lb[0] + 1] >>> 6) & 3) === key) {
          openLock(ctx, t, key);
          settleBox(ctx, t, i);
          return;
        }
      }
    }
  }

  // ejects the front run of box src in t. Returns the number of pieces and sets EJ.c, EJ.d (kinds of the two pieces
  // of a mixed pair) and EJ.mixed.
  var EJ = { k: 0, c: 0, d: 0, mixed: false, mate: -1, hasPair: false };
  function ejectRun(ctx, t, src) {
    var orig = t[2 * src], content = orig, i = cnt(content) - 1, c = (pcAt(content, i) & 15) - 1, k = 0, first = true, size, kb, p;
    EJ.mixed = false;
    EJ.mate = -1;
    EJ.hasPair = false;
    EJ.c = c;
    EJ.d = c;
    while (i >= 0) {
      p = pcAt(content, i);
      if (!first && (pcAt(orig, i) & 128)) break;          // a run ends at a hidden piece (decided before anything is revealed)
      if (i >= 1 && (pcAt(content, i - 1) & 16)) {
        size = 2;
        kb = (pcAt(content, i - 1) & 15) - 1;
        if (first) {
          if (kb !== c) { EJ.mixed = true; EJ.d = kb; }
        } else if (((p & 15) - 1) !== c || kb !== c || (pcAt(orig, i - 1) & 128)) break;
      } else {
        size = 1;
        if (!first && ((p & 15) - 1) !== c) break;
      }
      EJ.mate = size === 2 ? kb : -1;                // the second piece of the last unit, if that was a bound pair
      if (size === 2) EJ.hasPair = true;
      i -= size;
      k += size;
      t[2 * src] = i < 0 ? 0 : (i === 3 ? content : (content & ((1 << (8 * (i + 1))) - 1)));
      if (ctx.hasKeys || ctx.hasHidden) settleBox(ctx, t, src);
      content = t[2 * src];
      first = false;
      if (EJ.mixed) break;
    }
    EJ.k = k;
    return k;
  }

  // lands k pieces of kind c in box X (R12, R17, R18 on a close)
  function land(ctx, t, X, c, k) {
    var content = t[2 * X], n = cnt(content), code = c + 1, j, all, list, Y, l;
    for (j = 0; j < k; j++) content |= code << (8 * (n + j));
    n += k;
    if (n === 4) {
      all = true;
      for (j = 0; j < 4; j++) if ((pcAt(content, j) & 15) !== code) { all = false; break; }
      if (all) {
        t[2 * X] = 0;
        t[2 * X + 1] = 1;
        t[2 * ctx.nb]++;
        list = [];
        if (ctx.hasKeys) {                         // R12b: a key inside the closing box is released with the lid
          for (j = 0; j < 4; j++) {
            l = (pcAt(content, j) >>> 5) & 3;
            if (l && ((t[2 * ctx.lockBoxes[l - 1][0] + 1] >>> 6) & 3) === l) openLock(ctx, t, l);
          }
        }
        if (ctx.hasWrap) {
          for (Y = 0; Y < ctx.nb; Y++) {
            if (((t[2 * Y + 1] >>> 2) & 15) === code) { t[2 * Y + 1] &= ~(15 << 2); list.push(Y); }
          }
        }
        if (ctx.hasIce) {
          l = ctx.nbrs[X];
          for (j = 0; j < l.length; j++) {
            if (t[2 * l[j] + 1] & 2) { t[2 * l[j] + 1] &= ~2; list.push(l[j]); }
          }
        }
        if (ctx.hasKeys || ctx.hasHidden) for (j = 0; j < list.length; j++) settleBox(ctx, t, list[j]);
        return;
      }
    }
    t[2 * X] = content;
  }

  function plainEmpty(ctx, t, X) {
    return t[2 * X] === 0 && !t[2 * X + 1] && !ctx.oneway[X] && !(ctx.hasIce && iceNeighbour(ctx, t, X));
  }

  // R10b (rules.wouldLand): a piece of kind c does not land in an EMPTY box while some open non-empty box with front kind
  // c and room has count + (pieces of c on the belt) >= 4. The run's k pieces are all on the belt at the first landing
  // (the strongest case), so an empty box is a destination only if no box passes that test, and is skipped otherwise
  // (neither a stop nor a place for a kick).
  function completable(ctx, t, c, k) {
    var X, n, content;
    for (X = 0; X < ctx.nb; X++) {
      if (t[2 * X + 1]) continue;
      content = t[2 * X];
      n = cnt(content);
      if (n > 0 && n < 4 && n + k >= 4 && ((pcAt(content, n - 1) & 15) - 1) === c) return true;
    }
    return false;
  }

  // scan(ctx, t, ord, src, win, c, k, out): the boxes that k pieces of kind c, meeting the boxes in the order `ord`, can be
  // sent to. Empty boxes can be passed (the piece lands, a tap kicks it out); a non-empty matching box would keep the
  // first piece, a one-way box cannot give it back: scanning ends there (that box itself is still a destination).

  // `win` is how far behind the mouth the last piece is dropped (a tap puts the pieces on plates one plate width apart
  // right behind the mouth): boxes that close upstream are met by those pieces first. Such a box that is non-empty and
  // matching, or a one-way box that would keep a piece, spoils the move (no destination at all); an empty one is
  // just another box to kick through.
  function scan(ctx, t, ord, src, win, c, k, out) {
    var m = 0, j, X, content, n, comp = completable(ctx, t, c, k), comp1 = k === 1 ? comp : completable(ctx, t, c, 1), upr = ctx.up[src];
    out.length = 0;
    if (win > 0) {
      for (X = 0; X < ctx.nb; X++) {
        if (X === src || upr[X] > win || t[2 * X + 1]) continue;
        content = t[2 * X];
        n = cnt(content);
        if (n === 0) { if (ctx.oneway[X] && !comp1) return out; }
        else if (n < 4 && ((pcAt(content, n - 1) & 15) - 1) === c) return out;
      }
    }
    for (j = 0; j < ord.length; j++) {
      X = ord[j];
      if (t[2 * X + 1]) continue;
      content = t[2 * X];
      n = cnt(content);
      if (n === 0) {
        if (ctx.oneway[X]) {
          if (comp1) continue;                       // skipped by every piece of the run
          if (!comp) out[m++] = X;                   // a later piece (fewer in transit) may land and cannot be kicked out: the way ends
          break;
        }
        if (comp) continue;                          // R10b: an empty box lets the piece ride on while a box could be completed
        out[m++] = X;
      } else if (n < 4 && ((pcAt(content, n - 1) & 15) - 1) === c) {
        if (n + k <= 4) out[m++] = X;
        break;
      }
    }
    out.length = m;
    return out;
  }

  // Plain empty boxes are interchangeable, so only the lowest-numbered one is offered; skipPlain drops them
  // altogether (a whole box moved into a plain empty box only exchanges the two boxes).
  function finish(ctx, t, list, skipPlain) {
    var out = [], best = -1, j, X;
    for (j = 0; j < list.length; j++) {
      X = list[j];
      if (plainEmpty(ctx, t, X)) { if (best < 0 || X < best) best = X; }
      else out.push(X);
    }
    if (best >= 0 && !skipPlain) out.push(best);
    return out;
  }

  // the boxes the run just ejected from src (state t) can go to: a tap puts every piece on a plate right behind the
  // source's mouth (trapdoor plates), so all of them meet the boxes from the source on, the source itself last.
  function runCandidates(ctx, t, src, c, k, skipPlain) {
    return finish(ctx, t, scan(ctx, t, ctx.order[src], src, (k - 1) * ctx.plate + 2, c, k, []), skipPlain);
  }

  // sum of (groups - 1) over the unclosed kinds: a lower bound of the moves left (a move merges at most one group)
  function lowerBound(ctx, t) {
    var nb = ctx.nb, i, c, n, j, prev, groups = 0, kindsSeen = 0, mask = 0, k, pairs = false, b;
    for (i = 0; i < nb; i++) {
      c = t[2 * i];
      if (!c) continue;
      n = cnt(c);
      prev = -1;
      for (j = 0; j < n; j++) {
        k = pcAt(c, j);
        if ((k & 16) && ctx.hasMixedPair) pairs = true;
        k &= 15;
        if (k !== prev) { groups++; prev = k; }
        b = 1 << k;
        if (!(mask & b)) { mask |= b; kindsSeen++; }
      }
    }
    b = groups - kindsSeen;
    return pairs ? ((b + 1) >> 1) : b;
  }

  // ordering score of a state (higher is better): closed kinds, free boxes, little that still has to move
  function score(ctx, t) {
    var nb = ctx.nb, i, c, n, st, k0, r, empty = 0, uns = 0, cov = 0;
    for (i = 0; i < nb; i++) {
      st = t[2 * i + 1];
      if (st & 1) continue;
      if (st) cov++;
      c = t[2 * i];
      n = cnt(c);
      if (n === 0) { if (!st && !ctx.oneway[i]) empty++; continue; }
      k0 = pcAt(c, 0) & 15;
      r = 1;
      while (r < n && (pcAt(c, r) & 15) === k0) r++;
      uns += n - r;
    }
    return t[2 * nb] * 100 + empty * 7 - uns * 5 - cov * 9;
  }

  // all children of state s: [{ box, dest, dest2, s, score }]
  function expand(ctx, s) {
    var nb = ctx.nb, out = [], src, e, k, x, t, cs, y, t2, cs2, whole, status, content, c1, c2;
    for (src = 0; src < nb; src++) {
      status = s[2 * src + 1];
      if (status || ctx.oneway[src]) continue;
      content = s[2 * src];
      if (!content) continue;
      e = s.slice();
      k = ejectRun(ctx, e, src);
      if (!EJ.mixed) {
        whole = (e[2 * src] === 0 && !(content & PAIRS) && !ctx.oneway[src] && !(ctx.hasIce && iceNeighbour(ctx, e, src)));
        cs = runCandidates(ctx, e, src, EJ.c, k, whole);
        for (x = 0; x < cs.length; x++) {
          t = x === cs.length - 1 ? e : e.slice();
          land(ctx, t, cs[x], EJ.c, k);
          out.push({ box: src, dest: cs[x], dest2: -1, s: t, score: score(ctx, t) });
        }
      } else {
        c1 = EJ.c;
        c2 = EJ.d;
        cs = finish(ctx, e, scan(ctx, e, ctx.order[src], src, 0, c1, 1, []), false);
        for (x = 0; x < cs.length; x++) {
          t = e.slice();
          land(ctx, t, cs[x], c1, 1);
          cs2 = finish(ctx, t, scan(ctx, t, ctx.order[src], src, ctx.plate + 2, c2, 1, []), false);
          for (y = 0; y < cs2.length; y++) {
            t2 = y === cs2.length - 1 ? t : t.slice();
            land(ctx, t2, cs2[y], c2, 1);
            out.push({ box: src, dest: cs[x], dest2: cs2[y], s: t2, score: score(ctx, t2) });
          }
        }
      }
    }
    return out;
  }

  function keyOf(ctx, s) {
    var str = '', i, c, n = 2 * ctx.nb;
    for (i = 0; i < n; i += 2) {
      c = s[i];
      str += String.fromCharCode(c & 0xFFFF, c >>> 16, s[i + 1]);
    }
    return str;
  }

  // ---------------------------------------------------------------- search

  // depth-limited DFS with a transposition table. Returns 1 found, 0 exhausted, 2 budget
  function Searcher(ctx, maxNodes) {
    this.ctx = ctx;
    this.maxNodes = maxNodes;
    this.nodes = 0;
    this.path = [];
    this.tt = null;
    this.limit = 0;
    this.onPath = null;
    this.aborted = false;
  }
  Searcher.prototype.run = function (s0, limit) {
    this.tt = new Map();
    this.onPath = new Set();
    this.limit = limit;
    this.path = [];
    this.aborted = false;
    return this.dfs(s0, 0) ? 1 : (this.aborted ? 2 : 0);
  };
  Searcher.prototype.dfs = function (s, depth) {
    var ctx = this.ctx, nodes, key, rem, prev, ch, i, c;
    if (s[2 * ctx.nb] >= ctx.kinds) return true;
    if (this.aborted) return false;
    rem = this.limit - depth;
    if (rem <= 0 || depth > 500) return false;
    if (lowerBound(ctx, s) > rem) return false;
    key = keyOf(ctx, s);
    prev = this.tt.get(key);
    if (prev !== undefined && prev >= rem) return false;
    if (this.onPath.has(key)) return false;
    if (++this.nodes > this.maxNodes) { this.aborted = true; return false; }
    ch = expand(ctx, s);
    ch.sort(function (a, b) { return b.score - a.score; });
    this.onPath.add(key);
    for (i = 0; i < ch.length; i++) {
      c = ch[i];
      this.path.push(c);
      if (this.dfs(c.s, depth + 1)) { this.onPath.delete(key); return true; }
      this.path.pop();
      if (this.aborted) { this.onPath.delete(key); return false; }
    }
    this.onPath.delete(key);
    this.tt.set(key, rem);
    return false;
  };

  function movesOf(path) {
    return path.map(function (c) {
      var m = { box: c.box, dest: c.dest };
      if (c.dest2 >= 0) m.dest2 = c.dest2;
      return m;
    });
  }

  // solve(level, { maxNodes = 200000, layout, optimal = false, improve = 3000 })
  //   -> { solvable: true, moves, nodes, depth } | { solvable: false, nodes } | { unknown: true, nodes }
  // Default: one complete depth-first search, children best-first (closing moves, reveals, merges, empty boxes
  // last) with a transposition table; the first solution found is returned (usually a few moves above the
  // shortest). optimal: iterative deepening one move at a time from the lower bound, so the first solution found is
  // a shortest one (slower; the tests use it for the fixtures). improve: after the first solution, up to that many
  // more nodes are spent looking for shorter ones.
  function solve(level, opts) {
    var o = opts || {}, layout = o.layout || (layoutsMod() && layoutsMod()[level.layout]), maxNodes = o.maxNodes || 200000,
      comp = compile(level, layout), ctx = comp.ctx, s0 = comp.s0, lb = lowerBound(ctx, s0), sr = new Searcher(ctx, maxNodes), L, r, best, first, improve = o.improve === undefined ? 3000 : o.improve;
    if (s0[2 * ctx.nb] >= ctx.kinds) return { solvable: true, moves: [], nodes: 0, depth: 0 };
    if (o.optimal) {
      for (L = Math.max(1, lb); L <= lb + 40; L++) {
        r = sr.run(s0, L);
        if (r === 1) return { solvable: true, moves: movesOf(sr.path), nodes: sr.nodes, depth: sr.path.length };
        if (r === 2) return { unknown: true, nodes: sr.nodes };
      }
    }
    r = sr.run(s0, Infinity);                         // complete: finds a solution of any length, or proves there is none
    if (r === 1) {
      best = movesOf(sr.path);
      first = sr.nodes;                               // nodes of the search that found a solution (the shortening is extra)
      if (improve && !o.optimal) {                  // shorten: bounded searches for a solution one move shorter, within a small budget
        sr.maxNodes = sr.nodes + improve;
        while (best.length > Math.max(1, lb) && sr.run(s0, best.length - 1) === 1) best = movesOf(sr.path);
      }
      return { solvable: true, moves: best, nodes: first, depth: best.length };
    }
    if (r === 2) return { unknown: true, nodes: sr.nodes };
    return { solvable: false, nodes: sr.nodes };
  }

  // ---------------------------------------------------------------- applyMove on the real engine state

  // applyMove(state, move, layout) -> { state, events }: state must have an empty belt. Ejects the run onto
  // virtual plates 0..k-1 (rules.ejectUnit), then lands the pieces in order into move.dest (pouring is pointed at it
  // so the pieces pass the boxes in between, as the player's kicks achieve), a mixed pair's second piece into move.dest2.
  function applyMove(state, move, layout) {
    var st = model.clone(state), events = [], ce, box, k, plate = 0, u, plates, i, ev, ks, pi, dest;
    for (i = 0; i < st.belt.length; i++) if (st.belt[i]) throw new Error('applyMove: the belt must be empty');
    ce = rules.canEject(st, move.box);
    if (!ce.ok) throw new Error('applyMove: box ' + st.boxes[move.box].id + ' cannot be ejected (' + ce.reason + ')');
    box = st.boxes[move.box];
    k = ce.k;
    while (plate < k) {
      u = rules.unit(box);
      plates = u.size === 2 ? [plate, plate + 1] : [plate];
      ev = rules.ejectUnit(st, move.box, plates);
      for (i = 0; i < ev.length; i++) events.push(ev[i]);
      plate += u.size;
    }
    ks = [];
    for (i = 0; i < k; i++) ks.push(st.belt[i].k);
    for (pi = 0; pi < k; pi++) {
      dest = (pi > 0 && move.dest2 !== undefined) ? move.dest2 : move.dest;
      st.pouring[ks[pi]] = dest;
      ev = rules.tryLand(st, pi, dest);
      if (!ev.length) throw new Error('applyMove: box ' + st.boxes[dest].id + ' does not accept kind ' + ks[pi]);
      for (i = 0; i < ev.length; i++) events.push(ev[i]);
    }
    st.pouring = {};
    return { state: st, events: events, k: k };
  }

  // ---------------------------------------------------------------- analyze: how hard is a level?
  //
  // Enumerates the whole position graph (the abstract moves of expand, capped at maxStates) and computes, exactly:
  //   pRandom   the probability that a player who picks a uniformly random legal move (box and destination) wins;
  //   pNatural  the same for a player who taps a uniformly random tappable box and lets the run land where the belt
  //             takes it (the first destination in belt order, no kicks): the "naive player";
  //   safe      over the states of the shortest solution: the mean share of moves that keep the level winnable;
  //   traps     states from which the level can no longer be won / all reachable states;
  //   states, edges, solutions (0 = none, else the depth of the shortest), capped (the graph was cut at maxStates).
  // Cycles exist (a run moved into an empty box and back), so winning states come from a backward fixed point and the
  // probabilities from value iteration. Costs O(states * edges); a hard level has a few thousand states.
  function analyze(level, opts) {
    var o = opts || {}, layout = o.layout || (layoutsMod() && layoutsMod()[level.layout]), maxStates = o.maxStates || 20000,
      comp = compile(level, layout), ctx = comp.ctx, nb = ctx.nb, s0 = comp.s0, states = [], index = new Map(), queue = [], out = [], nat = [],
      i, s, ch, j, k, key, edges = 0, capped = false, win, changed, it, v, nv, delta, acc, cnt0, acc2, seenBox, pr, pn, dist, d, best,
      solved, depth, safeSum = 0, safeN = 0, path, cur, nxt, traps = 0;
    function id(st) {
      var kk = keyOf(ctx, st), ix = index.get(kk);
      if (ix !== undefined) return ix;
      if (states.length >= maxStates) { capped = true; return -1; }
      ix = states.length; index.set(kk, ix); states.push(st); queue.push(ix);
      return ix;
    }
    id(s0);
    for (i = 0; i < queue.length; i++) {
      s = states[queue[i]];
      if (s[2 * nb] >= ctx.kinds) { out.push([]); nat.push([]); continue; }
      ch = expand(ctx, s);
      var list = [], nl = [], firstOf = {};
      for (j = 0; j < ch.length; j++) {
        k = id(ch[j].s);
        if (k < 0) continue;
        list.push(k);
        // natural landing: the first destination (in expand's belt order) for this source box (and for a mixed pair,
        // the first dest2 of the first dest)
        if (firstOf[ch[j].box] === undefined) { firstOf[ch[j].box] = k; nl.push(k); }
      }
      edges += list.length;
      out.push(list); nat.push(nl);
    }
    // winning states: backward fixed point
    win = [];
    for (i = 0; i < states.length; i++) win.push(states[i][2 * nb] >= ctx.kinds);
    changed = true;
    while (changed) {
      changed = false;
      for (i = 0; i < states.length; i++) {
        if (win[i]) continue;
        for (j = 0; j < out[i].length; j++) if (win[out[i][j]]) { win[i] = true; changed = true; break; }
      }
    }
    solved = win[0];
    // shortest solution depth (BFS on winning edges)
    depth = -1;
    if (solved) {
      dist = []; for (i = 0; i < states.length; i++) dist.push(-1);
      dist[0] = 0; queue = [0];
      for (i = 0; i < queue.length && depth < 0; i++) {
        cur = queue[i];
        if (states[cur][2 * nb] >= ctx.kinds) { depth = dist[cur]; break; }
        for (j = 0; j < out[cur].length; j++) { nxt = out[cur][j]; if (dist[nxt] < 0) { dist[nxt] = dist[cur] + 1; queue.push(nxt); } }
      }
      // safe-move share along one shortest path: greedy walk along decreasing distance-to-goal
      // (recompute distance to the goal backwards: states at distance d from a win)
      d = []; for (i = 0; i < states.length; i++) d.push(states[i][2 * nb] >= ctx.kinds ? 0 : -1);
      changed = true;
      while (changed) {
        changed = false;
        for (i = 0; i < states.length; i++) {
          if (d[i] === 0) continue;
          best = -1;
          for (j = 0; j < out[i].length; j++) { k = out[i][j]; if (d[k] >= 0 && (best < 0 || d[k] + 1 < best)) best = d[k] + 1; }
          if (best >= 0 && (d[i] < 0 || best < d[i])) { d[i] = best; changed = true; }
        }
      }
      cur = 0; path = [0];
      while (d[cur] > 0) {
        cnt0 = 0;
        for (j = 0; j < out[cur].length; j++) if (win[out[cur][j]]) cnt0++;
        if (out[cur].length) { safeSum += cnt0 / out[cur].length; safeN++; }
        nxt = -1;
        for (j = 0; j < out[cur].length; j++) { k = out[cur][j]; if (d[k] === d[cur] - 1) { nxt = k; break; } }
        if (nxt < 0) break;
        cur = nxt; path.push(cur);
      }
    }
    for (i = 0; i < states.length; i++) if (!win[i]) traps++;
    // value iteration for the two random players
    function iterate(adj) {
      var val = [], q, n, m;
      for (q = 0; q < states.length; q++) val.push(states[q][2 * nb] >= ctx.kinds ? 1 : 0);
      for (it = 0; it < 400; it++) {
        delta = 0;
        for (q = 0; q < states.length; q++) {
          if (states[q][2 * nb] >= ctx.kinds || !win[q]) continue;        // a losing state stays 0
          n = adj[q].length;
          if (!n) continue;
          acc = 0;
          for (m = 0; m < n; m++) acc += val[adj[q][m]];
          nv = acc / n;
          if (Math.abs(nv - val[q]) > delta) delta = Math.abs(nv - val[q]);
          val[q] = nv;
        }
        if (delta < 1e-5) break;
      }
      return val[0];
    }
    if (capped) return estimate(level, layout, o, ctx, s0, states.length, edges);
    pr = solved ? iterate(out) : 0;
    pn = solved ? iterate(nat) : 0;
    return {
      solvable: solved, depth: depth, states: states.length, edges: edges, capped: false, estimated: false,
      pRandom: pr, pNatural: pn, safe: safeN ? safeSum / safeN : (solved ? 1 : 0), traps: states.length ? traps / states.length : 0
    };
  }

  // The graph was too big to enumerate: the two players are estimated by random playouts instead (seeded, so a level
  // always gets the same numbers). A playout that has not won after 3 * (solution length) + 12 moves counts as lost.
  function estimate(level, layout, o, ctx, s0, nStates, nEdges) {
    var nb = ctx.nb, sol = solve(level, { layout: layout, maxNodes: o.maxNodes || 60000, improve: 0 }), playouts = o.playouts || 300,
      cap, seed = 0x9E3779B1, wins, p, s, moves, ch, j, firstOf, nl, k, won, prA, prN, cnt;
    if (!sol.solvable) return { solvable: false, depth: -1, states: nStates, edges: nEdges, capped: true, estimated: true, pRandom: 0, pNatural: 0, safe: 0, traps: 1 };
    cap = 3 * sol.moves.length + 12;
    function rnd() { seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    function play(natural) {
      wins = 0;
      for (p = 0; p < playouts; p++) {
        s = s0; won = false;
        for (moves = 0; moves < cap; moves++) {
          if (s[2 * nb] >= ctx.kinds) { won = true; break; }
          ch = expand(ctx, s);
          if (!ch.length) break;
          if (natural) {
            firstOf = {}; nl = [];
            for (j = 0; j < ch.length; j++) if (firstOf[ch[j].box] === undefined) { firstOf[ch[j].box] = 1; nl.push(ch[j]); }
            k = nl[Math.floor(rnd() * nl.length)];
          } else k = ch[Math.floor(rnd() * ch.length)];
          s = k.s;
        }
        if (!won && s[2 * nb] >= ctx.kinds) won = true;
        if (won) wins++;
      }
      return wins / playouts;
    }
    prA = play(false);
    prN = play(true);
    return { solvable: true, depth: sol.moves.length, states: nStates, edges: nEdges, capped: true, estimated: true, pRandom: prA, pNatural: prN, safe: -1, traps: -1 };
  }

  PL.solver = {
    solve: solve, applyMove: applyMove, downstream: downstream, analyze: analyze,
    _internal: { compile: compile, fromState: fromState, expand: expand, keyOf: keyOf, lowerBound: lowerBound, score: score, cnt: cnt, pcAt: pcAt }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.solver;
})(typeof window !== 'undefined' ? window : globalThis);
