// src/ui/strings.js: every UI string of Plate Loop in German and English, PL.strings.t(key, vars), and the helper
// that fills the static markup (data-i18n, data-i18n-aria, data-i18n-title) when the language changes.
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};

  var de = {
    title_sub: 'Sortiere das Sushi in die Boxen, bevor das Band voll ist.',
    play_start: 'Start', play_continue: 'Weiter · Level {n}', endless: 'Endlos',
    howto: 'So geht’s', settings: 'Einstellungen', version: 'Version {v}',
    home_aria: 'Alle Spiele / All games', pause_aria: 'Pause',
    level: 'Level {n}', streak: 'Serie {n}', pill_endless: '{tier} · {n}', pill_endless_aria: 'Serie {n} auf {tier}',
    tier_easy: 'Leicht', tier_normal: 'Normal', tier_hard: 'Schwer', tier_extreme: 'Extrem',
    pause_title: 'Pause', resume: 'Weiter', restart: 'Neu starten', quit: 'Zum Titel',
    settings_title: 'Einstellungen', sound: 'Ton', sound_on: 'Ton: an', sound_off: 'Ton: aus', done: 'Fertig',
    modes_title: 'Endlos', modes_sub: 'Wähle die Stufe. Deine Serie endet, wenn das Band klemmt.',
    best: 'Bestwert {n}', noluck: 'Kein Glück', noluck_hint: 'Alles ist sichtbar, nichts bleibt versteckt.',
    start: 'Los', back: 'Zurück', preparing: 'Wird vorbereitet …',
    howto_title: 'So geht’s', gotit: 'Verstanden', next: 'Weiter', prev: 'Zurück', page_of: 'Seite {a} von {b}',
    h_basics_t: 'Das Band', h_basics: 'Tippe eine Box: ihre vorderen Stücke einer Sorte rutschen auf freie Teller. Eine Box nimmt ein Stück an, wenn sie leer ist oder vorn dieselbe Sorte liegt. Vier gleiche schließen die Box. Sind alle Teller voll und nichts passt, klemmt das Band.',
    h_hidden_t: 'Verdeckt', h_hidden: 'Unter der Haube steckt ein unbekanntes Stück. Es zeigt sich, sobald es in seiner Box ganz vorn liegt.',
    h_pair_t: 'Gebundenes Paar', h_pair: 'Zwei Stücke an einem Spieß verlassen die Box zusammen und brauchen zwei freie Teller. Auf dem Band sind sie wieder einzeln.',
    h_wrap_t: 'Eingewickelt', h_wrap: 'Ein Tuch deckt die Box ab. Sie nimmt nichts an und lässt sich nicht antippen, bis die Box mit der Sorte des Tuchs geschlossen ist.',
    h_ice_t: 'Eis', h_ice: 'Die Box ist eingefroren. Sie taut auf, sobald eine Nachbarbox geschlossen wird.',
    h_lock_t: 'Schloss und Schlüssel', h_lock: 'Ein Rollladen mit Schloss verdeckt Boxen. Der Schlüssel hängt an einem Stück gleicher Farbe: Liegt es ganz vorn, öffnet sich der Laden.',
    h_oneway_t: 'Einbahn', h_oneway: 'Diese Box nimmt Stücke an, lässt sich aber nicht antippen. Ihre Sorte steht fest, sobald das erste Stück drin liegt.',
    win_title: 'Bestellung fertig!', win_level: 'Level {n} geschafft', win_streak: 'Serie {n} · {tier}',
    all_done: 'Alle {n} Level geschafft! Im Endlos-Modus geht es weiter.',
    next_level: 'Nächstes Level', next_round: 'Nächste Runde', replay: 'Nochmal', to_title: 'Titel',
    lose_title: 'Das Band klemmt!', lose_text: 'Alle Teller sind voll und nichts passt in eine Box. Probier eine andere Reihenfolge.',
    lose_streak: 'Serie {n} · {tier}', new_best: 'Neuer Bestwert!', retry: 'Nochmal versuchen', new_run: 'Neue Serie', modes: 'Stufe wählen',
    share_level: 'Level {n} geschafft', share_streak: 'Serie {n} auf {tier}', share_lose: 'Level {n}: das Band klemmt'
  };

  var en = {
    title_sub: 'Sort the sushi into boxes before the belt jams.',
    play_start: 'Start', play_continue: 'Continue · Level {n}', endless: 'Endless',
    howto: 'How to play', settings: 'Settings', version: 'Version {v}',
    home_aria: 'Alle Spiele / All games', pause_aria: 'Pause',
    level: 'Level {n}', streak: 'Streak {n}', pill_endless: '{tier} · {n}', pill_endless_aria: 'Streak {n} on {tier}',
    tier_easy: 'Easy', tier_normal: 'Normal', tier_hard: 'Hard', tier_extreme: 'Extreme',
    pause_title: 'Paused', resume: 'Resume', restart: 'Restart', quit: 'Quit to title',
    settings_title: 'Settings', sound: 'Sound', sound_on: 'Sound: on', sound_off: 'Sound: off', done: 'Done',
    modes_title: 'Endless', modes_sub: 'Pick a tier. Your streak ends when the belt jams.',
    best: 'Best {n}', noluck: 'No luck', noluck_hint: 'Everything is visible, nothing stays hidden.',
    start: 'Go', back: 'Back', preparing: 'Preparing …',
    howto_title: 'How to play', gotit: 'Got it', next: 'Next', prev: 'Back', page_of: 'Page {a} of {b}',
    h_basics_t: 'The belt', h_basics: 'Tap a box: its front pieces of one kind slide onto free plates. A box takes a piece when it is empty or its front piece is the same kind. Four of a kind close the box. If every plate is full and nothing fits, the belt jams.',
    h_hidden_t: 'Covered', h_hidden: 'A cloche hides an unknown piece. It shows itself as soon as it reaches the front of its box.',
    h_pair_t: 'Bound pair', h_pair: 'Two pieces on one skewer leave the box together and need two free plates. On the belt they are separate again.',
    h_wrap_t: 'Wrapped', h_wrap: 'A cloth covers the box. It takes nothing and cannot be tapped until the box of the cloth’s kind is closed.',
    h_ice_t: 'Ice', h_ice: 'The box is frozen. It thaws as soon as a neighbouring box closes.',
    h_lock_t: 'Padlock and key', h_lock: 'A shutter with a padlock covers boxes. Its key hangs on a piece of the same colour: when that piece is in front, the shutter opens.',
    h_oneway_t: 'One-way', h_oneway: 'This box takes pieces but cannot be tapped. Its kind is fixed once the first piece is inside.',
    win_title: 'Order up!', win_level: 'Level {n} cleared', win_streak: 'Streak {n} · {tier}',
    all_done: 'All {n} levels cleared! Endless mode keeps going.',
    next_level: 'Next level', next_round: 'Next round', replay: 'Replay', to_title: 'Title',
    lose_title: 'The belt is jammed!', lose_text: 'Every plate is full and nothing fits a box. Try another order.',
    lose_streak: 'Streak {n} · {tier}', new_best: 'New best!', retry: 'Try again', new_run: 'New streak', modes: 'Pick a tier',
    share_level: 'Level {n} cleared', share_streak: 'Streak {n} on {tier}', share_lose: 'Stuck on level {n}'
  };

  function lang() {
    try { return root.Arcade && root.Arcade.lang ? root.Arcade.lang.get() : 'en'; } catch (e) { return 'en'; }
  }

  /** t(key, vars): the string in the current language; {name} placeholders; the key itself when unknown. */
  function t(key, vars) {
    var table = strings[lang()] || en, s = table[key];
    if (s === undefined) s = en[key];
    if (s === undefined) return key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, name) { return vars[name] === undefined ? m : String(vars[name]); });
    return s;
  }

  /** apply(rootEl): fills data-i18n (text), data-i18n-aria (aria-label) and data-i18n-title (title) under rootEl. */
  function apply(rootEl) {
    var doc = root.document;
    if (!doc) return;
    var scope = rootEl || doc;
    var v = (PL.config && PL.config.VERSION) || '0.1.0';
    var nodes = scope.querySelectorAll('[data-i18n],[data-i18n-aria],[data-i18n-title]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], k = n.getAttribute('data-i18n');
      if (k) n.textContent = t(k, { v: v });
      k = n.getAttribute('data-i18n-aria'); if (k) n.setAttribute('aria-label', t(k, { v: v }));
      k = n.getAttribute('data-i18n-title'); if (k) n.setAttribute('title', t(k, { v: v }));
    }
  }

  var strings = PL.strings = { de: de, en: en, t: t, apply: apply, lang: lang };
  if (typeof module !== 'undefined' && module.exports) module.exports = strings;
})(typeof window !== 'undefined' ? window : globalThis);
