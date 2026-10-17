// src/bot.js: players made of code. greedy(state) steers like a decent human: through the better gate, into
// fish and allies, away from walls and packs it cannot shoot down in time. It is the solver the tests use to prove
// every level can be won, and the preview script uses it to play through levels for screenshots. random(seed)
// picks gates at random and otherwise drifts: the tests use it to show the choices matter. Pure.
(function (root) {
  'use strict';
  var PM = root.PM = root.PM || {};
  var C = PM.config || (typeof require === 'function' ? require('./config.js') : null);
  var S = PM.sim || (typeof require === 'function' ? require('./sim.js') : null);

  var LANES = [-0.5, 0, 0.5];
  var LOOK = 55;             // how far ahead the bot thinks (z units)
  var GATE_COMMIT = 30;      // a gate only pulls the bot into its lane from this close (5 s); before that it dodges

  function overlapAt(x, e) {
    return Math.max(0, Math.min(e.x + e.w, x + C.WADDLE_HALF) - Math.max(e.x - e.w, x - C.WADDLE_HALF));
  }

  /** Damage the waddle can deal to a static thing (or a pack) at distance d before touching it. */
  function damageBefore(state, d, pack) {
    var rel = C.SPEED + (pack ? C.PACK_SPEED : 0);
    var secs = Math.min(d, C.RANGE) / rel;
    return S.dps(state) * secs;
  }

  /** scoreLane(state, x): how good lane x looks up to and including the next gate pair. What lies beyond the next
   *  gate is decided after passing it (the waddle changes lanes in a third of a second), so a thick wall far
   *  ahead never scares the bot out of a good gate now. */
  function scoreLane(state, x) {
    var score = 0, n = state.n, gateZ = null;
    for (var i = 0; i < state.entities.length; i++) {
      var e = state.entities[i];
      if (!e.alive || e.z <= state.z) continue;
      var d = e.z - state.z;
      if (d > LOOK) break;
      if (gateZ != null && e.z > gateZ) break;
      if (e.type === 'gate') {
        gateZ = e.z;
        var mine = e.x < 0 ? x <= 0 : x > 0;              // the side the sim would resolve for a waddle at x
        if (!mine) continue;
        var after = S.applyGate(n, e), gain = after - n;
        var pull = 5 * Math.max(0, 1 - d / GATE_COMMIT);    // the nearer the gate, the more it matters; far gates not at all
        score += gain * pull;
        if (after <= 0) score -= 1000 * pull;
        n = Math.max(1, after);
        continue;
      }
      var ov = overlapAt(x, e);
      if (ov <= 0) continue;
      if (e.type === 'fish') score += 1.5;
      else if (e.type === 'ally') {
        if (damageBefore(state, d, false) >= e.hp) score += e.gift === 'big' ? 12 : e.gift;
      } else if (e.type === 'wall' || e.type === 'pack') {
        var left = e.hp - damageBefore(state, d, e.type === 'pack');
        if (left > 0) {
          var loss = e.type === 'pack' ? Math.ceil(left / C.SEAL_HP) : Math.ceil(left);
          score -= loss * (loss >= n ? 20 : 3);
        }
      }
    }
    return score;
  }

  /** greedy(state) -> target x. */
  function greedy(state) {
    if (state.phase !== 'RUN') return state.x;
    var best = state.x, bestScore = -Infinity;
    for (var i = 0; i < LANES.length; i++) {
      var s = scoreLane(state, LANES[i]);
      if (Math.abs(LANES[i] - state.x) < 0.05) s += 0.01;   // stay put on a tie
      if (s > bestScore) { bestScore = s; best = LANES[i]; }
    }
    return best;
  }

  /** random(seed) -> policy that picks a random lane at every gate and otherwise keeps its lane. */
  function random(seed) {
    var rnd = C.rng(seed || 1), lane = 0, lastPair = -1;
    return function (state) {
      if (state.phase !== 'RUN') return state.x;
      for (var i = 0; i < state.entities.length; i++) {
        var e = state.entities[i];
        if (!e.alive || e.z <= state.z) continue;
        if (e.z - state.z > 30) break;
        if (e.type === 'gate' && e.pair !== lastPair) { lastPair = e.pair; lane = rnd() < 0.5 ? -0.5 : 0.5; }
        break;
      }
      return lane;
    };
  }

  /** The shop choice a player who buys whenever they can would make: cheapest next level, size before rate before dmg. */
  function buyWhatYouCan(coins, upgrades) {
    var u = { size: upgrades.size | 0, rate: upgrades.rate | 0, dmg: upgrades.dmg | 0 }, spent = 0, bought = true;
    while (bought) {
      bought = false;
      var order = ['size', 'rate', 'dmg'].filter(function (k) { return u[k] < C.MAX_SHOP; })
        .sort(function (a, b) { return u[a] - u[b]; });
      for (var i = 0; i < order.length; i++) {
        var price = C.PRICES[u[order[i]]];
        if (coins - spent >= price) { spent += price; u[order[i]]++; bought = true; break; }
      }
    }
    return { upgrades: u, spent: spent };
  }

  PM.bot = { greedy: greedy, random: random, buyWhatYouCan: buyWhatYouCan, scoreLane: scoreLane };
  if (typeof module !== 'undefined' && module.exports) module.exports = PM.bot;
})(typeof window !== 'undefined' ? window : globalThis);
