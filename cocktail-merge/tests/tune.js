// tests/tune.js: the tuning gate (DESIGN 8 step 2, 2.13). Not a test: run it by hand.
//
//   node tests/tune.js                      full gate: Standard (reported) + the Relaxed ladder
//   node tests/tune.js --seeds 200          fewer seeds (say so in Appendix 9)
//   node tests/tune.js --only relaxed --scale 0.97 [--grace 1200] [--bots smart,sloppy]
//   node tests/tune.js --workers 8          child processes (default: CPU count - 1)
//   node tests/tune.js --json out.json      also write the raw results
//
// Bots (8 step 2), each with its own seeded noise RNG:
//   smart  = botAim with uniform +-2 u noise (spread 4),  a launch attempt every 336 ticks (1.4 s)
//   sloppy = botAim with uniform +-6 u noise (spread 12), every 336 ticks
//   random = uniform x over aimBounds,                    every 216 ticks (0.9 s)
// Seeds 1..N, cap 400 launches. A run is a win when the `win` event fires.
'use strict';
var path = require('path');
var os = require('os');
var childProcess = require('child_process');

var LAUNCH_CAP = 400;
var ATTEMPT_CAP = 2000;          // safety only: refused launches cannot deadlock (2.12)
var OVERLAP_U = 0.5;
var BOTS = {
  smart:  { period: 336, spread: 4,  salt: 0x51A27 },
  sloppy: { period: 336, spread: 12, salt: 0x5109E },
  random: { period: 216, spread: 0,  salt: 0x7A4D0 }
};
var TARGETS = { smartMin: 0.70, smartMax: 0.85, sloppyMin: 0.40, sloppyMax: 0.85, randomMax: 0.35 };   // Relaxed (rev 4)

// ---- one game (runs inside a worker) ------------------------------------------

