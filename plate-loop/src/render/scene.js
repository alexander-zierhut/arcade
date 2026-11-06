// src/render/scene.js: the canvas scene of Plate Loop (counter, belt, plates, boxes, modifiers, effects).
// Reads the sim and never changes it. The static layers (counter + belt + box bodies, and the covers) are cached in
// offscreen canvases and redrawn only when the size, a box's modifier state or a few flags change.
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};

  var C = {
    counter: '#22303A', grain: '#2B3C47', belt: '#4A5361', beltDark: '#262E38', beltLight: '#6B7584',
    strip: '#3FD47A', stripFull: '#FF4D4D', chevron: '#6B7584',
    kraft: '#D9A86C', kraftDark: '#B8864A', kraftLid: '#DDAE72', tray: '#F1DDB3', groove: '#E9D2A0', grooveLine: '#D2B27A', hiddenTile: '#8A93A1',
    ink: '#2A1A12', cream: '#F4EBDD', steel: '#B8C0CC', steelDark: '#7E8794', steelLight: '#E3E8EF',
    ice: '#BDEBFF', iceDark: '#7FC8E8'
  };
  var DEFAULT_NAMES = ['salmon', 'tuna', 'tamago', 'ebi', 'unagi', 'ikura', 'kappa', 'tekka', 'california', 'inari', 'tako', 'uni'];
  var DEFAULT_COLOURS = ['#F28C6B', '#C8102E', '#FFD23F', '#FF69B4', '#7B4B2A', '#FF8C00', '#2E7D32', '#6A1B9A', '#26A5C9', '#3F51B5', '#D8A7D0', '#8BC34A'];
  var LOCK_COLOURS = { A: '#3BA55D', B: '#4F7CFF', C: '#F2C14E', D: '#E05297' };
  var LOCK_FALLBACK = ['#3BA55D', '#4F7CFF', '#F2C14E', '#E05297'];
  // where the visual centre sits inside each sprite (fraction of its height), so pieces sit on plates and in slots
  var ANCHOR = { plate: 29 / 64, cloche: 31 / 64, piece: 34 / 64 };

  var LID_MS = 170, SHAKE_MS = 400, HATCH_MS = 380;   // HATCH_MS: a plate sinks through its trapdoor / rises at the mouth
  var PLAIN = { body: '#56637A', bodyDark: '#3E4A5C', tray: '#2C3644', slot: '#36414F', lid: '#6B7A93', hidden: '#5F6672', hiddenInk: '#C9D1DC', ice: '#9ED8F2', steel: '#A9B2BE', steelDark: '#6F7885' };
  var PIECE_W = 38, BOX_PIECE_W = 28;
  var TILE_ALONG = 2.5, TILE_ACROSS = 13;

  function cfg() { return PL.config || {}; }
  function kindNames() { return cfg().KIND_NAMES || DEFAULT_NAMES; }
  function kindColours() { return cfg().KIND_COLOURS || DEFAULT_COLOURS; }
  function slideMs() { return cfg().SLIDE_MS || 250; }
  function lockColour(id) {
    if (LOCK_COLOURS[id]) return LOCK_COLOURS[id];
    var h = 0, s = String(id), i;
    for (i = 0; i < s.length; i++) h += s.charCodeAt(i);
    return LOCK_FALLBACK[h % LOCK_FALLBACK.length];
  }

  function easeOut(p) { p = p < 0 ? 0 : p > 1 ? 1 : p; return 1 - Math.pow(1 - p, 3); }
  function easeIn(p) { p = p < 0 ? 0 : p > 1 ? 1 : p; return p * p; }
  function linear(p) { return p < 0 ? 0 : p > 1 ? 1 : p; }
  function easeInOut(p) { p = p < 0 ? 0 : p > 1 ? 1 : p; return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
  function clamp01(p) { return p < 0 ? 0 : p > 1 ? 1 : p; }

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  function create(canvas, tpl) {
    var ctx = canvas.getContext('2d');
    var spr = function () { return PL.sprites; };
    var dpr = 1, W = 0, H = 0, L = null, k = 1;
    var bodyCv = root.document.createElement('canvas'), bodyCtx = bodyCv.getContext('2d');
    var coverCv = root.document.createElement('canvas'), coverCtx = coverCv.getContext('2d');
    var lowPerfOn = false, noLuckOn = false, plainOn = false, streamOn = false, streamPref = false, map = null, mapKey = '';   // plain graphics always use the stream (no plates)
    var streams = {}, poured = {}, drains = [];   // stream style: particles per piece id, the eject time per piece id, streams being sucked into a box
    var sim = null, st = null, boxes = [], idIndex = {}, locks = {};
    var sm = PL.layout.sampler(tpl);
    var beltPts = PL.layout.samplePath(tpl, 5);
    var beltNormalSign = 1;
    var plateD = tpl.plate || 40;
    var sig = '', dirty = true, lastSpriteVersion = -1;
    var clock = 0, T = 0, lastDrawT = -1e9;
    var queue = [], anims = [], flights = [], shake = {}, lidAt = {}, prev = [];
    var fullNow = false, status = 'play';
    var platePos = [], drawnPos = [], ejecting = {}, landing = {}, rebuilds = 0;
    var teles = [], teleOf = {}, prevT = 0;   // teleports: a plate sinks at its old place and rises behind the mouth while its piece slides out of the box

    // ---- geometry helpers ------------------------------------------------------------------------
    function makeBox(i, id) {
      var s = tpl.slots[id];
      if (!s) return { i: i, id: id, missing: true, x: -999, y: -999, w: 1, h: 1, cx: -999, cy: -999, rot: 0, ux: 1, uy: 0, L: 1, Wd: 1, vert: false, flap: 1 };
      var m = s.mouth, rot = m === 'right' ? 0 : m === 'down' ? Math.PI / 2 : m === 'left' ? Math.PI : -Math.PI / 2;
      var horiz = m === 'right' || m === 'left';
      return {
        i: i, id: id, x: s.x, y: s.y, w: s.w, h: s.h, cx: s.x + s.w / 2, cy: s.y + s.h / 2, rot: rot,
        ux: Math.round(Math.cos(rot)), uy: Math.round(Math.sin(rot)), L: horiz ? s.w : s.h, Wd: horiz ? s.h : s.w,
        vert: !horiz, mouth: m, s: s.s, flap: 1
      };
    }
    function pitchOf(b) { return (b.L - 16) / 4; }
    function slotPos(b, j) {
      var pitch = pitchOf(b), u = -b.L / 2 + (b.L - 4 * pitch) + pitch * (j + 0.5);
      return { x: b.cx + b.ux * u, y: b.cy + b.uy * u };
    }
    function mouthPos(b) { return { x: b.cx + b.ux * b.L / 2, y: b.cy + b.uy * b.L / 2 }; }

    function bind(newSim) {
      sim = newSim; st = sim.state; status = 'play';
      boxes = []; idIndex = {}; locks = {};
      var i;
      for (i = 0; i < st.boxes.length; i++) { boxes.push(makeBox(i, st.boxes[i].id)); idIndex[st.boxes[i].id] = i; }
      var cw = st.dir !== 'ccw';
      for (i = 0; i < boxes.length; i++) {
        var b = boxes[i];
        if (b.s != null && !b.missing) {
          var a = sm.pointAt(b.s).angle + (cw ? 0 : Math.PI);
          var dot = Math.cos(a) * (-b.uy) + Math.sin(a) * b.ux;
          b.flap = dot >= 0 ? 1 : -1;
        }
      }
      // belt outward normal sign (strip on the outer edge)
      var cx = 0, cy = 0, n = beltPts.length, acc = 0, p;
      for (i = 0; i < n; i++) { cx += beltPts[i].x; cy += beltPts[i].y; }
      cx /= n; cy /= n;
      for (i = 0; i < n; i++) { p = beltPts[i]; acc += (-Math.sin(p.angle)) * (p.x - cx) + Math.cos(p.angle) * (p.y - cy); }
      beltNormalSign = acc >= 0 ? 1 : -1;
      queue = []; anims = []; flights = []; shake = {}; lidAt = {}; prev = []; teles = []; teleOf = {};
      streams = {}; poured = {}; drains = [];
      sig = ''; dirty = true;
    }

    function boxIndexOf(ref) {
      if (typeof ref === 'number') return ref;
      if (ref && typeof ref === 'object') return ref.index != null ? ref.index : idIndex[ref.id];
      return idIndex[ref] != null ? idIndex[ref] : -1;
    }

    // ---- kinds ---------------------------------------------------------------------------------
    function spriteIndex(kind) { return map && map[kind] != null ? map[kind] : kind; }
    function kindName(kind) { var n = kindNames()[spriteIndex(kind)]; return n || 'salmon'; }
    function kindColour(kind) { var n = kindColours()[spriteIndex(kind)]; return n || '#F28C6B'; }

    // ---- sprite drawing -------------------------------------------------------------------------
    function drawCv(c, cv, anchor, x, y, w, alpha, rot) {
      var h = w * cv.height / cv.width;
      if (alpha != null && alpha < 1) c.globalAlpha = alpha;
      if (rot) {
        c.save(); c.translate(x, y); c.rotate(rot);
        c.drawImage(cv, -w / 2, -anchor * h, w, h);
        c.restore();
      } else {
        c.drawImage(cv, x - w / 2, y - anchor * h, w, h);
      }
      if (alpha != null && alpha < 1) c.globalAlpha = 1;
    }
    function dot(c, x, y, r, fill) {
      c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fillStyle = fill; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = C.ink; c.stroke();
    }
    // draw a named sprite or a flat placeholder when it is missing
    function sprite(c, name, x, y, w, alpha, rot, colour) {
      var s = spr(), cv = s ? s.get(name) : null;
      if (cv) { drawCv(c, cv, ANCHOR[name] != null ? ANCHOR[name] : 0.5, x, y, w, alpha, rot); return; }
      if (alpha != null && alpha < 1) c.globalAlpha = alpha;
      if (name === 'plate') dot(c, x, y, w * 0.42, C.cream);
      else if (name === 'cloche') dot(c, x, y, w * 0.36, C.steel);
      else if (name === 'stamp') dot(c, x, y, w * 0.36, '#3BA55D');
      else if (name === 'noreturn') dot(c, x, y, w * 0.4, C.steel);
      else if (name === 'clip') { c.fillStyle = '#D9B36A'; c.fillRect(x - w * 0.4, y - 3, w * 0.8, 6); }
      else dot(c, x, y - w * 0.04, w * 0.3, colour || '#999');
      if (alpha != null && alpha < 1) c.globalAlpha = 1;
    }
    function tintedSprite(c, name, hex, x, y, w, alpha) {
      var s = spr(), cv = s ? s.tinted(name, hex) : null;
      if (cv && cv.width > 0) { drawCv(c, cv, 0.5, x, y, w, alpha, 0); return; }
      if (name === 'padlock') { c.fillStyle = hex; rr(c, x - w * 0.3, y - w * 0.15, w * 0.6, w * 0.45, 3); c.fill(); c.lineWidth = 1.5; c.strokeStyle = C.ink; c.stroke(); }
      else { c.fillStyle = hex; rr(c, x - w * 0.3, y - w * 0.3, w * 0.45, w * 0.35, 3); c.fill(); c.lineWidth = 1.5; c.strokeStyle = C.ink; c.stroke(); }
    }
    function drawPiece(c, kind, x, y, w, alpha) {
      if (plainOn) return;                                   // the colour tile under it is the cube
      sprite(c, kindName(kind), x, y, w, alpha, 0, kindColour(kind));
    }
    // a simple key glyph (plain mode): ring and bit in the lock's colour, ink outline
    function plainKey(c, hex, x, y, w) {
      var r = w * 0.17;
      c.save(); c.translate(x, y); c.rotate(-0.7);
      c.fillStyle = hex; c.strokeStyle = C.ink; c.lineWidth = 1.4; c.lineJoin = 'round';
      c.beginPath(); c.rect(-r * 0.35, -r * 0.3, w * 0.62, r * 0.6); c.fill(); c.stroke();
      c.beginPath(); c.rect(w * 0.35, -r * 0.3, r * 0.55, r * 1.1); c.fill(); c.stroke();
      c.beginPath(); c.arc(0, 0, r, 0, 6.2832); c.fill(); c.stroke();
      c.beginPath(); c.arc(0, 0, r * 0.4, 0, 6.2832); c.fillStyle = C.ink; c.fill();
      c.restore();
    }
    function drawKeyTag(c, lockId, x, y, w) {
      if (plainOn) { plainKey(c, lockColour(lockId), x + w * 0.22, y - w * 0.3, w * 0.7); return; }
      tintedSprite(c, 'keytag', lockColour(lockId), x + w * 0.5, y - w * 0.42, w * 0.78, 1);
    }
    // the covered piece: a cloche on a steel tile, or (plain) a dark tile with a question mark
    function drawHidden(c, b, x, y, alpha) {
      var side = slotSide(b);
      if (plainOn) {
        colourPlate(c, x, y, side, PLAIN.hidden, alpha, false);
        c.save(); if (alpha != null && alpha < 1) c.globalAlpha = alpha;
        c.fillStyle = PLAIN.hiddenInk; c.font = '900 ' + Math.round(side * 0.72) + 'px ' + 'system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('?', x, y + side * 0.03);
        c.restore();
        return;
      }
      slotTile(c, b, x, y, C.hiddenTile, alpha);
      sprite(c, 'cloche', x, y, BOX_PIECE_W + 3, alpha);
    }
    function drawClip(c, x, y, w, alpha, rot) {
      if (plainOn) {
        c.save(); c.translate(x, y); c.rotate(rot || 0); if (alpha != null && alpha < 1) c.globalAlpha = alpha;
        rr(c, -w * 0.28, -3, w * 0.56, 6, 3); c.fillStyle = '#E9D8B0'; c.fill(); c.lineWidth = 1.4; c.strokeStyle = C.ink; c.stroke();
        c.fillStyle = C.ink; c.beginPath(); c.arc(-w * 0.2, 0, 1.8, 0, 6.2832); c.arc(w * 0.2, 0, 1.8, 0, 6.2832); c.fill();
        c.restore(); c.globalAlpha = 1;
        return;
      }
      sprite(c, 'clip', x, y, w, alpha, rot);
    }
    // a solid plate in the kind's colour: lighter rim ring, ink outline, darker lower edge. d = diameter in units.
    function lighter(hex, f) {
      var h = String(hex).replace('#', ''), out = '#', i;
      for (i = 0; i < 3; i++) {
        var v = parseInt(h.substr(i * 2, 2), 16);
        v = Math.round(v + (255 - v) * f).toString(16);
        out += v.length < 2 ? '0' + v : v;
      }
      return out;
    }
    // a rounded-square plate: rim (20 % lighter than the fill), ink outline, darker lower edge. side in units.
    function squarePlate(c, x, y, side, rim, fill, dk, alpha, shadow) {
      var x0 = x - side / 2, y0 = y - side / 2, r = side * 0.22, ins = side * 0.11;
      if (alpha != null && alpha < 1) c.globalAlpha = alpha;
      if (shadow && !lowPerfOn) { rr(c, x0, y0 + 2.4, side, side, r); c.fillStyle = 'rgba(42,26,18,0.28)'; c.fill(); }
      rr(c, x0, y0, side, side, r); c.fillStyle = rim; c.fill();
      rr(c, x0 + ins, y0 + ins, side - 2 * ins, side - 2 * ins, r * 0.6); c.fillStyle = dk; c.fill();
      rr(c, x0 + ins, y0 + ins, side - 2 * ins, side - 2 * ins - Math.max(1.2, side * 0.05), r * 0.6); c.fillStyle = fill; c.fill();
      rr(c, x0, y0, side, side, r); c.lineWidth = 1.2; c.strokeStyle = C.ink; c.stroke();
      if (alpha != null && alpha < 1) c.globalAlpha = 1;
    }
    function colourPlate(c, x, y, side, hex, alpha, shadow) {
      squarePlate(c, x, y, side, lighter(hex, 0.2), hex, spr() ? spr().darker(hex, 0.15) : hex, alpha, shadow);
    }
    function emptyPlate(c, x, y, side) { squarePlate(c, x, y, side, '#D9CBB5', '#F4EBDD', '#C9B89F', 1, true); }
    function drawTile(c, x, y, side, hex, alpha) { colourPlate(c, x, y, side, hex, alpha, false); }
    function slotSide(b) { return pitchOf(b) * 0.92; }
    function slotTile(c, b, x, y, hex, alpha) { colourPlate(c, x, y, slotSide(b), hex, alpha, false); }
    function plateDisc(c, x, y, hex, alpha) { colourPlate(c, x, y, plateD, hex, alpha, false); }
    function keyActive(piece) {
      if (piece.key == null) return false;
      var lk = st.locks && st.locks[piece.key];
      return !(lk && lk.open);
    }

    // ---- static: counter and belt ---------------------------------------------------------------
    function drawCounter(c, w, h) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = C.counter; c.fillRect(0, 0, w, h);
      if (plainOn) return;
      // faint wood grain: long wavy lines, a few of them broken by knots
      c.lineWidth = Math.max(1, dpr * 0.9);
      var step = 13 * dpr, y, seed = 7, x;
      for (y = step * 0.5; y < h; y += step) {
        seed = (seed * 9301 + 49297) % 233280;
        var r = seed / 233280;
        c.strokeStyle = 'rgba(43,60,71,' + (0.55 + r * 0.45).toFixed(3) + ')';
        c.beginPath();
        var ph = r * 6.28, amp = (1.2 + r * 2.2) * dpr, fq = 0.004 + r * 0.004;
        for (x = -10; x <= w + 10; x += 24 * dpr) {
          var yy = y + Math.sin(x * fq / dpr * 1 + ph) * amp;
          if (x < 0) c.moveTo(x, yy); else c.lineTo(x, yy);
        }
        c.stroke();
      }
    }

    function beltPath(c, off) {
      var i, n = beltPts.length, p;
      c.beginPath();
      for (i = 0; i < n; i++) {
        p = beltPts[i];
        var x = p.x, y = p.y;
        if (off) { x += -Math.sin(p.angle) * off * beltNormalSign; y += Math.cos(p.angle) * off * beltNormalSign; }
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath();
    }

    function drawBelt(c, full) {
      var band = plateD + 4, i, p, n = beltPts.length;
      c.lineJoin = 'round'; c.lineCap = 'round';
      if (!lowPerfOn) {
        c.save(); c.translate(0, 3.5);
        beltPath(c, 0); c.lineWidth = band + 6; c.strokeStyle = 'rgba(0,0,0,0.38)'; c.stroke();
        c.restore();
      }
      beltPath(c, 0); c.lineWidth = band + 4; c.strokeStyle = C.beltDark; c.stroke();
      c.save(); c.translate(0, -2.2);
      beltPath(c, 0); c.lineWidth = band; c.strokeStyle = C.beltLight; c.stroke();
      c.restore();
      beltPath(c, 0); c.lineWidth = band; c.strokeStyle = C.belt; c.stroke();
      // light strip along the outer edge
      beltPath(c, band / 2 - 3.2); c.lineWidth = 3.2; c.strokeStyle = full ? C.stripFull : C.strip; c.stroke();
      // chevrons along the travel direction
      var ccw = st && st.dir === 'ccw', every = Math.max(1, Math.round(46 / (sm.perimeter / n)));
      c.strokeStyle = C.chevron; c.lineWidth = 2.4;
      for (i = 0; i < n; i += every) {
        p = beltPts[i];
        var a = p.angle + (ccw ? Math.PI : 0), ca = Math.cos(a), sa = Math.sin(a);
        c.beginPath();
        c.moveTo(p.x - ca * 3 - sa * 5, p.y - sa * 3 + ca * 5);
        c.lineTo(p.x + ca * 3, p.y + sa * 3);
        c.lineTo(p.x - ca * 3 + sa * 5, p.y - sa * 3 - ca * 5);
        c.stroke();
      }
    }

    // ---- static: box bodies ---------------------------------------------------------------------
    // box bodies from sprites box-open / box-closed (viewBox 132 x 44 = the box rect, no overhang)
    function boxSprite(closed) {
      var sp = spr(), cv = sp ? sp.get(closed ? 'box-closed' : 'box-open') : null;
      return cv && cv.width > 0 ? cv : null;
    }
    function drawBoxSprite(c, b, cv) {
      c.save(); c.translate(b.cx, b.cy);
      if (b.mouth === 'left') c.scale(-1, 1); else c.rotate(b.rot);   // left: mirrored so the flap stays on top
      c.drawImage(cv, -b.L / 2, -b.Wd / 2, b.L, b.Wd);
      c.restore();
    }
    function drawPlainBody(c, b, closed, kindOfClosed) {
      var Lb = b.L, Wd = b.Wd, hx = Lb / 2, hy = Wd / 2, j, pitch = pitchOf(b), x0 = -hx + (Lb - 4 * pitch), tp = hy - 5;
      c.save(); c.translate(b.cx, b.cy); c.rotate(b.rot);
      rr(c, -hx, -hy + 3, Lb, Wd, 7); c.fillStyle = PLAIN.bodyDark; c.fill();
      rr(c, -hx, -hy, Lb, Wd, 7); c.fillStyle = closed ? (kindOfClosed != null ? kindColour(kindOfClosed) : PLAIN.lid) : PLAIN.body; c.fill();
      c.lineWidth = 2; c.strokeStyle = C.ink; c.stroke();
      if (closed) {
        // a big check mark on the lid
        c.lineWidth = Math.max(4, Wd * 0.14); c.strokeStyle = 'rgba(20,24,30,0.78)'; c.lineCap = 'round'; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(-Wd * 0.3, 0); c.lineTo(-Wd * 0.05, hy * 0.45); c.lineTo(Wd * 0.42, -hy * 0.45); c.stroke();
        c.restore();
        return;
      }
      // the tray, open at the mouth
      c.beginPath();
      c.moveTo(hx + 1.3, -tp); c.lineTo(-hx + 9, -tp); c.quadraticCurveTo(-hx + 5, -tp, -hx + 5, -tp + 4);
      c.lineTo(-hx + 5, tp - 4); c.quadraticCurveTo(-hx + 5, tp, -hx + 9, tp); c.lineTo(hx + 1.3, tp);
      c.fillStyle = PLAIN.tray; c.fill(); c.lineWidth = 1.4; c.strokeStyle = 'rgba(0,0,0,0.35)'; c.stroke();
      for (j = 0; j < 4; j++) { rr(c, x0 + j * pitch + 1.5, -tp + 2.5, pitch - 3, 2 * tp - 5, 4); c.fillStyle = PLAIN.slot; c.fill(); }
      c.restore();
    }
    function drawBoxBody(c, b, closed, kindOfClosed) {
      var Lb = b.L, Wd = b.Wd, hx = Lb / 2, hy = Wd / 2, j;
      var bsp = plainOn ? null : boxSprite(closed);
      if (!lowPerfOn && !plainOn) {
        c.save(); c.translate(b.cx + 1.5, b.cy + 6); c.rotate(b.rot);
        rr(c, -hx - 1, -hy - 1, Lb + 2, Wd + 2, 8); c.fillStyle = 'rgba(0,0,0,0.32)'; c.fill();
        c.restore();
      }
      if (plainOn) { drawPlainBody(c, b, closed, kindOfClosed); return; }
      if (bsp) {
        if (closed) drawLidTop(c, b, kindOfClosed); else drawBoxSprite(c, b, bsp);
        return;
      }
      c.save(); c.translate(b.cx, b.cy + 3.5); c.rotate(b.rot);
      rr(c, -hx, -hy, Lb, Wd, 7); c.fillStyle = C.kraftDark; c.fill(); c.lineWidth = 2; c.strokeStyle = C.ink; c.stroke();
      c.restore();
      if (closed) { drawLidTop(c, b, kindOfClosed); return; }
      c.save(); c.translate(b.cx, b.cy); c.rotate(b.rot);
      rr(c, -hx, -hy, Lb, Wd, 7); c.fillStyle = C.kraft; c.fill(); c.lineWidth = 2; c.strokeStyle = C.ink; c.stroke();
      // highlight along the back wall
      c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 2; c.beginPath(); c.moveTo(-hx + 4, -hy + 3); c.lineTo(-hx + 4, hy - 3); c.stroke();
      // the tray, open at the mouth
      var tl = -hx + 7, tp = hy - 5, te = hx + 1.3;
      c.beginPath();
      c.moveTo(te, -tp); c.lineTo(tl + 4, -tp); c.quadraticCurveTo(tl, -tp, tl, -tp + 4);
      c.lineTo(tl, tp - 4); c.quadraticCurveTo(tl, tp, tl + 4, tp); c.lineTo(te, tp);
      c.fillStyle = C.tray; c.fill(); c.lineWidth = 1.6; c.strokeStyle = C.ink; c.stroke();
      // four slot grooves
      var pitch = pitchOf(b), x0 = -hx + (Lb - 4 * pitch);
      for (j = 0; j < 4; j++) {
        rr(c, x0 + j * pitch + 1.5, -tp + 2.5, pitch - 3, 2 * tp - 5, 4);
        c.fillStyle = C.groove; c.fill(); c.lineWidth = 1; c.strokeStyle = C.grooveLine; c.stroke();
      }
      // flap at the mouth, on the downstream side (the belt's direction)
      var fs = b.flap;
      c.beginPath();
      c.moveTo(hx - 3, fs * (hy - 4.5)); c.lineTo(hx + 5.5, fs * (hy - 4.5)); c.lineTo(hx + 4, fs * (hy - 17)); c.lineTo(hx - 3, fs * (hy - 17)); c.closePath();
      c.fillStyle = '#C4924F'; c.fill(); c.lineWidth = 1.6; c.strokeStyle = C.ink; c.stroke();
      c.restore();
    }

    function drawOneWayFlap(c, b) {
      // a drop flap hanging across the whole mouth, swinging inwards; plain: a striped post at the mouth
      var hx = b.L / 2, hy = b.Wd / 2 - 5, i;
      c.save(); c.translate(b.cx, b.cy); c.rotate(b.rot);
      if (plainOn) {
        rr(c, hx - 1, -hy, 6, 2 * hy, 2); c.fillStyle = '#F4EBDD'; c.fill();
        c.save(); rr(c, hx - 1, -hy, 6, 2 * hy, 2); c.clip(); c.fillStyle = '#D7263D';
        for (i = -hy; i < hy; i += 8) { c.beginPath(); c.moveTo(hx - 1, i); c.lineTo(hx + 5, i + 4); c.lineTo(hx + 5, i + 8); c.lineTo(hx - 1, i + 4); c.closePath(); c.fill(); }
        c.restore();
        rr(c, hx - 1, -hy, 6, 2 * hy, 2); c.lineWidth = 1.4; c.strokeStyle = C.ink; c.stroke();
        c.restore();
        return;
      }
      c.beginPath();
      c.moveTo(hx + 6, -hy); c.lineTo(hx + 6, hy); c.lineTo(hx - 3, hy - 3); c.lineTo(hx - 3, -hy + 3); c.closePath();
      c.fillStyle = 'rgba(184,134,74,0.82)'; c.fill(); c.lineWidth = 1.6; c.strokeStyle = C.ink; c.stroke();
      c.strokeStyle = 'rgba(42,26,18,0.5)'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(hx + 1.5, -hy + 3); c.lineTo(hx + 1.5, hy - 3); c.stroke();
      c.restore();
    }

    function drawLidTop(c, b, kind, scaleP, alpha) {
      var hx = b.L / 2, hy = b.Wd / 2;
      c.save();
      if (alpha != null && alpha < 1) c.globalAlpha = alpha;
      if (scaleP && scaleP !== 1) { c.translate(b.cx, b.cy); c.scale(scaleP, scaleP); c.translate(-b.cx, -b.cy); }
      if (plainOn) { drawPlainBody(c, b, true, kind); c.restore(); return; }
      var csp = boxSprite(true);
      if (csp) {
        drawBoxSprite(c, b, csp);
        if (kind != null) {   // thin tape band in the packed kind's colour above the stamp (sprite x 46..86)
          c.save(); c.translate(b.cx, b.cy); c.rotate(b.rot);
          var tw = 40 * b.L / 132, ty = -b.Wd / 2 + 2;
          c.fillStyle = kindColour(kind); c.fillRect(-tw / 2, ty, tw, 4);
          c.lineWidth = 1; c.strokeStyle = C.ink; c.strokeRect(-tw / 2, ty, tw, 4);
          c.restore();
        }
        sprite(c, 'stamp', b.cx - b.ux * 8, b.cy - b.uy * 8, Math.min(32, b.Wd - 8), 1);
        c.restore();
        return;
      }
      c.save(); c.translate(b.cx, b.cy); c.rotate(b.rot);
      rr(c, -hx, -hy, b.L, b.Wd, 7); c.fillStyle = C.kraftLid; c.fill(); c.lineWidth = 2; c.strokeStyle = C.ink; c.stroke();
      // lid rim
      rr(c, -hx + 4, -hy + 4, b.L - 8, b.Wd - 8, 4); c.strokeStyle = 'rgba(169,121,63,0.7)'; c.lineWidth = 1.5; c.stroke();
      // tape band in the colour of the packed kind
      if (kind != null) {
        var tx = hx - 24;
        c.fillStyle = kindColour(kind); c.globalAlpha = (alpha != null && alpha < 1 ? alpha : 1) * 0.9;
        c.fillRect(tx, -hy, 9, b.Wd); c.globalAlpha = alpha != null && alpha < 1 ? alpha : 1;
        c.lineWidth = 1.5; c.strokeStyle = C.ink; c.beginPath(); c.moveTo(tx, -hy + 1); c.lineTo(tx, hy - 1); c.moveTo(tx + 9, -hy + 1); c.lineTo(tx + 9, hy - 1); c.stroke();
      }
      c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 2; c.beginPath(); c.moveTo(-hx + 9, -hy + 6); c.lineTo(-hx + 40, -hy + 6); c.stroke();
      c.restore();
      sprite(c, 'stamp', b.cx - b.ux * 8, b.cy - b.uy * 8, Math.min(32, b.Wd - 8), 1);
      c.restore();
    }

    // ---- covers (cloth, ice, shutter) -----------------------------------------------------------
    function drawCloth(c, b, kind, alpha) {
      var hx = b.L / 2 + 1.5, hy = b.Wd / 2 + 1.5, col = kindColour(kind), dk = spr() ? spr().darker(col, 0.18) : col;
      if (alpha != null && alpha < 1) c.globalAlpha = alpha;
      if (plainOn) {   // a solid sheet in the kind's colour with a small cube outline in the middle
        c.save(); c.translate(b.cx, b.cy); c.rotate(b.rot);
        rr(c, -hx, -hy, 2 * hx, 2 * hy, 8); c.fillStyle = col; c.fill(); c.lineWidth = 2; c.strokeStyle = C.ink; c.stroke();
        c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.75)'; rr(c, -9, -9, 18, 18, 4); c.stroke();
        c.restore(); c.globalAlpha = 1;
        return;
      }
      c.save(); c.translate(b.cx, b.cy); c.rotate(b.rot);
      rr(c, -hx, -hy, 2 * hx, 2 * hy, 8); c.fillStyle = col; c.fill();
      // folds
      c.fillStyle = dk; c.globalAlpha = (alpha != null ? alpha : 1) * 0.55;
      c.beginPath(); c.moveTo(-hx + 6, hy - 1); c.lineTo(hx * 0.3, hy - 1); c.lineTo(-hx * 0.2, hy * 0.2); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(hx - 2, -hy + 8); c.lineTo(hx - 2, hy * 0.1); c.lineTo(hx * 0.35, -hy + 2); c.closePath(); c.fill();
      c.globalAlpha = (alpha != null ? alpha : 1) * 0.3; c.fillStyle = '#FFFFFF';
      c.beginPath(); c.moveTo(-hx * 0.7, -hy + 2); c.lineTo(hx * 0.1, -hy + 2); c.lineTo(-hx * 0.15, -hy * 0.1); c.lineTo(-hx * 0.75, -hy * 0.35); c.closePath(); c.fill();
      c.globalAlpha = alpha != null ? alpha : 1;
      // stitched border
      c.setLineDash([4, 3]); c.lineWidth = 1.4; c.strokeStyle = 'rgba(255,255,255,0.55)';
      rr(c, -hx + 4, -hy + 4, 2 * hx - 8, 2 * hy - 8, 5); c.stroke(); c.setLineDash([]);
      c.lineWidth = 2; c.strokeStyle = C.ink; rr(c, -hx, -hy, 2 * hx, 2 * hy, 8); c.stroke();
      // the knot at the back end, two ears folded towards the middle
      var kx = -hx + 8;
      c.fillStyle = dk; c.lineWidth = 1.8;
      c.save(); c.translate(kx, 0); c.rotate(-0.55); c.beginPath(); c.ellipse(5, 0, 6.5, 3.1, 0, 0, 6.2832); c.fill(); c.stroke(); c.restore();
      c.save(); c.translate(kx, 0); c.rotate(0.55); c.beginPath(); c.ellipse(5, 0, 6.5, 3.1, 0, 0, 6.2832); c.fill(); c.stroke(); c.restore();
      c.beginPath(); c.arc(kx, 0, 4.6, 0, 6.2832); c.fillStyle = col; c.fill(); c.stroke();
      c.restore();
      // the kind's sprite small in the middle, on a cream disc
      c.beginPath(); c.arc(b.cx, b.cy, 13.5, 0, 6.2832); c.fillStyle = C.cream; c.globalAlpha = (alpha != null ? alpha : 1) * 0.92; c.fill();
      c.globalAlpha = alpha != null ? alpha : 1; c.lineWidth = 1.6; c.strokeStyle = C.ink; c.stroke();
      drawPiece(c, kind, b.cx, b.cy, 27, alpha);
      c.globalAlpha = 1;
    }

    function drawIce(c, b, alpha, sy) {
      var x = b.x - 2.5, y = b.y - 2.5, w = b.w + 5, h = b.h + 5, i, seed = b.i * 37 + 11;
      function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
      c.save();
      if (sy != null && sy !== 1) { c.translate(0, y + h); c.scale(1, sy); c.translate(0, -(y + h)); }
      if (plainOn) {
        c.globalAlpha = 0.82 * alpha;
        rr(c, x, y, w, h, 9); c.fillStyle = PLAIN.ice; c.fill();
        c.globalAlpha = alpha; c.lineWidth = 2; c.strokeStyle = '#E9F8FF'; c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(x + w * 0.25, y + 6); c.lineTo(x + w * 0.4, y + h * 0.5); c.lineTo(x + w * 0.3, y + h - 6); c.stroke();
        c.restore();
        return;
      }
      c.globalAlpha = 0.7 * alpha;
      rr(c, x, y, w, h, 9); c.fillStyle = C.ice; c.fill();
      c.globalAlpha = alpha;
      // inner bevel highlight (top and left)
      c.strokeStyle = 'rgba(255,255,255,0.65)'; c.lineWidth = 2.2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x + 6, y + h - 8); c.lineTo(x + 6, y + 8); c.quadraticCurveTo(x + 6, y + 6, x + 9, y + 6); c.lineTo(x + w - 12, y + 6); c.stroke();
      // frost patches
      c.fillStyle = 'rgba(255,255,255,0.28)';
      c.beginPath(); c.moveTo(x + w * 0.55, y + h); c.lineTo(x + w * 0.9, y + h); c.lineTo(x + w, y + h * 0.55); c.lineTo(x + w * 0.8, y + h * 0.7); c.closePath(); c.fill();
      // cracks
      c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.6; c.lineJoin = 'round';
      for (i = 0; i < 3; i++) {
        var px = x + w * (0.2 + 0.3 * i + rnd() * 0.08), py = y + 5 + rnd() * 6;
        c.beginPath(); c.moveTo(px, py);
        var seg;
        for (seg = 0; seg < 4; seg++) { px += (rnd() - 0.5) * 12; py += h * 0.2 + rnd() * 3; c.lineTo(px, Math.min(py, y + h - 3)); }
        c.stroke();
      }
      c.strokeStyle = C.iceDark; c.lineWidth = 1; c.globalAlpha = 0.7 * alpha;
      for (i = 0; i < 2; i++) {
        var qx = x + w * (0.3 + 0.4 * i) + 2, qy = y + 7 + rnd() * 4;
        c.beginPath(); c.moveTo(qx, qy); c.lineTo(qx + 6, qy + h * 0.3); c.lineTo(qx + 2, qy + h * 0.45); c.stroke();
      }
      c.globalAlpha = alpha;
      rr(c, x, y, w, h, 9); c.lineWidth = 2; c.strokeStyle = C.iceDark; c.stroke();
      // crystals on top
      c.lineWidth = 1.6; c.strokeStyle = C.iceDark; c.fillStyle = '#E9F8FF';
      for (i = 0; i < 3; i++) {
        var cx2 = x + w * (0.18 + 0.32 * i) + (rnd() - 0.5) * 8, ch = 7 + rnd() * 5;
        c.beginPath(); c.moveTo(cx2 - 4, y + 1); c.lineTo(cx2 - 1, y - ch); c.lineTo(cx2 + 4, y + 1); c.closePath(); c.fill(); c.stroke();
      }
      c.restore();
    }

    function lockRect(list) {
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, i;
      for (i = 0; i < list.length; i++) { var b = list[i]; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
      return { x: x0 - 2.5, y: y0 - 2.5, w: x1 - x0 + 5, h: y1 - y0 + 5 };
    }
    // raise: 0 closed .. 1 fully rolled up
    function plainPadlock(c, hex, x, y, s, alpha) {
      c.save(); if (alpha != null && alpha < 1) c.globalAlpha = alpha;
      c.lineWidth = Math.max(2.5, s * 0.1); c.strokeStyle = C.ink; c.lineCap = 'round';
      c.beginPath(); c.arc(x, y - s * 0.12, s * 0.22, Math.PI, 0); c.stroke();
      rr(c, x - s * 0.32, y - s * 0.12, s * 0.64, s * 0.5, s * 0.1); c.fillStyle = hex; c.fill(); c.lineWidth = 2; c.stroke();
      c.fillStyle = C.ink; c.beginPath(); c.arc(x, y + s * 0.1, s * 0.07, 0, 6.2832); c.fill();
      c.restore();
    }
    function drawShutter(c, r, lockId, raise, padAlpha, padScale) {
      var hh = 7, bar = 6, visH = Math.max(0, (r.h - hh) * (1 - raise)), i, steel = plainOn ? PLAIN.steel : C.steel, steelDark = plainOn ? PLAIN.steelDark : C.steelDark;
      if (visH > 1) {
        c.save();
        rr(c, r.x, r.y, r.w, hh + visH, 6); c.clip();
        c.fillStyle = steel; c.fillRect(r.x, r.y + hh, r.w, visH);
        c.fillStyle = steelDark;
        for (i = 0; i * 6.5 < visH; i++) c.fillRect(r.x, r.y + hh + i * 6.5 + 4, r.w, 2.6);
        if (!plainOn) {
          c.fillStyle = 'rgba(255,255,255,0.28)';
          for (i = 0; i * 6.5 < visH; i++) c.fillRect(r.x, r.y + hh + i * 6.5, r.w, 1.4);
        }
        c.restore();
        // outline and bottom handle bar
        c.lineWidth = 2; c.strokeStyle = C.ink;
        c.fillStyle = steelDark; rr(c, r.x, r.y + hh + visH - bar, r.w, bar, 2.5); c.fill(); c.stroke();
        c.strokeRect(r.x, r.y + hh, r.w, Math.max(0, visH - bar));
      }
      // roller housing
      rr(c, r.x - 1, r.y, r.w + 2, hh, 3.5); c.fillStyle = steelDark; c.fill(); c.lineWidth = 2; c.strokeStyle = C.ink; c.stroke();
      if (!plainOn) { c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(r.x + 4, r.y + 1.6, r.w - 8, 1.5); }
      if (padAlpha > 0.01) {
        var s = (padScale || 1) * 34;
        if (plainOn) plainPadlock(c, lockColour(lockId), r.x + r.w / 2, r.y + r.h / 2 + 2 - raise * 8, s, padAlpha);
        else tintedSprite(c, 'padlock', lockColour(lockId), r.x + r.w / 2, r.y + r.h / 2 + 2 - raise * 8, s, padAlpha);
      }
    }

    function drawCover(c, b) {
      var sb = st.boxes[b.i];
      if (sb.wrap != null) drawCloth(c, b, sb.wrap, 1);
      else if (sb.ice) drawIce(c, b, 1, 1);
    }

    // ---- build the static layers ----------------------------------------------------------------
    function closedEff(i) {
      if (!st.boxes[i].closed) return false;
      var t0 = lidAt[i];
      if (t0 === undefined) return true;
      return T >= t0 + LID_MS;
    }
    function shaking(i) { return shake[i] !== undefined && T - shake[i] < SHAKE_MS; }

    function lockGroups() {
      var g = {}, i, id, order = [];
      for (i = 0; i < boxes.length; i++) {
        id = st.boxes[i].lock;
        if (id == null) continue;
        if (!g[id]) { g[id] = []; order.push(id); }
        g[id].push(boxes[i]);
      }
      return { map: g, order: order };
    }

    function computeSig() {
      var s = W + 'x' + H + '@' + dpr + (lowPerfOn ? 'L' : '') + (plainOn ? 'P' : '') + ':' + mapKey + ':' + (fullNow ? 'F' : '') + ':' + (st.dir === 'ccw' ? 'w' : 'c') + ':' + (spr() ? spr().version : 0) + ':', i, sb;
      for (i = 0; i < st.boxes.length; i++) {
        sb = st.boxes[i];
        s += (closedEff(i) ? 'c' : 'o') + (sb.wrap == null ? '-' : sb.wrap) + (sb.ice ? 'i' : '') + (sb.lock == null ? '' : sb.lock) + (sb.oneway ? '1' : '') + (shaking(i) ? 's' : '') + ';';
      }
      return s;
    }

    function rebuild() {
      rebuilds++;
      var i, b, sb, cw = Math.max(1, Math.round(W * dpr)), ch = Math.max(1, Math.round(H * dpr));
      if (bodyCv.width !== cw || bodyCv.height !== ch) { bodyCv.width = cw; bodyCv.height = ch; coverCv.width = cw; coverCv.height = ch; }
      drawCounter(bodyCtx, cw, ch);
      bodyCtx.setTransform(k, 0, 0, k, L.ox * dpr, L.oy * dpr);
      drawBelt(bodyCtx, fullNow);
      coverCtx.setTransform(1, 0, 0, 1, 0, 0);
      coverCtx.clearRect(0, 0, cw, ch);
      coverCtx.setTransform(k, 0, 0, k, L.ox * dpr, L.oy * dpr);
      for (i = 0; i < boxes.length; i++) {
        b = boxes[i]; sb = st.boxes[i];
        if (b.missing || shaking(i)) continue;
        var ce = closedEff(i);
        drawBoxBody(bodyCtx, b, ce, ce && sb.pieces.length ? sb.pieces[0].k : null);
        if (sb.oneway && !ce) drawOneWayFlap(bodyCtx, b);
        if (!ce) drawCover(coverCtx, b);
      }
      var lg = lockGroups(), id;
      for (i = 0; i < lg.order.length; i++) {
        id = lg.order[i];
        if (shaking(lg.map[id][0].i)) continue;
        drawShutter(coverCtx, lockRect(lg.map[id]), id, 0, 1, 1);
      }
      sig = computeSig();
      lastSpriteVersion = spr() ? spr().version : 0;
    }

    // ---- sim access -----------------------------------------------------------------------------
    function platesOf(s) {
      if (typeof s.plates === 'function') return s.plates();
      if (PL.sim && typeof PL.sim.plates === 'function') return PL.sim.plates(s);
      var out = [], b = s.belt, i;
      if (!b) return out;
      for (i = 0; i < s.state.N; i++) {
        var pos;
        if (PL.belt && typeof PL.belt.platePos === 'function') pos = PL.belt.platePos(b, i);
        else {
          pos = ((b.phase || 0) + i * b.spacing) % b.perimeter;        // travel units -> clockwise layout units
          if (s.state.dir === 'ccw') pos = (b.perimeter - pos) % b.perimeter;
        }
        out.push({ plate: i, s: pos, piece: s.state.belt[i] });
      }
      return out;
    }
    function freeCount(s) {
      if (typeof s.freePlates === 'function') return s.freePlates();
      if (PL.sim && typeof PL.sim.freePlates === 'function') return PL.sim.freePlates(s);
      var n = 0, i;
      for (i = 0; i < s.state.belt.length; i++) if (!s.state.belt[i]) n++;
      return n;
    }
    // sim.plates()[].s is already in the layout's clockwise units, so it goes straight to pointAt
    function plateXY(arcS) { return sm.pointAt(arcS); }

    // ---- events -> animations -------------------------------------------------------------------
    function findKeyPos(lockId) {
      var i, j, sb;
      for (i = 0; i < st.boxes.length; i++) {
        sb = st.boxes[i];
        for (j = 0; j < sb.pieces.length; j++) if (sb.pieces[j].key === lockId && !boxes[i].missing) { var p = slotPos(boxes[i], j); return { x: p.x, y: p.y, kind: sb.pieces[j].k }; }
      }
      for (i = 0; i < st.belt.length; i++) if (st.belt[i] && st.belt[i].key === lockId && platePos[i]) return { x: platePos[i].x, y: platePos[i].y, kind: st.belt[i].k };
      return null;
    }

    function processQueue() {
      if (!queue.length || !st) { queue = []; return; }
      var q = queue, i, e, bi, gsize = {}, ejN = {};
      queue = [];
      var dur = slideMs(), landMs = cfg().LAND_MS || 800;
      for (i = 0; i < q.length; i++) {
        e = q[i];
        if (e.type === 'eject') { bi = boxIndexOf(e.box); gsize[bi] = (gsize[bi] || 0) + 1; }
      }
      for (i = 0; i < q.length; i++) {
        e = q[i]; bi = e.box != null ? boxIndexOf(e.box) : -1;
        var sb = bi >= 0 ? st.boxes[bi] : null, bx = bi >= 0 ? boxes[bi] : null;
        switch (e.type) {
          case 'tapped':
            if (!sb || !bx) break;
            // the engine's plan: every piece j leaves at departAt_j; piece j starts sliding out at once, slowly, and its reserved
            // plate slides to the mouth during the last 800 ms so both meet exactly at departAt_j
            var plan = Array.isArray(e.plan) ? e.plan : null;
            // without a plan in the event, the pieces of box.outbox carry their own plate and departAt (engine sim time)
            var tp = plan ? plan.map(function (q) { return q.piece; }) : (Array.isArray(sb.outbox) && sb.outbox.length ? sb.outbox : (Array.isArray(e.pieces) ? e.pieces : []));
            var kk = tp.length, plen = sb.pieces.length, tt, tnow = e.time != null ? e.time : (sim && sim.time != null ? sim.time : null);
            var dly = [];
            for (tt = 0; tt < kk; tt++) {
              var dpc = tp[tt], ddep = plan ? plan[tt].departAt : dpc && dpc.departAt;
              dly.push((ddep != null && tnow != null) ? Math.max(200, ddep - tnow) : (cfg().DEPART_FIRST_MS || 900) + tt * (cfg().DEPART_GAP_MS || 900));
            }
            // strictly one by one: a unit starts sliding out when the previous unit has reached its plate (its departAt)
            for (tt = 0; tt < kk; tt++) {
              var tpc = tp[tt], tplate = plan ? plan[tt].plate : tpc && tpc.plate, i2, prevD = 0, shifts = [];
              if (!tpc) continue;
              for (i2 = 0; i2 < kk; i2++) if (dly[i2] < dly[tt] && dly[i2] > prevD) prevD = dly[i2];
              for (i2 = 0; i2 < tt; i2++) if (dly[i2] < dly[tt]) { var pd = 0, i3; for (i3 = 0; i3 < kk; i3++) if (dly[i3] < dly[i2] && dly[i3] > pd) pd = dly[i3]; shifts.push(T + pd); }
              var base = plen + (kk - 1 - tt), front = base + shifts.length;
              // the reserved plate sinks through a trapdoor where it is and rises at the mouth during the last HATCH_MS
              teles.push({ box: bi, plate: tplate != null && tplate >= 0 ? tplate : null, pieceId: tpc.id, kind: tpc.k, key: tpc.key, base: base, shifts: shifts,
                slot: slotPos(bx, front), side: slotSide(bx), t0: T + prevD, tEnd: T + dly[tt], hatchStart: Math.max(T, T + dly[tt] - HATCH_MS) });
              if (tt + 1 < kk && tpc.pair != null && tp[tt + 1] && tp[tt + 1].pair === tpc.pair) {
                var sp1 = slotPos(bx, base), sp2 = slotPos(bx, base - 1);
                anims.push({ type: 'snap', x: (sp1.x + sp2.x) / 2, y: (sp1.y + sp2.y) / 2, vert: bx.vert, t0: T + prevD + 250, dur: 340 });
              }
            }
            break;
          case 'eject':
            if (!bx) break;
            var ep = st.belt[e.plate] || (e.piece && typeof e.piece === 'object' ? e.piece : null), ti, matched = false;
            if (ep && ep.id != null) poured[ep.id] = T;
            for (ti = 0; ti < teles.length && !matched; ti++) if (teles[ti].box === bi && e.piece && e.piece.id != null && teles[ti].pieceId === e.piece.id) { teles.splice(ti, 1); matched = true; }
            for (ti = 0; ti < teles.length && !matched; ti++) if (teles[ti].box === bi && teles[ti].plate === e.plate) { teles.splice(ti, 1); matched = true; }
            for (ti = 0; ti < teles.length && !matched; ti++) if (teles[ti].box === bi) { teles.splice(ti, 1); matched = true; }
            if (matched) break;      // the piece is on its plate now; the normal plate drawing takes over where the slide ended
            var tN = ejN[bi] || 0, gN = gsize[bi] || 1, lenN = sb.pieces.length;
            ejN[bi] = tN + 1;
            flights.push({ type: 'eject', box: bi, plate: e.plate, from: slotPos(bx, lenN + (gN - 1 - tN)), side: slotSide(bx), kind: ep ? ep.k : 0, key: ep ? ep.key : null, t0: T, dur: dur });
            if (gN > 1 && tN === 0) {
              var a0 = slotPos(bx, lenN), a1 = slotPos(bx, lenN + 1);
              anims.push({ type: 'snap', x: (a0.x + a1.x) / 2, y: (a0.y + a1.y) / 2, vert: bx.vert, t0: T, dur: 340 });
            }
            break;
          case 'land':
            if (!sb || !bx) break;
            var lp = (e.piece && typeof e.piece === 'object' && e.piece.id != null) ? e.piece : sb.pieces[sb.pieces.length - 1];
            if (!lp) break;
            var start = platePos[e.plate] || mouthPos(bx);
            if (streamOn && lp.id != null && bx.s != null) { drains.push({ pieceId: lp.id, kind: lp.k, s: bx.s, t0: T, list: streamOf(lp.id) }); delete poured[lp.id]; }
            var lastj = -1, jj;
            for (jj = 0; jj < sb.pieces.length; jj++) if (sb.pieces[jj].id === lp.id) lastj = jj;
            if (lastj < 0) lastj = sb.pieces.length - 1;
            flights.push({ type: 'land', box: bi, pieceId: lp.id, side: slotSide(bx), from: { x: start.x, y: start.y }, to: slotPos(bx, lastj), kind: lp.k, key: lp.key, t0: T, dur: landMs });
            break;
          case 'close':
            if (!bx) break;
            lidAt[bi] = T + landMs;
            anims.push({ type: 'steam', box: bi, t0: T + landMs + LID_MS * 0.6, dur: 800 });
            break;
          case 'reveal':
            if (!sb || !bx) break;
            anims.push({ type: 'reveal', box: bi, j: (typeof e.index === 'number' && e.index >= 0) ? e.index : sb.pieces.length - 1, t0: T, dur: 480 });
            break;
          case 'unwrap':
            if (!bx) break;
            if (prev[bi] && prev[bi].wrap != null) anims.push({ type: 'unwrap', box: bi, kind: prev[bi].wrap, t0: T, dur: 520 });
            break;
          case 'thaw':
            if (!bx) break;
            anims.push({ type: 'thaw', box: bi, t0: T, dur: 760 });
            break;
          case 'unlock':
            var list = [], bs = e.boxes || [], jx;
            for (jx = 0; jx < bs.length; jx++) { var ix = boxIndexOf(bs[jx]); if (ix >= 0 && boxes[ix] && !boxes[ix].missing) list.push(boxes[ix]); }
            if (!list.length) break;
            var kp = findKeyPos(e.lock);
            anims.push({ type: 'unlock', lock: e.lock, rect: lockRect(list), key: kp, t0: T, dur: kp ? 880 : 520, flyMs: kp ? 380 : 0 });
            break;
          case 'refuse':
            if (!bx) break;
            shake[bi] = T;
            if (bx.s != null) anims.push({ type: 'stripflash', s: bx.s, t0: T, dur: 520 });
            if (sb.lock != null) {
              var gi;
              for (gi = 0; gi < st.boxes.length; gi++) if (st.boxes[gi].lock === sb.lock) shake[gi] = T;
            }
            break;
          case 'won':
            status = 'won';
            anims.push({ type: 'pulse', t0: T, dur: 900, colour: '255,209,102' });
            if (!lowPerfOn) spawnConfetti();
            break;
          case 'lost':
            status = 'lost';
            anims.push({ type: 'jam', t0: T, dur: 1000 });
            break;
          default: break;
        }
      }
    }

    function spawnConfetti() {
      var i, cols = ['#3FD47A', '#3FD47A'].concat(kindColours().slice(0, 12));
      var box = L.box, parts = [];
      for (i = 0; i < 64; i++) {
        var r1 = Math.random(), r2 = Math.random(), r3 = Math.random();
        parts.push({ x: box.x + box.w * r1, y: box.y - 10, vx: (r2 - 0.5) * 50, vy: 40 + r3 * 90, rot: r1 * 6, vr: (r2 - 0.5) * 12, c: cols[i % cols.length], w: 4 + r3 * 4 });
      }
      anims.push({ type: 'confetti', parts: parts, t0: T, dur: 2600 });
    }

    // ---- dynamic drawing ------------------------------------------------------------------------
    // clip to a box's rectangle (in its own rotated frame): `out` units past the mouth, `side` units to each side, `pad` elsewhere
    function clipBox(c, b, pad, out, side) {
      c.save(); c.translate(b.cx, b.cy); c.rotate(b.rot);
      c.beginPath(); c.rect(-b.L / 2 - pad, -b.Wd / 2 - side, b.L + pad + out, b.Wd + 2 * side); c.clip();
      c.rotate(-b.rot); c.translate(-b.cx, -b.cy);
    }
    function drawBoxPieces(c, b, sb) {
      var j, p, pos, pitch = pitchOf(b), pcs = sb.pieces, vis = noLuckOn || (sb.wrap == null && !sb.ice && sb.lock == null);
      if (!vis) return;
      clipBox(c, b, 3, 3, 3);     // nothing of a box's own pieces may show outside the box
      for (j = 0; j < pcs.length; j++) {
        p = pcs[j];
        if (landing[p.id]) continue;
        pos = slotPos(b, j);
        if (p.hidden && !noLuckOn) {
          drawHidden(c, b, pos.x, pos.y, 1);
        } else {
          if (p.hidden) { slotTile(c, b, pos.x, pos.y, C.hiddenTile, 1); slotTile(c, b, pos.x, pos.y, kindColour(p.k), 0.45); }
          else slotTile(c, b, pos.x, pos.y, kindColour(p.k), 1);
          drawPiece(c, p.k, pos.x, pos.y, BOX_PIECE_W, 1);
          if (p.hidden) drawHidden(c, b, pos.x, pos.y, 0.45);
          if (p.key != null && keyActive(p)) drawKeyTag(c, p.key, pos.x, pos.y, BOX_PIECE_W);
        }
      }
      // clips over the seams of bound pairs
      for (j = 0; j + 1 < pcs.length; j++) {
        if (pcs[j].pair != null && pcs[j].pair === pcs[j + 1].pair && !landing[pcs[j].id] && !landing[pcs[j + 1].id]) {
          var a = slotPos(b, j), d = slotPos(b, j + 1);
          drawClip(c, (a.x + d.x) / 2, (a.y + d.y) / 2 + 1, pitch * 1.75, 1, b.vert ? Math.PI / 2 : 0);
        }
      }
      c.restore();
    }

    function drawOneWaySign(c, b) {
      if (plainOn) return;                                   // the striped post of the flap says it
      var m = mouthPos(b), v = { x: -b.uy * b.flap, y: b.ux * b.flap };
      // sits on the lip at the upstream corner (opposite the flap)
      var x = m.x - b.ux * 6 - v.x * (b.Wd / 2 - 6), y = m.y - b.uy * 6 - v.y * (b.Wd / 2 - 6);
      sprite(c, 'noreturn', x, y, 25, 1);
    }

    function plateSpeed() { return (sim && sim.speed) || sm.perimeter / (cfg().LAP_MS || 8000); }

    // ---- the stream style: a piece on the belt is a trail of particles behind its plate's position ----------------
    var STREAM_N = 34, GROW_FACTOR = 0.85;
    function segLen() { return (sim && sim.belt ? sim.belt.spacing : sm.perimeter / (st ? st.N : 6)) * GROW_FACTOR; }
    function streamOf(pieceId) {
      var list = streams[pieceId], seed, i, L = segLen(), band = plateD + 4;
      if (list) return list;
      seed = (pieceId * 2654435761 + 12345) >>> 0;
      function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
      list = [];
      for (i = 0; i < STREAM_N; i++) {
        list.push({ u: (i + rnd() * 0.9) / STREAM_N * L, v: (rnd() - 0.5) * (band - 10), size: 8 + rnd() * 5, rot: rnd() * 6.28, hi: rnd() < 0.5 });
      }
      streams[pieceId] = list;
      return list;
    }
    // the arc a particle sits at: u units behind the arc position s (against the travel direction)
    function behind(sArc, u) { return normArc(st && st.dir === 'ccw' ? sArc + u : sArc - u); }
    function drawParticle(c, q, hex, pt, alpha, scale) {
      var sz = q.size * (scale || 1), x = pt.x - Math.sin(pt.angle) * q.v, y = pt.y + Math.cos(pt.angle) * q.v;
      c.save(); c.translate(x, y); c.rotate(q.rot + pt.angle);
      if (alpha != null && alpha < 1) c.globalAlpha = alpha;
      rr(c, -sz / 2, -sz / 2, sz, sz, sz * 0.28); c.fillStyle = hex; c.fill(); c.lineWidth = 1; c.strokeStyle = C.ink; c.stroke();
      if (q.hi && !plainOn && !lowPerfOn) { c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(-sz * 0.15, -sz * 0.18, sz * 0.22, sz * 0.14, -0.6, 0, 6.2832); c.fill(); }
      c.restore();
    }
    // the trail of the piece on plate p: particles poured so far (the belt carries them away at its own speed)
    function drawStream(c, piece, sArc) {
      var list = streamOf(piece.id), t0 = poured[piece.id], len = t0 === undefined ? segLen() : Math.min(segLen(), (T - t0) * plateSpeed()), i, q, hex = kindColour(piece.k);
      for (i = 0; i < list.length; i++) {
        q = list[i];
        if (q.u > len) continue;
        drawParticle(c, q, hex, plateXY(behind(sArc, q.u)), 1, 1);
      }
      if (piece.key != null && keyActive(piece)) { var kp = plateXY(sArc); drawKeyTag(c, piece.key, kp.x, kp.y - 1, PIECE_W); }
    }
    // a stream being sucked into a box: its head is at the mouth, the particles still behind it keep coming and vanish there
    function drawDrains(c) {
      var i, d, tau, moved, j, q, u, hex, pt;
      for (i = drains.length - 1; i >= 0; i--) {
        d = drains[i];
        tau = T - d.t0;
        moved = tau * plateSpeed();
        if (moved > segLen() + 2) { drains.splice(i, 1); continue; }
        hex = kindColour(d.kind);
        for (j = 0; j < d.list.length; j++) {
          q = d.list[j];
          u = q.u - moved;
          if (u <= 0) continue;
          pt = plateXY(behind(d.s, u));
          drawParticle(c, q, hex, pt, u < 12 ? u / 12 : 1, u < 12 ? 0.6 + 0.4 * u / 12 : 1);
        }
      }
    }
    function normArc(v) { var P = sm.perimeter; return ((v % P) + P) % P; }
    function ease(p) { return lowPerfOn ? linear(p) : easeInOut(p); }
    // the trapdoor: a dark opening in the belt under a plate, open at prog 0.5, shut at 0 and 1
    function drawHatch(c, x, y, prog) {
      var o = Math.sin(clamp01(prog) * Math.PI), d = plateD * 1.12;
      if (o <= 0.01) return;
      c.save(); c.globalAlpha = 0.85 * o;
      rr(c, x - d / 2, y - d / 2, d, d, plateD * 0.25); c.fillStyle = C.beltDark; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = 'rgba(0,0,0,0.5)'; c.stroke();
      c.restore();
    }
    // a plate drawn scaled about its centre (sinking or rising through a hatch)
    function scaledPlate(c, x, y, scale, alpha, fn) {
      c.save(); c.translate(x, y); c.scale(scale, scale); c.translate(-x, -y);
      if (alpha < 1) c.globalAlpha = alpha;
      fn();
      c.restore(); c.globalAlpha = 1;
    }
    function paintPlate(c, p, x, y) {
      emptyPlate(c, x, y, plateD);
      if (p.piece && ejecting[p.plate]) {
        var ef = ejecting[p.plate];
        colourPlate(c, x, y, plateD, kindColour(p.piece.k), easeOut((T - ef.t0) / ef.dur), false);
      } else if (p.piece) {
        plateDisc(c, x, y, kindColour(p.piece.k), 1);
        drawPiece(c, p.piece.k, x, y - 1, PIECE_W, 1);
        if (p.piece.key != null && keyActive(p.piece)) drawKeyTag(c, p.piece.key, x, y - 1, PIECE_W);
      }
    }

    function drawPlatesAndFlights(c) {
      var plates = platesOf(sim), i, p, pt, n = plates.length, jig = fullNow && !lowPerfOn && status === 'play' && !streamOn;
      platePos.length = 0; drawnPos.length = 0;
      for (i = 0; i < n; i++) {
        p = plates[i];
        pt = plateXY(p.s);
        var x = pt.x, y = pt.y;
        if (jig) { x += Math.sin(T * 0.045 + p.plate * 1.7) * 1.1; y += Math.cos(T * 0.052 + p.plate * 2.3) * 0.9; }
        else if (status === 'lost' && !lowPerfOn && !streamOn) { x += Math.sin(T * 0.03 + p.plate * 1.9) * 0.8; }
        platePos[p.plate] = { x: x, y: y };      // the engine's position of the plate
        drawnPos[p.plate] = { x: x, y: y };
        if (streamOn) { if (p.piece) drawStream(c, p.piece, p.s); continue; }     // no plates at all in the stream style
        var tl = teleOf[p.plate];
        if (tl && T >= tl.hatchStart) {
          // the reserved plate sinks through a trapdoor where it is (the engine moves it to the mouth at tEnd)
          var sp = clamp01((T - tl.hatchStart) / Math.max(1, tl.tEnd - tl.hatchStart)), pe = easeIn(sp);
          drawHatch(c, x, y, sp * 0.5 + 0.1);
          (function (pp, xx, yy) { scaledPlate(c, xx, yy, 1 - 0.5 * pe, 1 - pe, function () { emptyPlate(c, xx, yy, plateD); }); })(p, x, y);
          continue;
        }
        paintPlate(c, p, x, y);
      }
      if (streamOn) drawDrains(c);
      // plates rising at the mouths, under the pieces that are about to leave (the mouth's trapdoor)
      for (i = 0; !streamOn && i < teles.length; i++) {
        var tr = teles[i], br = boxes[tr.box];
        if (!br || br.missing || br.s == null || T < tr.hatchStart) continue;
        var rp = clamp01((T - tr.hatchStart) / Math.max(1, tr.tEnd - tr.hatchStart)), re = easeOut(rp), mq = plateXY(br.s);
        drawHatch(c, mq.x, mq.y, 0.5 + rp * 0.5);
        (function (xx, yy, kind) { scaledPlate(c, xx, yy, 0.5 + 0.5 * re, 0.15 + 0.85 * re, function () { emptyPlate(c, xx, yy, plateD); colourPlate(c, xx, yy, plateD, kindColour(kind), re, false); }); })(mq.x, mq.y, tr.kind);
      }
      // pieces sliding out of their boxes towards the mouth (slowly, meeting their plate exactly at departAt)
      for (i = 0; i < teles.length; i++) {
        var tz = teles[i], bz = boxes[tz.box], pg = clamp01((T - tz.t0) / Math.max(1, tz.tEnd - tz.t0));
        if (!bz || bz.missing) continue;
        if (T < tz.t0) {     // still waiting in the box; moves up one slot each time a unit ahead starts to leave
          var fi = tz.base, si;
          for (si = 0; si < tz.shifts.length; si++) fi += easeInOut((T - tz.shifts[si]) / 350);
          var wp = slotPos(bz, fi), wc = kindColour(tz.kind);
          slotTile(c, bz, wp.x, wp.y, wc, 1);
          drawPiece(c, tz.kind, wp.x, wp.y, BOX_PIECE_W, 1);
          continue;
        }
        var mp = bz.s != null ? sm.pointAt(bz.s) : mouthPos(bz), ez = ease(pg);
        var zx = tz.slot.x + (mp.x - tz.slot.x) * ez, zy = tz.slot.y + (mp.y - tz.slot.y) * ez - Math.sin(pg * Math.PI) * 3;
        var ta = clamp01((T - tz.hatchStart) / Math.max(1, tz.tEnd - tz.hatchStart)), sdz = tz.side + (plateD - tz.side) * ez;
        if (streamOn) {   // the piece keeps its tile to the mouth and is chopped there: it shrinks away in the last 160 ms
          var chop = clamp01((T - (tz.tEnd - 160)) / 160), csz = 1 - 0.7 * chop;
          c.save(); c.translate(zx, zy); c.scale(csz, csz); c.translate(-zx, -zy); if (chop > 0) c.globalAlpha = 1 - chop * 0.6;
          drawTile(c, zx, zy + 1, sdz, kindColour(tz.kind), 1);
          drawPiece(c, tz.kind, zx, zy, BOX_PIECE_W + (PIECE_W - BOX_PIECE_W) * ez, 1);
          c.restore(); c.globalAlpha = 1;
          if (tz.key != null && st.locks && st.locks[tz.key] && !st.locks[tz.key].open) drawKeyTag(c, tz.key, zx, zy, PIECE_W);
          continue;
        }
        if (ta < 1) drawTile(c, zx, zy + 1, sdz, kindColour(tz.kind), 1 - ta);     // its own tile fades as the rising plate takes over
        drawPiece(c, tz.kind, zx, zy, BOX_PIECE_W + (PIECE_W - BOX_PIECE_W) * ez, 1);
        if (tz.key != null && st.locks && st.locks[tz.key] && !st.locks[tz.key].open) drawKeyTag(c, tz.key, zx, zy, PIECE_W);
      }
      // flights
      for (i = 0; i < flights.length; i++) {
        var f = flights[i], pr = (T - f.t0) / f.dur;
        if (pr < 0) continue;
        var e = (f.staged || f.type === 'land') ? ease(pr) : easeOut(pr), fx, fy, to;
        if (f.type === 'eject') to = drawnPos[f.plate] || platePos[f.plate] || f.from; else to = f.to;
        fx = f.from.x + (to.x - f.from.x) * e;
        fy = f.from.y + (to.y - f.from.y) * e - Math.sin(Math.min(1, pr) * Math.PI) * 6;
        var zoned = !f.staged && !f.noClip && f.box != null && boxes[f.box] && !boxes[f.box].missing;
        if (zoned) clipBox(c, boxes[f.box], 3, 56, 18);   // slot-to-plate slides stay in the box and its mouth zone
        var sd0 = f.side || 25, sdT = plateD, sdNow = f.type === 'eject' ? sd0 + (sdT - sd0) * e : sdT + (sd0 - sdT) * e;
        if (!f.staged) drawTile(c, fx, fy + 1, sdNow, kindColour(f.kind), f.type === 'eject' ? 1 - e * 0.6 : 0.4 + 0.6 * e);
        drawPiece(c, f.kind, fx, fy - (f.type === 'eject' ? 1 * e : 0), f.staged ? PIECE_W : f.type === 'eject' ? BOX_PIECE_W + (PIECE_W - BOX_PIECE_W) * e : PIECE_W + (BOX_PIECE_W - PIECE_W) * e, 1);
        if (f.key != null && st.locks && st.locks[f.key] && !st.locks[f.key].open) drawKeyTag(c, f.key, fx, fy, PIECE_W);
        if (zoned) c.restore();
      }
    }

    function drawAnims(c) {
      var i, a, p, b;
      for (i = anims.length - 1; i >= 0; i--) {
        a = anims[i];
        p = (T - a.t0) / a.dur;
        if (p >= 1) { anims.splice(i, 1); continue; }
        if (p < 0) continue;
        switch (a.type) {
          case 'reveal':
            b = boxes[a.box]; var pos = slotPos(b, a.j), e = easeOut(p);
            c.save();
            if (plainOn) drawHidden(c, b, pos.x, pos.y - e * 10, 1 - easeIn(p));
            else sprite(c, 'cloche', pos.x, pos.y - e * 20, BOX_PIECE_W + 3, 1 - easeIn(p));
            if (!lowPerfOn) {
              var gs = Math.sin(Math.min(1, p * 1.6) * Math.PI) * 9, gx = pos.x + 6, gy = pos.y - 9 - e * 8;
              c.fillStyle = '#FFFFFF'; c.globalAlpha = 0.9 * (1 - p);
              c.beginPath(); c.moveTo(gx, gy - gs); c.lineTo(gx + gs * 0.28, gy - gs * 0.28); c.lineTo(gx + gs, gy); c.lineTo(gx + gs * 0.28, gy + gs * 0.28);
              c.lineTo(gx, gy + gs); c.lineTo(gx - gs * 0.28, gy + gs * 0.28); c.lineTo(gx - gs, gy); c.lineTo(gx - gs * 0.28, gy - gs * 0.28); c.closePath(); c.fill();
            }
            c.restore(); c.globalAlpha = 1;
            break;
          case 'unwrap':
            b = boxes[a.box];
            c.save();
            rr(c, b.x - 3, b.y - 3, b.w + 6, b.h + 6, 8); c.clip();
            var d = easeIn(p) * (b.L + 6);
            c.translate(b.ux * d, b.uy * d);
            drawCloth(c, b, a.kind, 1 - p * 0.5);
            c.restore();
            break;
          case 'thaw':
            b = boxes[a.box];
            drawIce(c, b, 1 - easeIn(p), 1 - 0.35 * easeOut(p));
            if (!lowPerfOn) {
              var di;
              c.fillStyle = C.iceDark;
              for (di = 0; di < 5; di++) {
                var dp = clamp01((p - di * 0.07) / 0.7);
                if (dp <= 0) continue;
                var dx = b.x + b.w * (0.12 + di * 0.19), dy = b.y + b.h - 2 + dp * 20 * (0.7 + (di % 2) * 0.5);
                c.globalAlpha = 0.9 * (1 - dp);
                c.beginPath(); c.moveTo(dx, dy - 4); c.quadraticCurveTo(dx + 2.6, dy, dx, dy + 2.6); c.quadraticCurveTo(dx - 2.6, dy, dx, dy - 4); c.fill();
              }
              c.globalAlpha = 1;
            }
            break;
          case 'unlock':
            var tms = T - a.t0, raise = 0, pa = 1, ps = 1, r = a.rect;
            if (tms > a.flyMs) { var q = (tms - a.flyMs) / (a.dur - a.flyMs); raise = easeInOut(q); pa = 1 - easeIn(q); }
            if (a.key && tms < a.flyMs) ps = 1 + Math.sin(clamp01(tms / a.flyMs) * Math.PI) * 0.12;
            drawShutter(c, r, a.lock, raise, pa, ps);
            if (a.key && tms < a.flyMs) {
              var fe = easeInOut(tms / a.flyMs), tx = r.x + r.w / 2, ty = r.y + r.h / 2;
              var kx = a.key.x + (tx - a.key.x) * fe, ky = a.key.y + (ty - a.key.y) * fe - Math.sin(fe * Math.PI) * 14;
              if (plainOn) plainKey(c, lockColour(a.lock), kx, ky, 24 - fe * 8); else tintedSprite(c, 'keytag', lockColour(a.lock), kx, ky, 24 - fe * 8, 1);
            }
            break;
          case 'snap':
            var sp = easeOut(p), ang = a.vert ? Math.PI / 2 : 0, ox2 = a.vert ? 0 : 1, oy2 = a.vert ? 1 : 0;
            c.save(); c.globalAlpha = 1 - p;
            drawClip(c, a.x - ox2 * sp * 9, a.y - oy2 * sp * 9 - sp * 4, 32, 1, ang - sp * 0.6);
            drawClip(c, a.x + ox2 * sp * 9, a.y + oy2 * sp * 9 - sp * 4, 32, 1, ang + sp * 0.6);
            c.restore(); c.globalAlpha = 1;
            break;
          case 'steam':
            if (lowPerfOn) break;
            b = boxes[a.box];
            var pi;
            for (pi = 0; pi < 3; pi++) {
              var pp = clamp01(p * 1.2 - pi * 0.12);
              if (pp <= 0 || pp >= 1) continue;
              c.globalAlpha = 0.5 * (1 - pp); c.fillStyle = '#FFFFFF';
              c.beginPath(); c.arc(b.cx + (pi - 1) * 11 + Math.sin(pp * 5 + pi) * 3, b.cy - 6 - pp * 26, 4 + pp * 7, 0, 6.2832); c.fill();
            }
            c.globalAlpha = 1;
            break;
          case 'stripflash':
            var sf, band = plateD + 4, off = band / 2 - 3.2, k2;
            c.lineCap = 'round'; c.lineJoin = 'round';
            for (k2 = 0; k2 < 2; k2++) {
              c.beginPath();
              for (sf = -42; sf <= 42; sf += 6) {
                var sp2 = sm.pointAt(((a.s + sf) % sm.perimeter + sm.perimeter) % sm.perimeter);
                var qx = sp2.x - Math.sin(sp2.angle) * off * beltNormalSign, qy = sp2.y + Math.cos(sp2.angle) * off * beltNormalSign;
                if (sf === -42) c.moveTo(qx, qy); else c.lineTo(qx, qy);
              }
              c.globalAlpha = (k2 ? 0.95 : 0.3) * (1 - p * p);
              c.strokeStyle = C.stripFull; c.lineWidth = k2 ? 3.6 : 8; c.stroke();
            }
            c.globalAlpha = 1;
            break;
          case 'pulse':
          case 'jam':
            // a glow along the belt's light strip, no wash over the board (the card follows anyway)
            var pa = a.type === 'pulse' ? Math.sin(p * Math.PI) : Math.abs(Math.sin(p * Math.PI * 3)) * (1 - p), pk;
            c.lineCap = 'round'; c.lineJoin = 'round';
            for (pk = 0; pk < 2; pk++) {
              beltPath(c, (plateD + 4) / 2 - 3.2);
              c.globalAlpha = (pk ? 0.95 : 0.3) * pa;
              c.strokeStyle = a.type === 'pulse' ? '#9CF5BD' : C.stripFull; c.lineWidth = pk ? 3.6 : 9; c.stroke();
            }
            c.globalAlpha = 1;
            break;
          case 'confetti':
            var ti = (T - a.t0) / 1000, pc, ci;
            for (ci = 0; ci < a.parts.length; ci++) {
              pc = a.parts[ci];
              var cx3 = pc.x + pc.vx * ti, cy3 = pc.y + pc.vy * ti + 40 * ti * ti;
              c.save(); c.translate(cx3, cy3); c.rotate(pc.rot + pc.vr * ti); c.globalAlpha = 1 - p * p;
              c.fillStyle = pc.c; c.fillRect(-pc.w / 2, -pc.w / 4, pc.w, pc.w / 2); c.restore();
            }
            c.globalAlpha = 1;
            break;
          default: break;
        }
      }
    }

    // ---- main -----------------------------------------------------------------------------------
    function render(s, dtMs, now) {
      if (!L || !s || !s.state) return;
      T = (typeof now === 'number' && isFinite(now)) ? now : (clock += (dtMs || 16));
      if (s.state !== st) bind(s);
      sim = s;
      if (s.status) status = s.status;
      fullNow = freeCount(s) === 0 && s.status !== 'won';
      if (lowPerfOn && T - lastDrawT < 28 && !dirty) { processQueue(); return; }
      lastDrawT = T;
      processQueue();
      // finish expired flights and prune maps
      var i, f;
      ejecting = {}; landing = {};
      var i0;
      teleOf = {};
      for (i0 = teles.length - 1; i0 >= 0; i0--) { if (T >= teles[i0].tEnd + 4000) teles.splice(i0, 1); }      // an eject event removes its entry; this only guards against a lost event
      for (i0 = 0; i0 < teles.length; i0++) if (teles[i0].plate != null) teleOf[teles[i0].plate] = teles[i0];
      var i;
      for (i = flights.length - 1; i >= 0; i--) {
        f = flights[i];
        if (T - f.t0 >= f.dur) { flights.splice(i, 1); continue; }
        if (f.type === 'eject') ejecting[f.plate] = f; else landing[f.pieceId] = true;
      }
      var want = computeSig();
      if (dirty || want !== sig) { rebuild(); dirty = false; }
      for (i in lidAt) if (lidAt.hasOwnProperty(i) && T >= lidAt[i] + LID_MS) delete lidAt[i];
      for (i in shake) if (shake.hasOwnProperty(i) && T - shake[i] >= SHAKE_MS) delete shake[i];

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(bodyCv, 0, 0);
      ctx.setTransform(k, 0, 0, k, L.ox * dpr, L.oy * dpr);
      var b, sb, dx;
      for (i = 0; i < boxes.length; i++) {
        b = boxes[i]; sb = st.boxes[i];
        if (b.missing) continue;
        var ce = closedEff(i), sh = shaking(i);
        if (sh) {
          dx = Math.sin((T - shake[i]) / SHAKE_MS * Math.PI * 7) * 3.2 * (1 - (T - shake[i]) / SHAKE_MS);
          ctx.save(); ctx.translate(dx, 0);
          drawBoxBody(ctx, b, ce, ce && sb.pieces.length ? sb.pieces[0].k : null);
          if (sb.oneway && !ce) drawOneWayFlap(ctx, b);
        }
        var lidOn = !ce && sb.closed && lidAt[i] !== undefined && T >= lidAt[i];   // the lid is snapping on: no pieces below it
        if (!ce && !lidOn) drawBoxPieces(ctx, b, sb);
        if (sh) {
          if (!ce) { ctx.globalAlpha = noLuckOn ? 0.45 : 1; drawCover(ctx, b); ctx.globalAlpha = 1; }
          ctx.restore();
        }
        if (lidOn) {   // opaque from the first frame, a small pop from 5 % larger, so nothing shows through or sticks out
          var lp = (T - lidAt[i]) / LID_MS;
          drawLidTop(ctx, b, sb.pieces.length ? sb.pieces[0].k : null, 1 + 0.05 * (1 - easeOut(lp)), 1);
        }
        if (sb.oneway && !ce) drawOneWaySign(ctx, b);
      }
      drawPlatesAndFlights(ctx);
      prevT = T;
      // covers from the cached layer
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (noLuckOn) ctx.globalAlpha = 0.45;
      ctx.drawImage(coverCv, 0, 0);
      ctx.globalAlpha = 1;
      ctx.setTransform(k, 0, 0, k, L.ox * dpr, L.oy * dpr);
      // shutters of a shaking lock group
      var lg = null, id;
      for (i = 0; i < boxes.length; i++) {
        if (st.boxes[i].lock != null && shaking(i)) {
          if (!lg) lg = lockGroups();
          id = st.boxes[i].lock;
          if (lg.map[id] && lg.map[id][0].i === i) {
            dx = Math.sin((T - shake[i]) / SHAKE_MS * Math.PI * 7) * 3.2 * (1 - (T - shake[i]) / SHAKE_MS);
            ctx.save(); ctx.translate(dx, 0); ctx.globalAlpha = noLuckOn ? 0.45 : 1;
            drawShutter(ctx, lockRect(lg.map[id]), id, 0, 1, 1); ctx.restore(); ctx.globalAlpha = 1;
          }
        }
      }
      drawAnims(ctx);
      // remember the cover state for the next frame's unwrap / thaw events
      for (i = 0; i < st.boxes.length; i++) prev[i] = { wrap: st.boxes[i].wrap, ice: st.boxes[i].ice, lock: st.boxes[i].lock };
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    function resize(w, h, ratio) {
      dpr = ratio || root.devicePixelRatio || 1;
      W = w; H = h;
      canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      L = PL.layout.compute(tpl, { w: w, h: h });
      k = L.scale * dpr;
      dirty = true;
    }

    function hit(px, py) {
      if (!L || !boxes.length) return -1;
      var slop = 6 / L.scale, d = PL.layout.inv(L, px, py), best = -1, bd = 1e18, i, b;
      for (i = 0; i < boxes.length; i++) {
        b = boxes[i];
        if (b.missing) continue;
        if (d.x >= b.x - slop && d.x <= b.x + b.w + slop && d.y >= b.y - slop && d.y <= b.y + b.h + slop) {
          var dd = (d.x - b.cx) * (d.x - b.cx) + (d.y - b.cy) * (d.y - b.cy);
          if (dd < bd) { bd = dd; best = i; }
        }
      }
      return best;
    }

    function flash(ev) { if (ev && ev.type) queue.push(ev); }

    var scene = {
      resize: resize, render: render, hit: hit, flash: flash,
      lowPerf: function (v) { lowPerfOn = !!v; dirty = true; },
      noLuck: function (v) { noLuckOn = !!v; dirty = true; },
      plain: function (v) { plainOn = !!v; streamOn = plainOn || streamPref; dirty = true; },
      beltStyle: function (v) { streamPref = v === 'stream'; streamOn = plainOn || streamPref; dirty = true; },
      stream: function () { return streamOn; },
      kindMap: function (arr) { map = arr && arr.length ? arr.slice() : null; mapKey = map ? map.join(',') : ''; dirty = true; },
      invalidate: function () { dirty = true; },
      layout: function () { return L; },
      boxRect: function (i) { var b = boxes[i]; return b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null; },
      staged: function () { var n = teles.length, qi; for (qi = 0; qi < queue.length; qi++) if (queue[qi].type === 'tapped') n += Array.isArray(queue[qi].plan) ? queue[qi].plan.length : (queue[qi].k || 0); return n; },   // incl. a tap not yet drawn   // pieces still sliding out of their box towards the mouth
      // where the engine has plate i right now (read from the sim at call time, not from the last drawn frame), CSS px
      platePoint: function (i) {
        if (!sim || !L || !st) return null;
        var pl = platesOf(sim), j;
        for (j = 0; j < pl.length; j++) if (pl[j].plate === i) { var q = plateXY(pl[j].s); return { x: L.ox + q.x * L.scale, y: L.oy + q.y * L.scale }; }
        return null;
      },
      platePointDrawn: function (i) { var p = drawnPos[i]; return p && L ? { x: L.ox + p.x * L.scale, y: L.oy + p.y * L.scale } : null; },
      mouthPoint: function (bi) {
        var b = boxes[bi]; if (!b || b.missing || !L) return null;
        var p = b.s != null ? sm.pointAt(b.s) : mouthPos(b);
        return { x: L.ox + p.x * L.scale, y: L.oy + p.y * L.scale };
      },
      stats: function () { return { rebuilds: rebuilds, flights: flights.length, anims: anims.length }; }
    };
    canvas.plScene = scene;
    PL.scene.current = scene;
    return scene;
  }

  PL.scene = { create: create, current: null, lockColour: lockColour };
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.scene;
})(typeof window !== 'undefined' ? window : globalThis);
