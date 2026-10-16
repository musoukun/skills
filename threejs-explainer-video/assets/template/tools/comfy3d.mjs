// comfy3d.mjs — 画像1枚 → テクスチャ付き GLB を、ローカルの ComfyUI（TRELLIS.2 / Pixal3D のネイティブノード）で作る
//   node tools/comfy3d.mjs <画像> <出力.glb> [--template ファイル] [--set ノードid.入力名=値 …] [--url http://127.0.0.1:8188]
//   例: node tools/comfy3d.mjs gen/tank.png assets/gen/tank.glb --subject "WWII風の中戦車（架空）" --set 288.value=2048 --set 40.unet_name=pixal3d_int8_convrot.safetensors
//   できたモデルはスキルの素材庫（LIB/gen/<名前>/）にも元画像・設定と一緒に入る。作る前に node tools/library.mjs list を見る
// 既定のテンプレートは ComfyUI 同梱の「Pixal3D & TRELLIS.2: Image to Model」（画面用の形式）。
// それを /object_info（部品ごとの入力の並び）を見ながら API 形式に直し、LoadImage の画像だけ差し替えて実行する。
// 使うモデル（ComfyUI の models/ に置く。合計 約9.3GB、MIT など商用可）: README の「ローカルで3D化」を参照
import fs from 'node:fs';
import path from 'node:path';
import { registerGen } from './library.mjs';

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv.splice(i, 2)[1] : def; };
const URL_ = opt('--url', 'http://127.0.0.1:8188');
const tplArg = opt('--template', null);
const nameArg = opt('--name', null);       // 素材庫での名前（既定は出力ファイル名）
const subjectArg = opt('--subject', null); // 何のモデルか（素材庫の一覧に出す説明）
const sets = [];
for (let i; (i = argv.indexOf('--set')) >= 0;) sets.push(argv.splice(i, 2)[1]);
const [imgPath, outPath] = argv;
if (!imgPath || !outPath) { console.error('使い方: node tools/comfy3d.mjs <画像> <出力.glb> [--set id.name=value]'); process.exit(1); }

const get = async (p) => { const r = await fetch(URL_ + p); if (!r.ok) throw new Error(`${r.status} ${p}`); return r.json(); };
const info = await get('/object_info');
const sys = await get('/system_stats');
console.log(`ComfyUI ${sys.system.comfyui_version} / ${sys.devices[0].name}`);

