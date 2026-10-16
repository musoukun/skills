// viewglb.mjs — GLB を4方向（前・斜め前・横・後ろ斜め上）から撮って1枚に並べる（生成・ダウンロードしたモデルの確認用）
//   node tools/viewglb.mjs <モデル.glb> [出力.png] [--hdr assets/ph/goegap/goegap_2k.hdr]
// あわせて頂点数・面数・材質・テクスチャの大きさを表示する
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const hi = argv.indexOf('--hdr');
const hdr = hi >= 0 ? argv.splice(hi, 2)[1] : null;
const [glb, outArg] = argv;
if (!glb) { console.error('使い方: node tools/viewglb.mjs <モデル.glb> [出力.png] [--hdr ファイル]'); process.exit(1); }
const out = outArg ?? glb.replace(/\.glb$/i, '-views.png');
const rel = (p) => path.relative(root, path.resolve(p)).split(path.sep).join('/');

const page = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#222">
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const W = 640, H = 640;
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(W, H); r.toneMapping = THREE.ACESFilmicToneMapping; r.shadowMap.enabled = true;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x3a3d40);
const pm = new THREE.PMREMGenerator(r);
scene.environment = ${hdr ? `pm.fromEquirectangular(await new HDRLoader().loadAsync('${rel(hdr)}')).texture` : 'pm.fromScene(new RoomEnvironment(), 0.04).texture'};
const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(3, 5, 4); scene.add(sun);
const g = await new GLTFLoader().loadAsync('${rel(glb)}');
const m = g.scene; scene.add(m);
const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
const stats = { verts: 0, tris: 0, materials: new Set(), textures: [] };
m.traverse((o) => { if (!o.isMesh) return; stats.verts += o.geometry.attributes.position.count; stats.tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  for (const mt of [o.material].flat()) { stats.materials.add(mt.type + ' metal=' + mt.metalness + ' rough=' + mt.roughness);
    for (const k of ['map','normalMap','roughnessMap','metalnessMap','aoMap']) if (mt[k]?.image) stats.textures.push(k + ' ' + mt[k].image.width + 'x' + mt[k].image.height); } });
const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
const d = Math.max(size.x, size.y, size.z) * 2.1;
const views = [[0, 0.15, 1], [0.8, 0.45, 0.8], [1, 0.1, 0], [-0.7, 0.8, -0.7]];
const sheet = document.createElement('canvas'); sheet.width = W * 2; sheet.height = H * 2;
const sg = sheet.getContext('2d');
views.forEach(([x, y, z], i) => { const v = new THREE.Vector3(x, y, z).normalize().multiplyScalar(d); cam.position.copy(c).add(v); cam.lookAt(c); r.render(scene, cam); sg.drawImage(r.domElement, (i % 2) * W, Math.floor(i / 2) * H); });
window.RESULT = { png: sheet.toDataURL('image/png').split(',')[1], size: [size.x, size.y, size.z].map((v) => +v.toFixed(3)), verts: stats.verts, tris: Math.round(stats.tris), materials: [...stats.materials], textures: stats.textures };
</script>`;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u === '/view.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(page); return; }
  const p = path.join(root, u);
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const cache = process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright') : path.join(os.homedir(), '.cache', 'ms-playwright');
let exe;
try { const dd = fs.readdirSync(cache).filter((x) => /^chromium-\d+$/.test(x)).sort((a, b) => b.split('-')[1] - a.split('-')[1]); for (const x of dd) { const p = path.join(cache, x, 'chrome-win64', 'chrome.exe'); if (fs.existsSync(p)) { exe = p; break; } } } catch {}
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : { channel: 'chrome' }), headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const pg = await browser.newPage();
pg.on('pageerror', (e) => console.error('[pageerror]', e.message));
await pg.goto(`http://127.0.0.1:${server.address().port}/view.html`);
await pg.waitForFunction(() => window.RESULT, null, { timeout: 300000 });
const R = await pg.evaluate(() => window.RESULT);
fs.writeFileSync(out, Buffer.from(R.png, 'base64'));
console.log(`大きさ ${R.size.join(' x ')} / 頂点 ${R.verts.toLocaleString()} / 三角形 ${R.tris.toLocaleString()}`);
console.log(`材質: ${R.materials.join(' | ')}`);
console.log(`テクスチャ: ${R.textures.join(', ') || 'なし'}`);
console.log(`→ ${out}`);
await browser.close(); server.close();
