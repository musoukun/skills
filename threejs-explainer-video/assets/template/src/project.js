// project.js — この動画のカット。script.json の scenes[].id と同じ名前で並べる
// 例題: 先が丸い徹甲弾のなぞ（APCBC）。座標の約束: 砲弾は +x 向き、長さの単位はおよそ「砲弾の直径 = 0.6」
import {
  THREE, makeShot, addSunlight, gradientTexture, lathe, noseProfile, cutaway,
  burst, fireball, streaks, mat, v3, lerpV, seg, ease, lerp, clamp, rng,
  loadHDR, loadGLTF, loadPBR, terrain, scatter, waterSurface, surfaceHit, findSlope, glance, slowToStop, camKeys, headingYaw, timeWarp,
} from './kit.js';

// ---------- 素材（すべて Poly Haven の CC0。取得: node tools/polyhaven.mjs get <id>。一覧は assets/CREDITS.md） ----------
const PH = 'assets/ph';
export async function preload(ctx) {
  const [desert, pond, ground, armor, steel, boulder, tank] = await Promise.all([
    loadHDR(ctx.stage, `${PH}/goegap/goegap_2k.hdr`),
    loadHDR(ctx.stage, `${PH}/cloudy_vondelpark/cloudy_vondelpark_2k.hdr`), // 曇り空・木・池。明るい空が水面に映る
    loadPBR(`${PH}/dry_ground_01`, { repeat: 60 }),
    loadPBR(`${PH}/green_metal_rust`, { repeat: [2, 3] }),
    // 傷のある金属板の「粗さと凹凸」だけ借りて、色は鋼にする（完全にきれいな金属はプラスチックに見える）
    loadPBR(`${PH}/blue_metal_plate`, { repeat: [1, 2], color: 0xc2ccd0, metalness: 1, normalScale: 0.35, roughness: 1.6 }),
    loadGLTF(`${PH}/namaqualand_boulder_03/namaqualand_boulder_03.gltf`, { size: 1 }),
    // 戦車: Codex で作った画像（gen/tank.png）をローカルの ComfyUI（Pixal3D）で3D化したもの（tools/comfy3d.mjs）
    loadGLTF('assets/gen/tank.glb', { size: 1 }).catch(() => null), // まだ作っていなければ戦車なしで動く
  ]);
  // 生成モデルは元画像の斜めの向きのままなので、前を -x に向ける回転を一度だけ求めておく
  return { desert, pond, ground, armor, steel, boulder, tank, tankYaw: tank ? headingYaw(tank) : 0 };
}
let A = {}; // preload の結果（カットを組み立てるときに ctx.assets から入れる）

// ---------- この題材の部品 ----------
const R = 0.3, BODY = 1.3;
const steel = () => A.steel ?? mat.metal(0xa9b8bc, 0.3);
const copper = () => mat.metal(0xb87333, 0.35);

// 砲弾: type = 'pointed' | 'blunt' | 'capped'。返す root の原点が先端、+x を向く
function makeShell(type) {
  const root = new THREE.Group(), spin = new THREE.Group(), inner = new THREE.Group();
  root.add(spin); spin.add(inner);
  inner.rotation.z = -Math.PI / 2; // lathe の +y を +x へ
  const noseH = type === 'pointed' ? 0.78 : 0.2;
  const nose = noseProfile(R, noseH, { nose: type === 'pointed' ? 1 : 0, tipR: type === 'pointed' ? 0 : 0.1 });
  const core = lathe([[0, 0], [R - 0.03, 0], [R, 0.03], [R, BODY], ...nose.map(([r, y]) => [r, BODY + y])], steel());
  const band = lathe([[R, 0.16], [R + 0.018, 0.18], [R + 0.018, 0.32], [R, 0.34]], copper());
  inner.add(core, band);
  let cap = null, len = BODY + noseH;
  if (type === 'capped') {
    const capH = 0.9;
    cap = lathe(noseProfile(R + 0.006, capH, { nose: 1 }).map(([r, y]) => [r, BODY - 0.05 + y]), mat.metal(0x7f8a8e, 0.42));
    cap.material.side = THREE.DoubleSide;
    inner.add(cap);
    len = BODY - 0.05 + capH;
  }
  inner.position.x = -len; // 先端を原点に
  return { root, spin, inner, core, cap, len };
}

