// src/render.js: draws a sim state on the canvas in fake perspective. The camera sits CAM_BACK behind the
// waddle, a little above the road, looking up the road: a point at distance dz ahead projects to
//   sx = cx + X * F / dz,  sy = horizon + CAM_H * F / dz,  with F = 0.85 * screen height
// so things shrink and rise toward the horizon as they get farther. Road x in [-1, 1] is ROAD_W world units.
// Everything that moves is a sprite from assets.js (a bitmap, drawn bottom-anchored at its projected foot);
// numbers, badges and pops are drawn as text on top. Feeds on the sim's events for pops, shakes and confetti.
(function (root) {
  'use strict';
  var PM = root.PM = root.PM || {};
  var C = PM.config;
  var S = PM.sim;
  var A = PM.assets;

  var ROAD_W = 1.6, CAM_H = 3.2, FAR = 400, DRAW_FAR = 95;
  var canvas, ctx, W = 0, H = 0, dpr = 1, F = 0, horizon = 0, cx = 0;
  var pops = [], balls = [], confetti = [], shake = 0, flash = 0, sprinkle = null;
  var formation = [];

  // a sunflower layout for the waddle: penguin i sits at a distance ~sqrt(i) from the centre, stretched along z
  (function () {
    var golden = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < C.DRAW_CAP; i++) {
      var r = 0.062 * Math.sqrt(i + 0.5), a = i * golden;
      formation.push({ x: Math.max(-0.3, Math.min(0.3, r * Math.cos(a))), z: r * Math.sin(a) * 1.7, phase: (i * 0.37) % 1 });
    }
  })();

  function init(c) {
    canvas = c; ctx = c.getContext('2d');
    resize();
  }

  function resize() {
    dpr = Math.min(2, root.devicePixelRatio || 1);
    W = canvas.clientWidth || root.innerWidth; H = canvas.clientHeight || root.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    F = 0.85 * H; horizon = 0.27 * H; cx = W / 2;
    ROAD_W = 1.6 * Math.min(1.7, Math.max(1, (W / H) / 0.62));   // a wide screen gets a wider road (and bigger sprites)
  }

  function project(dz, x) {
    var s = F / dz;
    return { sx: cx + x * ROAD_W * s, sy: horizon + CAM_H * s, s: s };
  }
  /** px per road x-unit at the waddle's depth (input mapping). */
  function toRoadX(clientX) { return (clientX - cx) / (ROAD_W * F / C.CAM_BACK); }

  function fmt(n) {
    n = Math.round(n);
    if (n < 10000) return String(n);
    if (n < 1e6) return (n / 1e3).toFixed(n < 1e5 ? 1 : 0) + 'K';
    if (n < 1e9) return (n / 1e6).toFixed(n < 1e8 ? 1 : 0) + 'M';
    return (n / 1e9).toFixed(1) + 'B';
  }

  function text(str, x, y, size, color, align, outline) {
    ctx.font = '900 ' + Math.round(size) + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (outline !== false) { ctx.lineWidth = Math.max(2, size * 0.16); ctx.strokeStyle = '#1d2330'; ctx.strokeText(str, x, y); }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
  }

  function pill(str, x, y, size, bg, color) {
    if (size < 8) return;                                   // too far to read: no clutter at the horizon
    ctx.font = '900 ' + Math.round(size) + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    var w = ctx.measureText(str).width + size * 1.1, h = size * 1.5;
    ctx.fillStyle = bg;
    roundRect(x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(str, x, y + size * 0.04);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  /** sprite(name, p, worldW, fallback): draws the sprite bottom-centred at p (a projection), worldW wide in world units. */
  function sprite(name, p, worldW, fallback) {
    var w = worldW * p.s, img = A.get(name);
    if (w < 1) return;
    var h = w * A.aspect(name);
    if (img) ctx.drawImage(img, p.sx - w / 2, p.sy - h, w, h);
    else { ctx.fillStyle = fallback || '#888'; ctx.fillRect(p.sx - w / 2, p.sy - h, w, h); }
    return h;
  }

  function background(state, t) {
    var sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#6fc3f2'); sky.addColorStop(1, '#dff4ff');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon + 1);
    var sea = ctx.createLinearGradient(0, horizon, 0, H);
    sea.addColorStop(0, '#2a6f9e'); sea.addColorStop(1, '#1b4f7a');
    ctx.fillStyle = sea; ctx.fillRect(0, horizon, W, H - horizon);
    // mountains along the horizon, scrolling slowly
    var m = A.get('mountain');
    var mh = 0.11 * H, mw = mh * 4;
    var off = state ? (state.z * 0.6) % mw : 0;
    for (var x = -off - mw; x < W + mw; x += mw) {
      if (m) ctx.drawImage(m, x, horizon - mh + 1, mw, mh);
      else { ctx.fillStyle = '#9ad8f5'; ctx.fillRect(x, horizon - mh * 0.4, mw, mh * 0.4); }
    }
    // icebergs in the sea beside the road, at fixed places on a loop so they pass by
    var camZ = state ? state.z - C.CAM_BACK : 0;
    var loop = 260;
    for (var i = 0; i < 10; i++) {
      var side = i % 2 ? 1 : -1, bz = ((i * 37 + 20) - camZ) % loop; if (bz < 0) bz += loop;
      var dz = bz + 8;
      var p = project(dz, side * (2.2 + (i % 3) * 0.9));
      sprite('iceberg-' + (1 + (i % 3)), p, 2.4, '#dff4ff');
    }
    // the road
    var near = project(0.4, 0), far = project(FAR, 0);
    var nl = project(0.4, -1).sx, nr = project(0.4, 1).sx, fl = project(FAR, -1).sx, fr = project(FAR, 1).sx;
    ctx.fillStyle = '#e8f6ff';
    ctx.beginPath(); ctx.moveTo(nl, near.sy); ctx.lineTo(nr, near.sy); ctx.lineTo(fr, far.sy); ctx.lineTo(fl, far.sy); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#9ad8f5'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(nl, near.sy); ctx.lineTo(fl, far.sy); ctx.moveTo(nr, near.sy); ctx.lineTo(fr, far.sy); ctx.stroke();
    // centre dashes, moving with the road
    ctx.strokeStyle = '#bfe3f5'; ctx.lineWidth = 2;
    var first = Math.floor(camZ / 6) * 6;
    for (var z = first; z < camZ + 160; z += 6) {
      var a = z - camZ, b = a + 3;
      if (b < 0.5) continue;
      var pa = project(Math.max(0.5, a), 0), pb = project(b, 0);
      ctx.lineWidth = Math.max(1, 0.05 * pa.s);
      ctx.beginPath(); ctx.moveTo(pa.sx, pa.sy); ctx.lineTo(pb.sx, pb.sy); ctx.stroke();
    }
  }

  function drawGate(e, p, camZ) {
    var good = S.gateGood(e), w = 1.0 * ROAD_W;
    var h = sprite(good ? 'gate-good' : 'gate-bad', p, w, good ? '#8fc0ff' : '#ff8c8c');
    if (!h) return;
    text(S.gateText(e), p.sx, p.sy - h * 0.5, w * p.s * 0.3, good ? '#eaf4ff' : '#ffe3e3');
  }

  function drawWall(e, p) {
    var w = 2 * e.w * ROAD_W;
    var h = sprite(e.hp < e.hp0 / 2 ? 'wall-cracked' : 'wall', p, w, '#ffffff');
    if (!h) return;
    pill(fmt(Math.ceil(e.hp)), p.sx, p.sy - h - 0.1 * p.s, Math.min(w * p.s * 0.16, 0.035 * H), 'rgba(214,69,69,0.92)', '#fff');
  }

  function drawPack(e, p, t) {
    var count = S.packCount(e), shown = Math.min(count, 10), w = 2 * e.w * ROAD_W;
    for (var i = shown - 1; i >= 0; i--) {
      var ox = ((i * 0.618) % 1 - 0.5) * (2 * e.w - 0.2), oz = ((i * 0.382) % 1) * 1.6;
      var q = project(p.dz + oz, e.x + ox);
      sprite(((t * 5 + i) | 0) % 2 ? 'seal' : 'seal-b', q, 0.2 * ROAD_W, '#8a6a4f');
    }
    pill(fmt(count), p.sx, p.sy - 0.42 * p.s, Math.min(w * p.s * 0.16, 0.035 * H), 'rgba(214,69,69,0.92)', '#fff');
  }

  function drawAlly(e, p) {
    var w = 0.55 * ROAD_W;
    var h = sprite('ice-block', p, w, '#9ad8f5');
    if (!h) return;
    var size = Math.min(w * p.s * 0.3, 0.032 * H);
    pill(e.gift === 'big' ? 'BIG!' : '+' + fmt(e.gift), p.sx, p.sy - h - size * 0.9, size, 'rgba(61,139,255,0.95)', '#fff');
    pill(fmt(Math.ceil(e.hp)), p.sx, p.sy - h * 0.25, size * 0.8, 'rgba(29,35,48,0.75)', '#fff');
  }

  function drawFish(e, p, t) {
    var q = { sx: p.sx, sy: p.sy - Math.sin(t * 4 + e.z) * 0.06 * p.s, s: p.s };
    sprite('fish', q, 0.16 * ROAD_W, '#ffb84d');
  }

  function drawBoss(state, p, t) {
    var boss = state.boss, w = 1.5 * ROAD_W;
    var bob = boss.eating ? Math.abs(Math.sin(t * 8)) * 0.08 * p.s : Math.sin(t * 2) * 0.02 * p.s;
    var q = { sx: p.sx, sy: p.sy - bob, s: p.s };
    var h = sprite('walrus', q, w, '#a0674b');
    if (!h || (state.phase !== 'BOSS' && p.dz > 60)) return;   // the bar only once the fight is near
    var bw = Math.min(W * 0.7, w * p.s * 1.1), bh = Math.max(10, 0.022 * H), by = q.sy - h - bh * 1.4;
    ctx.fillStyle = 'rgba(29,35,48,0.75)'; roundRect(p.sx - bw / 2, by - bh / 2, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = '#d64545'; roundRect(p.sx - bw / 2, by - bh / 2, Math.max(bh, bw * boss.hp / boss.hp0), bh, bh / 2); ctx.fill();
    text(fmt(Math.ceil(boss.hp)), p.sx, by - bh * 1.3, bh * 1.4, '#fff');
  }

  function drawWaddle(state, t) {
    var n = Math.min(state.n, C.DRAW_CAP), camZ = state.z - C.CAM_BACK, items = [];
    for (var i = 0; i < n; i++) {
      var f = formation[i];
      items.push({ dz: state.z + f.z - camZ, x: Math.max(-0.95, Math.min(0.95, state.x + f.x)), i: i });
    }
    items.sort(function (a, b) { return b.dz - a.dz; });
    for (var k = 0; k < items.length; k++) {
      var it = items[k], p = project(it.dz, it.x);
      var frame = ((t * 7 + formation[it.i].phase * 2) | 0) % 2 ? 'penguin-a' : 'penguin-b';
      sprite(it.i === 0 && state.big ? 'penguin-big' : frame, p, 0.2 * ROAD_W, '#1d2330');
    }
    var top = project(C.CAM_BACK + 1.1, state.x);
    pill(fmt(state.n), top.sx, top.sy - 0.5 * top.s, 0.03 * H, state.n < 10 ? 'rgba(214,69,69,0.9)' : 'rgba(61,139,255,0.92)', '#fff');
  }

  /** events(list, state): consume sim events for pops, sounds and shakes. */
  function events(list, state) {
    var au = PM.audio;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      switch (e.type) {
        case 'gate': pops.push({ text: e.text, x: e.x, z: e.z, t0: now, good: e.good, big: true }); au.play(e.good ? 'gateGood' : 'gateBad'); break;
        case 'bump': au.play('bump'); break;
        case 'kill': pops.push({ text: e.text, x: e.x + (Math.random() - 0.5) * 0.4, z: e.z, t0: now, good: true, small: true }); break;
        case 'break': au.play('break'); sprinkle = { x: e.x, z: e.z, t0: now }; break;
        case 'hit': pops.push({ text: e.text, x: e.x, z: e.z, t0: now, good: false, big: true }); au.play('hit'); flash = 0.25; break;
        case 'eat': pops.push({ text: e.text, x: state.x, z: state.z + 1, t0: now, good: false }); flash = 0.15; break;
        case 'pickup': pops.push({ text: e.text, x: e.x, z: e.z, t0: now, good: true, small: true }); au.play('pickup'); break;
        case 'ally': pops.push({ text: e.text, x: e.x, z: e.z, t0: now, good: true, big: true }); au.play('ally'); break;
        case 'boss': shake = 0.12; au.play('boss'); break;
        case 'win': burst(); au.play('win'); break;
        case 'bossStart': shake = 0.3; break;
      }
    }
  }

  function burst() {
    confetti.length = 0;
    for (var i = 0; i < 90; i++) confetti.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 60, vy: 120 + Math.random() * 160, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 6, c: ['#3d8bff', '#ffb84d', '#ffffff', '#d64545', '#8fc0ff'][i % 5], w: 6 + Math.random() * 8 });
  }

  var now = 0;
  /** draw(state, t, dt): one frame. state may be null (menus): background only. */
  function draw(state, t, dt) {
    now = t;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    if (shake > 0) { shake -= dt; ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8); }
    background(state, t);
    if (state) {
      var camZ = state.z - C.CAM_BACK, items = [];
      for (var i = 0; i < state.entities.length; i++) {
        var e = state.entities[i];
        if (!e.alive) continue;
        var dz = e.z - camZ;
        if (dz < 0.5 || dz > DRAW_FAR) continue;
        items.push({ dz: dz, e: e });
      }
      if (state.boss.hp > 0 && state.boss.z - camZ <= DRAW_FAR) items.push({ dz: state.boss.z - camZ, boss: true });
      items.sort(function (a, b) { return b.dz - a.dz; });
      var waddleDrawn = false;
      for (var k = 0; k < items.length; k++) {
        var it = items[k];
        if (!waddleDrawn && it.dz < C.CAM_BACK - 1.2) { drawWaddle(state, t); waddleDrawn = true; }
        var p = it.boss ? project(it.dz, 0) : project(it.dz, it.e.x);
        p.dz = it.dz;
        if (it.boss) drawBoss(state, p, t);
        else if (it.e.type === 'gate') drawGate(it.e, p, camZ);
        else if (it.e.type === 'wall') drawWall(it.e, p);
        else if (it.e.type === 'pack') drawPack(it.e, p, t);
        else if (it.e.type === 'ally') drawAlly(it.e, p);
        else if (it.e.type === 'fish') drawFish(it.e, p, t);
      }
      if (!waddleDrawn) drawWaddle(state, t);
      snowballs(state, t, dt, camZ);
      drawPops(camZ);
    }
    ctx.restore();
    if (flash > 0) { flash -= dt; ctx.fillStyle = 'rgba(214,69,69,' + (flash * 1.2).toFixed(2) + ')'; ctx.fillRect(0, 0, W, H); }
    drawConfetti(dt);
    drawBanner();
  }

  function snowballs(state, t, dt, camZ) {
    var target = state.phase === 'BOSS' ? { x: 0, z: state.boss.z, w: 0.4 } : (state.phase === 'RUN' ? S.target(state) : null);
    if (target) {
      var rate = Math.min(40, S.shotsPerSecond(state));
      var k = Math.floor(rate * dt + Math.random());
      for (var i = 0; i < k && balls.length < 120; i++) {
        var f = formation[Math.floor(Math.random() * Math.min(state.n, 40))];
        balls.push({ x0: state.x + f.x, z0: state.z + f.z, x1: Math.max(target.x - target.w, Math.min(target.x + target.w, state.x + (Math.random() - 0.5) * 0.5)), z1: target.z, t0: t, dur: 0.25 + (target.z - state.z) * 0.012 });
      }
      if (k) PM.audio.play('shoot');
    }
    for (var j = balls.length - 1; j >= 0; j--) {
      var b = balls[j], p = (t - b.t0) / b.dur;
      if (p >= 1) { balls.splice(j, 1); continue; }
      var z = b.z0 + (b.z1 - b.z0) * p, x = b.x0 + (b.x1 - b.x0) * p;
      var q = project(z - camZ, x);
      q.sy -= (0.25 + Math.sin(p * Math.PI) * 0.4) * q.s;
      sprite('snowball', q, 0.07 * ROAD_W, '#fff');
    }
    if (sprinkle && t - sprinkle.t0 < 0.4) {
      var q2 = project(sprinkle.z - camZ, sprinkle.x), a = 1 - (t - sprinkle.t0) / 0.4;
      ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')';
      for (var s = 0; s < 10; s++) { var ang = s * 0.63, r = (1 - a) * 0.6 * q2.s; ctx.beginPath(); ctx.arc(q2.sx + Math.cos(ang) * r, q2.sy - 0.2 * q2.s - Math.sin(ang) * r, Math.max(1, 0.03 * q2.s), 0, 7); ctx.fill(); }
    } else sprinkle = null;
  }

  function drawPops(camZ) {
    for (var i = pops.length - 1; i >= 0; i--) {
      var o = pops[i], p = (now - o.t0) / 0.9;
      if (p >= 1) { pops.splice(i, 1); continue; }
      var q = project(Math.max(0.6, o.z - camZ), o.x);
      ctx.globalAlpha = 1 - p * p;
      text(o.text, q.sx, q.sy - 0.5 * q.s - p * 0.06 * H, (o.big ? 0.05 : o.small ? 0.025 : 0.035) * H, o.good ? '#8fc0ff' : '#ff8c8c');
      ctx.globalAlpha = 1;
    }
  }

  function drawConfetti(dt) {
    for (var i = confetti.length - 1; i >= 0; i--) {
      var c = confetti[i];
      c.x += c.vx * dt; c.y += c.vy * dt; c.r += c.vr * dt;
      if (c.y > H + 20) { confetti.splice(i, 1); continue; }
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.fillStyle = c.c; ctx.fillRect(-c.w / 2, -c.w / 4, c.w, c.w / 2); ctx.restore();
    }
  }

  var bannerText = '', bannerT = -10;
  /** banner(text): a big line across the screen for a moment (milestones). */
  function banner(text) { bannerText = text; bannerT = now; }
  function drawBanner() {
    var p = (now - bannerT) / 1.4;
    if (p < 0 || p >= 1 || !bannerText) return;
    var a = p < 0.15 ? p / 0.15 : p > 0.75 ? (1 - p) / 0.25 : 1;
    ctx.globalAlpha = a;
    var size = Math.min(0.075 * H, W / (bannerText.length * 0.62));
    text(bannerText, cx, horizon * 0.55 - (p - 0.5) * 0.03 * H, size, '#ffb84d');
    ctx.globalAlpha = 1;
  }

  function clearEffects() { pops.length = 0; balls.length = 0; confetti.length = 0; shake = 0; flash = 0; sprinkle = null; bannerT = -10; }

  PM.render = { init: init, resize: resize, draw: draw, events: events, toRoadX: toRoadX, fmt: fmt, clearEffects: clearEffects, burst: burst, project: project, banner: banner,
    size: function () { return { W: W, H: H }; }, roadW: function () { return ROAD_W; } };
})(typeof window !== 'undefined' ? window : globalThis);
