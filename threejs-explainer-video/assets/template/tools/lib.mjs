// lib.mjs — スキルの素材庫（一度取った・作った素材を貯めて使い回す場所）の共通部分
//   素材庫: ~/.claude/skills/threejs-explainer-video/assets/library/（環境変数 EXPLAINER_LIB で変えられる）
//     ph/<id>/                 Poly Haven の素材（manifest-<解像度>.json に中身と md5）
//     gen/<名前>/model.glb      生成したモデル ＋ source.png（元の画像）＋ meta.json（作り方・ライセンス）
//     CREDITS.md               出どころの一覧
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // 作業フォルダ
export const LIB = process.env.EXPLAINER_LIB || path.join(os.homedir(), '.claude', 'skills', 'threejs-explainer-video', 'assets', 'library');

export const md5 = (file) => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
// src を dest にコピー（同じ中身ならしない）。コピーしたら true
export function copyFile(src, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size === fs.statSync(src).size && md5(dest) === md5(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}
// 出どころを1行ずつ残す（同じ key は二重に書かない）。素材庫と作業フォルダの両方に書く
export function addCredit(key, line) {
  for (const f of [path.join(LIB, 'CREDITS.md'), path.join(root, 'assets', 'CREDITS.md')]) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    if (!fs.existsSync(f) || !fs.readFileSync(f, 'utf8').includes(key)) fs.appendFileSync(f, line.endsWith('\n') ? line : line + '\n');
  }
}
