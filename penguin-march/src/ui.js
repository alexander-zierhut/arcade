// src/ui.js: the HTML layers (title, level map, shop, pause, end screen, HUD). Pure DOM: it reads the save and the
// current game from main.js through the callbacks it is given and never touches the sim. show(name) swaps the
// visible layer; the game canvas is always underneath.
(function (root) {
  'use strict';
  var PM = root.PM = root.PM || {};
  var C = PM.config;
  var doc = root.document;

  var $ = function (id) { return doc.getElementById(id); };
  var LAYERS = ['title', 'map', 'shop', 'pause', 'end'];
  var app = null;        // set by init: { save, start(n), resume(), retry(), quitToMap(), toggleMute(), next() }
  var mapShown = 0;

  var UPGRADES = [
    { key: 'size', name: 'Bigger waddle', desc: 'More penguins at the start of every level.' },
    { key: 'rate', name: 'Faster snowballs', desc: 'Every penguin throws more often.' },
    { key: 'dmg', name: 'Harder snowballs', desc: 'Every snowball hits harder.' }
  ];

  /** show(name): one of the LAYERS, or null for the bare game with its HUD. Tells the app through onScreen. */
  function show(name) {
    LAYERS.forEach(function (l) { $(l).hidden = l !== name; });
    $('hud').hidden = !(name === null || name === 'pause');
    if (name === 'map') renderMap();
    if (name === 'shop') renderShop();
    if (name === 'title') { $('btn-play').textContent = app.save.reached > 1 ? 'Play level ' + app.save.reached : 'Play'; syncMute(); }
    if (app.onScreen) app.onScreen(name);
  }

  function stars(k) {
    var s = '';
    for (var i = 1; i <= 3; i++) s += i <= k ? '<span>★</span>' : '<span class="off">★</span>';
    return s;
  }

  function renderMap() {
    var save = app.save, list = $('map-list');
    $('map-coins').textContent = PM.render.fmt(save.coins);
    var upTo = Math.max(mapShown, save.reached + 6);
    mapShown = upTo;
    var html = '';
    for (var n = 1; n <= upTo; n++) {
      var locked = n > save.reached, riot = n <= C.AUTHORED_LEVELS ? n % 4 === 0 : (n - C.AUTHORED_LEVELS) % C.RIOT_EVERY_GEN === 0;
      var st = save.stars[n] | 0;
      html += '<button type="button" class="lvl' + (locked ? ' locked' : '') + (riot ? ' riot' : '') + (n === save.reached ? ' current' : '') + '" data-level="' + n + '"' + (locked ? ' disabled' : '') + '>' +
        '<span class="num">' + n + '</span><span class="name">' + (riot ? 'Riot level' : n <= C.AUTHORED_LEVELS ? 'Level ' + n : 'Endless ' + n) +
        '<small>' + (riot ? 'Everything goes up' : n <= 3 ? 'Learn the road' : n <= C.AUTHORED_LEVELS ? 'Authored' : 'Generated, forever') + '</small></span>' +
        '<span class="stars">' + (locked ? '' : stars(st)) + '</span></button>';
    }
    list.innerHTML = html;
    var cur = list.querySelector('.current');
    if (cur && cur.scrollIntoView) { try { cur.scrollIntoView({ block: 'center' }); } catch (e) { /* older browsers */ } }
  }

  function renderShop() {
    var save = app.save;
    $('shop-coins').textContent = PM.render.fmt(save.coins);
    $('shop-list').innerHTML = UPGRADES.map(function (u) {
      var lvl = save.upgrades[u.key], maxed = lvl >= C.MAX_SHOP, price = maxed ? 0 : C.PRICES[lvl];
      var pips = '';
      for (var i = 0; i < C.MAX_SHOP; i++) pips += '<span class="pip' + (i < lvl ? ' on' : '') + '"></span>';
      return '<div class="upg"><div class="name">' + u.name + '</div><div class="desc">' + u.desc + (u.key === 'size' ? ' Now ' + C.START_SIZE[lvl] + '.' : '') + '</div><div class="pips">' + pips + '</div>' +
        '<button type="button" class="btn ' + (maxed || save.coins < price ? '' : 'primary') + '" data-buy="' + u.key + '"' + (maxed || save.coins < price ? ' disabled' : '') + '>' + (maxed ? 'Max' : price) + '</button></div>';
    }).join('');
  }

  function hud(state, levelNo) {
    $('hud-level').textContent = 'Level ' + levelNo;
    $('hud-coins').textContent = PM.render.fmt(app.save.coins);
  }

  function end(won, state, coinsWon) {
    var card = $('end').querySelector('.card');
    card.classList.toggle('lost', !won);
    $('end-title').textContent = won ? (state.riot ? 'Riot!' : 'Level ' + state.levelNo + ' cleared!') : 'The walrus won';
    $('end-stars').innerHTML = won ? stars(state.stars) : '';
    $('end-text').textContent = won ? PM.render.fmt(state.n) + ' penguins made it. +' + coinsWon + ' coins.' : 'The waddle was ' + PM.render.fmt(state.peak) + ' strong at its best. Try a different gate, or visit the shop.';
    $('btn-next').hidden = !won;
    $('btn-retry').textContent = won ? 'Replay' : 'Retry';
    show('end');
  }

  function syncMute() {
    var m = PM.audio.isMuted();
    ['btn-mute', 'btn-mute-pause'].forEach(function (id) { $(id).textContent = m ? 'Sound off' : 'Sound on'; $(id).setAttribute('aria-pressed', m ? 'true' : 'false'); });
  }

  function init(callbacks) {
    app = callbacks;
    $('btn-play').addEventListener('click', function () { app.start(app.save.reached); });
    $('btn-levels').addEventListener('click', function () { show('map'); });
    $('btn-shop-title').addEventListener('click', function () { show('shop'); });
    $('btn-mute').addEventListener('click', function () { app.toggleMute(); syncMute(); });
    $('btn-mute-pause').addEventListener('click', function () { app.toggleMute(); syncMute(); });
    Array.prototype.forEach.call(doc.querySelectorAll('.js-back'), function (b) { b.addEventListener('click', function () { show(app.backTo()); }); });
    $('map-list').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-level]') : null;
      if (b && !b.disabled) app.start(parseInt(b.getAttribute('data-level'), 10));
    });
    $('btn-map-more').addEventListener('click', function () { mapShown += 10; renderMap(); });
    $('shop-list').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-buy]') : null;
      if (b && !b.disabled && app.buy(b.getAttribute('data-buy'))) renderShop();
    });
    $('btn-pause').addEventListener('click', function () { app.pause(); });
    $('btn-resume').addEventListener('click', function () { app.resume(); });
    $('btn-retry-pause').addEventListener('click', function () { app.retry(); });
    $('btn-quit').addEventListener('click', function () { app.quitToMap(); });
    $('btn-next').addEventListener('click', function () { app.next(); });
    $('btn-retry').addEventListener('click', function () { app.retry(); });
    $('btn-shop-end').addEventListener('click', function () { show('shop'); });
    $('btn-map-end').addEventListener('click', function () { show('map'); });
    $('title').querySelector('.version').textContent = 'v' + C.VERSION;
  }

  PM.ui = { init: init, show: show, hud: hud, end: end, renderShop: renderShop, renderMap: renderMap, syncMute: syncMute };
})(typeof window !== 'undefined' ? window : globalThis);
