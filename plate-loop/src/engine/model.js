// src/engine/model.js: level parsing and validation, kind permutation, state cloning and hashing
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};
  var config = PL.config || (typeof require === 'function' ? require('../config.js') : null);

  var MIN_N = config ? config.MIN_N : 4;
  var MAX_N = config ? config.MAX_N : 10;
  var SPRITES = config && config.KIND_NAMES ? config.KIND_NAMES.length : 12;

  function isInt(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x; }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  // ---------------------------------------------------------------- pieces

  // The public face of a piece, as carried by events.
  function pub(p) { return { id: p.id, k: p.k, key: p.key }; }

  function bad(boxId, e) {
    return new Error('level: box ' + boxId + ': bad piece ' + JSON.stringify(e));
  }

  // 'k' | 'h:k' | 'k:ID:k' | 'hk:ID:k' -> { k, hidden, key }
  function parseSingle(e, boxId) {
    var k, parts, hidden = false, key = null;
    if (typeof e === 'number') {
      k = e;
    } else if (typeof e === 'string') {
      parts = e.split(':');
      if (parts[0] === 'h' && parts.length === 2) { hidden = true; k = Number(parts[1]); }
      else if (parts[0] === 'k' && parts.length === 3) { key = parts[1]; k = Number(parts[2]); }
      else if (parts[0] === 'hk' && parts.length === 3) { hidden = true; key = parts[1]; k = Number(parts[2]); }
      else throw bad(boxId, e);
      if (key !== null && key === '') throw bad(boxId, e);
    } else {
      throw bad(boxId, e);
    }
    if (!isInt(k) || k < 0) throw bad(boxId, e);
    return { k: k, hidden: hidden, key: key };
  }

  // The next ejectable unit of a box (R16): the front piece alone, or the bound pair at the front.
  function frontUnit(box) {
    var p = box.pieces, n = p.length, f;
    if (!n) return null;
    f = p[n - 1];
    if (f.pair !== null && n >= 2 && p[n - 2].pair === f.pair) return { size: 2, pieces: [f, p[n - 2]] };
    return { size: 1, pieces: [f] };
  }

  function isCovered(box) { return box.wrap !== null || box.ice || box.lock !== null; }

  // Reveals (R15) and key releases (R19) for every uncovered box whose front unit is exposed, until nothing
  // changes any more (an unlock can uncover a box whose front piece carries the next key). Pushes events.
  function settle(state, events) {
    var changed = true, guard = 0, i, j, box, u, pc, lock, ids, m;
    while (changed && guard++ < 1000) {
      changed = false;
      for (i = 0; i < state.boxes.length; i++) {
        box = state.boxes[i];
        if (box.closed || isCovered(box)) continue;
        u = frontUnit(box);
        if (!u) continue;
        for (j = 0; j < u.pieces.length; j++) {
          pc = u.pieces[j];
          if (pc.hidden) {
            pc.hidden = false;
            events.push({ type: 'reveal', box: i, piece: pub(pc) });
            changed = true;
          }
          lock = pc.key !== null && has(state.locks, pc.key) ? state.locks[pc.key] : null;
          if (lock && !lock.open) {
            lock.open = true;
            ids = [];
            for (m = 0; m < lock.boxes.length; m++) {
              state.boxes[state.index[lock.boxes[m]]].lock = null;
              ids.push(state.index[lock.boxes[m]]);
            }
            events.push({ type: 'unlock', lock: pc.key, boxes: ids, box: i, piece: pub(pc) });
            changed = true;
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- parse

  // model.parse(level, opts?)  opts: { layout (for neighbours, R18), neighbours (id -> ids), raw (skip settle) }
  function parse(level, opts) {
    var state, nextPiece = 0, nextPair = 1, i, j, bi, b, mods, entries, e, a, c, pc, pid, box, id,
      names, lay, nmap, ia, ib, x;
    opts = opts || {};
    if (!level || typeof level !== 'object' || !Array.isArray(level.boxes)) throw new Error('level: boxes missing');
    if (!isInt(level.N) || level.N < 1) throw new Error('level: N must be a positive integer');
    if (level.dir !== undefined && level.dir !== 'cw' && level.dir !== 'ccw') throw new Error('level: dir must be cw or ccw');
    lay = opts.layout || null;

    state = {
      level: level, N: level.N, dir: level.dir || 'cw', kinds: level.kinds,
      boxes: [], index: {}, locks: {}, belt: [], pouring: {}, closedKinds: [],
      neighbours: [], nextPieceId: 0, initialEvents: []
    };

    for (bi = 0; bi < level.boxes.length; bi++) {
      b = level.boxes[bi];
      if (!b || typeof b.id !== 'string' || !Array.isArray(b.pieces)) throw new Error('level: box #' + bi + ' needs an id and pieces');
      id = b.id;
      if (has(state.index, id)) throw new Error('level: duplicate box id ' + id);
      if (lay && !(lay.slots && has(lay.slots, id))) throw new Error('level: box ' + id + ' is not a slot of the layout');
      mods = b.mods || {};
      for (x in mods) {
        if (has(mods, x) && x !== 'lock' && x !== 'oneway' && x !== 'wrap' && x !== 'ice') throw new Error('level: box ' + id + ': unknown mod ' + x);
      }
      if (mods.wrap !== undefined && mods.wrap !== null && !isInt(mods.wrap)) throw new Error('level: box ' + id + ': wrap needs a kind');
      if (mods.lock !== undefined && mods.lock !== null && typeof mods.lock !== 'string') throw new Error('level: box ' + id + ': lock needs an id');
      box = {
        id: id, index: bi, pieces: [], closed: false,
        wrap: mods.wrap !== undefined && mods.wrap !== null ? mods.wrap : null,
        ice: !!mods.ice,
        lock: mods.lock !== undefined && mods.lock !== null ? mods.lock : null,
        oneway: !!mods.oneway,
        outbox: [], pending: 0
      };
      for (j = 0; j < b.pieces.length; j++) {
        e = b.pieces[j];
        if (Array.isArray(e)) {
          if (e[0] !== 'p' || e.length !== 3 || Array.isArray(e[1]) || Array.isArray(e[2])) throw bad(id, e);
          a = parseSingle(e[1], id);
          c = parseSingle(e[2], id);
          pid = nextPair++;
          box.pieces.push({ id: nextPiece++, k: a.k, hidden: a.hidden, key: a.key, pair: pid });
          box.pieces.push({ id: nextPiece++, k: c.k, hidden: c.hidden, key: c.key, pair: pid });
        } else {
          pc = parseSingle(e, id);
          box.pieces.push({ id: nextPiece++, k: pc.k, hidden: pc.hidden, key: pc.key, pair: null });
        }
      }
      state.index[id] = bi;
      state.boxes.push(box);
      state.neighbours.push([]);
      if (box.lock !== null) {
        if (!has(state.locks, box.lock)) state.locks[box.lock] = { boxes: [], open: false };
        state.locks[box.lock].boxes.push(id);
      }
    }
    state.nextPieceId = nextPiece;
    if (state.kinds === undefined) {
      state.kinds = 0;
      for (i = 0; i < state.boxes.length; i++) {
        for (j = 0; j < state.boxes[i].pieces.length; j++) state.kinds = Math.max(state.kinds, state.boxes[i].pieces[j].k + 1);
      }
    }
    for (i = 0; i < state.N; i++) state.belt.push(null);

    nmap = opts.neighbours || (lay && lay.neighbours) || null;
    if (nmap) {
      for (names in nmap) {
        if (!has(nmap, names) || !has(state.index, names)) continue;
        ia = state.index[names];
        for (j = 0; j < nmap[names].length; j++) {
          if (!has(state.index, nmap[names][j])) continue;
          ib = state.index[nmap[names][j]];
          if (ia === ib) continue;
          if (state.neighbours[ia].indexOf(ib) < 0) state.neighbours[ia].push(ib);
          if (state.neighbours[ib].indexOf(ia) < 0) state.neighbours[ib].push(ia);
        }
      }
    }

    if (!opts.raw) settle(state, state.initialEvents);
    return state;
  }

  // ---------------------------------------------------------------- validate

  // Returns [] or messages starting with the rule id. opts: { layout }
  function validate(level, opts) {
    var errs = [], st, i, j, k, box, p, counts = {}, total = 0, n, mods, keys = {}, seen, kinds, id;
    try { st = parse(level, { layout: opts && opts.layout, raw: true }); }
    catch (e) { return [String(e.message)]; }
    kinds = st.kinds;
    if (!isInt(kinds) || kinds < 1) { errs.push('R3: kinds must be a positive integer'); kinds = 0; }
    if (st.N < MIN_N || st.N > MAX_N) errs.push('R1: N ' + st.N + ' is outside ' + MIN_N + '..' + MAX_N);
    if (kinds && st.boxes.length < kinds) errs.push('R3: ' + st.boxes.length + ' boxes for ' + kinds + ' kinds');

    for (i = 0; i < st.boxes.length; i++) {
      box = st.boxes[i];
      id = box.id;
      n = box.pieces.length;
      if (n > 4) errs.push('R2: box ' + id + ' holds ' + n + ' pieces (max 4)');
      seen = {};
      for (j = 0; j < n; j++) {
        p = box.pieces[j];
        total++;
        counts[p.k] = (counts[p.k] || 0) + 1;
        if (kinds && p.k >= kinds) errs.push('R3: kind ' + p.k + ' in box ' + id + ' is outside 0..' + (kinds - 1));
        if (p.key !== null) keys[p.key] = (keys[p.key] || 0) + 1;
        seen[p.k] = true;
      }
      if (n === 4 && box.pieces[0].k === box.pieces[1].k && box.pieces[1].k === box.pieces[2].k && box.pieces[2].k === box.pieces[3].k) {
        errs.push('R12: box ' + id + ' starts with four of kind ' + box.pieces[0].k);
      }
      if (n && box.pieces[n - 1].hidden) errs.push('R15: front piece of box ' + id + ' is hidden');
      // R21: wrapped, frozen and locked exclude each other; one-way may combine with any of them
      mods = [];
      if (box.wrap !== null) mods.push('wrap');
      if (box.ice) mods.push('ice');
      if (box.lock !== null) mods.push('lock');
      if (mods.length > 1) errs.push('R21: box ' + id + ' combines ' + mods.join(' and '));
      if (box.wrap !== null) {
        if (kinds && (box.wrap < 0 || box.wrap >= kinds)) errs.push('R17: box ' + id + ' is wrapped with unknown kind ' + box.wrap);
        if (seen[box.wrap]) errs.push('R17: box ' + id + ' is wrapped with kind ' + box.wrap + ' but holds one');
      }
      if (box.oneway) {
        if (n > 3) errs.push('R20: one-way box ' + id + ' starts with ' + n + ' pieces (max 3)');
        for (j = 1; j < n; j++) {
          if (box.pieces[j].k !== box.pieces[0].k) { errs.push('R20: one-way box ' + id + ' starts with mixed kinds'); break; }
        }
      }
    }
    for (k = 0; k < kinds; k++) {
      if ((counts[k] || 0) !== 4) errs.push('R3: kind ' + k + ' has ' + (counts[k] || 0) + ' pieces');
    }
    for (id in st.locks) {
      if (!has(st.locks, id)) continue;
      if ((keys[id] || 0) !== 1) errs.push('R19: lock ' + id + ' has ' + (keys[id] || 0) + ' keys (needs exactly 1)');
    }
    for (id in keys) {
      if (has(keys, id) && !has(st.locks, id)) errs.push('R19: key ' + id + ' has no shutter');
    }
    for (i = 0; i < st.boxes.length; i++) {
      box = st.boxes[i];
      if (box.lock === null) continue;
      for (j = 0; j < box.pieces.length; j++) {
        if (box.pieces[j].key === box.lock) errs.push('R19: key ' + box.lock + ' lies behind its own shutter in box ' + box.id);
      }
    }
    return errs;
  }

  // ---------------------------------------------------------------- clone, hash

  function clone(state) {
    var c = {
      level: state.level, N: state.N, dir: state.dir, kinds: state.kinds,
      boxes: [], index: state.index, locks: {}, belt: [], pouring: {}, closedKinds: state.closedKinds.slice(),
      neighbours: state.neighbours, nextPieceId: state.nextPieceId, initialEvents: state.initialEvents.slice()
    }, i, j, b, o, x;
    for (i = 0; i < state.boxes.length; i++) {
      b = state.boxes[i];
      o = {
        id: b.id, index: b.index, pieces: [], closed: b.closed, wrap: b.wrap, ice: b.ice, lock: b.lock,
        oneway: b.oneway, outbox: [], pending: b.pending
      };
      for (j = 0; j < b.pieces.length; j++) {
        o.pieces.push({ id: b.pieces[j].id, k: b.pieces[j].k, hidden: b.pieces[j].hidden, key: b.pieces[j].key, pair: b.pieces[j].pair });
      }
      for (j = 0; j < b.outbox.length; j++) {
        o.outbox.push({ id: b.outbox[j].id, k: b.outbox[j].k, hidden: b.outbox[j].hidden, key: b.outbox[j].key, pair: b.outbox[j].pair });
        if (b.outbox[j].plate !== undefined) {         // the plan made by sim.tap: reserved plate and departure time
          o.outbox[j].plate = b.outbox[j].plate;
          o.outbox[j].departAt = b.outbox[j].departAt;
        }
      }
      c.boxes.push(o);
    }
    for (x in state.locks) {
      if (has(state.locks, x)) c.locks[x] = { boxes: state.locks[x].boxes.slice(), open: state.locks[x].open };
    }
    for (i = 0; i < state.belt.length; i++) {
      b = state.belt[i];
      c.belt.push(b ? { id: b.id, k: b.k, key: b.key, from: b.from } : null);
    }
    for (x in state.pouring) {
      if (has(state.pouring, x)) c.pouring[x] = state.pouring[x];
    }
    return c;
  }

  // Canonical string for memoisation: boxes in order, their pieces and modifiers, the belt as a multiset,
  // the pouring map. Piece ids and plate positions are not part of it.
  function hash(state) {
    var parts = [], i, b, belt = [], pour = [], x, lk = [];
    function pieceList(list) {
      var out = '', j, p;
      for (j = 0; j < list.length; j++) {
        p = list[j];
        if (p.pair !== null) out += (j + 1 < list.length && list[j + 1].pair === p.pair) ? '(' : '';
        out += p.k + (p.hidden ? 'h' : '') + (p.key !== null ? '#' + p.key : '');
        if (p.pair !== null && !(j + 1 < list.length && list[j + 1].pair === p.pair)) out += ')';
        out += ',';
      }
      return out;
    }
    for (i = 0; i < state.boxes.length; i++) {
      b = state.boxes[i];
      parts.push((b.closed ? 'X' : '') + (b.wrap !== null ? 'w' + b.wrap : '') + (b.ice ? 'i' : '') +
        (b.lock !== null ? 'l' + b.lock : '') + (b.oneway ? 'o' : '') + '[' + pieceList(b.pieces) + ']' +
        (b.outbox.length ? '>' + pieceList(b.outbox) + '<' : ''));
    }
    for (i = 0; i < state.belt.length; i++) {
      if (state.belt[i]) belt.push(state.belt[i].k + (state.belt[i].key !== null ? '#' + state.belt[i].key : ''));
    }
    belt.sort();
    for (x in state.pouring) {
      if (has(state.pouring, x)) pour.push(x + '>' + state.pouring[x]);
    }
    pour.sort();
    for (x in state.locks) {
      if (has(state.locks, x) && state.locks[x].open) lk.push(x);
    }
    lk.sort();
    return parts.join('|') + '/' + belt.join(',') + '/' + pour.join(',') + '/' + lk.join(',');
  }

  // ---------------------------------------------------------------- permutation (R23)

  function mulberry32(a) {
    return function () {
      var t;
      a = (a + 0x6D2B79F5) | 0;
      t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedOf(v) {
    var h = 2166136261, s, i;
    if (typeof v === 'number' && isFinite(v)) return v | 0;
    s = String(v);
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h | 0;
  }

  // model.permutation(levelId, attempt, n?) -> array mapping kind index -> sprite index; a bijection on 0..n-1
  // (n defaults to the number of sprites). Same (levelId, attempt) -> same array.
  function permutation(levelId, attempt, n) {
    var size = n === undefined ? SPRITES : n, rnd, a = [], i, j, t;
    rnd = mulberry32(Math.imul(seedOf(levelId), 73856093) ^ Math.imul(seedOf(attempt) + 1, 19349663) ^ 0x5bd1e995);
    for (i = 0; i < size; i++) a.push(i);
    for (i = size - 1; i > 0; i--) {
      j = Math.floor(rnd() * (i + 1));
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // model.pieceId(state) -> a fresh unique piece id for this state (parse numbers 0..n-1 in box order, back to front)
  function pieceId(state) { return state.nextPieceId++; }

  PL.model = {
    parse: parse, validate: validate, clone: clone, hash: hash, permutation: permutation, pieceId: pieceId,
    settle: settle, frontUnit: frontUnit, isCovered: isCovered, pub: pub
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.model;
})(typeof window !== 'undefined' ? window : globalThis);
