// render.mjs — ヘッドレス Chromium でページを開き、コマを1枚ずつ取り出して ffmpeg で MP4 にする（出力は out/）
//   node tools/render.mjs sheet [開始:終了:刻み] [名前]   → out/sheet-名前.png（コンタクトシート。省略時は全体を0.5秒刻み）
//   node tools/render.mjs stills 3.2,7.5                  → out/still-<秒>.png（原寸）
//   node tools/render.mjs video [名前] [開始:終了]        → out/名前.mp4（ナレーション付き。区間指定で部分書き出し）
//   video と stills は --blur N でモーションブラー（video の既定は 6。1 で切る）
// ES モジュールは file:// で読めないので、作業フォルダを小さな HTTP サーバで配る
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'out');
const argv = process.argv.slice(2);
// --blur N: モーションブラーのサンプル数（video / stills。既定 video=6, stills=1）
const bi = argv.indexOf('--blur');
const BLUR = bi >= 0 ? Number(argv.splice(bi, 2)[1]) : null;
const [mode = 'sheet', ...args] = argv;

// ---- 静的ファイルサーバ（ランダムなポート） ----
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wav': 'audio/wav', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.hdr': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/`;

// ---- Chromium: 環境変数 EX_CHROME → Playwright のキャッシュ（新しい版から）→ インストール済み Chrome ----
function findChrome() {
  if (process.env.EX_CHROME) return { executablePath: process.env.EX_CHROME };
  const win = process.platform === 'win32';
  const cache = win ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
    : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright') : path.join(os.homedir(), '.cache', 'ms-playwright');
  const rel = win ? ['chrome-win64', 'chrome.exe'] : process.platform === 'darwin' ? null : ['chrome-linux', 'chrome'];
  try {
    const dirs = fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => b.split('-')[1] - a.split('-')[1]);
    for (const d of rel ? dirs : []) { const p = path.join(cache, d, ...rel); if (fs.existsSync(p)) return { executablePath: p }; }
  } catch {}
  return { channel: 'chrome' };
}
const browser = await chromium.launch({
  ...findChrome(), headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--autoplay-policy=no-user-gesture-required', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])],
});
const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
page.on('console', (m) => console.log('[page]', m.text()));
// 読み込み中のエラーは待たずに止める（待ち続けて固まらないように）
const failed = new Promise((_, ng) => page.on('pageerror', (e) => ng(new Error('[pageerror] ' + e.message))));
await page.goto(base + 'index.html?render');
try {
  await Promise.race([page.waitForFunction(() => window.EX && EX.ready === true, null, { timeout: 300000 }), failed]);
} catch (e) {
  console.error(e.message);
  await browser.close(); server.close(); process.exit(1);
}
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
const { duration: DUR, fps: FPS } = await page.evaluate(() => ({ duration: EX.duration, fps: EX.fps }));
const range = (s, a, b) => (s ? s.split(':').map(Number) : [a, b]);

if (mode === 'sheet') {
  const [a, b, step] = args[0] ? args[0].split(':').map(Number) : [0, DUR, 0.5];
  const times = [];
  for (let t = a; t < b - 1e-9; t += step) times.push(Math.round(t * 1000) / 1000);
  const t0 = Date.now();
  const b64 = await page.evaluate(([ts]) => EX.sheet(ts, 8, 200), [times]);
  const file = path.join(out, `sheet-${args[1] || 'all'}.png`);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log(`${file} (${times.length} frames, ${Date.now() - t0}ms)`);
}

if (mode === 'stills') {
  for (const t of (args[0] || '0').split(',').map(Number)) {
    const b64 = await page.evaluate(([tt, n]) => EX.frame(tt, 'image/png', 1, n), [t, BLUR ?? 1]);
    fs.writeFileSync(path.join(out, `still-${t}.png`), Buffer.from(b64, 'base64'));
  }
  console.log('stills written');
}

if (mode === 'video') {
  const name = args[0] || 'video';
  const [a, b] = range(args[1], 0, DUR);
  const n0 = Math.round(a * FPS), n1 = Math.round(b * FPS);
  const file = path.join(out, `${name}.mp4`);
  // 声は -14 LUFS（ショート動画の目安）にそろえる
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-ss', String(a), '-t', String(b - a), '-i', path.join(out, 'narration.wav'),
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = n0; i < n1; i++) {
    const b64 = await page.evaluate(([t, n]) => EX.frame(t, 'image/jpeg', 0.93, n), [i / FPS + 1e-6, BLUR ?? 6]);
    if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await once(ff.stdin, 'drain');
    if ((i - n0) % 150 === 0) console.log(`frame ${i - n0}/${n1 - n0}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  ff.stdin.end();
  await once(ff, 'close');
  console.log(`${file}  (${n1 - n0} frames, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

await browser.close();
server.close();
