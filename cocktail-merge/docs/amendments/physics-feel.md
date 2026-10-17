# Amendment: gentle merges and smaller glasses (key: physics-feel)

Owner playtest items 3 (bounce-back after merges far too strong) and 8 (glasses too big for the table).
Code is already changed: `src/physics.js`, `src/game/merge.js`, `src/config.js` (radii, `PHYS.GROW_ITER`,
`RULES.R0_MIN`, `MODES.relaxed`, plus the `BACKGROUNDS` block from `backgrounds-config.md` and
`AUDIO.MUSIC: 0.09` from `audio.md`), `tests/physics.test.js`, `tests/game.test.js`, `tests/tune.js`.
Test files edited only to read radii from config: `tests/merge.test.js`, `tests/danger.test.js`,
`tests/soak.test.js` (test 47), `tests/projection.test.js` (test 48 threshold). Suite: 110/110.

**Gameplay finding the owner has to decide on.** The gentle merges and the smaller glasses both make the game much
easier. With the shipped numbers the smart bot wins 99.5% in both modes, and only careless (random) play loses
(about half the time). The orchestrator's targets (Relaxed smart 70-85%, random < 35%, Standard smart 35-60%) cannot be
met by any radius rung. They are reachable only by moving the danger line to mid-table (table below), which shrinks
the play area more than the glasses shrank. The real lever for "more glasses on the table" is a spawn rule
(for example letting T5 spawn), and that is outside this key. See section 9.

---

## 2.1b: add one row after `GROW_TICKS`

| `GROW_ITER` | 100 (max) | Kinematic growth-relaxation sweeps per growth tick (2.4 step 1b); exits early once nothing overlaps by more than 0.001 u |

## 2.4: replace step 1 of the pseudocode with

```
  // 1. age and growth (ascending id)
  grew = false
  for (b of bodies) {
    b.age += 1
    if (b.growTick < GROW_TICKS) { ...unchanged radius/invM update... ; grew = true }
  }
  // 1b. growth relaxation (kinematic; only in ticks where some radius changed)
  if (grew) {
    for (it = 0; it < GROW_ITER; it++) {            // GROW_ITER = 100, early exit
      moved = false
      for (i = 0; i < n; i++) { a = bodies[i] ; clamp a into the walls
        for (j = i+1; j < n; j++) { b = bodies[j]
          pen = a.r + b.r - |b - a| ; if (pen < 0.001) continue      // tolerance 0.001 u
          move a and b apart by the FULL pen, mass-weighted (no MAX_CORR cap) ; moved = true
        }
      }
      if (!moved) break
    }
    clamp every body into the walls
  }
  // 1c. integrate (ascending id): forces, drag, friction, VMAX, px/py, x += v·DT, unchanged
```

Add this paragraph under the code block:

- **Growth is kinematic (revision 4).** The overlap that a growing radius creates is removed in step 1b, *before*
  `px, py` are taken, so step 3 never turns it into velocity. Revision 3 left it to the capped solver (10 × 0.5 u),
  and step 3 turned that push into up to VMAX: neighbours of a T5/T6 merge left at 150-260 u/s and could fly back to
  the launch row. The only deliberate kick a merge gives is the shove (2.6). No contacts or events are recorded in
  step 1b. It costs about 13% more CPU over a whole game (Node: 1.71 vs 1.51 ms per simulated second, bot play).

In the parameter table, change the `MAX_CORR` note to: "Caps the velocity the solver injects into *collisions*
(merge growth no longer goes through it, step 1b)".

## 2.5: tier table and justification

Replace the radius, mass and Ø columns (Relaxed now uses the same radii, `RADIUS_SCALE` 1.00):

| Tier | R (u), both modes | Mass `(r/6)²` | Ø at launch row, 390-px phone |
|---|---|---|---|
| 1 | **5.2** | 0.75 | 34 px |
| 2 | **5.92** | 0.97 | 39 px |
| 3 | **7.2** | 1.44 | 47 px |
| 4 | **8.48** | 2.00 | 56 px |
| 5 | **9.92** | 2.73 | 65 px |
| 6 | **11.52** | 3.69 | 75 px |
| 7 | **13.28** | 4.90 | 87 px |
| 8 | **15.2** | 6.42 | 100 px |
| 9 | **17.6** | 8.60 | 115 px |

T2-T9 are the revision-3 Standard radii × 0.8. T1 is 5.2 (× 0.867), so a T1 is still at least 30 px wide on every
phone layout of test 48, including 360×640 with safe areas (30.4 px).

Replace the paragraph "The Relaxed column is for the rung …" with: "Both modes use the same radii (rev 4,
`RADIUS_SCALE` 1.00; Appendix 9). Relaxed differs only in `DANGER_Y` 133 and `GRACE_TICKS` 960."

