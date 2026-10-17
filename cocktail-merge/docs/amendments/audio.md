# Amendment: audio (glass merge sound, background music, Music setting)

Key: `audio`. Owner playtest feedback items 1 (merge must sound like glass) and 7 (calm background
music with its own persisted toggle). Implemented in `src/audio/engine.js`, `src/audio/sounds.js`,
`src/audio/music.js`; checked by `tests/browser/audio-check.html` + `tests/browser/audio-check.js`.
Every change below is to DESIGN.md revision 3; section numbers refer to it.

---

## A1. 3.9 Sound: graph (replace the "Graph" bullet list)

- `voices → (StereoPanner, pan = (x−50)/50·0.6, skipped if unsupported) → sfxBus 1.0 → master 0.9 → DynamicsCompressor(threshold −14 dB, knee 10, ratio 3.5, attack 3 ms, release 120 ms) → destination`.
- Clinks, merge glasses, the discovery sparkle and the win jingle pass a shared `BiquadFilter` lowpass at 7 kHz (Q 0.7) before the sfxBus.
- `ambience → ambBus 0.12 → master`. The ambience noise is its own 4-s seeded loop (a 1-s loop has an audible period at 0.09 Hz swells).
- `music → padLowpass 1100 Hz (pad only) → musicLowpass 3200 Hz → musicBus (CONFIG.AUDIO.MUSIC, default 0.09, hard-capped at 0.12) → master`. Music therefore respects mute.
- Mute (HUD button, M, Pause "Sound"): `master.gain.setTargetAtTime(0 | 0.9, now, 0.02)`. "Ambience" off sets `ambBus` to 0 the same way. "Music" off fades `musicBus` to 0 (τ 0.3 s) and stops the scheduler.
- A shared 1-s noise buffer is generated once with a seeded LCG.

## A2. 3.9 Sound: limits (append to "Limits")

- When 12 voices are active, a new non-priority voice is dropped if its peak is below 0.03 **or** 16 voices are active (a hard ceiling so loud clink storms cannot pile up). Priority voices (merge glass, win, lose, Fiesta) always play.
- Wall thocks share the clink limits (per-frame top 3, 12 per second, per-pair 80 ms keyed `a + 'w' + wall`, quiet gap 30 ms).
- "Per frame" is implemented by queueing impact sounds during `consume` and flushing once in a microtask (`Promise.resolve().then`), which runs after the whole rAF callback has dispatched all ticks.
- Music voices are not counted against the 12-voice limit.

## A3. 3.9 Sound: merge pitch (replace the "Merge chime pitch" paragraph and code block)

**Merge glass pitch** (feedback 1: a bigger glass rings lower). `CM.audio.glassFreq(k, d)` (in sounds.js):

```
i = (9 − k) + min(d − 1, 5) ;  f = SCALE[clamp(i, 0, 14)]        // same 15-note SCALE as before
```

T9 at depth 1 rings at C5 523 Hz, T2 at E6 1319 Hz; every chain step raises the pitch one scale step.
The pure `CM.game.chimeFreqs` stays as it is (test 24 still covers it) but the audio no longer calls it.

## A4. 3.9 Sound: recipe table (replace these rows; other rows unchanged)

**Struck-glass building block** `glass(f, peak, T)`: partials at f × [1, 2.32, 4.25, 6.63] with relative gains [1, 0.42, 0.22, 0.10]; each partial attacks in 1.5 ms and decays exponentially with τ = (T/3.2)·[1, 0.55, 0.32, 0.20] (higher modes die faster); partials above 15 kHz are skipped. The first two partials are **detuned pairs** (±0.3-1.2 Hz and ±0.6-2.4 Hz, `Math.random`, audio only) whose slow beating is the wine-glass shimmer. Plus a **tick**: noise → bandpass 5.2 kHz Q 1.1, peak 0.35·peak, attack 0.5 ms, τ 4 ms. Oscillators stop at T·1.8 (about −50 dB).

