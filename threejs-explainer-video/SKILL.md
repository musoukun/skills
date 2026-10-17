---
name: threejs-explainer-video
description: 「ものの仕組み」を3DCGで見せる解説ショート動画（縦 1080×1920・字幕・男性ナレーション付き MP4）を、Three.js とコードだけで作るスキル。台本（script.json）→ Gemini TTS でナレーション → 声の長さからカット割りと字幕の時刻を自動で決める → Three.js で各カットを「時刻 t の関数」として描く → Playwright で1コマずつ取り出し ffmpeg で MP4。参考にしたい動画があれば yt-dlp で落として1秒1枚に分解し、構成・カットの長さ・字幕の置き方を読み取ってから作る。「仕組みを3Dで解説する動画を作って」「Three.js で解説動画」「YouTube ショートの解説動画」「この動画みたいな3D解説を作りたい」「ナレーション付きの3D動画」「〇〇の仕組みを動画で」「yt-dlp で落としてフレーム分解して」「動画を1秒ごとに分解して内容を見て」と言われたら、Three.js と明言されていなくても必ずこのスキルを使うこと。Also use for any request to make a narrated 3D explainer / how-it-works short video with code (Three.js, WebGL, TTS narration, Gemini TTS, vertical shorts), or to download a reference video with yt-dlp and break it into frames to study its structure. 文字が音楽に合わせて動く MV は kinetic-type-mv、箱と矢印の構成図を動かすのは animated-arch-diagram を使う。
---

# Three.js で作る3D仕組み解説ショート動画

成果物は **MP4**（縦 1080×1920 / 30fps / H.264 + AAC、声は約 -14 LUFS）。ブラウザで再生するページはおまけ（`index.html` を開くとクリックで再生）。

## 必ず守ること（ユーザーから繰り返し指示されている。破ったら作り直す）
**解説とは、仕組みが作動する瞬間に、何が起きているかを説明すること。** だから運びは必ずこうする:
1. **実例に即した動作を起こす。** 現実の物理法則をゆがめず、実際に起こりうる想定を基準にする（絵のための都合のいい動きにしない）。
2. **動作が発生した瞬間ごとに止めて、解説に向かう。** 止めたままカメラが寄り、名札などで「いま何が起きているか」を示す。説明が済んだら（次の字幕で）再開し、その動作の結果まで見せる。
- 「仕組みが作動する瞬間」は題材ごとに違う。例: 砲弾が傾斜装甲に触れる瞬間（実際の当たり方＝斜めの面に当てる）、ボルトのねじ山がかみ合って締まる瞬間、弁が圧力で開く瞬間、歯車の歯がかみ合う瞬間、ばねが縮みきる瞬間。どれも「起こす → 止める → 解説 → 再開」。
- 止めた瞬間のカメラは、**動きの向きと、作用する面（当たる壁・かみ合う歯など）の両方が線として見える真横**から（向き = `cross(動きの向き, 面の法線)`）。後ろや斜めからだと角度の関係が奥行きに隠れて分からない。
- 冒頭の「思い込み」を見せる場面も例外ではない。動作を途中で切らず、起こして止める。「実は〜」の反転は、別のカットに切り替えず、止めた瞬間にそのまま寄る。
- **書き出す前に確かめる**: ビート表で「仕組みが作動する瞬間」がある字幕ごとに、そこで止めているか（`timeWarp` / `slowToStop`）、止めた瞬間に何を解説しているか、再開後に結果が映っているかを数える。1つでも欠けていれば作り直す。詳しく: 手順 4.5 と `references/explainer-motion.md`

## 仕組み（ベルトコンベア）

**台本 `script.json` がこの作品の「主体」**。声も絵も字幕も、台本から作ったタイムラインだけを見て動くのでズレない。

```
script.json ─→ tools/tts.mjs（Gemini TTS。セリフが同じなら voice/ の録音を使い回す）
               └→ out/narration.wav ＋ out/timeline.json（カットの始まり終わり・字幕ごとの時刻）
                     ↓
src/project.js のカット = update(t) で時刻 t の絵を作る関数（src/kit.js の部品で組む）
                     ↓ src/runtime.js が字幕と名札を重ねる
tools/render.mjs（Playwright）が t = 0, 1/30, 2/30… と1コマずつ JPEG で取り出す → ffmpeg で声と合わせて MP4
```

