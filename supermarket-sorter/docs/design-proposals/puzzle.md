# Supermarkt Sortierer: design proposal, PUZZLE-FIRST lens

Version 1, 2026-10-10. Lens: rigorous model, a machine-checkable solvability proof for every level the game can
ever show, measurable difficulty, an infinite curve. Owner notes (`docs/OWNER-NOTES.md`) are binding; where they
override `docs/RESEARCH.md` this is marked **[owner]**. Deviations from the brief for this lens are marked
**[lens]** with a one-line reason. Facts from the original's GDD wiki are cited as **[wiki: page]**
(https://github.com/haodhh-r1abi/GoodsSortPuzzleWiki, features/*.html, read 2026-10-10). Measurements come from a
Node prototype of the FULL model written for this proposal (`docs/research-proto/full/`: fm.js, gen.js, genb.js,
exp.js, expb.js, tables.js), desktop Node 22, one core.

---

## 0. Summary and decision log

**Core idea.** Moving shelves are a *timing* layer on top of a *time-free* puzzle. The time-free puzzle (centre
rack with layers and locks, a take-only side reserve, golden bunnies, orphan sweep) decides solvability; motion only
decides how long a solution takes. Every level ships with a **certificate** (a witness move list). The game
re-verifies the certificate by replay before showing the level (< 1 ms). "Proof" = a replayed witness, not
trust in a generator. The owner's requirement "beweisen, dass der Generator nur funktionierende Level erzeugt" is
met for baked levels (CI replays all certificates) and for the infinite tail (the device replays the certificate it
just found; a level without one is never shown).

| # | Decision | Why (one line) |
|---|---|---|
| D1 | Time-free abstract model `A(level)`; relaxed solvable ⇔ `A` solvable; timed adds a time bound computed from the witness | Motion never removes an option, it only delays it (proof in 3.1) |
| D2 | Every level carries a witness; `levels.verify(level, witness)` replays it on load | A replay is a proof a test and a phone can both check |
| D3 | Baked: 150 levels per branch (300) with witnesses in `src/game/levels-data.js`; tail L151+ generated on device, deterministic per (branch, n) | Curated quality where players spend most time; infinite after |
| D4 | **Banded dealing**: copies of a type lie within about two layers of each other | Measured: agent win 13% → 33% at depth 3-4; DFS p50 556 → 46 ms at depth 4-6 |
| D5 | Solver budgets are **node counts**, never milliseconds | Determinism: level n must be identical on every device and in CI |
| D6 | Win = no type has ≥ 3 copies left; **orphan sweep** removes a type the moment it drops to 1-2 copies | [owner] bunny leftovers count as solved; [lens] orphans must never clog slots or fool the stuck test |
| D7 | Golden bunny = a non-movable item in a back layer; tap it when in front → its whole front layer is removed, then orphan sweep | [owner] "frees a compartment"; a choice (when to tap) is better puzzle than an automatic effect |
| D8 | Side cells hold 1 product (owner), are take-only, barred when empty; horizontal strips are the same object on a horizontal loop with `opensAfter` matches | [owner]; one data type for both loops keeps the solver small |
| D9 | Exact `progressPossible` extended for side reserve and bunny (formula R14) | Exact stuck sheet; never a false "Kein Platz mehr" |
| D10 | Timed limit = `ceil5(τ(L)·|W| + Σ wait + 20)`, clamped [120, 480] s; relaxed par = `ceil(1.15·|W_best|)` | Both numbers derive from the certificate, so they are achievable by construction |
| D11 | Branch-specific boards [owner]: timed = lighter boards, faster loops, falling τ; relaxed = deeper (to 6), more locks, fewer free slots, slow or standing loops | Owner's branch notes |
| D12 | Undo unlimited in both branches (the clock keeps running in timed) | Hidden layers 3-6 make blind dead ends possible; undo is the fairness valve |

**Rejected.**
- Reverse-play construction for whole levels: the brief measured 3/40 successes at depth 2, T=20; at depth 6 it is worse.
- Recycling L41-500 with transforms forever (brief 3.7): the curve would stop at L500; kept only as the **fallback**.
- Hidden '?' items, bombs, ReverseItem, LockSlot from the original's obstacle list [wiki: Obstacles]: luck or extra
  rules for the owner's mother; not requested.
- Runtime ms budgets, Web Workers (file:// forbids workers).
- Per-slot reveal: the owner described whole-layer advance.

**Where the owner overrides the brief:** moving side shelves, locked compartments, whole-layer reveal up to 6 layers
and the golden bunny are in v1 (brief: v2 / depth ≤ 3). Layout of the late game is 2 columns + top/bottom singles
+ side loops (owner's Lv.513), not a 5x3 grid. Lock counters open by matches only, no skip.

---

## 1. Game model, formal

### 1.1 Objects

```
Level = {
  id, branch: 'timed'|'relaxed', n, gen: GEN_VERSION, tag: 'tut'|'br'|'n'|'h'|'vh',
  shape: 'G3x3'|'G3x4'|'G2+2',          // see 1.2
  comps: [Comp],                         // centre rack, index order = reading order
  loops: [Loop],                         // 0..3 side/horizontal loops
  types: int, par: int, timeS: int,      // timeS = 0 in relaxed
  witness: [Move]                        // the certificate
}
Comp  = { layers: [Layer], lock: int }   // layers[0] = front; 1 <= layers.length <= 6; lock = matches needed (0 = open)
Layer = [t|null, t|null, t|null]         // fixed slot positions; t = type index 1..T, 0 = golden bunny
Loop  = { axis: 'v'|'h', side: 'L'|'R'|'T', cells: [t|null], speed: cellsPerSecond, opensAfter: int }
Move  = [from, t, to]                    // from = comp index, or 'L0'/'R0'/'T0' + cell index for a take; to = comp index
                                         // bunny tap: [comp, 0, -1]
```

Runtime state: `ptr[i]` (index of the current front layer), `front[i]` (3 slots), `m` (matches so far, global),
`dead` (bitset of swept types), per loop `phase` (float, cells) and `barred[c]`, `moves`, timer and combo fields,
kit charges, undo stack.

### 1.2 Centre rack shapes

| Shape | Layout | C | Used |
|---|---|---|---|
| G3x3 | 3 columns × 3 rows of 3-slot compartments | 9 | L1 both branches |
| G3x4 | 3 columns × 4 rows (the original's Lv.2) | 12 | relaxed L2-12, timed L2-9 (no loops) |
| G2+2 | top single (centred, 3 slots), 2 columns × 4 rows, bottom single | 10 | from the first loop level (relaxed L13, timed L10) |

G2+2 is the owner's Lv.513 rack exactly (screenshot: 1 + 8 + 1 compartments). Loops need the horizontal room that
the third column took. A horizontal strip (timed late) sits between the HUD and the top single.

### 1.3 Layers (owner's whole-layer advance)

- Compartment i shows `layers[ptr[i]]` as its front. Layer `ptr+1` is drawn darkened behind; deeper layers are never
  drawn, only counted as pips (max 4 pips).
- **Reveal:** when `front[i]` holds 0 items (match, moves out, bunny, hammer), `ptr[i]++` and the next layer moves
  forward into the same slot positions, with its holes. Items of swept types are filtered out on arrival; a layer
  left empty by the filter is skipped.
- Back layers hold 1-3 items, never 0; no layer is a triple of one type (generator invariant), so a reveal never
  causes a match by itself (cascade code stays as a safety net, rule R9).

### 1.4 Locks

- `lock = N > 0`: chains and a badge showing `max(0, N - m)`. The compartment accepts no drops and gives no items.
- Every match anywhere (player triple, hammer triple) raises m by 1. Bunny removals and orphan sweeps are not
  matches. At `m >= N` the chains fall; the compartment behaves normally from then on.
- Range: N ∈ {3,4,5,6}; original default 4 [wiki: CellLock, `num_lock` 4]. Locked compartments start with a full
  front (3 items), may have back layers.

### 1.5 Side shelves (loops)

- A vertical loop is a ring of `N` single-slot cells (N = 8-12 per side) moving up at `speed` cells/s; a cell leaving
  the top re-enters at the bottom. The screen shows `Vis` cells (layout guarantees `Vis >= 6`, Lv.513 shows 7-8).
- Each cell holds one product [owner]. Take-only: the player drags it to a centre compartment with a free slot.
  Products never go back and nothing is ever dropped on a loop.
- When a cell is emptied, bars drop from above and the cell stays barred for the level (= the original's
  `CloseCellEnd`: "closes the shelf permanently when it runs out of goods" [wiki: Obstacles]).
- Horizontal strip (timed, hard levels, later in a level): `axis 'h'`, N = 8, moves right-to-left at `0.8·speed`,
  slides in with a 600 ms animation once `m >= opensAfter` (opensAfter = 40% of the level's total matches, rounded
  down). Same take-only and bar rules. The original has the same building blocks: `CellType` Single and Move,
  `MoveType` Right/Left/Top/Bot with `CellInfo.speed` [wiki: GameplayMechanics].
- Relaxed: speed 0 (standing) on the first three loop levels, then 0.2-0.4 cells/s [owner: "may stand still or move
  slowly"]. Timed: 0.30 cells/s at the first loop level rising to 1.2 (×1.15 Hard, ×1.3 VeryHard, ×0.8 breather,
  cap 1.5).

### 1.6 Golden bunny

- Type 0. Placed only in back layers ≥ 2 (a reward for digging), at most 1 per level (2 from L60 relaxed VH).
- Cannot be dragged and occupies its slot. When it is in an unlocked front, a sparkle marks it; **tap** = trigger:
  the bunny flies to the HUD counter, the other 0-2 items in that front are removed, reveal (R7) runs, then the
  orphan sweep (R11) runs.
- When no non-bunny item is left, remaining bunnies auto-collect (so a level can never end blocked by a bunny).
- Frequency: section 4 tables; on average every fifth level from the bunny intro.

### 1.7 Orphans

Type t is an **orphan** when `0 < count(t) < 3`, counting fronts, back layers, locked compartments and untaken loop
cells. The generator gives every type a multiple of 3, so only removals that are not matches (bunny, hammer
over-reach) create orphans. **Orphan sweep:** all copies of an orphan type are removed at once (fade + sparkle,
"Aufgeräumt!"), wherever they are; back-layer copies leave holes; an emptied loop cell is barred. Win (R12) is
"no type has ≥ 3 copies left", which after the sweep equals "board empty". This matches the original, whose win check
is "no match can be created any more" (`IsCompleteLevel`: CanCreateMatch3WithVisibleItems, CanGetItemFromCellSingle,
CanOpenNewRowByMove all false [wiki: GameplayMechanics]).

### 1.8 Free space

`F` = empty front slots of unlocked compartments. Loops contribute no space. A centre move keeps F; a take lowers F by
1 permanently until a match; a match adds 3; a reveal subtracts the arriving layer's size; an unlock adds that
compartment's empty slots (0 at start); a bunny tap adds the removed front items minus the arriving layer.

- **Out of space** = items left and `progressPossible = false` (R14).
  - Relaxed: sheet "Kein Platz mehr" with Rückgängig (unlimited), Hammer/Mischen if a charge is left, Neustart
    (same board). Nothing is recorded as a loss.
  - Timed: non-modal banner over the board with the same buttons plus "Lauf beenden"; the clock and loops keep
    running. If the clock hits 0 while stuck, the timeout rule applies (5.1).

### 1.9 Undo

Unlimited in both branches. Each valid move or tap pushes a snapshot (fronts, ptr, layers with holes, m, dead,
barred, loop contents, score, levelScore, chain, comboLeft, comboMovesLeft, earned charges). Undo restores it,
including un-barring a loop cell (the product reappears in its cell wherever the loop has moved it). Undo never
rewinds the clock, the loop phase or `moves`. Hammer and Shuffle clear the stack. Cap 300 snapshots.

---

## 2. Rules, tick order, events

### 2.1 Rules

- **R1** Only front items of unlocked centre compartments, products in unbarred loop cells that are at least 50%
  inside the visible window, and a front bunny (tap only) can be acted on.
- **R2** A centre move puts one front item into an empty front slot of a different unlocked compartment. It lands
  in the slot under the finger if empty, else the nearest empty slot of that compartment.
- **R3** A take moves one loop product into an empty front slot of an unlocked compartment; its cell becomes barred.
- **R4** Drops on the own compartment, a full or locked compartment, a loop, or outside spring back (180 ms); not a move.
- **R5** The model changes only on a validated drop or tap.
- **R6** Match: 3 identical non-bunny items in one front clear (300 ms anim; only that compartment is busy).
- **R7** Reveal: an empty front takes the next non-empty layer (after filtering swept types). Order after a move:
  target compartment first, then source.
- **R8** Lock: after every match m += 1; every compartment with `lock <= m` opens (event `unlock`).
- **R9** Cascade safety: a revealed triple clears, counts as a chain step, costs no move (generator forbids it).
- **R10** Bunny tap: remove the bunny and its front layer's other items, reveal, then R11. Not a match, not a move
  for combo purposes, counts 1 move for par.
- **R11** Orphan sweep: after any removal that is not a match, every type with `0 < count < 3` is removed everywhere.
- **R12** Win: no type has ≥ 3 copies left and no bunny is left (auto-collect, 1.6). Checked after animations settle.
- **R13** Loop opening: a loop with `opensAfter > 0` slides in when `m >= opensAfter`.
- **R14** `progressPossible(s)` (exact for side cells holding one product):
  ```
  bunnyFront                                     -> true
  F == 0                                         -> false
  exists t: V(t) >= 3                            -> true
  exists t: V(t) + S(t) >= 3 and F >= 3 - V(t)   -> true      // S(t) = untaken copies in open loops
  F >= 3 and H > 0                               -> true      // H = unlocked compartments with a deeper layer
  otherwise                                      -> false
  ```
  Proof sketch: with F ≥ 1 front items of unlocked compartments can be permuted arbitrarily (an item can always jump
  into the hole; two jumps swap two items), so a visible triple can be gathered; taking `3 - V(t)` copies needs that
  many free slots, and arranging the pair next to the last hole before the last take needs only F ≥ 1 then; emptying
  a front of k items needs `F - (3 - k) >= k`, i.e. F ≥ 3. Locked compartments and closed loops open only through
  matches, so they cannot rescue a position with no reachable match. Test: agrees with exhaustive BFS on 2000 small
  states with loops (tests/board.test.js).
- **R15** Timed: the clock starts on the first touch; loops start moving at level start (motion is free information).
- **R16** Pause (button, overlay, hidden page) freezes clock, combo bar and loop phase.

### 2.2 Tick order (`game.tick(g, dtMs)`, dt clamped to 100 ms)

```
1. if status != 'playing' or paused: return []
2. elapsed += dt
3. loops: for each open loop: phase = (phase + speed * dt/1000 * freezeFactor) mod N    // freezeFactor 0 under Freeze
   - emit 'loopWrap' when a cell crosses the wrap line (view recycles one element)
4. pending loop openings: none here (opened in resolve(), R13)
5. combo (timed): comboLeft -= dt; at <= 0: emit comboEnd, chain = 0
6. timer (timed, started): timeLeft -= dt (not under Freeze); at <= 0: emit 'timeout'
7. freeze: freezeLeft -= dt; at <= 0: emit 'freezeEnd'
```

Moves (`moveItem`, `takeItem`, `tapBunny`) run `resolve()`:
```
apply move -> settle(target): match? -> m++, unlocks, loop openings -> reveal(target) -> settle(source) -> reveal(source)
-> if non-match removal happened: sweep() -> win check -> progressPossible check -> emit events
```

### 2.3 Events (extends move, match, combo, score, cleared, deadlock, timeout, comboEnd)

| Event | Payload | Consumers |
|---|---|---|
| move | item, from, fromSlot, to, toSlot | board anim, sound |
| take (new) | item, loop, cell, to, toSlot | board anim, bars drop |
| bar (new) | loop, cell | board |
| match | comp, product, items, slots, combo, points | board, hud, sound |
| reveal (new) | comp, layer index, items, nextLayerItems (for the dark preview) | board |
| unlock (new) | comp | board (chains fall), sound |
| loopOpen (new) | loop | board (strip slides in) |
| loopWrap (new) | loop, cell | board (recycle element) |
| bunny (new) | comp, removed items, total | board, hud counter |
| sweep (new) | types, items (with locations) | board, toast "Aufgeräumt!" |
| combo / comboEnd | chain, multiplier | hud |
| score | delta, score | hud |
| stuck (renamed from deadlock; `deadlock` kept as alias) | reason 'space' | overlay |
| unstuck (new) | - (after undo, hammer, shuffle) | overlay |
| cleared | bonus, stars, score, levelScore, moves, elapsedMs, timeLeftMs | states |
| timeout | score | states |
| freezeStart / freezeEnd (new) | ms | hud, board |

---

## 3. Solvability and the proof

### 3.1 The time-free model and why it is enough

`A(level)` = the state machine of section 1 with loops replaced by a multiset `S` per open loop (every untaken product
can be taken at any time) and no clock.

**Theorem 1 (relaxed).** A level is winnable in relaxed play ⇔ `A(level)` has a winning move sequence.
- (⇐) Execute the witness; a take of a product in cell c waits until c is in the visible window, at most one
  period `N/speed` (or immediately if speed is 0, because then layout shows all cells: standing loops are only used
  with `N <= Vis`). No rule depends on time, so the waits change nothing else.
- (⇒) Every real play is a sequence of A-moves.

**Theorem 2 (timed).** Executing the witness at τ seconds per move finishes within
`τ·|W| + Σ_takes (N - Vis_min)/speed` seconds (each take waits at most the hidden arc). The time limit (4.4) is at
least this bound plus 20 s, so a player who follows the certificate at pace τ always finishes. This is the provable
part; whether a human finds a line that fast is the tuning part (section 9).

So the proof obligation is exactly: **find a witness for `A(level)` and replay it.**

### 3.2 Solver for the full model

State key: per compartment `ptr + sorted front` (open compartments with nothing behind are sorted among themselves:
symmetry), plus loop counts per type, plus m while any lock is closed, plus `dead`. Prototype uses strings; the
production solver uses a 64-bit Zobrist pair in two Int32 halves (integer only).

```
solveP(s0, nodeBudget, P=4):              // progress-bounded DFS with memo (brief 3.3, extended)
  stack = [s0]; best = Map(key -> remaining plain-move budget)
  while stack:
    pick next move in heuristic order:
      +1000 completes a triple; +900 bunny tap; +300 pair into a 2-item front; +120 pair
      -200 breaks a pair; +60/+80 empties a source (reveal / free); -60 pollutes; -30 into an empty front
      takes: -150 unless they complete a triple or join a pair (then scored as above)
    apply; if won -> return path
    if !progressPossible -> skip            // R14 prunes most dead ends in O(items)
    rem = progress(match|reveal|bunny|take-that-pairs) ? P : rem-1; if rem < 0 skip
    if best[key] >= rem skip; best[key] = rem
    if ++nodes > nodeBudget return UNKNOWN
  return UNSOLVABLE (relative to P)
```

Soundness: any returned path is verified by replay (`verify`), so heuristics and pruning can never make an unsolvable
level pass; they only lower the acceptance rate. Takes are generated only by type (loop products of one type are
interchangeable in A), which removes the loop-position branching entirely.

### 3.3 Measured cost (prototype, desktop Node, budget in nodes)

Random deal (`gen.js`) vs banded deal (`genb.js`, D4); "agent" = noisy greedy (sees fronts and loops, no lookahead,
no undo), 10 runs per level; DFS budget 20k-50k nodes.

| Config (C=10 G2+2 unless noted) | Items | Deal | DFS solved / budget-hit | DFS ms p50 / p90 / max | Nodes p90 | Agent win |
|---|---|---|---|---|---|---|
| G3x4, depth 2, back 1-2, no loops | 51 | random | 30/30 / 0 | 3.4 / 8.2 / 14.6 | 95 | 90% |
| depth 2-3, back 1-3, loops 16, 2 locks, bunny | 72 | random | 25/30 / 5 | 6.9 / 3433 / 3571 | 50k | 39% |
| depth 3-4, back 1-3, loops 16, 2 locks, bunny | 91 | random | 11/12 / 1 | 13.1 / 31.6 / 965 | 295 | 13% |
| same | 91 | **banded** | 13/15 / 2 | 10.0 / 953 / 1195 | 20k | **33%** |
| depth 4-6, back 2-3, loops 20, 3 locks, bunny | 146 | random | 5/8 / 3 | 556 / 1116 / 1116 | 20k | 0% |
| same | 147 | **banded** | 7/10 / 3 | **46** / 1095 / 1095 | 20k | 0% |
| depth 5-6, back 1-3, F0 6, loops 20, 2 locks | 134 | banded | 6/10 / 4 | 38 / 1229 / 1229 | 20k | 4% |

Findings:
1. No generated level was **proven** unsolvable; failures are budget hits. With banded deals 70-87% certify within
   20k nodes, and the median certified level costs 10-46 ms.
2. Prototype speed is 50-70 µs per node (string keys, array clones, BigInt). Target for production: ≤ 8 µs/node
   (Int32 Zobrist, typed-array fronts, undo-in-place instead of clone). iPhone factor assumed ×1.5 over desktop.
3. Dense deep boards (back 2-3 at depth 6) are hopeless for a no-lookahead agent. Deep relaxed levels therefore use
   **sparse deep layers**: layers 4-6 hold 1-2 items (tables in section 4) and F0 stays ≥ 3.
4. Greedy playouts alone certify too rarely on loop boards (4/30 at 72 items); DFS is the certifier, playouts are
   only the difficulty metric.

### 3.4 Generation pipeline (same code offline and on device)

```
generate(branch, n, attemptLimit, nodeBudget):
  k = knobs(branch, n)                                    // section 4
  for a in 0..attemptLimit-1:
    rng = mulberry32(hash32('gen', GEN_VERSION, branch, n, a))
    L = bandedDeal(k, rng)                                // 3.5
    if !invariants(L): continue                           // multiples of 3, no triple layer, no front triple, F0, R14 at start
    r = solveP(init(L), nodeBudget, 4)
    if r.solved !== true: continue
    if !verify(L, r.path): throw                          // a bug, never expected
    W = shorten(L, r.path)                                // offline only: beam 200 + 21 playouts, keep the shortest verified
    m = metrics(L, W, rng)                                // 3.6
    if !accept(m, window(branch, n)): continue            // offline only (tail accepts any certified level)
    return { level: L, witness: W, par, timeS, attempt: a }
  return FAIL
```

- Offline (`scripts/build-levels.js`): attemptLimit 400, nodeBudget 2,000,000, acceptance windows on. Fails the build
  on any level without an accepted layout and prints the knob row to change.
- On device (tail, n > 150): attemptLimit 12, nodeBudget 30,000 per attempt, acceptance windows off (any certified
  level of the right knobs). Worst case 360k nodes ≈ 2.9 s at the 8 µs target (≈ 25 s at prototype speed, which is
  why the production solver is optimised and why generation runs in the background, 3.7).
- Tail FAIL (all 12 attempts budget-hit): level := `transform(baked[branch][101 + (n mod 50)], seed n)`: type relabel,
  compartment permutation inside each shape's symmetry group (mirror columns, swap rows of the 2-column block), loop
  cell rotation. These maps commute with the rules, so the baked witness maps to a witness; it is replayed anyway.
  CI measures the fallback rate over tail levels 151-1150 per branch; target < 2%.

### 3.5 Banded dealing

```
bandedDeal(k, rng):
  sizes: front sizes so that sum(3 - front) = F0 (locked comps get 3); depth d_i ~ U[dlo, dhi];
         layer j>=1 size ~ U[back(j)]; fix the total to a multiple of 3 by +1 on random back layers
  slots = every (comp, layer, pos), key = layer*1000 + rng()*1000*jitter      // jitter 0.6
  sort slots by key                                                            // shallow first, locally shuffled
  seq = triples in order t1 t1 t1 t2 t2 t2 ... (types round-robin, T = min(k.T, triples))
  locally shuffle seq in windows of W = 15 slots, step W/2                     // copies stay within ~1-2 layers
  loop products: every (len/loopCells)-th position of seq (with jitter) goes to the loops, cycling L, R, (T)
  deal the rest of seq onto the sorted slots
  bunny: replace nothing; add type 0 to a back layer >= 2 with a free position
  locks: k.locks compartments chosen among those whose front holds no copy of a type that appears only in locked comps
```

Why banding: in the random deal a type's copies are spread over depths 1-6, so the player must park copies for a
long time and runs out of space; banding makes depth progress like the original's waves, keeps the dark preview
relevant (the next layer usually holds partners for the current one) and cut DFS median cost 12× on deep boards.

### 3.6 Difficulty metrics (offline, per level)

| Metric | Definition | Use |
|---|---|---|
| agentWin | wins of 20 noisy-greedy playouts (noise U[0,250) on move scores) | main difficulty number |
| deadRate | share of playouts ending in `!progressPossible` | fairness: ≤ 30% except VH |
| |W| | certified witness length after shortening | par, time |
| minSlack | min over the witness of F (free slots) | tightness; ≥ 1 by definition |
| takes | loop takes in W, and the max number of loop products parked in the centre at once | loop pressure |
| evictions | witness moves that put an item next to no twin | planning depth |
| depthSpan | mean (max depth - min depth) over the 3 copies of a type | banding check, ≤ 1.6 |

Acceptance windows (agentWin), both branches:

| Band | Normal | Hard | VeryHard | Breather / tutorial |
|---|---|---|---|---|
| L1-10 | 85-100% | 70-95% | 55-90% | 95-100% |
| L11-30 | 60-95% | 45-80% | 25-65% | 85-100% |
| L31-60 | 40-85% | 25-65% | 8-45% | 80-100% |
| L61-150 | 30-80% | 15-60% | 5-40% | 75-100% |

### 3.7 Device budget and render policy for generation

- Generation of tail level n+1 starts when level n starts, as a resumable job: `levels.genStep(job, 4000 nodes)` is
  called by `states.js` every 50 ms via `setTimeout` while PLAY or WIN (about 30 ms of work per 50 ms at prototype
  speed, 4 ms at target), and is paused during drag and animations. A level takes minutes, the job seconds.
- If the player reaches level n+1 before its job finishes (only possible on a fresh load into the tail), the card
  "Regal wird eingeräumt…" shows and the job runs in 16 ms slices until done. Determinism holds because only node
  counts decide the outcome.
- Certificates of tail levels are cached in the run record (`levelCache: {branch, n, gen, hash, witness}`), so a
  reload never recomputes.

### 3.8 Baked data format

```js
// src/game/levels-data.js  (generated by scripts/build-levels.js; do not edit)
SS.LEVEL_DATA = { v: 2, gen: 2, timed: [ ... 150 ], relaxed: [ ... 150 ] };
// one level = "<shape>|<tag>|<F0>|<locks>|<loops>|<par>|<timeS>|<comps>|<witness>"
//   comps: per comp "<layers>" with 3 base-36 chars per layer ('.' hole, '0' bunny), comps joined by ','
//   loops: per loop "<axis><side><speedx100>@<opensAfter>:<cells>" joined by ';'
//   witness: per move 3 chars: from (base-36 comp, or 'w'/'x'/'y' + cell char for loops L/R/T), type, to
```
Size: about 150 slot chars + 2 × 22 loop chars + 3 × 130 witness chars ≈ 600 B per level, 300 levels ≈ 180 KB raw.
Parse < 2 ms. Verification of one witness ≈ 0.2 ms (130 moves × O(C)).

---

## 4. Levels

### 4.1 Structure

- **Authored opening, 12 per branch (L1-L12 relaxed / timed share the first 9 boards):** hand-written in
  `scripts/levels-authored.js` as compact strings, each still certified by the solver. They teach one mechanic each:
  L1 sort (single layer), L2 the dark layer, L3 empty a front on purpose, L5 hard spike, L8 first lock (relaxed) /
  L10 first loop (timed), L13 first loop (relaxed, standing), L14/L16 first bunny.
- **Curated L13-150:** generated offline by 3.4 with acceptance windows, then a human pass: the build writes
  `docs/preview/levels/<branch>-<n>.txt` (ASCII board + metrics); the owner or the developer may veto a level by number
  (`scripts/vetoes.json`), which bumps its attempt counter. Quality is not left to chance [owner].
- **Tail L151+:** device generation with `knobs(branch, n)` from the formulas in 4.5.
- **Saw-tooth** per 10 levels: idx = (L-1) mod 10; idx 0 breather, idx 4 Hard, idx 9 VeryHard; Hard/VH show
  "Schwer". The original has the same spikes (level%10 == 4 Hard, == 9 VeryHard [wiki: Difficulty]).

### 4.2 Knob ranges per branch

| Knob | Relaxed range | Timed range | Notes |
|---|---|---|---|
| Shape | G3x3 → G3x4 → G2+2 | same, G2+2 from L10 | |
| Depth (layers per comp) | 1 → 6 | 1 → 3 (VH 4) | owner: up to 6; timed gets pressure from speed instead |
| Back layer sizes | layer 2-3: 1-3; layers 4-6: 1-2 | 1-3 | sparse deep layers (3.3 finding 3) |
| F0 | 6 → 3 | 6 → 4 | |
| Locks | 0 → 3 per level, N 3-6 | 0 → 2, N 3-4 | Normal levels only |
| Loops | 2×8 → 2×11, 0 → 0.4 cells/s | 2×8 → 2×10, 0.30 → 1.2 (cap 1.5) + H-strip | |
| Types | 7 → 24 | 7 → 18 | confusable hue pairs: 0 until L10, 1 to L20, 2 after |
| Bunny | 0-1 (2 on VH ≥ L60) | 0-1 | |

### 4.3 Relaxed branch, L1-60

Items≈ and Par≈ are estimates (`|W| ≈ 1.3 × items`, par = ceil(1.15 |W|); single-layer levels need only about 0.7 × items moves, so their real par is about half the estimate); the build writes the real values.
Side: cells per side, speed in cells/s (0 = standing). Locks: count × N.

| L | Tag | Shape (C) | F0 | Depth | Back | Side N/side, v | Locks | Bunny | Types | Items≈ | Par≈ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Tut | G3x3 (9) | 6 | 1 | - | - | - | - | 7 | 21 | 32 |
| 2 | N | G3x4 (12) | 5 | 1-2 | 1-2 | - | - | - | 13 | 39 | 59 |
| 3 | N | G3x4 (12) | 5 | 1-2 | 1-2 | - | - | - | 13 | 39 | 59 |
| 4 | N | G3x4 (12) | 5 | 1-2 | 1-2 | - | - | - | 13 | 39 | 59 |
| 5 | H | G3x4 (12) | 5 | 2 | 1-2 | - | - | - | 14 | 48 | 72 |
| 6 | N | G3x4 (12) | 5 | 1-2 | 1-2 | - | - | - | 13 | 39 | 59 |
| 7 | N | G3x4 (12) | 5 | 1-2 | 1-2 | - | - | - | 13 | 39 | 59 |
| 8 | N | G3x4 (12) | 5 | 1-2 | 1-2 | - | 1×3 | - | 13 | 39 | 59 |
| 9 | N | G3x4 (12) | 5 | 1-2 | 1-2 | - | 1×3 | - | 13 | 39 | 59 |
| 10 | VH | G3x4 (12) | 5 | 2 | 1-2 | - | - | - | 14 | 48 | 72 |
| 11 | Br | G3x4 (12) | 5 | 1-2 | 1-3 | - | - | - | 14 | 42 | 64 |
| 12 | N | G3x4 (12) | 5 | 2-3 | 1-3 | - | 1×3 | - | 16 | 66 | 99 |
| 13 | N | G2+2 (10) | 6 | 2-3 | 1-3 | 6, 0.00 | - | - | 16 | 69 | 104 |
| 14 | N | G2+2 (10) | 6 | 2-3 | 1-3 | 6, 0.00 | 1×4 | - | 16 | 69 | 104 |
| 15 | H | G2+2 (10) | 6 | 3 | 1-3 | 6, 0.00 | - | - | 16 | 81 | 121 |
| 16 | N | G2+2 (10) | 5 | 2-3 | 1-3 | 8, 0.20 | 1×4 | 1 | 16 | 72 | 109 |
| 17 | N | G2+2 (10) | 5 | 2-3 | 1-3 | 8, 0.20 | 1×4 | - | 16 | 72 | 109 |
| 18 | N | G2+2 (10) | 5 | 2-3 | 1-3 | 8, 0.20 | 1×4 | 1 | 16 | 72 | 109 |
| 19 | N | G2+2 (10) | 5 | 2-3 | 1-3 | 8, 0.20 | 1×4 | - | 16 | 72 | 109 |
| 20 | VH | G2+2 (10) | 5 | 3 | 1-3 | 8, 0.20 | - | - | 16 | 81 | 121 |
| 21 | Br | G2+2 (10) | 4 | 2-3 | 1-3 | 9, 0.20 | - | - | 18 | 75 | 113 |
| 22 | N | G2+2 (10) | 4 | 3-4 | 1-3 | 9, 0.20 | 2×3-4 | - | 18 | 93 | 140 |
| 23 | N | G2+2 (10) | 4 | 3-4 | 1-3 | 9, 0.20 | 2×3-4 | 1 | 18 | 93 | 140 |
| 24 | N | G2+2 (10) | 4 | 3-4 | 1-3 | 9, 0.20 | 2×3-4 | - | 18 | 93 | 140 |
| 25 | H | G2+2 (10) | 4 | 4 | 1-3 | 9, 0.20 | - | - | 18 | 105 | 158 |
| 26 | N | G2+2 (10) | 4 | 3-4 | 1-3 | 9, 0.20 | 2×3-4 | - | 18 | 93 | 140 |
| 27 | N | G2+2 (10) | 4 | 3-4 | 1-3 | 9, 0.20 | 2×3-4 | - | 18 | 93 | 140 |
| 28 | N | G2+2 (10) | 4 | 3-4 | 1-3 | 9, 0.20 | 2×3-4 | 1 | 18 | 93 | 140 |
| 29 | N | G2+2 (10) | 4 | 3-4 | 1-3 | 9, 0.20 | 2×3-4 | - | 18 | 93 | 140 |
| 30 | VH | G2+2 (10) | 4 | 4 | 1-3 | 9, 0.20 | - | 1 | 18 | 105 | 158 |
| 31 | Br | G2+2 (10) | 4 | 3-4 | 1-3 | 10, 0.30 | - | - | 18 | 96 | 144 |
| 32 | N | G2+2 (10) | 4 | 4-5 | 1-3 | 10, 0.30 | 2×3-4 | - | 18 | 117 | 175 |
| 33 | N | G2+2 (10) | 4 | 4-5 | 1-3 | 10, 0.30 | 2×3-4 | 1 | 18 | 117 | 175 |
| 34 | N | G2+2 (10) | 4 | 4-5 | 1-3 | 10, 0.30 | 2×3-4 | - | 18 | 117 | 175 |
| 35 | H | G2+2 (10) | 4 | 5 | 1-3 | 10, 0.30 | - | - | 18 | 126 | 189 |
| 36 | N | G2+2 (10) | 4 | 4-5 | 1-3 | 10, 0.30 | 2×3-4 | - | 18 | 117 | 175 |
| 37 | N | G2+2 (10) | 4 | 4-5 | 1-3 | 10, 0.30 | 2×3-4 | - | 18 | 117 | 175 |
| 38 | N | G2+2 (10) | 4 | 4-5 | 1-3 | 10, 0.30 | 2×3-4 | 1 | 18 | 117 | 175 |
| 39 | N | G2+2 (10) | 4 | 4-5 | 1-3 | 10, 0.30 | 2×3-4 | - | 18 | 117 | 175 |
| 40 | VH | G2+2 (10) | 4 | 5 | 1-3 | 10, 0.30 | - | 1 | 18 | 126 | 189 |
| 41 | Br | G2+2 (10) | 4 | 4-5 | 1-3 | 11, 0.30 | - | - | 20 | 117 | 175 |
| 42 | N | G2+2 (10) | 4 | 5-6 | 1-3 | 11, 0.30 | 3×4-6 | - | 20 | 138 | 206 |
| 43 | N | G2+2 (10) | 4 | 5-6 | 1-3 | 11, 0.30 | 3×4-6 | 1 | 20 | 138 | 206 |
| 44 | N | G2+2 (10) | 4 | 5-6 | 1-3 | 11, 0.30 | 3×4-6 | - | 20 | 138 | 206 |
| 45 | H | G2+2 (10) | 4 | 6 | 1-3 | 11, 0.30 | - | - | 20 | 147 | 220 |
| 46 | N | G2+2 (10) | 4 | 5-6 | 1-3 | 11, 0.30 | 3×4-6 | - | 20 | 138 | 206 |
| 47 | N | G2+2 (10) | 4 | 5-6 | 1-3 | 11, 0.30 | 3×4-6 | - | 20 | 138 | 206 |
| 48 | N | G2+2 (10) | 4 | 5-6 | 1-3 | 11, 0.30 | 3×4-6 | 1 | 20 | 138 | 206 |
| 49 | N | G2+2 (10) | 4 | 5-6 | 1-3 | 11, 0.30 | 3×4-6 | - | 20 | 138 | 206 |
| 50 | VH | G2+2 (10) | 3 | 6 | 1-3 | 11, 0.30 | - | 1 | 20 | 150 | 225 |
| 51 | Br | G2+2 (10) | 4 | 4-5 | 1-3 | 11, 0.40 | - | - | 20 | 117 | 175 |
| 52 | N | G2+2 (10) | 4 | 5-6 | 1-3 | 11, 0.40 | 3×4-6 | - | 20 | 138 | 206 |
| 53 | N | G2+2 (10) | 4 | 5-6 | 1-3 | 11, 0.40 | 3×4-6 | 1 | 20 | 138 | 206 |
| 54 | N | G2+2 (10) | 4 | 5-6 | 1-3 | 11, 0.40 | 3×4-6 | - | 20 | 138 | 206 |
| 55 | H | G2+2 (10) | 4 | 6 | 1-3 | 11, 0.40 | - | - | 20 | 147 | 220 |
| 56 | N | G2+2 (10) | 4 | 5-6 | 1-3 | 11, 0.40 | 3×4-6 | - | 20 | 138 | 206 |
| 57 | N | G2+2 (10) | 4 | 5-6 | 1-3 | 11, 0.40 | 3×4-6 | - | 20 | 138 | 206 |
| 58 | N | G2+2 (10) | 4 | 5-6 | 1-3 | 11, 0.40 | 3×4-6 | 1 | 20 | 138 | 206 |
| 59 | N | G2+2 (10) | 4 | 5-6 | 1-3 | 11, 0.40 | 3×4-6 | - | 20 | 138 | 206 |
| 60 | VH | G2+2 (10) | 3 | 6 | 1-3 | 11, 0.40 | - | 1 | 20 | 150 | 225 |

Relaxed notes: L13-15 use standing loops of 6 cells per side (all visible, Theorem 1 needs `N <= Vis` when speed is 0);
L13 introduces loops alone (no lock); L16 introduces the bunny alone. Layers 4-6 always hold 1-2 items.

### 4.4 Timed branch, L1-60

Time≈ uses the formula below with `|W| ≈ 1.3 × items`; the build writes the real `timeS` from the certified witness.
H-strip: 8 cells, opens after 40% of the level's matches.

```
timeS(L) = clamp( ceil5( τ(L)·|W| + Σ_takes (N_loop - 6)/speed_loop + 20 ), Tmin(L), 480 )
τ(L)     = max(1.8, 3.4 - 0.03·(L - 1))          seconds per witness move (3.4 at L1, 1.8 from L55)
Tmin(L)  = 150 for L <= 10, else 120
```
| L | Tag | Shape (C) | F0 | Depth | Back | Side N/side, v | H-strip | Locks | Bunny | Types | Items≈ | Time≈ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Tut | G3x3 (9) | 6 | 1 | - | - | - | - | - | 7 | 21 | 2:30 |
| 2 | N | G3x4 (12) | 5 | 1-2 | 1-2 | - | - | - | - | 13 | 39 | 3:15 |
| 3 | N | G3x4 (12) | 5 | 1-2 | 1-2 | - | - | - | - | 13 | 39 | 3:15 |
| 4 | N | G3x4 (12) | 5 | 1-2 | 1-2 | - | - | - | - | 13 | 39 | 3:10 |
| 5 | H | G3x4 (12) | 5 | 2 | 1-2 | - | - | - | - | 14 | 48 | 3:45 |
| 6 | N | G3x4 (12) | 5 | 1-2 | 1-2 | - | - | - | - | 13 | 39 | 3:10 |
| 7 | N | G3x4 (12) | 5 | 1-2 | 1-2 | - | - | - | - | 13 | 39 | 3:05 |
| 8 | N | G3x4 (12) | 5 | 1-2 | 1-2 | - | - | - | - | 13 | 39 | 3:05 |
| 9 | N | G3x4 (12) | 5 | 1-2 | 1-2 | - | - | - | - | 13 | 39 | 3:05 |
| 10 | VH | G2+2 (10) | 6 | 2-3 | 1-2 | 8, 0.39 | - | - | - | 14 | 63 | 6:00 |
| 11 | Br | G2+2 (10) | 6 | 1 | 1-3 | 8, 0.25 | - | - | - | 13 | 39 | 5:10 |
| 12 | N | G2+2 (10) | 5 | 1-2 | 1-3 | 8, 0.33 | - | 1×3 | - | 16 | 51 | 5:20 |
| 13 | N | G2+2 (10) | 5 | 1-2 | 1-3 | 8, 0.34 | - | 1×3 | - | 16 | 51 | 5:15 |
| 14 | N | G2+2 (10) | 5 | 1-2 | 1-3 | 8, 0.36 | - | 1×3 | 1 | 16 | 51 | 5:10 |
| 15 | H | G2+2 (10) | 5 | 2 | 1-3 | 8, 0.43 | - | - | - | 16 | 60 | 5:30 |
| 16 | N | G2+2 (10) | 5 | 2-3 | 1-3 | 8, 0.39 | - | 1×3 | - | 16 | 72 | 6:20 |
| 17 | N | G2+2 (10) | 5 | 2-3 | 1-3 | 8, 0.40 | - | 1×3 | - | 16 | 72 | 6:15 |
| 18 | N | G2+2 (10) | 5 | 2-3 | 1-3 | 8, 0.42 | - | 1×3 | 1 | 16 | 72 | 6:10 |
| 19 | N | G2+2 (10) | 5 | 2-3 | 1-3 | 8, 0.43 | - | 1×3 | - | 16 | 72 | 6:05 |
| 20 | VH | G2+2 (10) | 5 | 3-4 | 1-3 | 8, 0.58 | - | - | - | 16 | 90 | 6:50 |
| 21 | Br | G2+2 (10) | 5 | 1-2 | 1-3 | 8, 0.37 | - | - | - | 17 | 51 | 4:55 |
| 22 | N | G2+2 (10) | 5 | 2-3 | 1-3 | 8, 0.48 | - | 1×3 | - | 18 | 72 | 5:50 |
| 23 | N | G2+2 (10) | 5 | 2-3 | 1-3 | 8, 0.49 | - | 1×3 | 1 | 18 | 72 | 5:45 |
| 24 | N | G2+2 (10) | 5 | 2-3 | 1-3 | 8, 0.51 | - | 1×3 | - | 18 | 72 | 5:40 |
| 25 | H | G2+2 (10) | 5 | 3 | 1-3 | 8, 0.60 | - | - | - | 18 | 81 | 5:55 |
| 26 | N | G2+2 (10) | 5 | 2-3 | 1-3 | 8, 0.54 | - | 1×4 | - | 18 | 72 | 5:30 |
| 27 | N | G2+2 (10) | 5 | 2-3 | 1-3 | 8, 0.55 | - | 1×4 | - | 18 | 72 | 5:25 |
| 28 | N | G2+2 (10) | 5 | 2-3 | 1-3 | 8, 0.57 | - | 1×4 | 1 | 18 | 72 | 5:20 |
| 29 | N | G2+2 (10) | 5 | 2-3 | 1-3 | 8, 0.58 | - | 1×4 | - | 18 | 72 | 5:20 |
| 30 | VH | G2+2 (10) | 5 | 3-4 | 1-3 | 9, 0.78 | 8 @40% | - | 1 | 18 | 102 | 7:40 |
| 31 | Br | G2+2 (10) | 4 | 1-2 | 1-3 | 9, 0.49 | - | - | - | 18 | 54 | 5:05 |
| 32 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 9, 0.63 | - | 1×4 | - | 18 | 75 | 5:50 |
| 33 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 9, 0.65 | - | 1×4 | 1 | 18 | 75 | 5:45 |
| 34 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 9, 0.66 | - | 1×4 | - | 18 | 75 | 5:40 |
| 35 | H | G2+2 (10) | 4 | 3 | 1-3 | 9, 0.78 | - | - | - | 18 | 84 | 5:50 |
| 36 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 9, 0.69 | - | 1×4 | - | 18 | 75 | 5:30 |
| 37 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 9, 0.70 | - | 1×4 | - | 18 | 75 | 5:25 |
| 38 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 9, 0.72 | - | 1×4 | 1 | 18 | 75 | 5:20 |
| 39 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 9, 0.73 | - | 1×4 | - | 18 | 75 | 5:15 |
| 40 | VH | G2+2 (10) | 4 | 3-4 | 1-3 | 9, 0.98 | 8 @40% | - | 1 | 18 | 102 | 6:40 |
| 41 | Br | G2+2 (10) | 4 | 1-2 | 1-3 | 9, 0.61 | - | - | - | 18 | 54 | 4:25 |
| 42 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 9, 0.78 | - | 2×4 | - | 18 | 75 | 5:05 |
| 43 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 9, 0.79 | - | 2×4 | 1 | 18 | 75 | 5:00 |
| 44 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 9, 0.81 | - | 2×4 | - | 18 | 75 | 4:55 |
| 45 | H | G2+2 (10) | 4 | 3 | 1-3 | 9, 0.95 | 8 @40% | - | - | 18 | 93 | 5:55 |
| 46 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 9, 0.84 | - | 2×4 | - | 18 | 75 | 4:50 |
| 47 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 9, 0.85 | - | 2×4 | - | 18 | 75 | 4:45 |
| 48 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 9, 0.87 | - | 2×4 | 1 | 18 | 75 | 4:40 |
| 49 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 9, 0.89 | - | 2×4 | - | 18 | 75 | 4:35 |
| 50 | VH | G2+2 (10) | 4 | 3-4 | 1-3 | 10, 1.17 | 8 @40% | - | 1 | 18 | 105 | 6:25 |
| 51 | Br | G2+2 (10) | 4 | 1-2 | 1-3 | 10, 0.73 | - | - | - | 18 | 57 | 4:30 |
| 52 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 10, 0.93 | - | 2×4 | - | 18 | 75 | 4:50 |
| 53 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 10, 0.95 | - | 2×4 | 1 | 18 | 75 | 4:45 |
| 54 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 10, 0.96 | - | 2×4 | - | 18 | 75 | 4:45 |
| 55 | H | G2+2 (10) | 4 | 3 | 1-3 | 10, 1.12 | 8 @40% | - | - | 18 | 93 | 5:40 |
| 56 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 10, 0.99 | - | 2×4 | - | 18 | 75 | 4:40 |
| 57 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 10, 1.00 | - | 2×4 | - | 18 | 75 | 4:40 |
| 58 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 10, 1.02 | - | 2×4 | 1 | 18 | 75 | 4:35 |
| 59 | N | G2+2 (10) | 4 | 2-3 | 1-3 | 10, 1.03 | - | 2×4 | - | 18 | 75 | 4:35 |
| 60 | VH | G2+2 (10) | 4 | 3-4 | 1-3 | 10, 1.37 | 8 @40% | - | 1 | 18 | 105 | 5:50 |

Timed notes: boards stay at 55-105 items while τ falls and loops speed up, so Normal levels fall from about 6:00
(L19) to 4:35 (L59) and VeryHard levels sit at 5:50-7:40; the owner's Lv.513 example (about 6 min) is in range.
Faster loops shorten the wait term, which is the owner's point that "faster rotation brings products around sooner".

### 4.5 Beyond L60 (formulas; baked to L150, generated on device after)

`band = floor((L-1)/10)`, idx as above. Breather = previous band's Normal minus one layer; Hard = all compartments at
max depth, no locks; VeryHard = Hard + back sizes 2-3 for layers 2-3 (relaxed) or + H-strip and speed ×1.3 (timed).

| Knob | Relaxed, L ≥ 61 | Timed, L ≥ 61 |
|---|---|---|
| Shape | G2+2 (10) | G2+2 (10) |
| Depth | 5-6 Normal, 6 Hard/VH | 2-3 Normal, 3 Hard, 3-4 VH |
| F0 | 3 (VH 3, breather 4) | 4 |
| Locks | 3 × N, N = min(6, 4 + floor((L-61)/40)) | 2 × 4 |
| Loops | 2 × 11 cells, speed min(0.5, 0.4 + 0.002·(L-60)) | 2 × min(12, 10 + floor((L-60)/50)) cells, speed min(1.5, 1.2 + 0.003·(L-60)) |
| H-strip | none | every level, opensAfter 40% (VH: 25%) |
| Types | min(24, 20 + floor((L-61)/30)) | 18 |
| Bunny | 1 when idx ∈ {2,7}; VH 2 from L60 | 1 when idx ∈ {2,7} |
| τ / time | - | τ = 1.8, timeS formula, so the clock tightens only through faster loops; floor 120 s |
| Window | L61-150 row of 3.6 | same |

Plateau by design: past about L150 the difficulty is a stable saw-tooth at the caps. Infinite novelty comes from new
seeds and the product skin (per-level seeded pick of products from the 180-item catalogue, `skin-<branch>-<n>`),
not from ever-growing boards, which would exceed the phone screen and the mother's patience.

### 4.6 Level identity

Board structure = f(branch, n, GEN_VERSION) only (the current `'run-'+seed+...` seed in `states.js` goes). Retry and
replay show the identical board in both branches [lens: the brief re-rolled timed retries; a certificate is per
layout, and like-for-like retries make per-level bests meaningful]. Product skins are part of the identity.

---

## 5. Scoring and highscore

### 5.1 Timed ("Gegen die Zeit")

- Match = `100 × min(4, 1 + 0.5·(chain - 1))`; chain +1 per match within 5 s of the previous one (`COMBO_WINDOW_MS`
  5000); the bar drains while playing, pauses with the game, not with Freeze.
- Bunny = +300 flat (not chained). Swept items score 0. Hammer triple scores 0, counts for locks.
- Clear = +250; time bonus = `5 × floor(secondsLeft)`; Flawless (+250) = no undo, hammer, shuffle, freeze, extension.
- Stars per level: `f = secondsLeft / timeS`; ≥ 0.40 → 3, ≥ 0.20 → 2, else 1 (the original: floor(timeLeft/10)
  [wiki: GameplayMechanics]; a ratio stays fair across limits).
- **Run** = from L1 upward; level scores add up. First timeout in a level: card "Zeit abgelaufen" with "+30 s" (free,
  once per level; sets that level's time bonus and Flawless to 0) or "Lauf beenden". Second timeout ends the run.
  Out of space does not end the run (undo is always there); "Lauf beenden" does.
- **Recorded** when the run ends (second timeout, "Lauf beenden", or "Neuer Lauf" over an existing run): top 10
  `{score, level, date}`, plus bestLevel, bestChain, games. Continue after reload restores the run (snapshot every move).

### 5.2 Relaxed ("Entspannt")

- Combo: chain +1 per match; `comboMovesLeft = 3` refills per match, -1 per move without a match; 0 resets. Shown as
  "Kombo xN" with three pips; feedback only, not scored (no clock in relaxed).
- Level score = `round(1000 × min(1, par / moves))` where moves count centre moves, takes and bunny taps; hammer +3.
- Stars: moves ≤ par → 3, ≤ ceil(1.5·par) → 2, else 1. Flawless badge = no undo/hammer/shuffle/hint.
- Records per level `{best, stars, moves, flawless}`; headline Σ best, ★ total, highest level reached. Top-10 list for
  relaxed = the 10 best single-level scores relative to level (`best × (1 + n/100)`), so late levels rank higher
  [lens: gives the relaxed branch a real top list as the owner asked for highscores in both options].
- Retry = same board; only the best attempt counts. Out of space never fails a level.

---

## 6. Boosters and helpers (no ads, no economy)

| Helper | Branch | Unlock | Charges per level | Effect (layers, loops) | Score |
|---|---|---|---|---|---|
| Rückgängig | both | L1 | unlimited | 1.9 | none; removes Flawless |
| Hammer | both | L2 | 1, +1 at chain 5 (once per level) | tap a front item of type T: removes T and 2 more copies: other fronts first, then **visible loop products** (cell barred), then back layers shallowest first (holes), then locked comps; reveal; sweep | 0; counts as a match for locks; relaxed +3 moves |
| Mischen | both | L4 | 1 | permutes types among occupied front slots of unlocked centre comps; loops, back layers, locks untouched; accepts the first of 20 seeded permutations with no front triple, R14 true and a certificate found in 5k nodes; else refund | 0 |
| Einfrieren | timed | L6 | 1 | stops clock **and loops** for 15 s (Falcon's value [wiki: PowerUps]) | removes Flawless |
| Tipp | relaxed | L6 | 3 | runs `solveP(current, 5000 nodes)`; highlights the first move of the found line; "Kein Weg gefunden: Rückgängig oder Neustart" keeps the charge | removes Flawless |
| Goldhase | both | level data | per level | 1.6 | timed +300 |

- Every level is certified **without** boosters and **with** its bunnies (bunnies are part of the board, not a kit item).
- Magic Wand, pre-level boosters, coins and lives are out (brief B7).
- Hint uses the live state, not the stored witness (the witness is only valid from the start).

---

## 7. UI/UX for the owner's mother

### 7.1 Screens and flow
Title (Weiter / Entspannt / Gegen die Zeit / Bestenliste / Einstellungen) → level intro card for new mechanics →
PLAY ⇄ PAUSE → clear card (stars, points or moves vs par, "Weiter") → next level. Timed timeout card, out-of-space
sheet or banner, run-over card with top-10 rank.

### 7.2 HUD (top band, as in the original)
`Lv. 23` pill · bunny counter · timer pill (timed; amber ≤ 30 s, red pulse ≤ 10 s) or "Züge 31 / 40" (relaxed) ·
score with star · pause. Under it "Kombo xN" bar (timed) or 3 pips (relaxed). Items left "54 übrig" on the pause card.
Bottom bar: Rückgängig, Hammer, Mischen, Einfrieren/Tipp with charge badges; locked slots show "Lv. N".

### 7.3 Drawing in the DOM (one `<img>` per product)
- **Dark next layer:** per compartment one `.back` group (scale 0.9, raised 6%) behind one darkening div
  `rgba(40,25,15,0.5)`; no per-item filters. Pips for deeper layers: up to 4 dots on the plank edge, "+" beyond.
- **Lock:** two chain SVGs crossed + round badge with the remaining count; chains fall 250 ms at unlock.
- **Loops:** a clipped column `div.loop` with `overflow:hidden`; inside, one strip element translated by
  `translate3d(0, -phase·cellH, 0)`; cells are absolutely positioned at `k·cellH`; `N + 1` cell elements so the wrap is
  seamless (the cell crossing the top is re-positioned at `N·cellH` on `loopWrap`). One transform per loop per
  frame, never per product. Barred cell: a bars SVG slides down 200 ms and stays.
- **H-strip:** the same with `translateX`, slides in from the right on `loopOpen`.
- **Bunny:** golden sprite + a slow sparkle (CSS opacity loop, off in reduced motion) when it is tappable.

### 7.4 Input with moving targets
- Take: pointer-down on a loop cell grabs its product immediately (the product leaves the strip into the drag layer, so
  it no longer moves); release on a compartment = take; release elsewhere = the product flies back into its cell
  (which has moved on). Hit-testing of loop cells uses the current phase at pointer-down.
- Tap-tap: tap a loop product (it lifts out of the strip and waits above it, the cell stays reserved), then tap a
  compartment. A second tap on the product cancels.
- Loop cells < 50% visible are not grabbable (R1). Grab radius = the full cell (≥ 56 × 56 CSS px).
- Timed hard levels: while a finger is down on a loop, that loop slows to 50% (assist; the model's phase still uses
  the configured speed after release; the slowdown is a view-only lag that catches up within 400 ms) **[open: drop if
  it feels odd]**. Not in the model, so the proof is unaffected.

### 7.5 Feedback and accessibility
Juice list of the brief 6.5 (transform/opacity only). German strings: "Dahinter wartet mehr", "Fach gesperrt: öffnet
nach N Treffern", "Aus dem Seitenregal nehmen: es geht nicht zurück!", "Goldhase: tippen räumt das Fach frei",
"Aufgeräumt!", "Kein Platz mehr", "Zeit abgelaufen". Settings: Bewegung reduzieren (loops still move but without
easing, sparkles off), große Produkte, Ton aus. Targets ≥ 44 px. Undo always one tap away.

### 7.6 Onboarding (one card + one guided move each, stored in `seenTips`)

| Mechanic | Relaxed | Timed | Guided move |
|---|---|---|---|
| Sorting | L1 | L1 | drag the third bottle onto the pair |
| Dark layer | L2 | L2 | empty a 1-item front to reveal |
| Lock | L8 | L12 | counter ticks down on the next match |
| Loop (take-only, bars) | L13 (standing) | L10 | take the twin from the side, watch the bars drop |
| Moving loop | L16 notice | (L10 already moves at 0.30) | - |
| Bunny | L16 | L14 | tap the bunny |
| H-strip | - | L30 | strip slides in, card "Noch mehr Bewegung!" |

---

## 8. Engineering plan on the existing code

### 8.1 Data model changes
- `board.js` (P, ≤ 420 lines): comps get `layers`, `ptr`, `lock`; fronts stay `slots` (item ids) so the view code keeps
  working; new `reveal(b, ci)`, `unlockAll(b, m)`, `sweep(b)`, `progressPossible(b)` (R14), `typeCounts`, snapshot/restore
  with layers, holes, loops, barred, dead. `legalMoves` adds takes and bunny taps.
- `loops.js` (P, NEW, ≤ 200): loop state, `phaseAt`, `visibleCells(loop, vis)`, `take(b, loop, cell)`, bar, open.
- `game.js` (P, ≤ 380): `takeItem`, `tapBunny`, `useBooster`, `undo`; tick order 2.2; events 2.3.
- `boosters.js` (P, NEW, ≤ 300): undo stack, hammer, shuffle, freeze, hint.
- `solver.js` (P, rewrite inside the file, ≤ 420): `solveP` with node budget, Zobrist keys, `verify`, `playout`, metrics.
- `levels.js` (P, ≤ 400): decode baked strings, `knobs(branch, n)`, `bandedDeal`, `generate`, resumable `genJob/genStep`,
  `transform`, skins.
- `levels-data.js` (P, generated, exempt from the line cap; it is data).
- `score.js`, `save.js` (P): 5.x; save schema v3.

### 8.2 View
- `ui/board.js` splits: `ui/board.js` (geometry, compartments, items, ≤ 420), `ui/drag.js` (pointer, tap-tap, moving
  targets, ≤ 300), `ui/loops.js` (strip elements, wrap, bars, ≤ 250), `ui/layers.js` (dark layer, pips, chains, ≤ 200).
- Geometry for G2+2: side loop columns 18% of board width each, centre 64%; compartment width from the centre width;
  layout guarantees `Vis >= 6` loop cells (cell height = item height + plank) or shrinks items to 52 px minimum.

### 8.3 Render loop policy and performance budget
- rAF runs while: timed PLAY, any loop with speed > 0, an animation, the combo bar. Relaxed with standing loops idles.
- Per frame: ≤ 3 loop transforms, timer text only when the second changes, combo bar `scaleX`. Budget ≤ 2 ms JS on an
  iPhone 12; 60 fps target, 30 fps acceptable under "lowGfx".
- Generation job: ≤ 4 ms slices every 50 ms (3.7). Witness verification on load: ≤ 1 ms.

### 8.4 Tests to add

| Test | What |
|---|---|
| board.test.js | reveal with holes; lock opening; sweep; R14 vs exhaustive BFS on 2000 small states with loops and bunnies (0 disagreements) |
| loops.test.js | phase wrap, visibility, take bars a cell, undo un-bars it |
| solver.test.js | witness of a known level; `verify` rejects a tampered witness; node-budget determinism (same result twice) |
| levels.test.js | sha256 pin of levels-data.js; invariants of all 300 baked levels; **replay all 300 certificates** (< 1 s); tail levels 151-170 per branch generate identically twice and replay; fallback path works |
| proof run (`npm run proof`, CI, not in `npm test`) | tail 151-1150 per branch: certificate rate, fallback rate (< 2%), nodes p50/p90/max, ms; writes `docs/preview/proof.txt` |
| boosters.test.js, score.test.js, save.test.js | brief 7.2 list + v2→v3 migration |
| browser run.js | G2+2 board with loops: a real take via drag on a moving cell, bars visible, bunny tap, layer reveal, timeout card, stuck sheet; screenshots |
| browser soak.js | 20 min of bot play on a timed L60-like board: no growth in DOM nodes, frame p95 < 16 ms |

### 8.5 Migration
`RULES_VERSION` 1 → 2: a stored run with rulesVersion 1 is discarded with a toast "Neue Regeln: Lauf neu gestartet";
its score is first recorded into the timed top list if > 0. Save `v` 2 → 3 keeps settings and timed top lists, maps
relaxed `bestLevel` to `reached`.

---

## 9. Test and tuning plan

### 9.1 Bots
- **Certifier** (DFS): proof only.
- **Casual bot** (noisy greedy, no lookahead, sees fronts, dark layer and loops, 3.0 s/move in timed, waits for hidden
  loop cells): agentWin and simulated time left.
- **Careful bot** (greedy + 2-ply lookahead + undo on stuck, up to 20 undos): models the mother with undo.

### 9.2 Acceptance thresholds (build fails otherwise)
- 100% of baked levels: certificate replays; invariants hold.
- Careful bot wins ≥ 95% of relaxed L1-60 and ≥ 85% of relaxed L61-150 within 3× par moves.
- Timed: casual bot at τ(L) finishes with ≥ 25% time left on ≥ 80% of Normal levels; VH may drop to 60%.
- Tail proof run: fallback < 2%, device node p90 < 120k per level (≈ 1 s at the 8 µs target).
- No level with deadRate > 30% outside VH.

### 9.3 iPhone playtest checklist (owner and mother)
1. Can she grab a moving product on the first try at L10 (timed) / L16 (relaxed)? Count misses in 10 tries.
2. Does she understand the bars without the card? Does she understand "take-only" before running out of space?
3. Is the dark layer readable on her phone brightness? Are pips noticed?
4. Bunny: does she tap it unprompted after L16?
5. Timed L10-20: time left at clear (log it; target 35-50%). Adjust only τ(L).
6. Relaxed L20-40: any level abandoned? Log moves, undos, restarts per level (debug export).
7. Thermal: 20 min on timed with loops, phone warm? Frame drops?
8. Interruptions: lock screen mid-level, phone call, reload: same board, clock paused.

---

## 10. Open questions for the owner

1. **Side cells with a product behind?** Your Lv.513 screenshots show dark products behind many side products. Our
   default follows your description: one product per side cell, bars after it is taken. Should a side cell instead
   hold 2 (front + one dark behind) and close only when empty, like the original's "CloseCellEnd"? The model already
   supports it (`cells` become stacks).
2. **Bunny trigger:** tap to trigger (default, lets her choose the moment) or automatic as soon as it reaches the front?
3. **Relaxed loops:** standing for the first three loop levels, then slow (0.2-0.4 cells/s). Or always standing in
   Entspannt?
4. **Horizontal strip in timed:** from L30 on VeryHard levels, every level from L61 (default). Earlier or later?
5. **Retry in timed after a timeout:** default ends the run after the free +30 s. Or "Level wiederholen" with the run
   score at level start (weaker highscore, kinder)?
