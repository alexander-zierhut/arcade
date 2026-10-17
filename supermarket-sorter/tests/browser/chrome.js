// tests/browser/chrome.js: finds the system Chrome for playwright-core.
// The browser scripts are optional review/smoke tools; the game itself never needs them.
// Order: env CHROME_PATH (an executable), then playwright's channel 'chrome', then the usual
// install paths. Never downloads a browser.
'use strict';
var fs = require('fs');

var FALLBACK_PATHS = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/opt/google/chrome/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];

var HELP = [
  'Could not start Google Chrome for the browser scripts.',
  'Install Google Chrome, or point CHROME_PATH at a Chrome/Chromium executable, for example:',
  '  CHROME_PATH=/usr/bin/chromium npm run preview',
  'The game itself does not need Chrome; only the optional preview and smoke scripts do.'
].join('\n');

function loadPlaywright() {
  try {
    return require('playwright-core');
  } catch (e) {
    var err = new Error('playwright-core is not installed. Run "npm install" first (it is a dev-only dependency).');
    err.code = 'NO_PLAYWRIGHT';
    throw err;
  }
}

function exists(p) {
  try { return fs.statSync(p).isFile(); } catch (e) { return false; }
}

/**
 * Launches the system Chrome headless. Resolves to a playwright Browser.
 * Rejects with an Error whose message includes HELP (how to set CHROME_PATH) when nothing works.
 */
async function launchChrome(extra) {
  var pw = loadPlaywright();
  var base = Object.assign({ headless: true }, extra || {});
  var tried = [];
  var env = process.env.CHROME_PATH;

  if (env) {
    if (!exists(env)) throw new Error('CHROME_PATH is set to "' + env + '", but that file does not exist.\n' + HELP);
    return pw.chromium.launch(Object.assign({}, base, { executablePath: env }));
  }
  try {
    return await pw.chromium.launch(Object.assign({}, base, { channel: 'chrome' }));
  } catch (e) {
    tried.push("channel 'chrome': " + String(e && e.message || e).split('\n')[0]);
  }
  for (var i = 0; i < FALLBACK_PATHS.length; i++) {
    if (!exists(FALLBACK_PATHS[i])) continue;
    try {
      return await pw.chromium.launch(Object.assign({}, base, { executablePath: FALLBACK_PATHS[i] }));
    } catch (e2) {
      tried.push(FALLBACK_PATHS[i] + ': ' + String(e2 && e2.message || e2).split('\n')[0]);
    }
  }
  throw new Error(HELP + (tried.length ? '\nTried:\n  ' + tried.join('\n  ') : ''));
}

module.exports = { launchChrome: launchChrome, HELP: HELP, FALLBACK_PATHS: FALLBACK_PATHS };
