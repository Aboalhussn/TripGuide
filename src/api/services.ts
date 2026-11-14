// The outside world behind small interfaces, so tests can swap each one: time, SMS, media storage, rate limits.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './config';

// ---------- time ----------
// One clock for the whole API (like Platform.now in the engine). Tests move it forward.
export interface Clock { now(): Date }
export const systemClock: Clock = { now: () => new Date() };
export function testClock(start: Date) {
  let t = start.getTime();
  return { now: () => new Date(t), advance: (hours: number) => void (t += hours * 3600_000), set: (d: Date) => void (t = d.getTime()) };
}

// ---------- SMS ----------
export interface SmsSender { name: string; send(to: string, text: string): Promise<void> }
// Development and tests: the message goes to the log (and is kept in memory for tests). No SMS is sent.
export function logSms(log: (msg: string) => void = () => {}): SmsSender & { sent: { to: string; text: string }[] } {
  const sent: { to: string; text: string }[] = [];
  return {
    name: 'log',
    sent,
    async send(to, text) {
      sent.push({ to, text });
      if (sent.length > 200) sent.shift();
      log(`SMS to ${to}: ${text}`);
    },
  };
}
// TODO(provider): the production SMS provider (must deliver internationally) goes here once it is chosen.
// It only needs to implement SmsSender.send(to: E.164 number, text) with the provider's credentials from the environment.

// ---------- media ----------
export interface MediaStore {
  put(key: string, bytes: Buffer, contentType: string, isPrivate: boolean): Promise<void>;
  publicUrl(key: string): string;
  signedUrl(key: string, seconds: number, now: Date): Promise<string>;
  // Disk and memory stores are served by the API itself.
  read?(key: string): Promise<{ bytes: Buffer; contentType: string } | null>;
  checkSignature?(key: string, exp: string, sig: string, now: Date): boolean;
}

const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml' };
const extOf = (type: string) => Object.entries(TYPES).find(([, t]) => t === type)?.[0] || 'bin';

function localStore(cfg: Config, files: { get(k: string): Buffer | null; set(k: string, b: Buffer): void }): MediaStore {
  const sign = (key: string, exp: string) => crypto.createHmac('sha256', cfg.TOKEN_SECRET).update(key + '\n' + exp).digest('base64url');
  return {
    async put(key, bytes) {
      files.set(key, bytes);
    },
    publicUrl: (key) => `${cfg.PUBLIC_URL}/media/${key}`,
    async signedUrl(key, seconds, now) {
      const exp = String(Math.floor(now.getTime() / 1000) + seconds);
      return `${cfg.PUBLIC_URL}/media/${key}?exp=${exp}&sig=${sign(key, exp)}`;
    },
    async read(key) {
      const bytes = files.get(key);
      return bytes ? { bytes, contentType: TYPES[key.split('.').pop() || ''] || 'application/octet-stream' } : null;
    },
    checkSignature(key, exp, sig, now) {
      const want = sign(key, exp);
      return Number(exp) * 1000 >= now.getTime() && sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
    },
  };
}

export function memoryStore(cfg: Config): MediaStore {
  const m = new Map<string, Buffer>();
  return localStore(cfg, { get: (k) => m.get(k) || null, set: (k, b) => void m.set(k, b) });
}

export function diskStore(cfg: Config): MediaStore {
  const root = path.resolve(cfg.MEDIA_DIR);
  const file = (k: string) => {
    const f = path.resolve(root, k);
    if (!f.startsWith(root + path.sep)) throw new Error('bad media key');
    return f;
  };
  return localStore(cfg, {
    get: (k) => (fs.existsSync(file(k)) ? fs.readFileSync(file(k)) : null),
    set: (k, b) => {
      fs.mkdirSync(path.dirname(file(k)), { recursive: true });
      fs.writeFileSync(file(k), b);
    },
  });
}

