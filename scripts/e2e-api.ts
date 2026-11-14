// Runs the browser tests against the database-backed API instead of the demo server: npm run e2e:api
import { spawnSync } from 'node:child_process';

const r = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'e2e/flows.test.ts'], { stdio: 'inherit', env: { ...process.env, E2E_SERVER: 'dist/api.mjs' } });
process.exit(r.status ?? 1);
