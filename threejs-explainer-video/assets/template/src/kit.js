// kit.js — 仕組み解説のシーンを組むための小道具（どの題材でも使う部品だけ）
// すべての動きは「時刻 t を渡すと必ず同じ絵になる」関数で書く。乱数はシード付き、状態は持たない。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export { THREE };

// ---------- 数と時間 ----------
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const seg = (t, a, b) => clamp((t - a) / (b - a)); // t が a→b を進む割合 0..1
export const ease = {
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  out: (k) => 1 - Math.pow(1 - k, 3),
  in: (k) => k * k * k,
  outBack: (k) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2),
};
export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const lerpV = (a, b, k) => new THREE.Vector3().lerpVectors(a, b, k);
// シード付き乱数（mulberry32）
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 舞台（レンダラーは1つを全カットで使い回す） ----------
export function createStage(width, height) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // r18x で PCFSoftShadowMap は廃止
  renderer.localClippingEnabled = true; // 断面（カットアウェイ）用
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // 金属の映り込み用の環境光
  return { renderer, width, height, env };
}

// 1カット分の scene + camera
//   bg: 色 / テクスチャ / loadHDR の結果（実写の背景）。env: 映り込みと環境光（既定は stage.env、HDR を渡すと実写の光）
//   dof: 被写界深度（背景ボケ）。bloom: 明るいもの（火花・炎）のにじみ { strength, radius, threshold }
export function makeShot(stage, { bg = 0x1a1a1a, env = null, fog = null, fov = 35, dof = null, bloom = null, envIntensity = 1, bgIntensity = 1, bgBlur = 0 } = {}) {
  const scene = new THREE.Scene();
  const hdr = bg && bg.env ? bg : null; // loadHDR の結果
  if (hdr) {
    scene.background = bgBlur > 0 ? hdr.env : hdr.bg;
    scene.backgroundBlurriness = bgBlur;
  } else scene.background = bg instanceof THREE.Texture ? bg : new THREE.Color(bg);
  scene.backgroundIntensity = bgIntensity;
  scene.environment = env?.env ?? env ?? hdr?.env ?? stage.env;
  scene.environmentIntensity = envIntensity;
  if (fog) scene.fog = new THREE.Fog(fog.color, fog.near, fog.far);
  const camera = new THREE.PerspectiveCamera(fov, stage.width / stage.height, 0.05, 2000);
  let composer = null, bokeh = null;
  if (dof || bloom) {
    composer = new EffectComposer(stage.renderer);
    composer.setPixelRatio(1);
    composer.setSize(stage.width, stage.height);
    composer.addPass(new RenderPass(scene, camera));
    if (dof) {
      bokeh = new BokehPass(scene, camera, { focus: dof.focus ?? 5, aperture: dof.aperture ?? 0.002, maxblur: dof.maxblur ?? 0.01 });
      composer.addPass(bokeh);
    }
    if (bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(stage.width, stage.height), bloom.strength ?? 0.6, bloom.radius ?? 0.4, bloom.threshold ?? 0.9));
    composer.addPass(new OutputPass());
  }
  const shot = {
    scene, camera, bokeh,
    // カメラを pos に置いて target を見る。dof のピントは target に合わせる
    look(pos, target) {
      camera.position.copy(pos);
      camera.lookAt(target);
      if (bokeh) bokeh.uniforms.focus.value = pos.distanceTo(target);
    },
    // 縦長の画面は横の画角が狭い（fov 35 で約20°）。target のまわり「横幅 width」がちょうど収まる距離に、
    // dir の向きからカメラを置く。距離を勘で決めるより、まず見せたい幅で考える
    fit(target, width, dir = v3(0, 0.2, 1), jitter = null) {
      const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect);
      const dist = width / 2 / Math.tan(hfov / 2);
      const pos = target.clone().addScaledVector(dir.clone().normalize(), dist);
      if (jitter) pos.add(jitter);
      shot.look(pos, target);
    },
    render() {
      if (composer) composer.render();
      else stage.renderer.render(scene, camera);
    },
  };
  return shot;
}

