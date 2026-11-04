'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const layouts = require('../src/levels/layouts.js');
const helpers = require('./helpers.js');

const W = 360, H = 634, MARGIN = 8, CLEAR = 24, EPS = 1e-6;
const NAMES = ['ring-2col', 'counter'];
const NORMAL = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

function samples(layout) {
  const pts = [];
  for (let s = 0; s < layout.perimeter; s += 2) { const p = layouts.pointAt(layout, s); pts.push({ s, x: p.x, y: p.y }); }
  return pts;
}
function distToRect(p, r) {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.sqrt(dx * dx + dy * dy);
}
function circ(a, b, L) { const d = Math.abs(a - b) % L; return Math.min(d, L - d); }

test('list() names both templates, each reachable by name', () => {
  assert.deepEqual(layouts.list(), NAMES);
  for (const n of NAMES) assert.equal(layouts[n].name, n);
  assert.equal(globalThis.PlateLoop.layouts, layouts);
});

test('slot sets: ring-2col 14, counter 12, plate 40', () => {
  const ring = layouts['ring-2col'], counter = layouts.counter;
  assert.deepEqual(Object.keys(ring.slots).sort(),
    ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']);
  assert.deepEqual(Object.keys(counter.slots).sort(),
    ['B1', 'B2', 'B3', 'B4', 'B5', 'I1', 'I2', 'T1', 'T2', 'T3', 'T4', 'T5']);
  for (const n of NAMES) {
    assert.equal(layouts[n].plate, 40);
    assert.deepEqual(layouts[n].order.slice().sort(), Object.keys(layouts[n].slots).sort());
  }
});

test('box sizes and mouth sides as specified', () => {
  const ring = layouts['ring-2col'], counter = layouts.counter;
  for (const id in ring.slots) {
    const b = ring.slots[id];
    assert.equal(b.h, 44);
    assert.equal(b.w, 124);
    assert.equal(b.mouth, id[0] === 'L' ? 'left' : 'right');
  }
  for (let i = 1; i <= 7; i++) assert.equal(ring.slots['L' + i].y, ring.slots['R' + i].y);
  for (let i = 1; i < 7; i++) assert.equal(ring.slots['L' + (i + 1)].y - ring.slots['L' + i].y, 48);
  for (let i = 1; i <= 5; i++) {
    assert.deepEqual([counter.slots['T' + i].w, counter.slots['T' + i].h, counter.slots['T' + i].mouth], [44, 132, 'down']);
    assert.deepEqual([counter.slots['B' + i].w, counter.slots['B' + i].h, counter.slots['B' + i].mouth], [44, 132, 'up']);
  }
  assert.deepEqual([counter.slots.I1.w, counter.slots.I1.h, counter.slots.I1.mouth], [132, 44, 'right']);
  assert.deepEqual([counter.slots.I2.w, counter.slots.I2.h, counter.slots.I2.mouth], [132, 44, 'left']);
});

test('perimeter equals measure(path, corner) and the closed-form value', () => {
  for (const n of NAMES) {
    const l = layouts[n];
    assert.ok(Math.abs(l.perimeter - layouts.measure(l.path, l.corner)) < 1e-9);
  }
  // rectangle w x h with corner r: 2(w+h) - 8r + 2 pi r
  const r = layouts['ring-2col'];
  assert.ok(Math.abs(r.perimeter - (2 * (304 + 578) - 8 * 24 + 2 * Math.PI * 24)) < 1e-9);
  const c = layouts.counter;
  assert.ok(Math.abs(c.perimeter - (2 * (304 + 300) - 8 * 40 + 2 * Math.PI * 40)) < 1e-9);
  assert.ok(Math.abs(layouts.measure([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], 0) - 400) < 1e-9);
});

test('every box stays inside the board with an 8 unit margin', () => {
  for (const n of NAMES) {
    for (const id in layouts[n].slots) {
      const b = layouts[n].slots[id];
      assert.ok(b.x >= MARGIN && b.y >= MARGIN && b.x + b.w <= W - MARGIN && b.y + b.h <= H - MARGIN, n + ' ' + id);
    }
  }
});

test('belt centreline and plates stay on the board', () => {
  for (const n of NAMES) {
    for (const p of samples(layouts[n])) {
      assert.ok(p.x - 20 >= 0 && p.x + 20 <= W && p.y - 20 >= 0 && p.y + 20 <= H, n + ' s=' + p.s);
    }
  }
});

test('no box comes closer than plate/2 + 4 to the belt centreline', () => {
  for (const n of NAMES) {
    const l = layouts[n], pts = samples(l);
    assert.equal(CLEAR, l.plate / 2 + 4);
    for (const id in l.slots) {
      let min = Infinity;
      for (const p of pts) min = Math.min(min, distToRect(p, l.slots[id]));
      assert.ok(min >= CLEAR - EPS, n + ' ' + id + ' distance ' + min);
    }
  }
});

test('boxes do not overlap each other', () => {
  for (const n of NAMES) {
    const l = layouts[n], ids = Object.keys(l.slots);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = l.slots[ids[i]], b = l.slots[ids[j]];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!overlap, n + ' ' + ids[i] + ' / ' + ids[j]);
    }
  }
});

