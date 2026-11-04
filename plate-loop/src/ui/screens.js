// src/ui/screens.js: the title, the endless chooser, the how-to cards, the pause card, the settings, the win and lose
// cards. PL.screens.show(name, data) / hide(); every change tells the kit where we are (Arcade.screen, GAME-SPEC 10).
// The markup is static in index.html; this file fills it, wires the buttons and calls the app (PL.app, main.js).
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};
  var doc = root.document;
  var strings = PL.strings, save = PL.save;
  function t(k, v) { return strings ? strings.t(k, v) : k; }

  var MECHS = ['basics', 'hidden', 'pair', 'wrap', 'ice', 'lock', 'oneway'];
  var TIERS = ['easy', 'normal', 'hard', 'extreme'];
  var CARDS = ['pause', 'settings', 'modes', 'howto', 'win', 'lose'];
  var BELT_PIECES = ['salmon', 'kappa', 'ikura', 'tuna', 'tamago', 'ebi', 'tekka', 'unagi', 'california', 'inari', 'tako', 'uni'];

  var els = {};
  var shown = null;                 // the card on screen (name) or null
  var base = null;                  // 'title' | 'play'
  var data = {};                    // data of the card on screen
  var modes = { tier: 'easy', noLuck: false };
  var hw = { pages: MECHS.slice(), index: 0, back: 'title', onDone: null };
  var pillState = null;
  var kbd = false;                  // the last input was the keyboard: only then a card takes the focus (no focus ring after a tap)

  function $(id) { return doc.getElementById(id); }
  function app() { return PL.app || {}; }
  function arcade(name) { try { if (root.Arcade) root.Arcade.screen(name); } catch (e) { /* the kit is optional in tests */ } }
  function levelsTotal() { return PL.levels && PL.levels.length ? PL.levels.length : 100; }
  function tierName(tier) { return t('tier_' + tier); }
  function sound() { return save ? save.get().sound !== false : true; }

  // ------------------------------------------------------------------ mechanics of a level (for the how-to cards)
  function mechanics(level) {
    var f = { basics: true };
    function piece(p) { if (typeof p === 'string' && p.charAt(0) === 'h') f.hidden = true; }
    var boxes = (level && level.boxes) || [];
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i], m = b.mods || {}, ps = b.pieces || [];
      if (m.wrap !== undefined && m.wrap !== null && m.wrap !== false) f.wrap = true;
      if (m.ice) f.ice = true;
      if (m.lock) f.lock = true;
      if (m.oneway) f.oneway = true;
      for (var j = 0; j < ps.length; j++) {
        if (Array.isArray(ps[j])) { f.pair = true; piece(ps[j][1]); piece(ps[j][2]); } else piece(ps[j]);
      }
    }
    return MECHS.filter(function (id) { return f[id]; });
  }
  /** unseen(level) -> the how-to pages this level brings that the player has not seen yet. */
  function unseen(level) {
    return mechanics(level).filter(function (id) { return !(save && save.seenHowto(id)); });
  }

  // ------------------------------------------------------------------ small illustration kit (how-to cards)
  function img(name, cls, extra) { return '<img' + (cls ? ' class="' + cls + '"' : '') + (extra || '') + ' src="assets/sprites/' + name + '.svg" alt="" draggable="false">'; }
  function slot(inner) { return '<span class="islot">' + (inner || '') + '</span>'; }
  function box(slots, o) {
    o = o || {};
    var h = '<span class="ibox' + (o.sm ? ' sm' : '') + (o.closed ? ' closed' : '') + '"' + (o.style ? ' style="' + o.style + '"' : '') + '>';
    for (var i = 0; i < 4; i++) h += slot(slots[i]);
    return h + (o.inner || '') + '</span>';
  }
  function plate(piece) { return '<span class="iplate">' + img('plate') + (piece ? img(piece) : '') + '</span>'; }
  var ARROW = '<svg class="iarrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h14M12 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var LOCK_COLOUR = '#4F7CFF';
  var ILL = {
    basics: function () { return box([img('tuna'), img('salmon'), img('salmon'), '']) + ARROW + plate('salmon') + plate('salmon'); },
    hidden: function () { return box([img('cloche'), img('cloche'), img('tuna'), ''], { sm: true }) + ARROW + box([img('cloche'), img('salmon', 'glint'), '', ''], { sm: true }); },
    pair: function () { return box([img('tuna'), img('salmon') + img('clip', 'iclip'), img('kappa'), '']) + ARROW + plate('salmon') + plate('kappa'); },
    wrap: function () {
      return box([img('tuna'), img('tuna'), img('tuna'), img('tuna')], { sm: true, closed: true, inner: img('stamp', 'istamp') }) + ARROW +
        box([], { sm: true, inner: '<span class="icover cloth" style="--cc:#D7263D">' + img('tuna') + '</span>' });
    },
    ice: function () {
      return box([img('kappa'), img('kappa'), img('kappa'), img('kappa')], { sm: true, closed: true, inner: img('stamp', 'istamp') }) + ARROW +
        box([], { sm: true, inner: '<span class="icover ice"></span>' });
    },
    lock: function () {
      return box([img('tuna'), img('salmon') + img('keytag', 'ikey', ' data-tint="' + LOCK_COLOUR + '" data-sprite="keytag"'), '', ''], { sm: true }) + ARROW +
        box([], { sm: true, inner: '<span class="icover shutter">' + img('padlock', '', ' data-tint="' + LOCK_COLOUR + '" data-sprite="padlock"') + '</span>' });
    },
    oneway: function () {
      return plate('salmon') + ARROW + box([img('salmon'), '', '', ''], { sm: true, style: 'margin-right:16px', inner: img('noreturn', 'isign') });
    }
  };
  /** tint(container): swaps <img data-tint> for the renderer's tinted sprite when the sprite cache has one. */
  function tint(container) {
    if (!PL.sprites || typeof PL.sprites.tinted !== 'function') return;
    var list = container.querySelectorAll('img[data-tint]');
    for (var i = 0; i < list.length; i++) {
      try {
        var c = PL.sprites.tinted(list[i].getAttribute('data-sprite'), list[i].getAttribute('data-tint'));
        if (c && c.nodeType === 1) {
          c.className = list[i].className; c.setAttribute('aria-hidden', 'true');
          if (!list[i].className) { c.style.width = 'calc(var(--s) * 1.3)'; c.style.height = 'calc(var(--s) * 1.3)'; }
          list[i].parentNode.replaceChild(c, list[i]);
        }
      } catch (e) { /* keep the plain image */ }
    }
  }

  // ------------------------------------------------------------------ title
  function buildBelt() {
    var track = els.track, html = '', i, set = '';
    if (!track || track.childNodes.length) return;
    for (i = 0; i < 16; i++) set += '<span class="belt-item">' + img('plate') + img(BELT_PIECES[i % BELT_PIECES.length]) + '</span>';
    html = set + set;
    track.innerHTML = html;
  }
  function updateTitle() {
    var lvl = save ? save.get().level : 1;
    els.playLabel.textContent = lvl > 1 ? t('play_continue', { n: Math.min(lvl, levelsTotal()) }) : t('play_start');
  }

  // ------------------------------------------------------------------ pill (the level / streak pill in the top band)
  function setPill(p) {
    pillState = p || pillState;
    if (!pillState || !els.pill) return;
    var tier = pillState.tier || 'easy', text, aria;
    if (pillState.mode === 'endless') {
      text = t('pill_endless', { tier: tierName(tier), n: pillState.streak || 0 });
      aria = t('pill_endless_aria', { tier: tierName(tier), n: pillState.streak || 0 });
    } else {
      text = t('level', { n: pillState.level });
      aria = text + ', ' + tierName(tier);
    }
    els.pill.setAttribute('data-tier', tier);
    els.pill.setAttribute('aria-label', aria);
    els.pillText.textContent = text;
    if (tier === 'extreme') els.skull.removeAttribute('hidden'); else els.skull.setAttribute('hidden', '');   // an SVG has no .hidden property
  }

  // ------------------------------------------------------------------ cards
  function showBase(which) {
    base = which;
    els.title.hidden = which !== 'title';
    els.play.hidden = which !== 'play';
  }
  function hideCards() {
    shown = null;
    els.cards.hidden = true;
    for (var i = 0; i < CARDS.length; i++) els['card_' + CARDS[i]].hidden = true;
  }
  function openCard(name, d) {
    data = d || {};
    for (var i = 0; i < CARDS.length; i++) els['card_' + CARDS[i]].hidden = CARDS[i] !== name;
    els.cards.hidden = false;
    shown = name;
    var card = els['card_' + name];
    card.scrollTop = 0;
    var first = kbd ? (card.querySelector('.btn.primary:not([hidden])') || card.querySelector('button:not([hidden])')) : null;
    if (first) { try { first.focus({ preventScroll: true }); } catch (e) { /* old browser */ } }
  }

  function renderSound() {
    var on = sound();
    els.setSound.setAttribute('aria-pressed', on ? 'true' : 'false');
    els.setSoundLabel.textContent = t(on ? 'sound_on' : 'sound_off');
  }

  function renderModes() {
    var s = save ? save.get() : { endless: { best: {} } };
    var btns = els.tiers.querySelectorAll('.tier');
    for (var i = 0; i < btns.length; i++) {
      var tier = btns[i].getAttribute('data-tier'), best = s.endless.best[tier] || 0;
      btns[i].setAttribute('aria-checked', tier === modes.tier ? 'true' : 'false');
      btns[i].querySelector('small').textContent = best > 0 ? t('best', { n: best }) : '';
    }
    els.noluck.setAttribute('aria-pressed', modes.noLuck ? 'true' : 'false');
  }

  function renderHowto() {
    var id = hw.pages[hw.index], n = hw.pages.length;
    els.howtoIll.innerHTML = ILL[id] ? ILL[id]() : '';
    tint(els.howtoIll);
    els.howtoH.textContent = t('h_' + id + '_t');
    els.howtoText.textContent = t('h_' + id);
    var dots = '';
    if (n > 1) for (var i = 0; i < n; i++) dots += '<i' + (i === hw.index ? ' class="on"' : '') + '></i>';
    els.howtoDots.innerHTML = dots;
    els.howtoDots.setAttribute('aria-label', t('page_of', { a: hw.index + 1, b: n }));
    els.howtoPrev.hidden = hw.index === 0;
    els.howtoNext.textContent = hw.index < n - 1 ? t('next') : t('gotit');
    if (save) save.markHowto(id);
  }
  function closeHowto() {
    var done = hw.onDone; hw.onDone = null;
    if (done) { done(); return; }
    show(hw.back || 'title', hw.backData);
  }

  function renderEnd() {
    var d = data, line, total = levelsTotal();
    if (shown === 'win') {
      if (d.mode === 'endless') {
        els.winText.textContent = t('win_streak', { n: d.streak, tier: tierName(d.tier) });
        els.winNext.textContent = t('next_round');
        line = t('share_streak', { n: d.streak, tier: tierName(d.tier) });
        els.winReplay.hidden = true;
      } else {
        var last = d.level >= total;
        els.winText.textContent = t('win_level', { n: d.level }) + (last ? '. ' + t('all_done', { n: total }) : '');
        els.winNext.textContent = last ? t('endless') : t('next_level');
        line = t('share_level', { n: d.level });
        els.winReplay.hidden = false;
      }
    } else if (shown === 'lose') {
      if (d.mode === 'endless') {
        els.loseText.textContent = t('lose_streak', { n: d.streak, tier: tierName(d.tier) }) + '. ' + t('lose_text');
        els.loseRetry.textContent = t('new_run');
        els.loseModes.hidden = false;
        els.loseBest.hidden = !(d.newBest && d.streak > 0);
        els.loseBest.textContent = t('new_best') + ' ' + t('best', { n: d.streak });
        line = d.streak > 0 ? t('share_streak', { n: d.streak, tier: tierName(d.tier) }) : '';
        els.loseShare.hidden = d.streak <= 0;
      } else {
        els.loseText.textContent = t('lose_text');
        els.loseRetry.textContent = t('retry');
        els.loseModes.hidden = true;
        els.loseBest.hidden = true;
        line = t('share_lose', { n: d.level });
        els.loseShare.hidden = false;
      }
    }
    if (line) { try { root.Arcade.share.set({ line: line }); } catch (e) { /* kit missing */ } }
  }

  // ------------------------------------------------------------------ show / hide
  /** show(name, data): 'title' | 'play' | 'modes' | 'howto' | 'settings' | 'pause' | 'win' | 'lose'. */
  function show(name, d) {
    d = d || {};
    if (name === 'title') {
      showBase('title'); hideCards(); updateTitle(); arcade('title');
    } else if (name === 'play') {
      showBase('play'); hideCards(); arcade('play');
    } else if (name === 'board') {
      showBase('play'); hideCards();                 // the board without telling the kit we are playing (a how-to card follows)
    } else if (name === 'pause') {
      openCard('pause', d); arcade('pause');
    } else if (name === 'settings') {
      renderSound(); openCard('settings', d);
      if (root.Arcade && root.Arcade.refresh) root.Arcade.refresh();
      arcade(d.back === 'pause' ? 'pause' : 'menu');
    } else if (name === 'modes') {
      var s = save ? save.get() : null;
      if (s && !d.keep) { modes.tier = s.endless.tier; modes.noLuck = s.endless.noLuck; }
      renderModes(); openCard('modes', d); arcade('menu');
    } else if (name === 'howto') {
      hw.pages = d.pages && d.pages.length ? d.pages.slice() : MECHS.slice();
      hw.index = 0; hw.back = d.back || 'title'; hw.backData = d.backData; hw.onDone = d.onDone || null;
      openCard('howto', d); renderHowto(); arcade(d.back === 'pause' ? 'pause' : 'menu');
    } else if (name === 'win' || name === 'lose') {
      shown = name; data = d;
      renderEnd(); openCard(name, d); arcade(name);
    }
  }
  function hide() { hideCards(); }

  // ------------------------------------------------------------------ language
  function relabel() {
    if (!doc) return;
    if (strings) strings.apply(doc);
    try { doc.documentElement.lang = root.Arcade.lang.get(); } catch (e) { /* no kit */ }
    updateTitle(); renderSound(); setPill();
    if (shown === 'modes') renderModes();
    if (shown === 'howto') renderHowto();
    if (shown === 'win' || shown === 'lose') renderEnd();
  }

  // ------------------------------------------------------------------ init
  function init() {
    if (!doc || els.title) return;
    var ids = { title: 'screen-title', play: 'screen-play', cards: 'cards', track: 'title-track', playLabel: 'play-label', pill: 'pill', pillText: 'pill-text', skull: 'pill-skull',
      setSound: 'set-sound', setSoundLabel: 'set-sound-label', tiers: 'modes-tiers', noluck: 'modes-noluck',
      howtoIll: 'howto-ill', howtoH: 'howto-h', howtoText: 'howto-text', howtoDots: 'howto-dots', howtoPrev: 'howto-prev', howtoNext: 'howto-next',
      winText: 'win-text', winNext: 'win-next', winReplay: 'win-replay', loseText: 'lose-text', loseRetry: 'lose-retry', loseModes: 'lose-modes', loseBest: 'lose-best', loseShare: 'lose-share' };
    for (var k in ids) if (Object.prototype.hasOwnProperty.call(ids, k)) els[k] = $(ids[k]);
    for (var i = 0; i < CARDS.length; i++) els['card_' + CARDS[i]] = $('card-' + CARDS[i]);

    function on(id, fn) { var e = $(id); if (e) e.addEventListener('click', function (ev) { ev.preventDefault(); fn(); }); }
    function call(name) { return function () { var a = app(); if (typeof a[name] === 'function') a[name].apply(a, arguments); }; }

    // title
    on('btn-play', call('playLevels'));
    on('btn-endless', function () { show('modes', { back: 'title' }); });
    on('chip-howto', function () { show('howto', { back: 'title' }); });
    on('chip-settings', function () { show('settings', { back: 'title' }); });
    // play
    on('btn-pause', call('pause'));
    // pause
    on('pause-resume', call('resume'));
    on('pause-restart', call('restart'));
    on('pause-settings', function () { show('settings', { back: 'pause' }); });
    on('pause-howto', function () { show('howto', { back: 'pause' }); });
    on('pause-quit', call('toTitle'));
    // settings
    on('set-sound', function () {
      var next = !sound();
      if (save) save.patch({ sound: next });
      renderSound();
      var a = app(); if (typeof a.setSound === 'function') a.setSound(next);
    });
    on('settings-done', function () { show(data.back === 'pause' ? 'pause' : 'title'); });
    // endless chooser
    els.tiers.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('.tier') : null;
      if (!b) return;
      modes.tier = b.getAttribute('data-tier'); renderModes();
    });
    on('modes-noluck', function () { modes.noLuck = !modes.noLuck; renderModes(); });
    on('modes-start', function () {
      if (save) save.patch({ endless: { tier: modes.tier, noLuck: modes.noLuck } });
      var a = app(); if (typeof a.startEndless === 'function') a.startEndless(modes.tier, modes.noLuck);
    });
    on('modes-back', function () { show('title'); });
    // how-to
    on('howto-prev', function () { if (hw.index > 0) { hw.index--; renderHowto(); } });
    on('howto-next', function () { if (hw.index < hw.pages.length - 1) { hw.index++; renderHowto(); } else closeHowto(); });
    // end cards
    on('win-next', call('next'));
    on('win-replay', call('replay'));
    on('win-title', call('toTitle'));
    on('lose-retry', call('retry'));
    on('lose-modes', function () { show('modes', { back: 'title' }); });
    on('lose-title', call('toTitle'));

    doc.addEventListener('keydown', function () { kbd = true; }, true);
    doc.addEventListener('pointerdown', function () { kbd = false; }, true);
    buildBelt();
    var s = save ? save.get() : null;
    if (s) { modes.tier = s.endless.tier; modes.noLuck = s.endless.noLuck; }
    relabel();
    if (root.Arcade && root.Arcade.on) root.Arcade.on('lang', relabel);
    if (root.Arcade && root.Arcade.wire) root.Arcade.wire(doc);
  }

  PL.screens = {
    init: init, show: show, hide: hide, setPill: setPill, updateTitle: updateTitle, relabel: relabel,
    mechanics: mechanics, unseen: unseen, MECHS: MECHS,
    /** current() -> the card on screen ('pause', 'settings', ...) or null. */
    current: function () { return shown; },
    base: function () { return base; },
    /** back(): Escape on a card that has a way back (settings, how-to, endless chooser). Returns true when it did something. */
    back: function () {
      if (shown === 'settings') { show(data.back === 'pause' ? 'pause' : 'title'); return true; }
      if (shown === 'modes') { show('title'); return true; }
      if (shown === 'howto') { closeHowto(); return true; }
      return false;
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.screens;
})(typeof window !== 'undefined' ? window : globalThis);