Replace these justification bullets:
- **Ratios.** T2-T9 ratios are unchanged (1.14-1.23). T1→T2 is 1.138.
- **T1 is readable.** It is ≥ 31 px wide at the launch row on a 360-px phone (34 px at 390 px) and 23.5 px at the far edge.
- **T9 fits.** It is 35% of the table width in both modes (owner target 32-36%; revision 3 had 44% / 40%).
- **Balance.** Re-measured with the revision-4 physics (Appendix 9). Gentle merges plus smaller glasses make the game
  much easier: see the danger-line table in 9 for the only lever inside the current rules.

## 2.6: merge rule, step 4

- Replace "Position = midpoint, clamped to `[r0, 100 − r0] × [r0, 160 − r0]`, where `r0 = max(rA, rB)`." with:
  "**Birth radius** `r0 = max(R0_MIN·max(rA, rB), min(max(rA, rB), min over every other body o of (|o − mid| − r_o)))`,
  with `R0_MIN = 0.6`. The newborn starts overlap-free against every neighbour (walls are left to the clamp). Position =
  the midpoint clamped to `[r0, 100 − r0] × [r0, 160 − r0]`. `px, py` = that position."
- Replace "The radius grows over 29 ticks with easeOutCubic, and the capped PBD solver pushes neighbours aside gently."
  with "The radius grows over 29 ticks with easeOutCubic, and the growth relaxation (2.4 step 1b) moves neighbours aside
  without giving them velocity."
- Shove: append "**Clamped:** the shove never raises a body's outward speed `v·n̂` above `SHOVE_V`
  (`Δv = min(Δv, SHOVE_V − v·n̂)`, skipped if ≤ 0). `SHOVE_V` stays 40 u/s. Measured in bot play: a neighbour's peak
  speed in the 60 ticks after a merge is p50 12 / p90 21 / max 62 u/s (revision 3: p90 260, max 276). No resting glass
  moves back toward the line faster than 30 u/s (revision 3: thousands of samples)."

## 2.13: modes

