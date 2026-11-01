// src/ui/overlays.js: the DOM overlays (DESIGN 3.5): title (dedication tag, logo, collection row, buttons,
// stats, how-to, chips, art credit), Pause (settings + collection), Win, Game over, OOPS, ROTATE, the small
// sheets (How to play, Settings, Collection) and the armed confirmation. Browser file; adds to CM.ui:
//   init(handlers), showOverlay(id | null, data?)       (5.5; toast(text, tier) lives in hud.js, see amendments)
//   keyAction(code) -> boolean, current() -> id | null, openSheet(name), closeSheet()        (helpers)
// The markup lives in index.html; this file fills it, shows / hides sections (hidden + inert) and routes
// button presses to the app's handlers. App state is read at call time from CM.app.ctx (5.2).
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var ui = CM.ui = CM.ui || {};
  var doc = root.document;

  var MAIN = ['title', 'pause', 'win', 'over', 'oops', 'rotate'];
  var SHEETS = ['howto', 'settings', 'collection', 'mode'];   // 'mode': the chooser every new game goes through (2.13)
  var SETTINGS = [   // [save key, label, note, inverted]
    ['muted', 'Sound', '', true], ['music', 'Music', ''], ['ambience', 'Ambience', ''],
    ['showNumbers', 'Show tier numbers', ''],
    ['lowGfx', 'Performance mode', 'lower resolution, fewer effects']
  ];
  var TOGGLE = { muted: 'onToggleMute', music: 'onToggleMusic', ambience: 'onToggleAmbience',
    showNumbers: 'onToggleNumbers', lowGfx: 'onToggleLowGfx' };
  var START_ACTS = { play: 1, newgame: 1, 'newgame-win': 1, again: 1, restart: 1 };   // all of them ask for the mode first
  var CRAFTPIX = ['Beach 2D Backgrounds by CraftPix.net', '(craftpix.net), OGA-BY 3.0'];
  var HOWTO_TOUCH = ['Drag left or right below the dashed line, then let go to slide a drink.',
    'Two identical drinks that touch mix into the next one.', "Don't let drinks stay past the dashed line!",
    'Changed your mind? Slide your finger up off the table and let go.'];
  var HOWTO_DESK = ['Aim with the mouse or ←/→. Click or press Space to slide.',
    'Two identical drinks that touch mix into the next one.', "Don't let drinks stay past the dashed line!",
    'Changed your mind? Drag up off the table and let go.'];

  var handlers = {}, current = null, sheet = null, data = {}, lay = null, openedAt = 0;
  var armedBtn = null, armTimer = 0, inited = false;

  function $(id) { return doc.getElementById(id); }
  function qa(sel, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(sel)); }
  function sec(id) { return $('ov-' + id); }
  function now() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }
  function app() { return (CM.app && CM.app.ctx) || {}; }
  function save() { return app().save || data.save || {}; }
  function cfg() { return CM.config || {}; }
  function fmt(n) { return ui.fmt ? ui.fmt(n) : String(n | 0); }
  function name(t) { return ui.tierName ? ui.tierName(t) : 'Tier ' + t; }
  function ladder() { return cfg().LADDER || [1, 2, 3, 4, 5, 6, 7, 8, 9]; }          // every tier, in merge order (the collection's order)
  function modeName(m) { return (cfg().MODE_NAMES || {})[m] || m || ''; }
  function modeOf(d) { var g = app().game; return (d && d.mode) || (g && g.mode) || save().mode || cfg().DEFAULT_MODE || 'easy'; }
  function bestOf(m) { var G = CM.game, s = save(); return (G && G.bestFor) ? G.bestFor(s, m) : (s.best | 0); }
  function dpr() { return (lay && lay.dpr) || Math.min((root.devicePixelRatio || 1), 2); }
  function coarse() { try { return root.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } }
  function setText(sel, el, text) { qa(sel, el).forEach(function (n) { n.textContent = text; }); }
  function show(el, on) {
    if (!el) return;
    el.hidden = !on;
    if (on) el.removeAttribute('inert'); else el.setAttribute('inert', '');
  }
  function warn(e) { if (root.console) root.console.error('Cocktail Merge overlays', e); }
  function call(name, arg) {
    var fn = handlers[name];
    if (typeof fn === 'function') { try { fn(arg); } catch (e) { warn(e); } return true; }
    return false;
  }

  /** Paints tier t (icon mode via CM.art.paintIcon) into canvas c at w x h CSS px. */
  function icon(c, w, h, t, state) {
    var d = dpr();
    c.style.width = w + 'px'; c.style.height = h + 'px';
    c.width = Math.round(w * d); c.height = Math.round(h * d);
    try { if (CM.art && CM.art.paintIcon) CM.art.paintIcon(c, t, state); } catch (e) { warn(e); }
  }
  function everMask() {
    var s = save(), g = app().game, m = (s.discovered | 0);
    if (current !== 'title' && g) m |= (g.runMask | 0);
    return m;
  }
  function runScore(d) { var r = d && d.run; return (r && r.game && (r.game.score | 0)) || 0; }
  function playScore(d) { var g = app().game; return (d && typeof d.score === 'number') ? d.score : (g ? g.score | 0 : 0); }

  // ---------- builders ----------
  function buildSettings(box) {
    SETTINGS.forEach(function (s) {
      var b = doc.createElement('button');
      b.type = 'button'; b.className = 'switch-row'; b.setAttribute('role', 'switch'); b.setAttribute('data-key', s[0]);
      var l = doc.createElement('span'); l.textContent = s[1];
      if (s[2]) { var n = doc.createElement('small'); n.textContent = s[2]; l.appendChild(n); }
      var k = doc.createElement('span'); k.className = 'switch'; k.setAttribute('aria-hidden', 'true');
      b.appendChild(l); b.appendChild(k); box.appendChild(b);
    });
  }
  function refreshSettings() {
    var s = save(); qa('.switch-row').forEach(function (b) {
      var key = b.getAttribute('data-key'), inv = key === 'muted', v = s[key];
      if (typeof v !== 'boolean') v = key === 'music';
      b.setAttribute('aria-checked', (inv ? !v : v) ? 'true' : 'false');
    });
    if (ui.setMuteIcons) ui.setMuteIcons(!!s.muted);
  }
  function toggle(key) {
    var s = save(), cur = s[key];
    if (typeof cur !== 'boolean') cur = key === 'music';
    call(TOGGLE[key], !cur);
    refreshSettings();
  }
  // Collection: one card per tier, styled like the art contact sheet (owner request): a header with the tier
  // number, the name and the key colour, and a sand-coloured body with the cocktail standing on its shadow.
  function dark(hex) {   // relative luminance of a #rrggbb colour below 0.45 -> light text on the badge
    if (!hex || hex.length < 7) return false;
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.45;
  }
  function fillCollection(box) {
    var g = app().game, ever = everMask(), run = (current === 'title' || !g) ? ever : (g.runMask | 0), t, i, n = 0;
    var tiers = (CM.config && CM.config.TIERS) || [], L = ladder(), hardOnly = cfg().RULES && cfg().RULES.LADDER;
    while (box.firstChild) box.removeChild(box.firstChild);
    for (i = 0; i < L.length; i++) {
      t = L[i];
      var b = 1 << (t - 1), known = !!(ever & b), tier = tiers[t] || {};
      var card = doc.createElement('div'), head = doc.createElement('div'), num = doc.createElement('span'),
        label = doc.createElement('span'), body = doc.createElement('div'), c = doc.createElement('canvas');
      card.className = 'coll-card' + (known ? '' : ' unknown');
      head.className = 'coll-head'; num.className = 'coll-num'; label.className = 'coll-name'; body.className = 'coll-body';
      num.textContent = String(i + 1);
      // an undiscovered drink that only Hard's ladder has says where to find it instead of ???
      label.textContent = known ? name(t) : (hardOnly && hardOnly.indexOf(t) < 0 ? 'Hard mode' : '???');
      // the key colour is the badge background (owner: saves header space); the jug also shows its yellow accent
      num.style.background = known ? (tier.color || '#999') : '#B9A98C';
      num.style.color = known && dark(tier.color) ? '#FFF8E1' : '#3A2A12';
      if (known && tier.accent) num.style.boxShadow = '0 0 0 2px ' + tier.accent;
      head.appendChild(num); head.appendChild(label);
      body.appendChild(c); card.appendChild(head); card.appendChild(body); box.appendChild(card);
      icon(c, 96, 96, t, !known ? 'none' : (run & b) ? 'run' : 'earlier');
    }
    for (i = 0; i < L.length; i++) if (ever & (1 << (L[i] - 1))) n++;
    setText('.js-collected', null, n + ' of ' + L.length + ' cocktails discovered');
  }
  function fillHowto() {
    var lines = coarse() ? HOWTO_TOUCH : HOWTO_DESK;
    qa('.js-howto').forEach(function (box) {
      while (box.firstChild) box.removeChild(box.firstChild);
      var ul = doc.createElement('ul');
      lines.forEach(function (t) { var li = doc.createElement('li'); li.textContent = t; ul.appendChild(li); });
      box.appendChild(ul);
    });
  }
  function creditText() {     // [segments]: each one is kept on one line (no break inside "OGA-BY 3.0")
    var bg = CM.art && CM.art.backgrounds, a = app(), extra = [];
    try {
      if (bg && bg.creditLine) extra = [bg.creditLine(a.bgKey || a.attractBgKey) || ''];
      else if (bg && bg.credits) extra = bg.credits() || [];
    } catch (e) { extra = []; }
    return CRAFTPIX.concat(extra.filter(function (t) { return t && t.indexOf('CraftPix') < 0; }));
  }
  function setCredit(el) {
    qa('.js-credit', el).forEach(function (n) {
      while (n.firstChild) n.removeChild(n.firstChild);
      creditText().forEach(function (t, i) {
        var sp = doc.createElement('span'); sp.textContent = t; sp.style.whiteSpace = 'nowrap';
        if (i) n.appendChild(doc.createTextNode(' '));
        n.appendChild(sp);
      });
    });
  }

  // ---------- per-overlay fill ----------
  function fillTitle(d) {
    var s = save(), run = d.run || null, has = !!(run && run.game), el = sec('title'), tag = $('tag-text');
    if (tag) tag.textContent = cfg().DEDICATION || cfg().DEDICATION_FALLBACK || 'For you, with love.';
    if ($('logo-title') && cfg().GAME_TITLE) $('logo-title').textContent = cfg().GAME_TITLE;
    if ($('logo-sub') && cfg().GAME_SUBTITLE) $('logo-sub').textContent = cfg().GAME_SUBTITLE;
    show(el.querySelector('[data-act="continue"]'), has);
    show(el.querySelector('[data-act="newgame"]'), has);
    show(el.querySelector('[data-act="play"]'), !has);
    if ($('continue-score')) $('continue-score').textContent = has ? 'Score ' + fmt(runScore(d)) : '';
    var st = $('title-stats');
    if (st) {                                     // the bests per table (2.13); a table never played is left out
      while (st.firstChild) st.removeChild(st.firstChild);
      var modes = cfg().MODE_LIST || ['easy', 'normal', 'hard'], parts = [['span', 'Best: ']], n = 0;
      modes.forEach(function (m) { if (bestOf(m) > 0) parts.push(['text', ' '], ['span', (n++ ? '\u00B7 ' : '') + fmt(bestOf(m)) + ' ' + modeName(m)]); });   // a span per table: the line wraps between tables
      if (n) parts.push(['br', '']); else parts[0][1] = 'Best: 0 \u00B7 ';
      parts.push(['span', 'Highest: ' + name(s.bestTier || 1)]);
      if ((s.wins | 0) > 0) parts.push(['br', ''], ['b', 'Sangrias mixed: ' + fmt(s.wins)]);
      parts.forEach(function (p) { var n = p[0] === 'text' ? doc.createTextNode(p[1]) : doc.createElement(p[0]); if (p[0] !== 'text') n.textContent = p[1]; st.appendChild(n); });
    }
    setCredit(null);
    fillIcons();
  }
  function fillIcons() {
    var row = $('title-icons');
    if (!row) return;
    var L = ladder(), n = L.length, i, t;
    var S = lay ? lay.S : (root.innerWidth || 390), w = Math.max(18, Math.min(40, Math.floor((S - 32 - 24) / n) - 2));
    var h = Math.round(Math.min(44, w * 1.3)), ever = everMask();
    if (row.children.length !== n) {
      while (row.firstChild) row.removeChild(row.firstChild);
      for (i = 0; i < n; i++) row.appendChild(doc.createElement('canvas'));
    }
    for (i = 0; i < n; i++) {
      t = L[i];
      var c = row.children[i];
      c.style.animationDelay = (-(n - 1 - i) * 0.12).toFixed(2) + 's';
      icon(c, w, h, t, (ever & (1 << (t - 1))) ? 'run' : 'none');
    }
  }
  function fillScores(el, d) {
    var g = app().game, a = app(), score = playScore(d), m = modeOf(d), best = Math.max(bestOf(m), score);
    var base = a.bestAtRunStart | 0;
    var nb = typeof d.newBest === 'boolean' ? d.newBest : (score > base && base > 0);
    setText('.js-score', el, 'Score ' + fmt(score));
    setText('.js-best', el, 'Best ' + fmt(best) + ' \u00B7 ' + modeName(m));     // the best of this table only (2.13)
    qa('.js-newbest', el).forEach(function (n) { n.hidden = !nb; });
    return g;
  }
  function fillWin(d) {
    var el = sec('win'), c = $('win-jug-c'), art = CM.art;
    fillScores(el, d);
    if (root.Arcade) root.Arcade.share.set({ line: 'Sangria Verde mixed! Score ' + fmt(playScore(d)) + ' on ' + modeName(modeOf(d)) });
    if (!c || !art || !art.paintTier) return;
    var w = 120, h = 150, dd = dpr(), ctx;
    c.style.width = w + 'px'; c.style.height = h + 'px'; c.width = w * dd; c.height = h * dd;
    try {
      var b = art.spriteBounds ? art.spriteBounds(9, false) : { ax: 1.1, ay: 3.5, w: 2.2, h: 4.0 };
      var s = Math.min(c.height / b.h, c.width / b.w);
      ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
      ctx.translate(c.width / 2 - (b.w / 2 - b.ax) * s, c.height - (b.h - b.ay) * s);
      art.paintTier(ctx, 9, s);                       // in-world look (not icon mode), 3.5
    } catch (e) { warn(e); }
  }
  function fillOver(d) {
    var el = sec('over'), g = fillScores(el, d), t = d.highestTier || (g && g.highestTier) || 1;
    if ($('over-icon-c')) icon($('over-icon-c'), 40, 40, t, 'run');
    if ($('over-name')) $('over-name').textContent = name(t);
    if (root.Arcade) root.Arcade.share.set({ line: 'Score ' + fmt(playScore(d)) + ' on ' + modeName(modeOf(d)) + ', highest drink: ' + name(t) });
  }
  function fillPause(d) {
    var el = sec('pause');
    setText('.js-score', el, 'Score ' + fmt(playScore(d)) + ' \u00B7 ' + modeName(modeOf(d)) + ' table');
    fillCollection(el.querySelector('.js-collection'));
    refreshSettings();
  }

  // ---------- show / hide ----------
  function primary(el) {
    var list = qa('[data-primary]', el).filter(function (b) { return !b.hidden; });
    return list[0] || null;
  }
  function focusPrimary(el) {
    var b = primary(el);
    if (!b || coarse()) return;          // touch devices have no keyboard: no programmatic focus (no stray ring)
    try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); }
  }
  function blurActive() {
    var a = doc.activeElement;
    if (a && a !== doc.body && a.blur) a.blur();
  }

  /** showOverlay(id | null, data?): id in title, pause, win, over, oops, rotate. Hides every other overlay. */
  function showOverlay(id, d) {
    if (!inited) init(handlers);
    id = MAIN.indexOf(id) >= 0 ? id : null;
    d = d || {};
    closeSheet(true);
    disarm();
    MAIN.forEach(function (m) { show(sec(m), m === id); });
    current = id; data = d; openedAt = now();
    doc.body.setAttribute('data-overlay', id || 'none');
    try {
      if (id === 'title') fillTitle(d);
      else if (id === 'pause') fillPause(d);
      else if (id === 'win') fillWin(d);
      else if (id === 'over') fillOver(d);
    } catch (e) { warn(e); }
    refreshSettings();
    if (id === 'title') fitTitle();
    if (id) focusPrimary(sec(id)); else blurActive();
  }

  // The chooser (2.13): every table's best; the one chosen last is the orange primary (Enter starts it).
  function fillMode() {
    var last = save().mode || cfg().DEFAULT_MODE || 'easy';
    qa('#ov-mode [data-mode]').forEach(function (b) {
      var m = b.getAttribute('data-mode'), best = bestOf(m), line = b.querySelector('.js-mode-best');
      if (line) line.textContent = best > 0 ? 'Best ' + fmt(best) : 'No score yet';
      b.classList.toggle('btn-primary', m === last); b.classList.toggle('btn-secondary', m !== last);
      if (m === last) b.setAttribute('data-primary', ''); else b.removeAttribute('data-primary');
    });
  }
  /** openSheet(name) -> boolean: name in howto, settings, collection, mode. */
  function openSheet(nm) {
    if (SHEETS.indexOf(nm) < 0 || !sec(nm)) return false;
    closeSheet(true);
    var el = sec(nm);
    if (nm === 'collection') fillCollection(el.querySelector('.js-collection'));
    if (nm === 'settings') { setCredit(el); refreshSettings(); }
    if (nm === 'mode') fillMode();
    if (current && sec(current)) sec(current).setAttribute('inert', '');
    show(el, true); sheet = nm; openedAt = now();
    focusPrimary(el);
    return true;
  }
  function closeSheet(silent) {
    if (!sheet) return;
    show(sec(sheet), false); sheet = null;
    if (current && sec(current)) { sec(current).removeAttribute('inert'); if (!silent) focusPrimary(sec(current)); }
  }

  // ---------- armed confirmation (3.5) ----------
  function needsArm(act) {
    if (act === 'restart') return playScore(data) > 0;
    if (act === 'newgame') return runScore(data) > 0;
    return false;
  }
  function disarm() {
    if (armTimer) { root.clearTimeout(armTimer); armTimer = 0; }
    if (armedBtn) { armedBtn.classList.remove('armed'); armedBtn.textContent = armedBtn.getAttribute('data-label'); armedBtn = null; }
  }
  function arm(btn) {
    disarm();
    btn.setAttribute('data-label', btn.textContent);
    btn.textContent = btn.getAttribute('data-arm');
    btn.classList.add('armed');
    armedBtn = btn;
    armTimer = root.setTimeout(disarm, (cfg().APP && cfg().APP.ARM_MS) || 2000);
  }

  // ---------- actions ----------
  function act(a, btn) {
    if (btn && btn.hasAttribute('data-arm') && needsArm(a) && armedBtn !== btn) { arm(btn); return; }
    disarm();
    if (START_ACTS[a] && sec('mode')) { openSheet('mode'); return; }   // every new game asks for the table first (2.13)
    switch (a) {
      case 'play': call('onPlay'); break;
      case 'continue': call('onContinue'); break;
      case 'newgame': case 'newgame-win': call('onNewGame'); break;
      case 'mode': closeSheet(true); call('onNewGame', btn ? btn.getAttribute('data-mode') : undefined); break;
      case 'resume': call('onResume'); break;
      case 'restart': case 'restart-oops': call('onRestart'); break;
      case 'quit': call('onQuit'); break;
      case 'keep': call('onKeepPlaying'); break;
      case 'again': if (!call('onPlayAgain')) call('onNewGame'); break;
      case 'title': if (!call('onTitle')) call('onQuit'); break;
      case 'howto': case 'settings': case 'collection': openSheet(a); break;
      case 'exportPerf': if (CM.app && CM.app.perf) CM.app.perf.exportReport(); break;
      case 'share': if (root.Arcade) root.Arcade.share.go(); break;       // the arcade kit: a picture with the score (shared/share.js)
      case 'close': closeSheet(false); break;
      case 'mute': toggle('muted'); break;
    }
  }
  function onClick(ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-act], [data-key]') : null;
    if (!t || now() - openedAt < ((cfg().APP && cfg().APP.INPUT_GUARD_MS) || 250)) return;
    try { if (CM.audio && CM.audio.click) CM.audio.click(); } catch (e) { /* audio optional */ }
    try {
      if (t.hasAttribute('data-key')) toggle(t.getAttribute('data-key'));
      else act(t.getAttribute('data-act'), t);
    } catch (e) { warn(e); }
    if (ev.detail && t.blur && !t.closest('.switch-row')) t.blur();   // pointer click: no lingering focus
  }

  /** keyAction(code) -> boolean: the overlay keys of 3.6 / 5.7 outside PLAY (called by ui/input.js). */
  function keyAction(code) {
    var esc = code === 'Escape', enter = code === 'Enter', r = code === 'KeyR', p = code === 'KeyP', b;
    if (sheet === 'mode') {                                // Enter = the preselected table, 1 / 2 / 3 = easy / normal / hard
      var digit = /^(Digit|Numpad)([123])$/.exec(code), list = qa('#ov-mode [data-mode]');
      if (esc) { closeSheet(false); return true; }
      if (digit && (b = list[+digit[2] - 1])) { act('mode', b); return true; }
      if (enter && (b = primary(sec('mode')))) { act('mode', b); return true; }
      return false;
    }
    if (sheet) { if (esc || enter) { closeSheet(false); return true; } return false; }
    var el = current && sec(current);
    switch (current) {
      case 'title': if (enter && (b = primary(el))) { act(b.getAttribute('data-act'), b); return true; } return false;
      case 'pause':
        if (esc || p || enter) { act('resume'); return true; }
        if (r) { b = el.querySelector('[data-act="restart"]'); act('restart', b); return true; }
        return false;
      case 'win': if (esc || enter) { act('keep'); return true; } if (r) { act('newgame-win'); return true; } return false;
      case 'over': if (esc) { act('title'); return true; } if (enter || r) { act('again'); return true; } return false;
      case 'oops': if (enter) { act('restart-oops'); return true; } return false;
    }
    return false;
  }

  // ---------- layout ----------
  function layoutOverlays(l) {
    lay = l;
    var col = $('title-col');
    if (col && l) {   // the column starts at the roof hem; its padding holds the ribbon (3.5: top max(9% H, safeTop + 8))
      var hem = Math.round(Math.max(l.safe.top, 0.07 * l.H));
      col.style.top = hem + 'px';
      col.style.paddingTop = Math.max(0, Math.round(Math.max(0.09 * l.H, l.safe.top + 8)) - hem) + 'px';
      col.style.bottom = Math.max(0, Math.round(l.H - l.strip.bottom)) + 'px';
    }
    if (current === 'title') { fillIcons(); fitTitle(); }
  }
  function fitTag() {
    var t = $('tag-text');
    if (!t) return;
    var col = $('title-col'), size = col && col.classList.contains('compact') ? 17 : 20;
    t.style.display = 'block'; t.style.fontSize = size + 'px';
    while (size > 15 && t.scrollHeight > Math.ceil(size * 1.3 * 3) + 2) { size -= 1; t.style.fontSize = size + 'px'; }
    t.style.display = '';
    var wrap = $('tag-wrap'), rib = $('tag-ribbon'), logo = $('logo-title'), fs;
    if (wrap && rib) {   // the ribbon runs from the column top (the roof hem) down to the clothespin
      var len = Math.max(18, wrap.offsetTop + 16);
      rib.style.height = len + 'px';
      wrap.style.transformOrigin = '50% ' + (16 - len) + 'px';
    }
    if (logo) {          // one line: shrink the logo until it fits the column
      logo.style.fontSize = '';
      fs = parseFloat(root.getComputedStyle(logo).fontSize) || 48;
      while (logo.scrollWidth > logo.clientWidth - 12 && fs > 28) { fs -= 2; logo.style.fontSize = fs + 'px'; }
    }
  }
  function fitTitle() {
    var col = $('title-col'), card = $('title-howto'), chip = $('chip-howto');
    if (!col) return;
    fitTag();
    if (!card || !chip) return;
    var H = lay ? lay.H : (root.innerHeight || 800);
    function over() { return col.scrollHeight > col.clientHeight + 1; }
    col.classList.remove('compact');
    card.hidden = H < 700; chip.hidden = !card.hidden;
    if (!card.hidden && over()) { card.hidden = true; chip.hidden = false; }
    if (over()) { col.classList.add('compact'); fitTag(); }      // still too tall: the compact title (overlays.css)
    col.scrollTop = 0;
  }

  /** init(handlers): wires the overlay buttons and the HUD buttons; idempotent (later calls swap handlers). */
  function init(h) {
    handlers = h || handlers || {};
    if (ui.bindHud) ui.bindHud(handlers);
    if (inited || !doc) return;
    inited = true;
    qa('.js-settings').forEach(buildSettings);
    fillHowto();
    var rootEl = $('overlays');
    if (rootEl) rootEl.addEventListener('click', onClick);
    MAIN.concat(SHEETS).forEach(function (m) { show(sec(m), false); });
    refreshSettings();
    if (app().lay) layoutOverlays(app().lay);
  }

  ui.init = init; ui.showOverlay = showOverlay; ui.keyAction = keyAction;
  ui.openSheet = openSheet; ui.closeSheet = closeSheet; ui._layoutOverlays = layoutOverlays;
  ui.current = function () { return current; };
  /** armRestart(): arms the Pause card's Restart button (the app's R-key path; the card shows the arm). */
  ui.armRestart = function () { var b = sec('pause') && sec('pause').querySelector('[data-act="restart"]'); if (b && armedBtn !== b) arm(b); };
  ui.refreshSettings = refreshSettings;
})(typeof globalThis !== 'undefined' ? globalThis : this);
