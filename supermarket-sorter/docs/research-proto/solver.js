'use strict';
const M = require('./model');
const { K } = M;

function countIn(f, t) { let c = 0; for (const x of f) if (x === t) c++; return c; }
// Heuristic score of a move for ordering (higher first).
function scoreMove(s, a, t, b) {
  const fa = s.front[a], fb = s.front[b];
  const cb = countIn(fb, t), ca = countIn(fa, t);
  let sc = 0;
  if (cb === 2) sc += 1000;                 // completes a triple
  else if (cb === 1 && fb.length === 2) sc += 300; // makes a pair, keeps last slot for the third
  else if (cb === 1) sc += 120;
  if (ca >= 2) sc -= 200;                   // breaking a pair is usually bad
  if (fa.length === 1) sc += (s.ptr[a] < s.cells[a].length) ? 60 : 80; // empties source (reveal or free cell)
  if (fb.length === 0) sc -= 30;            // dumping into an empty cell spends flexibility
  if (cb === 0 && fb.length > 0) sc -= 60;  // pollutes another cell
  return sc;
}
function orderedMoves(s) {
  const ms = M.legalMoves(s);
  // prune equivalent destinations: empty fronts with nothing behind are interchangeable
  const seenEmpty = new Set(); const out = [];
  for (const m of ms) {
    const b = m[2];
    if (s.front[b].length === 0 && s.ptr[b] >= s.cells[b].length) {
      const k = m[0] + ':' + m[1];
      if (seenEmpty.has(k)) continue; seenEmpty.add(k);
    }
    m.push(scoreMove(s, m[0], m[1], m[2])); out.push(m);
  }
  out.sort((x, y) => y[3] - x[3]);
  return out;
}

// Iterative DFS with dead-state memo (depth-aware) and symmetry-reduced keys.
// Returns {solved: true|false|null(budget hit), path, nodes}.
function symKey(s) {
  let k = ''; const done = [];
  for (let i = 0; i < s.front.length; i++) {
    const f = s.front[i].slice().sort((x, y) => x - y).join(',');
    if (s.ptr[i] < s.cells[i].length) k += i + ':' + s.ptr[i] + ':' + f + '|'; else done.push(f);
  }
  done.sort();
  return k + '#' + done.join('|');
}
function solve(state, budget = 200000, depthCap = 0) {
  const root = M.cloneState(state);
  if (root.left === 0) return { solved: true, path: [], nodes: 0 };
  const cap = depthCap || Math.max(30, Math.ceil(root.left * 2));
  const deadAt = new Map(); // key -> shallowest depth at which it was fully explored without success
  let nodes = 0;
  const stack = [{ s: root, moves: orderedMoves(root), i: 0, mv: null }];
  deadAt.set(symKey(root), 0);
  while (stack.length) {
    const top = stack[stack.length - 1];
    if (top.i >= top.moves.length || stack.length > cap) { stack.pop(); continue; }
    const m = top.moves[top.i++];
    const n = M.cloneState(top.s); M.applyMove(n, m[0], m[1], m[2]);
    if (n.left === 0) { const path = stack.slice(1).map(f => f.mv); path.push([m[0], m[1], m[2]]); return { solved: true, path, nodes }; }
    if (M.isHardStuck(n)) continue;
    const k = symKey(n); const d = stack.length;
    const prev = deadAt.get(k);
    if (prev !== undefined && prev <= d) continue;
    deadAt.set(k, d);
    if (++nodes > budget) return { solved: null, path: null, nodes };
    stack.push({ s: n, moves: orderedMoves(n), i: 0, mv: [m[0], m[1], m[2]] });
  }
  return { solved: false, path: null, nodes };
}

// Beam search for a short solution (par estimate).
function beam(state, width = 300, maxDepth = 400) {
  let layer = [{ s: M.cloneState(state), d: 0 }];
  const seen = new Set([M.key(state)]);
  for (let depth = 0; depth < maxDepth; depth++) {
    const next = [];
    for (const node of layer) {
      for (const m of orderedMoves(node.s)) {
        const n = M.cloneState(node.s); M.applyMove(n, m[0], m[1], m[2]);
        if (n.left === 0) return depth + 1;
        if (M.isHardStuck(n)) continue;
        const k = M.key(n); if (seen.has(k)) continue; seen.add(k);
        next.push({ s: n, h: evalState(n) });
      }
    }
    if (!next.length) return null;
    next.sort((x, y) => x.h - y.h);
    layer = next.slice(0, width);
  }
  return null;
}
// Lower-is-better state heuristic: items left weighted, plus how scattered the front types are.
function evalState(s) {
  let h = s.left * 10;
  const where = new Map();
  for (let i = 0; i < s.front.length; i++) for (const t of s.front[i]) where.set(t, (where.get(t) || 0) + 1);
  for (let i = 0; i < s.front.length; i++) { const f = s.front[i]; if (f.length && f.every(x => x === f[0])) h -= f.length * 3; }
  h -= M.freeFront(s) * 2;
  return h;
}

// Lower bound on moves for single layer: for each type, 3 - max count of it in one front.
function lowerBound(s) {
  const best = new Map(), cnt = new Map();
  for (const f of s.front) { const c = new Map(); for (const t of f) c.set(t, (c.get(t) || 0) + 1); for (const [t, v] of c) best.set(t, Math.max(best.get(t) || 0, v)); }
  let lb = 0; for (const v of best.values()) lb += 3 - v; return lb;
}

