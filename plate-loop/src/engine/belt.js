// src/engine/belt.js: the belt geometry (N plates with individual arc positions on a closed loop, mouths along it)
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};

  // Conventions. Arc lengths in *travel* units grow in the direction the belt moves; mouths are stored in
  // travel units (for dir 'ccw' the layout's s becomes perimeter - s). Every plate has its own position b.pos[i]
  // (all plates move by the same ds, but a tap can lift a free plate and drop it behind a mouth, so the spacing
  // becomes uneven). Initially plate i sits at i * spacing. A plate whose centre is exactly on a mouth has already
  // crossed it (its next crossing is one full lap away), so a crossing is counted exactly once, never twice.

  var EPS = 0.5;       // a plate dropped for an ejection sits this far (units) behind the mouth

  function norm(x, P) {
    var r = x % P;
    if (r < 0) r += P;
    return r;
  }

  // signed arc distance a - b folded into [-P/2, P/2): positive = a is ahead of b in the direction of travel
  function signed(a, b, P) {
    return norm(a - b + P / 2, P) - P / 2;
  }

  // belt.create({ N, perimeter, dir, mouths: [{ box, s }] })
  function create(o) {
    var N = o.N, P = o.perimeter, mouths = [], pos = [], up = [], i, m;
    if (!(N >= 1) || Math.floor(N) !== N) throw new Error('belt: N must be a positive integer');
    if (!(P > 0)) throw new Error('belt: perimeter must be positive');
    for (i = 0; i < (o.mouths || []).length; i++) {
      m = o.mouths[i];
      mouths.push({ box: m.box, s: norm(m.s, P) });
    }
    mouths.sort(function (a, b) { return a.s - b.s || a.box - b.box; });
    for (i = 0; i < N; i++) { pos.push(i * (P / N)); up.push(i * (P / N)); }
    // pos[i]: arc position in [0, P); up[i]: the same, unwrapped (crossings are counted on it); travel: total distance moved
    return { N: N, perimeter: P, spacing: P / N, dir: o.dir || 'cw', mouths: mouths, pos: pos, up: up, travel: 0, phase: 0 };
  }

  // arc length of plate i's centre in the belt's travel direction
  function travelPos(b, i) { return b.pos[i]; }

  // arc length of plate i's centre in the layout's clockwise units (what layouts.pointAt takes)
  function platePos(b, i) {
    return b.dir === 'ccw' ? norm(b.perimeter - b.pos[i], b.perimeter) : b.pos[i];
  }

  // distance plate i still has to travel until its centre reaches the mouth next, in (0, perimeter]
  function remaining(b, i, m) {
    var P = b.perimeter, x = b.up[i] - m.s, n = Math.floor(x / P) + 1, r = n * P - x;
    return r < 0 ? 0 : r;
  }

  // belt.advance(b, ds): moves every plate by ds > 0 and returns the crossings in time order:
  // [{ plate, mouth (index into b.mouths), box, at (distance travelled within this call when it happened) }].
  // A ds of a spacing or more is handled in chunks, so no crossing is ever skipped.
  function advance(b, ds) {
    var out = [], done = 0, chunk, i, mi, m, c0, c1, P = b.perimeter, tc, at, start, u0;
    if (!(ds > 0)) return out;
    while (done < ds) {
      chunk = Math.min(ds - done, b.spacing);
      start = out.length;
      for (i = 0; i < b.N; i++) {
        u0 = b.up[i];
        for (mi = 0; mi < b.mouths.length; mi++) {
          m = b.mouths[mi];
          c0 = Math.floor((u0 - m.s) / P);
          c1 = Math.floor((u0 + chunk - m.s) / P);
          while (c1 > c0) {
            c0++;
            tc = c0 * P + m.s;                      // value of up[i] at which the centre is on the mouth
            at = done + Math.min(chunk, Math.max(0, tc - u0));
            out.push({ plate: i, mouth: mi, box: m.box, at: at });
          }
        }
        b.up[i] = u0 + chunk;
        b.pos[i] = norm(b.up[i], P);
      }
      b.travel += chunk;
      b.phase = norm(b.travel, P);
      done += chunk;
      sortFrom(out, start);
    }
    return out;
  }

  function sortFrom(a, start) {
    var i, j, t;
    for (i = start + 1; i < a.length; i++) {
      t = a[i];
      j = i - 1;
      while (j >= start && (a[j].at > t.at || (a[j].at === t.at && (a[j].mouth > t.mouth || (a[j].mouth === t.mouth && a[j].plate > t.plate))))) {
        a[j + 1] = a[j];
        j--;
      }
      a[j + 1] = t;
    }
  }

  // belt.reaching(b, mouthIndex): R26. The plate whose centre is within half a spacing before the mouth
  // ("reaching now"), or -1 when the nearest plate is further away.
  function reaching(b, mouthIndex) {
    var m = b.mouths[mouthIndex], best = -1, bestR = Infinity, i, r;
    for (i = 0; i < b.N; i++) {
      r = remaining(b, i, m);
      if (r < bestR) { bestR = r; best = i; }
    }
    return bestR <= b.spacing / 2 ? best : -1;
  }

  // belt.nextFree(b, mouthIndex, isFree): the plate that reaches this mouth next and for which isFree(plate) is
  // true, or -1.
  function nextFree(b, mouthIndex, isFree) {
    var m = b.mouths[mouthIndex], best = -1, bestR = Infinity, i, r;
    for (i = 0; i < b.N; i++) {
      if (!isFree(i)) continue;
      r = remaining(b, i, m);
      if (r < bestR) { bestR = r; best = i; }
    }
    return best;
  }

  // belt.nearest(b, mouthIndex, isFree): the free plate closest to the mouth by arc distance, on either side; on a tie
  // the one behind the mouth (not yet crossed). -1 when none is free.
  function nearest(b, mouthIndex, isFree) {
    var m = b.mouths[mouthIndex], best = -1, bestD = Infinity, i, d, a;
    for (i = 0; i < b.N; i++) {
      if (!isFree(i)) continue;
      d = signed(b.pos[i], m.s, b.perimeter);        // < 0: behind the mouth
      a = Math.abs(d);
      if (a < bestD - 1e-9 || (Math.abs(a - bestD) <= 1e-9 && d < 0)) {
        bestD = a;
        best = i;
      }
    }
    return best;
  }

  // belt.dropBehind(b, plate, mouthIndex, offset, width): lifts the plate out of where it is and puts it `offset`
  // units behind the mouth, stepping further back (by a quarter width) while another plate is closer than 0.9 width.
  // -> { pos (travel units), offset (the offset actually used) }
  function dropBehind(b, plate, mouthIndex, offset, width) {
    var P = b.perimeter, m = b.mouths[mouthIndex], step = width * 0.25, o = offset, tries = 0, p, j, ok;
    for (;;) {
      p = norm(m.s - o, P);
      ok = true;
      for (j = 0; j < b.N; j++) {
        if (j !== plate && Math.abs(signed(b.pos[j], p, P)) < 0.9 * width) { ok = false; break; }
      }
      if (ok || tries++ > P / step + 2) break;
      o += step;
    }
    teleport(b, plate, p);
    return { pos: p, offset: o };
  }

  // belt.teleport(b, plate, pos): puts the plate at an arc position (travel units), counting no crossing on the way
  function teleport(b, plate, pos) {
    var p = norm(pos, b.perimeter);
    b.pos[plate] = p;
    b.up[plate] = p;
  }

  // belt.timeToMouth(b, plate, mouthIndex, speed): ms until that plate's centre next reaches the mouth
  function timeToMouth(b, plate, mouthIndex, speed) {
    return remaining(b, plate, b.mouths[mouthIndex]) / speed;
  }

  // belt.mouthIndex(b, boxIndex): index into b.mouths of that box's mouth, or -1
  function mouthIndex(b, boxIndex) {
    var i;
    for (i = 0; i < b.mouths.length; i++) if (b.mouths[i].box === boxIndex) return i;
    return -1;
  }

  PL.belt = {
    create: create, platePos: platePos, travelPos: travelPos, advance: advance, nextFree: nextFree, nearest: nearest,
    dropBehind: dropBehind, teleport: teleport, reaching: reaching, timeToMouth: timeToMouth, mouthIndex: mouthIndex,
    EPS: EPS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.belt;
})(typeof window !== 'undefined' ? window : globalThis);