- カットは**声の少し前（0.15秒）で切り替わる**。字幕はシーンの声の長さを文字数で配分。動きを言葉に合わせるときは `ctx.cue('シーンid', 字幕番号)` でその字幕が出る時刻をもらう（秒を手で書かない）。
- すべての動きは「t を入れると必ず同じ絵になる関数」。乱数はシード付き、物理シミュレーションの状態は持たない。だから何度書き出しても同じ動画になり、途中の1コマだけ見直せる。

## 手順（小さく作って、毎回画像で確かめる）

### 0. 環境を確かめる
- `yt-dlp --version` / `ffmpeg -version` / `node --version`
- Playwright のブラウザは**先にキャッシュを見る**（Windows: `%LOCALAPPDATA%\ms-playwright`）。テンプレートは `playwright-core 1.59.1`（chromium-1217 に対応）。`render.mjs` はキャッシュの新しい Chromium → インストール済み Chrome の順に探す。

### 1. 参考動画を読む（参考があるとき）
```powershell
node "<このスキル>\assets\template\tools\analyze-ref.mjs" "<URL>" "<スクラッチ>\ref"
```
- `video.mp4`・`info.txt`・`frames/`（1秒1枚）・`sheet_1.jpg…`（8×3 のコンタクトシート）・`captions.txt`（自動字幕の書き起こし）ができる。**シートを Read して見る**（45秒なら2枚で全体が見える）。
- 自動字幕は聞き間違いが多い（「装甲」→「走行」など）。絵と突き合わせて意味を取る。
- 読み取るもの: 構成の型、1カットの長さ、字幕の位置・行数、カメラの動き、たとえ話の使い方。書き方は `references/structure.md`。
- 参考動画の**台本や絵をそのまま写さない**。構成の型だけ借り、言葉と絵は自分で作る。

### 2. 作業フォルダを作る
```powershell
New-Item -ItemType Directory -Force "<作業フォルダ>" | Out-Null
Copy-Item -Recurse -Force "<このスキル>\assets\template\*" "<作業フォルダ>"   # \* で中身をコピー
Copy-Item "<このスキル>\assets\template\.env.example" "<作業フォルダ>\.env"    # 隠しファイルは * で拾えないので別に
cd "<作業フォルダ>"; npm install
```
- API キーは `.env` の `GEMINI_API_KEY=` に入れる。「クリップボードから取って」と言われたら、**値を画面に出さずに**書き込む:
  `$k=(Get-Clipboard -Raw).Trim(); if($k -match '^[A-Za-z0-9_\-]{30,60}$'){ Set-Content .env "GEMINI_API_KEY=$k" -Encoding utf8NoBOM; "saved (len=$($k.Length))" }`
- テンプレートは完成例「先が丸い徹甲弾のなぞ（APCBC）」9カット・約48秒。`script.json` と `src/project.js` を新しい題材で上書きする前に、カットの書き方の見本として読む。

### 2.5 素材を集める（映像の本物らしさはここで決まる）
**形・地面・背景をコードだけで作らない。** 箱と球の寄せ集めとグラデーションの背景は、どう工夫しても安っぽく見える。先に CC0 の素材を集めて、それを組む。原因と対策の詳細: `references/realism.md`

**一度取った・作った素材は、このスキルの素材庫 `assets/library/` に貯まる。まず中身を見て、あれば使い回す。**
```powershell
node tools/library.mjs list       # 素材庫の一覧（Poly Haven の素材と、生成したモデル）
node tools/library.mjs use tank   # 生成済みのモデルを assets/gen/ にコピー
```
- `polyhaven.mjs get` は素材庫にあればネットに行かずにコピーし、新しく取った物は素材庫にも入れる。`comfy3d.mjs` で作ったモデルも、元画像・設定と一緒に素材庫へ入る。
- 素材庫の今の中身: 砂漠と曇りの公園の HDRI、乾いた地面・錆びた緑の金属・傷のある金属板のテクスチャ、砂漠の岩、生成した戦車（WWII風・架空）。
- **git に入れるのは作り方だけ**（生成モデルの `source.png` と `meta.json`）。モデル本体（`model.glb`）と Poly Haven の素材（`ph/`）はローカルだけに置く。無ければ Poly Haven は `npm run assets` で取り直し、生成モデルは `node tools/library.mjs use <名前>` が作り直すコマンドを出す。詳しく: `assets/library/README.md`

