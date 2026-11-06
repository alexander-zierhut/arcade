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
  var DIFF_TIER = ['', 'easy', 'normal', 'normal', 'hard', 'hard', 'hard', 'extreme', 'extreme', 'extreme', 'extreme'];   // fallback when the generator is absent
  var CARDS = ['pause', 'settings', 'modes', 'howto', 'win', 'lose', 'favs'];
  var BELT_PIECES = ['salmon', 'kappa', 'ikura', 'tuna', 'tamago', 'ebi', 'tekka', 'unagi', 'california', 'inari', 'tako', 'uni'];

  var els = {};
  var shown = null;                 // the card on screen (name) or null
  var base = null;                  // 'title' | 'play'
  var data = {};                    // data of the card on screen
  var modes = { difficulty: 1, disabled: [], look: null };     // disabled: the mechanics switched off in the chooser; look: the hunt's lookahead (null = auto)
  var MECHANICS = ['hidden', 'pair', 'wrap', 'ice', 'lock', 'oneway'];
  var huntTimer = null, huntState = null;
  var hw = { pages: MECHS.slice(), index: 0, back: 'title', onDone: null };
  var pillState = null;
  var kbd = false;                  // the last input was the keyboard: only then a card takes the focus (no focus ring after a tap)

  function $(id) { return doc.getElementById(id); }
  function app() { return PL.app || {}; }
  function arcade(name) { try { if (root.Arcade) root.Arcade.screen(name); } catch (e) { /* the kit is optional in tests */ } }
  function levelsTotal() { return PL.levels && PL.levels.length ? PL.levels.length : 100; }
  function tierName(tier) { return t('tier_' + tier); }
  function sound() { return save ? save.get().sound !== false : true; }
  function plain() { return save ? save.get().plain === true : false; }
  function beltStyle() { return save ? save.get().belt : 'plates'; }
  function diffSpec(d) { var g = PL.generator && PL.generator.DIFFICULTY ? PL.generator.DIFFICULTY[d] : null; return g || { tier: DIFF_TIER[d] || 'easy', noLuck: d >= 9 }; }
  function disabledNow() {          // the chooser's list, plus hidden when the difficulty forces it
    var list = modes.disabled.slice();
    if (diffSpec(modes.difficulty).noLuck && list.indexOf('hidden') < 0) list.push('hidden');
    return list;
  }
  function setMech(m, on) {
    var i = modes.disabled.indexOf(m);
    if (on && i >= 0) modes.disabled.splice(i, 1);
    if (!on && i < 0) modes.disabled.push(m);
  }
  function tierOfDiff(d) { return diffSpec(d).tier; }

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
    if (pillState.mode === 'replay') {
      text = t('replay_pill', { x: pillState.speed });
      aria = t('replay_aria', { x: pillState.speed });
    } else if (pillState.mode === 'endless') {
      tier = tierOfDiff(pillState.difficulty || 1);
      text = t('pill_endless', { tier: pillState.difficulty || 1, n: pillState.streak || 0 });
      aria = t('pill_endless_aria', { tier: pillState.difficulty || 1, n: pillState.streak || 0 });
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
    if (els.setPlain) {
      els.setPlain.setAttribute('aria-pressed', plain() ? 'true' : 'false');
      els.setPlainLabel.textContent = t(plain() ? 'graphics_plain' : 'graphics_sushi');
    }
    if (els.setBelt) {
      var stream = plain() || beltStyle() === 'stream';          // plain graphics never show plates
      els.setBelt.setAttribute('aria-pressed', stream ? 'true' : 'false');
      els.setBelt.setAttribute('aria-disabled', plain() ? 'true' : 'false');
      els.setBeltLabel.textContent = t(stream ? 'belt_stream' : 'belt_plates');
    }
  }

  function renderModes() {
    var s = save ? save.get() : { endless: { best: {} } };
    var btns = els.diffs.querySelectorAll('.diff'), d = modes.difficulty, spec = diffSpec(d), forced = !!spec.noLuck, best = s.endless.best[d] || 0;
    for (var i = 0; i < btns.length; i++) {
      var n = Number(btns[i].getAttribute('data-diff')), b = s.endless.best[n] || 0;
      btns[i].setAttribute('aria-checked', n === d ? 'true' : 'false');
      btns[i].setAttribute('aria-label', t('diff_aria', { n: n, tier: tierName(tierOfDiff(n)) }) + (b > 0 ? ', ' + t('best', { n: b }) : ''));
      btns[i].setAttribute('data-best', b > 0 ? String(b) : '');
    }
    els.diffText.innerHTML = '<b>' + t('diff_label', { n: d, tier: tierName(spec.tier) }) + '</b> · ' + t('diff_hint_' + d) + (best > 0 ? ' · ' + t('best', { n: best }) : '');
    var noLuck = disabledNow().indexOf('hidden') >= 0;
    els.noluck.setAttribute('aria-pressed', noLuck ? 'true' : 'false');
    els.noluck.setAttribute('aria-disabled', forced ? 'true' : 'false');
    els.noluckHint.textContent = t(forced ? 'noluck_forced' : 'noluck_hint');
    var looks = els.looks ? els.looks.querySelectorAll('.look') : [], lv;
    for (i = 0; i < looks.length; i++) {
      lv = looks[i].getAttribute('data-look');
      looks[i].setAttribute('aria-checked', (modes.look === null ? lv === 'auto' : Number(lv) === modes.look) ? 'true' : 'false');
    }
    var chips = els.mechs ? els.mechs.querySelectorAll('.mech') : [];
    for (i = 0; i < chips.length; i++) {
      var m = chips[i].getAttribute('data-mech');
      chips[i].setAttribute('aria-pressed', disabledNow().indexOf(m) < 0 ? 'true' : 'false');
      chips[i].setAttribute('aria-disabled', m === 'hidden' && forced ? 'true' : 'false');
    }
  }

  // the hunt panel: huntStatus(null) hides it; { candidates, best, bestAt, since, ready } shows it and keeps the
  // "x s ago" ticking once a second
  function renderHunt() {
    var h = huntState, now = Date.now();
    if (!els.hunt) return;
    if (!h) { els.hunt.hidden = true; if (huntTimer) { clearInterval(huntTimer); huntTimer = null; } return; }
    els.hunt.hidden = false;
    els.huntText.textContent = h.best >= 0 ? t('hunt_status', { n: h.candidates, h: h.best.toFixed(2), s: Math.max(0, Math.round((now - h.bestAt) / 1000)) }) : t('hunt_none', { n: h.candidates });
    els.huntPlay.disabled = !h.ready;
    if (!huntTimer) huntTimer = setInterval(renderHunt, 1000);
  }
  function huntStatus(h) { huntState = h; renderHunt(); }

  // ------------------------------------------------------------------ favourites
  // the entry for the level on screen: { level } for a fixed level, { code, hard } for a generated one, or null
  function currentFav() {
    var a = app(), lv = a.level;
    if (!lv) return null;
    if (a.mode === 'endless') return a.code ? { code: a.code, hard: lv.hard } : null;
    return { level: lv.id, hard: lv.hard };
  }
  function renderStars() {
    var e = currentFav(), on = !!(e && save && save.isFav(e)), ids = ['pauseFav', 'winFav', 'loseFav'], i, b;
    for (i = 0; i < ids.length; i++) {
      b = els[ids[i]];
      if (!b) continue;
      b.hidden = !e;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.querySelector('span').textContent = t(on ? 'fav_added' : 'fav_add');
      b.setAttribute('aria-label', t(on ? 'fav_added' : 'fav_add'));
    }
  }
  function toggleFav() {
    var e = currentFav();
    if (!e || !save) return;
    save.toggleFav(e);
    renderStars();
  }
  function favName(f) { return f.level ? t('fav_level', { n: f.level }) : t('fav_code', { d: (PL.generator && PL.generator.decodeCode(f.code) || { difficulty: '?' }).difficulty, code: f.code }); }
  function renderFavs() {
    var list = save ? save.get().favs : [], html = '', i, f, meta;
    els.favsEmpty.hidden = list.length > 0;
    for (i = 0; i < list.length; i++) {
      f = list[i];
      meta = typeof f.hard === 'number' ? t('fav_hard', { h: f.hard.toFixed(2) }) : '';
      html += '<li data-i="' + i + '"><span><span class="fav-name">' + favName(f) + '</span>' + (meta ? '<span class="fav-meta">' + meta + '</span>' : '') + '</span>' +
        '<button type="button" class="btn small primary" data-act="play">' + t('fav_play') + '</button>' +
        '<button type="button" class="btn small ghost" data-act="remove" aria-label="' + t('fav_remove_aria', { name: favName(f) }).replace(/"/g, '&quot;') + '">✕</button></li>';
    }
    els.favsList.innerHTML = html;
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

  function codeLine(btn, code) {
    var p = btn.parentNode;
    if (!code) { p.hidden = true; return; }
    p.hidden = false;
    btn.textContent = t('code_line', { code: code });
    btn.setAttribute('aria-label', t('code_aria', { code: code }));
    btn.setAttribute('data-code', code);
  }
  function copyCode(code) {
    var nav = root.navigator;
    if (nav && nav.clipboard && nav.clipboard.writeText) {
      nav.clipboard.writeText(code).then(function () { toast(t('code_copied')); }, function () { toast(code); });
    } else toast(code);
  }
  function toast(msg) { try { root.Arcade.toast(msg); } catch (e) { /* no kit */ } }
  function codeUrl(code) {
    try { return root.location.origin + root.location.pathname + '?code=' + encodeURIComponent(code); } catch (e) { return ''; }
  }

  function renderEnd() {
    var d = data, line, text = '', total = levelsTotal(), hopeless = d.reason === 'hopeless';
    if (shown === 'win') {
      if (d.mode === 'endless') {
        els.winText.textContent = t('win_streak', { n: d.streak, tier: d.difficulty });
        els.winNext.textContent = t('next_round');
        line = t('share_code', { n: d.streak, tier: d.difficulty, code: d.code });
        text = line + '\n' + codeUrl(d.code);
        els.winReplay.hidden = true;
      } else {
        var last = d.level >= total;
        els.winText.textContent = t('win_level', { n: d.level }) + (last ? '. ' + t('all_done', { n: total }) : '');
        els.winNext.textContent = last ? t('endless') : t('next_level');
        line = t('share_level', { n: d.level });
        els.winReplay.hidden = false;
      }
      codeLine(els.winCode, d.mode === 'endless' ? d.code : null);
    } else if (shown === 'lose') {
      els.loseH.textContent = t(hopeless ? 'lose_title_hopeless' : 'lose_title');
      if (d.mode === 'endless') {
        els.loseText.textContent = t('lose_streak', { n: d.streak, tier: d.difficulty }) + '. ' + t(hopeless ? 'lose_text_hopeless' : 'lose_text');
        els.loseRetry.textContent = t('new_run');
        els.loseModes.hidden = false;
        els.loseBest.hidden = !(d.newBest && d.streak > 0);
        els.loseBest.textContent = t('new_best') + ' ' + t('best', { n: d.streak });
        line = d.streak > 0 ? t('share_code', { n: d.streak, tier: d.difficulty, code: d.code }) : t('share_code_lose', { tier: d.difficulty, code: d.code });
        text = line + '\n' + codeUrl(d.code);
        els.loseShare.hidden = false;
      } else {
        els.loseText.textContent = t(hopeless ? 'lose_text_hopeless' : 'lose_text');
        els.loseRetry.textContent = t('retry');
        els.loseModes.hidden = true;
        els.loseBest.hidden = true;
        line = t('share_lose', { n: d.level });
        els.loseShare.hidden = false;
      }
      codeLine(els.loseCode, d.mode === 'endless' ? d.code : null);
    }
    if (line) { try { root.Arcade.share.set(text ? { line: line, text: text } : { line: line }); } catch (e) { /* kit missing */ } }
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
      renderStars(); openCard('pause', d); arcade('pause');
    } else if (name === 'settings') {
      renderSound(); openCard('settings', d);
      if (root.Arcade && root.Arcade.refresh) root.Arcade.refresh();
      arcade(d.back === 'pause' ? 'pause' : 'menu');
    } else if (name === 'modes') {
      var s = save ? save.get() : null;
      if (s && !d.keep) { modes.difficulty = s.endless.difficulty || 1; modes.disabled = (s.endless.disabled || []).slice(); modes.look = s.endless.look === undefined ? null : s.endless.look; }
      if (els.code) els.code.value = '';
      huntStatus(null);
      renderModes(); openCard('modes', d); arcade('menu');
    } else if (name === 'howto') {
      hw.pages = d.pages && d.pages.length ? d.pages.slice() : MECHS.slice();
      hw.index = 0; hw.back = d.back || 'title'; hw.backData = d.backData; hw.onDone = d.onDone || null;
      openCard('howto', d); renderHowto(); arcade(d.back === 'pause' ? 'pause' : 'menu');
    } else if (name === 'win' || name === 'lose') {
      shown = name; data = d;
      renderEnd(); renderStars();
      var canWatch = !!(app().hasReplay && app().hasReplay());
      if (els.winWatch) els.winWatch.hidden = !canWatch;
      if (els.loseWatch) els.loseWatch.hidden = !canWatch;
      openCard(name, d); arcade(name);
    } else if (name === 'favs') {
      renderFavs(); openCard('favs', d); arcade('menu');
    } else if (name === 'replay') {
      showBase('play'); hideCards();
      var keep = pillState;
      setPill({ mode: 'replay', speed: d.speed, tier: keep && keep.tier });
      pillState = keep ? Object.assign({}, keep) : pillState;   // the level's pill comes back after the replay
      arcade('menu');
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
    if (shown === 'win' || shown === 'lose') { renderEnd(); renderStars(); }
    if (shown === 'pause') renderStars();
    if (shown === 'favs') renderFavs();
  }

  // ------------------------------------------------------------------ init
  function init() {
    if (!doc || els.title) return;
    var ids = { title: 'screen-title', play: 'screen-play', cards: 'cards', track: 'title-track', playLabel: 'play-label', pill: 'pill', pillText: 'pill-text', skull: 'pill-skull',
      setSound: 'set-sound', setSoundLabel: 'set-sound-label', setPlain: 'set-plain', setPlainLabel: 'set-plain-label', setBelt: 'set-belt', setBeltLabel: 'set-belt-label',
      slots: 'slots', slotsText: 'slots-text',
      diffs: 'modes-diffs', diffText: 'modes-diff-text', noluck: 'modes-noluck', noluckHint: 'modes-noluck-hint', code: 'modes-code', codeGo: 'modes-code-go',
      adv: 'modes-adv', advanced: 'modes-advanced', mechs: 'modes-mechs', looks: 'modes-looks', huntBtn: 'modes-hunt', hunt: 'hunt', huntText: 'hunt-text', huntPlay: 'hunt-play', huntStop: 'hunt-stop',
      winCode: 'win-code', loseCode: 'lose-code', loseH: 'lose-h',
      pauseFav: 'pause-fav', winFav: 'win-fav', loseFav: 'lose-fav', favsList: 'favs-list', favsEmpty: 'favs-empty', winWatch: 'win-watch', loseWatch: 'lose-watch',
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
    on('chip-favs', function () { show('favs', { back: 'title' }); });
    on('favs-back', function () { show('title'); });
    on('pause-fav', toggleFav); on('win-fav', toggleFav); on('lose-fav', toggleFav);
    els.favsList.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('button[data-act]') : null, li = b && b.closest('li'), f, a = app();
      if (!b || !li) return;
      f = (save ? save.get().favs : [])[Number(li.getAttribute('data-i'))];
      if (!f) return;
      if (b.getAttribute('data-act') === 'remove') { if (save) save.toggleFav(f); renderFavs(); return; }
      if (f.level && typeof a.start === 'function') a.start(f.level);
      else if (f.code && typeof a.playCode === 'function' && !a.playCode(f.code)) toast(t('code_bad'));
    });
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
    on('set-plain', function () {
      var next = !plain();
      if (save) save.patch({ plain: next });
      renderSound();
      var a = app(); if (typeof a.setPlain === 'function') a.setPlain(next);
    });
    on('set-belt', function () {
      if (plain()) return;                                        // forced to the stream by the plain graphics
      var next = beltStyle() === 'stream' ? 'plates' : 'stream';
      if (save) save.patch({ belt: next });
      renderSound();
      var a = app(); if (typeof a.setBelt === 'function') a.setBelt(next);
    });
    on('settings-done', function () { show(data.back === 'pause' ? 'pause' : 'title'); });
    // endless chooser
    els.diffs.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('.diff') : null;
      if (!b) return;
      modes.difficulty = Number(b.getAttribute('data-diff')) || 1; renderModes();
    });
    on('modes-noluck', function () { if (diffSpec(modes.difficulty).noLuck) return; setMech('hidden', modes.disabled.indexOf('hidden') >= 0); renderModes(); });
    function remember() { if (save) save.patch({ endless: { difficulty: modes.difficulty, noLuck: disabledNow().indexOf('hidden') >= 0, disabled: modes.disabled.slice(), look: modes.look } }); }
    els.looks.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('.look') : null;
      if (!b) return;
      modes.look = b.getAttribute('data-look') === 'auto' ? null : Number(b.getAttribute('data-look'));
      renderModes();
    });
    on('modes-start', function () {
      remember();
      var a = app(); if (typeof a.startEndless === 'function') a.startEndless(modes.difficulty, disabledNow());
    });
    // advanced: the mechanics and the hunt
    on('modes-adv', function () {
      var open = els.advanced.hidden;
      els.advanced.hidden = !open;
      els.adv.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    els.mechs.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('.mech') : null;
      if (!b || b.getAttribute('aria-disabled') === 'true') return;
      setMech(b.getAttribute('data-mech'), b.getAttribute('aria-pressed') !== 'true');
      renderModes();
    });
    on('modes-hunt', function () {
      remember();
      var a = app(); if (typeof a.startHunt === 'function') a.startHunt(modes.difficulty, disabledNow(), modes.look);
    });
    on('hunt-play', function () { var a = app(); if (typeof a.huntPlay === 'function') a.huntPlay(); });
    on('hunt-stop', function () { var a = app(); if (typeof a.huntStop === 'function') a.huntStop(); });
    function playCode() {
      var a = app(), code = els.code ? els.code.value : '';
      if (typeof a.playCode !== 'function') return;
      if (!a.playCode(code)) { toast(t('code_bad')); if (els.code) { els.code.focus(); } }
    }
    on('modes-code-go', playCode);
    if (els.code) els.code.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); playCode(); } });
    on('win-code', function () { copyCode(els.winCode.getAttribute('data-code')); });
    on('lose-code', function () { copyCode(els.loseCode.getAttribute('data-code')); });
    on('modes-back', function () { var a = app(); if (typeof a.huntStop === 'function') a.huntStop(); show('title'); });
    // how-to
    on('howto-prev', function () { if (hw.index > 0) { hw.index--; renderHowto(); } });
    on('howto-next', function () { if (hw.index < hw.pages.length - 1) { hw.index++; renderHowto(); } else closeHowto(); });
    // end cards
    on('win-next', call('next'));
    on('win-watch', call('watchReplay')); on('lose-watch', call('watchReplay'));
    on('win-replay', call('replay'));
    on('win-title', call('toTitle'));
    on('lose-retry', call('retry'));
    on('lose-modes', function () { show('modes', { back: 'title' }); });
    on('lose-title', call('toTitle'));

    doc.addEventListener('keydown', function () { kbd = true; }, true);
    doc.addEventListener('pointerdown', function () { kbd = false; }, true);
    buildBelt();
    var s = save ? save.get() : null;
    if (s) { modes.difficulty = s.endless.difficulty || 1; modes.disabled = (s.endless.disabled || []).slice(); modes.look = s.endless.look === undefined ? null : s.endless.look; }
    relabel();
    if (root.Arcade && root.Arcade.on) root.Arcade.on('lang', relabel);
    if (root.Arcade && root.Arcade.wire) root.Arcade.wire(doc);
  }

  /** setSlots(free, total): the free-slot counter in the band (stream style); null hides it. */
  function setSlots(free, total) {
    if (!els.slots) return;
    if (free === null || free === undefined) { els.slots.hidden = true; return; }
    els.slots.hidden = false;
    var txt = free + '/' + total;
    if (els.slotsText.textContent !== txt) { els.slotsText.textContent = txt; els.slots.setAttribute('aria-label', t('slots_aria', { n: free, total: total })); }
    els.slots.setAttribute('data-full', free === 0 ? '1' : '0');
  }

  PL.screens = {
    init: init, show: show, hide: hide, setPill: setPill, setSlots: setSlots, huntStatus: huntStatus, updateTitle: updateTitle, relabel: relabel,
    mechanics: mechanics, unseen: unseen, MECHS: MECHS,
    /** current() -> the card on screen ('pause', 'settings', ...) or null. */
    current: function () { return shown; },
    base: function () { return base; },
    /** back(): Escape on a card that has a way back (settings, how-to, endless chooser). Returns true when it did something. */
    back: function () {
      if (shown === 'settings') { show(data.back === 'pause' ? 'pause' : 'title'); return true; }
      if (shown === 'modes') { var a = app(); if (typeof a.huntStop === 'function') a.huntStop(); show('title'); return true; }
      if (shown === 'favs') { show('title'); return true; }
      if (shown === 'howto') { closeHowto(); return true; }
      return false;
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.screens;
})(typeof window !== 'undefined' ? window : globalThis);
