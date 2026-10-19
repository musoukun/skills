// render.mjs — 図のページをヘッドレスChromiumで開き、ARCH.render(t) を1コマずつ撮って書き出す（出力は out/）
//   node tools/render.mjs info                   → 尺とフェーズの時刻表
//   node tools/render.mjs sheet [枚数=16]         → out/sheet.png（全体を等間隔に撮ったコンタクトシート、時刻入り）
//   node tools/render.mjs stills 2.5,7.1         → out/still-<秒>.png（原寸 1920×1080）
//   node tools/render.mjs video [名前=diagram]    → out/<名前>.mp4（X向け H.264 30fps）+ <名前>.gif（15MB以下）+ <名前>-poster.png
//   どれにも --page carry.html を付けると、運搬型（carry-spec.js + carry.js）を撮る。既定は index.html（構成図型）
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'out');
fs.mkdirSync(out, { recursive: true });
const argv = process.argv.slice(2);
const pageAt = argv.indexOf('--page');
const PAGE = pageAt >= 0 ? argv.splice(pageAt, 2)[1] : 'index.html';
const [mode = 'info', ...args] = argv;

// Chromium の場所: 環境変数 ARCH_CHROME → Playwright のキャッシュ（新しい版から）→ インストール済み Chrome
function findChrome() {
  if (process.env.ARCH_CHROME) return { executablePath: process.env.ARCH_CHROME };
  const win = process.platform === 'win32';
  const base = win
    ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
      : path.join(os.homedir(), '.cache', 'ms-playwright');
  const rel = win ? ['chrome-win64', 'chrome.exe'] : process.platform === 'darwin' ? null : ['chrome-linux', 'chrome'];
  try {
    const dirs = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => b.split('-')[1] - a.split('-')[1]);
    for (const d of rel ? dirs : []) {
      const p = path.join(base, d, ...rel);
      if (fs.existsSync(p)) return { executablePath: p };
    }
  } catch {}
  return { channel: 'chrome' };
}

function ffmpeg(argv, stdin = 'ignore') {
  return spawn('ffmpeg', ['-y', '-loglevel', 'error', ...argv], { stdio: [stdin, 'inherit', 'inherit'] });
}
async function finish(ff) {
  const [code] = await once(ff, 'close');
  if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
}
async function write(ff, buf) {
  if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
}

const browser = await chromium.launch({ ...findChrome(), headless: true });
// 論理 1600×900 を 1.2 倍で撮る → 1920×1080
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(pathToFileURL(path.join(root, PAGE)).href + '?render');
await page.waitForFunction(() => window.ARCH && ARCH.ready === true, null, { timeout: 120000 });
const { duration: DUR, fps: FPS, posterTime, phases } = await page.evaluate(() => ({ ...ARCH, render: undefined }));
const shot = async (t, type = 'png', stamp = false) => {
  await page.evaluate(([tt, s]) => ARCH.render(tt, { stamp: s }), [t, stamp]);
  return page.screenshot(type === 'png' ? { type } : { type, quality: 95 });
};

if (mode === 'info') {
  console.log(`duration ${DUR.toFixed(2)}s  fps ${FPS}  frames ${Math.round(DUR * FPS)}  poster ${posterTime.toFixed(2)}s`);
  phases.forEach((p) => console.log(`${p.kind.padEnd(6)} ${p.t0.toFixed(2).padStart(6)} - ${p.t1.toFixed(2).padStart(6)}  ${p.caption}`));
}

if (mode === 'sheet') {
  const n = Math.ceil(Number(args[0] || 16) / 4) * 4;
  const file = path.join(out, 'sheet.png');
  const ff = ffmpeg(['-f', 'image2pipe', '-c:v', 'png', '-i', '-', '-vf', `scale=480:-1,tile=4x${n / 4}:padding=4:color=white`, '-frames:v', '1', file], 'pipe');
  for (let i = 0; i < n; i++) await write(ff, await shot(((i + 0.5) / n) * DUR, 'png', true));
  ff.stdin.end();
  await finish(ff);
  console.log(`${file} (${n} frames)`);
}

if (mode === 'stills') {
  for (const t of (args[0] || String(posterTime)).split(',').map(Number)) {
    fs.writeFileSync(path.join(out, `still-${t}.png`), await shot(t));
  }
  console.log('stills written');
}

if (mode === 'video') {
  const name = args[0] || 'diagram', n = Math.round(DUR * FPS);
  const mp4 = path.join(out, `${name}.mp4`), gif = path.join(out, `${name}.gif`);
  const t0 = Date.now();
  const ff = ffmpeg(['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', mp4], 'pipe');
  for (let i = 0; i < n; i++) {
    await write(ff, await shot(i / FPS, 'jpeg'));
    if (i % 90 === 0) console.log(`frame ${i}/${n}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  ff.stdin.end();
  await finish(ff);
  fs.writeFileSync(path.join(out, `${name}-poster.png`), await shot(posterTime));
  console.log(`${mp4}  (${n} frames, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  // GIF: 動く部分に色を割く（stats_mode=diff）。X の上限 15MB に収まるまで幅と fps を落とす
  for (const [w, f] of [[960, 15], [800, 12], [640, 10]]) {
    const vf = `fps=${f},scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
    await finish(ffmpeg(['-i', mp4, '-vf', vf, '-loop', '0', gif]));
    const mb = fs.statSync(gif).size / 1e6;
    console.log(`${gif}  ${w}px ${f}fps  ${mb.toFixed(1)}MB`);
    if (mb <= 15) break;
  }
}

await browser.close();