// 定番の照明: 太陽（影あり）＋空の照り返し
//   HDRI を env に使うときは環境光が写真から来るので hemi: 0 にする。dir は太陽の向き（loadHDR の sun を ×20 などで）
export function addSunlight(scene, { dir = v3(4, 8, 3), intensity = 2.6, color = 0xfff1dd, sky = 0xbfd4ff, ground = 0x6b5a40, range = 6, hemi = 0.6 } = {}) {
  if (hemi > 0) scene.add(new THREE.HemisphereLight(sky, ground, hemi));
  const sun = new THREE.DirectionalLight(color, intensity);
  sun.position.copy(dir);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -range, right: range, top: range, bottom: -range, near: 0.1, far: 40 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  return sun;
}

// ---------- 素材 ----------
export const mat = {
  metal: (color = 0x9fb3b8, roughness = 0.28) => new THREE.MeshStandardMaterial({ color, metalness: 1, roughness }),
  paint: (color = 0x3c4430, roughness = 0.75) => new THREE.MeshStandardMaterial({ color, metalness: 0.15, roughness }),
  matte: (color = 0xffffff, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, metalness: 0, roughness }),
  glow: (color = 0xffaa33) => new THREE.MeshBasicMaterial({ color, toneMapped: false }),
  water: (color = 0x2d6f78) => new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.05, transmission: 0, clearcoat: 1, clearcoatRoughness: 0.03 }),
};

// キャンバスに描いた模様をテクスチャにする（ノイズの地面・グラデーションの空など）
export function canvasTexture(w, h, draw, { repeat = 1, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat !== 1) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat, repeat); }
  tex.anisotropy = 8;
  return tex;
}
// 上から下へのグラデーション（背景・空に使う）
export const gradientTexture = (top, bottom) =>
  canvasTexture(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, top); gr.addColorStop(1, bottom);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
// まだらの地面（砂・土・コンクリート）
export function groundPlane(scene, { color = '#b89a6e', spot = '#8f7550', size = 200, repeat = 20, seed = 1 } = {}) {
  const r = rng(seed);
  const tex = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.globalAlpha = 0.05 + r() * 0.12;
      g.fillStyle = r() < 0.5 ? spot : '#e8d6b0';
      const x = r() * w, y = r() * h, s = 4 + r() * 40;
      for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { g.beginPath(); g.arc(x + dx, y + dy, s, 0, 7); g.fill(); }
    }
  }, { repeat });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

