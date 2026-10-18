/* shared/backup.js: the backup of every game's progress on this device (part 9 of 10). All games share one origin,
   so one file holds every localStorage key: the games' saves (their own prefixes, README "Storage") and the kit's
   arcade.* keys (language, perf, stats). The selector page offers export and import; a game may offer them too
   (data-arcade="backup-export" / "backup-import"). An import replaces the keys it carries. Inside a game the keys
   are written on the next load (the kit's init runs before the game reads anything), after the game has saved on
   pagehide; outside a game (the selector) at once. */
(function (root) {
  'use strict';
  var K = root.Arcade, P = K._, doc = root.document || null, nav = root.navigator || null, cfg = P.cfg;
  var backup = {
    games: [],                                   // the selector sets [{ id, title }] so a backup can be described
    exportText: function () { return K.pure.backupEncode(P.rawKeys(), { origin: root.location ? root.location.origin : '' }); },
    /** describe(text) -> { date, count, games: [{ id, title, count }] }; throws when the text is not a backup. */
    describe: function (text) { var d = K.pure.backupDecode(text); return { date: d.date, count: Object.keys(d.keys).length, games: K.pure.backupGames(d.keys, backup.games) }; },
    /** importText(text, confirm?) -> { count, games, pending } or null when confirm(summary) returned false; throws on a bad file. */
    importText: function (text, confirm) {
      var d = K.pure.backupDecode(text), summary = backup.describe(text);
      if (confirm && confirm(summary) === false) return null;
      if (cfg.game) K.shared.set('pendingImport', d.keys);
      else Object.keys(d.keys).forEach(function (k) { P.rawSet(k, d.keys[k]); });
      return { count: Object.keys(d.keys).length, games: summary.games, pending: !!cfg.game };
    },
    /** applyPending() -> how many keys a backup chosen on the last page load wrote now (init calls it). */
    applyPending: function () {
      var keys = K.shared.get('pendingImport', null); if (!keys) return 0;
      K.shared.remove('pendingImport');
      Object.keys(keys).forEach(function (k) { if (k !== P.SHARED + 'pendingImport') P.rawSet(k, keys[k]); });
      return Object.keys(keys).length;
    },
    /** download(): the backup as a file (the clipboard when a download is impossible). */
    download: function () {
      var text = backup.exportText(), name = 'arcade-backup-' + new Date().toISOString().slice(0, 10) + '.json', done = false;
      try {
        var blob = new root.Blob([text], { type: 'application/json' }), u = root.URL.createObjectURL(blob), a = doc.createElement('a');
        a.href = u; a.download = name; a.style.display = 'none'; doc.body.appendChild(a); a.click();
        root.setTimeout(function () { doc.body.removeChild(a); root.URL.revokeObjectURL(u); }, 2000); done = true;
      } catch (e) { done = false; }
      if (done) K.toast(K.t('backup_done', { file: name }));
      else if (nav && nav.clipboard && nav.clipboard.writeText) nav.clipboard.writeText(text).then(function () { K.toast(K.t('backup_copied')); });
      return text;
    },
    /** pick(): a file dialog; the chosen backup is described, confirmed and imported; inside a game the page reloads. */
    pick: function () {
      var input = doc.getElementById('arcade-import-file');
      if (!input) {
        input = doc.createElement('input'); input.type = 'file'; input.id = 'arcade-import-file'; input.accept = '.json,application/json'; input.style.display = 'none'; doc.body.appendChild(input);
        input.addEventListener('change', function () {
          var f = input.files && input.files[0]; if (!f) return;
          var r = new root.FileReader();
          r.onload = function () {
            input.value = '';
            var res;
            try { res = backup.importText(String(r.result), function (s) { return root.confirm(K.t('backup_confirm', { games: s.games.map(function (g) { return g.title; }).join(', ') || '-' })); }); }
            catch (e) { K.toast(K.t('backup_bad')); return; }
            if (!res) return;
            K.toast(K.t('backup_imported', { n: res.count }));
            P.emit('import', res);
            if (res.pending) root.setTimeout(function () { root.location.reload(); }, 1200);
          };
          r.readAsText(f);
        });
      }
      input.click();
    }
  };
  K.backup = backup;
})(typeof window !== 'undefined' ? window : globalThis);
