// tests/browser/audio-check.js: runs tests/browser/audio-check.html in headless Chrome
// (playwright-core) and exits 1 on any failed check, console error or page error.
// Usage: node tests/browser/audio-check.js [--wav <dir>]
//   --wav <dir>  also writes every rendered sound as a 16-bit stereo WAV into <dir> for listening.
'use strict';
var fs = require('fs');
var path = require('path');
var url = require('url');
var chrome = require('./chrome.js');

function wav(ch, rate) {
  var n = ch[0].length, data = Buffer.alloc(44 + n * 4);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 4, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(n * 4, 40);
  for (var i = 0; i < n; i++) {
    for (var c = 0; c < 2; c++) {
      var s = Math.max(-1, Math.min(1, ch[c][i]));
      data.writeInt16LE(Math.round(s * 32767), 44 + i * 4 + c * 2);
    }
  }
  return data;
}

async function main() {
  var wavDir = null, ai = process.argv.indexOf('--wav');
  if (ai > 0) wavDir = path.resolve(process.argv[ai + 1] || '.');
  var browser = await chrome.launchChrome();
  var errors = [];
  try {
    var page = await browser.newPage();
    page.on('console', function (m) { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
    page.on('pageerror', function (e) { errors.push('pageerror: ' + (e && e.stack || e)); });
    await page.goto(url.pathToFileURL(path.join(__dirname, 'audio-check.html')).href);
    await page.waitForFunction(function () { return window.__audioCheck && window.__audioCheck.done; }, null, { timeout: 60000 });
    var res = await page.evaluate(function () { return window.__audioCheck; });
    res.results.forEach(function (r) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.info ? '  [' + r.info + ']' : '')); });
    if (wavDir) {
      fs.mkdirSync(wavDir, { recursive: true });
      var names = await page.evaluate(function () { return Object.keys(window.__audioBuffers); });
      for (var i = 0; i < names.length; i++) {
        var ch = await page.evaluate(function (n) {
          var b = window.__audioBuffers[n];
          return [Array.from(b.getChannelData(0)), Array.from(b.getChannelData(b.numberOfChannels > 1 ? 1 : 0))];
        }, names[i]);
        var file = path.join(wavDir, names[i].replace(/[^a-z0-9]+/gi, '-') + '.wav');
        fs.writeFileSync(file, wav(ch, 44100));
      }
      console.log('WAVs written to ' + wavDir);
    }
    // Live unlock: a real click must create and run the context and start the music;
    // muting must stop the music scheduler; unmuting restarts it.
    var live = await browser.newPage();
    live.on('pageerror', function (e) { errors.push('live pageerror: ' + (e && e.stack || e)); });
    live.on('console', function (m) { if (m.type() === 'error' || m.type() === 'warning') errors.push('live ' + m.type() + ': ' + m.text()); });
    await live.goto(url.pathToFileURL(path.join(__dirname, 'audio-check.html')).href + '?live');
    var before = await live.evaluate(function () { return window.__live(); });
    await live.mouse.click(200, 200);
    await live.waitForTimeout(600);
    var after = await live.evaluate(function () { return window.__live(); });
    await live.evaluate(function () { CM.audio.setMuted(true); });
    await live.waitForTimeout(200);
    var mutedState = await live.evaluate(function () { return window.__live(); });
    await live.evaluate(function () { CM.audio.setMuted(false); CM.audio.consume([{ type: 'merge', tier: 4, depth: 1, x: 50 }], null); });
    await live.waitForTimeout(200);
    var unmuted = await live.evaluate(function () { return window.__live(); });
    var liveChecks = [
      ['no context before the gesture', before.state === 'none', before.state],
      ['context running after a click', after.state === 'running', after.state],
      ['music playing after the unlock', after.music === true, String(after.music)],
      ['muting stops the music scheduler', mutedState.music === false, String(mutedState.music)],
      ['unmuting restarts it', unmuted.music === true, String(unmuted.music)]
    ];
    liveChecks.forEach(function (c) {
      console.log((c[1] ? 'PASS ' : 'FAIL ') + 'live: ' + c[0] + '  [' + c[2] + ']');
      if (!c[1]) res.ok = false;
    });
    errors.forEach(function (e) { console.log('CONSOLE ' + e); });
    var ok = res.ok && errors.length === 0;
    console.log(ok ? 'audio-check: OK' : 'audio-check: FAILED');
    process.exitCode = ok ? 0 : 1;
  } finally {
    await browser.close();
  }
}

main().catch(function (e) { console.error(e && e.message || e); process.exitCode = 1; });
