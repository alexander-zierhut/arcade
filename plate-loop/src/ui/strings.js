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
    level: 'Level {n}', streak: 'Serie {n}', pill_endless: 'Stufe {tier} · {n}', pill_endless_aria: 'Serie {n} auf Stufe {tier}',
    tier_easy: 'Leicht', tier_normal: 'Normal', tier_hard: 'Schwer', tier_extreme: 'Extrem',
    pause_title: 'Pause', resume: 'Weiter', restart: 'Neu starten', quit: 'Zum Titel',
    settings_title: 'Einstellungen', sound: 'Ton', sound_on: 'Ton: an', sound_off: 'Ton: aus', done: 'Fertig',
    modes_title: 'Endlos', modes_sub: 'Wähle die Stufe. Deine Serie endet, wenn das Band klemmt.',
    best: 'Bestwert {n}', noluck: 'Kein Glück', noluck_hint: 'Alles ist sichtbar, nichts bleibt versteckt.',
    noluck_forced: 'Auf dieser Stufe immer an: hier entscheidet nichts Verstecktes.',
    diff_label: 'Stufe {n} · {tier}', diff_aria: 'Stufe {n}, {tier}',
    diff_hint_1: 'Zum Warmwerden.', diff_hint_2: 'Ein paar Fallen.', diff_hint_3: 'Planen hilft.', diff_hint_4: 'Jede Box zählt.',
    diff_hint_5: 'Wer wild tippt, verliert.', diff_hint_6: 'Reihenfolge ist alles.', diff_hint_7: 'Ein Fehler reicht.',
    diff_hint_8: 'Ein Rätsel, kein Spiel.', diff_hint_9: 'Für Besessene.', diff_hint_10: 'Das Schwerste, das der Generator findet.',
    code_label: 'Level-Code', code_hint: 'Ein Code von jemand anderem? Hier eingeben.', code_go: 'Spielen', code_bad: 'Diesen Code gibt es nicht.',
    code_line: 'Code {code}', code_copy: 'Kopieren', code_copied: 'Code kopiert', code_aria: 'Level-Code {code} kopieren',
    searching: 'Suche Level … {n}', searching_best: 'Suche Level … {n} (beste {h})',
    advanced: 'Erweitert', mechs_label: 'Mechaniken', mech_hidden: 'Verdeckt', mech_pair: 'Paare', mech_wrap: 'Tücher', mech_ice: 'Eis', mech_lock: 'Schlösser', mech_oneway: 'Einbahn',
    hunt: 'Jagd: das Schwerste suchen', hunt_hint: 'Sucht ohne Ende auf dieser Stufe und behält das schwerste Level. Je länger, desto härter.',
    hunt_status: 'Kandidaten {n} · beste Härte {h} · neuer Bestwert vor {s} s', hunt_none: 'Suche läuft … {n} Kandidaten', hunt_play: 'Beste spielen', hunt_stop: 'Abbrechen',
    watch: 'Replay ansehen', replay_pill: 'Replay {x}×', replay_aria: 'Replay mit {x}-facher Geschwindigkeit, Pause beendet es',
    favs: 'Favoriten', favs_title: 'Favoriten', favs_empty: 'Noch keine Favoriten. Markiere ein Level mit dem Stern auf der Pause- oder Endkarte, dann findest du es hier wieder.',
    fav_add: 'Als Favorit merken', fav_added: 'Favorit', fav_play: 'Spielen', fav_remove: 'Entfernen', fav_remove_aria: 'Favorit {name} entfernen', fav_level: 'Level {n}', fav_code: 'Stufe {d} · {code}', fav_hard: 'Härte {h}',
    start: 'Los', back: 'Zurück', preparing: 'Wird vorbereitet …',
    howto_title: 'So geht’s', gotit: 'Verstanden', next: 'Weiter', prev: 'Zurück', page_of: 'Seite {a} von {b}',
    h_basics_t: 'Das Band', h_basics: 'Tippe eine Box: ihre vorderen Stücke einer Sorte rutschen auf freie Teller. Eine Box nimmt ein Stück an, wenn sie leer ist oder vorn dieselbe Sorte liegt. Vier gleiche schließen die Box. Sind alle Teller voll und nichts passt, klemmt das Band.',
    h_hidden_t: 'Verdeckt', h_hidden: 'Unter der Haube steckt ein unbekanntes Stück. Es zeigt sich, sobald es in seiner Box ganz vorn liegt.',
    h_pair_t: 'Gebundenes Paar', h_pair: 'Zwei Stücke an einem Spieß verlassen die Box zusammen und brauchen zwei freie Teller. Auf dem Band sind sie wieder einzeln.',
    h_wrap_t: 'Eingewickelt', h_wrap: 'Ein Tuch deckt die Box ab. Sie nimmt nichts an und lässt sich nicht antippen, bis die Box mit der Sorte des Tuchs geschlossen ist.',
    h_ice_t: 'Eis', h_ice: 'Die Box ist eingefroren. Sie taut auf, sobald eine Nachbarbox geschlossen wird.',
    h_lock_t: 'Schloss und Schlüssel', h_lock: 'Ein Rollladen mit Schloss verdeckt Boxen. Der Schlüssel hängt an einem Stück gleicher Farbe: Liegt es ganz vorn, öffnet sich der Laden.',
    h_oneway_t: 'Einbahn', h_oneway: 'Diese Box nimmt Stücke an, lässt sich aber nicht antippen. Ihre Sorte steht fest, sobald das erste Stück drin liegt.',
    win_title: 'Bestellung fertig!', win_level: 'Level {n} geschafft', win_streak: 'Serie {n} · Stufe {tier}',
    all_done: 'Alle {n} Level geschafft! Im Endlos-Modus geht es weiter.',
    next_level: 'Nächstes Level', next_round: 'Nächste Runde', replay: 'Nochmal', to_title: 'Titel',
    lose_title: 'Das Band klemmt!', lose_text: 'Alle Teller sind voll und nichts passt in eine Box. Probier eine andere Reihenfolge.',
    lose_title_hopeless: 'Das geht nicht mehr auf!', lose_text_hopeless: 'Die letzten Stücke einer Sorte stecken in einer Box, die nie mehr aufgeht. Probier eine andere Reihenfolge.',
    graphics_sushi: 'Grafik: Sushi', graphics_plain: 'Grafik: schlicht',
    belt_plates: 'Band: Teller', belt_stream: 'Band: Strom', slots_aria: '{n} von {total} Plätzen frei',
    lose_streak: 'Serie {n} · Stufe {tier}', new_best: 'Neuer Bestwert!', retry: 'Nochmal versuchen', new_run: 'Neue Serie', modes: 'Stufe wählen',
    share_level: 'Level {n} geschafft', share_streak: 'Serie {n} auf Stufe {tier}', share_lose: 'Level {n}: das Band klemmt',
    share_code: 'Serie {n} auf Stufe {tier} · Code {code}', share_code_lose: 'Stufe {tier} · Code {code}: das Band klemmt'
  };

  var en = {
    title_sub: 'Sort the sushi into boxes before the belt jams.',
    play_start: 'Start', play_continue: 'Continue · Level {n}', endless: 'Endless',
    howto: 'How to play', settings: 'Settings', version: 'Version {v}',
    home_aria: 'Alle Spiele / All games', pause_aria: 'Pause',
    level: 'Level {n}', streak: 'Streak {n}', pill_endless: 'Tier {tier} · {n}', pill_endless_aria: 'Streak {n} on difficulty {tier}',
    tier_easy: 'Easy', tier_normal: 'Normal', tier_hard: 'Hard', tier_extreme: 'Extreme',
    pause_title: 'Paused', resume: 'Resume', restart: 'Restart', quit: 'Quit to title',
    settings_title: 'Settings', sound: 'Sound', sound_on: 'Sound: on', sound_off: 'Sound: off', done: 'Done',
    modes_title: 'Endless', modes_sub: 'Pick a difficulty. Your streak ends when the belt jams.',
    best: 'Best {n}', noluck: 'No luck', noluck_hint: 'Everything is visible, nothing stays hidden.',
    noluck_forced: 'Always on at this difficulty: nothing hidden decides here.',
    diff_label: 'Difficulty {n} · {tier}', diff_aria: 'Difficulty {n}, {tier}',
    diff_hint_1: 'A warm-up.', diff_hint_2: 'A few traps.', diff_hint_3: 'Planning helps.', diff_hint_4: 'Every box counts.',
    diff_hint_5: 'Wild tapping loses.', diff_hint_6: 'Order is everything.', diff_hint_7: 'One mistake is enough.',
    diff_hint_8: 'A puzzle, not a game.', diff_hint_9: 'For the obsessed.', diff_hint_10: 'The hardest the generator can find.',
    code_label: 'Level code', code_hint: 'Got a code from someone? Enter it here.', code_go: 'Play', code_bad: 'There is no such code.',
    code_line: 'Code {code}', code_copy: 'Copy', code_copied: 'Code copied', code_aria: 'Copy level code {code}',
    searching: 'Searching for a level … {n}', searching_best: 'Searching for a level … {n} (best {h})',
    advanced: 'Advanced', mechs_label: 'Mechanics', mech_hidden: 'Hidden', mech_pair: 'Pairs', mech_wrap: 'Cloths', mech_ice: 'Ice', mech_lock: 'Locks', mech_oneway: 'One-way',
    hunt: 'Hunt the hardest', hunt_hint: 'Searches without end at this difficulty and keeps the hardest level. The longer, the harder.',
    hunt_status: 'Candidates {n} · best hardness {h} · new best {s} s ago', hunt_none: 'Searching … {n} candidates', hunt_play: 'Play the best', hunt_stop: 'Stop',
    watch: 'Watch replay', replay_pill: 'Replay {x}×', replay_aria: 'Replay at {x} times the speed, pause ends it',
    favs: 'Favourites', favs_title: 'Favourites', favs_empty: 'No favourites yet. Mark a level with the star on the pause or end card and you will find it here.',
    fav_add: 'Add to favourites', fav_added: 'Favourite', fav_play: 'Play', fav_remove: 'Remove', fav_remove_aria: 'Remove favourite {name}', fav_level: 'Level {n}', fav_code: 'Difficulty {d} · {code}', fav_hard: 'Hardness {h}',
    start: 'Go', back: 'Back', preparing: 'Preparing …',
    howto_title: 'How to play', gotit: 'Got it', next: 'Next', prev: 'Back', page_of: 'Page {a} of {b}',
    h_basics_t: 'The belt', h_basics: 'Tap a box: its front pieces of one kind slide onto free plates. A box takes a piece when it is empty or its front piece is the same kind. Four of a kind close the box. If every plate is full and nothing fits, the belt jams.',
    h_hidden_t: 'Covered', h_hidden: 'A cloche hides an unknown piece. It shows itself as soon as it reaches the front of its box.',
    h_pair_t: 'Bound pair', h_pair: 'Two pieces on one skewer leave the box together and need two free plates. On the belt they are separate again.',
    h_wrap_t: 'Wrapped', h_wrap: 'A cloth covers the box. It takes nothing and cannot be tapped until the box of the cloth’s kind is closed.',
    h_ice_t: 'Ice', h_ice: 'The box is frozen. It thaws as soon as a neighbouring box closes.',
    h_lock_t: 'Padlock and key', h_lock: 'A shutter with a padlock covers boxes. Its key hangs on a piece of the same colour: when that piece is in front, the shutter opens.',
    h_oneway_t: 'One-way', h_oneway: 'This box takes pieces but cannot be tapped. Its kind is fixed once the first piece is inside.',
    win_title: 'Order up!', win_level: 'Level {n} cleared', win_streak: 'Streak {n} · difficulty {tier}',
    all_done: 'All {n} levels cleared! Endless mode keeps going.',
    next_level: 'Next level', next_round: 'Next round', replay: 'Replay', to_title: 'Title',
    lose_title: 'The belt is jammed!', lose_text: 'Every plate is full and nothing fits a box. Try another order.',
    lose_title_hopeless: 'No way to finish!', lose_text_hopeless: 'The last pieces of a kind are stuck in a box that can never open again. Try another order.',
    graphics_sushi: 'Graphics: sushi', graphics_plain: 'Graphics: plain',
    belt_plates: 'Belt: plates', belt_stream: 'Belt: stream', slots_aria: '{n} of {total} slots free',
    lose_streak: 'Streak {n} · difficulty {tier}', new_best: 'New best!', retry: 'Try again', new_run: 'New streak', modes: 'Pick a tier',
    share_level: 'Level {n} cleared', share_streak: 'Streak {n} on difficulty {tier}', share_lose: 'Stuck on level {n}',
    share_code: 'Streak {n} on difficulty {tier} · code {code}', share_code_lose: 'Difficulty {tier} · code {code}: the belt jammed'
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
    var v = (PL.config && PL.config.VERSION) || '0.2.0';
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
