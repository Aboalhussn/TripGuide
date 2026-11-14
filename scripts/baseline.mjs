// Puts the app exactly as it is on `main` (the demo before this work) into .baseline/main and builds it there.
// The parity checks compare the new app against it: npm run parity:contract, npm run parity:screens.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.baseline', 'main');
const ref = process.env.BASELINE_REF || 'main';
const sha = execFileSync('git', ['rev-parse', ref], { cwd: root }).toString().trim();
const stamp = path.join(out, '.sha');
if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === sha && fs.existsSync(path.join(out, 'dist', 'server.mjs'))) {
  console.log(`Baseline ${ref} (${sha.slice(0, 7)}) is already in .baseline/main`);
  process.exit(0);
}
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const tar = path.join(root, '.baseline', 'main.tar');
execFileSync('git', ['archive', '--format=tar', '-o', tar, ref, 'src', 'public', 'scripts', 'package.json', 'tsconfig.json'], { cwd: root });
execFileSync('tar', ['-xf', 'main.tar', '-C', 'main'], { cwd: path.join(root, '.baseline') }); // relative paths: tar misreads C:\ on Windows
fs.rmSync(tar);
// The only edit to the baseline: its build script cannot find the project folder on Windows (fixed on this branch).
const build = path.join(out, 'scripts', 'build.mjs');
fs.writeFileSync(build, fs.readFileSync(build, 'utf8').replace("path.dirname(new URL(import.meta.url).pathname)", "path.dirname((await import('node:url')).fileURLToPath(import.meta.url))"));
execFileSync(process.execPath, [build], { cwd: out, stdio: 'inherit' }); // uses this checkout's node_modules
fs.writeFileSync(stamp, sha);
console.log(`Baseline ${ref} (${sha.slice(0, 7)}) built in .baseline/main`);
