// analyze-ref.mjs — 参考にしたい動画を yt-dlp で落とし、1秒1枚のコマと字幕の書き起こしを作る
//   node tools/analyze-ref.mjs <URL> [出力フォルダ=ref] [秒あたりの枚数=1]
// できるもの: video.mp4 / info.txt（題名・尺・解像度・説明）/ frames/f_001.jpg… / sheet_1.jpg…（8×3 のコンタクトシート）/ captions.txt
// 必要なもの: yt-dlp と ffmpeg が PATH にあること
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [url, dirArg = 'ref', fpsArg = '1'] = process.argv.slice(2);
if (!url) { console.error('使い方: node tools/analyze-ref.mjs <URL> [出力フォルダ] [秒あたりの枚数]'); process.exit(1); }
const dir = path.resolve(dirArg);
fs.mkdirSync(path.join(dir, 'frames'), { recursive: true });
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) console.error(`${cmd} が失敗: ${(r.stderr || '').split('\n').slice(-4).join('\n')}`);
  return r.status === 0;
};

// 1) 動画（mp4 に揃える）。字幕は別に取る（字幕の 429 で動画まで止まらないように）
run('yt-dlp', ['-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b', '--merge-output-format', 'mp4', '--write-info-json', '--no-write-subs', '-o', path.join(dir, 'video.%(ext)s'), url]);
run('yt-dlp', ['--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', 'ja,ja-orig', '--ignore-errors', '-o', path.join(dir, 'video.%(ext)s'), url]);
const mp4 = path.join(dir, 'video.mp4');
if (!fs.existsSync(mp4)) { console.error('動画を取得できませんでした'); process.exit(1); }

// 2) 情報
const infoFile = path.join(dir, 'video.info.json');
if (fs.existsSync(infoFile)) {
  const j = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
  const info = [`title: ${j.title}`, `channel: ${j.channel}`, `duration: ${j.duration}s  ${j.width}x${j.height}  ${j.fps}fps`, `description: ${j.description}`].join('\n');
  fs.writeFileSync(path.join(dir, 'info.txt'), info);
  console.log(info);
}

// 3) コマ（1秒1枚・幅540）とコンタクトシート（8×3 = 24枚ずつ）
run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', mp4, '-vf', `fps=${fpsArg},scale=540:-1`, path.join(dir, 'frames', 'f_%03d.jpg')]);
run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', mp4, '-vf', `fps=${fpsArg},scale=216:-1,tile=8x3`, path.join(dir, 'sheet_%d.jpg')]);

// 4) 自動字幕（VTT）を「時刻 + 1行」に整える。自動字幕は同じ行が繰り返し出るので、新しく出た行だけ残す
const vtt = fs.readdirSync(dir).find((f) => f.endsWith('.vtt'));
if (vtt) {
  const lines = fs.readFileSync(path.join(dir, vtt), 'utf8').split(/\r?\n/);
  const outLines = [];
  let t = '';
  for (const l of lines) {
    const m = l.match(/^(\d\d:\d\d:\d\d\.\d+) -->/);
    if (m) t = m[1];
    else if (l.includes('<c>')) outLines.push(`${t}  ${l.replace(/<[^>]+>/g, '')}`);
  }
  fs.writeFileSync(path.join(dir, 'captions.txt'), outLines.join('\n'));
  console.log(`\ncaptions.txt（自動字幕。聞き間違いを含む）:\n${outLines.join('\n')}`);
}
console.log(`\nframes: ${fs.readdirSync(path.join(dir, 'frames')).length} 枚 / sheets: ${fs.readdirSync(dir).filter((f) => f.startsWith('sheet_')).join(', ')}  → ${dir}`);