**主役の物（戦車・機械など）**は、既製の CC0 がまず無い。素材庫に無ければ「Codex で画像を1枚 → ローカルの ComfyUI（Pixal3D）で3D化」で作る。Sketchfab の CC-BY を使うならユーザーに落としてもらう（ログインが要る）。手順と落とし穴: `references/hero-model.md`
```powershell
node tools/polyhaven.mjs search hdris desert sand        # 実写の背景＋光（HDRI）を探す
node tools/polyhaven.mjs search textures metal rust       # 写真の PBR テクスチャ
node tools/polyhaven.mjs search models rock boulder       # 3D モデル
node tools/polyhaven.mjs get goegap 2k                    # assets/ph/goegap/ に保存（md5 検証、CREDITS.md に記録）
npm run assets                                            # 例題が使う7点を素材庫から（無ければネットから）そろえる
```
- Poly Haven は **CC0（商用可・クレジット不要）**。HDRI は 2k、テクスチャは 1k〜2k、モデルは 1k で足りる。
- 取る前にサイズを見る（ツールが表示し、60MB を超えたら止まる）。モデルは名前だけで選ばない（「rocks」が 25m の岩場だったことがある）。
- HDRI と、地面・岩などを**同じ撮影地のコレクション**からそろえると、光と色がなじむ（例: `goegap` と `namaqualand_boulder_03`）。

### 3. 台本を書く（`script.json`）
- 型（`references/structure.md`）: **思い込みの問い → 「実は逆」→ 身近なたとえ → 本題に当てはめる → 「ただし問題が」→ 解決策 → 仕組みのスローモーション → 名前の回収**。45秒前後・8〜10シーン・1シーン 4〜6秒。
- 1シーン = `{ id, say, captions?, pad?, style?, retake? }`。
  - `say` は**読ませる文**。読み間違えそうな語はかなで書く（例: 風帽 →「ふうぼう」、APCBC →「エー、ピー、シー、ビー、シー」）。
  - `captions` は**画面に出す字**（漢字・英字で）。配列の1要素が1枚の字幕、`\n` で改行。1行12〜14字まで、2行まで。
  - `pad` はそのシーンの声のあとの間（秒）。爆発など声なしで見せたいところで伸ばす。
- 声の設定は `tts: { model, voice, style }`。既定は `gemini-3.8-flash-tts` / `Charon`。`style` は声の演技の指示（落ち着いた男性ナレーター、など）。詳細は `references/gemini-tts.md`。

### 4. 声 → タイムライン
```powershell
node tools/tts.mjs --dry   # API を呼ばずに尺だけ見積もる（絵づくりを先に始めたいとき）
node tools/tts.mjs         # 本番。録れた尺がシーンごとに出る
```
- **録った声は使い回す**。`voice/<セリフのハッシュ>.wav` に残り、`say` の文字が同じなら API を呼ばない（シーン名・順番・字幕・`pad` を変えても録り直さない）。声やスタイルを変えたときは「録ったときと違います」と警告だけ出す。
  - 全部録り直す: `node tools/tts.mjs --fresh` ／ 1シーンだけ: そのシーンに `"retake": true` を付けて実行し、終わったら外す。
  - `voice/` は消さない（`out/` は書き出し物なので消してよい）。
- 429 / 5xx は自動で待って再試行する。

