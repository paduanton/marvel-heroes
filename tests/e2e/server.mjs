import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

// Serve the real compiled SPA without Laravel, credentials or an upstream connection.
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { stdio: 'inherit' });
const buildRoot = resolve('public/build');
const manifest = JSON.parse(await readFile(resolve(buildRoot, 'manifest.json'), 'utf8'));
const entry = manifest['resources/js/main.ts'];
const template = await readFile('resources/views/app.blade.php', 'utf8');
const tags = (entry.css ?? []).map(file => `<link rel="stylesheet" href="/build/${file}">`).join('')
  + `<script type="module" src="/build/${entry.file}"></script>`;
const html = template.replace("@vite('resources/js/main.ts')", tags);
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname.startsWith('/api/')) {
      response.writeHead(501).end('API requests must be mocked by the browser test.');
      return;
    }
    if (pathname.startsWith('/build/')) {
      const path = resolve(buildRoot, decodeURIComponent(pathname.slice('/build/'.length)));
      if (!path.startsWith(buildRoot + sep)) {
        response.writeHead(404).end();
        return;
      }
      const asset = await readFile(path);
      response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream' }).end(asset);
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
  } catch {
    response.writeHead(404).end('Test asset unavailable.');
  }
}).listen(Number(process.env.PLAYWRIGHT_PORT ?? 4173), '127.0.0.1');
