// Contract diff against the engine exactly as it is on `main`: npm run parity:contract
import { spawnSync } from 'node:child_process';

const r = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'src/api/contract.test.ts'], { stdio: 'inherit', env: { ...process.env, CONTRACT_BASELINE: 'main' } });
process.exit(r.status ?? 1);
