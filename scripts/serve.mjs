// Minimal static server for dist/ with clean URLs (/about-us/ -> /about-us/index.html).
import http from 'node:http';
import { createReadStream, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT || 3001);

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
};

function resolve(urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  p = path.normalize(p).replace(/^([/\\])+/, '');
  let file = path.join(root, p);
  if (!file.startsWith(root)) return null;
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!existsSync(file) && !path.extname(file)) file = path.join(file, 'index.html');
  return existsSync(file) ? file : null;
}

http
  .createServer((req, res) => {
    const url = req.url || '/';
    // directory URLs without a trailing slash redirect like WordPress does
    const clean = url.split('?')[0];
    if (!path.extname(clean) && !clean.endsWith('/')) {
      res.writeHead(301, { Location: clean + '/' + (url.includes('?') ? url.slice(url.indexOf('?')) : '') });
      return res.end();
    }
    const file = resolve(url);
    if (!file) {
      res.writeHead(404, { 'Content-Type': types['.html'] });
      return createReadStream(path.join(root, '404.html')).pipe(res);
    }
    const stat = statSync(file);
    const type = types[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    if (range && type.startsWith('video/')) {
      const [s, e] = range.replace('bytes=', '').split('-');
      const start = Number(s);
      const end = e ? Number(e) : stat.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      return createReadStream(file, { start, end }).pipe(res);
    }
    // Always revalidate, so a rebuild is picked up on the next reload; unchanged files answer 304.
    const modified = new Date(Math.floor(stat.mtimeMs / 1000) * 1000).toUTCString();
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', 'Last-Modified': modified };
    if (req.headers['if-modified-since'] === modified) {
      res.writeHead(304, headers);
      return res.end();
    }
    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`HatchWorks replica running at http://localhost:${port}/`));