- Table row `RADIUS_SCALE`: Standard 1.00, **Relaxed 1.00** ("same glasses; since rev 4 the gate cannot make Relaxed
  harder with radii, Appendix 9").
- Guard (test 21 addition): any Relaxed rung must keep `R[2]/R[1] ≥ 1.08`, so `RADIUS_SCALE ≥ 1.08·R1/R2 = 0.949`.
- Acceptance targets: Relaxed smart 70-85%, sloppy 40-85%, random < 35%. The rev-4 numbers do not meet them (9).

## 5.3: config

- `PHYS`: add `GROW_ITER: 100`.
- `RULES`: add `R0_MIN: 0.6`.
- `MODES.relaxed`: `{ DANGER_Y: 133, GRACE_TICKS: 960, RADIUS_SCALE: 1 }`.
- `TIERS[*].radius`: 5.2, 5.92, 7.2, 8.48, 9.92, 11.52, 13.28, 15.2, 17.6.
- `AUDIO`: add `MUSIC: 0.09` (from `audio.md`). Add the `BACKGROUNDS` block (from `backgrounds-config.md`, after `APP`).

## 3.2: reference values, last column (T1 at launch / far, safe areas 0)

360×640 31 / 23.5 px; 360×780 31 / 23.5; 375×667 33 / 24.5; 390×844 34 / 25.5; 412×915 36 / 27; 768×1024 55.5 / 41.5;
1366×768 41.5 / 31; 1920×1080 58.5 / 44.

## 6.2: tests

- **19** "The child's r equals max(rA, rB) at birth" → "… at birth when no other body is closer (birth radius, 2.6)".
- **20** expected Δv uses `SHOVE_V` (40).
- **48** "T1 diameter at the launch row ≥ 34 px on phones" → "≥ 30 px".
- New **13 (physics)**: `PULL 0`, a body growing from R5 to R6 with a T5 neighbour 4 u inside it at birth. Over 60
  ticks no speed exceeds 0.5 u/s (rev 3: 260), the overlap is gone, and r ends at R6.
- New **14 (physics)**: the dropped piles of test 7 for seeds 1-10. The front-most touching pair (largest y) is replaced
  by a body growing from the larger parent's radius (the worst case) to the next tier. Neighbour peak < 30 u/s within
  60 ticks for every seed (rev 3: 150-310). Seed 3 (test 7's pile) is back below 1 u/s within 4 s.
- New **19b**: the birth radius equals the free radius against a neighbour inside a parent-sized birth circle, and
  `R0_MIN·max(rA, rB)` when the floor binds.
- New **20b**: a neighbour already moving outward at 35 u/s ends at ≤ `SHOVE_V` and is not slowed.
- New **merge feel** (game): bot play (`botAim`, a launch every 336 ticks, 200 launches or a win), seeds 1-2, both
  modes. Every glass not in flight (`launched && age < 300` counts as in flight) stays ≤ 90 u/s within 60 ticks of any
  merge (it is not the newborn). No such glass with `y + r > DANGER_Y − 10` moves nearward faster than 40 u/s.
  Rev 3 failed this at 278 u/s.
- Unchanged and still passing: single launch (reaches y ≤ 20 at tick 209, far wall 136 u/s, rebound 40.9 u/s, rests
  at y = r).

## 8 step 2: tuning gate (Relaxed ladder)

Replace the ladder bullet with: "**Relaxed ladder (rev 4).** Start at `RADIUS_SCALE = 1.00` (the Standard radii).
Verdict 'harder' if smart < 70% or sloppy < 40%. Verdict 'easier' if smart > 85%, sloppy > 85% or random > 35%. On
'harder', step down through 0.97 (the only valid rung while `R[2]/R[1] ≥ 1.08`). On 'easier', no radius rung can help:
keep 1.00 and report it."

## 9: replace the "Tuning gate results" block

**Tuning gate results, revision 4** (`node tests/tune.js`, 400 seeds per row, cap 400 launches, bots as before; wall
time 200 s on 15 workers):

| Mode / rung | Bot | Win rate [95% CI] | Avg launches to win | Max bodies (avg) | Contacts > 0.5 u | Lost / capped |
|---|---|---|---|---|---|---|
| Standard | smart | **99.5%** [98-100%] | 196 | 31 (19.7) | 0.000% | 0 / 2 |
| Standard | sloppy | **99.8%** [99-100%] | 200 | 33 (19.7) | 0.000% | 1 / 0 |
| Standard | random | **50.5%** [46-55%] | 211 | 52 (38.8) | 0.000% | 198 / 0 |
| Relaxed, `RADIUS_SCALE` 1.00 (chosen) | smart | **99.5%** [98-100%] | 196 | 31 (19.7) | 0.000% | 0 / 2 |
| Relaxed, `RADIUS_SCALE` 1.00 (chosen) | sloppy | **100.0%** [99-100%] | 200 | 33 (19.7) | 0.000% | 0 / 0 |
| Relaxed, `RADIUS_SCALE` 1.00 (chosen) | random | **55.0%** [50-60%] | 217 | 55 (39.4) | 0.000% | 180 / 0 |

- Verdict: "easier" at the start rung. No radius rung can make Relaxed harder, so `RADIUS_SCALE` stays 1.00.
  Standard and Relaxed smart runs are identical because a smart bot never gets near either line.
- **Where the difficulty went** (Standard smart / random, 100 seeds unless noted):

| Physics | Radii | Standard smart | Relaxed smart |
|---|---|---|---|
| rev 3 (bouncy merges) | rev 3 | 39% | 75% (×0.91) |
| rev 4 (gentle merges) | rev 3 | 66% (random 5%) | 97% (×0.91, random 15%) |
| rev 4 | rev 4 (this amendment) | 99.5% (400 seeds, random 50.5%) | 99.5% (random 55%) |

  In revision 3 most losses came from the merge bounce throwing glasses back over the line.
- **Danger-line lever** (rev-4 radii and physics, 200 seeds, smart / random):

| `DANGER_Y` | Standard | Relaxed (grace 960) |
|---|---|---|
| 130 / 133 (shipped) | 99.5% / 50.5% | 99.5% / 55% |
| 115 | 98% / 38.5% | 98% / 39% |
| 100 | 95.5% / 24.5% | 95.5% / 26% |
| 90 | 85.5% / 11.5% | 86% / 14.5% |
| 80 | 69% / 2.5% | n/a |

  Meeting the old targets needs the line near y ≈ 77 (Standard) and ≈ 88 (Relaxed). On a 390×844 screen that puts the
  line at about 40-45% of the table height instead of 76%. The play area then shrinks more than the glasses did, which
  defeats owner item 8. It would also need test edits in `danger.test.js` and `game.test.js` (tests 23 and 28-36
  hard-code 130/133). **Recommendation:** keep the lines. Owner or integrator choose between (a) accepting "a careful
  player nearly always wins, a careless one loses about half the time", (b) a mild line move (`DANGER_Y` 115/118 gets
  random < 40%), or (c) a spawn-rule change (more mass per launch, for example T5 spawns) so that more glasses really
  stay on the table, then re-run the gate.
- Merge feel (bot play, 8 seeds × 2 modes, all merges): neighbour peak speed in the 60 ticks after a merge is p50 12,
  p90 21, max 62 u/s (tier ≥ 5 merges: p90 27). Revision 3: p50 28, p90 260, max 276.
- Settling after a merge inside a settled 25-glass pile (physics only, worst-case birth radius, seeds 1-10):
  - When the front-most pair merges (the in-play case), the neighbour peak is 0.3-21 u/s.
  - 8 of 10 piles are below 1 u/s within 4 s. The rest creep slowly (≤ 5 u/s) as glasses slide into the freed space under
    the pull; that is ordinary gravity compaction, not merge energy.
  - Revision 3 on the same piles: peaks 3-260 u/s.
