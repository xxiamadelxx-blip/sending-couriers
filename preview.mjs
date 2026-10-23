// Development preview only; Android serves these same offline assets.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const flag = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const root = fileURLToPath(new URL('./web/', import.meta.url));
const types = { '.html':'text/html; charset=utf-8', '.mjs':'text/javascript', '.css':'text/css', '.ttf':'font/ttf' };
createServer(async (request,response) => {
  try {
    const url = new URL(request.url, 'http://preview');
    const pathname = url.pathname;
    if (pathname === '/__preview') {
      const width = url.searchParams.get('width') === '360' ? 360 : 390;
      response.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store' });
      response.end(`<!doctype html><html lang="ru"><title>Доход курьера — предпросмотр ${width}</title><body style="margin:0;background:#07131b"><iframe title="Экран приложения ${width} на 844" src="/" width="${width}" height="844" style="border:0;display:block"></iframe></body></html>`); return;
    }
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root)) throw new Error('Outside web root');
    const body = await readFile(path);
    response.writeHead(200, { 'Content-Type':types[extname(path)] || 'application/octet-stream', 'Cache-Control':'no-store' }); response.end(body);
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(Number(flag('--port', 4173)), flag('--host','0.0.0.0'), () => console.log('Courier Finance preview ready'));
