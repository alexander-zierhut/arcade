/* shared/ui.js: the kit's own UI (part 2 of 10): one root element #arcade-ui over the game, a loading screen, one
   modal sheet at a time and a toast. Colours and font come from the game's CSS variables (shared/arcade.css lists
   them), so the kit's cards sit in every game like the game's own. Arcade.loading, Arcade.sheet, Arcade.closeSheet,
   Arcade.toast, Arcade.ready. */
(function (root) {
  'use strict';
  var K = root.Arcade, P = K._, doc = root.document || null, cfg = P.cfg;
  var uiRoot = null, sheetEl = null, toastTimer = 0, loadingEl = null, loadingTimer = 0;

  function $(sel, from) { return (from || doc).querySelector(sel); }
  function ui() {
    if (uiRoot || !doc || !doc.body) return uiRoot;
    uiRoot = doc.createElement('div'); uiRoot.id = 'arcade-ui'; uiRoot.className = 'arcade';
    doc.body.appendChild(uiRoot);
    return uiRoot;
  }
  function el(tag, cls, html) { var e = doc.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  function button(label, cls, fn) { var b = el('button', 'arcade-btn ' + (cls || ''), ''); b.type = 'button'; b.textContent = label; b.addEventListener('click', function (ev) { ev.preventDefault(); fn(ev); }); return b; }
  P.el = el;

  /** sheet({ title, html, node, buttons: [{ label, primary, keep, onClick }], onClose, dismissable }): one modal card at a time. */
  function sheet(o) {
    var r = ui(); if (!r) return null;
    closeSheet();
    var back = el('div', 'arcade-sheet'), card = el('div', 'arcade-card');
    card.setAttribute('role', 'dialog');
    if (o.title) { var h = el('h2', 'arcade-title', ''); h.textContent = o.title; card.appendChild(h); }
    if (o.html) card.appendChild(el('div', 'arcade-text', o.html));
    if (o.node) card.appendChild(o.node);
    var col = el('div', 'arcade-btns');
    (o.buttons || []).forEach(function (b) { col.appendChild(button(b.label, b.primary ? 'primary' : '', function () { if (b.keep !== true) closeSheet(); if (b.onClick) b.onClick(); })); });
    card.appendChild(col); back.appendChild(card); r.appendChild(back);
    back.addEventListener('click', function (ev) { if (ev.target === back && o.dismissable !== false) { closeSheet(); if (o.onClose) o.onClose(); } });
    sheetEl = back;
    return back;
  }
  function closeSheet() { if (sheetEl && sheetEl.parentNode) sheetEl.parentNode.removeChild(sheetEl); sheetEl = null; }
  function toast(text, ms) {
    var r = ui(); if (!r) return;
    var old = $('.arcade-toast', r); if (old) old.parentNode.removeChild(old);
    var d = el('div', 'arcade-toast', ''); d.textContent = text; r.appendChild(d);
    if (toastTimer) root.clearTimeout(toastTimer);
    toastTimer = root.setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, ms || 2600);
  }
  K.sheet = sheet; K.closeSheet = closeSheet; K.toast = toast;
  K.sheetOpen = function () { return !!sheetEl; };

  var loading = {
    /** show(label): the loading screen, at once (init calls it unless loading: false). Hidden by ready() / hide(), or after 12 s. */
    show: function (label) {
      var r = ui(); if (!r || loadingEl) return;
      loadingEl = el('div', 'arcade-loading', '');
      loadingEl.setAttribute('aria-busy', 'true');
      var box = el('div', 'arcade-loading-box', ''), tt = el('div', 'arcade-loading-title', ''), lb = el('div', 'arcade-loading-label', ''), bar = el('div', 'arcade-loading-bar', '<div class="arcade-loading-fill"></div>');
      tt.textContent = cfg.title || ''; lb.textContent = label || K.t('loading');
      box.appendChild(tt); box.appendChild(lb); box.appendChild(bar); loadingEl.appendChild(box); r.appendChild(loadingEl);
      if (loadingTimer) root.clearTimeout(loadingTimer);
      loadingTimer = root.setTimeout(function () { loading.hide(); }, 12000);
    },
    /** progress(done, total): fills the bar. */
    progress: function (done, total) {
      if (!loadingEl) return;
      var f = $('.arcade-loading-fill', loadingEl); if (f && total > 0) f.style.transform = 'scaleX(' + Math.max(0, Math.min(1, done / total)) + ')';
    },
    hide: function () {
      if (loadingTimer) { root.clearTimeout(loadingTimer); loadingTimer = 0; }
      if (!loadingEl) return;
      var e = loadingEl; loadingEl = null;
      e.className += ' arcade-loading-out';
      root.setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 260);
    },
    visible: function () { return !!loadingEl; }
  };
  K.loading = loading;
  /** ready(): the game can be played: the loading screen goes; the once-only hints may show (campaigns.js listens). */
  K.ready = function () { loading.hide(); P.emit('ready'); };
})(typeof window !== 'undefined' ? window : globalThis);
