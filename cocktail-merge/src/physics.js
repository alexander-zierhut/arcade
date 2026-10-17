// src/physics.js: bodies, integration, PBD position solve, final wall clamp, velocity from
// positions, restitution, tangential damping and the new-contact impact filter (DESIGN 2.3, 2.4).
// Revision 4: growth overlap is removed kinematically (step 1b), so merges never fling neighbours.
// PURE: no DOM, no clocks, no randomness; iterates arrays in ascending id order only.
(function (root, factory) {
  'use strict';
  var isNode = typeof module === 'object' && module && module.exports;
  var deps = isNode
    ? { config: require('./config.js') }
    : { config: root.CM.config };
  var api = factory(deps);
  if (isNode) module.exports = api;
  else { root.CM = root.CM || {}; root.CM.physics = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';
  /* @pure-begin */
  var config = deps.config;
  var PHYS = config.PHYS, TABLE = config.TABLE, RULES = config.RULES;
  var MAX_ID = PHYS.MAX_ID;                 // 2^20: ids are integers below this
  var DEFAULT_GROW_TICKS = RULES.GROW_TICKS;

  // Walls k: 0 left (x = 0), 1 right (x = W), 2 far (y = 0), 3 near (y = L).
  // Outward normals point out of the table, into the wall.
  var WALL_NX = [-1, 1, 0, 0];
  var WALL_NY = [0, 0, -1, 1];

  // Resolve a constant from a game's rules object. createGame builds a flat object
  // (TABLE + PHYS + RULES + mode + overrides, 2.13); a nested {PHYS, TABLE, RULES} shape
  // is accepted too, and anything missing falls back to the config default.
  function opt(rules, key, def) {
    if (rules) {
      var v = rules[key];
      if (typeof v === 'number') return v;
      if (rules.PHYS && typeof rules.PHYS[key] === 'number') return rules.PHYS[key];
      if (rules.TABLE && typeof rules.TABLE[key] === 'number') return rules.TABLE[key];
      if (rules.RULES && typeof rules.RULES[key] === 'number') return rules.RULES[key];
    }
    return def;
  }

  function massOf(r) { var k = r / 6; return k * k; }

  function easeOutCubic(t) { var u = 1 - t; return 1 - u * u * u; }

  function pairKey(i, j) {
    return i < j ? i * MAX_ID + j : j * MAX_ID + i;
  }

  // makeBody(id, tier, x, y, vx, vy, r, r0?): without r0 the body starts at r (fully grown);
  // with r0 it grows from r0 to r over GROW_TICKS (2.6).
  function makeBody(id, tier, x, y, vx, vy, r, r0) {
    if (typeof id !== 'number' || id !== Math.floor(id) || id < 0 || id >= MAX_ID) {
      throw new Error('physics.makeBody: id must be an integer in [0, ' + MAX_ID + '), got ' + id);
    }
    var growing = typeof r0 === 'number';
    var rNow = growing ? r0 : r;
    return {
      id: id, tier: tier,
      x: x, y: y, px: x, py: y, vx: vx || 0, vy: vy || 0,
      r: rNow, r0: rNow, rTarget: r, growTick: growing ? 0 : DEFAULT_GROW_TICKS,
      invM: 1 / massOf(rNow),
      age: 0,
      cleared: false, launched: false,
      bornTick: -1, chainDepth: 0,
      wallSeen: [-1e9, -1e9, -1e9, -1e9]
    };
  }

  function newContact() { return { a: null, b: null, wall: -1, nx: 0, ny: 0, vnPre: 0 }; }

  function createWorld(rules) {
    var size = opt(rules, 'CONTACT_POOL', PHYS.CONTACT_POOL);
    var pool = new Array(size);
    for (var i = 0; i < size; i++) pool[i] = newContact();
    return { seen: new Map(), pool: pool, nContacts: 0, poolGrowths: 0 };
  }

  // Next free pooled record; grows the pool by one (and counts it) only when full.
  function takeContact(world) {
    if (world.nContacts >= world.pool.length) {
      world.pool.push(newContact());
      world.poolGrowths += 1;
    }
    var c = world.pool[world.nContacts];
    world.nContacts += 1;
    return c;
  }

  // Kinematic overlap removal for growth ticks: up to GROW_ITER Gauss-Seidel sweeps over walls and pairs,
  // full (uncapped) mass-weighted correction, no contacts recorded, velocities untouched.
  function relaxGrowth(bodies, n, ITER, W, L) {
    var it, i, j, a, b, dx, dy, d2, d, rr, nx, ny, corr, wa, wb, invSum, moved;
    for (it = 0; it < ITER; it++) {
      moved = false;
      for (i = 0; i < n; i++) {
        a = bodies[i];
        if (a.x < a.r) a.x = a.r; else if (a.x > W - a.r) a.x = W - a.r;
        if (a.y < a.r) a.y = a.r; else if (a.y > L - a.r) a.y = L - a.r;
        for (j = i + 1; j < n; j++) {
          b = bodies[j];
          dx = b.x - a.x; dy = b.y - a.y; rr = a.r + b.r;
          d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          d = Math.sqrt(d2);
          if (d > 1e-9) { nx = dx / d; ny = dy / d; } else { nx = 1; ny = 0; }
          corr = rr - d;
          if (corr < 1e-3) continue;                        // 0.001 u: converged enough
          moved = true;
          invSum = a.invM + b.invM;
          wa = a.invM / invSum; wb = b.invM / invSum;
          a.x -= nx * corr * wa; a.y -= ny * corr * wa;
          b.x += nx * corr * wb; b.y += ny * corr * wb;
        }
      }
      if (!moved) break;
    }
    for (i = 0; i < n; i++) {                               // the last sweep may have pushed into a wall
      a = bodies[i];
      if (a.x < a.r) a.x = a.r; else if (a.x > W - a.r) a.x = W - a.r;
      if (a.y < a.r) a.y = a.r; else if (a.y > L - a.r) a.y = L - a.r;
    }
  }

  function stepWorld(world, bodies, tick, events, rules) {
    var DT = opt(rules, 'DT', PHYS.DT);
    var ITER = opt(rules, 'ITER', PHYS.ITER);
    var GROW_ITER = opt(rules, 'GROW_ITER', PHYS.GROW_ITER);
    var PULL = opt(rules, 'PULL', PHYS.PULL);
    var DRAG_F = Math.exp(-opt(rules, 'DRAG', PHYS.DRAG) * DT);
    var FRIC_DV = opt(rules, 'FRICTION', PHYS.FRICTION) * DT;
    var VMAX = opt(rules, 'VMAX', PHYS.VMAX);
    var E_GLASS = opt(rules, 'E_GLASS', PHYS.E_GLASS);
    var E_WALL = opt(rules, 'E_WALL', PHYS.E_WALL);
    var REST_V = opt(rules, 'REST_V', PHYS.REST_V);
    var TAN_DAMP = opt(rules, 'TAN_DAMP', PHYS.TAN_DAMP);
    var MAX_CORR = opt(rules, 'MAX_CORR', PHYS.MAX_CORR);
    var IMPACT_V = opt(rules, 'IMPACT_V', PHYS.IMPACT_V);
    var NEW_TICKS = opt(rules, 'IMPACT_NEW_TICKS', PHYS.IMPACT_NEW_TICKS);
    var GROW_TICKS = opt(rules, 'GROW_TICKS', RULES.GROW_TICKS);
    var W = opt(rules, 'W', TABLE.W);
    var L = opt(rules, 'L', TABLE.L);
    var n = bodies.length;
    var i, j, k, a, b, c, sp, ns, dx, dy, d, d2, rr, nx, ny, pen, corr, wa, wb, invSum;

    // 1. age and growth (ascending id)
    var grew = false;
    for (i = 0; i < n; i++) {
      b = bodies[i];
      b.age += 1;
      if (b.growTick < GROW_TICKS) {
        b.growTick += 1;
        if (b.growTick === GROW_TICKS) {
          b.r = b.rTarget;                                  // exact, no float residue
        } else {
          b.r = b.r0 + (b.rTarget - b.r0) * easeOutCubic(b.growTick / GROW_TICKS);
        }
        b.invM = 1 / massOf(b.r);
        grew = true;
      }
    }

    // 1b. growth relaxation (kinematic): only in ticks where a radius changed. The overlap the
    // growth created is removed by moving positions BEFORE px/py are taken, so it never turns
    // into velocity (a merge must not fling its neighbours; the deliberate push is the shove).
    if (grew) relaxGrowth(bodies, n, GROW_ITER, W, L);

    // 1c. integrate (ascending id)
    for (i = 0; i < n; i++) {
      b = bodies[i];
      b.vy -= PULL * DT;
      b.vx *= DRAG_F; b.vy *= DRAG_F;
      sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (sp > 0) {
        ns = sp - FRIC_DV; if (ns < 0) ns = 0;
        b.vx *= ns / sp; b.vy *= ns / sp;
        sp = ns;
      }
      if (sp > VMAX) { b.vx *= VMAX / sp; b.vy *= VMAX / sp; }
      b.px = b.x; b.py = b.y;                               // end-of-previous-tick position
      b.x += b.vx * DT; b.y += b.vy * DT;
    }

    // 2. position solve
    world.nContacts = 0;
    for (var it = 0; it < ITER; it++) {
      for (i = 0; i < n; i++) {
        a = bodies[i];
        // walls: hard, uncapped
        for (k = 0; k < 4; k++) {
          if (k === 0) pen = a.r - a.x;
          else if (k === 1) pen = a.x + a.r - W;
          else if (k === 2) pen = a.r - a.y;
          else pen = a.y + a.r - L;
          if (pen > 0) {
            a.x -= WALL_NX[k] * pen; a.y -= WALL_NY[k] * pen;
            if (it === 0) {
              c = takeContact(world);
              c.a = a; c.b = null; c.wall = k; c.nx = WALL_NX[k]; c.ny = WALL_NY[k];
              c.vnPre = a.vx * WALL_NX[k] + a.vy * WALL_NY[k];
            }
          }
        }
        for (j = i + 1; j < n; j++) {
          b = bodies[j];
          dx = b.x - a.x; dy = b.y - a.y; rr = a.r + b.r;
          d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          d = Math.sqrt(d2);
          if (d > 1e-9) { nx = dx / d; ny = dy / d; } else { nx = 1; ny = 0; }   // coincident-centre guard
          pen = rr - d;
          if (it === 0) {
            c = takeContact(world);
            c.a = a; c.b = b; c.wall = -1; c.nx = nx; c.ny = ny;
            c.vnPre = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          }
          corr = pen < MAX_CORR ? pen : MAX_CORR;
          invSum = a.invM + b.invM;
          wa = a.invM / invSum; wb = b.invM / invSum;
          a.x -= nx * corr * wa; a.y -= ny * corr * wa;
          b.x += nx * corr * wb; b.y += ny * corr * wb;
        }
      }
    }

    // 2b. final wall clamp (uncapped), every body, before velocity derivation
    for (i = 0; i < n; i++) {
      b = bodies[i];
      if (b.x < b.r) b.x = b.r; else if (b.x > W - b.r) b.x = W - b.r;
      if (b.y < b.r) b.y = b.r; else if (b.y > L - b.r) b.y = L - b.r;
    }

    // 3. velocity from positions, VMAX clamp
    for (i = 0; i < n; i++) {
      b = bodies[i];
      b.vx = (b.x - b.px) / DT; b.vy = (b.y - b.py) / DT;
      sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (sp > VMAX) { b.vx *= VMAX / sp; b.vy *= VMAX / sp; }
    }

    // 4. restitution, tangential damping, impact events (record order)
    var nc = world.nContacts, seen = world.seen;
    for (var ci = 0; ci < nc; ci++) {
      c = world.pool[ci];
      a = c.a; b = c.b; nx = c.nx; ny = c.ny;
      // 2.4 step 4 writes `if (c.wall)`, which is falsy for the left wall (k = 0); a wall
      // contact is the one with no second body.
      var isWall = b === null, vn, vApp, E, target, jn, key = 0, last;
      if (isWall) {
        vn = -(a.vx * nx + a.vy * ny); vApp = c.vnPre; E = E_WALL; invSum = a.invM;
      } else {
        vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; vApp = -c.vnPre; E = E_GLASS; invSum = a.invM + b.invM;
      }
      target = vApp > REST_V ? E * vApp : 0;
      if (vn < target) {
        jn = (target - vn) / invSum;
        if (isWall) {
          // separating normal is -n_out
          a.vx -= nx * jn * a.invM; a.vy -= ny * jn * a.invM;
        } else {
          a.vx -= nx * jn * a.invM; a.vy -= ny * jn * a.invM;
          b.vx += nx * jn * b.invM; b.vy += ny * jn * b.invM;
        }
      }
      if (!isWall) {
        var tx = -ny, ty = nx;
        var vt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
        var jt = -vt * TAN_DAMP / invSum;
        a.vx -= tx * jt * a.invM; a.vy -= ty * jt * a.invM;
        b.vx += tx * jt * b.invM; b.vy += ty * jt * b.invM;
      }
      if (isWall) {
        last = a.wallSeen[c.wall];
      } else {
        key = pairKey(a.id, b.id);
        last = seen.get(key);
        if (last === undefined) last = -1e9;
      }
      if (!(last >= tick - NEW_TICKS) && vApp > IMPACT_V) {
        var cx, cy;
        if (isWall) {
          cx = c.wall === 0 ? 0 : (c.wall === 1 ? W : a.x);
          cy = c.wall === 2 ? 0 : (c.wall === 3 ? L : a.y);
        } else {
          cx = a.x + nx * a.r; cy = a.y + ny * a.r;
        }
        events.push({
          type: 'impact', a: a.id, b: isWall ? null : b.id, wall: c.wall,
          x: cx, y: cy, vn: vApp, tierA: a.tier, tierB: isWall ? 0 : b.tier,
          growing: a.growTick < GROW_TICKS || (!isWall && b.growTick < GROW_TICKS)
        });
      }
      if (isWall) a.wallSeen[c.wall] = tick; else seen.set(key, tick);
    }

    if (tick % 240 === 0) {
      var cutoff = tick - NEW_TICKS;
      seen.forEach(function (t, kk) { if (t < cutoff) seen.delete(kk); });
    }
  }

  /* @pure-end */
  return {
    makeBody: makeBody,
    massOf: massOf,
    createWorld: createWorld,
    stepWorld: stepWorld,
    pairKey: pairKey,
    easeOutCubic: easeOutCubic
  };
});
