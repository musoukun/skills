# 主役のモデル（戦車・機械など）を用意する

## 0. まず素材庫を見る
```powershell
node tools/library.mjs list          # 生成済みモデルと Poly Haven の素材の一覧
node tools/library.mjs use tank      # 生成済みの戦車を assets/gen/tank.glb にコピー
```
同じ物があれば作り直さない（3D化は1体約6分、画像生成も時間とお金がかかる）。作った物は自動で素材庫に入る。

## 1. 無料の既製モデルを探す（2026-10 の調査）
- **写実的な戦車・装甲車で CC0 の物はほぼない。** Poly Haven（521点）にも車両はない。弾薬箱・木箱・ジェリカンなどの小物はある（CC0）。
- 写実的な車両の本命は **Sketchfab の CC-BY**（商用可・作者名の表記が必要）。例: Abandoned Soviet BTR-80（GameDevNick）、Leopard 2 A6 / BMP-1（buh-late）、KV-2（comrade1280）、実車の写真から作った M4A3E8 Sherman・M113A1（kryik1023）。
  - **ダウンロードにはログインが必要**（API も OAuth）。Claude はアカウントにログインしないので、ユーザーに落としてもらい、`node tools/library.mjs add <glb> --name <名前> --note "CC-BY 作者名 URL"` で素材庫に入れる。
  - 概要欄にクレジットを書く。例: `"Abandoned Soviet BTR - 80" by GameDevNick (URL) licensed under CC BY 4.0 / modified`
  - 避ける: 説明に「Ripped from ○○（ゲーム名）」「Not my original model」とある物（投稿者に権利がない）。実戦で壊れた車両のスキャン（広告に向かないおそれ）。
- ローポリで良ければ CC0: Quaternius / Poly Pizza の Tank、OpenGameArt の T-12 など。
- 商用に使えない: TurboSquid の無料モデル（非商用）、CGTrader の Editorial ライセンス。

## 2. 作る: Codex で画像 → ローカルで3D化
### 画像（Codex CLI の image_generation）
```powershell
node tools/codex-image.mjs "a WWII-era medium tank of a generic fictional design, olive drab paint, realistic weathering, tracks and road wheels visible" gen/tank.png
```
- 3D化に向く条件（1つの物・全体が枠内・斜め前・無地の明るい背景・均一な光・文字なし）はツールが自動で足す。
- 実在の車両そのものではなく「架空のデザイン」と書く（記章・番号も入れない）。
- 前提: `codex login` 済み、`codex features list` で `image_generation` が true。

### 3D化（ComfyUI のネイティブ Pixal3D / TRELLIS.2）
- ComfyUI v0.34.0 以降に標準で入っている（カスタムノード・CUDA 拡張のビルドは不要）。RTX 5070 Ti 16GB で、テクスチャ 2048 なら通った。
- モデル（合計 約9.3GB）を ComfyUI の `models/` に置く:

| フォルダ | ファイル | 大きさ | 取得元 |
|---|---|---|---|
| diffusion_models | pixal3d_int8_convrot.safetensors | 5.2GB | huggingface.co/Comfy-Org/Pixal3D |
| vae | trellis_2_shape_vae_bf16.safetensors | 1.0GB | 同上 |
| vae | trellis_2_texture_vae_bf16.safetensors | 0.9GB | 同上 |
| clip_vision | dino_v3_L_naf_fp32.safetensors | 1.1GB | 同上 |
| geometry_estimation | moge_2_vitl_normal_fp16.safetensors | 0.6GB | huggingface.co/Comfy-Org/MoGe |
| background_removal | birefnet.safetensors | 0.4GB | huggingface.co/Comfy-Org/BiRefNet |

URL は `https://huggingface.co/<リポジトリ>/resolve/main/<フォルダ>/<ファイル>`。

