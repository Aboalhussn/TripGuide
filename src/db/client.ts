// Opens the database and applies migrations.
// DATABASE_URL=postgres://… uses PostgreSQL (staging, production, CI).
// Without it, an embedded PostgreSQL (PGlite) is used: in memory for tests, or in a folder for local development.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export interface OpenDb { db: Db; kind: 'postgres' | 'embedded'; close(): Promise<void>; ping(): Promise<void> }

function migrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const places = [process.env.MIGRATIONS_DIR, path.join(here, 'migrations'), path.join(process.cwd(), 'src', 'db', 'migrations'), path.join(process.cwd(), 'dist', 'migrations')];
  const found = places.find((p) => p && fs.existsSync(path.join(p, 'meta', '_journal.json')));
  if (!found) throw new Error('Database migrations folder not found (set MIGRATIONS_DIR).');
  return found;
}

// Applies every migration that has not run yet, in order, each in its own transaction.
export async function migrate(db: Db): Promise<string[]> {
  const dir = migrationsDir();
  const journal = JSON.parse(fs.readFileSync(path.join(dir, 'meta', '_journal.json'), 'utf8')) as { entries: { idx: number; tag: string }[] };
  await db.execute(sql`CREATE TABLE IF NOT EXISTS "_migrations" ("tag" text PRIMARY KEY, "applied_at" timestamptz NOT NULL DEFAULT now())`);
  const done = new Set(((await db.execute(sql`SELECT "tag" FROM "_migrations"`)) as any).rows.map((r: any) => r.tag as string));
  const applied: string[] = [];
  for (const e of [...journal.entries].sort((a, b) => a.idx - b.idx)) {
    if (done.has(e.tag)) continue;
    const statements = fs.readFileSync(path.join(dir, e.tag + '.sql'), 'utf8').split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
    await db.transaction(async (tx) => {
      for (const s of statements) await tx.execute(sql.raw(s));
      await tx.execute(sql`INSERT INTO "_migrations" ("tag") VALUES (${e.tag})`);
    });
    applied.push(e.tag);
  }
  return applied;
}

export async function openDb(url = process.env.DATABASE_URL || ''): Promise<OpenDb> {
  if (/^postgres(ql)?:\/\//.test(url)) {
    const { default: pg } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const tls = process.env.DATABASE_SSL === 'verify' ? { ssl: { rejectUnauthorized: true } } : process.env.DATABASE_SSL === 'require' ? { ssl: { rejectUnauthorized: false } } : {};
    const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL || 10), ...tls });
    const db = drizzle(pool, { schema }) as unknown as Db;
    return { db, kind: 'postgres', close: () => pool.end(), ping: async () => void (await pool.query('select 1')) };
  }
  // Embedded: "memory" (or nothing) keeps it in memory; anything else is a folder on disk.
  const { PGlite } = await import('@electric-sql/pglite');
  const { btree_gist } = await import('@electric-sql/pglite/contrib/btree_gist');
  const { drizzle } = await import('drizzle-orm/pglite');
  const folder = url && url !== 'memory' ? url.replace(/^file:/, '') : undefined;
  if (folder) fs.mkdirSync(folder, { recursive: true });
  const client = new PGlite({ ...(folder ? { dataDir: folder } : {}), extensions: { btree_gist } });
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as Db;
  return { db, kind: 'embedded', close: () => client.close(), ping: async () => void (await client.query('select 1')) };
}

// The next id for a table: the same numbering as the demo engine's counters, safe under concurrency (the row is locked).
export async function nextId(tx: Tx, table: string): Promise<number> {
  const r = (await tx.execute(sql`INSERT INTO "counters" ("name", "value") VALUES (${table}, 1) ON CONFLICT ("name") DO UPDATE SET "value" = "counters"."value" + 1 RETURNING "value"`)) as any;
  return Number(r.rows[0].value);
}

export { schema };
