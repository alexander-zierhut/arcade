// src/game/game.js: the rules engine, v2 (DESIGN 2.2 action pipeline, 2.3 tick, 1.10 undo). Pure. Every action returns
// the events the view, HUD, audio and app consume, in the normative order. Status: playing | timeout | won | lost.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var C = SS.config || (typeof require === 'function' ? require('../config.js') : {});
  var B = SS.board || (typeof require === 'function' ? require('./board.js') : null);
  var S = SS.score || (typeof require === 'function' ? require('./score.js') : null);
  var R = SS.rules || (typeof require === 'function' ? require('./rules.js') : null);
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  /** createGame(level, mode, opts?) -> Game. level: { n, tag, par, timeMs, totalMatches, ...board spec } (spec fields: shape, rows, cols, comps|fill, belts). */
  function createGame(level, mode, opts) {
    opts = opts || {};
    var b = B.createBoard(level);
    B.resolveAll(b);
    B.resolve(b, b.matches, false);
    var totalMatches = 0;
    for (var t in b.remaining) totalMatches += Math.floor(b.remaining[t] / 3);
    if (!level.totalMatches) level.totalMatches = totalMatches;
    return {
      level: level, mode: mode, board: b,
      score: num(opts.score, 0), levelScore: 0,
      combo: 0, comboLeftMs: 0, comboMovesLeft: 0, bestCombo: 0,
      moves: 0, matches: b.matches, elapsedMs: 0,
      timeLeftMs: mode === 'timed' ? num(level.timeMs, 0) : 0,
      status: 'playing', reason: null,
      started: mode !== 'timed', frozen: false,
      undo: [], bunnyEarned: false, rescueUsed: false, extended: false, flawless: true, usedUndo: false, usedHint: false,
      stuckHash: null, warned: { space: false, orphan: false }
    };
  }
  function start(g) { g.started = true; }

  // ---------- undo stack ----------
  function pushUndo(g) {
    g.undo.push({ board: B.snapshot(g.board), score: g.score, levelScore: g.levelScore, combo: g.combo, comboLeftMs: g.comboLeftMs,
      comboMovesLeft: g.comboMovesLeft, bunnyEarned: g.bunnyEarned, rescueUsed: g.rescueUsed, warned: { space: g.warned.space, orphan: g.warned.orphan }, stuckHash: g.stuckHash, matches: g.matches });
    if (g.undo.length > (C.UNDO_CAP || 300)) g.undo.shift();
  }
  /** undo(g) -> [undo, unstuck?] or [] (nothing to undo, or the level is over). */
  function undo(g) {
    if (g.status !== 'playing' && g.status !== 'timeout') return [];
    var u = g.undo.pop();
    if (!u) return [];
    var wasStuck = !!g.stuckHash;
    g.board = B.restore(u.board);
    g.score = u.score; g.levelScore = u.levelScore; g.combo = u.combo; g.comboLeftMs = u.comboLeftMs; g.comboMovesLeft = u.comboMovesLeft;
    g.bunnyEarned = u.bunnyEarned; g.rescueUsed = u.rescueUsed; g.warned = u.warned; g.matches = u.matches; g.stuckHash = null;
    g.flawless = false; g.usedUndo = true;
    var events = [{ type: 'undo', score: g.score }];
    if (wasStuck) events.push({ type: 'unstuck' });
    if (g.status === 'timeout') { g.status = 'playing'; }
    return events;
  }

  // ---------- scoring inside the pipeline ----------
  function onMatch(g, ev, events) {
    if (g.mode === 'timed') { g.combo = (g.comboLeftMs > 0 ? g.combo : 0) + 1; g.comboLeftMs = num(C.COMBO_WINDOW_MS, 6000); }
    else { g.combo = (g.comboMovesLeft > 0 ? g.combo : 0) + 1; g.comboMovesLeft = num(C.COMBO_MOVES, 3); }
    if (g.combo > g.bestCombo) g.bestCombo = g.combo;
    var pts = g.mode === 'timed' ? S.matchPoints(g.combo) : 0;
    ev.combo = g.combo; ev.points = pts;
    events.push(ev);
    if (g.combo > 1) events.push({ type: 'combo', combo: g.combo, multiplier: S.multiplier(g.combo) });
    if (pts) { g.score += pts; g.levelScore += pts; events.push({ type: 'score', delta: pts, score: g.score }); }
  }
  function finishWon(g, events) {
    g.status = 'won'; g.reason = 'cleared';
    var leftovers = { bunnies: g.board.bunnies, onBoard: 0, orphans: 0 };
    for (var id in g.board.items) { if (g.board.items[id].type === B.BUNNY) leftovers.onBoard += 1; else leftovers.orphans += 1; }
    var bonus = S.clearBonus(g, leftovers.bunnies + leftovers.onBoard), st = S.stars(g);
    g.score += bonus.total; g.levelScore += bonus.total;
    if (bonus.total) events.push({ type: 'score', delta: bonus.total, score: g.score });
    g.combo = 0; g.comboLeftMs = 0; g.comboMovesLeft = 0;
    var badges = [];
    if (g.mode === 'timed' && g.flawless) badges.push('flawless');
    if (g.mode === 'relaxed' && !g.usedUndo && !g.usedHint && !g.rescueUsed) badges.push('nohelp');
    if (leftovers.bunnies + leftovers.onBoard > 0) badges.push('bunnysaved');
    events.push({ type: 'cleared', bonus: bonus, stars: st, badges: badges, leftovers: leftovers, bunniesCollected: leftovers.bunnies + leftovers.onBoard,
      score: g.score, levelScore: g.levelScore, moves: g.moves, elapsedMs: g.elapsedMs, timeLeftMs: g.timeLeftMs });
  }

  // ---------- the action pipeline (DESIGN 2.2) ----------
  function act(g, action) {
    if (g.status !== 'playing') return [];
    var b = g.board, prevMatches = b.matches, events = [], ev = null, matched = false, nonMatchRemoval = false;
    var kind = action.kind;
    if (kind === 'move') { if (!B.canMove(b, action.item, action.to, action.slot)) return []; }
    else if (kind === 'collect') { var it = action.item ? b.items[action.item] : null; if (action.item && (!it || it.type !== B.BUNNY)) return []; }
    else if (kind === 'spend') { if (b.bunnies < 1 || !B.isOpen(b, action.comp)) return []; }
    else if (kind === 'rescue') { if (g.rescueUsed) return []; }
    else return [];
    pushUndo(g);
    // 1 apply
    if (kind === 'move') {
      ev = B.move(b, action.item, action.to, action.slot);
      if (!ev) { g.undo.pop(); return []; }
      g.moves += 1;
      if (ev[0].type === 'take' && g.mode === 'timed') g.undo = [];          // timed: no undo past a take (the bars stay)
      for (var i = 0; i < ev.length; i++) { if (ev[i].type === 'match') { matched = true; onMatch(g, ev[i], events); } else events.push(ev[i]); }
    } else if (kind === 'collect') {
      ev = B.collect(b, action.item ? { item: action.item } : action.ref);
      if (!ev) { g.undo.pop(); return []; }
      for (var j = 0; j < ev.length; j++) events.push(ev[j]);
    } else if (kind === 'spend') {
      ev = B.spend(b, action.comp);
      if (!ev) { g.undo.pop(); return []; }
      g.moves += 1; g.flawless = false; nonMatchRemoval = true;
      for (var k = 0; k < ev.length; k++) events.push(ev[k]);
    } else if (kind === 'rescue') {
      g.rescueUsed = true; g.flawless = false; b.bunnies += 1;
      events.push({ type: 'bunnyEarned', reason: 'rescue', bunnies: b.bunnies });
    }
    // 3-5 reveal loop, sweep, thresholds
    var res = B.resolve(b, prevMatches, nonMatchRemoval);
    for (var r = 0; r < res.length; r++) {
      var e = res[r];
      if (e.type === 'match') { matched = true; onMatch(g, e, events); }
      else { if (e.type === 'sweep' && !g.warned.orphan) { e.first = true; g.warned.orphan = true; } events.push(e); }
    }
    g.matches = b.matches;
    // 6 relaxed combo window counts moves
    if (!matched && kind === 'move' && g.mode === 'relaxed' && g.comboMovesLeft > 0) {
      g.comboMovesLeft -= 1;
      if (g.comboMovesLeft === 0) { events.push({ type: 'comboEnd', combo: g.combo }); g.combo = 0; }
    }
    // 7 combo-5 bunny
    if (g.combo >= 5 && !g.bunnyEarned) { g.bunnyEarned = true; b.bunnies += 1; events.push({ type: 'bunnyEarned', reason: 'combo5', bunnies: b.bunnies }); }
    // 8 warnSpace
    if (!matched && b.matchable > 0) {
      var q = B.counts(b);
      if (q.F === 1) { events.push({ type: 'warnSpace', first: !g.warned.space, F: 1 }); g.warned.space = true; }
    }
    // 9 win / 10 stuck
    if (b.matchable === 0) finishWon(g, events);
    else {
      var stuck = !B.progressPossible(b), h = stuck ? B.hash(b) : null;
      if (stuck && g.stuckHash !== h) { g.stuckHash = h; events.push({ type: 'stuck', F: B.counts(b).F, rescueAvailable: !g.rescueUsed, bunnies: b.bunnies }); }
      else if (!stuck && g.stuckHash) { g.stuckHash = null; events.push({ type: 'unstuck' }); }
    }
    return events;
  }
  /** moveItem(g, itemId, toComp, toSlot?) -> events (centre move or belt take). Kept from v1. */
  function moveItem(g, itemId, toComp, toSlot) { return act(g, { kind: 'move', item: itemId, to: toComp, slot: toSlot }); }
  /** shiftItem(g, itemId, toSlot) -> [shift] or []: rearranges a product inside its compartment; free (no move, no undo, no combo). */
  function shiftItem(g, itemId, toSlot) { if (g.status !== 'playing') return []; return B.shift(g.board, itemId, toSlot) || []; }
  function collect(g, itemId) { return act(g, { kind: 'collect', item: itemId }); }
  function spend(g, comp) { return act(g, { kind: 'spend', comp: comp }); }
  function rescue(g) { return act(g, { kind: 'rescue' }); }
  /** extend(g) -> [extended] once per level after the first timeout (timed). */
  function extend(g) {
    if (g.mode !== 'timed' || g.status !== 'timeout' || g.extended) return [];
    g.extended = true; g.flawless = false; g.status = 'playing'; g.timeLeftMs = num(C.EXTEND_MS, 30000);
    return [{ type: 'extended', addMs: g.timeLeftMs }];
  }
  /** giveUp(g): second timeout accepted -> status lost (the app banks the Serie). */
  function giveUp(g) { if (g.status === 'timeout') { g.status = 'lost'; g.reason = 'timeout'; } }

  // ---------- tick (DESIGN 2.3) ----------
  function tick(g, dtMs) {
    var events = [];
    if (g.status !== 'playing' || !g.started || g.frozen) return events;
    dtMs = Math.min(100, Math.max(0, num(dtMs, 0)));
    g.elapsedMs += dtMs;
    if (g.mode !== 'timed') return events;
    if (g.comboLeftMs > 0) { g.comboLeftMs -= dtMs; if (g.comboLeftMs <= 0) { g.comboLeftMs = 0; if (g.combo > 0) events.push({ type: 'comboEnd', combo: g.combo }); g.combo = 0; } }
    var before = g.timeLeftMs;
    g.timeLeftMs -= dtMs;
    var amber = num(C.TIME_AMBER_S, 30) * 1000, red = num(C.TIME_WARN_S, 10) * 1000;
    if (before > amber && g.timeLeftMs <= amber) events.push({ type: 'timeWarn', level: 'amber' });
    if (before > red && g.timeLeftMs <= red) events.push({ type: 'timeWarn', level: 'red' });
    if (g.timeLeftMs <= 0) {
      g.timeLeftMs = 0;
      if (!g.extended) { g.status = 'timeout'; events.push({ type: 'timeout', canExtend: true, score: g.score }); }
      else { g.status = 'lost'; g.reason = 'timeout'; events.push({ type: 'timeout', canExtend: false, score: g.score }); }
    }
    return events;
  }

  // ---------- persistence ----------
  function snapshot(g) {
    return { v: 2, level: g.level, mode: g.mode, board: B.snapshot(g.board), score: g.score, levelScore: g.levelScore, combo: g.combo, comboLeftMs: g.comboLeftMs,
      comboMovesLeft: g.comboMovesLeft, bestCombo: g.bestCombo, moves: g.moves, matches: g.matches, elapsedMs: g.elapsedMs, timeLeftMs: g.timeLeftMs,
      status: g.status, reason: g.reason, started: g.started, bunnyEarned: g.bunnyEarned, rescueUsed: g.rescueUsed, extended: g.extended, flawless: g.flawless,
      usedUndo: g.usedUndo, usedHint: g.usedHint, warned: g.warned, undo: g.undo.slice(-(C.UNDO_PERSIST || 20)) };
  }
  function restore(snap) {
    var g = createGame(snap.level, snap.mode, { score: snap.score });
    g.board = B.restore(snap.board);
    ['levelScore', 'combo', 'comboLeftMs', 'comboMovesLeft', 'bestCombo', 'moves', 'matches', 'elapsedMs', 'timeLeftMs'].forEach(function (k) { g[k] = num(snap[k], 0); });
    g.status = ['won', 'lost', 'timeout'].indexOf(snap.status) >= 0 ? snap.status : 'playing';
    g.reason = snap.reason || null; g.started = !!snap.started;
    ['bunnyEarned', 'rescueUsed', 'extended', 'usedUndo', 'usedHint'].forEach(function (k) { g[k] = !!snap[k]; });
    g.flawless = snap.flawless !== false;
    g.warned = snap.warned || { space: false, orphan: false };
    g.undo = Array.isArray(snap.undo) ? snap.undo.slice() : [];
    g.matches = g.board.matches;
    return g;
  }

  var game = { createGame: createGame, start: start, act: act, moveItem: moveItem, shiftItem: shiftItem, collect: collect, spend: spend, rescue: rescue, undo: undo, extend: extend, giveUp: giveUp, tick: tick, snapshot: snapshot, restore: restore };
  SS.game = game;
  if (typeof module !== 'undefined' && module.exports) module.exports = game;
})(typeof globalThis !== 'undefined' ? globalThis : this);