// ---------- 素材ファイル（tools/polyhaven.mjs で assets/ph/<id>/ に取ってくる） ----------
// 実写の HDRI: 背景（bg）と、映り込み・環境光（env）と、写っている太陽の向き（sun）を返す
//   clamp: 明るさの上限。写真の太陽は数万倍の明るさで、金属に映ると白く飛ぶ（bloom で画面がにじむ）。
//   太陽は addSunlight で別に足すので、HDRI 側は上限で切る（太陽が二重にならない）
export async function loadHDR(stage, url, { clamp: cap = 24 } = {}) {
  const tex = await new HDRLoader().setDataType(THREE.FloatType).loadAsync(url);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const sun = sunFromHDR(tex), horizon = horizonFromHDR(tex);
  const d = tex.image.data;
  for (let i = 0; i < d.length; i++) if (d[i] > cap) d[i] = cap;
  tex.needsUpdate = true;
  const env = new THREE.PMREMGenerator(stage.renderer).fromEquirectangular(tex).texture;
  return { bg: tex, env, sun, horizon };
}
// 地平線の少し上の平均色。霧の色にすると、地面の端が背景の写真に溶け込む
function horizonFromHDR(tex) {
  const { data, width: w, height: h } = tex.image;
  const c = [0, 0, 0];
  let n = 0;
  for (let r = Math.floor(h * 0.46); r < Math.floor(h * 0.5); r++) for (let x = 0; x < w; x += 4) {
    const i = (r * w + x) * 4;
    for (let k = 0; k < 3; k++) c[k] += Math.min(data[i + k], 4);
    n++;
  }
  return new THREE.Color(c[0] / n, c[1] / n, c[2] / n);
}
// HDRI のいちばん明るい点 = 太陽の向き。影の向きを背景の写真と合わせるのに使う
function sunFromHDR(tex) {
  const { data, width: w, height: h } = tex.image;
  let best = -1, bi = 0;
  for (let i = 0; i < w * h; i++) {
    const l = data[i * 4] * 0.2126 + data[i * 4 + 1] * 0.7152 + data[i * 4 + 2] * 0.0722;
    if (l > best) { best = l; bi = i; }
  }
  // three.js の正距円筒の向き: u = atan2(z, x)/2π + 0.5、v = asin(y)/π + 0.5（v は上が 1）
  const u = ((bi % w) + 0.5) / w, v = tex.flipY ? 1 - (Math.floor(bi / w) + 0.5) / h : (Math.floor(bi / w) + 0.5) / h;
  const a = (u - 0.5) * Math.PI * 2, el = (v - 0.5) * Math.PI;
  return v3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).normalize();
}
// glTF モデル（影を落とす・受ける設定込み）。同じモデルを何個も置くときは .clone()
//   size を渡すと「いちばん長い辺 = size、底面 = y 0、xz の中心 = 原点」にそろえた入れ物で返す（素材ごとの縮尺の違いを吸収）
export async function loadGLTF(url, { size = null } = {}) {
  const g = await new GLTFLoader().loadAsync(url);
  g.scene.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  if (!size) return g.scene;
  const box = new THREE.Box3().setFromObject(g.scene), dim = box.getSize(v3(0, 0, 0)), c = box.getCenter(v3(0, 0, 0));
  const k = size / Math.max(dim.x, dim.y, dim.z);
  g.scene.scale.setScalar(k);
  g.scene.position.set(-c.x * k, -box.min.y * k, -c.z * k);
  const wrap = new THREE.Group();
  wrap.add(g.scene);
  return wrap;
}
// PBR テクスチャ一式（diff / nor_gl / rough / ao / disp）を1つの材質にする
//   repeat: 1m あたりではなく「面全体で何回くり返すか」。color を渡すと色だけ差し替え（模様は roughness と normal だけ使う）
export async function loadPBR(dir, { repeat = 1, color = null, metalness = 0, normalScale = 1, displacementScale = 0, roughness = 1 } = {}) {
  const tl = new THREE.TextureLoader();
  const load = async (name, srgb) => {
    try {
      const t = await tl.loadAsync(`${dir}/${name}`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(...(Array.isArray(repeat) ? repeat : [repeat, repeat]));
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    } catch { return null; }
  };
  const [map, normalMap, roughnessMap, aoMap, displacementMap] = await Promise.all([
    color ? null : load('diff.jpg', true), load('nor_gl.jpg'), load('rough.jpg'), load('ao.jpg'), displacementScale ? load('disp.png') : null,
  ]);
  return new THREE.MeshStandardMaterial({
    map, normalMap, roughnessMap, aoMap, displacementMap, displacementScale, metalness, roughness,
    normalScale: new THREE.Vector2(normalScale, normalScale), ...(color != null ? { color } : {}),
  });
}

// なめらかなノイズ（値ノイズの重ね合わせ）。地形の起伏に使う
function vnoise(x, z, seed) {
  const h = (i, j) => { let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 2147483647); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  return lerp(lerp(h(xi, zi), h(xi + 1, zi), sx), lerp(h(xi, zi + 1), h(xi + 1, zi + 1), sx), sz);
}
export const fbm = (x, z, { seed = 1, octaves = 5 } = {}) => {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) { s += a * vnoise(x * f, z * f, seed + i); a *= 0.5; f *= 2.03; }
  return s;
};
// 起伏のある地面。heightAt(x, z) を返すので、岩や物をその高さに置ける
//   height: 起伏の高さ(m)、scale: 起伏の大きさ(m)、flat: { z0, z1 } の帯だけ平らにする（道・飛ぶ下など）
export function terrain(scene, material, { size = 160, segments = 384, y = 0, height = 3, scale = 18, seed = 3, flat = null } = {}) {
  const heightAt = (x, z) => {
    let k = 1;
    if (flat) k = seg(Math.abs(z - (flat.z0 + flat.z1) / 2), (flat.z1 - flat.z0) / 2, (flat.z1 - flat.z0) / 2 + 6);
    return y + (fbm(x / scale, z / scale, { seed }) - 0.5) * 2 * height * (0.25 + 0.75 * k);
  };
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return { mesh, heightAt };
}
// モデルをばらまく（地面の高さに合わせ、向きと大きさを乱数で変える）。avoid(x, z) が true の場所には置かない
export function scatter(scene, model, { count = 30, area = [-60, 60, -60, 60], heightAt = () => 0, scale = [0.5, 1.5], sink = 0.15, seed = 5, avoid = null } = {}) {
  const r = rng(seed), group = new THREE.Group();
  for (let i = 0, tries = 0; i < count && tries < count * 20; tries++) {
    const x = lerp(area[0], area[1], r()), z = lerp(area[2], area[3], r());
    if (avoid && avoid(x, z)) continue;
    const m = model.clone();
    const s = lerp(scale[0], scale[1], r());
    m.scale.setScalar(s);
    m.rotation.set((r() - 0.5) * 0.3, r() * Math.PI * 2, (r() - 0.5) * 0.3);
    m.position.set(x, heightAt(x, z) - sink * s, z);
    group.add(m);
    i++;
  }
  scene.add(group);
  return group;
}