// 斜めの装甲板。tilt は垂直から奥へ倒した角度。P = 表面の当たる点、n = 表面の法線
function makePlate(scene, tilt = (60 * Math.PI) / 180, { at = v3(0, 0, 0) } = {}) {
  const T = 0.5;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(T, 9, 7), A.armor ?? mat.paint(0x4c5434, 0.8));
  plate.castShadow = plate.receiveShadow = true;
  plate.rotation.z = -tilt;
  const n = v3(-Math.cos(tilt), Math.sin(tilt), 0);
  plate.position.copy(at).addScaledVector(n, -T / 2);
  // ボルトの頭（大きさの手がかり）
  const boltMat = mat.paint(0x3a4028, 0.6);
  for (const [u, w] of [[-1.5, -1.4], [-1.5, 1.4], [1.5, -1.4], [1.5, 1.4], [0, -1.4], [0, 1.4]]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16), boltMat);
    b.rotation.z = Math.PI / 2;
    b.position.set(-T / 2 - 0.02, u, w);
    plate.add(b);
  }
  scene.add(plate);
  return { plate, P: at.clone(), n };
}

// 生成した戦車の大きさ（元のモデルのいちばん長い辺を何 m にするか）。20 で車高 約10m＝砲弾の直径の約17倍。
// 小さいと砲弾が戦車と同じくらいに見えて嘘っぽい（実物は 1:40 くらい。見やすさとの折り合いで 1:15〜20）
const TANK_SIZE = 20;

// 戦車を置き、正面の「上段の傾斜装甲」を形から探す。返す P は当たる点、n はその面の向き（どちらもワールド座標）
//   at: 戦車を置く地面の点。砲弾は -x から +x へ飛んでくる前提
//   向き: 生成モデルは元画像の斜めの向きのまま → headingYaw で前を -x に向け、さらに傾斜装甲の面が真正面（法線の z = 0）を
//   向くように微調整する。こうすると砲弾は面にまっすぐ（横ずれなしで）当たり、跳ねる向きも上下だけになる
//   探すのは重いので、最初の1回だけ原点に置いて求め、戦車から見た位置（local）として A に覚えておく
let slopeCache = null;
function placeTank(scene, at) {
  const tank = A.tank.clone();
  tank.scale.setScalar(TANK_SIZE);
  if (!slopeCache) {
    tank.rotation.y = A.tankYaw;
    tank.updateMatrixWorld(true);
    const h = new THREE.Box3().setFromObject(tank).getSize(v3(0, 0, 0)).y;
    const scan = () => findSlope(tank, { from: v3(-40, h * 0.05, 0), dir: v3(1, 0, 0), step: v3(0, h * 0.01, 0), count: 70 });
    let s = scan();
    if (!s) throw new Error('戦車の正面に斜めの面が見つかりません（headingYaw の向きを viewglb で確認）');
    tank.rotation.y += Math.atan(s.normal.z / s.normal.x);
    tank.updateMatrixWorld(true);
    s = scan() ?? s;
    const inv = tank.matrixWorld.clone().invert();
    slopeCache = { yaw: tank.rotation.y, localP: s.point.clone().applyMatrix4(inv), localN: s.normal.clone().transformDirection(inv), height: h };
  }
  tank.rotation.y = slopeCache.yaw;
  tank.position.copy(at);
  scene.add(tank);
  tank.updateMatrixWorld(true);
  const P = slopeCache.localP.clone().applyMatrix4(tank.matrixWorld);
  const n = slopeCache.localN.clone().transformDirection(tank.matrixWorld);
  return { tank, P, n, height: slopeCache.height };
}

const reflect = (v, n) => v.clone().sub(n.clone().multiplyScalar(2 * v.dot(n)));
const aim = (obj, dir) => obj.quaternion.setFromUnitVectors(v3(1, 0, 0), dir.clone().normalize());
const shake = (t, amp, seed = 1) => v3(Math.sin(t * 61 + seed) * amp, Math.sin(t * 47 + seed * 2) * amp, 0);

