/* shared/app.js: "play as an app" and the way home (part 3 of 10). Arcade.app: the browser's install prompt when it
   offers one (beforeinstallprompt, caught here because this script runs before anything else), else fullscreen, with
   the iOS steps where neither exists; a once-only hint sheet on phones in a browser tab. Arcade.home() goes back to
   the game selector. */
(function (root) {
  'use strict';
  var K = root.Arcade, P = K._, doc = root.document || null, nav = root.navigator || null, cfg = P.cfg;
  var deferredInstall = null;
  if (root.addEventListener) root.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; if (K.refresh) K.refresh(); });

  function standalone() { try { return !!((nav && nav.standalone) || (root.matchMedia && (root.matchMedia('(display-mode: standalone)').matches || root.matchMedia('(display-mode: fullscreen)').matches))); } catch (e) { return false; } }
  var app = {
    /** platform() -> 'ios' | 'android' | 'desktop' */
    platform: function () { var ua = (nav && nav.userAgent) || ''; if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && nav && nav.maxTouchPoints > 1)) return 'ios'; if (/Android/i.test(ua)) return 'android'; return 'desktop'; },
    isStandalone: standalone,
    canInstall: function () { return !!deferredInstall; },
    /** install() -> Promise<boolean>: the browser's install prompt (Android Chrome, desktop Chrome / Edge). */
    install: function () {
      if (!deferredInstall) return Promise.resolve(false);
      var p = deferredInstall; deferredInstall = null; if (K.refresh) K.refresh();
      try { p.prompt(); return (p.userChoice || Promise.resolve({ outcome: 'unknown' })).then(function (c) { return !!(c && c.outcome === 'accepted'); }); } catch (e) { return Promise.resolve(false); }
    },
    canFullscreen: function () { return !!(doc && doc.fullscreenEnabled && doc.documentElement.requestFullscreen) && !standalone(); },
    isFullscreen: function () { return !!(doc && doc.fullscreenElement); },
    /** setFullscreen(on?): the Fullscreen API (Android Chrome and desktops; iOS Safari has none); no argument toggles. */
    setFullscreen: function (on) {
      if (!doc) return;
      if (on === undefined) on = !doc.fullscreenElement;
      try {
        if (on && !doc.fullscreenElement) { var p = doc.documentElement.requestFullscreen({ navigationUI: 'hide' }); if (p && p.catch) p.catch(function () { /* refused */ }); }
        else if (!on && doc.fullscreenElement && doc.exitFullscreen) doc.exitFullscreen();
      } catch (e) { /* not available */ }
    },
    /** hint(): the "play as an app" sheet: install when the browser offers it, the iOS steps, or fullscreen. */
    hint: function () {
      var pf = app.platform(), html, buttons = [], seen = function () { K.shared.set('installHint', { seenAt: P.now() }); };
      if (app.canInstall()) { html = K.t('app_install'); buttons.push({ label: K.t('install'), primary: true, onClick: function () { seen(); app.install(); } }); }
      else if (pf === 'ios') html = K.t('app_ios');
      else { html = K.t('app_android'); if (app.canFullscreen()) buttons.push({ label: K.t('fullscreen'), primary: true, onClick: function () { seen(); app.setFullscreen(true); } }); }
      buttons.push({ label: K.t(buttons.length ? 'later' : 'ok'), onClick: seen });
      K.sheet({ title: K.t('app_title'), html: html + K.t('app_keep'), buttons: buttons, onClose: seen });
    },
    /** hintWanted(): a phone, in a browser tab, that has not seen the hint yet. */
    hintWanted: function () { return !!cfg.autoHint && !standalone() && app.platform() !== 'desktop' && !K.shared.get('installHint', null); }
  };
  K.app = app;
  /** home(): back to the game selector (cfg.home, '../' by default). */
  K.home = function () { if (root.location) root.location.href = cfg.home; };
})(typeof window !== 'undefined' ? window : globalThis);
