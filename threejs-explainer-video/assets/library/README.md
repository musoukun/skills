# 素材庫（一度取った・作った素材を貯めて使い回す場所）

`tools/polyhaven.mjs` と `tools/comfy3d.mjs` が自動でここに貯め、次からはここからコピーする（ネットにも GPU にも行かない）。
中身の一覧: 作業フォルダで `node tools/library.mjs list`

```
library/
  ph/<id>/            Poly Haven の素材（CC0）。manifest-<解像度>.json に中身と md5   ← git には入れない（ローカルだけ）
  gen/<名前>/          自分で生成したモデル
    model.glb          3D モデル（PBR テクスチャ入り、数十MB）              ← git に入れない（ローカルだけ。作り直せる）
    source.png         元の画像                                            ← git に入れる（作り方）
    meta.json          何か・作り方・設定・かかった時間・ライセンス          ← git に入れる（作り方）
  CREDITS.md           出どころの一覧
```

## Poly Haven の素材（ph/）を取り直す
素材庫が空でも、例題の作業フォルダで次を実行すれば、ネットから取って素材庫に貯め直す（合計 約45MB、CC0）。
```powershell
npm run assets
# 個別に: node tools/polyhaven.mjs search hdris desert / node tools/polyhaven.mjs get goegap 2k
```
例題が使うもの: goegap（HDRI 2k）、cloudy_vondelpark（HDRI 2k）、dry_ground_01（テクスチャ 2k）、green_metal_rust（2k）、blue_metal_plate（1k）、namaqualand_boulder_03（モデル 1k）

## 生成モデル（gen/）を作る・作り直す
手順の詳細: `references/hero-model.md`
```powershell
node tools/codex-image.mjs "<作りたい物の説明>" gen/<名前>.png                     # Codex で画像を1枚
node tools/comfy3d.mjs gen/<名前>.png assets/gen/<名前>.glb --subject "<説明>" --set 288.value=2048 --set 40.unet_name=pixal3d_int8_convrot.safetensors
node tools/viewglb.mjs assets/gen/<名前>.glb out/<名前>-views.png                 # 4方向から確かめる
```
- **clone した直後は model.glb が無い。** `node tools/library.mjs use <名前>` を実行すると、meta.json と source.png から作り直すコマンドを表示する（例題の戦車は RTX 5070 Ti で約6分）。乱数のシードはテンプレートで固定なので、ほぼ同じ形になる。
- できたモデルは自動でここ（gen/<名前>/）に入る。使うときは `node tools/library.mjs use <名前>`。