test('every mouth faces the belt: close, on the mouth side, and s matches the nearest path point', () => {
  for (const n of NAMES) {
    const l = layouts[n], pts = samples(l);
    for (const id in l.slots) {
      const b = l.slots[id], m = layouts.mouthPoint(b), nrm = NORMAL[b.mouth];
      let best = null, bd = Infinity;
      for (const p of pts) {
        const d = Math.hypot(p.x - m.x, p.y - m.y);
        if (d < bd) { bd = d; best = p; }
      }
      assert.ok(bd <= 60, n + ' ' + id + ' mouth distance ' + bd);
      assert.ok((best.x - m.x) * nrm[0] + (best.y - m.y) * nrm[1] > 0, n + ' ' + id + ' belt is behind the mouth');
      assert.ok(circ(best.s, b.s, l.perimeter) <= 2, n + ' ' + id + ' s ' + b.s + ' vs sampled ' + best.s);
      assert.ok(b.s >= 0 && b.s < l.perimeter);
    }
  }
});

test('s is strictly increasing in drawing order, and monotone within each run', () => {
  for (const n of NAMES) {
    const l = layouts[n];
    for (let i = 1; i < l.order.length; i++) assert.ok(l.slots[l.order[i]].s > l.slots[l.order[i - 1]].s, n + ' order ' + l.order[i]);
    const runs = n === 'ring-2col' ? ['L', 'R'] : ['T', 'B'];
    const count = n === 'ring-2col' ? 7 : 5;
    for (const r of runs) {
      let dir = 0;
      for (let i = 2; i <= count; i++) {
        const d = Math.sign(l.slots[r + i].s - l.slots[r + (i - 1)].s);
        assert.notEqual(d, 0);
        if (dir) assert.equal(d, dir, n + ' run ' + r); else dir = d;
      }
    }
  }
  // clockwise: right lane goes down, left lane goes up, top lane goes right, bottom lane goes left
  const ring = layouts['ring-2col'], counter = layouts.counter;
  assert.ok(ring.slots.R2.s > ring.slots.R1.s && ring.slots.L2.s < ring.slots.L1.s);
  assert.ok(counter.slots.T2.s > counter.slots.T1.s && counter.slots.B2.s < counter.slots.B1.s);
});

test('pointAt: points lie on the path, are arc-length parametrised, tangent angle is correct', () => {
  for (const n of NAMES) {
    const l = layouts[n], L = l.perimeter;
    let prev = layouts.pointAt(l, 0);
    for (let s = 0.5; s <= L + 0.5; s += 0.5) {
      const p = layouts.pointAt(l, s);
      assert.ok(layouts.project(l, p.x, p.y).d < 1e-6, n + ' off path at ' + s);
      const step = Math.hypot(p.x - prev.x, p.y - prev.y);
      assert.ok(step <= 0.5 + 1e-9 && step > 0.49, n + ' step ' + step + ' at ' + s);
      const tangent = Math.atan2(p.y - prev.y, p.x - prev.x);
      const diff = Math.abs(Math.atan2(Math.sin(tangent - p.angle), Math.cos(tangent - p.angle)));
      assert.ok(diff < 0.02, n + ' angle at ' + s + ': ' + p.angle + ' vs ' + tangent);
      prev = p;
    }
    // wraps around
    const a = layouts.pointAt(l, 3), b = layouts.pointAt(l, 3 + L), c = layouts.pointAt(l, 3 - L);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6 && Math.hypot(a.x - c.x, a.y - c.y) < 1e-6);
  }
});