// ---------- 形 ----------
// 回転体（砲弾・瓶・ネジ・ピストンなど軸対称のもの）。profile は [半径, 高さ] を下から順に
export function lathe(profile, material, segments = 96) {
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.castShadow = m.receiveShadow = true;
  return m;
}
// 丸みのある先端の輪郭を作る: 半径 r の円柱が、高さ h の間に nose 形でとがる
//   nose = 0 で平たい（鈍い）、1 で鋭い。tipR は先端に残す平らな半径
export function noseProfile(r, h, { nose = 1, tipR = 0, steps = 24 } = {}) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const shape = lerp(Math.sqrt(1 - k * k), (1 - k) * (1 + 0.6 * k), nose); // 半球（鈍い）→ オジーブ（鋭い）
    pts.push([Math.max(tipR, r * shape), h * k]);
  }
  pts.push([0, h]);
  return pts;
}
// 断面を見せる: 物体の材質に切断面を設定する（plane の法線側だけ残る）
export function cutaway(object, plane) {
  object.traverse((o) => {
    if (!o.material) return;
    for (const m of [o.material].flat()) { m.clippingPlanes = [plane]; m.clipShadows = true; m.side = THREE.DoubleSide; }
  });
}

// ---------- 当たる場所と跳ね方（物理の見た目を、目分量ではなく形から決める） ----------
// 画像から作ったモデルは「元画像のカメラから見た向き」のまま斜めに置かれている（Pixal3D / TRELLIS など）。
// 頂点の広がりの主軸（上から見た長い向き）を求め、前（主軸のうち長く突き出た側 = 砲身・機首）を -x に向ける
// rotation.y を返す。結果は viewglb や still で必ず目で確かめる
export function headingYaw(object, { samples = 20000 } = {}) {
  object.updateMatrixWorld(true);
  const inv = object.matrixWorld.clone().invert(), pts = [], p = v3(0, 0, 0);
  object.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position, stepN = Math.max(1, Math.floor(pos.count / samples));
    const m = inv.clone().multiply(o.matrixWorld);
    for (let i = 0; i < pos.count; i += stepN) { p.fromBufferAttribute(pos, i).applyMatrix4(m); pts.push([p.x, p.z]); }
  });
  const mx = pts.reduce((s, q) => s + q[0], 0) / pts.length, mz = pts.reduce((s, q) => s + q[1], 0) / pts.length;
  let cxx = 0, czz = 0, cxz = 0;
  for (const [x, z] of pts) { cxx += (x - mx) ** 2; czz += (z - mz) ** 2; cxz += (x - mx) * (z - mz); }
  const phi = 0.5 * Math.atan2(2 * cxz, cxx - czz), ax = Math.cos(phi), az = Math.sin(phi);
  let lo = Infinity, hi = -Infinity;
  for (const [x, z] of pts) { const d = (x - mx) * ax + (z - mz) * az; lo = Math.min(lo, d); hi = Math.max(hi, d); }
  const s = hi >= -lo ? 1 : -1; // 長く突き出ている側を前とする
  return Math.atan2(s * az, s * ax) - Math.PI; // rotation.y でこの角度だけ回すと、前が -x を向く
}
// モデルの表面の点と法線（面の向き）をレイで求める。spread > 0 なら周りにもレイを撃って法線を平均する
// （生成モデルの表面は細かくデコボコしているので、1本だけだと向きがばらつく）
export function surfaceHit(object, origin, dir, { spread = 0, grid = 2 } = {}) {
  object.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(), d = dir.clone().normalize();
  const one = (o) => {
    rc.set(o, d);
    const h = rc.intersectObject(object, true)[0];
    if (!h || !h.face) return null;
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    if (n.dot(d) > 0) n.negate(); // 撃った側を向く法線にそろえる
    return { point: h.point.clone(), normal: n };
  };
  const c = one(origin);
  if (!c || !spread) return c;
  const u = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0)).normalize();
  const w = new THREE.Vector3().crossVectors(d, u);
  const sum = v3(0, 0, 0);
  let k = 0;
  for (let i = -grid; i <= grid; i++) for (let j = -grid; j <= grid; j++) {
    const h = one(origin.clone().addScaledVector(u, (i * spread) / grid).addScaledVector(w, (j * spread) / grid));
    if (h) { sum.add(h.normal); k++; }
  }
  c.flatness = sum.length() / Math.max(1, k); // 1 に近いほど平らな面（法線がそろっている）
  c.normal = sum.normalize();
  return c;
}
// 斜めの面を探す: from から step ずつずらしながら dir にレイを撃ち、法線の上向き成分が minUp〜maxUp で
// 平らな（flatness が minFlat 以上の）面が続く最初の区間を見つけ、その真ん中を返す（端に当てると角に当たって見える）。
// 戦車の上段の傾斜装甲、車体の斜めの側面などに使う。下向きの斜面（下段）は minUp で外れる
// 重い処理（数十万三角形のモデルにレイを数千本）なので、結果は呼ぶ側で使い回す（例題の placeTank を参照）。
// まず1本のレイで向きが近い高さだけに絞り、平らさを確かめる周りのレイはそこだけで撃つ
export function findSlope(object, { from, dir, step, count = 60, minUp = 0.3, maxUp = 0.85, minFlat = 0.9, spread = 0.25 }) {
  const run = [];
  for (let i = 0; i < count; i++) {
    const o = from.clone().addScaledVector(step, i);
    const quick = surfaceHit(object, o, dir);
    const near = quick && quick.normal.y >= minUp - 0.25 && quick.normal.y <= maxUp + 0.25;
    const h = near ? surfaceHit(object, o, dir, { spread, grid: 1 }) : null;
    const ok = h && h.normal.y >= minUp && h.normal.y <= maxUp && h.flatness >= minFlat;
    if (ok) run.push(h);
    else if (run.length) break;
  }
  if (!run.length) return null;
  const mid = run[Math.floor(run.length / 2)];
  mid.normal = run.reduce((s, h) => s.add(h.normal), v3(0, 0, 0)).normalize(); // 区間全体の向きの平均
  mid.span = [run[0].point, run[run.length - 1].point];
  return mid;
}
// 斜面にかすったときの跳ね返り: 速度のうち面に沿う成分はほぼ残り、面に垂直な成分は小さく返る。
// 鏡のように反射させる（reflect）と大きく跳ねすぎ、回転を足すとアクロバットに見える
export function glance(v, n, { bounce = 0.25, keep = 0.85 } = {}) {
  const vn = n.clone().multiplyScalar(v.dot(n));
  const along = v.clone().sub(vn).multiplyScalar(keep);
  return along.add(vn.negate().multiplyScalar(bounce));
}
// 時間を止める: t0 までは普通に進み、そのあと slow 秒かけてゆっくりになり、t0 + slow*hold で止まる
// （当たった瞬間に時間が止まって、止まった世界をカメラだけが動く、を作る）
export const slowToStop = (t, t0, { slow = 0.25, hold = 0.6 } = {}) =>
  t <= t0 ? t : t0 + slow * hold * (1 - Math.exp(-(t - t0) / (slow * hold)));

