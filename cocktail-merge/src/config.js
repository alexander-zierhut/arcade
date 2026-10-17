// src/config.js: every gameplay, view, FX, audio and app constant (DESIGN 5.3). PURE.
// The whole object is deep-frozen. Game code never mutates it; createGame resolves a
// per-game `rules` object from TABLE + PHYS + RULES, then MODES[mode], then overrides (2.13).
(function (root, factory) {
  'use strict';
  var isNode = typeof module === 'object' && module && module.exports;
  var api = factory({});
  if (isNode) module.exports = api;
  else { root.CM = root.CM || {}; root.CM.config = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';
  /* @pure-begin */
  var DEDICATION_FALLBACK = 'For you, with love.';

  // src/dedication.js defines the global CM_DEDICATION (5.2). It is read defensively:
  // a missing file, a syntax error in it or an empty text all fall back.
  function readDedication() {
    var d;
    try { d = (typeof CM_DEDICATION === 'string') ? CM_DEDICATION.trim() : ''; } catch (e) { d = ''; }
    return d ? d : DEDICATION_FALLBACK;
  }

  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
    }
    return o;
  }

  var DT = 1 / 240;   // the one fixed step: PHYS.DT and LOOP.DT are the same value

  var config = {
    GAME_TITLE: 'Cocktail Merge',
    GAME_SUBTITLE: 'Beach Bar',
    DEDICATION: readDedication(),
    DEDICATION_FALLBACK: DEDICATION_FALLBACK,
    STORAGE_KEY: 'cocktailMerge.v1',
    RUN_KEY: 'cocktailMerge.v1.run',
    RULES_VERSION: 2,

    // 2.1: table units. y = 0 is the far edge (the pull points there), y = 160 the near edge.
    TABLE: { W: 100, L: 160, DANGER_Y: 130, LAUNCH_Y: 144, FRAME: 5 },

    // 2.3 / 2.4: integration and the PBD solver.
    PHYS: {
      DT: DT, ITER: 10, GROW_ITER: 100, PULL: 120, DRAG: 0.8, FRICTION: 20, VMAX: 260, V0: 150,
      E_GLASS: 0.22, E_WALL: 0.30, REST_V: 18, TAN_DAMP: 0.10, MAX_CORR: 0.5,
      IMPACT_V: 18, IMPACT_NEW_TICKS: 12, CONTACT_POOL: 2048, MAX_ID: 1048576
    },

    // 2.1b tick constants and the rules of 2.6-2.12.
    RULES: {
      TOUCH_EPS: 0.5, MERGE_IMMUNE_TICKS: 24, GROW_TICKS: 29, MERGE_VEL_KEEP: 0.5,
      SHOVE_V: 40, SHOVE_PAD: 6, R0_MIN: 0.6, CHAIN_WINDOW_TICKS: 240, COOLDOWN_TICKS: 96, BUFFER_TICKS: 36,
      GRACE_TICKS: 600, DECAY: 2, ELIGIBLE_AGE_TICKS: 288, THREAT_DIST: 5, THREAT_HOLD_TICKS: 120,
      DANGER_TICK_EVERY: 120, WIN_SUSPEND_TICKS: 720,
      WIN_BONUS: 1000, JUG_BURST: 1000, MULT_STEP: 0.5, MULT_MAX: 4, RADIUS_SCALE: 1,
      BOMB_RADIUS: 16.5, BOMB_MAX: 3, BOMB_POINTS_PER_TIER: 5   // owner: a jug burst earns a bomb; blast diameter = a third of the table width
    },

    // 2.13: keys here override TABLE / RULES keys of the same name.
    MODES: {
      standard: { DANGER_Y: 120, GRACE_TICKS: 480, STAGE_SHIFT: 1 },   // harder: closer line, 2 s grace, bigger spawns earlier
      relaxed: { DANGER_Y: 133, GRACE_TICKS: 960, RADIUS_SCALE: 1 }   // RADIUS_SCALE set by the tuning gate (DESIGN 8 step 2, Appendix 9; rev 4)
    },

    // 2.7
    // 2.7 spawn. WEIGHTS has 6 entries indexed by tier (w[0] = 0); tiers 1-4 unlock progressively up to
    // highestTier (MIN_CAP..4). STAGES (owner decision, progressive difficulty): once highestTier reaches
    // `from`, that stage's weights replace WEIGHTS, which is how the tier-5 glass enters the launcher.
    SPAWN: {
      OPENING: 2, WEIGHTS: [0, 40, 30, 20, 10, 0], MIN_CAP: 2, MAX_TIER: 5, T1_DROUGHT: 7, MAX_REPEAT: 3, HISTORY: 8,
      STAGES: [
        { from: 5, weights: [0, 34, 28, 22, 16, 0] },
        { from: 6, weights: [0, 26, 25, 23, 18, 8] },
        { from: 7, weights: [0, 18, 21, 23, 22, 16] },
        { from: 8, weights: [0, 12, 16, 22, 25, 25] }
      ]
    },

    // 2.5: Standard radii; Relaxed uses radius * RADIUS_SCALE for tiers >= 2 (T1 stays 6.0).
    TIERS: [
      null,
      { id: 1, key: 'shot', name: 'Tequila Shot', radius: 5.2, points: 0, color: '#F5C542' },
      { id: 2, key: 'oldfashioned', name: 'Old Fashioned', radius: 5.92, points: 10, color: '#B3561C' },
      { id: 3, key: 'cosmo', name: 'Cosmopolitan', radius: 7.2, points: 30, color: '#FF5C8A' },
      { id: 4, key: 'mojito', name: 'Mojito', radius: 8.48, points: 60, color: '#4CC97A' },
      { id: 5, key: 'margarita', name: 'Margarita', radius: 9.92, points: 100, color: '#C6E05A' },
      { id: 6, key: 'sunrise', name: 'Tequila Sunrise', radius: 11.52, points: 150, color: '#FF4F2E' },
      { id: 7, key: 'pinacolada', name: 'Piña Colada', radius: 13.28, points: 210, color: '#2EB5A8' },
      { id: 8, key: 'coconut', name: 'Coconut Cocktail', radius: 15.2, points: 280, color: '#9B5DE5' },
      { id: 9, key: 'sangria', name: 'Sangria Verde', radius: 17.6, points: 360, color: '#0F8A5F', accent: '#FFD23F' }
    ],

    // 3.1 / 3.2 projection and layout.
    VIEW: {
      S_FAR: 0.72, TABLE_FILL: 0.96, C_NEAR_MIN: 0.85, C_NEAR_MAX: 0.98, STAGE_ASPECT: 0.62,
      FAR_MIN_FRAC: 0.27, HEADROOM: 0.12, PORTRAIT_BLOCK_VH: 500, DPR_MAX: 2, K_BASE: 0.55, K_RIM: 0.42
    },

    // 3.8 animation catalogue (render-only). Times in ms unless named otherwise; px values are px*uiK.
    FX: {
      IDLE_PULSE: 0.02, IDLE_HZ: 1.2,
      AIM_SMOOTH: 25,
      CHEVRON_Y: 158, CHEVRON_PX: 10,
      LAUNCH_BLEND_MS: 60, LAUNCH_SQUASH: -0.12,
      COOLDOWN_RING_PX: 2, COOLDOWN_RING_ALPHA: 0.7,
      NOT_READY_SHAKE_PX: 4, NOT_READY_CYCLES: 3, NOT_READY_MS: 180, NOT_READY_COLOR: '#FFB347',
      BLOCKER_BLINKS: 2, BLINK_MS: 150,
      NEXT_FLY_DELAY_MS: 120, NEXT_FLY_MS: 260, NEXT_FLY_ARC: 0.2, NEXT_FLY_SCALE0: 0.6,
      NEXT_APPEAR_MS: 240, NEXT_APPEAR_SCALE0: 0.5,
      SQUASH_VN: 20, SQUASH_MAX: 0.10, SQUASH_DIV: 700, SQUASH_K: 420, SQUASH_DAMP: 16,
      WOBBLE_VN: 30, WOBBLE_MAX: 0.12, WOBBLE_V0: 18, WOBBLE_DIV: 400, WOBBLE_TAU: 0.18, WOBBLE_HZ: 5,
      GHOST_MS: 90, GHOST_SCALE: 0.7,
      POP_START: 0.55, POP_PEAK: 1.18, POP_UP_MS: 110, POP_END_MS: 260,
      FLASH_ALPHA: 0.85, FLASH_MS: 140,
      RING_SCALE: 2.1, RING_W0: 5, RING_W1: 1, RING_ALPHA: 0.9, RING_MS: 380, RING2_DELAY_MS: 80, RING2_MIN_TIER: 6,
      PARTICLES_BASE: 8, PARTICLES_PER_TIER: 2, PARTICLES_MAX: 26, PARTICLE_POOL: 256,
      PARTICLE_SPEED_MIN: 80, PARTICLE_SPEED_MAX: 220, PARTICLE_DRAG: 3,
      PARTICLE_SIZE_MIN: 2, PARTICLE_SIZE_MAX: 5, PARTICLE_LIFE_MIN: 450, PARTICLE_LIFE_MAX: 700,
      PARTICLE_FADE: 0.4, PARTICLE_SPIN: 6,
      FLOATER_MIN_PX: 13, FLOATER_PX: 16, FLOATER_FILL: '#FFE07A', FLOATER_STROKE: '#6B3A0A', FLOATER_STROKE_PX: 3,
      FLOATER_RISE: 36, FLOATER_MS: 800, FLOATER_FADE_MS: 300,
      CHAIN_WORDS: [null, null, null, 'Cheers!', 'Tasty!', 'Smooth!', 'On fire!', 'Legendary!'],
      CHAIN_PX0: 18, CHAIN_PX_PER_DEPTH: 3, CHAIN_PX_MAX: 34, CHAIN_GRAD0: '#FFD23F', CHAIN_GRAD1: '#FF7B1C',
      CHAIN_STROKE: '#7A3A00', CHAIN_STROKE_PX: 4, CHAIN_POP_MS: 250, CHAIN_RISE: 30, CHAIN_MS: 900,
      FIESTA_PX: 34, FIESTA_CONFETTI: 80, FIESTA_GHOST_MS: 250,
      COIN_FLY_MIN_TIER: 5, COIN_FLY_MAX: 6, COIN_STAGGER_MS: 60, COIN_FLY_MIN_MS: 450, COIN_FLY_MAX_MS: 650,
      COUNTER_TWEEN_MS: 450, COIN_SPIN_MS: 300, PILL_BUMP: 1.12, PILL_BUMP_MS: 180,
      SHAKE_BY_TIER: [0, 0, 0, 0, 0, 0, 2, 3.5, 5, 8], SHAKE_MAX: 9, SHAKE_TAU: 0.12,
      HIT_STOP_MS: [0, 0, 0, 0, 0, 0, 0, 50, 70, 0],
      RAYS: 8, RAYS_COLOR: 'rgba(255,240,180,0.35)', RAYS_SPIN: 0.8, RAYS_MS: 600, RAYS_SCALE0: 0.5, RAYS_SCALE1: 1.4,
      RAYS_WIN_A: 'rgba(255,210,63,0.40)', RAYS_WIN_B: 'rgba(95,208,138,0.30)',
      DISCOVER_POP_MS: 400, DISCOVER_SHINE_MS: 500, DISCOVER_NEW_MS: 1200, DISCOVER_SPARKLES: 6,
      LINE0_ALPHA: 0.75, LINE1_COLOR: '#FFB347', LINE1_ALPHA: 0.9, LINE2_COLOR: '#FF4D4D', LINE2_HZ: 4,
      LINE2_W0: 2, LINE2_W1: 4, VIGNETTE_ALPHA: 0.35, OVER_BLINK_ALPHA: 0.5, OVER_BLINK_HZ: 4, FUSE_PX: 4,
      AURA_COLOR: '#FFD23F', AURA_ALPHA: 0.35, AURA_SCALE: 1.4, AURA_PULSE: 0.06, AURA_HZ: 1,
      SPARKLE_PERIOD_S: 1.5, SPARKLE_OFFSET_S: 0.75,
      LIGHTS_MIN: 0.75, LIGHTS_HZ: 0.7, PALM_SWAY_DEG: 2, PALM_HZ: 0.25, CLOUD_PX_S: 3,
      FOAM_AMP: 0.004, FOAM_WAVE: 0.18, FOAM_SPEED: 0.3, SEA_SPARKLES: 12,
      WIN_FLASH: 'rgb(255,246,200)', WIN_FLASH_ALPHA: 0.35, WIN_FLASH_MS: 120, WIN_SLOWMO: 0.25,
      WIN_SLOWMO_IN_MS: 100, WIN_SLOWMO_OUT_MS: 900, WIN_ZOOM: 1.10, WIN_ZOOM_MS: 600, WIN_MENU_MS: 1600,
      WIN_CONFETTI: 140, WIN_PALETTE: ['#0F8A5F', '#5FD08A', '#FFD23F', '#FFE98A', '#FFFFFF'],
      WIN_PALETTE_WEIGHTS: [30, 20, 30, 10, 10],
      CONFETTI_SPEED_MIN: 600, CONFETTI_SPEED_MAX: 1100, CONFETTI_GRAVITY: 900, CONFETTI_DRAG: 0.6,
      CONFETTI_SPIN: 8, CONFETTI_LIFE_MS: 2500,
      LOSE_SHAKE_PX: 5, LOSE_SHAKE_MS: 400, LOSE_DIM: 'rgba(40,20,10,0.35)', LOSE_DIM_MS: 600, LOSE_MENU_MS: 1400,
      UNZOOM_MS: 400
    },

    // 3.9 sound.
    AUDIO: {
      MASTER: 0.9, AMBIENCE: 0.12, MAX_VOICES: 12, CLINKS_PER_SEC: 12, CLINK_F0: 2600, CLINK_LOWPASS: 7000,
      SCALE: [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51, 1567.98,
              1760.00, 2093.00, 2349.32, 2637.02, 2793.83, 3135.96],
      SFX_BUS: 1.0, PAN_WIDTH: 0.6, MUTE_TAU: 0.02,
      COMP_THRESHOLD: -14, COMP_KNEE: 10, COMP_RATIO: 3.5, COMP_ATTACK: 0.003, COMP_RELEASE: 0.12,
      CLINK_LOWPASS_Q: 0.7, CLINKS_PER_FRAME: 3, CLINK_PAIR_MS: 80, CLINK_QUIET: 0.15, CLINK_QUIET_GAP_MS: 30,
      CLINK_MIN_GAIN: 0.02, VOICE_DROP_GAIN: 0.03, COIN_DING_GAP_MS: 40, NOISE_SECONDS: 1,
      MUSIC: 0.11,                      // music bus gain (docs/amendments/audio.md); music.js caps it at 0.12
      MERGE_GAIN: 0.55,                 // scales the merge glass sound (owner: merges were too loud vs bumps + music)
      // Phones (pointer: coarse): a lighter mix so the audio thread never underruns (owner: music stuttered when
      // several sounds played at once). Bigger output buffer, fewer simultaneous voices, fewer partials per glass.
      LITE_MAX_VOICES: 7, LITE_CLINKS_PER_SEC: 6, LITE_CLINKS_PER_FRAME: 2, LITE_PARTIALS: 3,
      MUSIC_LOOKAHEAD_S: 1.5, MUSIC_PUMP_MS: 150
    },

    // 5.7 / 5.9 / 3.5 app timing.
    // Optional picture overrides (assets/tier-N.png, 4.3): off by default so the page never probes nine missing
    // files (each a 404 in the log and up to 1.5 s of boot wait). Set true after adding the PNGs.
    PNG_OVERRIDES: false,
    APP: { INPUT_GUARD_MS: 250, RUN_SAVE_EVERY_MS: 10000, ATTRACT_RESET_TICKS: 43200, ARM_MS: 2000 },

    // Background scenes (owner item 6; docs/amendments/backgrounds-config.md). Read by src/art/backgrounds.js,
    // which inlines the same list as DEFAULT_LIST (keep both in sync; config wins).
    BACKGROUNDS: {
      HORIZON_AT: 0.55, ZOOM_MAX: 1.25, PAD: 4, SWAY_S: 14, SEAM: 0.06,
      scenes: [
        { key: 'beach-bar', file: 'assets/backgrounds/craftpix-beach-bar.png', w: 1920, h: 1080,
          horizonFrac: 0.524, anchorX: 0.3, ground: ['#F1F2BC', '#DCDB9E'], haze: [255, 251, 236, 0.16],
          credit: 'Beach 2D Backgrounds by CraftPix.net (craftpix.net), OGA-BY 3.0',
          layers: [
            { file: 'assets/backgrounds/beach-bar-layers/sky.png', top: 0, bottom: 1, speed: 0, sway: 0 },
            { file: 'assets/backgrounds/beach-bar-layers/cloud.png', top: 0.06, bottom: 0.47, speed: 4, sway: 0 },
            { file: 'assets/backgrounds/beach-bar-layers/sea.png', top: 0.38, bottom: 1, speed: 0, sway: 1.5 },
            { file: 'assets/backgrounds/beach-bar-layers/land.png', top: 0.69, bottom: 1, speed: 0, sway: 0 },
            { file: 'assets/backgrounds/beach-bar-layers/decor.png', top: 0.31, bottom: 1, speed: 0, sway: 0 }
          ] },
        { key: 'palms-parasol', file: 'assets/backgrounds/craftpix-palms-parasol.png', w: 1920, h: 1080,
          horizonFrac: 0.487, anchorX: 0.47, ground: ['#FFD91C', '#F2C200'], haze: [255, 250, 230, 0.18],
          credit: 'Beach 2D Backgrounds by CraftPix.net (craftpix.net), OGA-BY 3.0' },
        { key: 'island-sailboat', file: 'assets/backgrounds/craftpix-island-sailboat.png', w: 1920, h: 1080,
          horizonFrac: 0.451, anchorX: 0.4, ground: ['#FEE883', '#EBD06A'], haze: [255, 252, 240, 0.14],
          credit: 'Beach 2D Backgrounds by CraftPix.net (craftpix.net), OGA-BY 3.0' },
        { key: 'sunset', file: 'assets/backgrounds/craftpix-sunset.png', w: 1920, h: 1080,
          horizonFrac: 0.470, anchorX: 0.47, ground: ['#1F1915', '#2E241D'], haze: [255, 196, 120, 0.10],
          credit: 'Beach 2D Backgrounds by CraftPix.net (craftpix.net), OGA-BY 3.0' },
        { key: 'day-beach', file: 'assets/backgrounds/spriteattack-day-beach.png', w: 3000, h: 2000,
          horizonFrac: 0.518, anchorX: 0.42, ground: ['#F6E46C', '#E2CC52'], haze: [255, 252, 238, 0.16],
          credit: '' },
        // the owner's own cartoon scenes (2026-10-03)
        { key: 'sunflowers', file: 'assets/backgrounds/sunflower-sunset.jpg', w: 1536, h: 1024,
          horizonFrac: 0.46, anchorX: 0.5, ground: ['#A9D64A', '#86BD3C'], haze: [255, 236, 190, 0.14], credit: '' },
        { key: 'bruecke', file: 'assets/backgrounds/muengstener-bruecke.jpg', w: 1536, h: 1024,
          horizonFrac: 0.50, anchorX: 0.5, ground: ['#9CD24A', '#7FB838'], haze: [235, 250, 220, 0.10], credit: '' },
        { key: 'schwebebahn', file: 'assets/backgrounds/schwebebahn-wuppertal.jpg', w: 1536, h: 1024,
          horizonFrac: 0.62, anchorX: 0.45, ground: ['#7FBF3A', '#5FA32C'], haze: [230, 248, 215, 0.10], credit: '' }
      ]
    },

    // 5.8 fixed-timestep loop (an addition to the 5.3 shape). DT is PHYS.DT by construction.
    LOOP: { DT: DT, MAX_FRAME: 0.1, MAX_STEPS: 24 }
  };

  /* @pure-end */
  return deepFreeze(config);
});
