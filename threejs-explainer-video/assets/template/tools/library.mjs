// library.mjs — スキルの素材庫（一度取った・作った素材）を見る・使う・足す
//   node tools/library.mjs list                         → 素材庫の中身（Poly Haven の素材と、生成したモデル）
//   node tools/library.mjs use <名前> [出力=assets/gen/<名前>.glb]   → 生成モデルを作業フォルダにコピー
//   node tools/library.mjs add <モデル.glb> --name <名前> [--source 元画像] [--note "作り方のメモ"]
//   Poly Haven の素材は tools/polyhaven.mjs get が自動で素材庫を使う（ここでは一覧だけ）
// 作る前に必ず list を見る。同じ物があれば作り直さない（3D化は1体6分、画像生成も時間とお金がかかる）
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, LIB, copyFile, addCredit } from './lib.mjs';

const mb = (f) => (fs.statSync(f).size / 1e6).toFixed(1);
const dirSize = (d) => fs.readdirSync(d, { recursive: true }).map((f) => path.join(d, f)).filter((f) => fs.statSync(f).isFile()).reduce((s, f) => s + fs.statSync(f).size, 0);

// 生成モデルを素材庫に登録する（comfy3d.mjs からも呼ぶ）
export function registerGen(glb, { name, source = null, meta = {} }) {
  const d = path.join(LIB, 'gen', name);
  fs.mkdirSync(d, { recursive: true });
  copyFile(glb, path.join(d, 'model.glb'));
  if (source && fs.existsSync(source)) copyFile(source, path.join(d, 'source' + path.extname(source)));
  const prev = fs.existsSync(path.join(d, 'meta.json')) ? JSON.parse(fs.readFileSync(path.join(d, 'meta.json'), 'utf8')) : {};
  const m = { name, created: new Date().toISOString().slice(0, 10), ...prev, ...meta };
  fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify(m, null, 2));
  addCredit(`gen/${name}`, `- ${name}（gen/${name}）— ${m.how ?? '生成'}${m.license ? ` — ${m.license}` : ''}`);
  return d;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
  const [cmd, ...args] = argv;
  if (cmd === 'list') {
    console.log(`素材庫: ${LIB}`);
    const gen = path.join(LIB, 'gen');
    if (fs.existsSync(gen)) for (const n of fs.readdirSync(gen)) {
      const m = JSON.parse(fs.readFileSync(path.join(gen, n, 'meta.json'), 'utf8'));
      console.log(`  [生成] ${n.padEnd(20)} ${mb(path.join(gen, n, 'model.glb')).padStart(6)} MB  ${m.created}  ${m.subject ?? ''}`);
    }
    const ph = path.join(LIB, 'ph');
    if (fs.existsSync(ph)) for (const id of fs.readdirSync(ph)) {
      const mans = fs.readdirSync(path.join(ph, id)).filter((f) => f.startsWith('manifest-'));
      const info = mans.length ? JSON.parse(fs.readFileSync(path.join(ph, id, mans[0]), 'utf8')).info : {};
      const kind = ['HDRI', 'テクスチャ', 'モデル'][info.type] ?? '?';
      console.log(`  [PH:${kind}] ${id.padEnd(24)} ${(dirSize(path.join(ph, id)) / 1e6).toFixed(1).padStart(6)} MB  ${mans.map((f) => f.slice(9, -5)).join(',')}`);
    }
  } else if (cmd === 'use' && args[0]) {
    const src = path.join(LIB, 'gen', args[0], 'model.glb');
    if (!fs.existsSync(src)) { console.error(`素材庫に gen/${args[0]} がありません（node tools/library.mjs list）`); process.exit(1); }
    const dest = path.resolve(root, args[1] ?? `assets/gen/${args[0]}.glb`);
    copyFile(src, dest);
    const m = JSON.parse(fs.readFileSync(path.join(LIB, 'gen', args[0], 'meta.json'), 'utf8'));
    addCredit(`gen/${args[0]}`, `- ${args[0]}（gen/${args[0]}）— ${m.how ?? '生成'}${m.license ? ` — ${m.license}` : ''}`);
    console.log(`→ ${path.relative(root, dest)}（${mb(dest)} MB）`);
  } else if (cmd === 'add' && args[0]) {
    const name = opt('--name') ?? path.basename(args[0], path.extname(args[0]));
    const d = registerGen(args[0], { name, source: opt('--source'), meta: { note: opt('--note') ?? undefined } });
    console.log(`→ ${d}`);
  } else {
    console.log('使い方: node tools/library.mjs list / use <名前> [出力] / add <モデル.glb> --name <名前> [--source 画像] [--note メモ]');
    process.exit(1);
  }
}
