// src/sim.js: the whole game rule set, pure. No DOM, no canvas, no Math.random, no timers: create() a state from
// a level definition and step() it with a time slice and the x the player steers toward. Everything the renderer
// and the UI need is on the state; what happened during a step is appended to state.events (the caller drains it).
//
// The road runs along z (the waddle advances at SPEED), x is sideways in [-1, 1]. Every entity on the road has a
// centre x and a half-width w; the waddle has half-width WADDLE_HALF. "Overlap" below is the sideways overlap of
// the two, and it decides what the waddle shoots at and what it runs into.
(function (root) {
  'use strict';
  var PM = root.PM = root.PM || {};
  var C = PM.config || (typeof require === 'function' ? require('./config.js') : null);

  var H = C.WADDLE_HALF;

  function overlap(state, e) {
    return Math.max(0, Math.min(e.x + e.w, state.x + H) - Math.max(e.x - e.w, state.x - H));
  }

  /** Effective number of shooters: capped, doubled by the big penguin. */
  function shooters(state) {
    return Math.min(state.n, C.SHOOT_CAP) * (state.big ? C.ALLY_BIG_MULT : 1);
  }
  function dps(state) { return shooters(state) * state.rate * state.dmg; }
  function shotsPerSecond(state) { return shooters(state) * state.rate; }

  function packCount(e) { return Math.max(0, Math.ceil(e.hp / C.SEAL_HP - 1e-9)); }

  function gateText(g) { return (g.op === 'x' ? '×' : g.op === '/' ? '÷' : g.op) + g.val; }
  function gateGood(g) { return g.op === '+' || g.op === 'x'; }
  function applyGate(n, g) {
    if (g.op === '+') return n + g.val;
    if (g.op === '-') return n - g.val;
    if (g.op === 'x') return n * g.val;
    return Math.floor(n / g.val);
  }

  function emit(state, type, e, text, good) {
    state.events.push({ type: type, z: e.z, x: e.x, text: text, good: !!good });
  }

  /**
   * create(def, upgrades) -> state. def is a decoded level (see levels.js): { n, tag, length, bossHp, riot, entities }.
   * upgrades: { size, rate, dmg } shop levels 0..MAX_SHOP. The def is not modified; entities are copied.
   */
  function create(def, upgrades) {
    var u = upgrades || {};
    var size = Math.min(C.MAX_SHOP, Math.max(0, u.size | 0));
    var state = {
      levelNo: def.n, tag: def.tag, riot: !!def.riot, length: def.length,
      phase: 'RUN', t: 0,
      n: C.START_SIZE[size], peak: C.START_SIZE[size], lost: 0,
      x: 0, z: 0,
      rate: C.BASE_RATE * (1 + C.RATE_STEP * Math.min(C.MAX_SHOP, Math.max(0, u.rate | 0))),
      dmg: C.BASE_DMG * (1 + C.DMG_STEP * Math.min(C.MAX_SHOP, Math.max(0, u.dmg | 0))),
      big: false,
      entities: def.entities.map(function (e, i) {
        var c = {}; for (var k in e) c[k] = e[k];
        c.id = i; c.hp0 = e.hp; c.alive = true;
        if (e.type === 'gate') { c.val0 = e.val; c.hits = 0; }
        return c;
      }),
      boss: { hp: def.bossHp, hp0: def.bossHp, z: def.length, eating: false, hitClock: 0 },
      eatAcc: 0,
      coins: 0, stars: 0,
      events: []
    };
    state.entities.sort(function (a, b) { return a.z - b.z || a.x - b.x; });
    return state;
  }

  function setN(state, n) {
    state.n = Math.max(0, Math.floor(n));
    if (state.n > state.peak) state.peak = state.n;
    if (state.n <= 0 && state.phase !== 'WON') state.phase = 'LOST';
  }

  /** A gate that can still be raised by snowballs: a + gate below its cap. Everything else lets snowballs through. */
  function bumpable(e) {
    return e.type === 'gate' && e.op === '+' && e.val - e.val0 < Math.floor(e.val0 * C.GATE_BUMP_MAX);
  }

  /** What the waddle shoots at: the nearest thing ahead within RANGE that overlaps it sideways and can take a
   *  snowball (a gate only while it can still be raised; fish never). Gate pairs count as one row. */
  function target(state) {
    var best = null, bestOv = 0;
    for (var i = 0; i < state.entities.length; i++) {
      var e = state.entities[i];
      if (!e.alive || e.type === 'fish' || (e.type === 'gate' && !bumpable(e))) continue;
      if (e.z <= state.z || e.z - state.z > C.RANGE) { if (e.z - state.z > C.RANGE) break; continue; }
      if (best && e.z > best.z) break;                   // entities are z-sorted: past the nearest row
      var ov = overlap(state, e);
      if (ov > bestOv) { best = e; bestOv = ov; }
    }
    return best;
  }

  function shoot(state, dt) {
    var e = target(state);
    if (!e) return;
    if (e.type === 'gate') {
      var cap = Math.floor(e.val0 * C.GATE_BUMP_MAX);
      e.hits += shotsPerSecond(state) * dt;
      while (e.hits >= C.GATE_BUMP_HITS && e.val - e.val0 < cap) {
        e.hits -= C.GATE_BUMP_HITS; e.val += 1;
        emit(state, 'bump', e, gateText(e), true);
      }
      return;
    }
    var before = e.type === 'pack' ? packCount(e) : e.hp;
    e.hp -= dps(state) * dt;
    if (e.type === 'pack') {
      var killed = before - packCount(e);
      if (killed > 0) emit(state, 'kill', e, '-' + killed, true);
    }
    if (e.hp <= 0) {
      e.alive = false;
      if (e.type === 'wall') emit(state, 'break', e, '', true);
      else if (e.type === 'pack') emit(state, 'break', e, '', true);
      else if (e.type === 'ally') {
        if (e.gift === 'big') { state.big = true; emit(state, 'ally', e, 'BIG!', true); }
        else { setN(state, state.n + e.gift); emit(state, 'ally', e, '+' + e.gift, true); }
      }
    }
  }

  /** The waddle reached a row of entities: resolve what it runs into. */
  function arrive(state) {
    var pairDone = {};
    for (var i = 0; i < state.entities.length; i++) {
      var e = state.entities[i];
      if (!e.alive) continue;
      if (e.z > state.z) break;
      if (e.type === 'gate') {
        if (pairDone[e.pair]) { e.alive = false; continue; }
        var other = null;
        for (var j = i + 1; j < state.entities.length; j++) {
          if (state.entities[j].type === 'gate' && state.entities[j].pair === e.pair && state.entities[j].alive) { other = state.entities[j]; break; }
        }
        var pick = e;
        if (other) {
          var a = overlap(state, e), b = overlap(state, other);
          pick = b > a || (b === a && state.x > (e.x + other.x) / 2) ? other : e;
          other.alive = false;
        }
        e.alive = false; pairDone[e.pair] = true;
        var before = state.n;
        setN(state, applyGate(state.n, pick));
        emit(state, 'gate', pick, gateText(pick), state.n >= before);
        if (state.phase === 'LOST') return;
        continue;
      }
      e.alive = false;
      var ov = overlap(state, e);
      if (e.type === 'fish') {
        if (ov > 0) { setN(state, state.n + 1); emit(state, 'pickup', e, '+1', true); }
      } else if (e.type === 'wall' || e.type === 'pack') {
        if (ov > 0) {
          var loss = e.type === 'pack' ? packCount(e) : Math.ceil(e.hp);
          if (loss > 0) { state.lost += Math.min(loss, state.n); setN(state, state.n - loss); emit(state, 'hit', e, '-' + loss, false); }
          if (state.phase === 'LOST') return;
        }
      } else if (e.type === 'ally') {
        emit(state, 'miss', e, '', false);
      }
    }
  }

  function stepBoss(state, dt) {
    var boss = state.boss;
    if (boss.z > state.z + 1.5) boss.z = Math.max(state.z + 1.5, boss.z - C.BOSS_SPEED * dt);
    boss.eating = boss.z <= state.z + 1.5 + 1e-9;
    if (boss.eating) {
      state.eatAcc += C.BOSS_EAT * dt;
      var eat = Math.floor(state.eatAcc);
      if (eat > 0) {
        state.eatAcc -= eat;
        state.lost += Math.min(eat, state.n);
        setN(state, state.n - eat);
        emit(state, 'eat', { z: state.z, x: state.x }, '-' + eat, false);
        if (state.phase === 'LOST') return;
      }
    }
    boss.hp -= dps(state) * dt;
    boss.hitClock += dt;
    if (boss.hitClock >= C.BOSS_HIT_EVERY) { boss.hitClock = 0; emit(state, 'boss', { z: boss.z, x: 0 }, '', true); }
    if (boss.hp <= 0) {
      boss.hp = 0;
      state.phase = 'WON';
      state.coins = C.COIN_BASE + C.COIN_PER_LEVEL * state.levelNo + Math.min(state.n, C.COIN_PENGUIN_CAP) * C.COIN_PER_PENGUIN;
      var share = state.n / Math.max(1, state.peak);
      state.stars = 1 + (share >= C.STAR_THRESHOLDS[0] ? 1 : 0) + (share >= C.STAR_THRESHOLDS[1] ? 1 : 0);
      emit(state, 'win', { z: boss.z, x: 0 }, '', true);
    }
  }

  /** step(state, dt, targetX): advance dt seconds, steering toward targetX (clamped to the road). */
  function step(state, dt, targetX) {
    if (state.phase === 'WON' || state.phase === 'LOST') return state;
    state.t += dt;
    var tx = Math.max(-1 + H, Math.min(1 - H, targetX == null ? state.x : targetX));
    var dx = tx - state.x, maxDx = C.STEER * dt;
    state.x += Math.max(-maxDx, Math.min(maxDx, dx));

    if (state.phase === 'RUN') {
      state.z += C.SPEED * dt;
      for (var i = 0; i < state.entities.length; i++) {
        var e = state.entities[i];
        if (e.alive && e.type === 'pack') e.z -= C.PACK_SPEED * dt;
      }
      // a pack that walked past the waddle must stay sorted for target()/arrive(): cheap re-sort, few entities
      state.entities.sort(function (a, b) { return a.z - b.z || a.x - b.x; });
      shoot(state, dt);
      arrive(state);
      if (state.phase === 'LOST') return state;
      if (state.z >= state.length - C.BOSS_DIST) {
        state.phase = 'BOSS';
        for (var j = 0; j < state.entities.length; j++) state.entities[j].alive = false;   // nothing between you and the boss
        emit(state, 'bossStart', { z: state.boss.z, x: 0 }, '', true);
      }
    } else if (state.phase === 'BOSS') {
      stepBoss(state, dt);
    }
    return state;
  }

  /** Run the state to its end with a policy(state) -> targetX, in fixed slices. Returns the state. */
  function run(state, policy, dt, maxSeconds) {
    dt = dt || 1 / 60; maxSeconds = maxSeconds || 600;
    while (state.phase !== 'WON' && state.phase !== 'LOST' && state.t < maxSeconds) {
      step(state, dt, policy(state));
      state.events.length = 0;
    }
    return state;
  }

  PM.sim = { create: create, step: step, run: run, overlap: overlap, dps: dps, shooters: shooters, shotsPerSecond: shotsPerSecond, packCount: packCount,
    gateText: gateText, gateGood: gateGood, applyGate: applyGate, target: target, bumpable: bumpable };
  if (typeof module !== 'undefined' && module.exports) module.exports = PM.sim;
})(typeof window !== 'undefined' ? window : globalThis);
