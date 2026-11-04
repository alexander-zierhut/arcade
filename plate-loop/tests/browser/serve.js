// tests/browser/serve.js: a tiny static http server for the game folder (the browser suite's only server).
// serve(dir) -> Promise<{ url, close }>. Follows symlinks (the game's `shared` folder is one), listens on a free
// port of 127.0.0.1, never serves anything outside dir (a lexical check on the normalised path), no caching.
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');

var TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2'
};

function serve(dir) {
  var root = path.resolve(dir);
  var server = http.createServer(function (req, res) {
    var pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { pathname = null; }
    function fail(code, msg) { res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); res.end(msg); }
    if (pathname === null || pathname.indexOf('\0') >= 0) return fail(400, 'bad request');
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405, 'method not allowed');
    var file = path.normalize(path.join(root, pathname));
    if (file !== root && file.indexOf(root + path.sep) !== 0) return fail(403, 'forbidden');
    fs.stat(file, function (err, st) {                       // fs.stat follows symlinks
      if (!err && st.isDirectory()) { file = path.join(file, 'index.html'); fs.stat(file, next); } else next(err, st);
      function next(e, s) {
        if (e || !s.isFile()) return fail(404, 'not found: ' + pathname);
        res.writeHead(200, {
          'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'content-length': s.size, 'cache-control': 'no-store'
        });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(file).on('error', function () { res.destroy(); }).pipe(res);
      }
    });
  });
  return new Promise(function (resolve, reject) {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', function () {
      var port = server.address().port;
      resolve({
        url: 'http://127.0.0.1:' + port + '/',
        close: function () { return new Promise(function (r) { server.close(function () { r(); }); if (server.closeAllConnections) server.closeAllConnections(); }); }
      });
    });
  });
}

module.exports = { serve: serve, TYPES: TYPES };
