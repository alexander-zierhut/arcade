/* shared/perf.js: the low-performance mode (part 4 of 10), arcade-wide. Arcade.perf.low() says whether the game should
   run its cheap mode: when the player set it ('low'), or in 'auto' mode when the measured frames said the device
   cannot keep up (sampled while the screen is 'play', the verdict kept for 14 days). The body gets the class
   arcade-low-perf and the 'perf' event fires on every change, so a game applies it where it draws. The player can
   set 'auto' | 'low' | 'high' (Arcade.perf.set, or a data-arcade="perf" toggle). */
(function (root) {
  'use strict';
  var K = root.Arcade, P = K._, doc = root.document || null;
  var state = null, sampling = false, samples = [], okWindows = 0, lastFrame = 0;

  function load() { if (!state) state = K.shared.get('perf', { mode: 'auto', auto: 'ok', at: 0 }); return state; }
  function apply(silent) {
    var low = perf.low();
    if (doc && doc.body) doc.body.classList.toggle('arcade-low-perf', low);
    if (!silent) P.emit('perf', low);
    if (K.refresh) K.refresh();
  }
  function frame(ts) {
    if (!sampling) return;
    if (lastFrame && doc.visibilityState === 'visible' && P.screen === 'play') { var dt = ts - lastFrame; if (dt < 500) samples.push(dt); }
    lastFrame = ts;
    if (samples.length >= 240) {
      var v = K.pure.perfVerdict(samples); samples = [];
      if (v === 'low') { var st = load(); st.auto = 'low'; st.at = P.now(); K.shared.set('perf', st); sampling = false; apply(false); K.toast(K.t('perf_switched'), 4000); return; }
      if (v === 'ok' && ++okWindows >= 3) { sampling = false; return; }
    }
    root.requestAnimationFrame(frame);
  }
  var perf = {
    mode: function () { return load().mode; },
    /** low() -> true when the game should run its cheap mode. */
    low: function () { var s = load(); return s.mode === 'low' || (s.mode === 'auto' && s.auto === 'low' && P.now() - (s.at || 0) < 14 * 86400000); },
    /** set('auto' | 'low' | 'high') */
    set: function (mode) { var s = load(); if (['auto', 'low', 'high'].indexOf(mode) < 0) return; s.mode = mode; if (mode !== 'auto') s.auto = 'ok'; K.shared.set('perf', s); apply(false); },
    toggle: function () { perf.set(perf.low() ? 'high' : 'low'); },
    label: function () { var s = load(); return s.mode === 'auto' ? K.t(perf.low() ? 'perf_auto_on' : 'perf_auto') : K.t(perf.low() ? 'perf_on' : 'perf_off'); },
    /** sample(): starts measuring frames (auto mode only, while the screen is 'play'); Arcade.screen('play') calls it. */
    sample: function () { if (sampling || !root.requestAnimationFrame || !doc || load().mode !== 'auto' || perf.low()) return; sampling = true; samples = []; okWindows = 0; lastFrame = 0; root.requestAnimationFrame(frame); },
    apply: apply
  };
  K.perf = perf;
  K.on('screen', function (name) { if (name === 'play') perf.sample(); });
  K.on('init', function () { apply(true); });
})(typeof window !== 'undefined' ? window : globalThis);
