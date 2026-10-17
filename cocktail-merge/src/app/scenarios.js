// src/app/scenarios.js: test scenarios for the owner (not reachable by normal play). Add ?scenario=<name> to the
// URL and every new game starts in that state. Browser-only; sets CM.app.scenario(g).
//   jugs    two Sangria Verde jugs at the far end with a small gap: slide a glass into one and they burst (-> bomb)
//   fiesta  the two jugs already touch: they burst on the first tick, so the bomb is ready at once
//   bomb    two bomb charges and a full table of mixed glasses to blast
//   full    a crowded table with no bombs (danger-line and merge testing)
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var app = CM.app = CM.app || {};

  function name() {
    try { var m = /[?&]scenario=([a-z]+)/i.exec(root.location.search || ''); return m ? m[1].toLowerCase() : ''; }
    catch (e) { return ''; }
  }
  function add(g, tier, x, y) {
    return CM.game.debugAddBody(g, tier, x, y, 0, 0, { age: 24, cleared: true });
  }
  // Settled-looking rows against the far wall, big tiers at the back. Neighbours alternate between the row's tier
  // and the one below it, so nothing merges by itself when the rows settle (same tiers never touch).
  function fillTable(g, rows) {
    var R = g.rules.RADII, y = 0, i, j, tier, alt, x, r, ra, t;
    for (i = 0; i < rows.length; i++) {
      tier = rows[i]; alt = Math.max(1, tier - 1); r = R[tier]; ra = R[alt]; y += r;
      for (x = r + 1, j = 0; x + r <= g.rules.W - 1; j++) {
        t = (j % 2 === 0) ? tier : alt;
        add(g, t, x, y + (r - R[t]));                   // same far edge for both sizes
        x += R[t] + R[(j % 2 === 0) ? alt : tier] + 1.2;
      }
      y += r + 0.8;
    }
  }
  function apply(g) {
    var n = name();
    if (!g || !n || !CM.game || !CM.game.debugAddBody) return false;
    var R = g.rules.RADII, r9 = R[9];
    switch (n) {
      case 'jugs':
        g.wonOnce = true;                                 // the win was already taken: touching jugs burst (2.10)
        add(g, 9, 30, r9 + 0.5); add(g, 9, 30 + 2 * r9 + 6, r9 + 0.5);   // 6 u apart: one nudge closes the gap
        add(g, 3, 12, 62); add(g, 2, 88, 62);                            // a few small glasses, clear of the jugs
        break;
      case 'fiesta':
        g.wonOnce = true;
        add(g, 9, 30, r9 + 0.5); add(g, 9, 30 + 2 * r9 - 0.1, r9 + 0.5);
        fillTable(g, [4, 2]);
        break;
      case 'bomb':
        g.bombs = 2;
        fillTable(g, [6, 4, 2, 6]);                       // rows step by two tiers: no same tier touches vertically
        break;
      case 'full':
        fillTable(g, [6, 4, 2, 6, 4, 2, 4]);
        break;
      default: return false;
    }
    g.highestTier = Math.max(g.highestTier, 6);         // the strip and spawns behave like a mid-game
    g.runMask |= 0x3F;
    if (root.console && root.console.info) root.console.info('[CM] scenario "' + n + '" applied');
    return true;
  }
  app.scenario = apply;
  app.scenarioName = name;
})(typeof globalThis !== 'undefined' ? globalThis : this);