test('pointAt: known points of the ring (clockwise, top lane first)', () => {
  const l = layouts['ring-2col'];
  const p0 = layouts.pointAt(l, 0);
  assert.deepEqual([p0.x, p0.y, p0.angle], [52, 28, 0]);
  const top = layouts.pointAt(l, 100);
  assert.deepEqual([top.x, top.y, top.angle], [152, 28, 0]);
  const right = layouts.pointAt(l, l.slots.R3.s);
  assert.ok(Math.abs(right.x - 332) < 1e-9 && Math.abs(right.y - (247 + 22)) < 0.01);
  assert.ok(Math.abs(right.angle - Math.PI / 2) < 1e-9);          // right lane runs down the screen
  const left = layouts.pointAt(l, l.slots.L3.s);
  assert.ok(Math.abs(left.x - 28) < 1e-9 && Math.abs(left.angle + Math.PI / 2) < 1e-9);   // left lane runs up
});

test('mouths(): cw gives s, ccw gives perimeter - s, box = index in the id list', () => {
  const l = layouts['ring-2col'], ids = ['R2', 'L1', 'R7'];
  const cw = layouts.mouths(l, ids, 'cw'), ccw = layouts.mouths(l, ids, 'ccw');
  assert.equal(cw.length, 3);
  ids.forEach((id, i) => {
    assert.deepEqual(cw[i], { box: i, s: l.slots[id].s });
    assert.deepEqual(ccw[i], { box: i, s: l.perimeter - l.slots[id].s });
    assert.ok(ccw[i].s > 0 && ccw[i].s < l.perimeter);
  });
  assert.throws(() => layouts.mouths(l, ['X9'], 'cw'), /unknown box id/);
  // in ccw the first mouth reached after R2 (cw s=462.7) going the other way is the one with the next smaller cw s
  const c = layouts.counter;
  const m = layouts.mouths(c, c.order, 'ccw');
  for (let i = 1; i < m.length; i++) assert.ok(m[i].s < m[i - 1].s);
});

test('neighbours are symmetric, in-layout, same row/column adjacent', () => {
  for (const n of NAMES) {
    const l = layouts[n];
    for (const id in l.slots) assert.ok(l.neighbours[id], n + ' ' + id);
    for (const id in l.neighbours) {
      assert.ok(l.slots[id]);
      for (const o of l.neighbours[id]) {
        assert.ok(l.slots[o], o);
        assert.ok(l.neighbours[o].includes(id), id + ' <-> ' + o);
      }
    }
  }
  const ring = layouts['ring-2col'], counter = layouts.counter;
  assert.deepEqual(ring.neighbours.L1, ['L2']);
  assert.deepEqual(ring.neighbours.R4, ['R3', 'R5']);
  assert.deepEqual(counter.neighbours.T1, ['T2']);
  assert.deepEqual(counter.neighbours.B3, ['B2', 'B4']);
  assert.deepEqual(counter.neighbours.I1, ['I2']);
  assert.deepEqual(counter.neighbours.I2, ['I1']);
});

test('project(): perpendicular feet and corner arcs', () => {
  const l = layouts['ring-2col'];
  const p = layouts.project(l, 100, 0);
  assert.ok(Math.abs(p.x - 100) < 1e-9 && Math.abs(p.y - 28) < 1e-9 && Math.abs(p.s - 48) < 1e-9 && Math.abs(p.d - 28) < 1e-9);
  const corner = layouts.project(l, 0, 0);       // outside the top-left corner: lands on the arc (centre 52,52), radius 24
  assert.ok(Math.abs(Math.hypot(corner.x - 52, corner.y - 52) - 24) < 1e-9);
  assert.ok(Math.abs(corner.x - corner.y) < 1e-9 && corner.s > l.perimeter - 40);
});

test('helpers.level(): builds a level from a terse spec', () => {
  const lv = helpers.level({ N: 5, boxes: { L1: [0, 1, 'h:2', 1], R2: { pieces: [3, ['p', 2, 3]], mods: { lock: 'A' } }, R3: [] } });
  assert.deepEqual(lv, {
    id: 1, tier: 'easy', seed: 1, layout: 'ring-2col', dir: 'cw', N: 5, kinds: 4,
    boxes: [
      { id: 'L1', pieces: [0, 1, 'h:2', 1] },
      { id: 'R2', pieces: [3, ['p', 2, 3]], mods: { lock: 'A' } },
      { id: 'R3', pieces: [] }
    ]
  });
  const k = helpers.level({ layout: 'counter', dir: 'ccw', boxes: { T1: ['k:A:6', 'hk:B:7'] }, kinds: 9 });
  assert.equal(k.kinds, 9);
  assert.equal(k.dir, 'ccw');
  assert.equal(helpers.level({ boxes: { L1: ['k:A:6', 'hk:B:7'] } }).kinds, 8);
  assert.throws(() => helpers.level({ boxes: { Z1: [] } }), /no slot Z1/);
  assert.throws(() => helpers.level({ layout: 'nope', boxes: {} }), /unknown layout/);
});
