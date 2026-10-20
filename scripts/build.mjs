// Builds the web app, the server and (with --demo) the single-file demo. No other build tools needed.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const r = (...p) => path.join(root, ...p);
const demo = process.argv.includes('--demo');
const watch = process.argv.includes('--watch');

const brandSrc = fs.readFileSync(r('src/config/brand.ts'), 'utf8');
const name = /name: '([^']+)'/.exec(brandSrc)[1];
const description = /tagline: '([^']+)'/.exec(brandSrc)[1];

const web = {
  bundle: true,
  minify: !watch,
  sourcemap: watch,
  jsx: 'automatic',
  target: ['es2020'],
  define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
  external: ['/fonts/*', '/img/*'],
  logLevel: 'warning',
};

function copyDir(from, to, skip = () => false) {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) {
    const a = path.join(from, f);
    const b = path.join(to, f);
    if (skip(f)) continue;
    if (fs.statSync(a).isDirectory()) copyDir(a, b, skip);
    else fs.copyFileSync(a, b);
  }
}

async function buildApp() {
  fs.rmSync(r('dist/public'), { recursive: true, force: true });
  copyDir(r('public'), r('dist/public'), (f) => f === 'index.html');
  fs.writeFileSync(r('dist/public/index.html'), fs.readFileSync(r('public/index.html'), 'utf8').replaceAll('%NAME%', name).replaceAll('%DESCRIPTION%', description));
  await esbuild.build({ ...web, entryPoints: { app: r('src/web/main.tsx') }, outdir: r('dist/public/assets') });
  await esbuild.build({
    entryPoints: [r('src/server/index.ts')],
    outfile: r('dist/server.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'warning',
  });
  if (!fs.existsSync(r('public/fonts/thmanyahsans-Regular.woff2'))) console.warn('Note: Thmanyah font files are missing from public/fonts. The app falls back to system fonts. See README.');
  console.log('Built dist/public and dist/server.mjs');
}

async function buildDemo() {
  const out = await esbuild.build({ ...web, entryPoints: [r('src/web/demo.tsx')], write: false, outdir: r('dist/demo-tmp'), format: 'iife' });
  let js = '';
  let css = '';
  for (const f of out.outputFiles) {
    if (f.path.endsWith('.js')) js += f.text;
    if (f.path.endsWith('.css')) css += f.text;
  }
  const b64 = (p) => fs.readFileSync(p).toString('base64');
  css = css.replace(/url\(["']?\/fonts\/([^"')]+)["']?\)/g, (m, file) => {
    const p = r('public/fonts', file);
    return fs.existsSync(p) ? `url(data:font/woff2;base64,${b64(p)})` : m;
  });
  const assets = {};
  for (const f of fs.readdirSync(r('public/img'))) {
    const type = f.endsWith('.png') ? 'image/png' : f.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg';
    assets[f] = `data:${type};base64,${b64(r('public/img', f))}`;
  }
  const icon = `data:image/png;base64,${b64(r('public/favicon.png'))}`;
  const html = `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#053F5C" />
<title>${name} demo</title>
<link rel="icon" href="${icon}" />
<style>${css}</style>
<script>try{var l=localStorage.getItem('tg.lang')||((navigator.language||'').indexOf('ar')===0?'ar':'en');document.documentElement.lang=l;document.documentElement.dir=l==='ar'?'rtl':'ltr'}catch(e){}window.__TG_ASSETS=${JSON.stringify(assets)};</script>
</head>
<body>
<div id="root"></div>
<script>${js.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>`;
  fs.mkdirSync(r('dist/demo'), { recursive: true });
  fs.writeFileSync(r('dist/demo/index.html'), html);
  // The same demo without the outer document, for hosts that wrap the page themselves.
  const fragment = `<title>${name} demo</title>
<style>${css}</style>
<script>try{var l=localStorage.getItem('tg.lang')||((navigator.language||'').indexOf('ar')===0?'ar':'en');document.documentElement.lang=l;document.documentElement.dir=l==='ar'?'rtl':'ltr'}catch(e){}window.__TG_ASSETS=${JSON.stringify(assets)};</script>
<div id="root"></div>
<script>${js.replace(/<\/script/gi, '<\\/script')}</script>
`;
  fs.writeFileSync(r('dist/demo/embed.html'), fragment);
  console.log(`Built dist/demo/index.html (${(html.length / 1024 / 1024).toFixed(1)} MB)`);
}

if (demo) await buildDemo();
else if (watch) {
  const ctx = await esbuild.context({ ...web, entryPoints: { app: r('src/web/main.tsx') }, outdir: r('dist/public/assets') });
  copyDir(r('public'), r('dist/public'), (f) => f === 'index.html');
  fs.writeFileSync(r('dist/public/index.html'), fs.readFileSync(r('public/index.html'), 'utf8').replaceAll('%NAME%', name).replaceAll('%DESCRIPTION%', description));
  await ctx.watch();
  console.log('Watching the web app for changes…');
} else await buildApp();