// 解説の「止めて説明」: 仕組みが働く瞬間ごとに時間を止め、説明の字幕が変わったら再開する。
//   holds = [{ at: 世界の時刻（その瞬間）, until: 再開するカットの時刻（ctx.cue で字幕に合わせる） }]（at の順に並べる）
//   返す関数 W(t) で「カットの時刻 t → 世界の時刻」。動き・火花・炎はすべて W(t) で動かし、カメラと名札は t で動かす
//   （止まった世界をカメラが回り込む、ができる）。止まる直前は ramp 秒かけて減速するので、急停止に見えない
export function timeWarp(holds, { ramp = 0.12 } = {}) {
  // 世界の進む速さ: 普段 1、止まる直前の ramp 秒で 1→0 に落ち、止まっている間は 0、until で 1 に戻る。
  // 世界の時刻 = 速さを足し合わせたもの = カットの時刻 − 遅れ（減速中の遅れ r²/2ramp ＋ 止まっていた長さ）
  const segs = [];
  let lag = 0; // ここまでの遅れ（カットの時刻 − 世界の時刻）
  for (const h of holds) {
    const a = h.at - ramp / 2 + lag; // 減速を始めるカット時刻（減速で ramp/2 進んで、ちょうど at で止まる）
    const s = a + ramp;              // 止まるカット時刻
    const len = Math.max(0, h.until - s);
    segs.push({ a, s, len });
    lag += ramp / 2 + len;
  }
  return (t) => {
    let w = t;
    for (const { a, s, len } of segs) {
      if (t <= a) break;
      const r = Math.min(t, s) - a;
      w -= (r * r) / (2 * ramp);
      if (t > s) w -= Math.min(t - s, len);
    }
    return w;
  };
}