### 4.5 解説の運びを決める（ここを外すと、絵がきれいでも解説にならない）
仕組みの解説は「仕組みが働く瞬間に何が起きているか」を見せること。必ずこの順で作る（詳細と失敗例: `references/explainer-motion.md`）。
1. **現実の状況で、物理をゆがめずに動かす。** 当たる場所は形から求める（`findSlope` / `surfaceHit`）。跳ね返りは `glance`。飾りの回転はしない。
2. **仕組みが働く瞬間ごとに時間を止める**（`timeWarp`。再開は次の字幕 `ctx.cue`）。
3. **止めたままカメラが寄り、名札で説明する。**
4. **同じ物・同じ瞬間を続けて見せる。** 字幕でシーンが変わっても、1つの組み立てを共有して動画全体の時刻で動かす（`camKeys`）。
5. **仕組みの結果が画面に残るまで追う**（弾かれた弾が抜けていく、食い込んで止まる、まで映す）。止めた瞬間だけで終わらせない。
- コードの前に、字幕ごとのビート表を書く。列は「字幕 / 何が起きるか（物理） / どこに当たるか / 止めるか / 結果が映るか / カメラ / 前のビートとのつなぎ（続ける・切る）」。参考動画があるなら、仕組みが働く前後を 1秒4枚で見て、**参考が1カットで続けている所は続ける**（特に「実は〜」の反転は、前の着弾を止めたまま寄る）。
- 作ったら、1カットごとに「当たる前・止めた瞬間・結果・つなぎ」の4つが映っているかを sheet で確かめる（`references/explainer-motion.md` の確かめ）。

### 5. カットを作る（`src/project.js`）
- `export const scenes = { <id>: (ctx) => ({ shot, update(t, d, T) }) }`。`t` はカットの頭からの秒、`d` はカットの長さ、`T` は動画全体での秒。
- 舞台は `makeShot(stage, { bg, fog, dof })`。**カメラは `shot.fit(見る点, 見せたい横幅, 向き)` で置く**（縦長は横の画角が約20°しかなく、距離を勘で決めるとはみ出す）。
- 素材は `export async function preload(ctx)` で読み、返した物が `ctx.assets` に入る: `loadHDR`（背景・光・太陽の向き `sun`・地平線の色 `horizon`）、`loadPBR`（テクスチャ一式）、`loadGLTF(url, { size })`（縮尺をそろえたモデル）。
- 屋外は `makeShot({ bg: hdr, fog: { color: hdr.horizon }, dof, bloom })` ＋ `addSunlight({ dir: hdr.sun ×30, hemi: 0 })` ＋ `terrain`（起伏のある地面）＋ `scatter`（岩などをばらまく）。例題の `desert()` がひな形。
- 部品（`src/kit.js`）: 回転体 `lathe`＋先端の形 `noseProfile`、断面 `cutaway`、火花 `burst({ trail })`・水滴や破片 `burst({ instance })`、火の玉 `fireball`、空気の流れ `streaks`、水面と波紋 `waterSurface`、素材 `mat.*`、イージング `ease.*`。名札（引き出し線つき）は update の中で `ctx.label(位置, '文字', { offset, alpha })`。API: `references/kit.md`。
- **1カット書くたびに見る**:
  ```powershell
  node tools/render.mjs sheet 10:16.5:0.25 skip   # out/sheet-skip.png（開始:終了:刻み）
  node tools/render.mjs stills 13.2,14.0           # 原寸で確認
  ```
  シートは 0.3 秒以内にできる。何度でも回す。名札が画面の端で切れていないか、字幕と重なっていないかを見る。

### 6. 書き出し → 検証 → 納品
```powershell
node tools/render.mjs video <名前>             # out/<名前>.mp4（モーションブラー6回。48秒・1437コマで約1分半）
node tools/render.mjs video <名前> --blur 1    # ブラーなしの下書き（約3倍速い）
node tools/render.mjs stills 2.5,14.9 --blur 8 # 確認用の原寸。参考動画のコマと ffmpeg の hstack で並べて見比べる
node tools/render.mjs video part 20:27         # 区間だけ書き出す
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate -of compact out/<名前>.mp4
ffmpeg -hide_banner -nostats -i out/<名前>.mp4 -af ebur128=peak=true -f null -   # I（LUFS）と Peak を見る
ffmpeg -hide_banner -loglevel error -y -i out/<名前>.mp4 -vf "fps=1,scale=180:-1,tile=12x4" -frames:v 1 out/check-1fps.jpg
```
- 最後の 1fps シートで、全カットに絵・字幕・名札が出ていることを確かめてから渡す。
- ファイルを渡すツール（SendUserFile など）があれば MP4 を渡す。スクラッチの作業フォルダは消えるので、残すなら保存先を聞く。
- **声は聴けていない**（波形・数値・字幕のタイミングでしか確かめていない）こと、読み間違いがあれば `say` をかなに直して `retake` すれば済むことを伝える。