// Monte Carlo "casual player": with prob greedyP takes the top-scored move (random tie-break among top), else uniform random legal move.
function playout(state, rnd, greedyP = 0.7, cap = 400) {
  const s = M.cloneState(state); let moves = 0;
  while (s.left > 0) {
    if (M.isHardStuck(s)) return { win: false, moves, stuck: true };
    if (moves >= cap) return { win: false, moves, stuck: false };
    let ms = M.legalMoves(s);
    let m;
    if (rnd() < greedyP) {
      let best = -1e9, cands = [];
      for (const x of ms) { const sc = scoreMove(s, x[0], x[1], x[2]); if (sc > best) { best = sc; cands = [x]; } else if (sc === best) cands.push(x); }
      m = cands[Math.floor(rnd() * cands.length)];
    } else m = ms[Math.floor(rnd() * ms.length)];
    M.applyMove(s, m[0], m[1], m[2]); moves++;
  }
  return { win: true, moves };
}
module.exports = { symKey, solve, beam, playout, lowerBound, orderedMoves, scoreMove, evalState };

// Progress-bounded DFS: between two progress events (a match or a layer reveal) at most P plain moves are allowed.
// Sound for "solvable" (returns a witness); incomplete for "unsolvable" only if a solution needs > P shuffles between events.
function solveP(state, budget = 50000, P = 4) {
  const root = M.cloneState(state);
  if (root.left === 0) return { solved: true, path: [], nodes: 0 };
  const best = new Map(); // key -> largest remaining-shuffle budget with which it was already explored
  let nodes = 0;
  const ptrSum = s => { let x = 0; for (const p of s.ptr) x += p; return x; };
  const stack = [{ s: root, moves: orderedMoves(root), i: 0, mv: null, rem: P }];
  best.set(symKey(root), P);
  while (stack.length) {
    const top = stack[stack.length - 1];
    if (top.i >= top.moves.length) { stack.pop(); continue; }
    const m = top.moves[top.i++];
    const n = M.cloneState(top.s); M.applyMove(n, m[0], m[1], m[2]);
    if (n.left === 0) { const path = stack.slice(1).map(f => f.mv); path.push([m[0], m[1], m[2]]); return { solved: true, path, nodes }; }
    if (M.isHardStuck(n)) continue;
    const progress = n.left < top.s.left || ptrSum(n) > ptrSum(top.s);
    const rem = progress ? P : top.rem - 1;
    if (rem < 0) continue;
    const k = symKey(n); const prev = best.get(k);
    if (prev !== undefined && prev >= rem) continue;
    best.set(k, rem);
    if (++nodes > budget) return { solved: null, path: null, nodes };
    stack.push({ s: n, moves: orderedMoves(n), i: 0, mv: [m[0], m[1], m[2]], rem });
  }
  return { solved: false, path: null, nodes };
}
// Monte-Carlo witness search: up to `tries` randomized greedy playouts; returns first winning move count and the win rate.
function mcSolve(state, rnd, tries = 100, greedyP = 1.0) {
  let wins = 0, bestLen = Infinity, stuck = 0;
  for (let i = 0; i < tries; i++) { const r = playout(state, rnd, greedyP, 600); if (r.win) { wins++; bestLen = Math.min(bestLen, r.moves); } else if (r.stuck) stuck++; }
  return { solvable: wins > 0, winRate: wins / tries, bestLen: wins ? bestLen : null, stuckRate: stuck / tries };
}
module.exports.solveP = solveP;
module.exports.mcSolve = mcSolve;

// Human-like agent: softmax over heuristic move scores (temperature tau), never moves the item it just moved straight back.
// Sees only the fronts (plus whether a cell has something behind), so it also approximates play with hidden back layers.
function agent(state, rnd, tau = 120, cap = 0) {
  const s = M.cloneState(state); let moves = 0, last = null;
  const T0 = s.left / 3; cap = cap || Math.ceil(6 * T0 + 30);
  while (s.left > 0) {
    if (M.isHardStuck(s)) return { win: false, moves, stuck: true };
    if (moves >= cap) return { win: false, moves, stuck: false };
    const ms = M.legalMoves(s).filter(m => !(last && m[0] === last[2] && m[2] === last[0] && m[1] === last[1]));
    if (!ms.length) return { win: false, moves, stuck: true };
    const sc = ms.map(m => scoreMove(s, m[0], m[1], m[2]));
    const mx = Math.max(...sc); let tot = 0; const w = sc.map(x => { const e = Math.exp((x - mx) / tau); tot += e; return e; });
    let r = rnd() * tot, k = 0; while (k < w.length - 1 && (r -= w[k]) > 0) k++;
    const m = ms[k]; M.applyMove(s, m[0], m[1], m[2]); moves++; last = m;
  }
  return { win: true, moves };
}
module.exports.agent = agent;

// Complete BFS over the state graph (for small boards / proofs). Returns {solved, states, depth}.
function bfs(state, maxStates = 2e6) {
  const root = M.cloneState(state); if (root.left === 0) return { solved: true, states: 1, depth: 0 };
  const seen = new Set([symKey(root)]); let frontier = [root], depth = 0;
  while (frontier.length) {
    depth++; const next = [];
    for (const s of frontier) for (const m of M.legalMoves(s)) {
      const n = M.cloneState(s); M.applyMove(n, m[0], m[1], m[2]);
      if (n.left === 0) return { solved: true, states: seen.size, depth };
      if (M.isHardStuck(n)) continue;
      const k = symKey(n); if (seen.has(k)) continue; seen.add(k);
      if (seen.size > maxStates) return { solved: null, states: seen.size, depth };
      next.push(n);
    }
    frontier = next;
  }
  return { solved: false, states: seen.size, depth };
}
module.exports.bfs = bfs;
