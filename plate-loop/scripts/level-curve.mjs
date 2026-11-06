// scripts/level-curve.mjs: the difficulty curve of the 500 fixed levels (2026-11-06, "random tapping must not win").
// target(id) -> { tier, look, hard: [lo, hi], candidates, hardest, noHidden, fullAllow, spike, lesson }
//   tier       the structure band of the generator (config.TIERS: plates, kinds, boxes, hidden share)
//   look       the lookahead of the measuring player (0 random, 2, 4, 6, 8, 12, 16 moves), see generator.hardness
//   verify     the real-time bot stage (generator.botRate): { games, maxRate, top }; the abstract numbers miss the slack
//              of real-time play, the bot with in-flight taps does not (2026-11-06, after Alex's playtests)
//              verify.planner = the limited planner stage (generator.plannerRate: guided play with a small search), the
//              yardstick that tracked Alex's ratings where the tapping bot could not (7.5 → wins all, 9 → wins none)
//   buffer     'require' = only levels without a one-run-at-a-time solution (the loop must be used as a buffer, plan
//              R29c; the original's super-hard feel), 'prefer' = such levels rank first, null = strict levels only
//   tight      the difficulty-10 recipe (497-500, "a 10 is seen once or twice in the fixed levels", Alex 2026-11-06):
//              every open box full at the start, the free slots behind two locks, two ice, two wraps, twelve kinds,
//              a random deal with at most two of a kind per box (no runs, no free closes)
//   hard       the hardness window H = -log10(chance that that player wins)
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
  let tier, lo, hi, look = 0, candidates = 80, hardest = false, noHidden = false, fullAllow = false, verify = null, buffer = null, tight = false;
  const spike = id % 25 === 0 || id >= 497, bump = !spike && id % 10 === 0, lesson = LESSONS.indexOf(id) >= 0;
  // look = the lookahead of the measuring player (plan R29): random tapping up to level 50, two moves ahead to 200,
  // four to 400, six beyond, eight on the top spikes. The windows are on the H of that player (its distribution
  // shifts down with every step of lookahead, so the numbers are not comparable across ranges).
  if (id <= 5) { tier = 'easy'; lo = 0; hi = 0.4; }
  else if (id <= 15) { tier = 'easy'; lo = 0.1; hi = 0.7; }
  else if (id <= 24) { tier = 'normal'; lo = lerp(id, 16, 24, 0.5, 0.9); hi = lo + 0.5; }
  else if (id <= 49) { tier = id >= 44 && id % 2 === 0 ? 'hard' : 'normal'; lo = lerp(id, 26, 49, 0.9, 1.4); hi = lo + 0.6; }
  else if (id <= 99) { tier = 'hard'; look = 2; lo = lerp(id, 51, 99, 0.5, 0.9); hi = lo + 0.5; }
  else if (id <= 200) { tier = 'hard'; look = 2; lo = lerp(id, 101, 200, 0.9, 1.3); hi = lo + 0.5; candidates = 100; }
  else if (id <= 300) { tier = id >= 250 && id % 3 === 0 ? 'extreme' : 'hard'; look = 4; lo = lerp(id, 201, 300, 0.6, 1.0); hi = lo + 0.5; candidates = 120; }
  else if (id <= 400) { tier = 'extreme'; look = 4; lo = lerp(id, 301, 400, 1.0, 1.3); hi = lo + 0.5; candidates = 150; verify = { games: 8, maxRate: 0.5 }; }
  else { tier = 'extreme'; look = 6; lo = lerp(id, 401, 496, 0.8, 1.3); hi = lo + 0.6; noHidden = true; fullAllow = true; candidates = 200; verify = { games: 12, maxRate: 0.25 }; buffer = 'prefer'; }
  if (lesson) { lo = Math.max(0.1, lo - 0.4); hi = lo + 0.7; }
  if (bump && id > 50) { lo += 0.3; hi += 0.3; }
  if (spike) {
    hardest = true; candidates = 1500; hi = 9;
    if (id === 25) { tier = 'normal'; lo = 1.0; hardest = false; hi = 1.6; candidates = 80; }
    else if (id === 50) { tier = 'hard'; look = 2; lo = 1.0; hardest = false; hi = 1.5; candidates = 100; }
    else if (id === 75) { tier = 'hard'; look = 2; lo = 1.3; hardest = false; hi = 1.9; candidates = 120; }
    else if (id === 100) { tier = 'extreme'; look = 4; lo = 1.0; }
    else if (id <= 200) { tier = 'extreme'; look = 4; lo = 1.2; noHidden = true; fullAllow = true; verify = { games: 16, maxRate: 0, top: 8 }; }
    else if (id <= 300) { tier = 'extreme'; look = 6; lo = 1.2; noHidden = true; fullAllow = true; verify = { games: 16, maxRate: 0, top: 8 }; buffer = id >= 225 ? 'require' : 'prefer'; candidates = 400; }
    else { tier = 'extreme'; look = 8; lo = 1.2; noHidden = true; fullAllow = true; candidates = id >= 497 ? 600 : 400; verify = { games: 20, maxRate: 0, top: 10, planner: { games: 10, nodes: 200, maxRate: 0 } }; buffer = 'require'; tight = id >= 497; }
  }
  return { tier, look, hard: [round(lo), round(hi)], candidates, hardest, noHidden, fullAllow, verify, buffer, tight, spike, lesson };
}

export const LOOK_INDEX = { 0: 0, 2: 1, 4: 2, 6: 3, 8: 4, 12: 5, 16: 6 };

// the tier a player sees: by hardness, so the pill colour means "how hard", whatever the structure band
export function tierOfHardness(H) { return H < 0.7 ? 'easy' : H < 1.6 ? 'normal' : H < 2.8 ? 'hard' : 'extreme'; }
