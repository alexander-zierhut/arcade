// tests/browser/serve.js: a tiny static server for the game folder (file:// blocks some things in Chrome).
// serve(dir) -> Promise<{ url, close }>.
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');

var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain', '.ico': 'image/x-icon' };

function serve(dir) {
  return new Promise(function (resolve) {
    var server = http.createServer(function (req, res) {
      var p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      var f = path.join(dir, p);
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(f).pipe(res);
    });
    server.listen(0, '127.0.0.1', function () {
      resolve({ url: 'http://127.0.0.1:' + server.address().port + '/', close: function () { server.close(); } });
    });
  });
}

module.exports = { serve: serve };
