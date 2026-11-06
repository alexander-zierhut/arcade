// scripts/level-curve.mjs: the difficulty curve of the 500 fixed levels (2026-11-06, "random tapping must not win").
// target(id) -> { tier, hard: [lo, hi], candidates, hardest, noHidden, spike, lesson }
//   tier       the structure band of the generator (config.TIERS: plates, kinds, boxes, hidden share)
//   hard       the hardness window H = -log10(chance that a player tapping at random wins), see generator.hardness
//   candidates how many certified candidates the search may analyse; hardest: keep the hardest of them (spikes)
//   noHidden   nothing hidden: at the top, luck must never decide ("no luck" is forced)
//   fullAllow  every mechanic may appear (the themed allow lists of the plan files cap the hardness; the top needs all)
// The lessons (plan 5.6: hidden 6, pairs 12, wraps 18, one-way 28, ice 35, locks 42) stay gentle; milestones every 25
// levels are spikes, clearly harder than their neighbours; every 10th level is a bump. Used by scripts/gen-levels.mjs
// and tests/levels.test.js, so the two can never disagree.
export const INTRO = { hidden: 6, pair: 12, wrap: 18, oneway: 28, ice: 35, lock: 42 };
export const LESSONS = Object.values(INTRO);

const lerp = (id, a, b, lo, hi) => lo + (hi - lo) * Math.max(0, Math.min(1, (id - a) / (b - a)));
const round = (x) => Math.round(x * 100) / 100;

export function target(id) {
  let tier, lo, hi, candidates = 80, hardest = false, noHidden = false, fullAllow = false;
  const spike = id % 25 === 0 || id >= 497, bump = !spike && id % 10 === 0, lesson = LESSONS.indexOf(id) >= 0;
  if (id <= 5) { tier = 'easy'; lo = 0; hi = 0.4; }
  else if (id <= 15) { tier = 'easy'; lo = 0.1; hi = 0.7; }
  else if (id <= 24) { tier = 'normal'; lo = lerp(id, 16, 24, 0.5, 0.9); hi = lo + 0.5; }
  else if (id <= 49) { tier = id >= 44 && id % 2 === 0 ? 'hard' : 'normal'; lo = lerp(id, 26, 49, 0.9, 1.3); hi = lo + 0.6; }
  else if (id <= 99) { tier = 'hard'; lo = lerp(id, 51, 99, 1.4, 2.0); hi = lo + 0.6; }
  else if (id <= 200) { tier = 'hard'; lo = lerp(id, 101, 200, 2.0, 2.4); hi = lo + 0.6; }
  else if (id <= 300) { tier = id >= 250 && id % 3 === 0 ? 'extreme' : 'hard'; lo = lerp(id, 201, 300, 2.4, 2.9); hi = lo + 0.6; }
  else if (id <= 400) { tier = 'extreme'; lo = lerp(id, 301, 400, 2.9, 3.4); hi = lo + 0.6; }
  else { tier = 'extreme'; lo = lerp(id, 401, 496, 3.4, 3.9); hi = lo + 0.7; noHidden = true; fullAllow = true; candidates = 120; }
  if (lesson) { lo = Math.max(0.1, lo - 0.4); hi = lo + 0.7; }
  if (bump && id > 50) { lo += 0.4; hi += 0.4; }
  if (spike) {
    hardest = true; candidates = 200; hi = 9;
    if (id === 25) { tier = 'normal'; lo = 1.0; hardest = false; hi = 1.6; candidates = 80; }
    else if (id === 50) { tier = 'hard'; lo = 1.8; hardest = false; hi = 2.4; candidates = 80; }
    else if (id === 75) { tier = 'hard'; lo = 2.2; hardest = false; hi = 2.8; candidates = 80; }
    else if (id === 100) { tier = 'extreme'; lo = 2.8; }
    else if (id <= 200) { tier = 'extreme'; lo = lerp(id, 125, 200, 3.0, 3.4); noHidden = true; fullAllow = true; }
    else if (id <= 300) { tier = 'extreme'; lo = lerp(id, 225, 300, 3.5, 3.8); noHidden = true; fullAllow = true; }
    else if (id <= 400) { tier = 'extreme'; lo = lerp(id, 325, 400, 3.9, 4.2); noHidden = true; fullAllow = true; }
    else { tier = 'extreme'; lo = lerp(id, 425, 500, 4.0, 4.4); noHidden = true; candidates = 240; }
  }
  return { tier, hard: [round(lo), round(hi)], candidates, hardest, noHidden, fullAllow, spike, lesson };
}

// the tier a player sees: by hardness, so the pill colour means "how hard", whatever the structure band
export function tierOfHardness(H) { return H < 0.7 ? 'easy' : H < 1.6 ? 'normal' : H < 2.8 ? 'hard' : 'extreme'; }