// カメラをキーフレームで動かす: keys = [{ t, target, width, dir }]（target / dir は Vector3 か (T) => Vector3）。
// 隣どうしのキーの間をイージングでつなぐ。カットをまたいで続くカメラは、両方のカットで同じ keys を
// 動画全体の時刻 T で引くと、切り替わりでも位置が飛ばない
export function camKeys(keys) {
  const val = (x, T) => (typeof x === 'function' ? x(T) : x.clone());
  return (T) => {
    let i = keys.findIndex((k) => k.t > T);
    if (i === -1) i = keys.length;
    if (i === 0) return { target: val(keys[0].target, T), width: keys[0].width, dir: val(keys[0].dir, T) };
    const a = keys[i - 1], b = keys[Math.min(i, keys.length - 1)];
    const k = a === b ? 0 : (b.ease ?? ease.inOut)(seg(T, a.t, b.t));
    return { target: lerpV(val(a.target, T), val(b.target, T), k), width: lerp(a.width, b.width, k), dir: lerpV(val(a.dir, T), val(b.dir, T), k).normalize() };
  };
}

// ---------- 効果（時刻 t → 見た目。t < 0 では見えない） ----------
// 火花・破片・しぶき: 原点から飛び散る粒。update(t) の t は発生からの秒数
//   描き方は3通り:
//   - 既定: 点（size）
//   - trail: 秒 … 速さの向きに伸びた光の筋（火花はこれ。点より桁違いに本物らしい）。brightness で HDR の明るさ（bloom で光る）
//   - instance: { geometry, material } … 粒ごとにメッシュ（屈折する水滴・金属片など）。size は粒の大きさ
export function burst(scene, { count = 300, color = 0xffc070, size = 0.04, speed = 4, spread = 1, dir = v3(0, 1, 0), gravity = -6, life = 0.8, seed = 7, additive = true, at = v3(0, 0, 0), trail = 0, brightness = 1, instance = null, floor = -Infinity } = {}) {
  const r = rng(seed);
  const vel = [], lives = [], sizes = [], spin = [];
  const d = dir.clone().normalize();
  for (let i = 0; i < count; i++) {
    const rand = v3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize().multiplyScalar(spread);
    vel.push(d.clone().add(rand).normalize().multiplyScalar(speed * (0.3 + r() * 0.7)));
    lives.push(life * (0.4 + r() * 0.6));
    sizes.push(size * (0.4 + r() * 0.9));
    spin.push(v3(r(), r(), r()).multiplyScalar(12));
  }
  // 発生から tt 秒後の位置（原点基準）。floor より下には行かない
  const at_ = (i, tt, out) => out.set(vel[i].x * tt, Math.max(floor - at.y, vel[i].y * tt + 0.5 * gravity * tt * tt), vel[i].z * tt);
  const blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
  const tmp = v3(0, 0, 0), tmp2 = v3(0, 0, 0);
  let object, write;
  if (instance) {
    object = new THREE.InstancedMesh(instance.geometry, instance.material, count);
    object.castShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = v3(1, 1, 1);
    write = (i, tt, alive) => {
      at_(i, tt, tmp);
      q.setFromEuler(e.set(spin[i].x * tt, spin[i].y * tt, spin[i].z * tt));
      object.setMatrixAt(i, m4.compose(tmp, q, sc.setScalar(alive ? sizes[i] : 0)));
    };
  } else if (trail > 0) {
    const pos = new Float32Array(count * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const c = new THREE.Color(color).multiplyScalar(brightness);
    object = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: c, transparent: true, depthWrite: false, blending, toneMapped: false }));
    write = (i, tt, alive) => {
      at_(i, alive ? tt : 0, tmp);
      at_(i, alive ? Math.max(0, tt - trail) : 0, tmp2);
      pos.set([tmp.x, tmp.y, tmp.z, tmp2.x, tmp2.y, tmp2.z], i * 6);
      if (!alive) pos.fill(9999, i * 6, i * 6 + 6);
    };
  } else {
    const pos = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    object = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(color).multiplyScalar(brightness), size, transparent: true, depthWrite: false, blending, toneMapped: !additive }));
    write = (i, tt, alive) => { at_(i, tt, tmp); pos.set(alive ? [tmp.x, tmp.y, tmp.z] : [9999, 9999, 9999], i * 3); };
  }
  object.position.copy(at);
  object.frustumCulled = false;
  scene.add(object);
  return {
    object,
    // fade: 0〜1 の倍率（時間を止めたまま消していくときなどに使う）
    update(t, fade = 1) {
      object.visible = t >= 0 && t < life && fade > 0;
      if (!object.visible) return;
      for (let i = 0; i < count; i++) write(i, t, t < lives[i]);
      if (instance) object.instanceMatrix.needsUpdate = true;
      else {
        object.geometry.attributes.position.needsUpdate = true;
        object.material.opacity = (1 - seg(t, life * 0.5, life)) * fade;
      }
    },
  };
}

