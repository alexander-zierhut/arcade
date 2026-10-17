// src/ui/hud.js: the in-play HUD (DESIGN 3.4, 3.8): coin pill with the tweened counter, BEST / NEW BEST,
// Pause and Mute buttons, the NEXT box and the tier strip. Browser file; adds to CM.ui:
//   setHud(game, save), setHudVisible(b), notReady(), consume(events, game), toast(text, tier)   (5.5)
//   applyLayout(lay), bindHud(handlers), setMuteIcons(muted), tierName(t)            (helpers, see amendments)
// Rects come from CM.projection.computeLayout (stage px; stage.x is added here). Every DOM write is diffed,
// so setHud may be called every frame. toast(text, tier) lives here too (5.5 placed it in overlays.js).
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var ui = CM.ui = CM.ui || {};
  var doc = root.document;

  var els = null;               // cached elements
  var lastLay = null, lastDpr = 0;
  var shown = { score: -1, best: -1, next: 0, slots: '', muted: null, visible: null };
  var tween = { from: 0, to: 0, t0: 0, ms: 450, value: 0 };
  var newBestUntil = 0, ticking = false, handlers = {};

  function $(id) { return doc.getElementById(id); }
  function now() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }
  function app() { return (CM.app && CM.app.ctx) || {}; }
  function fmt(n) { n = Math.max(0, Math.round(+n || 0)); try { return n.toLocaleString('en-US'); } catch (e) { return String(n); } }
  function tierName(t) { var T = CM.config && CM.config.TIERS && CM.config.TIERS[t]; return (T && T.name) || ('Tier ' + t); }
  function restart(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function place(el, r, dx) {
    if (!el || !r) return;
    var s = el.style;
    s.left = Math.round(r.x + dx) + 'px'; s.top = Math.round(r.y) + 'px';
    s.width = Math.round(r.w) + 'px'; s.height = Math.round(r.h) + 'px';
  }
  function sizeCanvas(c, w, h, dpr) {
    var pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
    c.style.width = Math.round(w) + 'px'; c.style.height = Math.round(h) + 'px';
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; return true; }
    return false;
  }
  function paintIcon(c, t, state) {
    try { if (CM.art && CM.art.paintIcon) CM.art.paintIcon(c, t, state); } catch (e) { /* art fault: leave blank */ }
  }

  function build() {
    if (els || !doc) return els;
    els = {
      hud: $('hud'), coin: $('hud-coin'), coinC: $('hud-coin-c'), pill: $('hud-pill'), score: $('hud-score'),
      best: $('hud-best'), newBest: $('hud-newbest'), pause: $('btn-pause'), mute: $('btn-mute'),
      next: $('hud-next'), nextC: $('hud-next-c'), label: $('hud-next-label'),
      bomb: $('btn-bomb'), bombCount: $('bomb-count'),
      strip: $('strip'), slots: $('strip-slots'), toasts: $('toasts'), slot: []
    };
    if (els.slots && !els.slots.children.length) {
      for (var t = 1; t <= 9; t++) {
        var s = doc.createElement('div'); s.className = 'slot'; s.setAttribute('data-tier', t);
        var c = doc.createElement('canvas'); c.className = 'slot-icon';
        var n = doc.createElement('span'); n.className = 'slot-new'; n.textContent = 'NEW';
        s.appendChild(c); s.appendChild(n); els.slots.appendChild(s);
      }
    }
    for (var i = 0; els.slots && i < els.slots.children.length; i++) els.slot[i + 1] = els.slots.children[i];
    return els;
  }

  /** applyLayout(lay): positions the HUD rects, the strip and the toast row; sizes the icon canvases. */
  function applyLayout(lay) {
    if (!lay || !build() || !els.hud) return;
    var h = lay.hud, st = lay.strip, dx = lay.stage.x, dpr = lay.dpr || 1, rs = doc.documentElement.style;
    lastLay = lay;
    rs.setProperty('--S', lay.S + 'px'); rs.setProperty('--H', lay.H + 'px');
    rs.setProperty('--stage-x', dx + 'px'); rs.setProperty('--uiK', String(lay.uiK || 1));
    rs.setProperty('--hud-bottom', Math.round(h.bottom) + 'px');
    rs.setProperty('--strip-top', Math.round(st.top) + 'px'); rs.setProperty('--strip-bottom', Math.round(st.bottom) + 'px');
    rs.setProperty('--safe-top', (lay.safe ? lay.safe.top : 0) + 'px');
    rs.setProperty('--safe-bottom', (lay.safe ? lay.safe.bottom : 0) + 'px');
    place(els.coin, h.coin, dx); place(els.pause, h.pause, dx); place(els.mute, h.mute, dx);
    place(els.next, h.next, dx); place(els.label, h.label, dx); place(els.best, h.best, dx); place(els.newBest, h.best, dx);
    place(els.pill, h.pill, dx);
    if (els.bomb && h.next) place(els.bomb, { x: h.next.x + (h.next.w - 44) / 2, y: (h.label ? h.label.y + h.label.h : h.next.y + h.next.h) + 8, w: 44, h: 44 }, dx);
    if (els.pill) { els.pill.style.paddingLeft = Math.round(h.D / 2 + 6) + 'px'; els.pill.style.borderRadius = '999px'; }
    if (els.coinC) { sizeCanvas(els.coinC, h.coin.w, h.coin.h, dpr); try { CM.art.paintCoin(els.coinC); } catch (e) { /* no coin art */ } }
    if (els.nextC) { sizeCanvas(els.nextC, h.next.w * 0.78, h.next.h * 0.78, dpr); shown.next = 0; }
    if (els.toasts) els.toasts.style.top = Math.round(h.bottom + 8) + 'px';
    if (els.strip && st) {
      place(els.strip, { x: st.x, y: st.top, w: st.w, h: st.h }, dx);
      els.strip.style.setProperty('--body-w', Math.round(st.bodyW) + 'px');
      els.strip.style.setProperty('--arrow-w', Math.round(st.arrowW) + 'px');
      els.strip.style.setProperty('--pad', st.pad + 'px');
      for (var t = 1; t <= 9; t++) {
        var s = els.slot[t]; if (!s) continue;
        s.style.left = Math.round(st.pad + (t - 1) * st.slotW) + 'px'; s.style.width = Math.round(st.slotW) + 'px';
        sizeCanvas(s.firstChild, st.iconBox.w, st.iconBox.h, dpr);
      }
      shown.slots = '';
    }
    lastDpr = dpr;
    shown.score = -1;
    if (typeof ui._layoutOverlays === 'function') ui._layoutOverlays(lay);
  }

  function fitScore() {
    var el = els.score, pill = els.pill;
    if (!el || !pill || !lastLay) return;
    el.style.fontSize = '';
    var inner = lastLay.hud.pill.w - (lastLay.hud.D / 2 + 6) - 12;
    var size = parseFloat((root.getComputedStyle ? root.getComputedStyle(el).fontSize : '') || '24') || 24;
    while (el.scrollWidth > inner && size > 14) { size -= 1; el.style.fontSize = size + 'px'; }
  }

  function tick() {
    ticking = false;
    var a = app();
    if (a.lay && a.lay !== lastLay) applyLayout(a.lay);
    if (els && tween.value !== tween.to) {
      var k = Math.min(1, (now() - tween.t0) / tween.ms), e = 1 - Math.pow(1 - k, 3);
      tween.value = k >= 1 ? tween.to : Math.round(tween.from + (tween.to - tween.from) * e);
      var txt = fmt(tween.value), len = els.score.textContent.length;
      els.score.textContent = txt;
      if (txt.length !== len) fitScore();
    }
    if (els && els.newBest && newBestUntil && now() > newBestUntil) {
      newBestUntil = 0; els.newBest.hidden = true; if (els.best) els.best.style.visibility = '';
    }
    schedule();
  }
  function schedule() { if (!ticking && root.requestAnimationFrame) { ticking = true; root.requestAnimationFrame(tick); } }

  function slotStates(game, save) {
    var ever = (save && save.discovered) | 0, run = (game && game.runMask) | 0, hi = 0, t, out = [];
    for (t = 9; t >= 1 && !hi; t--) if (run & (1 << (t - 1))) hi = t;
    if (game && game.highestTier && (run & (1 << (game.highestTier - 1)))) hi = game.highestTier;
    for (t = 1; t <= 9; t++) {
      var b = 1 << (t - 1);
      out[t] = (run & b) ? (t === hi ? 'best' : 'run') : (ever & b) ? 'earlier' : 'none';
    }
    return out;
  }

  /** setHud(game, save): score (tweened), BEST / NEW BEST, NEXT icon, strip slot states, mute icon. */
  function setHud(game, save) {
    if (!build() || !els.hud) return;
    var a = app();
    if (a.lay && a.lay !== lastLay) applyLayout(a.lay);
    if ((a.lay && a.lay.dpr) !== lastDpr && a.lay) applyLayout(a.lay);
    save = save || a.save || {};
    if (game) {
      var score = game.score | 0;
      if (score !== shown.score) {
        if (shown.score >= 0 && score > shown.score) { restart(els.pill, 'bump'); restart(els.coin, 'spin'); }
        if (shown.score < 0 || score < shown.score) { tween.value = tween.from = tween.to = score; els.score.textContent = fmt(score); fitScore(); }
        else { tween.from = tween.value; tween.to = score; tween.t0 = now(); }
        shown.score = score;
        var base = a.bestAtRunStart | 0;
        if (score > base && base > 0 && !a.newBestShown && CM.app && CM.app.ctx) {
          CM.app.ctx.newBestShown = true; showNewBest();
        }
      }
      var best = Math.max(save.best | 0, score);
      if (best !== shown.best) { shown.best = best; els.best.textContent = 'BEST ' + fmt(best); }
      if (game.next && game.next !== shown.next && els.nextC) {
        if (shown.next) restart(els.next, 'appear');
        shown.next = game.next; paintIcon(els.nextC, game.next, 'run');
      }
      var st = slotStates(game, save), sig = st.join(',');
      if (sig !== shown.slots) {
        for (var t = 1; t <= 9; t++) {
          var s = els.slot[t]; if (!s) continue;
          if (s.getAttribute('data-state') !== st[t] || !shown.slots) { s.setAttribute('data-state', st[t]); paintIcon(s.firstChild, t, st[t]); }
        }
        shown.slots = sig;
      }
    }
    if (els.bomb) {                                   // bomb button (owner feature): visible with a charge, pulses while armed
      var nb = game ? (game.bombs | 0) : 0, armed = !!(a.intents && a.intents.bombMode) && nb > 0;
      if (nb !== shown.bombs) {
        shown.bombs = nb;
        els.bomb.hidden = !(nb > 0);
        if (els.bombCount) els.bombCount.textContent = String(nb);
        if (nb > 0) restart(els.bomb, 'pop');
      }
      if (armed !== shown.armed) { shown.armed = armed; els.bomb.classList.toggle('armed', armed); }
    }
    setMuteIcons(!!save.muted);
    schedule();
  }

  function showNewBest() {
    if (!els.newBest) return;
    els.newBest.hidden = false; restart(els.newBest, 'pop');
    if (els.best) els.best.style.visibility = 'hidden';
    newBestUntil = now() + 2000;
  }

  /** setMuteIcons(muted): every .js-mute button shows the speaker or the crossed speaker. */
  function setMuteIcons(muted) {
    if (!doc || shown.muted === muted) return;
    shown.muted = muted;
    var list = doc.querySelectorAll('.js-mute');
    for (var i = 0; i < list.length; i++) {
      list[i].classList.toggle('is-muted', muted);
      list[i].setAttribute('aria-label', muted ? 'Sound off' : 'Sound on');
      list[i].setAttribute('aria-pressed', muted ? 'true' : 'false');
    }
  }

  /** setHudVisible(b): HUD and strip are visible in PLAY, WIN_SEQ, LOSE_SEQ, WIN_MENU, OVER_MENU (3.4). */
  function setHudVisible(b) {
    if (!build()) return;
    b = !!b;
    if (shown.visible === b) return;
    shown.visible = b;
    [els.hud, els.strip].forEach(function (el) { if (el) el.style.visibility = b ? 'visible' : 'hidden'; });
  }

  /** notReady(): the launch was refused; plays the not-ready sound and asks the renderer to shake the launcher. */
  function notReady() {
    try { if (CM.audio && CM.audio.notReady) CM.audio.notReady(); } catch (e) { /* audio optional */ }
    try {
      var r = CM.render;
      if (r && r.fx && typeof r.fx.notReady === 'function') r.fx.notReady();
      else if (r && typeof r.notReady === 'function') r.notReady();
    } catch (e2) { /* render optional */ }
  }

  /** consume(events, game): strip discovery pops, NEXT appear, discovery and "Another Sangria!" toasts. */
  function consume(events, game) {
    if (!events || !events.length || !build()) return;
    var save = app().save || {}, won = false, i, e;
    for (i = 0; i < events.length; i++) if (events[i].type === 'win') won = true;
    for (i = 0; i < events.length; i++) {
      e = events[i];
      if (e.type === 'discover') {
        var s = els.slot[e.tier];
        if (s) restart(s, 'pop');
        if (e.tier >= 5 && e.tier < 9) {
          var ever = ((save.discovered | 0) & (1 << (e.tier - 1))) !== 0;
          toast((ever ? 'NEW: ' : 'NEW COCKTAIL: ') + tierName(e.tier) + '!', e.tier);
        }
      } else if (e.type === 'merge' && e.tier === 9 && !won && game && game.wonOnce) {
        toast('Another Sangria!', 9);
      } else if (e.type === 'bombEarned' && e.gained !== false) {
        toast(e.bombs > 1 ? 'Another bomb! (' + e.bombs + ')' : 'Bomb ready! Tap it, then tap the table.', 9);
      }
    }
    if (game) setHud(game, save);
  }

  // ---------- toasts (3.5 items 5 and 6; a HUD banner, so it lives here next to consume) ----------
  var toastQ = [], toastEl = null, toastTimer = 0;
  /** toast(text, tier): a banner below hudBottom with a mini icon; queued, never interactive. */
  function toast(text, tier) {
    toastQ.push([String(text), tier | 0]);
    if (!toastEl) nextToast();
  }
  function nextToast() {
    var box = build() && els.toasts, item = toastQ.shift(), dpr = (lastLay && lastLay.dpr) || 1;
    toastEl = null;
    if (!box || !item) return;
    var el = doc.createElement('div'), sp = doc.createElement('span');
    el.className = 'toast';
    if (item[1] >= 1 && item[1] <= 9) {
      var c = doc.createElement('canvas'); el.appendChild(c); sizeCanvas(c, 34, 34, dpr); paintIcon(c, item[1], 'run');
    }
    sp.textContent = item[0]; el.appendChild(sp);
    box.appendChild(el); toastEl = el;
    function done() {
      if (toastEl !== el) return;
      root.clearTimeout(toastTimer);
      if (el.parentNode) el.parentNode.removeChild(el);
      nextToast();
    }
    el.addEventListener('animationend', done);
    toastTimer = root.setTimeout(done, 1900);
  }

  /** bindHud(handlers): wires the HUD Pause and Mute buttons (called by CM.ui.init). */
  function bindHud(h) {
    handlers = h || {};
    if (!build() || els.bound) return;
    els.bound = true;
    function tap(el, fn) {
      if (!el) return;
      el.addEventListener('click', function (ev) {
        try { if (CM.audio && CM.audio.click) CM.audio.click(); } catch (e) { /* no audio */ }
        try { fn(ev); } catch (err) { if (root.console) root.console.error('Cocktail Merge HUD', err); }
        el.blur();
      });
    }
    tap(els.pause, function () {
      if (handlers.onPause) handlers.onPause();
      else { var it = app().intents; if (it && it.pause) it.pause('button'); }
    });
    tap(els.bomb, function () { if (handlers.onBomb) handlers.onBomb(); var g = app().game; if (g) setHud(g, app().save); });
    tap(els.mute, function () {
      var s = app().save || {};
      if (handlers.onToggleMute) handlers.onToggleMute(!s.muted);
      shown.muted = null; setMuteIcons(!!(app().save || s).muted);
    });
    schedule();
  }

  ui.toast = toast; ui.setHud = setHud; ui.setHudVisible = setHudVisible; ui.notReady = notReady; ui.consume = consume;
  ui.applyLayout = applyLayout; ui.bindHud = bindHud; ui.setMuteIcons = setMuteIcons; ui.tierName = tierName;
  ui.fmt = fmt;
})(typeof globalThis !== 'undefined' ? globalThis : this);
