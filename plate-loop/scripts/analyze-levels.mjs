// scripts/analyze-levels.mjs: the hardness of every fixed level by solver.analyze (dev only).
//   node scripts/analyze-levels.mjs [lo-hi] [--json out.json]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => join(root, 'src', p);
const layouts = require(src('levels/layouts.js'));
const solver = require(src('gen/solver.js'));
require(src('levels/levels-001-100.js'));
const levels = require(src('levels/levels-101-500.js'));
const range = (process.argv[2] || '').match(/^(\d+)-(\d+)$/);
const lo = range ? Number(range[1]) : 1, hi = range ? Number(range[2]) : levels.length;
const ji = process.argv.indexOf('--json');
const rows = [], t0 = Date.now();
for (const level of levels) {
  if (level.id < lo || level.id > hi) continue;
  const t = Date.now(), a = solver.analyze(level, { layout: layouts[level.layout], maxStates: 60000 });
  rows.push({ id: level.id, tier: level.tier, N: level.N, kinds: level.kinds, boxes: level.boxes.length, ...a, ms: Date.now() - t });
}
const f = (x, d) => (typeof x === 'number' ? x.toFixed(d) : String(x));
console.log(['id', 'tier', 'N', 'kinds', 'boxes', 'depth', 'states', 'pRandom', 'pNatural', 'safe', 'traps', 'capped', 'ms'].join('\t'));
for (const r of rows) console.log([r.id, r.tier, r.N, r.kinds, r.boxes, r.depth, r.states, f(r.pRandom, 3), f(r.pNatural, 3), f(r.safe, 2), f(r.traps, 2), r.capped ? 'CAP' : '', r.ms].join('\t'));
const tiers = {};
for (const r of rows) { const t = tiers[r.tier] = tiers[r.tier] || []; t.push(r); }
const mean = (a, k) => a.reduce((s, x) => s + x[k], 0) / a.length;
const med = (a, k) => { const v = a.map((x) => x[k]).sort((p, q) => p - q); return v[Math.floor(v.length / 2)]; };
for (const t of Object.keys(tiers)) {
  const a = tiers[t];
  console.log(`${t}: n=${a.length} pRandom mean ${f(mean(a, 'pRandom'), 3)} median ${f(med(a, 'pRandom'), 3)} | pNatural mean ${f(mean(a, 'pNatural'), 3)} median ${f(med(a, 'pNatural'), 3)} | safe ${f(mean(a, 'safe'), 2)} | traps ${f(mean(a, 'traps'), 2)} | depth ${f(mean(a, 'depth'), 1)} | states ${f(mean(a, 'states'), 0)} | capped ${a.filter((x) => x.capped).length}`);
}
console.log((Date.now() - t0) + ' ms');
if (ji > 0) writeFileSync(process.argv[ji + 1], JSON.stringify(rows));