// 火の玉・煙: やわらかい丸いスプライトを膨らませて色を変える。update(t) の t は発生からの秒数
const softDot = () =>
  canvasTexture(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
export function fireball(scene, { count = 40, radius = 1.2, life = 1.6, seed = 3, at = v3(0, 0, 0), dir = v3(0, 0.6, 0) } = {}) {
  const r = rng(seed), tex = softDot();
  const puffs = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const s = new THREE.Sprite(m);
    scene.add(s);
    puffs.push({ s, m, off: v3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).multiplyScalar(radius * 0.6).add(dir.clone().multiplyScalar(r())), delay: r() * 0.25, size: radius * (0.6 + r() * 0.8) });
  }
  const hot = new THREE.Color(0xfff2b0), mid = new THREE.Color(0xff8a1e), cool = new THREE.Color(0x3a2a22);
  return {
    update(t, fade = 1) {
      for (const p of puffs) {
        const k = seg(t - p.delay, 0, life);
        p.s.visible = t - p.delay >= 0 && k < 1;
        if (!p.s.visible) continue;
        const grow = ease.out(clamp(k * 2));
        p.s.position.copy(at).addScaledVector(p.off, 0.3 + grow);
        p.s.scale.setScalar(p.size * (0.3 + grow));
        p.m.color.copy(k < 0.35 ? hot.clone().lerp(mid, k / 0.35) : mid.clone().lerp(cool, (k - 0.35) / 0.65));
        p.m.blending = k < 0.5 ? THREE.AdditiveBlending : THREE.NormalBlending;
        p.m.opacity = (1 - k) * (k < 0.5 ? 1 : 0.7) * fade;
        p.s.visible = p.s.visible && fade > 0;
      }
    },
  };
}

