// polyhaven.mjs — Poly Haven（CC0・商用可・クレジット不要）から HDRI / テクスチャ / 3Dモデルを取ってくる
//   node tools/polyhaven.mjs search <hdris|textures|models> <単語…>   → id とタグの一覧
//   node tools/polyhaven.mjs get <id> [解像度=2k] [--max 60]           → assets/ph/<id>/ に保存（md5 で検証）
//     HDRI     → <id>_<res>.hdr
//     テクスチャ → diff.jpg / nor_gl.jpg / rough.jpg / ao.jpg / disp.png（あるものだけ）
//     モデル    → <id>.gltf と、それが参照する .bin とテクスチャ（相対パスのまま）
//   合計が --max MB（既定 60）を超えるときは取らずに止まる。モデルは 1k を選ぶと軽い（.bin の大きさは解像度で変わらないこともある）
// 取った素材は assets/CREDITS.md に追記する（CC0 なので表記は任意だが、出どころを残しておく）
// 一度取った素材はスキルの素材庫（tools/lib.mjs の LIB/ph/<id>/）に入れておき、次からはネットに行かずにそこからコピーする
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { root, LIB, md5, copyFile, addCredit } from './lib.mjs';

const API = 'https://api.polyhaven.com';
const UA = { headers: { 'user-agent': 'threejs-explainer-video' } }; // Poly Haven の API は独自の User-Agent を求めている
const json = async (u) => { const r = await fetch(u, UA); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };
const argv = process.argv.slice(2);
const mi = argv.indexOf('--max');
const maxMB = mi >= 0 ? Number(argv.splice(mi, 2)[1]) : 60;
const [cmd, ...args] = argv;

if (cmd === 'search') {
  const [type, ...words] = args;
  const all = await json(`${API}/assets?t=${type}`);
  const re = new RegExp(words.join('|'), 'i');
  for (const [id, a] of Object.entries(all)) {
    const text = [id, ...(a.tags || []), ...(a.categories || [])].join(',');
    if (!words.length || re.test(text)) console.log(`${id.padEnd(30)} ${(a.categories || []).join(',')} | ${(a.tags || []).join(',')}`.slice(0, 200));
  }
  process.exit(0);
}

if (cmd !== 'get' || !args[0]) {
  console.log('使い方: node tools/polyhaven.mjs search <hdris|textures|models> <単語…> / get <id> [1k|2k|4k] [--max MB]');
  process.exit(1);
}
const [id, res = '2k'] = args;
const dir = path.join(root, 'assets', 'ph', id), libDir = path.join(LIB, 'ph', id);
const manifestFile = path.join(libDir, `manifest-${res}.json`);
const creditLine = (info) => `- ${info.name}（${id}）by ${Object.keys(info.authors || {}).join(', ')} — Poly Haven, CC0 — https://polyhaven.com/a/${id}`;

// 素材庫にそろっていれば、API も呼ばずにコピーだけで終わる
if (fs.existsSync(manifestFile)) {
  const man = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const ok = man.files.every(([rel, h]) => fs.existsSync(path.join(libDir, rel)) && md5(path.join(libDir, rel)) === h);
  if (ok) {
    let n = 0;
    for (const [rel] of man.files) if (copyFile(path.join(libDir, rel), path.join(dir, rel))) n++;
    addCredit(`（${id}）`, creditLine(man.info));
    console.log(`${man.info.name}（${res}）: 素材庫から ${man.files.length} ファイル（コピー ${n}）→ ${path.relative(root, dir)}`);
    process.exit(0);
  }
}

const info = await json(`${API}/info/${id}`);
const files = await json(`${API}/files/${id}`);
const jobs = []; // [保存先, { url, md5, size }]
const pick = (node, name) => { if (!node?.[res]) throw new Error(`${id}: ${name} に ${res} がありません（${Object.keys(node || {}).join(', ')}）`); return node[res]; };

if (info.type === 0) {
  jobs.push([`${id}_${res}.hdr`, pick(files.hdri, 'hdri').hdr]);
} else if (info.type === 1) {
  const maps = { Diffuse: ['diff.jpg', 'jpg'], nor_gl: ['nor_gl.jpg', 'jpg'], Rough: ['rough.jpg', 'jpg'], AO: ['ao.jpg', 'jpg'], Displacement: ['disp.png', 'png'] };
  for (const [key, [name, ext]] of Object.entries(maps)) if (files[key]?.[res]?.[ext]) jobs.push([name, files[key][res][ext]]);
} else {
  const g = pick(files.gltf, 'gltf').gltf;
  jobs.push([`${id}.gltf`, g]);
  for (const [rel, f] of Object.entries(g.include || {})) jobs.push([rel, f]);
}
const total = jobs.reduce((s, [, f]) => s + f.size, 0) / 1e6;
console.log(`${info.name}（${['HDRI', 'テクスチャ', 'モデル'][info.type]}, ${res}）: ${jobs.length} ファイル, ${total.toFixed(1)} MB`);
if (total > maxMB) { console.error(`--max ${maxMB} MB を超えるので取りません。解像度を下げるか --max を上げてください`); process.exit(1); }

// まず素材庫に取ってきて（作業フォルダにあればそれを使う）、そこから作業フォルダへコピーする
for (const [rel, f] of jobs) {
  const lib = path.join(libDir, rel), dest = path.join(dir, rel);
  if (fs.existsSync(lib) && md5(lib) === f.md5) console.log(`  素材庫 ${rel}`);
  else if (fs.existsSync(dest) && md5(dest) === f.md5) { copyFile(dest, lib); console.log(`  作業フォルダ → 素材庫 ${rel}`); }
  else {
    const buf = Buffer.from(await (await fetch(f.url, UA)).arrayBuffer());
    if (crypto.createHash('md5').update(buf).digest('hex') !== f.md5) throw new Error(`md5 が合いません: ${rel}`);
    fs.mkdirSync(path.dirname(lib), { recursive: true });
    fs.writeFileSync(lib, buf);
    console.log(`  取得 ${rel} (${(buf.length / 1e6).toFixed(1)} MB)`);
  }
  copyFile(lib, dest);
}
// モデルの gltf は解像度付きの名前で中身を参照するので、そのまま使える（テクスチャは textures/ 以下）
fs.writeFileSync(manifestFile, JSON.stringify({ info: { name: info.name, authors: info.authors, type: info.type }, res, files: jobs.map(([rel, f]) => [rel, f.md5]) }, null, 1));
addCredit(`（${id}）`, creditLine(info));
console.log(`→ ${path.relative(root, dir)}（素材庫にも保存）`);
