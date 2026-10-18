/* shared/share.js: the share button (part 8 of 10). Arcade.share.set({ line }) when an end card opens ("Level 12
   cleared, 4,520 points"); Arcade.share.go() shares a picture (the game's og:image with the line on a dark band at
   the bottom, drawn on a canvas) plus the text and the game's address through the Web Share API where the browser
   can (Android Chrome, iOS Safari), the text alone where only that works, and copies the text to the clipboard
   everywhere else (with a toast). go() resolves to { method: 'share' | 'share-text' | 'clipboard' | 'none' }. */
(function (root) {
  'use strict';
  var K = root.Arcade, P = K._, doc = root.document || null, nav = root.navigator || null, cfg = P.cfg;
  var ctx = { line: '', text: '' };

  function url() { try { return cfg.share.url || (root.location.origin + root.location.pathname); } catch (e) { return ''; } }
  function image(line) {
    return new Promise(function (resolve) {
      if (!doc || !cfg.share.image || !root.HTMLCanvasElement || !root.File) return resolve(null);
      var img = new Image(); img.onerror = function () { resolve(null); };
      img.onload = function () {
        try {
          var W = 1200, H = 630, c = doc.createElement('canvas'); c.width = W; c.height = H;
          var x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H);
          if (line) {
            var bandH = 150; x.fillStyle = 'rgba(0,0,0,0.62)'; x.fillRect(0, H - bandH, W, bandH);
            x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.textAlign = 'center';
            x.font = 'bold 56px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'; x.fillText(line, W / 2, H - bandH + 56, W - 80);
            x.font = '30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'; x.fillStyle = 'rgba(255,255,255,0.85)';
            x.fillText(cfg.title + ' · ' + url().replace(/^https?:\/\//, ''), W / 2, H - 38, W - 80);
          }
          c.toBlob(function (b) { resolve(b ? new File([b], 'share.png', { type: 'image/png' }) : null); }, 'image/png');
        } catch (e) { resolve(null); }                    // tainted canvas (file://): text only
      };
      img.src = cfg.share.image;
    });
  }
  var share = {
    /** set({ line, text }): what the next share says; text replaces the whole message, line is the score line. */
    set: function (o) { ctx = { line: (o && o.line) || '', text: (o && o.text) || '' }; },
    context: function () { return ctx; },
    text: function () { return ctx.text || K.pure.shareText({ title: cfg.title, line: ctx.line, url: url() }); },
    image: image,
    go: function () {
      var text = share.text(), u = url(), title = cfg.title;
      function viaClipboard() {
        if (nav && nav.clipboard && nav.clipboard.writeText) return nav.clipboard.writeText(text).then(function () { K.toast(K.t('share_copied')); return { method: 'clipboard' }; }, function () { K.toast(K.t('share_failed')); return { method: 'none' }; });
        K.toast(K.t('share_failed')); return Promise.resolve({ method: 'none' });
      }
      if (!(nav && nav.share)) return viaClipboard();
      return image(ctx.line).then(function (file) {
        var data = { title: title, text: text, url: u };
        if (file && nav.canShare && nav.canShare({ files: [file] })) data = { title: title, text: text, files: [file] };
        return nav.share(data).then(function () { return { method: data.files ? 'share' : 'share-text' }; }, function (e) { if (e && e.name === 'AbortError') return { method: 'none' }; return viaClipboard(); });
      });
    }
  };
  K.share = share;
})(typeof window !== 'undefined' ? window : globalThis);