// 空気の流れ・速度線: 物体のまわりを後ろへ流れる細い線。update(t) で流す
export function streaks(parent, { count = 40, radius = 0.5, length = 1.6, speed = 6, color = 0xffffff, seed = 11, axis = 'x', opacity = 0.5 } = {}) {
  const r = rng(seed), lines = [];
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, rad = radius * (0.9 + r() * 0.8);
    const geo = new THREE.BufferGeometry().setFromPoints([v3(0, 0, 0), v3(-length * (0.4 + r() * 0.6), 0, 0)]);
    const l = new THREE.Line(geo, material);
    l.userData = { a, rad, phase: r() };
    parent.add(l);
    lines.push(l);
  }
  return {
    material,
    update(t, span = 3) {
      for (const l of lines) {
        const x = span / 2 - (((t * speed) / span + l.userData.phase) % 1) * span;
        const y = Math.cos(l.userData.a) * l.userData.rad, z = Math.sin(l.userData.a) * l.userData.rad;
        if (axis === 'x') l.position.set(x, y, z);
        else l.position.set(y, x, z);
      }
    },
  };
}

// 水面: 細かい面を、さざ波（いつも）と波紋（hits の時刻・場所から広がる輪）で毎コマ動かす
//   hits: [{ t0, x, z, amp }]。update(t) の t はカットの頭からの秒
export function waterSurface(scene, material, { size = 30, segments = 320, center = v3(0, 0, 0), hits = [], chop = 0.006, speed = 1.1, k = 9, decay = 1.2 } = {}) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(center);
  mesh.receiveShadow = true;
  scene.add(mesh);
  const p = geo.attributes.position, n = p.count;
  const xs = new Float32Array(n), zs = new Float32Array(n);
  for (let i = 0; i < n; i++) { xs[i] = p.getX(i); zs[i] = p.getZ(i); }
  return {
    mesh,
    update(t) {
      for (let i = 0; i < n; i++) {
        const x = xs[i], z = zs[i];
        let h = chop * (Math.sin(x * 3.1 + t * 1.7) * Math.cos(z * 2.3 - t * 1.3) + 0.5 * Math.sin((x + z) * 6.7 - t * 2.9));
        for (const w of hits) {
          const age = t - w.t0;
          if (age <= 0) continue;
          const rr = Math.hypot(x - w.x + center.x, z - w.z + center.z), front = age * speed;
          if (rr > front + 0.3) continue;
          const env = Math.exp(-decay * age) * Math.exp(-0.6 * Math.max(0, front - rr)) * seg(front + 0.3 - rr, 0, 0.3);
          h += w.amp * env * Math.cos(k * (rr - front)) / (1 + rr * 1.5);
        }
        p.setY(i, h);
      }
      p.needsUpdate = true;
      geo.computeVertexNormals();
    },
  };
}

// ---------- 2D の書き込み（字幕・引き出し線ラベル）はランタイムが最後に重ねる ----------
// シーンの update 中に ctx.label(worldPos, '文字') を呼ぶと、そのコマにだけ引き出し線付きの名札が出る
