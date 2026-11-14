// Database commands:  npm run db:migrate   |   npm run db:seed   |   npm run db:seed -- --demo
// Local settings live in .env (never committed). Real environments set the variables themselves.
try {
  process.loadEnvFile();
} catch {
  /* no .env file */
}
import { loadConfig } from '../api/config';
import { mediaStoreFor, systemClock } from '../api/services';
import { migrate, openDb } from './client';
import { ensureAdmin, isEmpty, seedDemo, seedProduction } from './seed';

const cmd = process.argv[2];
const demo = process.argv.includes('--demo');
const cfg = loadConfig();
const database = await openDb(cfg.DATABASE_URL);
try {
  const applied = await migrate(database.db);
  console.log(applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Migrations are up to date.');
  if (cmd === 'seed') {
    if (demo && cfg.isProduction) throw new Error('Demo data cannot be put in a production database.');
    if (!(await isEmpty(database.db))) console.log('The database already has data: nothing was seeded.');
    else {
      const media = await mediaStoreFor(cfg);
      if (demo) await seedDemo(database.db, cfg, systemClock, media);
      else await seedProduction(database.db, systemClock, media);
      console.log(demo ? 'Seeded the demo data.' : 'Seeded the governorates, places and prices.');
    }
    console.log(`State (admin) account: ${await ensureAdmin(database.db, cfg, systemClock)}.`);
  }
} finally {
  await database.close();
}
