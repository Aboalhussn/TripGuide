// One process serves the API and the web app. Data lives in a single JSON file.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createApi } from '../core/api';
import { seed } from '../core/seed';
import type { Data, Platform } from '../core/types';

const PORT = Number(process.env.PORT || 3000);
const ROOT = process.cwd();
const DATA_FILE = process.env.DATA_FILE || path.join(ROOT, 'data', 'db.json');
const PUBLIC_DIR = path.join(ROOT, 'dist', 'public');
const MAX_BODY = 3 * 1024 * 1024;

export const nodePlatform: Platform = {
  now: () => new Date(),
  hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 32).toString('hex');
    return `scrypt:${salt}:${hash}`;
  },
  verifyPassword(password, stored) {
    const [kind, salt, hash] = stored.split(':');
    if (kind !== 'scrypt' || !salt || !hash) return false;
    const test = crypto.scryptSync(password, salt, 32);
    return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
  },
  randomToken: () => crypto.randomBytes(24).toString('base64url'),
};

function load(): Data {
  if (process.env.RESET === '1' || !fs.existsSync(DATA_FILE)) {
    const d = seed(nodePlatform);
    save(d);
    console.log(`Created demo data in ${path.relative(ROOT, DATA_FILE)}`);
    return d;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

let timer: NodeJS.Timeout | null = null;
function save(d: Data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d));
  fs.renameSync(tmp, DATA_FILE);
}
function saveSoon(d: Data) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    save(d);
  }, 200);
}

const data = load();
const api = createApi(data, nodePlatform, saveSoon);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function send(res: http.ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(json);
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, pathname: string) {
  const safe = path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  let file = path.join(PUBLIC_DIR, safe);
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 400, { error: 'bad_path' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC_DIR, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(503, { 'content-type': 'text/plain' });
    return res.end('The web app has not been built yet. Run: npm run build');
  }
  const ext = path.extname(file);
  const long = /\.(woff2|jpg|png)$/.test(file) || /assets[/\\]/.test(file);
  res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': long ? 'public, max-age=604800' : 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://local');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);

  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (c: Buffer) => {
    size += c.length;
    if (size > MAX_BODY) {
      send(res, 413, { error: 'too_large' });
      req.destroy();
    } else chunks.push(c);
  });
  req.on('end', () => {
    if (res.headersSent) return;
    let body: unknown = null;
    if (chunks.length) {
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return send(res, 400, { error: 'bad_json' });
      }
    }
    const auth = req.headers.authorization || '';
    const result = api({
      method: req.method || 'GET',
      path: url.pathname.slice(4),
      query: Object.fromEntries(url.searchParams),
      body,
      token: auth.startsWith('Bearer ') ? auth.slice(7) : null,
    });
    send(res, result.status, result.body);
  });
});

server.listen(PORT, () => console.log(`Trip guide is running at http://localhost:${PORT}`));

// Write any pending change before exiting.
for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, () => {
    save(data);
    process.exit(0);
  });
