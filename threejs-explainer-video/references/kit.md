# kit.js / runtime.js / script.json の使い方

## script.json

```jsonc
{
  "title": "動画の題名",
  "size": [1080, 1920], "fps": 30,
  "tts": { "model": "gemini-3.8-flash-tts", "voice": "Charon", "style": "声の演技の指示" },
  "lead": 0.3,  // 最初の声までの間（秒）
  "gap": 0.3,   // シーンとシーンの間（秒）
  "tail": 1.2,  // 最後の声のあとの余白（秒）
  "scenes": [
    { "id": "hook",            // project.js の scenes のキー
      "say": "読ませる文",       // かなで書くと読み間違えない
      "captions": ["画面の字\n2行目", "次の字幕"],  // 省略すると say をそのまま出す
      "pad": 0.6,              // このシーンだけ声のあとの間を変える
      "style": "...",          // このシーンだけ演技を変える（録り直しは retake で）
      "retake": true }         // このシーンだけ録り直す（終わったら外す）
  ]
}
```

`out/timeline.json`（tts.mjs が作る）: `{ duration, size, fps, scenes: [{ id, t0, t1, audio: [声の始まり, 終わり], captions: [{ text, t0, t1 }] }] }`

## project.js の形

```js
import { THREE, makeShot, v3, seg, ease, lerp } from './kit.js';
export const caption = { y: 0.63, size: 60 };   // 省略可。字幕の位置（高さの割合）と大きさ
export const scenes = {
  hook(ctx) {                       // 最初に使うときに1回だけ呼ばれる（組み立て）
    const shot = makeShot(ctx.stage, { bg: 0x222222, dof: { aperture: 0.003 } });
    const box = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    shot.scene.add(box);
    const tHit = ctx.cue('hook', 1);  // 2枚目の字幕が出る時刻（カットの頭から）
    return {
      shot,
      update(t, d, T) {              // 毎コマ。t: カットの頭からの秒, d: カットの長さ, T: 全体の秒
        box.rotation.y = t;
        shot.fit(v3(0, 0, 0), lerp(3, 2, ease.inOut(seg(t, 0, d))), v3(0.2, 0.3, 1));
        if (t > tHit) ctx.label(v3(0.5, 0.5, 0), '名札', { offset: [120, -300], alpha: seg(t, tHit, tHit + 0.3) });
      },
    };
  },
};
```
- `noCaption: true` を返すとそのカットは字幕を出さない。

## kit.js の部品

| 名前 | 内容 |
|---|---|
| `createStage(w, h)` | レンダラー（ACES・影・断面あり）と環境光 `env`。runtime が作るので普段は使わない |
| `makeShot(stage, { bg, fog, fov, dof, envIntensity })` | 1カット分の scene/camera。`bg` は色かテクスチャ、`fog: {color, near, far}`、`dof: {aperture, maxblur}` で背景ボケ |
| `shot.fit(target, width, dir, jitter?)` | target のまわり横幅 width が収まる距離に、dir の向きからカメラを置く。jitter はカメラの揺れ |
| `shot.look(pos, target)` | カメラを直接置く。dof のピントは target |
| `addSunlight(scene, { dir, intensity, range })` | 太陽（影あり）＋空の照り返し |
| `mat.metal / paint / matte / glow / water` | よく使う素材 |
| `canvasTexture(w, h, draw)` / `gradientTexture(上, 下)` | Canvas 2D で描いた模様をテクスチャに |
| `groundPlane(scene, { color, spot, size })` | まだらの地面（y を動かして使う） |
| `lathe(profile, material)` | 回転体。profile は `[半径, 高さ]` を下から。砲弾・瓶・ネジ・ピストン・ロケット |
| `noseProfile(r, h, { nose, tipR })` | 先端の輪郭。nose 0 = 半球（鈍い）、1 = オジーブ（鋭い） |
| `cutaway(object, plane)` | 断面。plane の法線側だけ残る（ワールド座標） |
| `burst(scene, { at, dir, spread, speed, count, size, color, gravity, life, additive, seed })` | 火花・しぶき・破片。`update(発生からの秒)`、負の秒では見えない |
| `fireball(scene, { at, radius, count, life, dir, seed })` | 火の玉・煙。`update(発生からの秒)` |
| `streaks(parent, { count, radius, length, speed, opacity })` | 物のまわりを後ろへ流れる線（+x 向きの物用）。`update(t)` |
| `ease.inOut / out / in / outBack`、`seg(t, a, b)`、`lerp`、`lerpV`、`clamp`、`rng(seed)` | 時間と数の道具。`seg` は t が a→b を進む割合 |
| `headingYaw(model)` | 画像から作ったモデルの向き（元画像のカメラのまま斜め）を直す rotation.y。前（長く突き出た側）を -x へ |
| `surfaceHit(model, origin, dir, { spread })` | レイで表面の点と法線。spread で周りも撃って平均し、`flatness`（平らさ 0〜1）も返す |
| `findSlope(model, { from, dir, step, minUp, maxUp })` | 斜めの平らな面を探して、その真ん中の点と向きを返す（傾斜装甲・斜めの側面）。重いので結果は使い回す |
| `glance(v, n, { bounce, keep })` | 斜面にかすって跳ねる速度（面に沿う成分を残す）。鏡の反射より現実的 |
| `timeWarp([{ at, until }])` → `W(t)` | 仕組みが働く瞬間ごとに時間を止め、字幕で再開する。物は W(t)、カメラと名札は t で動かす |
| `slowToStop(t, t0)` | t0 からなめらかに減速して止まる（1回だけ止めるとき） |
| `camKeys([{ t, target, width, dir }])` → `(T) => { target, width, dir }` | カメラのキーフレーム。target / dir は関数でも可。カットをまたいで続くカメラに |
| `burst.update(t, fade)` / `fireball.update(t, fade)` | fade（0〜1）で、止めたまま薄くする |

## 見た目を本物らしくする
素材（HDRI・PBR テクスチャ・モデル）の集め方、`loadHDR` / `loadPBR` / `loadGLTF` / `terrain` / `scatter` / `waterSurface` / `burst({ trail | instance })` の使いどころ、モーションブラー・bloom の調整は `references/realism.md` にまとめた。