// 砂漠（屋外）とスタジオ（暗い背景で物だけ見せる）の2つの舞台
//   砂漠 = 実写の HDRI（空・遠くの山・光）＋ 写真のテクスチャを貼った起伏のある地面 ＋ 同じ土地で撮られた岩
//   z が flat の帯（物が動く場所）だけ平らにして、岩も置かない
function desert(ctx, { flat = [-5, 5], ...opt } = {}) {
  A = ctx.assets;
  const hdr = A.desert;
  const shot = makeShot(ctx.stage, {
    bg: hdr, fog: { color: hdr.horizon, near: 30, far: 160 },
    dof: { aperture: 0.0045, maxblur: 0.014 }, bloom: { strength: 0.45, radius: 0.35, threshold: 6 } // 金属に映る太陽はにじませず、火花（明るさ 12）だけ光らせる, ...opt,
  });
  shot.sun = addSunlight(shot.scene, { dir: hdr.sun.clone().multiplyScalar(30), intensity: 3.2, range: 10, hemi: 0 });
  const land = terrain(shot.scene, A.ground, { y: -1.6, height: 2.2, scale: 20, seed: 4, size: 260, segments: 420, flat: { z0: flat[0], z1: flat[1] } });
  scatter(shot.scene, A.boulder, {
    count: 140, area: [-120, 120, -120, 60], heightAt: land.heightAt, scale: [0.4, 3.2], seed: 8,
    avoid: (x, z) => z > flat[0] - 3 && z < flat[1] + 3,
  });
  shot.land = land;
  // 影の範囲は物のそばに寄せる（太陽の向きは HDRI に写っている太陽と同じ）
  shot.follow = (p) => { shot.sun.target.position.copy(p); shot.sun.position.copy(p).addScaledVector(hdr.sun, 30); };
  return shot;
}
function studio(ctx, opt = {}) {
  A = ctx.assets;
  // 背景は暗いまま、金属の映り込みだけ実写の HDRI にする
  const shot = makeShot(ctx.stage, { bg: gradientTexture('#30363b', '#08090a'), env: A.desert, dof: { aperture: 0.002, maxblur: 0.008 }, envIntensity: 0.7, ...opt });
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2, 4, 5);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 3); rim.position.set(-4, 2, -4);
  shot.scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.15));
  return shot;
}

// 装甲のカットの的: 戦車の上段の傾斜装甲（ただの板ではなく本物の面）。当たる点 P が原点にくるよう世界ごとずらす
//   （戦車のモデルが無いときだけ、斜めの板で代用する）
function armorTarget(shot) {
  if (!A.tank) return makePlate(shot.scene);
  const { P, n } = placeTank(shot.scene, v3(0, shot.land.heightAt(0, 0) - 0.05, 0));
  for (const o of shot.scene.children) o.position.sub(P);
  return { P: v3(0, 0, 0), n };
}

