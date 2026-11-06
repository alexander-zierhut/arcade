# Plate Loop: module contract (what every file exports)

The plan (`../../docs/plans/plate-loop.md`, rules R1-R28, sections 5-7) says *what*; this page fixes the *shape*,
so that engine, solver, renderer, UI and tests can be written in parallel and fit on the first merge. Agents:
implement exactly these names and signatures; if something is missing or wrong, say so in your report instead of
inventing a different shape. Decisions on the plan's open questions: the belt direction is per level
(`dir: 'cw' | 'ccw'`); a how-to card shows at the first contact with each mechanic; N is never below 4.

## 0. Module pattern (every `src/**/*.js`)

Plain ES5 (var, function, no arrow functions, no classes, no template strings, no let/const), no build step, one
global. Each file:

```js
// src/engine/rules.js: <one line what it holds>
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};
  var model = PL.model || (typeof require === 'function' ? require('./model.js') : null);   // deps, same folder style
  // ... code ...
  PL.rules = { canEject: canEject, /* ... */ };
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.rules;
})(typeof window !== 'undefined' ? window : globalThis);
```

A file that depends on another file in another folder requires it by relative path (`require('../engine/rules.js')`).
In the browser the `<script>` order resolves it (index.html loads `src/config.js`, `engine/*`, `gen/*`, `levels/*`,
`render/*`, `ui/*`, `audio/*`, `main.js`, in the order listed in the plan's section 6). Engine, gen and levels files
never touch `document`, `window.Arcade` or timers; render, ui, audio and main do.

Node tests: `tests/*.test.js`, run by `node --test "tests/*.test.js"` (`npm test`), using `node:test` and
`node:assert/strict`. `tests/helpers.js` holds shared fixtures (see section 9).

## 1. `src/config.js` → `PL.config`

```js
PL.config = {
  STORAGE_KEY: 'plateLoop.',        // every localStorage key starts with this (Arcade.storage adds it)
  VERSION: '0.1.0',
  LAP_MS: 8000,                     // one lap of the belt (R25)
  SLIDE_MS: 250,                    // eject / land slide (R26, R27)
  MIN_N: 4, MAX_N: 10,
  KIND_NAMES: ['salmon','tuna','tamago','ebi','unagi','ikura','kappa','tekka','california','inari','tako','uni'],
  KIND_COLOURS: ['#F28C6B', '#C8102E', '#FFD23F', '#FF69B4', '#7B4B2A', '#FF8C00', '#2E7D32', '#6A1B9A', '#26A5C9', '#3F51B5', '#D8A7D0', '#8BC34A'],   // the PLATE colours (hue-spread), not the food's
  TIERS: { easy: {...}, normal: {...}, hard: {...}, extreme: {...} }   // the bands of plan 5.4 (N, kinds, boxes, emptyBoxes, hidden, mods ranges)
};
```

## 2. Level format (data) → parsed by `PL.model`

A level, as stored in `src/levels/levels-001-100.js` and as produced by the generator:

```js
{ id: 17, tier: 'normal', seed: 981233, layout: 'ring-2col', dir: 'cw', N: 6, kinds: 9,
  boxes: [
    { id: 'L1', pieces: [3, 'h:5', 'h:5', 1] },               // back → front (index 0 = back, last = front)
    { id: 'L2', pieces: [['p', 2, 7], 0, 4] },                // ['p', a, b] = bound pair; a is behind b
    { id: 'R2', pieces: [1, 1], mods: { lock: 'A' } },        // under shutter A
    { id: 'R3', pieces: [1, 'k:A:6', 6, 6] },                 // 'k:A:6' = a piece of kind 6 carrying key A
    { id: 'R7', pieces: [], mods: { oneway: true } },
    { id: 'T2', pieces: [5, 5], mods: { wrap: 4 } },          // wrapped with kind 4
    { id: 'T4', pieces: [8, 8, 8], mods: { ice: true } } ] }
```

Piece sugar: an integer `k`; `'h:k'` hidden piece of kind k; `'k:ID:k'` key ID on a piece of kind k;
`'hk:ID:k'` hidden piece with a key; `['p', x, y]` a bound pair whose two entries are each one of the previous
forms (no nested pairs). `mods` keys: `lock` (string id), `oneway` (true), `wrap` (kind), `ice` (true). Box ids
are slot ids of the layout (section 7). Kinds are `0..kinds-1`.

## 3. `src/engine/model.js` → `PL.model`

```js
model.parse(level)            // → state (below); throws Error('level: <reason>') on malformed data
model.validate(level)         // → [] or ['R3: kind 2 has 5 pieces', ...]  (R3, R15 front visible, R21 combos,
                              //   ids exist in the layout, N in range, lock ids have exactly one key, ...)
model.clone(state)            // deep copy (pieces are objects; copy them)
model.hash(state)             // canonical string for memoisation (boxes in order, pieces, mods, belt multiset, pouring)
model.permutation(levelId, attempt)   // → array mapping kind index → sprite index (R23), seeded, bijective
model.pieceId                 // every piece gets a unique integer id at parse time (for the renderer's animations)
```

The **state**:

```js
{
  level: <the level object>, N: 6, dir: 'cw', kinds: 9,
  boxes: [ {                 // same order as level.boxes
    id: 'L1', index: 0,
    pieces: [ { id: 12, k: 3, hidden: false, key: null, pair: null } , ... ],   // back → front; pair: a pair id (int) shared by its two pieces, else null
    closed: false, wrap: null | kind, ice: false, lock: null | 'A', oneway: false,
    outbox: [],               // pieces that left at a tap and wait for plates (front piece first); plates take them at crossings
    pending: 0                // always outbox.length (derived; rules.syncPending), used for reservations
  } ],
  locks: { A: { boxes: ['R2'], open: false } },
  belt: [ null, { id: 7, k: 2, key: null, from: 1 }, ... ],   // length N, plate index → piece or null
  pouring: { 2: 4 },         // kind → box index currently pouring that kind (R9); absent when none
  closedKinds: [],           // kinds whose box has closed (for R4 and R17)
  events: []                 // not stored; functions return events instead
}
```

Hidden pieces keep their `k` in the state (the solver and the renderer in no-luck mode read it); `hidden` is only
a flag, cleared on reveal (R15).

## 4. `src/engine/rules.js` → `PL.rules` (pure, mutate the given state, return events)

An **event** is `{ type, ... }`, types: `eject { box, plate, piece }`, `land { box, plate, piece }`,
`tapped { box, k, pieces }`, `close { box, kind }`, `reveal { box, piece }`, `unlock { lock, boxes }`, `unwrap { box }`, `thaw { box }`,
`refuse { box, reason }`, `won {}`, `lost {}`.

```js
rules.front(box)                       // → the front piece or null
rules.unit(box)                        // → { size: 1|2, pieces: [front, (pairMate)] } the next ejectable unit (R16) or null
rules.runLength(box)                   // → number of VISIBLE pieces of the front's kind that leave on one tap (a hidden piece ends the run; pair rules of R16)
rules.freePlates(state)                // → empty plates not reserved by pending ejections (R5)
rules.canEject(state, boxIndex)        // → { ok: true, k } | { ok: false, reason: 'closed'|'empty'|'covered'|'oneway'|'full'|'pending'|'pair' }
                                       //   k = min(runLength, freePlates) but a pair needs 2 (R16); 'pair' = only 1 plate free and the unit is a pair
rules.ejectUnit(state, boxIndex, plates)   // moves the next unit onto plates (array of 1 or 2 plate indices); → events [eject(, eject), reveal?, unlock?]
rules.accepts(state, boxIndex, kind)   // R8 only (open, not covered, empty or front kind == kind and < 4); ignores R9
rules.tryLand(state, plateIndex, boxIndex)   // the plate passes this mouth: R8 + R9 + R10 → events [land, close?, unwrap*, thaw*, unlock?, reveal?] or [] when it rides on
rules.tap(state, boxIndex)             // the tap: moves the k pieces canEject allows into box.outbox at once, reveals / unlocks
                                       //   the new front (R7 at tap time); → { ok, k, events: [tapped, reveal*, unlock*] } | { ok: false, reason }
rules.wouldLand(state, plate, box)     // the single landing predicate (R8, R9 conditional on completability, R10b); tryLand and isStuck use it
rules.inTransit(state, kind)           // pieces of the kind on plates + in outboxes (the completion count of R9 / R10b)
rules.isWon(state)                     // R4
rules.isStuck(state)                   // R13: every plate full and no plate's piece has an accepting box (R8 ∧ R9 aware, any lap)
rules.endPouring(state, kind)          // R9 helper (tap / close / belt empty)
```

Exact R9 inside `tryLand`: let `p = state.pouring[kind]`. If `p` is defined and `p !== boxIndex` and box `p` still
`accepts(kind)` → ride on. Otherwise land if `accepts`. After a landing of kind c into box b: if any piece of kind c
remains on the belt, `pouring[c] = b`, else delete `pouring[c]`. On `close` delete `pouring[kind]`. On a tap of box
b delete every `pouring[c] === b`. Re-entry into the source box is allowed (R10).

Modifier triggers (all inside `tryLand` / `ejectUnit`): `close` → `closedKinds.push(kind)`; every box with
`wrap === kind` → `wrap = null`, event `unwrap`; every box with `ice` that is a layout neighbour of the closed box →
`ice = false`, event `thaw`. Reveal: after a unit leaves, if the new front is hidden → `hidden = false`, event
`reveal`; if the new front (or a front at parse time) carries a key whose lock is closed → lock `open = true`, every
box of the lock `lock = null`, event `unlock`, and the piece's `key` stays as a mark (renderer shows it flying).
Keys are released at parse time too when the front piece carries one (R19); `model.parse` returns the state with
`unlock` already applied and records it in `state.initialEvents`.

## 5. `src/engine/belt.js` → `PL.belt` (geometry only, no state of pieces)

```js
belt.create({ N, perimeter, dir, mouths })   // mouths: [{ box: boxIndex, s: arcLength }] from the layout (section 7)
  → { N, perimeter, spacing, dir, mouths (sorted by s), phase: 0 }
belt.platePos(b, i)            // → arc length of plate i's centre: (phase + i*spacing) mod perimeter, direction-aware
belt.advance(b, ds)            // moves the belt by ds (> 0, in arc units, ds < spacing) and returns the crossings that
                               //   happened in time order: [{ plate, mouth (index into b.mouths), box }]
belt.nextFree(b, mouthIndex, isFree)   // → the plate index that will reach this mouth next (R26: a plate within
                               //   spacing/2 *before* the mouth counts as reaching now) for which isFree(plate) is true, or -1
belt.timeToMouth(b, plate, mouthIndex, speed)   // ms until that plate's centre reaches the mouth (for the renderer / bot)
```

Arc length grows in the belt's travel direction: for `dir: 'ccw'` the layout's path is walked backwards, so
`s` of a mouth is `perimeter - s_cw`. The belt module stores mouths already in travel-direction units.

## 6. `src/engine/sim.js` → `PL.sim` (the real-time driver; deterministic)

```js
sim.create(level, opts)        // opts: { perimeter (from the layout), lapMs = config.LAP_MS, layout (for mouths and neighbours) }
  → s = { state, belt, speed (units/ms), time: 0, status: 'play' | 'won' | 'lost', log: [] }
sim.tap(s, boxIndex)           // → { ok, k, reason } (rules.canEject); on ok reserves k plates: box.pending = k
sim.tick(s, dtMs)              // advances the belt (in sub-steps so no crossing is skipped), for every crossing in order:
                               //   a) if the plate is free and the mouth's box has pending > 0 and rules.canEject still allows the next unit
                               //      (a pair needs the following plate free too): rules.ejectUnit; pending -= size
                               //   b) else if the plate carries a piece: rules.tryLand
                               //   then rules.isWon → status 'won', event won; after a full pass with no landing and all plates full:
                               //   rules.isStuck → status 'lost', event lost (the belt keeps moving, tick keeps working)
                               //   → the events of this tick (each with .time = s.time)
sim.plates(s)                  // → [{ plate, s (arc), piece }] for the renderer
sim.freePlates(s)              // rules.freePlates(s.state)
```

Tap timing rule (R26): `sim.tap` only reserves; the piece leaves at the next crossing of a free plate at that mouth,
and `belt.nextFree` says which one (the renderer may show the piece sliding toward it). A plate freed by a landing
in this crossing is **not** free for an ejection in the same crossing (R27).

Determinism: given the same level, the same sequence of `tick(dt)` and `tap` calls, the event log is identical
(R24). No `Date.now`, no `Math.random` in the engine.

## 7. `src/levels/layouts.js` → `PL.layouts` (no DOM; design units)

Design space: 360 × 634 units (the board of a 360 × 678 phone under a 44 px band). Each template:

```js
PL.layouts['ring-2col'] = {
  name: 'ring-2col',
  path: [ {x, y}, ... ],             // closed polyline of the belt's centreline, walked clockwise; corners are rounded by the renderer with radius `corner`
  corner: 24,
  perimeter: 1680,                   // of the rounded path, precomputed (layouts.measure(path, corner) computes it)
  plate: 40,                         // plate diameter in units
  slots: {                           // every possible box position; a level uses a subset by id
    L1: { x, y, w: 132, h: 44, mouth: 'right', s: 212 },   // box rectangle (x,y top-left), the side that faces the belt, the arc length of its mouth centre on the path
    ...
  },
  neighbours: { L1: ['L2'], L2: ['L1', 'L3'], ... },   // R18
  order: ['L1', ...]                 // drawing order (back to front)
};
PL.layouts.list()                    // → names
PL.layouts.mouths(layout, boxIds, dir)   // → [{ box: index, s }] in travel-direction units for belt.create
PL.layouts.measure(path, corner)     // → perimeter
PL.layouts.pointAt(layout, s)        // → { x, y, angle } on the rounded path at arc length s (cw units); the renderer and the bot use it
```

Templates for the first build: `ring-2col` (belt around the edge, two columns of up to 7 horizontal boxes inside,
mouths outward; 14 slots L1-L7, R1-R7) and `counter` (belt as a wide ring across the middle, up to 5 vertical boxes
above (T1-T5, mouth down), up to 5 below (B1-B5, mouth up), 2 horizontal inside (I1 mouth right, I2 mouth left);
12 slots). Boxes are 4 slots × 29 units + 16 back wall = 132 × 44 (vertical: 44 × 132). Nothing overlaps the belt
(plate radius 20 + 4 units clearance from the centreline).

## 8. `src/gen/*`

```js
rng.create(seed)       // → { next() in [0,1), int(n) in [0,n), pick(arr), shuffle(arr) (in place, returns arr) }  mulberry32
rng.permutation(n, seed)  // → shuffled [0..n-1]

solver.solve(level, opts)   // opts: { maxNodes = 200000, layout }  → { solvable: true, moves: [{ box, dest }], nodes, depth }
                            //   | { solvable: false, nodes } | { unknown: true, nodes }
                            // abstract model of plan 5.2: one run in flight at a time; dest = any accepting box downstream (R8-R10,
                            // including the source box), k = min(run, N); modifier events fire as in rules (reuse PL.rules on a
                            // cloned state: ejectUnit onto virtual plates, then tryLand at dest; the solver never calls sim)
solver.applyMove(state, move, layout)   // → the resulting state (clone) and events; used by tests and the bot

bot.certify(level, moves, opts)   // replays an abstract solution in PL.sim (plan 5.3): for each move taps the source,
                                  // taps every intermediate box the pieces land in until they are in dest (kick), waits until the belt
                                  // is clear; → { won: bool, ticks, taps, reason }
bot.play(level, opts)             // a skill bot for tuning: opts.skill 'perfect' (solve + certify) | 'greedy' | 'sloppy'; → { won, taps, ticks }

generator.generate(opts)          // opts: { tier, seed, layout?, allow?: ['hidden','pair','wrap','ice','lock','oneway'], layoutSlots?,
                                  //   hardness?: [lo, hi], hardest?, candidates? (60), budgetMs?, now?, onCandidate? }
                                  // → { level, solution, metrics, hard?, candidates?, outside? } or null; with `hardness` every certified
                                  //   candidate is analysed and the first inside the window (or the closest when the budget ends) is returned
generator.metrics(level, solution) // → { moves, tightness, forced, emptyBoxes, hiddenShare, mods }
generator.inBand(metrics, tier)   // → bool
generator.hardness(level, layout) // → { H, analysis }  H = -log10(pNatural) of solver.analyze, 0..6 (plan R29)
generator.DIFFICULTY[1..10]       // { tier, H: [lo, hi], budgetMs, noLuck?, hardest? }  the Endless difficulties
generator.encodeCode(d, disabled, seed) / decodeCode(code) / replay(code) / allowOf(disabled) / disabledOf(x)
                                  // level codes  L<d><flags>-<seed>: flags = mechanics switched off (n p w i k o); CODE_VERSION = 1 (the L)
solver.analyze(level, { layout, maxStates = 20000, playouts = 300 })
                                  // → { solvable, depth, states, edges, capped, estimated, pRandom, pNatural, safe, traps }: the whole
                                  //   position graph; pRandom = win chance of a uniformly random mover (box + destination), pNatural = of a
                                  //   random tapper with natural landings; Monte-Carlo (estimated: true) when the graph is capped
PL.search.run(msg, post)          // src/gen/worker.js: 'init' { scripts }, 'search' { tier, seed, allow, hardness, hardest, candidates,
                                  //   budgetMs }, 'replay' { code }; the same file is the Web Worker that main.js starts
```

Reverse play (plan 5.4 step 2), modifier placement (step 3) and the acceptance bands (`config.TIERS`) live in
`generator.js`. `generate` is deterministic for `(tier, seed, allow, layout)`.

`src/levels/gen-levels.mjs` (dev script, ESM, node only): reads the seed table in `src/levels/seeds.js`
(`PL.seeds = [{ id, tier, seed, allow, layout, N? }, ...]` for ids 1-100), generates, certifies, and writes
`src/levels/levels-001-100.js` as `PL.levels = [ ...levels ]` plus `PL.levelsMeta = { generated: date, kitVersion }`.
Never run at play time.

## 9. Test fixtures → `tests/helpers.js`

```js
helpers.level(spec)          // builds a small level from a terse spec: { N, layout: 'ring-2col', boxes: { L1: [...], R2: [...] }, dir? }
helpers.sim(spec)            // sim.create on helpers.level with the layout
helpers.runUntil(s, pred, maxMs)   // ticks 16 ms steps until pred(s, events) or maxMs; → all events
helpers.tapAndSettle(s, boxIndex)  // tap, then run until the belt is empty or stuck/won; → events
helpers.state(spec)          // model.parse(helpers.level(spec))
```

## 10. Render, UI, audio (browser only)

```js
PL.layout.compute(template, viewport)   // design units → pixels: { scale, ox, oy, ... }; keeps the whole board inside { w, h } with 16 px gutters
PL.sprites.load(base, done, progress)   // every file of docs/ART.md; get(name) → canvas; tinted(name, hex) → canvas with #FF00FF/#CC00CC replaced
PL.scene.create(canvas, template)       // scene.render(sim, dt, fx), scene.hit(x, y) → boxIndex | -1, scene.flash(event) for animations; scene.lowPerf(bool)
PL.strings.de / .en, PL.strings.t(key, vars)   // every UI string; Arcade.lang.get() picks the table
PL.screens                              // title, modes, howto(mechanic), pause, settings, win, lose; each calls Arcade.screen(...)
PL.input.attach(canvas, onTap)          // pointer → scene.hit → onTap(boxIndex)
PL.audio                                // play('eject'|'land'|'close'|'jam'|'unlock'|'thaw'|'win'|'lose'), muted flag stored under STORAGE_KEY
PL.save                                 // { level (highest cleared + 1), attempts: {id: n}, endless: { best: {1..10: n}, difficulty, noLuck }, sound,
                                        //   plain, belt: 'plates'|'stream', seen: { howto }, levelsVersion } via Arcade.storage
PL.app                                  // main.js: state 'LOADING'|'TITLE'|'MODES'|'PLAY'|'PAUSE'|'WIN'|'LOSE', current sim, loop; window.PlateLoop.app
```

Boot check for the arcade's root test: `window.PlateLoop && PlateLoop.app && PlateLoop.app.state === 'TITLE' &&
PlateLoop.app.assets && PlateLoop.app.assets.failed.length === 0`.