## 実際に踏んだ落とし穴

| 症状 | 原因 | 対処 |
|---|---|---|
| yt-dlp が動画を落とさず止まる | 英語字幕の取得が 429 で失敗し、全体がエラー終了 | 動画と字幕を別々に取る（`analyze-ref.mjs` は対応済み）。字幕は `ja` だけにする |
| 書き出しが何分も固まる | ページの読み込みエラー（構文エラーなど）で `EX.ready` が来ない | `render.mjs` は読み込み中の pageerror で即終了する。出たメッセージを直す |
| `Unexpected token '='` | `import { a = {} } from` のように import にデフォルト値を書いた | `import * as project` して `project.caption ?? {}` |
| 影の種類の警告 | r18x で `PCFSoftShadowMap` は廃止 | `PCFShadowMap` |
| 物が大きすぎてはみ出す・名札が画面外 | 縦長は横の画角が狭い（fov 35 で約20°） | `shot.fit(点, 横幅, 向き)` で置く。名札の `offset` は画面の内側へ向ける |
| 地平線に色の段差 | 背景のグラデーションと霧の色が違い、地面の端が見える | 背景の下端の色 = 霧の色、地面は霧の far より十分大きく |
| ES モジュールが読めない | file:// では import できない | `render.mjs` は作業フォルダを 127.0.0.1 のランダムなポートで配る。プレビューも `python -m http.server` などで |
| 音量が -14 LUFS に届かない（-15.5） | `loudnorm` 1パスの性質 | ショート動画ではこれで十分。きっちり合わせるなら2パス |
| スタイルを変えたら全部録り直しになった | 以前はモデル・声・スタイル・セリフでキャッシュしていた | いまはセリフだけで判定。録り直しは `--fresh` / `retake` |
| 映像がしょぼい・作り物っぽい | 形・地面・背景をコードの基本図形だけで作っていた | 手順 2.5 で CC0 の HDRI・テクスチャ・モデルを先に集める（`references/realism.md`） |
| 金属に白い大きなにじみ | HDRI の太陽が映り、bloom が拾う | `loadHDR` が明るさ 24 で切る。bloom の threshold は 6、金属の粗さは少し上げる |
| 水が黒い板・水色のベタ塗り | 暗い HDRI の映り込み／水の色が日光で光る | 曇り空など明るい空の HDRI。水の色はほぼ黒、カメラは少し見下ろす |
| 着弾が角に当たる・跳弾で宙返り・的がただの板 | 当たる場所と動きを目分量で決めた | `findSlope` で本物の斜面に当て、`glance` で面に沿って抜けさせる。手順 4.5 と `references/explainer-motion.md` |
| 生成した戦車が 45° 斜めを向いていた | 画像から作ったモデルは元画像のカメラの向きのまま | `headingYaw` で前を -x に、当てる面の法線で微調整 |
| 読み込みが数分かかる | 重いモデルへの斜面探しを全カットでやり直していた | 結果をモデルに対して一度だけ求めて使い回す |

## 時間の目安（RTX 5070 Ti）
- 参考動画の DL＋分解: 約20秒
- TTS: 1シーン数秒（9シーンで約1分）。2回目以降はセリフを変えたシーンだけ
- コンタクトシート 32コマ: 0.2〜0.3秒 ／ MP4 48秒: 約36秒
- 例題（9カット）をゼロから納品まで: 約1時間（カメラの収まりの直しを2巡）