// 冒頭の「並走 → 傾斜装甲に着弾 → 時間停止 → 先端へズーム」を1つの世界で作る（hook と reveal が共有）
function strikeAndFreeze(ctx) {
  const shot = desert(ctx);
  const s = makeShell('blunt'); // 実は先が丸い徹甲弾（遠くからは尖って見えても、止めて寄ると分かる）
  shot.scene.add(s.root);
  const air = streaks(s.root, { count: 30, radius: 0.42, length: 1.6, speed: 18, opacity: 0.18 });
  const TX = 30;
  const { P, n } = A.tank ? placeTank(shot.scene, v3(TX, shot.land.heightAt(TX, 0) - 0.05, 0)) : { P: v3(TX, 0.5, 0), n: v3(-1, 0, 0) };
  // 砲弾は当たる点の高さをまっすぐ飛んでくる（面に対して斜めに当たる＝傾斜装甲の意味が見える）
  const x0 = -40, speed = 14, tHit = (P.x - x0) / speed;
  const flyY = (x) => lerp(shot.land.heightAt(x, 0) + 1.9, P.y, seg(x, P.x - 26, P.x - 8));
  const up = glance(v3(1, 0, 0), n).normalize(); // 面に沿って上へ（火花の向き）
  const sparks = burst(shot.scene, { at: P, dir: up.clone().add(n.clone().multiplyScalar(0.6)), spread: 0.7, speed: 7, count: 420, life: 0.9, seed: 13, trail: 0.05, brightness: 7 });
  const flash = fireball(shot.scene, { at: P.clone().addScaledVector(n, 0.4), count: 14, radius: 0.8, life: 0.9, seed: 6, dir: up.clone().multiplyScalar(0.6) });
  // 動画全体の時刻で決める（reveal に切り替わっても続く）
  const tRev = ctx.tl.scenes.find((x) => x.id === 'reveal');
  const R0 = tRev.t0, R1 = R0 + ctx.cue('reveal', 1), R2 = tRev.t1;
  const W = (T) => slowToStop(T, tHit, { slow: 0.25, hold: 0.6 }); // 当たって 0.15 秒で時間が止まる
  const shellAt = (w) => { const x = Math.min(P.x, x0 + w * speed); return v3(x, flyY(x), 0); };
  const nose = P.clone(), body = P.clone().add(v3(-1.0, 0, 0));
  const cam = camKeys([
    { t: 0, target: (T) => shellAt(W(T)).add(v3(-0.9, 0, 0)), width: 3.6, dir: v3(-0.8, 0.42, 1) },
    { t: tHit - 1.6, target: (T) => shellAt(W(T)).add(v3(-0.9, 0, 0)), width: 2.8, dir: v3(0.45, 0.18, 1) },
    // 引きの画: 砲弾と当たる点のまん中を中心に、両方が入る幅
    { t: tHit - 0.2, target: (T) => lerpV(shellAt(W(T)), P, 0.62).add(v3(0, 2.2, 0)), width: 20, dir: v3(-0.45, 0.22, 1) },
    // 時間が止まった世界をゆっくり寄る（参考: 「実は逆です」の間はほぼ止まったまま寄る）
    { t: R0, target: P.clone().add(v3(-1.4, 0.8, 0)), width: 9, dir: v3(-0.4, 0.22, 1) },
    { t: R1, target: body, width: 3.2, dir: v3(-0.3, 0.16, 1) },
    // 先端を見せる: 砲弾の真横から、丸く平たい先端と装甲の面が触れている境目を大きく見る
    //（後ろ寄りから見ると胴体と銅の帯しか映らず、先端の形が分からない）
    { t: R2 - 0.8, target: nose.clone().add(v3(-0.32, 0.06, 0)), width: 1.9, dir: v3(-0.12, 0.14, 1) },
    { t: R2, target: nose.clone().add(v3(-0.3, 0.06, 0)), width: 1.7, dir: v3(-0.04, 0.1, 1) },
  ]);
  return {
    shot,
    update(t, d, T) {
      const w = W(T);
      const p = shellAt(w);
      const bite = 0.06 * seg(w, tHit, tHit + 0.15); // 当たってから止まるまでに、わずかに食い込む
      s.root.position.copy(p).add(v3(bite, Math.sin(w * 2) * 0.04 * (1 - seg(w, tHit - 1, tHit)), 0));
      s.spin.rotation.x = w * 8;
      air.update(w);
      air.material.opacity = 0.18 * (1 - seg(w, tHit - 0.3, tHit));
      // 止まった火花と炎は、先端を見せる手前（2つ目の字幕）で薄れていく
      const fade = 1 - seg(T, R1 - 0.2, R1 + 0.8);
      sparks.update(w - tHit, fade);
      flash.update(w - tHit, fade);
      shot.follow(w < tHit - 1 ? s.root.position : P);
      const c = cam(T);
      shot.fit(c.target, c.width, c.dir, shake(T, T > tHit && T < tHit + 0.3 ? 0.05 : 0));
      if (T > R1 + 0.5) ctx.label(nose.clone().add(v3(-0.05, 0.12, 0.05)), '丸く平たい先端', { offset: [-300, -360], alpha: seg(T, R1 + 0.5, R1 + 0.8) });
    },
  };
}

