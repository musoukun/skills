// codex-image.mjs — Codex CLI の画像生成（image_generation 機能）で、3D 化に向いた参考画像を1枚作る
//   node tools/codex-image.mjs "<作りたい物の説明（英語がよい）>" <出力.png>
//   例: node tools/codex-image.mjs "a WWII-era medium tank of a generic fictional design, olive drab, weathered" gen/tank.png
// 3D 化（tools/comfy3d.mjs）に向く条件（1つの物・全体が枠内・斜め前・無地の背景・均一な光・文字なし）は自動で足す
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [subject, out] = process.argv.slice(2);
if (!subject || !out) { console.error('使い方: node tools/codex-image.mjs "<説明>" <出力.png>'); process.exit(1); }
const dir = path.dirname(path.resolve(out));
fs.mkdirSync(dir, { recursive: true });
const name = path.basename(out);
const prompt = `Use your image generation tool to create exactly ONE image, then save it as ${name} in the current working directory (copy or move the generated file there). Do not write any code or other files.

Image: ${subject}. Photorealistic, high detail. Three-quarter front view from slightly above, the ENTIRE object fully inside the frame with margin on all sides, centered. Plain light grey seamless studio background, soft even diffuse lighting, no harsh shadows, no ground clutter. No text, no numbers, no logos, no insignia, no markings, no people. Square 1:1 image. This image will be used as input for image-to-3D reconstruction.

When done, reply with only the absolute path of the saved file.`;
const r = spawnSync('codex', ['exec', '--skip-git-repo-check', '-s', 'workspace-write', '-C', dir, prompt], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }); // shell を通すと改行や記号入りのプロンプトが壊れるので直接起動する（Windows は codex.exe を PATH から探す）
if (!fs.existsSync(path.resolve(out))) {
  console.error((r.stdout || '').slice(-2000), (r.stderr || '').slice(-2000));
  console.error('画像ができませんでした（codex login 済みか、codex features list で image_generation が true か確認）');
  process.exit(1);
}
console.log(`→ ${out}（${(fs.statSync(out).size / 1e6).toFixed(1)} MB）`);
