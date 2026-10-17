// Dev-only helper for preview.html / play-dev.html: polls the source files for changes and shows a reload banner.
// Not part of the game (index.html never loads this file).
(function () {
  var FILES = ['src/config.js', 'src/physics.js', 'src/game/merge.js', 'src/game/game.js', 'src/art/glass.js', 'src/art/garnish.js',
    'src/art/tier1-shot.js', 'src/art/tier2-oldfashioned.js', 'src/art/tier3-cosmo.js', 'src/art/tier4-mojito.js', 'src/art/tier5-margarita.js',
    'src/art/tier6-sunrise.js', 'src/art/tier7-pinacolada.js', 'src/art/tier8-coconut.js', 'src/art/tier9-sangria-verde.js', 'index.html'];
  var auto = document.currentScript && document.currentScript.getAttribute('data-auto') === '1';
  var stamp = null, bar = null;
  function sig(cb) {
    if (location.protocol === 'file:') return cb(null);
    Promise.all(FILES.map(function (f) {
      return fetch(f, { method: 'HEAD', cache: 'no-store' }).then(function (r) { return r.ok ? (r.headers.get('last-modified') || '') + r.headers.get('content-length') : 'x'; }).catch(function () { return 'x'; });
    })).then(function (parts) { cb(parts.join('|')); });
  }
  function show(msg) {
    if (!bar) {
      bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:9999;background:#FFD23F;color:#3a2a12;font:600 14px -apple-system,Segoe UI,Roboto,sans-serif;padding:10px 16px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.4);cursor:pointer';
      bar.onclick = function () { location.reload(); };
      document.body.appendChild(bar);
    }
    bar.textContent = msg;
  }
  function poll() {
    sig(function (s) {
      if (s === null) return;              // file:// cannot poll; use the Reload button
      if (stamp === null) stamp = s;
      else if (s !== stamp) { if (auto) location.reload(); else show('New version of the game files is ready. Tap to reload.'); }
      setTimeout(poll, 4000);
    });
  }
  poll();
  var links = document.createElement('div');
  links.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:9998;display:flex;gap:8px;font:12px -apple-system,Segoe UI,Roboto,sans-serif';
  [['preview.html', 'Cocktail preview'], ['play-dev.html', 'Dev harness'], ['index.html', 'Real game'], ['docs/preview/cocktails.png', 'Contact sheet'], ['docs/preview/', 'All previews']]
    .forEach(function (l) { var a = document.createElement('a'); a.href = l[0]; a.textContent = l[1]; a.style.cssText = 'background:rgba(15,27,34,.85);color:#fff8e1;padding:6px 10px;border-radius:999px;text-decoration:none'; links.appendChild(a); });
  document.body.appendChild(links);
})();
