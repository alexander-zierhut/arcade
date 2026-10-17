// src/ui/strings.js: every user-facing text, German first, English as a toggle. SS.t(key, vars) formats {name} placeholders.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var de = {
    title: 'Supermarkt Sortierer', subtitle: 'Regale einräumen, Dreier finden',
    continue_: 'Weiterspielen', play_relaxed: 'Entspannt spielen', play_relaxed_sub: 'ohne Zeitdruck',
    play_timed: 'Gegen die Zeit', play_timed_sub: 'mit Timer und laufenden Regalen',
    reached: 'Level {n}', howto: 'Anleitung', scores: 'Bestenliste', settings: 'Einstellungen', back: 'Zurück', ok: 'Alles klar',
    level: 'Level {n}', level_short: 'Lv. {n}', moves: '{n} Züge', par: 'Ziel {n}', best: 'Rekord {n}', score: 'Punkte', left: 'Noch {n}', hard: 'Schwer', vhard: 'Sehr schwer', pause_tag: 'Verschnaufpause', turbo: 'Turbo-Regal!',
    pause: 'Pause', resume: 'Weiter', restart: 'Level neu starten', quit: 'Zum Menü', end_serie: 'Serie beenden',
    arm_restart: 'Nochmal tippen: Level neu starten', arm_quit: 'Nochmal tippen: zum Menü', arm_end: 'Nochmal tippen: Serie beenden',
    intro_title: 'Level {n}', intro_tap: 'Tippen zum Start', intro_timed: '{t} Zeit', intro_relaxed: 'Ziel: {par} Züge',
    win_title: 'Level {n} geschafft!', next: 'Nächstes Level', again: 'Nochmal', points_line: '{n} Punkte',
    win_detail_timed: '{s} Sekunden übrig · Zeitbonus +{bonus}', win_detail_relaxed: '{moves} Züge (Ziel {par})',
    win_bunny: 'Goldhase gespart +{n}', win_flawless: 'Fehlerfrei +{n}', badge_nohelp: 'Ohne Hilfe', badge_bunny: 'Goldhase gespart',
    run_total: 'Serie: {n} Punkte', level_best: 'Bestwert {n}',
    lose_timeout: 'Zeit abgelaufen', lose_stuck: 'Kein Platz mehr', retry: 'Nochmal versuchen', extend: '+30 Sekunden',
    timeout_text: 'Einmal pro Level gibt es 30 Sekunden geschenkt.',
    serie_title: 'Serie gespeichert', serie_banked: 'Serie gespeichert: {score} Punkte, Platz {rank}.', serie_next: 'Weiter geht es mit Level {n}.',
    stuck_title: 'Kein Platz mehr', stuck_text: 'Nichts passt mehr zusammen. Mach einen Zug rückgängig oder setz den Goldhasen ein.',
    undo: 'Rückgängig', bunny: 'Goldhase', bunny_rescue: 'Rettungshase', bunny_found: 'Goldhase gefunden!', bunny_earned: 'Kombo x5: ein Goldhase!',
    bunny_arm: 'Tippe auf ein Fach: Es wird komplett leer geräumt', hint: 'Tipp', hint_none: 'Kein Weg gefunden: Rückgängig oder neu starten',
    lock_hint: 'Öffnet sich nach {n} Dreiern', back_hint: 'Das steht dahinter: erst die vordere Reihe leer räumen', orphan: 'Einzelstücke räumen wir weg', warn_space: 'Nur noch 1 Platz frei. Bilde erst einen Dreier.',
    belt_appear: 'Nachschub!', building: 'Regal wird eingeräumt …', rules_changed: 'Neue Spielregeln: Level startet neu',
    new_best: 'Neuer Rekord!', stats_line: 'Entspannt: Level {relaxed} · Gegen die Zeit: Level {timed}',
    continue_info: '{mode} · Level {n}', mode_relaxed: 'Entspannt', mode_timed: 'Gegen die Zeit',
    sound: 'Ton', lowgfx: 'Sparmodus (schwache Geräte)', language: 'Sprache', haptics: 'Vibration', reduced_motion: 'Bewegung reduzieren',
    still_belts: 'Seitenregale stehen still, wenn alles sichtbar ist (entspannt)', flat_icons: 'Produkte flach (2D) statt plastisch (3D)', show_depth: 'Tiefe anzeigen', reset_tips: 'Hinweise noch einmal zeigen',
    export_: 'Spielstand sichern', import_: 'Spielstand laden', export_done: 'Spielstand gesichert ({file})', export_copied: 'Spielstand in die Zwischenablage kopiert', import_done: 'Spielstand geladen: Entspannt Level {relaxed}, Gegen die Zeit Level {timed}', import_bad: 'Das ist keine Spielstand-Datei', import_newer: 'Datei aus einer neueren Version: geladen, was verstanden wurde',
    scores_empty: 'Noch keine Einträge. Spiel eine Runde!', scores_best_timed: 'Rekord: {score} Punkte · bis Level {level}',
    scores_best_relaxed: 'Gesamt: {score} Punkte · {stars} Sterne · Level {level} erreicht', scores_entry_timed: '{score} · Level {from}-{to}',
    scores_entry_relaxed: '{score} · Level {level}',
    howto_text: '<p><b>Ziehe</b> ein Produkt in ein anderes Fach, oder <b>tippe</b> es an und dann auf das Zielfach.</p><p>Stehen <b>drei gleiche</b> Produkte in einem Fach, verschwinden sie.</p><p><b>Dunkle Reihe:</b> Ist die vordere Reihe eines Fachs leer, rückt die dunkle Reihe dahinter nach vorn.</p><p><b>Kette:</b> Das Fach öffnet sich von selbst nach so vielen Dreiern, wie die Zahl zeigt.</p><p><b>Seitenregale:</b> Von dort kannst du nur nehmen, nie zurücklegen. Achte auf freien Platz in der Mitte!</p><p><b>Goldhase:</b> Antippen, dann oben auf ihn und auf ein Fach tippen: Das Fach wird leer geräumt.</p><p><b>Umrisse:</b> Manche Produkte zeigen nur ihre Form. Sie passen zu ihren Geschwistern wie jedes andere.</p><p>Bleiben nur Einzelstücke übrig, ist das Level geschafft.</p>',
    coach_drag: 'Zieh drei gleiche Produkte in ein Fach.', coach_tap: 'Du kannst auch tippen: erst das Produkt, dann das Fach. Vertan? Rückgängig.',
    coach_layers: 'Dahinter wartet mehr: Ist die vordere Reihe leer, rückt die dunkle nach vorn.',
    coach_bunny: 'Ein Goldhase! Tipp ihn an. Dann tippst du oben auf ihn und auf ein Fach: Es wird leer geräumt.',
    coach_lock: 'Dieses Fach ist verschlossen. Nach {n} Dreiern geht es von selbst auf.', coach_depth: 'Die Punkte zeigen, wie viele Reihen noch dahinter stecken.',
    coach_belts: 'Aus den Seitenregalen kannst du nur nehmen, nicht zurücklegen. Achte auf freien Platz in der Mitte!',
    coach_beltBunny: 'Schnapp dir den Goldhasen, wenn er vorbeikommt.', coach_sil: 'Nur der Umriss: Welches Produkt ist das? Es passt zu seinen Geschwistern wie jedes andere.',
    coach_hbelt: 'Nachschub! Unten fährt jetzt ein weiteres Regal vorbei.', coach_turbo: 'Turbo! Die Seitenregale rasen heute. Tipp ein Produkt an, dann das Fach: so wartet es auf dich.', coach_drift: 'Die Seitenregale wandern jetzt langsam. Stillstand: Einstellungen.',
    toast_combo: 'Kombo x{n}!', toast_saved: 'Spielstand gespeichert', toast_nomove: 'Da geht es nicht hin', toast_locked: 'Noch verschlossen', toast_full: 'Das Fach ist voll', toast_source: 'Das Fach ist noch verschlossen',
    version: 'Version {v} · Privates Spiel ohne Werbung',
    debug_mode: 'Testmodus: Level {n}. Nichts wird gespeichert.',
    install: 'Als App', install_title: 'Als App spielen', fullscreen: 'Vollbild', fullscreen_setting: 'Vollbild',
    install_text: '<p>Ohne Adressleiste ist das Regal deutlich größer.</p><p><b>iPhone / iPad:</b> In Safari unten auf <b>Teilen</b> tippen, dann <b>„Zum Home-Bildschirm“</b>. Das Spiel startet dann wie eine App.</p><p><b>Android:</b> Oben rechts auf <b>⋮</b> tippen, dann <b>„Zum Startbildschirm hinzufügen“</b> (oder „App installieren“). Oder einfach unten auf <b>Vollbild</b>.</p><p>Dein Spielstand bleibt dabei erhalten, solange du dieselbe Adresse benutzt.</p>',
    whatsnew: 'Neuigkeiten', new_badge: 'NEU', whatsnew_title: 'Neu in Version {v}',
    whatsnew_text: '<p><b>Turbo-Regale langsamer:</b> Die Turbo-Level (27, 37, …) laufen 40 % langsamer.</p><p><b>Englisch zuerst:</b> Das Spiel startet auf Englisch; Deutsch gibt es in den Einstellungen.</p><p><b>Kleine Reparaturen:</b> Die Pause-Taste bleibt auf schmalen Handys im Bild, die Schalter im Pausemenü sind alle gleich groß.</p><p><b>Neuer Look:</b> Ein Regal aus einem Stück, Produkte wie aus dem Spielzeugladen, kräftige Farben.</p><p><b>Alles größer:</b> Die Produkte sind deutlich größer und überall gleich groß, auch in den Seitenregalen und im unteren Regal.</p><p><b>Als App:</b> Über „Als App“ auf dem Startbildschirm spielst du ohne Adressleiste, mit noch mehr Platz.</p><p><b>Großzügiger ablegen:</b> Ein Produkt landet im nächstgelegenen Fach, auch wenn du nicht genau triffst.</p><p><b>Turbo-Regale</b> sind jetzt richtig schnell.</p><p>Dein Spielstand und deine Rekorde bleiben erhalten.</p>'
  };
  var en = {
    title: 'Supermarket Sorter', subtitle: 'Stock the shelves, match three',
    continue_: 'Continue', play_relaxed: 'Relaxed', play_relaxed_sub: 'no timer', play_timed: 'Against the clock', play_timed_sub: 'timer and moving shelves',
    reached: 'Level {n}', howto: 'How to play', scores: 'Highscores', settings: 'Settings', back: 'Back', ok: 'Got it',
    level: 'Level {n}', level_short: 'Lv. {n}', moves: '{n} moves', par: 'Par {n}', best: 'Best {n}', score: 'Score', left: '{n} left', hard: 'Hard', vhard: 'Very hard', pause_tag: 'Breather', turbo: 'Turbo shelves!',
    pause: 'Paused', resume: 'Resume', restart: 'Restart level', quit: 'Quit to menu', end_serie: 'End streak',
    arm_restart: 'Tap again to restart', arm_quit: 'Tap again to quit', arm_end: 'Tap again to end the streak',
    intro_title: 'Level {n}', intro_tap: 'Tap to start', intro_timed: '{t} on the clock', intro_relaxed: 'Par: {par} moves',
    win_title: 'Level {n} cleared!', next: 'Next level', again: 'Play again', points_line: '{n} points',
    win_detail_timed: '{s} seconds left · time bonus +{bonus}', win_detail_relaxed: '{moves} moves (par {par})',
    win_bunny: 'Bunny saved +{n}', win_flawless: 'Flawless +{n}', badge_nohelp: 'No help', badge_bunny: 'Bunny saved',
    run_total: 'Streak: {n} points', level_best: 'Best {n}',
    lose_timeout: 'Time is up', lose_stuck: 'No space left', retry: 'Try again', extend: '+30 seconds',
    timeout_text: 'Once per level you get 30 free seconds.',
    serie_title: 'Streak saved', serie_banked: 'Streak saved: {score} points, rank {rank}.', serie_next: 'Next up: level {n}.',
    stuck_title: 'No space left', stuck_text: 'Nothing fits any more. Undo a move or spend the golden bunny.',
    undo: 'Undo', bunny: 'Bunny', bunny_rescue: 'Rescue bunny', bunny_found: 'Golden bunny!', bunny_earned: 'Combo x5: a golden bunny!',
    bunny_arm: 'Tap a compartment: it is emptied completely', hint: 'Hint', hint_none: 'No way found: undo or restart',
    lock_hint: 'Opens after {n} matches', back_hint: 'That is behind: clear the front row first', orphan: 'Leftovers are cleared away', warn_space: 'Only 1 slot left. Make a match first.',
    belt_appear: 'Restock!', building: 'Stocking the shelf …', rules_changed: 'New rules: the level restarts',
    new_best: 'New best!', stats_line: 'Relaxed: level {relaxed} · Timed: level {timed}',
    continue_info: '{mode} · level {n}', mode_relaxed: 'Relaxed', mode_timed: 'Timed',
    sound: 'Sound', lowgfx: 'Performance mode', language: 'Language', haptics: 'Vibration', reduced_motion: 'Reduce motion',
    still_belts: 'Side shelves stand still when everything is visible (relaxed)', flat_icons: 'Flat (2D) products instead of 3D', show_depth: 'Show depth', reset_tips: 'Show the tips again',
    export_: 'Back up progress', import_: 'Load progress', export_done: 'Progress saved ({file})', export_copied: 'Progress copied to the clipboard', import_done: 'Progress loaded: relaxed level {relaxed}, timed level {timed}', import_bad: 'That is not a progress file', import_newer: 'File from a newer version: loaded what was understood',
    scores_empty: 'No entries yet. Play a round!', scores_best_timed: 'Best: {score} points · up to level {level}',
    scores_best_relaxed: 'Total: {score} points · {stars} stars · level {level} reached', scores_entry_timed: '{score} · levels {from}-{to}',
    scores_entry_relaxed: '{score} · level {level}',
    howto_text: '<p><b>Drag</b> a product into another compartment, or <b>tap</b> it and then the target.</p><p>When <b>three identical</b> products share a compartment they clear.</p><p><b>Dark row:</b> when the front row of a compartment is empty, the dark row behind it moves forward.</p><p><b>Chain:</b> the compartment opens by itself after the number of matches shown.</p><p><b>Side shelves:</b> you can only take from them, never put back. Watch the free space in the middle!</p><p><b>Golden bunny:</b> tap it, then tap it at the top and a compartment: the compartment is emptied.</p><p><b>Outlines:</b> some products show only their shape. They match their siblings like any other.</p><p>When only singles are left, the level is done.</p>',
    coach_drag: 'Drag three identical products into one compartment.', coach_tap: 'You can also tap: first the product, then the compartment. Mistake? Undo.',
    coach_layers: 'More waits behind: when the front row is empty, the dark row moves forward.',
    coach_bunny: 'A golden bunny! Tap it. Then tap it at the top and a compartment: it is emptied.',
    coach_lock: 'This compartment is locked. After {n} matches it opens by itself.', coach_depth: 'The dots show how many rows are still behind.',
    coach_belts: 'From the side shelves you can only take, not put back. Watch the free space in the middle!',
    coach_beltBunny: 'Grab the golden bunny when it comes by.', coach_sil: 'Just the outline: which product is it? It matches its siblings like any other.',
    coach_hbelt: 'Restock! Another shelf now passes by at the bottom.', coach_turbo: 'Turbo! The side shelves race today. Tap a product, then the compartment: it waits for you.', coach_drift: 'The side shelves now drift slowly. Settings can stop them.',
    toast_combo: 'Combo x{n}!', toast_saved: 'Progress saved', toast_nomove: 'It cannot go there', toast_locked: 'Still locked', toast_full: 'That compartment is full', toast_source: 'That compartment is still locked',
    version: 'Version {v} · Private game, no ads',
    debug_mode: 'Test mode: level {n}. Nothing is saved.',
    install: 'As an app', install_title: 'Play as an app', fullscreen: 'Fullscreen', fullscreen_setting: 'Fullscreen',
    install_text: '<p>Without the address bar the shelf is much bigger.</p><p><b>iPhone / iPad:</b> in Safari tap <b>Share</b>, then <b>"Add to Home Screen"</b>. The game then starts like an app.</p><p><b>Android:</b> tap <b>⋮</b> at the top right, then <b>"Add to Home screen"</b> (or "Install app"). Or simply tap <b>Fullscreen</b> below.</p><p>Your progress is kept as long as you use the same address.</p>',
    whatsnew: 'What\'s new', new_badge: 'NEW', whatsnew_title: 'New in version {v}',
    whatsnew_text: '<p><b>Slower turbo shelves:</b> the turbo levels (27, 37, …) run 40% slower.</p><p><b>English first:</b> the game starts in English; German is in the settings.</p><p><b>Small fixes:</b> the pause button stays on screen on narrow phones, and the switches in the pause menu are all the same size.</p><p><b>New look:</b> one cabinet, toy-shop products, strong colours.</p><p><b>Everything bigger:</b> products are much larger and the same size everywhere, on the side shelves and the bottom shelf too.</p><p><b>As an app:</b> "As an app" on the title shows how to play without the address bar, with even more room.</p><p><b>Forgiving drops:</b> a product lands in the nearest compartment even when you miss by a bit.</p><p><b>Turbo shelves</b> are properly fast now.</p><p>Your progress and records are kept.</p>'
  };
  var LANGS = { de: de, en: en };
  var current = 'en';
  function t(key, vars) {
    var table = LANGS[current] || de, s = table[key];
    if (s === undefined) s = de[key];
    if (s === undefined) return key;
    if (vars) for (var k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
    return s;
  }
  function setLang(code) { current = LANGS[code] ? code : 'en'; return current; }
  function lang() { return current; }
  SS.strings = { t: t, setLang: setLang, lang: lang, LANGS: LANGS };
  SS.t = t;
  if (typeof module !== 'undefined' && module.exports) module.exports = SS.strings;
})(typeof globalThis !== 'undefined' ? globalThis : this);
