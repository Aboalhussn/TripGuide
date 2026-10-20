// Development: rebuilds the web app on change and restarts the server on change.
import { spawn } from 'node:child_process';

const run = (cmd, args) => spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
const web = run('node', ['scripts/build.mjs', '--watch']);
const api = run('npx', ['tsx', 'watch', 'src/server/index.ts']);
const stop = () => {
  web.kill();
  api.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
