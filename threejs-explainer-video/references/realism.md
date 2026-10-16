# 映像を「本物らしく」する（安っぽさの原因と対策）

## なぜ AI がコードで作る 3D は安っぽくなるか
調べて分かったこと（出典は末尾）と、例題で実際に試したことのまとめ。

1. **形を基本図形の組み合わせで作ってしまう。** 箱・円柱・球の寄せ集めは、細部（傷・ボルト・パネルの継ぎ目）がない。LL3M 論文でも、資料を引かないエージェントは基本形状に頼ると報告されている。
2. **材質がきれいすぎる。** 色も粗さも一定の金属や塗装は、プラスチックに見える。現実の表面には汚れ・擦れ・粗さのむらがある。
3. **光と背景が作り物。** グラデーションの背景と仮の環境光では、映り込みも空気感も出ない。参考動画の木・塀・曇り空は、モデリングではなく**実写の 360° 写真（HDRI）**だった。
4. **地面が平ら・背景が動かない。** 平らな面にまだら模様では、カメラが動いても流れる物がなく、速さが出ない。
5. **自分の出力を目で確かめる回数が少ない。** 描いて見て直す、を回さないと、はみ出し・映り込みの飛び・暗すぎる水などが残る。

参考動画（3D 解説ショート）は、作り込まれた既製の 3D モデル（装甲車）、写真テクスチャを貼った起伏のある地形、HDRI、屈折する水滴と凹凸のある波紋、強い被写界深度とモーションブラーでできていた。**使える素材を先に集めるのが、いちばん効く。**

## 対策（効く順）

| 順 | やること | このスキルでの使い方 |
|---|---|---|
| 1 | **実写の HDRI** を背景と光にする | `node tools/polyhaven.mjs search hdris 砂漠 desert …` → `get <id> 2k` → `loadHDR(stage, url)` を `makeShot({ bg: hdr })` に |
| 2 | **写真の PBR テクスチャ**を地面・板・金属に | `get <id> 2k` → `loadPBR(dir, { repeat })`。金属は `color` を渡して色だけ差し替え、傷の粗さと凹凸を借りる |
| 3 | **起伏のある地形＋同じ土地の岩**をばらまく | `terrain(scene, mat, { height, scale, flat })` → `scatter(scene, model, { heightAt, avoid })`。HDRI と同じ撮影地の素材（例: goegap と namaqualand_boulder）だと光と色がそろう |
| 4 | **既製の 3D モデル** | Poly Haven のモデル（CC0）を `loadGLTF(url, { size })`。`size` で縮尺をそろえる |
| 5 | **モーションブラー** | `render.mjs video` は既定で 1コマ6回の平均。速いカットほど効く（背景が流れる） |
| 6 | **被写界深度と光のにじみ** | `makeShot({ dof, bloom })`。bloom の threshold は高め（6）にして、火花だけ光らせる |
| 7 | **火花は光の筋、水滴は屈折する粒** | `burst({ trail: 0.045, brightness: 7 })`、`burst({ instance: { geometry, material: 透過する MeshPhysicalMaterial } })` |
| 8 | **水面は本当に凹凸させる** | `waterSurface(scene, mat, { hits })`。水の材質の色はほぼ黒にして、映り込みで見せる |
| 9 | **描いて、参考と並べて、直す** | `render.mjs stills … --blur 8` → ffmpeg の `hstack` で「前・後・参考」を並べて Read する |

### さらに上（必要になってから）
- **主役の物を画像から 3D にする**: Tripo / Meshy / Rodin（有料 API、PBR 付き GLB が出る）、Hunyuan3D 2.1（OSS・ローカル、独自ライセンス）。戦車のような作り込まれた物はここか、Sketchfab（CC-BY が多い。ダウンロードにはアカウントが必要で、クレジット表記が要る）。
- **パストレース**: three-gpu-pathtracer。0.0.25 から WebGPU 版が本命で、WebGL 版は非推奨。headless の Chromium で WebGPU が動くかは未確認。
- **本物の煙・炎・破壊**: Blender（Mantaflow・Cell Fracture）や UE5（Niagara・Chaos）の領域。Three.js に持ち込むならフリップブック（Unity Labs の CC0 シーケンスなど）。

## 素材の入手先とライセンス

| 入手先 | 中身 | ライセンス | 取り方 |
|---|---|---|---|
| **Poly Haven** | HDRI・テクスチャ・モデル | **CC0**（商用可・クレジット不要。表記は任意） | `tools/polyhaven.mjs`（API キー不要。独自の User-Agent を付けている） |
| ambientCG | テクスチャ | CC0 | `https://ambientcg.com/api/v2/full_json?id=…` |
| Kenney / Quaternius | ローポリのモデル | CC0 | 写実には向かない |
| Sketchfab | あらゆるモデル | 作品ごと（CC-BY が多い） | アカウントが必要。CC0 以外はクレジット必須 |

取った素材は `assets/CREDITS.md` に自動で記録される。

## 試してみて分かった落とし穴

| 症状 | 原因 | 対処 |
|---|---|---|
| 金属の物に白い大きなにじみ | HDRI の太陽（数万倍の明るさ）が映り、bloom が拾う | `loadHDR` は明るさ 24 で切る（太陽は `addSunlight` で別に足す）。bloom の threshold を 6 に。金属の粗さを少し上げる（`roughness: 1.6` は粗さマップへの倍率） |
| 水が黒い板・水色のベタ塗り | 暗い森の HDRI が映っている／水の色が日光で光っている | 曇り空など明るい空の HDRI を選ぶ。水の色はほぼ黒、カメラは少し見下ろす |
| 小石のつもりが 25m の岩場（41万頂点、23MB） | モデルの名前だけで選んだ | 取る前にサイズを見る（ツールが表示し、60MB を超えたら止まる）。取ったら gltf の accessor の min/max で大きさを確かめる |
| 影の向きが背景の写真と合わない | 太陽を適当な向きに置いた | `loadHDR` の `sun`（写真のいちばん明るい点の向き）を `addSunlight({ dir })` に |
| 地面の端が浮く | 霧の色が背景と違う | `loadHDR` の `horizon`（地平線の平均色）を霧の色に |
| PowerShell の置換が当たらない | `` `${PH}` `` の `` ` `` が PowerShell の特殊文字 | テンプレート文字列を含む置換は Edit ツールで |

## 出典
- LL3M: https://arxiv.org/html/2508.08228v1 / BlenderGym: https://arxiv.org/abs/2504.01786 / SceneCraft: https://arxiv.org/abs/2403.01248
- blender-mcp（Poly Haven・Sketchfab・Hyper3D 連携、`look` による見返し）: https://github.com/ahujasid/blender-mcp
- Poly Haven ライセンス: https://polyhaven.com/license / API: https://github.com/Poly-Haven/Public-API
- three.js r186 ソース（HDRLoader・GTAOPass・UnrealBloomPass・GroundedSkybox）: https://github.com/mrdoob/three.js/tree/r186/examples/jsm
- three-gpu-pathtracer: https://github.com/gkjohnson/three-gpu-pathtracer
- Unity Labs の CC0 VFX フリップブック: https://unity.com/blog/engine-platform/free-vfx-image-sequences-flipbooks