| Sound | Recipe |
|---|---|
| **Merge glass** (tier k, depth d) | `f = glassFreq(k, d)`, `T = 0.5 + 0.1(k−2) + 0.03·min(d−1, 4)` s (T2 0.5 s … T9 1.2 s), peak `min(0.34, 0.24·(1 + 0.08(d−1)))`, panned by x, through the 7 kHz lowpass. A softer answering glass a fifth below (f·0.667, 0.22× peak, 0.8 T, 3 partials, +12 ms): two glasses touching. **Fizz (k ≥ 5):** noise → highpass 4 kHz, 0.035, τ 0.25. **k ≥ 7:** a body sine f/2 (0.08, τ 0.3) plus a grace glass at `glassFreq(k, d+2)` +90 ms, 0.55× peak. **Chain sparkle (d ≥ 2):** min(d, 5) tiny glass pings (2 partials, no shimmer, 0.045, T 0.22 s) at f·(2 + 0.5 i), 55 ms apart. Priority voice. Replaces the steel-pan voice and the 260 → 760 Hz pop |
| **Clink** (glass-glass; `vn`, mean radius ř) | Gain `g = 0.32·clamp((vn−18)/140, 0, 1)^1.2`; skip if g < 0.02. `f0 = 2600·(R1/ř)^0.6` Hz, where R1 = TIERS[1].radius (so a global radius scale does not shift the pitches), ±2.5 % detune. A struck glass with 3 partials [1, 2.32, 4.25] at gains g × [1, 1.4, 1.6]·[1, 0.42, 0.22] (high modes emphasised), no shimmer, `T = 0.125·(ř/R1)^0.3` s (audible 60-120 ms), tick at 7 kHz 0.3 g, through the 7 kHz lowpass |
| **Discovery sparkle** | Three glass pings (2 partials) at 2637 / 3136 / 3951 Hz, +0 / 40 / 80 ms, 0.05, T 0.3 s |
| **Win jingle** (~2.2 s) | Glasses C6 E6 G6 C7 E7 (1046.5 / 1318.5 / 1568 / 2093 / 2637 Hz) at 0/0.10/0.20/0.30/0.40 s (0.17, T 0.75). Glass chord C6+E6+G6+C7 at 0.62 s (0.10 each, T 1.6). Shimmer: sines 2093 + 3136 Hz with 9-Hz 50 % tremolo, 0.04, fading 0.6 → 2.0 s. Shaker: noise → highpass 6 kHz bursts every 0.125 s from 0.62 to 1.6 s, 0.05, τ 0.03. Ducks the music |
| **Lose sting** (~1.9 s) | **Thud:** sine 120 → 48 Hz (exponential, 0.3 s), 0.3, τ 0.12, plus noise → lowpass 250 Hz, 0.2, τ 0.05. **Descending dull glass:** through a 2.4 kHz lowpass, glasses (3 partials) G5 784, F♯5 740, F5 698, E5 659 Hz at 0.3 / 0.6 / 0.9 / 1.2 s, peaks 0.16 / 0.14 / 0.12 / 0.13, T 0.45 s, the last T 1.4 s with a 5.5-Hz ±8-Hz vibrato on every partial. Ducks the music |
| **Fiesta (jug burst)** | Merge glass k = 9, d = 3, plus noise splash (bandpass 800 → 300 Hz, 0.4 s, 0.12) and the shaker for 0.6 s; plus one coin ding at +0.5 s |
| **Coin ding** | Unchanged recipe. Played at **+0.5 s** after a merge of tier ≥ 5 (the first coin's arrival, 3.8: 450-650 ms), at least 40 ms apart |
| **launchBlocked** | Plays the not-ready sound (3.8 "Not ready / launch refused") |

All other rows (wall thock, launch whoosh, danger tick, UI click, not-ready, ambience) are unchanged.

## A5. 3.9 Sound: new subsection "Music" (insert after the recipe table, before "Haptics")

**Music** (`src/audio/music.js`; fully synthesised, no files).

- **Tempo and key:** 72 BPM, F major, eighth-note grid (8 steps per 4/4 bar), 4-bar phrases.
- **Harmony:** each phrase picks a progression: even phrases (and 30 % of odd ones) use I–vi–IV–V; otherwise one of I–vi–ii–V, I–iii–IV–V, vi–IV–I–V, IV–V–iii–vi, I–IV–vi–V, IV–I–ii–V. 35 % of chords add a colour tone (maj7 on I and IV, add9 otherwise).
- **Pad:** per bar, the chord voiced in MIDI 56-68; each note is a triangle at −7 cents plus a sawtooth at +7 cents, peak 0.05/√(n/3), **1.2 s linear attack**, held to the bar end, then released with τ 0.5 s, so consecutive chords crossfade; through the 1100 Hz pad lowpass.
- **Bass:** triangle, root in octave 2, beat 1 (0.24, τ 0.9) and 60 % of the time beat 3 (root or fifth, 0.15, τ 0.5).
- **Plucks (marimba / steel-pan):** sine partials f, 2f, 3.93f at 0.3·vel × [1, 0.12, 0.16] with τ [0.34, 0.14, 0.035] s, attack 3 ms, random pan ±0.25. One of six arpeggio templates per phrase over the chord tones in F4-C6. **Variation:** each step after the first rests with probability 0.15 (0.4 in the first phrase; 0.45 in a "breathing" phrase, chosen 20 % of the time), odd steps take a pentatonic passing note with probability 0.12, a quiet grace sixteenth with probability 0.07, velocity 0.7 ± 0.12 with +0.18 on beats 1 and 3, timing humanised by up to +8 ms.
- **Shaker:** in 65 % of phrases after the first: noise → highpass 6.5 kHz, 0.05 on off-beats and 0.03 on beats, τ 25 ms, 12 % of hits skipped.
- **Mix:** everything through the 3.2 kHz music lowpass into the music bus (0.09; never above 0.12). Measured offline: music RMS about −38 dBFS against about −18 dBFS for a merge glass.
- **Scheduler:** `setInterval` every 60 ms schedules every step whose time falls within the next 0.4 s on AudioContext time. Generative, so it never repeats as an audible 4-bar loop and has no loop seam. If the timer falls behind (background throttling), it resyncs instead of bursting old notes.
- **When it plays:** only while `music.start()` has been called, the Music setting is on, the context is running (it starts on the first gesture; it is never created outside one), sound is not muted and the document is visible. It fades in with τ 0.9 s and out with τ 0.3 s.
- **Ducking:** the win jingle and the lose sting duck the music to 35 % (τ 0.12 s), then glide back after 2.4 s (τ 0.9 s).

## A6. 3.10 iOS first: "Audio unlock" row (append)

The engine also listens to the context's `statechange`: when it becomes `'suspended'` or `'interrupted'`, the five unlock listeners are re-armed; when it becomes `'running'`, they are removed and the music scheduler is resumed. The silent 1-sample buffer is also played on a gesture while the state is `'interrupted'`.

## A7. 3.5 Overlays: Pause toggles (replace the toggles bullet)

- Toggles (switch rows, 44 px tall, 15 px labels): "Sound", "Music", "Ambience", "Relaxed table" (note under it, 13 px: "applies to the next game"), "Show tier numbers". All persisted.

## A8. 5.1 Files (add)

```
src/audio/music.js            background music generator (3.9 Music): scheduler, pad, bass, plucks, shaker
tests/browser/audio-check.html   renders every recipe and 13.5 s of music through OfflineAudioContext and checks them
tests/browser/audio-check.js     runs it headless (playwright-core) plus a live click-unlock check; --wav <dir> writes WAVs
```

Script order step 5 becomes: `audio/engine`, `audio/sounds`, `audio/music`.

## A9. 5.2 Boot guard (add one line after the `src/audio/sounds.js` line)

```js
  ['src/audio/music.js',   function () { return !!CM.audio.music && f(CM.audio.music.start); }],
```

## A10. 5.3 Config (AUDIO, optional key)

`AUDIO.MUSIC: 0.09` (music bus gain; `music.js` clamps it to ≤ 0.12 and uses 0.09 when the key is missing). No other config change is required.

## A11. 5.4 Data model (Save)

```ts
interface Save { v: 1; best: number; bestTier: number; muted: boolean; ambience: boolean; music: boolean;
                 showNumbers: boolean; relaxed: boolean; wins: number; discovered: number }
```

## A12. 5.5 Public APIs: `CM.audio` (replace the block)

**`CM.audio`** (`src/audio/engine.js`; `consume`, `click`, `notReady`, `glassFreq` in `src/audio/sounds.js`; `music`, `setMusic` in `src/audio/music.js`)
- `init(opts?)`: arms the unlock listeners and the lifecycle handlers (idempotent). `opts = {muted, ambience, music}` (booleans, all optional) applies the saved settings.
- `unlockFromGesture(event)` (alias `unlock`): the synchronous unlock of 3.9/3.10; normally called only by its own listeners.
- `setMuted(b)`, `isMuted()` (alias `muted()`), `setAmbience(b)`, `ambienceEnabled()`
- `ambience(on)`: whether the app wants the waves now (title and play: true; pause: false). The Ambience setting still applies.
- `consume(events, game)`, `click()`, `notReady()`
- `glassFreq(k, d) → Hz` (A3)
- `state() → 'none' | 'suspended' | 'running' | 'interrupted' | 'closed'`
- `music.start()`: the app wants music (call once at boot; it plays from the first gesture on). `music.stop()`: no music (not used by the current flow).
- `music.setEnabled(b)`, `music.enabled() → boolean`: the persisted Music setting. `setMusic(b)` is an alias of `music.setEnabled`.
- `music.playing() → boolean`, `music.duck(depth, seconds)` (used internally by the win/lose stingers).
- Internal, not for app code: `_eng` (engine helpers for sounds.js/music.js), `_sfx` (direct recipe access), `_attachContext(offlineCtx)` and `music._render(t0, seconds)` (offline rendering for the audio check).

## A13. 5.5 `CM.ui.init(handlers)` and 5.7 / app wiring

- `handlers` gains `onToggleMusic`. The Pause "Music" switch calls it; the app flips `save.music`, calls `CM.audio.music.setEnabled(save.music)` and writes the save.
- **BOOT** (after storage): `CM.audio.init({ muted: save.muted, ambience: save.ambience, music: save.music })`, then `CM.audio.music.start()`.
- **TITLE and PLAY:** `CM.audio.ambience(true)`. **PAUSE:** `CM.audio.ambience(false)`. Music keeps playing in every state (it is the bar's background), including PAUSE, WIN and OVER.
- Mute (HUD, M, Pause "Sound") still only calls `CM.audio.setMuted(b)`; music stops while muted and fades back in on unmute.

## A14. 5.9 Persistence (normalizeSave)

- Defaults: `{v:1, best:0, bestTier:1, muted:false, ambience:true, music:true, showNumbers:false, relaxed:true, wins:0, discovered:0}`.
- `muted` and `showNumbers`: booleans, else false. `ambience`, `music` and `relaxed`: booleans, else true.
- `mergeSave`: `music` is a setting, taken from `next`.

Exact diff for `src/game/save.js` (verified: with it and the test diff below, `node tests/run.js` → 105/105):

```diff
--- a/src/game/save.js
+++ b/src/game/save.js
@@ -12,7 +12,7 @@
   var MASK = 0x1FF;   // 9 tiers, bit t-1
 
   function defaults() {
-    return { v: 1, best: 0, bestTier: 1, muted: false, ambience: true, showNumbers: false,
+    return { v: 1, best: 0, bestTier: 1, muted: false, ambience: true, music: true, showNumbers: false,
              relaxed: true, wins: 0, discovered: 0 };
   }
 
@@ -33,6 +33,7 @@
     s.muted = bool(o.muted, false);
     s.showNumbers = bool(o.showNumbers, false);
     s.ambience = bool(o.ambience, true);
+    s.music = bool(o.music, true);
     s.relaxed = bool(o.relaxed, true);
     // 5.9 writes (n >>> 0) & 0x1FF; only non-negative integers count, so a corrupt -1 does not
     // unlock the whole collection (it would become 0x1FF) and garbage gives the default 0.
@@ -51,6 +52,7 @@
       bestTier: Math.max(a.bestTier, b.bestTier),
       muted: b.muted,
       ambience: b.ambience,
+      music: b.music,
       showNumbers: b.showNumbers,
       relaxed: b.relaxed,
       wins: Math.max(a.wins, b.wins),
```

Required test update (test 45 compares the defaults with `deepStrictEqual`, so it FAILS without this):

```diff
--- a/tests/spawn.test.js
+++ b/tests/spawn.test.js
@@ -273,7 +273,7 @@
 test('45 normalizeSave: garbage yields defaults; valid values preserved', function () {
-  var D = { v: 1, best: 0, bestTier: 1, muted: false, ambience: true, showNumbers: false,
+  var D = { v: 1, best: 0, bestTier: 1, muted: false, ambience: true, music: true, showNumbers: false,
             relaxed: true, wins: 0, discovered: 0 };
@@ -292,20 +292,24 @@
   assert.strictEqual(s.ambience, true);
+  assert.strictEqual(s.music, true, 'music defaults to on');
+  assert.strictEqual(save.normalizeSave({ music: false }).music, false);
+  assert.strictEqual(save.normalizeSave({ music: 'no' }).music, true);
   assert.strictEqual(save.normalizeSave(JSON.stringify({ v: 7, best: 50 })).best, 50);
@@ test('46 mergeSave: ...
-    { v: 1, best: 900, bestTier: 6, wins: 2, discovered: 3, muted: false, ambience: true, showNumbers: false, relaxed: true },
-    { v: 1, best: 500, bestTier: 7, wins: 1, discovered: 4, muted: true, ambience: false, showNumbers: true, relaxed: false });
+    { v: 1, best: 900, bestTier: 6, wins: 2, discovered: 3, muted: false, ambience: true, music: true, showNumbers: false, relaxed: true },
+    { v: 1, best: 500, bestTier: 7, wins: 1, discovered: 4, muted: true, ambience: false, music: false, showNumbers: true, relaxed: false });
@@
   assert.strictEqual(m.ambience, false);
+  assert.strictEqual(m.music, false);
```

## A15. 6.2 / 6.3 Tests and QA (append)

- 6.2 (optional browser scripts): `node tests/browser/audio-check.js` renders every recipe and 13.5 s of music through `OfflineAudioContext` and asserts: each sound is audible and below clipping; the merge glass decays (T2) and still rings at 0.5 s (T9); T9 rings lower than T2; a clink is silent after 150 ms; mute silences; the music has no silent half-second, peaks below 0.2 and sits well under a merge; plus a live check that no context exists before a gesture, a real click creates a running context and starts the music, and mute stops / unmute restarts the music scheduler. `--wav <dir>` writes every rendered sound as a WAV for listening.
- 6.3 Audio: "Merges sound like a struck wine glass (a ringing clink), lower for bigger glasses; chains add a sparkle and step up in pitch." "Music: soft, calm, never repeats as an obvious loop; the Pause 'Music' switch turns it off and is remembered; it pauses while muted and while the tab is hidden, and returns after a phone call."
