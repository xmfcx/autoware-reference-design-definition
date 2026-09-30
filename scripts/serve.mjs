import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const publicDirectory = path.resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8' };

export function createPresentationServer() {
  return http.createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const filename = path.resolve(publicDirectory, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!filename.startsWith(`${publicDirectory}${path.sep}`) && filename !== path.join(publicDirectory, 'index.html')) throw new Error('Not found');
      const info = await stat(filename);
      if (!info.isFile()) throw new Error('Not found');
      const headers = { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Content-Length': info.size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' };
      if (path.extname(filename) === '.pdf') headers['Content-Disposition'] = 'attachment; filename="autoware-reference-design.pdf"';
      response.writeHead(200, headers);
      response.end(request.method === 'HEAD' ? undefined : await readFile(filename));
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  const server = createPresentationServer();
  server.listen(port, '127.0.0.1', () => console.log(`Presentation: http://localhost:${port}`));
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
}