// テンプレート: 指定がなければ ComfyUI の venv に入っている公式テンプレートを探す
function findTemplate() {
  const roots = [process.env.COMFYUI_DIR, 'T:/comfyui/Data/Packages/ComfyUI'].filter(Boolean);
  for (const r of roots) {
    const p = path.join(r, 'venv/Lib/site-packages/comfyui_workflow_templates_json/templates/3d_pixal3d_trellis2_image_to_model.json');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('テンプレートが見つかりません。--template で渡すか COMFYUI_DIR を設定してください');
}
const ui = JSON.parse(fs.readFileSync(tplArg ?? findTemplate(), 'utf8'));

// ---- 画面用 → API 形式 ----
// 画面専用のノード（メモ・3D ビューア）は外す。Save3DAdvanced はビューアの状態（viewport_state）を
// 画面から受け取るので API では動かない → 同じ入力を SaveGLB で保存する
const SKIP = new Set(['Note', 'MarkdownNote', 'Preview3DAdvanced', 'Preview3D']);
const linkById = new Map(ui.links.map((l) => [l[0], l])); // [id, 元ノード, 元の口, 先ノード, 先の口, 型]
const api = {};
for (const n of ui.nodes) {
  if (SKIP.has(n.type) || n.mode === 2 || n.mode === 4) continue;
  if (n.type === 'Save3DAdvanced') {
    const l = linkById.get((n.inputs || []).find((i) => i.name === 'model_3d')?.link);
    if (l) api[String(n.id)] = { class_type: 'SaveGLB', inputs: { mesh: [String(l[1]), l[2]], filename_prefix: 'explainer3d/model' } };
    continue;
  }
  const def = info[n.type];
  if (!def) throw new Error(`ComfyUI に ${n.type} がありません（バージョンが古い？）`);
  const specs = { ...(def.input.required || {}), ...(def.input.optional || {}) };
  const linked = new Map((n.inputs || []).filter((i) => i.link != null).map((i) => [i.name, linkById.get(i.link)]));
  // つなぎ口（画面で線をつなぐ入力）として並んでいない入力は、すべて画面の設定値（widgets_values に順に入っている）
  const sockets = new Set((n.inputs || []).filter((i) => !i.widget).map((i) => i.name));
  const wv = Array.isArray(n.widgets_values) ? [...n.widgets_values] : [];
  const inputs = {};
  for (const [name, spec] of Object.entries(specs)) {
    if (!sockets.has(name)) {
      // テンプレートより新しい ComfyUI で入力が増えていると値が足りない → 定義の既定値で埋める
      const take = (sp) => { const v = wv.shift(); return v !== undefined ? v : sp?.[1]?.default; };
      const v = take(spec);
      // seed などの直後には「control_after_generate（fixed/randomize）」の値が入っている
      if (spec[1]?.control_after_generate || ((name === 'seed' || name === 'noise_seed') && typeof wv[0] === 'string')) wv.shift();
      if (!linked.has(name) && v !== undefined) inputs[name] = v;
      // 選んだ値で入力が増える combo（COMFY_DYNAMICCOMBO_V3）: 値のすぐ後ろに、その選択肢の入力が順に並ぶ
      if (spec[0] === 'COMFY_DYNAMICCOMBO_V3') {
        const o = spec[1].options.find((x) => x.key === v);
        const subs = { ...(o?.inputs?.required || {}), ...(o?.inputs?.optional || {}) };
        for (const [sub, sp] of Object.entries(subs)) inputs[`${name}.${sub}`] = take(sp);
      }
    }
    if (linked.has(name)) { const l = linked.get(name); inputs[name] = [String(l[1]), l[2]]; }
  }
  // 定義にない名前の入力（動的な口など）もつなぐ
  for (const [name, l] of linked) if (!(name in inputs)) inputs[name] = [String(l[1]), l[2]];
  api[String(n.id)] = { class_type: n.type, inputs };
}

// ---- 画像を上げて LoadImage に入れる ----
const fd = new FormData();
fd.append('image', new Blob([fs.readFileSync(imgPath)]), path.basename(imgPath));
fd.append('overwrite', 'true');
const up = await (await fetch(URL_ + '/upload/image', { method: 'POST', body: fd })).json();
for (const node of Object.values(api)) if (node.class_type === 'LoadImage') node.inputs.image = up.name;

// --set 288.value=2048 のような上書き
for (const s of sets) {
  const [, id, name, raw] = s.match(/^(\d+)\.([^=]+)=(.*)$/) || [];
  if (!api[id]) throw new Error(`--set: ノード ${id} がありません`);
  api[id].inputs[name] = raw === 'true' ? true : raw === 'false' ? false : isNaN(Number(raw)) ? raw : Number(raw);
}

// ---- 実行して待つ ----
const res = await (await fetch(URL_ + '/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: api }) })).json();
if (!res.prompt_id) { console.error(JSON.stringify(res, null, 2).slice(0, 4000)); process.exit(1); }
// 一部の出力だけ検証に落ちても prompt_id は返る（その出力は黙って捨てられる）ので、必ず見る
if (res.node_errors && Object.keys(res.node_errors).length) console.error('検証エラー:', JSON.stringify(res.node_errors, null, 1).slice(0, 4000));
console.log(`投入 ${res.prompt_id}（ノード ${Object.keys(api).length}）`);
const t0 = Date.now();
let hist;
for (;;) {
  await new Promise((ok) => setTimeout(ok, 3000));
  hist = (await get(`/history/${res.prompt_id}`))[res.prompt_id];
  if (hist?.status?.completed || hist?.status?.status_str === 'error') break;
  if ((Date.now() - t0) % 30000 < 3000) console.log(`  …${Math.round((Date.now() - t0) / 1000)}s`);
}
if (hist.status.status_str === 'error') {
  console.error(JSON.stringify(hist.status.messages, null, 1).slice(0, 4000));
  process.exit(1);
}
console.log(`完了 ${((Date.now() - t0) / 1000).toFixed(0)}s`);

// ---- できた 3D ファイルを回収（いちばん大きい .glb） ----
const files = [];
for (const o of Object.values(hist.outputs)) for (const arr of Object.values(o)) if (Array.isArray(arr)) for (const f of arr) if (f?.filename) files.push(f);
const glbs = files.filter((f) => /\.glb$/i.test(f.filename));
if (!glbs.length) { console.error('GLB が出力にありません: ' + JSON.stringify(files).slice(0, 1000)); process.exit(1); }
let best = null;
for (const f of glbs) {
  const q = new URLSearchParams({ filename: f.filename, subfolder: f.subfolder || '', type: f.type || 'output' });
  const buf = Buffer.from(await (await fetch(`${URL_}/view?${q}`)).arrayBuffer());
  if (!best || buf.length > best.buf.length) best = { f, buf };
}
fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, best.buf);
console.log(`→ ${outPath}（${(best.buf.length / 1e6).toFixed(1)} MB, ${best.f.subfolder}/${best.f.filename}）`);

// スキルの素材庫にも入れる（次からは node tools/library.mjs use <名前> で作り直さずに使える）
const libName = nameArg ?? path.basename(outPath, path.extname(outPath));
const d = registerGen(outPath, {
  name: libName, source: imgPath,
  meta: {
    subject: subjectArg ?? undefined,
    how: `画像 → ComfyUI ${sys.system.comfyui_version} のネイティブ Pixal3D/TRELLIS.2（int8）で3D化（tools/comfy3d.mjs）`,
    license: 'Pixal3D / TRELLIS.2 は MIT。画像の読み取りに使う DINOv3 は Meta の DINOv3 License（輸出規制・軍事開発用途の禁止あり）',
    settings: sets, seconds: Math.round((Date.now() - t0) / 1000),
  },
});
console.log(`→ 素材庫 ${d}`);
