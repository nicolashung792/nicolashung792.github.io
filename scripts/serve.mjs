import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const port = Number(process.argv[2] ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Usage: node scripts/serve.mjs [port from 1 to 65535]');
  process.exit(1);
}
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function withinRoot(filename) {
  const relative = path.relative(root, filename);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function send(response, method, status, content, type = 'text/plain; charset=utf-8') {
  response.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(content),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(method === 'HEAD' ? undefined : content);
}

const server = http.createServer(async (request, response) => {
  const method = request.method;
  if (method !== 'GET' && method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    send(response, method, 405, 'Method not allowed');
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent((request.url ?? '/').split('?')[0]);
  } catch {
    send(response, method, 400, 'Invalid URL encoding');
    return;
  }
  if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0')) {
    send(response, method, 400, 'Invalid path');
    return;
  }
  const segments = pathname.split('/').filter(Boolean);
  if (segments.some(segment => segment.startsWith('.') || segment === 'node_modules' || segment === 'qa')) {
    send(response, method, 403, 'Forbidden');
    return;
  }
  let filename = path.resolve(root, `.${pathname}`);
  if (!withinRoot(filename)) {
    send(response, method, 403, 'Forbidden');
    return;
  }
  try {
    if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
    filename = await realpath(filename);
    if (!withinRoot(filename)) {
      send(response, method, 403, 'Forbidden');
      return;
    }
    if (!(await stat(filename)).isFile()) throw new Error('Not a file');
    const content = await readFile(filename);
    send(response, method, 200, content, types[path.extname(filename).toLowerCase()] ?? 'application/octet-stream');
  } catch (error) {
    if (error.code && !['ENOENT', 'ENOTDIR'].includes(error.code)) {
      console.error('Unable to serve requested file:', error.code);
      send(response, method, 500, 'Unable to read this file');
      return;
    }
    try {
      const notFound = await realpath(path.join(root, '404.html'));
      if (!withinRoot(notFound)) throw new Error('Invalid 404 path');
      send(response, method, 404, await readFile(notFound), types['.html']);
    } catch {
      send(response, method, 404, 'Page not found');
    }
  }
});

server.on('error', error => {
  console.error(`Preview server failed: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Local preview: http://127.0.0.1:${port}`);
  console.log('Press Ctrl+C to stop. This server is for local review only.');
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