// Any S3-compatible storage (AWS S3, MinIO, Cloudflare R2…). Public photos and private ID photos live in separate buckets.
export async function s3Store(cfg: Config): Promise<MediaStore> {
  const { S3Client, PutObjectCommand, GetObjectCommand, CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  if (!cfg.S3_BUCKET || !cfg.S3_PRIVATE_BUCKET) throw new Error('S3_BUCKET and S3_PRIVATE_BUCKET must be set when MEDIA_DRIVER=s3.');
  const client = new S3Client({
    region: cfg.S3_REGION,
    endpoint: cfg.S3_ENDPOINT || undefined,
    forcePathStyle: cfg.S3_FORCE_PATH_STYLE,
    credentials: cfg.S3_ACCESS_KEY_ID ? { accessKeyId: cfg.S3_ACCESS_KEY_ID, secretAccessKey: cfg.S3_SECRET_ACCESS_KEY } : undefined,
  });
  if (cfg.S3_CREATE_BUCKETS) {
    for (const Bucket of [cfg.S3_BUCKET, cfg.S3_PRIVATE_BUCKET]) {
      for (let i = 0; ; i++) {
        try {
          await client.send(new HeadBucketCommand({ Bucket })).catch(() => client.send(new CreateBucketCommand({ Bucket })));
          break;
        } catch (e) {
          if (i >= 20) throw e; // the storage may still be starting
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }
    const Policy = JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { AWS: ['*'] }, Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${cfg.S3_BUCKET}/*`] }] });
    await client.send(new PutBucketPolicyCommand({ Bucket: cfg.S3_BUCKET, Policy }));
  }
  // Signed links are opened by the state's browser, which may reach the storage at another address than this server does.
  const signer = cfg.S3_BROWSER_ENDPOINT && cfg.S3_BROWSER_ENDPOINT !== cfg.S3_ENDPOINT ? new S3Client({ region: cfg.S3_REGION, endpoint: cfg.S3_BROWSER_ENDPOINT, forcePathStyle: cfg.S3_FORCE_PATH_STYLE, credentials: cfg.S3_ACCESS_KEY_ID ? { accessKeyId: cfg.S3_ACCESS_KEY_ID, secretAccessKey: cfg.S3_SECRET_ACCESS_KEY } : undefined }) : client;
  const base = (cfg.S3_PUBLIC_URL || `${cfg.S3_ENDPOINT}/${cfg.S3_BUCKET}`).replace(/\/+$/, '');
  return {
    async put(key, bytes, contentType, isPrivate) {
      await client.send(new PutObjectCommand({ Bucket: isPrivate ? cfg.S3_PRIVATE_BUCKET : cfg.S3_BUCKET, Key: key, Body: bytes, ContentType: contentType, CacheControl: isPrivate ? 'private, no-store' : 'public, max-age=31536000, immutable' }));
    },
    publicUrl: (key) => `${base}/${key}`,
    signedUrl: (key, seconds) => getSignedUrl(signer, new GetObjectCommand({ Bucket: cfg.S3_PRIVATE_BUCKET, Key: key }), { expiresIn: seconds }),
  };
}

export async function mediaStoreFor(cfg: Config): Promise<MediaStore> {
  return cfg.MEDIA_DRIVER === 's3' ? s3Store(cfg) : cfg.MEDIA_DRIVER === 'memory' ? memoryStore(cfg) : diskStore(cfg);
}

// A data URL (what the app sends) as bytes. Returns null when it is not one.
export function decodeDataUrl(dataUrl: string): { bytes: Buffer; contentType: string; ext: string } | null {
  const m = /^data:(image\/[a-z+]+)(;base64|;utf8)?,/.exec(dataUrl);
  if (!m) return null;
  const body = dataUrl.slice(m[0].length);
  const bytes = m[2] === ';base64' ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body), 'utf8');
  return { bytes, contentType: m[1], ext: extOf(m[1]) };
}
export const newMediaKey = (kind: string, ext: string) => `${kind}/${crypto.randomBytes(16).toString('hex')}.${ext}`;

// ---------- rate limits ----------
export interface RateLimiter {
  // Counts one hit; false when the limit for this window is already used up.
  hit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
  // How many hits are counted now (without adding one).
  count(key: string): Promise<number>;
  clear(key: string): Promise<void>;
}

export function memoryLimiter(clock: Clock): RateLimiter {
  const m = new Map<string, { n: number; until: number }>();
  const live = (key: string) => {
    const e = m.get(key);
    if (e && e.until <= clock.now().getTime()) m.delete(key);
    return m.get(key);
  };
  return {
    async hit(key, limit, windowSeconds) {
      const e = live(key) || { n: 0, until: clock.now().getTime() + windowSeconds * 1000 };
      e.n += 1;
      m.set(key, e);
      if (m.size > 50_000) for (const k of m.keys()) live(k);
      return e.n <= limit;
    },
    count: async (key) => live(key)?.n || 0,
    clear: async (key) => void m.delete(key),
  };
}

export async function redisLimiter(url: string): Promise<RateLimiter & { ping(): Promise<void>; close(): Promise<void> }> {
  const { default: Redis } = await import('ioredis');
  const redis = new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: true });
  await redis.connect();
  return {
    async hit(key, limit, windowSeconds) {
      const n = await redis.incr('rl:' + key);
      if (n === 1) await redis.expire('rl:' + key, windowSeconds);
      return n <= limit;
    },
    count: async (key) => Number((await redis.get('rl:' + key)) || 0),
    clear: async (key) => void (await redis.del('rl:' + key)),
    ping: async () => void (await redis.ping()),
    close: async () => void (await redis.quit()),
  };
}
