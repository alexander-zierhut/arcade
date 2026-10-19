// src/ui/overlays.js: title, intro, pause, win, timeout, serie, stuck sheet, how-to, highscores (two tabs) and settings
// (DESIGN 7.1). One section is visible at a time; sheets opened from the title or the pause card return there on
// close. The house button (home), the share buttons, the changelog card and the backup are the arcade kit's.
// Buttons carry data-act; data-arm buttons need a second tap within 2.5 s. Browser-only; sets SS.ui.overlays.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var ui = SS.ui = SS.ui || {};
  var doc = root.document;
  var handlers = {}, current = null, returnTo = null, armed = null, armTimer = 0, save = null, lastData = {}, tab = 'relaxed';

  function $(sel, from) { return (from || doc).querySelector(sel); }
  function section(name) { return doc.getElementById('ov-' + name); }
  function t(k, v) { return SS.t(k, v); }

  function init(h) {
    handlers = h || {};
    var ovs = doc.getElementById('overlays');
    ovs.addEventListener('click', function (ev) {
      var tabBtn = ev.target && ev.target.closest ? ev.target.closest('button[data-tab]') : null;
      if (tabBtn) { tab = tabBtn.getAttribute('data-tab'); renderScores($('.js-scores', section('scores')), save); updateTabs(); return; }
      var btn = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
      if (!btn || btn.disabled) return;
      ev.preventDefault();
      var act = btn.getAttribute('data-act');
      if (btn.hasAttribute('data-arm')) { if (armed !== btn) { arm(btn); return; } disarm(); }
      if (handlers.onClick) handlers.onClick();
      run(act, btn);
    });
    applyLang();
  }
  function arm(btn) { disarm(); armed = btn; btn.classList.add('armed'); btn.setAttribute('data-label', btn.innerHTML); btn.textContent = btn.getAttribute('data-arm'); armTimer = root.setTimeout(disarm, 2500); }
  function disarm() { if (armTimer) { root.clearTimeout(armTimer); armTimer = 0; } if (armed) { armed.classList.remove('armed'); if (armed.getAttribute('data-label')) armed.innerHTML = armed.getAttribute('data-label'); armed = null; } }
  function run(act) {
    var H = handlers;
    switch (act) {
      case 'play-relaxed': return H.onPlay && H.onPlay('relaxed');
      case 'play-timed': return H.onPlay && H.onPlay('timed');
      case 'intro-go': return H.onIntroDone && H.onIntroDone();
      case 'resume': return H.onResume && H.onResume();
      case 'restart': return H.onRestart && H.onRestart();
      case 'quit': return H.onQuit && H.onQuit();
      case 'next': return H.onNext && H.onNext();
      case 'retry': return H.onRetry && H.onRetry();
      case 'extend': return H.onExtend && H.onExtend();
      case 'end-serie': return H.onEndSerie && H.onEndSerie();
      case 'undo': return H.onUndo && H.onUndo();
      case 'rescue': return H.onRescue && H.onRescue();
      case 'howto': return show('howto');
      case 'scores': return show('scores');
      case 'settings': return show('settings');
      case 'share': return H.onShare && H.onShare();
      case 'close': return show(returnTo || 'title', lastData[returnTo || 'title']);
    }
  }
  /** show(name, data): shows one section (null hides all). Sheets remember where to return. */
  function show(name, data) {
    disarm();
    if (name === 'howto' || name === 'scores' || name === 'settings') { if (current && current !== name && ['title', 'pause'].indexOf(current) >= 0) returnTo = current; }
    else returnTo = null;
    var all = doc.querySelectorAll('.ov');
    for (var i = 0; i < all.length; i++) { all[i].hidden = true; all[i].inert = true; }
    current = name;
    if (!name) return;
    var sec = section(name);
    if (!sec) return;
    lastData[name] = data || lastData[name] || {};
    fill(name, sec, lastData[name]);
    sec.hidden = false; sec.inert = false;
    if (name !== 'title') { var box = doc.getElementById('toasts'); if (box) box.innerHTML = ''; }
  }
  function hide(name) { if (current === name) { var sec = section(name); if (sec) { sec.hidden = true; sec.inert = true; } current = null; } }
  function modeLabel(m) { return t(m === 'timed' ? 'mode_timed' : 'mode_relaxed'); }
  function fill(name, sec, d) {
    var g = d.game, s = d.save || save;
    if (name === 'title') {
      ['relaxed', 'timed'].forEach(function (m) {
        var btn = $('[data-act="play-' + m + '"]', sec), reached = s ? s.records[m].reached : 1, old = btn.querySelector('.progress');
        if (old) old.parentNode.removeChild(old);
        var p = doc.createElement('span'); p.className = 'progress'; p.textContent = reached > 1 ? t('reached', { n: reached }) + ' · ' + t('continue_') : ''; if (p.textContent) btn.appendChild(p);
      });
      $('#title-stats', sec).textContent = s ? t('stats_line', { relaxed: s.records.relaxed.reached, timed: s.records.timed.reached }) : '';
    } else if (name === 'intro') {
      var lv = d.level;
      $('.js-title', sec).textContent = t('intro_title', { n: lv.n });
      var tagEl = $('.js-tag', sec); tagEl.hidden = !(lv.turbo || lv.tag === 'hard' || lv.tag === 'vhard' || lv.tag === 'pause'); tagEl.textContent = lv.turbo ? t('turbo') : lv.tag === 'hard' ? t('hard') : lv.tag === 'vhard' ? t('vhard') : t('pause_tag');
      $('.js-line', sec).textContent = d.line || '';
      $('.js-sub', sec).textContent = lv.mode === 'timed' ? t('intro_timed', { t: ui.hud.fmtTime(lv.timeMs) }) : t('intro_relaxed', { par: lv.par });
      $('button[data-act="intro-go"]', sec).textContent = t('intro_tap');
    } else if (name === 'pause') {
      $('.js-score', sec).textContent = g ? t('level', { n: g.level.n }) + (g.mode === 'timed' ? ' · ' + t('run_total', { n: (d.serie || 0) + g.levelScore }) : '') : '';
      renderSettings($('.js-settings', sec), s);
    } else if (name === 'win') {
      var w = d.cleared || {};
      $('.js-title', sec).textContent = t('win_title', { n: g.level.n });
      var stars = $('.js-stars', sec).children; for (var i = 0; i < 3; i++) stars[i].className = i < (w.stars || 0) ? 'on' : '';
      $('.js-score', sec).textContent = t('points_line', { n: w.levelScore || 0 });
      var detail = g.mode === 'timed' ? t('win_detail_timed', { s: Math.floor((w.timeLeftMs || 0) / 1000), bonus: w.bonus ? w.bonus.time : 0 }) : t('win_detail_relaxed', { moves: w.moves || 0, par: g.level.par });
      $('.js-detail', sec).textContent = detail;
      var extras = [];
      if (w.bonus && w.bonus.bunnies) extras.push(t('win_bunny', { n: w.bonus.bunnies }));
      if (w.bonus && w.bonus.flawless) extras.push(t('win_flawless', { n: w.bonus.flawless }));
      if (g.mode === 'relaxed' && w.badges) w.badges.forEach(function (b) { if (b === 'nohelp') extras.push(t('badge_nohelp')); if (b === 'bunnysaved') extras.push(t('badge_bunny')); });
      if (g.mode === 'timed') extras.push(t('run_total', { n: d.serie || 0 }));
      if (d.levelBest) extras.push(t('level_best', { n: d.levelBest }));
      $('.js-extra', sec).textContent = extras.join(' · ');
      $('.js-newbest', sec).hidden = !d.newBest;
      if (root.Arcade) root.Arcade.share.set({ line: t('share_win', { n: g.level.n, score: g.mode === 'timed' ? (d.serie || 0) : (w.levelScore || 0) }) });
    } else if (name === 'timeout') {
      $('.js-title', sec).textContent = t('lose_timeout');
      $('.js-text', sec).textContent = t('timeout_text');
    } else if (name === 'serie') {
      $('.js-title', sec).textContent = t('serie_title');
      $('.js-score', sec).textContent = t('serie_banked', { score: d.score, rank: d.rank + 1 });
      $('.js-detail', sec).textContent = t('serie_next', { n: d.nextLevel });
      $('.js-newbest', sec).hidden = !d.newBest;
      if (root.Arcade) root.Arcade.share.set({ line: t('share_serie', { score: d.score, level: Math.max(1, (d.nextLevel || 1) - 1) }) });
    } else if (name === 'stuck') {
      sec.classList.toggle('timed', !!(g && g.mode === 'timed'));
      $('.js-title', sec).textContent = t('stuck_title');
      $('.js-text', sec).textContent = t('stuck_text');
      var bb = $('.js-bunny', sec);
      if (d.bunnies > 0) { bb.textContent = t('bunny'); bb.setAttribute('data-act', 'spend'); bb.hidden = false; }
      else if (d.rescueAvailable) { bb.textContent = t('bunny_rescue'); bb.setAttribute('data-act', 'rescue'); bb.hidden = false; }
      else bb.hidden = true;
      $('[data-act="undo"]', sec).disabled = !d.canUndo;
    } else if (name === 'howto') {
      $('.js-howto', sec).innerHTML = t('howto_text');
    } else if (name === 'scores') {
      renderScores($('.js-scores', sec), s); updateTabs();
    } else if (name === 'settings') {
      renderSettings($('.js-settings', sec), s);
      $('.js-version', sec).textContent = t('version', { v: SS.config.VERSION });
    }
  }
  function updateTabs() { var tabs = doc.querySelectorAll('#ov-scores .tab'); for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].getAttribute('data-tab') === tab); }
  function renderScores(box, s) {
    box.innerHTML = '';
    if (!s) return;
    var r = s.records[tab], best = doc.createElement('p'); best.className = 'empty';
    if (tab === 'timed') best.textContent = r.top.length ? t('scores_best_timed', { score: r.best, level: r.bestLevel }) : t('scores_empty');
    else best.textContent = r.totalBest ? t('scores_best_relaxed', { score: r.totalBest, stars: r.totalStars, level: r.reached }) : t('scores_empty');
    box.appendChild(best);
    if (r.top.length) {
      var ol = doc.createElement('ol');
      r.top.forEach(function (e) {
        var li = doc.createElement('li');
        li.textContent = tab === 'timed' ? t('scores_entry_timed', { score: e.score, from: e.fromLevel, to: e.level }) : t('scores_entry_relaxed', { score: e.score, level: e.level });
        var sp = doc.createElement('span'); sp.textContent = e.date; li.appendChild(sp); ol.appendChild(li);
      });
      box.appendChild(ol);
    }
    var keys = Object.keys(r.levels).map(Number).sort(function (a, b) { return a - b; });
    if (keys.length) {
      var p = doc.createElement('p'); p.className = 'lvls';
      p.textContent = keys.slice(-12).map(function (n) { var L = r.levels[n]; return 'L' + n + ': ' + L.best + ' ' + '★'.repeat(L.stars); }).join(' · ');
      box.appendChild(p);
    }
  }
  function toggleRow(label, on, cb) {
    var row = doc.createElement('div'); row.className = 'setting-row';
    var l = doc.createElement('span'); l.textContent = label; row.appendChild(l);
    var b = doc.createElement('button'); b.type = 'button'; b.className = 'toggle' + (on ? ' on' : ''); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.setAttribute('aria-label', label);
    b.addEventListener('click', function () { var now = !b.classList.contains('on'); b.classList.toggle('on', now); b.setAttribute('aria-pressed', now ? 'true' : 'false'); if (handlers.onClick) handlers.onClick(); cb(now); });
    row.appendChild(b); return row;
  }
  function renderSettings(box, s) {
    box.innerHTML = '';
    if (!s) return;
    box.appendChild(toggleRow(t('sound'), !s.muted, function (on) { handlers.onToggle && handlers.onToggle('muted', !on); }));
    if (root.navigator && root.navigator.vibrate) box.appendChild(toggleRow(t('haptics'), s.haptics !== false, function (on) { handlers.onToggle && handlers.onToggle('haptics', on); }));
    box.appendChild(toggleRow(t('reduced_motion'), !!s.reducedMotion, function (on) { handlers.onToggle && handlers.onToggle('reducedMotion', on); }));
    box.appendChild(toggleRow(t('still_belts'), !!s.stillBelts, function (on) { handlers.onToggle && handlers.onToggle('stillBelts', on); }));
    box.appendChild(toggleRow(t('show_depth'), !!s.showDepth, function (on) { handlers.onToggle && handlers.onToggle('showDepth', on); }));
    box.appendChild(toggleRow(t('flat_icons'), !!s.flatIcons, function (on) { handlers.onToggle && handlers.onToggle('flatIcons', on); }));
    box.appendChild(toggleRow(t('lowgfx'), !!s.lowGfx, function (on) { handlers.onToggle && handlers.onToggle('lowGfx', on); }));
    if (handlers.canFullscreen && handlers.canFullscreen()) box.appendChild(toggleRow(t('fullscreen_setting'), !!(doc.fullscreenElement), function (on) { handlers.onFullscreen && handlers.onFullscreen(on); }));
    var row = doc.createElement('div'); row.className = 'setting-row';
    var l = doc.createElement('span'); l.textContent = t('language'); row.appendChild(l);
    var seg = doc.createElement('div'); seg.className = 'seg';
    ['de', 'en'].forEach(function (code) { var b = doc.createElement('button'); b.type = 'button'; b.textContent = code.toUpperCase(); b.className = SS.strings.lang() === code ? 'on' : ''; b.addEventListener('click', function () { if (handlers.onLang) handlers.onLang(code); }); seg.appendChild(b); });
    row.appendChild(seg); box.appendChild(row);
    var row2 = doc.createElement('div'); row2.className = 'setting-row';
    var btn = doc.createElement('button'); btn.type = 'button'; btn.className = 'chip'; btn.textContent = t('reset_tips'); btn.addEventListener('click', function () { if (handlers.onResetTips) handlers.onResetTips(); btn.disabled = true; });
    row2.appendChild(btn); box.appendChild(row2);
  }
  /** applyLang(): rewrites the static texts of the DOM for the current language. */
  function applyLang() {
    var map = {
      '#logo-title': 'title', '#logo-sub': 'subtitle',
      '[data-act="howto"]': 'howto', '[data-act="scores"]': 'scores', '[data-act="settings"]': 'settings', '[data-act="share"]': 'share',
      '#ov-pause .card-title': 'pause', '[data-act="resume"]': 'resume', '[data-act="restart"]': 'restart', '[data-act="next"]': 'next',
      '[data-act="retry"]': 'resume', '[data-act="extend"]': 'extend', '[data-act="end-serie"]': 'end_serie', '[data-act="undo"]': 'undo',
      '#ov-howto .card-title': 'howto', '#ov-scores .card-title': 'scores', '#ov-settings .card-title': 'settings',
      '#ov-howto [data-act="close"]': 'ok', '#ov-scores [data-act="close"]': 'back', '#ov-settings [data-act="close"]': 'back', '[data-act="quit"]': 'quit',
      '#ov-scores [data-tab="relaxed"]': 'mode_relaxed', '#ov-scores [data-tab="timed"]': 'mode_timed'
    };
    for (var sel in map) { var nodes = doc.querySelectorAll(sel); for (var i = 0; i < nodes.length; i++) nodes[i].textContent = t(map[sel]); }
    [['play-relaxed', 'play_relaxed', 'play_relaxed_sub'], ['play-timed', 'play_timed', 'play_timed_sub']].forEach(function (e) {
      var b = $('[data-act="' + e[0] + '"]'); if (!b) return; b.innerHTML = ''; b.appendChild(doc.createTextNode(t(e[1]))); var sm = doc.createElement('small'); sm.textContent = t(e[2]); b.appendChild(sm);
    });
    var nb = doc.querySelectorAll('.js-newbest'); for (var n = 0; n < nb.length; n++) nb[n].textContent = t('new_best');
    var home = $('[data-arcade="home"]'); if (home) { home.setAttribute('aria-label', t('all_games')); home.setAttribute('title', t('all_games')); }   // the house button: an icon, the label is spoken
    var arms = doc.querySelectorAll('[data-arm]');
    for (var a = 0; a < arms.length; a++) { var act = arms[a].getAttribute('data-act'); arms[a].setAttribute('data-arm', t(act === 'restart' ? 'arm_restart' : act === 'end-serie' ? 'arm_end' : 'arm_quit')); }
    doc.documentElement.lang = SS.strings.lang();
    if (ui.hud) ui.hud.applyLang();
  }
  function setSave(s) { save = s; }
  function toast(text) {
    var box = doc.getElementById('toasts'); if (!box) return;
    box.innerHTML = '';
    var d = doc.createElement('div'); d.className = 'toast'; d.textContent = text; box.appendChild(d);
    root.setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 2200);
  }
  function currentName() { return current; }
  ui.overlays = { init: init, show: show, hide: hide, current: currentName, applyLang: applyLang, setSave: setSave, toast: toast, disarm: disarm };
})(typeof globalThis !== 'undefined' ? globalThis : this);