function mulberry(state) {
  var s = state >>> 0;
  return function () {
    var a = (s + 0x6D2B79F5) | 0; s = a >>> 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function playOne(G, overrides, botName, seed) {
  var bot = BOTS[botName];
  var g = G.createGame(seed, overrides);
  var noise = mulberry(Math.imul(seed, 0x9E3779B1) ^ bot.salt);
  var res = { seed: seed, win: false, lost: false, launchesToWin: 0, launches: 0,
              maxBodies: 0, contacts: 0, overlaps: 0, ticks: 0, merges: 0 };
  var attempts = 0, stopAt = -1;
  while (g.phase !== 'over') {
    if (g.tick % bot.period === 0) {
      if (stopAt >= 0 && g.tick >= stopAt) break;
      if (g.launches >= LAUNCH_CAP || attempts >= ATTEMPT_CAP) {
        stopAt = g.tick + bot.period;          // let the last throw finish its merges, then stop
      } else {
        attempts += 1;
        var u = noise();
        var x;
        if (botName === 'random') {
          var ab = G.aimBounds(g);
          x = ab.min + u * (ab.max - ab.min);
        } else {
          x = G.botAim(g, u, bot.spread);
        }
        G.setAim(g, x);
        G.requestLaunch(g, 'key');
      }
    }
    var ev = G.tick(g);
    var won = false;
    for (var k = 0; k < ev.length; k++) {
      if (ev[k].type === 'win') won = true;
      else if (ev[k].type === 'merge') res.merges += 1;
      else if (ev[k].type === 'lose') res.lost = true;
    }
    measure(g, res);
    if (won) { res.win = true; res.launchesToWin = g.launches; break; }
  }
  res.launches = g.launches;
  res.ticks = g.tick;
  return res;
}

// Pairs in contact after the tick (d < rA + rB) and how many overlap by more than 0.5 u.
function measure(g, res) {
  var b = g.bodies, n = b.length;
  if (n > res.maxBodies) res.maxBodies = n;
  for (var i = 0; i < n; i++) {
    var a = b[i];
    for (var j = i + 1; j < n; j++) {
      var c = b[j];
      var dx = c.x - a.x, dy = c.y - a.y, rr = a.r + c.r;
      var d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      res.contacts += 1;
      if (rr - Math.sqrt(d2) > OVERLAP_U) res.overlaps += 1;
    }
  }
}

function workerMain() {
  var G = require(path.join(__dirname, '..', 'src', 'game', 'game.js'));
  process.on('message', function (job) {
    if (!job || job.quit) { process.exit(0); return; }
    var out = [];
    for (var i = 0; i < job.seeds.length; i++) out.push(playOne(G, job.overrides, job.bot, job.seeds[i]));
    process.send({ id: job.id, results: out });
  });
}

// ---- statistics ---------------------------------------------------------------

function wilson(k, n) {
  if (n === 0) return [0, 0];
  var z = 1.959964, p = k / n, z2 = z * z;
  var den = 1 + z2 / n;
  var mid = (p + z2 / (2 * n)) / den;
  var half = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / den;
  return [Math.max(0, mid - half), Math.min(1, mid + half)];
}

function summarize(results) {
  var n = results.length, wins = 0, sumL = 0, maxB = 0, sumMaxB = 0, contacts = 0, overlaps = 0;
  var losses = 0, capped = 0, ticks = 0;
  results.forEach(function (r) {
    if (r.win) { wins += 1; sumL += r.launchesToWin; } else if (r.lost) losses += 1; else capped += 1;
    if (r.maxBodies > maxB) maxB = r.maxBodies;
    sumMaxB += r.maxBodies; contacts += r.contacts; overlaps += r.overlaps; ticks += r.ticks;
  });
  var ci = wilson(wins, n);
  return { n: n, wins: wins, rate: n ? wins / n : 0, lo: ci[0], hi: ci[1], losses: losses, capped: capped,
           avgLaunchesToWin: wins ? sumL / wins : null, maxBodies: maxB, avgMaxBodies: n ? sumMaxB / n : 0,
           contacts: contacts, overlaps: overlaps, overlapFrac: contacts ? overlaps / contacts : 0,
           simSeconds: ticks / 240 };
}

function pct(x, d) { return (x * 100).toFixed(d === undefined ? 1 : d) + '%'; }

function row(label, s) {
  return '| ' + label + ' | **' + pct(s.rate) + '** [' + pct(s.lo, 0) + '-' + pct(s.hi, 0) + '] | ' +
    (s.avgLaunchesToWin === null ? 'n/a' : s.avgLaunchesToWin.toFixed(0)) + ' | ' +
    s.maxBodies + ' (avg ' + s.avgMaxBodies.toFixed(1) + ') | ' + pct(s.overlapFrac, 3) + ' | ' +
    s.losses + ' / ' + s.capped + ' |';
}

// ---- parent: worker pool -------------------------------------------------------

function Pool(size) {
  var self = this;
  this.workers = [];
  this.queue = [];
  this.pending = {};
  this.nextId = 1;
  for (var i = 0; i < size; i++) {
    var w = childProcess.fork(__filename, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    w.busy = false;
    w.on('message', onMessage(w));
    w.on('exit', function (code) {
      if (code !== 0 && !self.closing) { console.error('worker exited with code ' + code); process.exit(1); }
    });
    this.workers.push(w);
  }
  function onMessage(w) {
    return function (msg) {
      w.busy = false;
      var p = self.pending[msg.id];
      delete self.pending[msg.id];
      p.resolve(msg.results);
      self.pump();
    };
  }
}
Pool.prototype.run = function (job) {
  var self = this;
  return new Promise(function (resolve) {
    job.id = self.nextId++;
    self.pending[job.id] = { resolve: resolve };
    self.queue.push(job);
    self.pump();
  });
};
Pool.prototype.pump = function () {
  for (var i = 0; i < this.workers.length && this.queue.length; i++) {
    var w = this.workers[i];
    if (!w.busy) { w.busy = true; w.send(this.queue.shift()); }
  }
};
Pool.prototype.close = function () {
  this.closing = true;
  this.workers.forEach(function (w) { w.send({ quit: true }); });
};

// Runs one bot over all seeds in chunks; prints progress; returns the summary.
function runBot(pool, label, overrides, bot, nSeeds) {
  var CHUNK = 5, jobs = [], done = 0, t0 = Date.now();
  for (var s = 1; s <= nSeeds; s += CHUNK) {
    var seeds = [];
    for (var k = s; k < s + CHUNK && k <= nSeeds; k++) seeds.push(k);
    jobs.push(pool.run({ overrides: overrides, bot: bot, seeds: seeds }).then(function (r) {
      done += r.length;
      if (done % 100 === 0 || done === nSeeds) {
        process.stdout.write('  ' + label + ' ' + bot + ': ' + done + '/' + nSeeds + ' seeds (' +
          ((Date.now() - t0) / 1000).toFixed(0) + ' s)\n');
      }
      return r;
    }));
  }
  return Promise.all(jobs).then(function (parts) {
    var all = [].concat.apply([], parts).sort(function (a, b) { return a.seed - b.seed; });
    var sum = summarize(all);
    console.log('  => ' + label + ' ' + bot + ': ' + pct(sum.rate) + ' [' + pct(sum.lo) + '-' + pct(sum.hi) +
      '], avg launches to win ' + (sum.avgLaunchesToWin === null ? 'n/a' : sum.avgLaunchesToWin.toFixed(1)) +
      ', max bodies ' + sum.maxBodies + ', overlap>0.5u ' + pct(sum.overlapFrac, 4) +
      ', lost ' + sum.losses + ', capped ' + sum.capped);
    return sum;
  });
}

function runConfig(pool, label, overrides, bots, nSeeds) {
  var out = {};
  return bots.reduce(function (p, bot) {
    return p.then(function () {
      return runBot(pool, label, overrides, bot, nSeeds).then(function (s) { out[bot] = s; });
    });
  }, Promise.resolve()).then(function () { return out; });
}

function rungLabel(r) {
  return 'RADIUS_SCALE ' + r.scale.toFixed(2) + (r.grace ? ', GRACE_TICKS ' + r.grace : '');
}

function rungOverrides(r) {
  var o = { mode: 'relaxed', RADIUS_SCALE: r.scale };
  if (r.grace) o.GRACE_TICKS = r.grace;
  return o;
}

function verdict(s) {
  if (s.smart.rate < TARGETS.smartMin || s.sloppy.rate < TARGETS.sloppyMin) return 'harder';
  if (s.smart.rate > TARGETS.smartMax || s.sloppy.rate > TARGETS.sloppyMax || s.random.rate > TARGETS.randomMax) return 'easier';
  return 'pass';
}

// The Relaxed ladder (8 step 2, revision 4). Since rev 4 Relaxed starts at the Standard radii
// (RADIUS_SCALE 1.00) and may only step DOWN while the 2.5 guard R[2]/R[1] >= 1.08 holds (T1 is
// never scaled). If the start rung is already too easy, no radius rung can fix that: the gate
// reports it and keeps 1.00 (the remaining levers are DANGER_Y / spawn rules, Appendix 9).
function minScale() {
  var T = require(path.join(__dirname, '..', 'src', 'config.js')).TIERS;
  return 1.08 * T[1].radius / T[2].radius;
}
function ladder(pool, nSeeds, rows) {
  var lo = minScale();
  var down = [{ scale: 0.97 }, { scale: 0.94 }, { scale: 0.91 }].filter(function (r) { return r.scale >= lo; });
  function evalRung(r) {
    var label = 'relaxed ' + rungLabel(r);
    console.log('\n' + label);
    return runConfig(pool, label, rungOverrides(r), ['smart', 'sloppy', 'random'], nSeeds).then(function (s) {
      var v = verdict(s);
      rows.push({ rung: r, mode: 'relaxed', summary: s, verdict: v });
      console.log('  verdict: ' + v);
      return v;
    });
  }
  return evalRung({ scale: 1 }).then(function (v) {
    if (v === 'pass') return { scale: 1 };
    if (v === 'easier') return { scale: 1, note: 'too easy at RADIUS_SCALE 1.00; no radius rung can make Relaxed harder' };
    var i = 0;
    function next() {
      if (i >= down.length) return { scale: down.length ? down[down.length - 1].scale : 1, note: 'no rung meets all targets' };
      var r = down[i++];
      return evalRung(r).then(function (vv) {
        if (vv === 'pass') return r;
        if (vv === 'easier') return { scale: r.scale, note: 'sloppy bot above 85% at this rung' };
        return next();
      });
    }
    return next();
  });
}

function parseArgs(argv) {
  var a = { seeds: 400, workers: Math.max(1, os.cpus().length - 1), only: null, scale: null, grace: null,
            bots: ['smart', 'sloppy', 'random'], json: null };
  for (var i = 0; i < argv.length; i++) {
    var k = argv[i], v = argv[i + 1];
    if (k === '--seeds') { a.seeds = parseInt(v, 10); i++; }
    else if (k === '--workers') { a.workers = parseInt(v, 10); i++; }
    else if (k === '--only') { a.only = v; i++; }
    else if (k === '--scale') { a.scale = parseFloat(v); i++; }
    else if (k === '--grace') { a.grace = parseInt(v, 10); i++; }
    else if (k === '--bots') { a.bots = v.split(','); i++; }
    else if (k === '--json') { a.json = v; i++; }
  }
  return a;
}

function printTable(rows, nSeeds) {
  console.log('\n| Mode / rung | Bot | Win rate [95% CI] | Avg launches to win | Max bodies | Contacts > 0.5 u overlap | Lost / capped |');
  console.log('|---|---|---|---|---|---|---|');
  rows.forEach(function (r) {
    var label = r.mode === 'standard' ? 'Standard' : 'Relaxed, ' + rungLabel(r.rung);
    Object.keys(r.summary).forEach(function (bot) {
      var line = row(label + ' | ' + bot, r.summary[bot]);
      console.log(line);
    });
  });
  console.log('(' + nSeeds + ' seeds per row, cap ' + LAUNCH_CAP + ' launches)');
}

function main() {
  var args = parseArgs(process.argv.slice(2));
  var pool = new Pool(args.workers);
  var rows = [];
  var t0 = Date.now();
  console.log('Tuning gate: ' + args.seeds + ' seeds, cap ' + LAUNCH_CAP + ' launches, ' + args.workers + ' workers');
  var p;
  if (args.only) {
    var r = { scale: args.scale === null ? 1 : args.scale, grace: args.grace };
    var o = args.only === 'relaxed' ? rungOverrides(r) : { mode: 'standard' };
    if (args.only !== 'relaxed' && args.scale !== null) o.RADIUS_SCALE = args.scale;
    if (args.only !== 'relaxed' && args.grace) o.GRACE_TICKS = args.grace;
    console.log('\n' + args.only + ' ' + rungLabel(r));
    p = runConfig(pool, args.only, o, args.bots, args.seeds).then(function (s) {
      rows.push({ rung: r, mode: args.only, summary: s });
      return null;
    });
  } else {
    console.log('\nstandard');
    p = runConfig(pool, 'standard', { mode: 'standard' }, ['smart', 'sloppy', 'random'], args.seeds)
      .then(function (s) {
        rows.push({ rung: { scale: 1 }, mode: 'standard', summary: s });
        return ladder(pool, args.seeds, rows);
      });
  }
  p.then(function (chosen) {
    pool.close();
    printTable(rows, args.seeds);
    if (chosen) {
      console.log('\nChosen Relaxed rung: ' + rungLabel(chosen) + (chosen.note ? ' (' + chosen.note + ')' : ''));
    }
    console.log('Total wall time ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
    if (args.json) {
      require('fs').writeFileSync(args.json, JSON.stringify({ seeds: args.seeds, rows: rows, chosen: chosen }, null, 1));
    }
  }).catch(function (e) { console.error(e); pool.close(); process.exit(1); });
}

if (process.argv[2] === '--worker') workerMain();
else if (require.main === module) main();

module.exports = { playOne: playOne, wilson: wilson, summarize: summarize };