```powershell
# ComfyUI を起動（Stability Matrix の場合の例）
& "T:\comfyui\Data\Packages\ComfyUI\venv\Scripts\python.exe" T:\comfyui\Data\Packages\ComfyUI\main.py --listen 127.0.0.1 --port 8188 --disable-auto-launch
# 3D化（約6分）。出力は assets/gen/tank.glb ＋ 素材庫 gen/tank/
node tools/comfy3d.mjs gen/tank.png assets/gen/tank.glb --subject "WWII風の中戦車（架空）" --set 288.value=2048 --set 40.unet_name=pixal3d_int8_convrot.safetensors
# 4方向から見て確かめる（向き・欠け・テクスチャ）
node tools/viewglb.mjs assets/gen/tank.glb out/tank-views.png --hdr assets/ph/goegap/goegap_2k.hdr
```
- `--set 288.value=2048`: テクスチャ解像度（テンプレートは 4096。16GB では 2048 から）
- `--set 40.unet_name=…`: テンプレートは使わない側の TRELLIS.2 本体のファイルも検査するので、手元にある Pixal3D のファイル名を入れて通す（TRELLIS.2 の int8 5.25GB を落とすならそのままでよい）
- 出力例（戦車）: 三角形 68万、頂点 57万、GLB 54.7MB、テクスチャ（色・凹凸・粗さ・金属度・AO）各 2048。写っていない後ろ側ももっともらしく作られる。

### 寄ると甘い問題
- 画像から作ったモデルのテクスチャ（2048）は、全体を写すと十分きれいだが、**寄ると（面の 1m 以内）ぼやけて、しわのような模様が見える**。
- 仕組みを説明するために寄る面（当たる装甲の面など）だけ、Poly Haven の PBR テクスチャ（金属・塗装）を細かい凹凸（detail normal）として重ねるか、その部分に平らな板（デカール）を重ねる。モデル全体を描き直さない。

### シーンに置く
- `loadGLTF('assets/gen/tank.glb', { size: 1 })` → `clone()` → `scale.setScalar(大きさ m)`。向きは viewglb の画で確かめて `rotation.y` を決める（戦車は +x 向きだったので π）。
- 当たる位置は目で合わせず、`THREE.Raycaster` で砲弾の進む線とモデルの交点を求める（例題の `hook`）。
- モデルが無くても動くよう `loadGLTF(...).catch(() => null)` にしておく。

## comfy3d.mjs が吸収している落とし穴
| 症状 | 原因 | 対処（ツールで処理済み） |
|---|---|---|
| 3秒で「完了」になり GLB が出ない | 一部の出力だけ検証に落ちても prompt_id は返り、その出力は黙って捨てられる | `/prompt` の `node_errors` を必ず表示する |
| `Save3DAdvanced`: viewport_state が無い | 画面の3Dビューアの状態を受け取るノード | API では `SaveGLB` に置き換える |
| 値の並びが合わない（width に '' が入る等） | 画面専用の入力も widgets_values に並ぶ | 「つなぎ口として並んでいない入力はすべて設定値」として順に読む |
| refine_steps が無い | テンプレートより ComfyUI が新しく、入力が増えた | 値が足りなければ定義の既定値で埋める |
| sign_mode.qef が無い | 選んだ値で入力が増える combo（COMFY_DYNAMICCOMBO_V3） | 値の直後に並ぶ、その選択肢の入力を `名前.子` で渡す |

## ライセンスの注意
- Pixal3D / TRELLIS.2（ComfyUI ネイティブ版）: MIT。非商用の依存物（nvdiffrast）は外されている。
- DINOv3（画像の読み取り）: Meta の DINOv3 License。商用は可。ただし ITAR 対象の活動・輸出規制上禁止された用途（軍事・兵器開発）は禁止。解説動画用の CG は通常これに当たらないと考えられるが、法的判断ではない。
- Hunyuan3D 2.x: EU・英国・韓国では使えない、月間利用者100万超は別契約、「軍事目的」の禁止条項あり。
- ComfyUI 公式ブログ: https://blog.comfy.org/p/trellis2-and-pixal3d-are-now-native