// ---------- カット ----------
export const scenes = {
  // 冒頭〜「実は」: 1つの続いたカット（参考動画の型）。hook と reveal で同じ組み立てを使い、動画全体の時刻 T で動かす
  //   砂漠を並走 → 前方の戦車の上段の傾斜装甲に着弾 → その瞬間に時間が止まる → 止まった火花の中をカメラが寄り、
  //   砲弾の先端（丸く平たい）を大きく見せる
  hook: (ctx) => strikeAndFreeze(ctx),
  reveal: (ctx) => strikeAndFreeze(ctx),

  // たとえ: 平たい石は水面で跳ね、丸い石は潜る
  skip(ctx) {
    A = ctx.assets;
    // 背景の木・池・空は実写の HDRI。水面にもその写真が映る
    const shot = makeShot(ctx.stage, { bg: A.pond, dof: { aperture: 0.0026, maxblur: 0.012 }, bloom: { strength: 0.35, radius: 0.4, threshold: 1.4 } });
    const sun = addSunlight(shot.scene, { dir: A.pond.sun.clone().multiplyScalar(30), intensity: 2.4, range: 8, hemi: 0 });
    sun.target.position.set(-1, 0, 0);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), mat.matte(0x1f2d22));
    bed.rotation.x = -Math.PI / 2; bed.position.y = -1.2;
    shot.scene.add(bed);
    const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x07110f, roughness: 0.02, metalness: 0, ior: 1.33, transparent: true, opacity: 0.9, specularIntensity: 1 }) // 水は自分の色をほぼ持たない。見えているのは映り込み;
    // 本物の石（砂漠の岩のモデルを縮めて使う）。平たい石は押しつぶす
    const flat = A.boulder.clone(); flat.scale.set(0.62, 0.16, 0.52);
    const round = A.boulder.clone(); round.scale.setScalar(0.5);
    shot.scene.add(flat, round);
    // 屈折する水滴（透過する小さな球）
    const drop = { geometry: new THREE.SphereGeometry(1, 12, 8), material: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, metalness: 0, transmission: 1, thickness: 0.4, ior: 1.33 }) };
    // 平たい石のホップ（長さ・高さはだんだん小さく）
    const hops = [[0.55, 0.45], [0.42, 0.3], [0.32, 0.18], [0.24, 0.1], [0.18, 0.05]];
    const tThrow = ctx.cue('skip', 1) - 0.2, tDrop = ctx.cue('skip', 2) - 0.1, vx = 3.2;
    const splashes = [];
    let tt = tThrow + 0.35; // 最初の着水
    const touch = [tt];
    for (const [dur] of hops) { tt += dur; touch.push(tt); }
    touch.forEach((t0, i) => splashes.push({ t0, b: burst(shot.scene, { instance: drop, count: 70, size: 0.028, speed: 2.2 - i * 0.3, spread: 0.7, gravity: -9, life: 0.7, seed: 20 + i }) }));
    const big = burst(shot.scene, { instance: drop, count: 220, size: 0.036, speed: 3.4, spread: 0.55, gravity: -9, life: 1.0, seed: 40 });
    const tHit = tDrop + 0.45, hitAt = v3(0.6, 0, -0.4);
    big.object.position.copy(hitAt);
    // 水面: 石が触れた時刻と場所から波紋が広がる
    const flatX = (t0) => -2.5 + (t0 - touch[0]) * vx;
    const water = waterSurface(shot.scene, waterMat, {
      size: 26, segments: 300, center: v3(-0.5, 0, 0),
      hits: [...touch.map((t0, i) => ({ t0, x: flatX(t0), z: 0.6, amp: 0.1 - i * 0.014 })), { t0: tHit, x: hitAt.x, z: hitAt.z, amp: 0.22 }],
    });
    const flatAt = (t) => {
      // 投げた直後は斜めに落ちてきて、最初の着水からホップを繰り返す
      if (t < touch[0]) { const k = seg(t, tThrow, touch[0]); return v3(-3.6 + k * 1.1, lerp(0.9, 0, k), 0.6); }
      let x = -2.5 + (t - touch[0]) * vx;
      for (let i = 0; i < hops.length; i++) {
        if (t < touch[i + 1]) { const u = seg(t, touch[i], touch[i + 1]); return v3(x, hops[i][1] * 4 * u * (1 - u), 0.6); }
      }
      return v3(x, -0.6 * (t - touch[hops.length]), 0.6); // 最後は失速して沈む
    };
    return {
      shot,
      update(t) {
        const p = t < tThrow ? v3(-3.6, 0.9 + Math.sin(t * 2) * 0.05, 0.6) : flatAt(t);
        flat.position.copy(p);
        flat.rotation.y = t * 9;
        flat.rotation.z = 0.08;
        splashes.forEach(({ t0, b }) => { b.object.position.set(flatX(t0), 0, 0.6); b.update(t - t0); });
        // 丸い石: 斜めに落ちて、そのまま水の中へ
        const k = t - tDrop;
        round.visible = k > 0;
        round.position.copy(k < 0.45 ? lerpV(v3(-0.6, 2.4, -0.4), hitAt, k / 0.45) : hitAt.clone().add(v3(0.5 * (k - 0.45), -1.1 * (k - 0.45), 0)));
        round.rotation.set(t * 2, t * 1.3, 0);
        big.update(t - tHit);
        water.update(t);
        const pan = ease.inOut(seg(t, tThrow, tThrow + 2.4));
        // 低い位置から水面すれすれに見る（奥の木と空が背景に入る）
        shot.fit(v3(lerp(-3.0, 0.5, pan), 0.2, 0.2), lerp(2.6, 4.2, pan), v3(0.1, 0.55, 1));
      },
    };
  },

  // 鋭い先端は斜めの装甲で滑って弾かれる
  //   飛んでくる → 傾斜装甲に触れた瞬間に止める（「斜めの装甲に当たると、」）→ 再開して、面に沿って上へ抜ける（⤴）。
  //   向きは速度の向きに合わせてなめらかに変えるだけで、回転（宙返り）はさせない
  ricochet(ctx) {
    const shot = desert(ctx);
    const { P, n } = armorTarget(shot);
    const s = makeShell('pointed');
    shot.scene.add(s.root);
    const v = v3(1, 0, 0), speed = 2.6;
    const out = glance(v, n).normalize(); // 面に沿う成分を残し、面から少しだけ離れる
    const c1 = ctx.cue('ricochet', 1), c2 = ctx.cue('ricochet', 2);
    const wHit = c1 + 0.55;
    const W = timeWarp([{ at: wHit + 0.012, until: c2 }]); // 触れた直後（火花が出始めた瞬間）で止める
    const sparks = burst(shot.scene, { at: P, dir: out.clone().add(n.clone().multiplyScalar(0.3)), spread: 0.45, speed: 7, count: 360, life: 0.7, seed: 5, trail: 0.045, brightness: 7 });
    const cam = camKeys([
      { t: 0, target: v3(-2.2, 0.1, 0), width: 5.2, dir: v3(-0.2, 0.2, 1) },
      { t: wHit, target: v3(-0.5, 0.2, 0), width: 4.2, dir: v3(-0.1, 0.18, 1) },
      { t: c2, target: v3(-0.2, 0.3, 0), width: 3.2, dir: v3(0, 0.15, 1) }, // 止まっている間に寄る
      { t: c2 + 1.4, target: v3(0.6, 1.6, 0), width: 5.5, dir: v3(0.05, 0.2, 1) }, // 再開: 上へ抜ける砲弾を追う
    ]);
    return {
      shot,
      update(t) {
        const w = W(t), dw = w - wHit;
        if (dw < 0) { s.root.position.copy(P).addScaledVector(v, dw * speed); aim(s.root, v); }
        else {
          s.root.position.copy(P).addScaledVector(n, 0.02).addScaledVector(out, dw * speed * 0.85);
          aim(s.root, lerpV(v, out, ease.out(seg(dw, 0.015, 0.09)))); // 向きは止まったあと（再開してから）面に沿う。回さない
        }
        s.spin.rotation.x = w * 6; // 自分の軸まわりの回転（ライフリング）だけ
        sparks.update(dw);
        const c = cam(t);
        shot.fit(c.target, c.width, c.dir, shake(t, dw > 0 && dw < 0.25 && t > c2 ? 0.03 : 0));
        if (t > wHit + 0.1 && t < c2 + 0.2) ctx.label(P.clone().addScaledVector(n, 0.05), '傾斜装甲に斜めに当たる', { offset: [-380, 300], alpha: seg(t, wHit + 0.1, wHit + 0.4) });
        if (dw > 0.2) ctx.label(s.root.position, '面に沿って上へ滑る', { offset: [-320, -260], alpha: seg(dw, 0.2, 0.5) });
      },
    };
  },

  // 鈍い先端は表面に食いついて押し込む
  //   飛んでくる → 触れた瞬間に止める（「装甲の表面に食いついて、」）→ 再開して、向きが面へ起き上がりながら押し込む
  bite(ctx) {
    const shot = desert(ctx);
    const { P, n } = armorTarget(shot);
    const s = makeShell('blunt');
    shot.scene.add(s.root);
    const v = v3(1, 0, 0), into = n.clone().negate(), speed = 2.4;
    const c1 = ctx.cue('bite', 1), c2 = ctx.cue('bite', 2);
    const tHit = c1 + 0.25;
    const W = timeWarp([{ at: tHit + 0.04, until: c2 }]);
    const sparks = burst(shot.scene, { at: P, dir: n, spread: 1.0, speed: 5, count: 420, life: 0.9, seed: 9, trail: 0.04, brightness: 7 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.42, 48), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
    ring.position.copy(P).addScaledVector(n, 0.01);
    ring.lookAt(P.clone().add(n));
    shot.scene.add(ring);
    return {
      shot,
      update(t, d) {
        const w = W(t), dt = w - tHit;
        if (dt < 0) { s.root.position.copy(P).addScaledVector(v, dt * speed); aim(s.root, v); }
        else {
          // 当たった瞬間に向きが装甲の面へ起き上がり（ノーマライズ）、ゆっくりめり込む
          const k = ease.out(seg(dt, 0, 1.6));
          const dir = lerpV(v, into, ease.out(seg(dt, 0, 0.5)) * 0.45).normalize();
          s.root.position.copy(P).addScaledVector(dir, k * 0.9);
          aim(s.root, dir);
        }
        s.spin.rotation.x = w * 6 * (dt < 0 ? 1 : 0.2);
        sparks.update(dt);
        ring.visible = dt > 0;
        ring.material.opacity = 1 - seg(dt, 0.3, 2.2);
        ring.scale.setScalar(0.8 + seg(dt, 0, 0.5) * 0.3);
        // カメラは止まっている間も動く（止まった瞬間をじっくり見せる）
        const k = ease.inOut(seg(t, 0, d));
        shot.fit(v3(lerp(-1.6, -0.4, k), 0.15, 0), lerp(4.6, 2.8, k), v3(lerp(-0.35, 0.1, k), 0.22, 1), shake(t, dt > 0.04 && t > c2 && t < c2 + 0.3 ? 0.03 : 0));
        if (t > tHit + 0.1) ctx.label(P.clone().addScaledVector(n, 0.05), t < c2 ? '鈍い先端が面に食いつく' : 'そのまま押し込む', { offset: [-240, -320], alpha: seg(t, tHit + 0.1, tHit + 0.4) });
      },
    };
  },

  // 鈍い先端は空気を強く押しのけ、だんだん置いていかれる
  drag(ctx) {
    const shot = desert(ctx);
    const s = makeShell('blunt');
    shot.scene.add(s.root);
    const air = streaks(s.root, { count: 46, radius: 0.36, length: 1.0, speed: 9, opacity: 0.45 });
    // 先端の前にできる空気の壁（白く光る殻）
    const wall = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2.6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    wall.rotation.z = -Math.PI / 2;
    wall.position.x = -0.3;
    wall.scale.set(0.6, 1, 1);
    s.spin.add(wall);
    return {
      shot,
      update(t, d) {
        const cam = -3 + t * 1.8, lagT = Math.max(0, t - ctx.cue('drag', 1) + 0.3);
        const x = cam - 0.35 * lagT * lagT; // 減速してカメラから遅れる
        s.root.position.set(x, 0.3, 0);
        s.spin.rotation.x = t * 5;
        air.update(t);
        wall.material.opacity = 0.18 + 0.08 * Math.sin(t * 30);
        shot.fit(v3(cam - 0.6, 0.3, 0), 3.4, v3(0.35, 0.15, 1));
        ctx.label(v3(x + 0.1, 0.62, 0), '空気の壁', { offset: [-80, -300], alpha: seg(t, 0.6, 0.9) });
      },
    };
  },

  // スタジオ: 鈍い先端に尖った風帽をかぶせる → 半分切って中を見せる
  cap(ctx) {
    const shot = studio(ctx);
    const s = makeShell('capped');
    s.root.position.x = 1.0;
    shot.scene.add(s.root);
    const clip = new THREE.Plane(v3(0, 0, -1), 1);
    cutaway(s.cap, clip);
    const tOn = ctx.cue('cap', 1) - 0.6;
    return {
      shot,
      update(t, d) {
        // 風帽は右から滑り込んで、ぴたっと止まる
        const k = ease.outBack(seg(t, tOn - 0.9, tOn));
        s.cap.position.y = lerp(1.6, 0, k); // inner は回転済みなので y がそのまま砲弾の軸方向
        clip.constant = lerp(1, 0, ease.inOut(seg(t, tOn + 0.4, tOn + 1.3)));
        s.spin.rotation.x = 0.3;
        const c = ease.inOut(seg(t, 0, d));
        shot.fit(v3(lerp(0.2, 0.15, c), 0, 0), lerp(3.4, 2.8, c), v3(0.12, 0.2, 1));
        if (t > tOn + 0.2) ctx.label(v3(0.6, 0.18, 0), '風帽', { offset: [-60, -320], alpha: seg(t, tOn + 0.2, tOn + 0.5) });
        if (t > tOn + 1.3) ctx.label(v3(-0.05, -0.12, 0.12), '鈍い先端', { offset: [140, 340], alpha: seg(t, tOn + 1.3, tOn + 1.6) });
      },
    };
  },

  // 命中: 風帽がつぶれ、中の鈍い先端が食い込む
  //   仕組みが働く瞬間ごとに止める: ①風帽がつぶれた瞬間（「命中すると風帽はつぶれ、」）→ ②中の鈍い先端が面に届いた瞬間
  //  （「中の鈍い先端が、」）→ 再開して食い込む（「装甲に食い込みます。」）
  impact(ctx) {
    const shot = desert(ctx);
    const { P, n } = armorTarget(shot);
    const s = makeShell('capped');
    shot.scene.add(s.root);
    const v = v3(1, 0, 0), into = n.clone().negate();
    const c1 = ctx.cue('impact', 1), c2 = ctx.cue('impact', 2);
    const tHit = ctx.cue('impact', 0) + 0.6, speed = 1.6;
    const capLen = s.len - (BODY + 0.2); // 風帽の先端から中の先端までの距離
    const debris = burst(shot.scene, { at: P, dir: n, spread: 1.3, speed: 2.5, count: 120, size: 0.06, gravity: -4, life: 1.8, seed: 31, instance: { geometry: new THREE.BoxGeometry(1, 0.25, 0.7), material: A.steel ?? mat.metal() } });
    const sparks = burst(shot.scene, { at: P, dir: n, spread: 1.0, speed: 6, count: 520, life: 1.0, seed: 32, trail: 0.045, brightness: 7 });
    const flash = fireball(shot.scene, { at: P.clone().addScaledVector(n, 0.25), count: 10, radius: 0.32, life: 0.6, seed: 4, dir: n.clone().multiplyScalar(0.6) });
    const tBite = tHit + capLen / speed;
    const W = timeWarp([{ at: tHit + 0.12, until: c1 }, { at: tBite + 0.03, until: c2 }]);
    return {
      shot,
      update(tScene, d) {
        const t = W(tScene); // ここから下の動きは世界の時刻で
        const dt = t - tHit;
        // 風帽: 当たったら軸方向につぶれて消える
        const crush = seg(dt, 0, 0.12);
        s.cap.scale.set(1, 1, 1);
        s.cap.visible = crush < 1;
        if (dt > 0) { s.cap.scale.set(1 + crush * 0.4, 1 - crush * 0.8, 1 + crush * 0.4); }
        // 弾体: 風帽のぶんだけ進んでから食い込む
        const db = t - tBite;
        if (db < 0) { s.root.position.copy(P).addScaledVector(v, (t - tHit) * speed); aim(s.root, v); }
        else {
          const dir = lerpV(v, into, ease.out(seg(db, 0, 0.5)) * 0.45).normalize();
          s.root.position.copy(P).addScaledVector(v, capLen).addScaledVector(dir, ease.out(seg(db, 0, 2.2)) * 1.1);
          aim(s.root, dir);
        }
        s.spin.rotation.x = t * 3;
        debris.update(dt);
        sparks.update(db);
        flash.update(db - 0.9);
        // カメラと名札はカットの時刻で（止まっている間も寄っていく）
        const k = ease.inOut(seg(tScene, 0, d));
        shot.fit(v3(lerp(-1.4, -0.3, k), lerp(0.1, 0.3, k), 0), lerp(4.4, 3.0, k), v3(lerp(-0.25, 0.12, k), 0.24, 1), shake(tScene, db > 0.9 && db < 1.5 ? 0.05 : 0));
        if (tScene > tHit + 0.2 && tScene < c1 + 0.2) ctx.label(P.clone().addScaledVector(n, 0.1), '風帽がつぶれる', { offset: [-260, -330], alpha: seg(tScene, tHit + 0.2, tHit + 0.5) });
        if (tScene > c1 + 0.3) ctx.label(P.clone().addScaledVector(n, 0.05), tScene < c2 ? '中の鈍い先端が当たる' : '食い込む', { offset: [-260, -330], alpha: seg(tScene, c1 + 0.3, c1 + 0.6) });
      },
    };
  },

  // 名前を回収: 断面つきの APCBC がゆっくり回る
  name(ctx) {
    const shot = studio(ctx);
    const s = makeShell('capped');
    s.root.position.x = 1.0;
    shot.scene.add(s.root);
    cutaway(s.cap, new THREE.Plane(v3(0, 0, -1), 0));
    return {
      shot,
      update(t, d) {
        const k = ease.inOut(seg(t, 0, d));
        s.spin.rotation.x = 0.3;
        s.root.rotation.y = lerp(0.5, -0.35, k);
        shot.fit(v3(-0.05, 0, 0), lerp(2.7, 3.4, k), v3(lerp(-0.15, 0.1, k), lerp(0.1, 0.35, k), 1));
        const a = seg(t, 0.8, 1.2);
        ctx.label(v3(0.65, 0.15, 0), '風帽', { offset: [-40, -330], alpha: a });
        ctx.label(v3(-0.8, 0.28, 0.1), '徹甲弾の本体', { offset: [60, -460], alpha: a });
      },
    };
  },
};
