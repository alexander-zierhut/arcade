# Amendment: art-fixes (owner playtest items 4, 5, 9, 10)

Merge into DESIGN.md revision 4. All numbers are R-units in authoring coordinates (base at y = +0.45)
unless they say "anchor".

## 4.2 Shared glass recipe: add after "Reusable helpers" (or under step 4)

**Condensation droplets** (`glass.condensation`, used by T1, T2, T3, T5, T6, T9): droplets sit on the
front face of the glass. Their band (height fractions f0..f1 of the body, default 0.1..0.7) is capped so
that no droplet is above `rimY + K_RIM·rimRx + 0.08` (the lowest point of the front rim plus a droplet).
Without the cap a low glass (T1, T2) put droplets above the front rim, over the open mouth.

## 4.3 T2 Old Fashioned: replace the Garnish bullets and add a Highlights bullet

- **Garnish:**
  - orange-peel spiral ribbon (a tight corkscrew), width 0.12, hooked over the right rim: helix axis from
    (0.84, −0.84) to (1.00, −0.30), 2.5 turns, radius 0.17 tapering to 0.10. Front faces `#FF8C1A` with
    light edge `#FFC066`, back faces the pale pith. (The 4.3 rev 3 numbers, 1.5 turns from (0.6, −0.95),
    drew two disconnected curls in mid-air.)
  - `cherry` r 0.15 `#B3122E` at (−0.4, 0.15).
- **Highlights:** left streak 14-68 % and right streak 28-62 % of the body height, so both stop below the
  front rim; the sparkle dot (r 0.05 with a 0.1 halo at α 0.25) sits on the front wall at
  (−(hw(−0.2) − 0.3), −0.2) instead of at 88 % of the height, where it was above the front rim and read
  as a droplet crossing the rim.

## 4.3 T4 Margarita: replace the Body, Liquid and Salt rim bullets

- **Body:** wide coupe ("sombrero"), deeper than rev 3 so the drink shows a body through the glass.
  - Bowl: rim at **−0.95** (half-width 0.95), cubic sides from the stem junction (half-width 0.07 at
    **−0.10**) with control points (0.55, −0.12) and (0.96, −0.42). Interior (liquid clip): from
    (0.02, −0.17) with controls (0.48, −0.19), (0.90, −0.44) to (0.89, −0.95).
  - Stem −0.12 → +0.35 (width 0.09); foot ellipse at +0.45, rx 0.6.
- **Liquid:** `#F0F59A` → `#B5D43B`, fill **−0.80**, surface `#F7FAC8`, 12 frosty speckles `#FAFDD8`.
  The body below the surface gets a lime wash from α 0.22 (surface) to `rgba(150,190,40,0.5)` (bowl
  bottom) and a soft white refraction glow (ellipse 0.09 × 0.2 at (−0.42, −0.33), −28°, α 0.35).
- **Salt rim:** a white band on the rim's outer side, **0.19** deep at the front (outer ellipse centred
  at RIM_Y + 0.065, rx 0.96, ry K_RIM·0.95 + 0.13), with: a soft green-grey shadow under it on the glass
  (α 0.2, 0.05 wide); a grey lower edge (α 0.5, 0.022) and a grey inner edge against the drink (α 0.4,
  0.018); a crust of 30 angular crystals (squares 0.026-0.042, rotated, with a grey drop shadow) along its
  lower front edge; plus the 24 dots (r 0.04, `#FFFFFF` / `#E9E9E9`, every 15° ± 4°).
- **Garnish:** unchanged: lime wedge r 0.40 at (−1.0, −0.95), −35°; it now sits on the rim's left end.

## 4.3 T5 Mojito: add to Contents (first item, drawn before the bottom mint leaves)

- **Brown sugar** settled on the interior floor (the floor is y = +0.27, the top of the 0.18 base block):
  - a layer whose lumpy top edge is `floor + 0.02 + 0.10·√(1 − x²/0.86²) + 0.022·sin(9x + 0.6) +
    0.012·sin(19x + 2)` (the front of a settled surface, bumpy), clipped to the interior;
  - fill gradient `#E0A458` → `#C27D38` → `#9A5A26` (top to floor), 150 grains r 0.008-0.018 in
    `#74421A`, `#F2C77E`, `#9A5A26`, `#E0A458`, `#C27D38`, 14 white crystal glints;
  - 6 muddled mint bits (dark `leaf`s 0.10-0.15 × 0.06, `#24803F`) inside the layer;
  - a lit crust line `#F2C77E` 0.035 along the top edge with a darker line under it, loose grains piled on
    it (16, then 22 more drawn over the stalks of the bottom mint leaves so they look muddled in);
  - 9 grains still sinking above the layer, and an amber haze `rgba(214,160,80,0.2)` fading upward over
    0.7 where the sugar dissolves.
- The three bottom mint leaves move from y 0.22-0.25 to **0.34-0.36** (stalks buried in the sugar).

## 4.3 T8 Coconut Cocktail: add a "Seat" bullet before Shell

- **Seat:** the whole drawing (shell, top, straws, flowers, leaf) is shifted down by **0.40**, so the
  flattened bottom of the shell is at authoring +0.85 (anchor **+0.40**, like the front of a glass's base
  ellipse at +0.47) and the rim ellipse at −0.20 (anchor −0.65). In rev 3 the shell's lowest point was
  exactly on the anchor (the centre of the footprint), so the nut appeared to hover above its shadow.
  A dark contact patch (radial `rgba(45,25,8,0.6)` → 0, rx 0.72, ry 0.144) is drawn first, centred at
  authoring +0.82, so it peeks out under the bottom edge.
- All other T8 numbers are as listed, measured before the shift.
- **Optional (integrator's call, not applied):** the painted T8 top is now at anchor −1.90 (straw tips),
  so `TOPA[8]` in the 4.2 bounds table could drop from 2.75 to 2.05. That would make the T8 strip/NEXT/
  collection icon about 20 % larger (it is height-fitted) and the cache smaller. It does not affect the
  far-edge headroom (T7, 3.55, is the max).
