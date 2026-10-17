# Supermarkt Sortierer

Ein privates, werbefreies Regal-Sortierspiel für den Handy-Browser: Produkte in Fächer ziehen, drei gleiche verschwinden,
Regal leer räumen. Zwei Zweige: **Entspannt** (ohne Zeit, das Sortieren wird schwerer: Ebenen, Sperren, Umrisse) und
**Gegen die Zeit** (Timer plus laufende Seitenregale, die mit dem Level schneller werden). Jedes Level ist beweisbar
lösbar: es wird nur gezeigt, wenn eine Lösung dafür vorliegt und nachgespielt wurde.

- Spielen: `index.html` öffnen (auch per Doppelklick) oder `npm run serve` und `http://localhost:8765/` aufrufen.
- Tests: `npm test` (reine Spielregeln, Generator, Beweis-Replays), `npm run test:browser` (echtes Spiel in Chrome),
  `node tests/browser/soak.js 20` (lange Spielsitzungen, Speicher, Leistung), `npm run perf` (Leistung bei 4-facher
  CPU-Drosselung, Werte in `docs/proof/perf-*.json`).
- Level backen: `npm run bake` schreibt `src/game/levels-data.js` (300 pro Zweig, mit Zeugen-Lösungen).
- Turbo-Level (jedes zehnte ab 27) lassen die Seitenregale rasen (1,8 bis 3 Zellen/s); Umriss-Produkte ab Level 24.
- Ein Level direkt testen: `index.html?level=34&mode=timed` (oder `mode=relaxed`); im Testmodus wird nichts gespeichert.
- Produkte: 260 erfundene deutsche Produkte als SVG, plastisch im Stil des Originals (`assets/items/`, Stilvorgabe
  `docs/ART-STYLE.md`, Dateiregeln `docs/ART-SPEC.md`) und als flacher 2D-Satz (`assets/items-2d/`, umschaltbar in den
  Einstellungen). Rund 90 davon zwinkern erkennbar echten Supermarkt-Produkten zu (Nutello, Haribö, Milki, Maggy ...),
  172 sind Lebensmittel, die in den Leveln bevorzugt werden. Katalog per `npm run catalog`, Prüfung per `npm run items`.
- Als App: `manifest.webmanifest`; „Zum Startbildschirm hinzufügen“ startet ohne Adressleiste, auf Android zusätzlich
  Vollbild per Knopf (Startbildschirm → „Als App“ oder Einstellungen).
- Veröffentlichen: `npm run release`, dann `docs/DEPLOY.md` (S3). Spielstände überleben Updates (siehe `docs/HOW-TO-CHANGE.md`, Abschnitt Update safety); zusätzlich gibt es in den Einstellungen Sichern/Laden als Datei.

Dokumente: `docs/STATUS.md` (Stand und Übergabe, zuerst lesen), `docs/OWNER-NOTES.md` (Entscheidungen), `docs/DESIGN.md`
(Regeln und Zahlen, Abschnitt 0.5 = Abweichungen der Umsetzung), `docs/ARCHITECTURE.md` (Dateien), `docs/HOW-TO-CHANGE.md`
(Stellschrauben, Update-Sicherheit, Testmodus, Refactor-Nachweis, Leistung), `docs/ART-STYLE.md` und `docs/ART-SPEC.md`
(Produkte), `docs/DEPLOY.md` (S3), `docs/RESEARCH.md` (Recherche zum Original).
