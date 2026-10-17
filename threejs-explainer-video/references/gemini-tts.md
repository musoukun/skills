# Gemini TTS（ナレーション）

2026-10 に公式ドキュメント（https://ai.google.dev/gemini-api/docs/speech-generation）と実際の呼び出しで確かめた内容。版が変わったら、書く前にもう一度ドキュメントを見る。

## モデル
- `gemini-3.8-flash-tts`（既定。表現の幅が広い）／ `gemini-3.8-flash-lite-tts`（速くて安い）
- 古いもの: `gemini-3.1-flash-tts-preview`、`gemini-2.5-pro-preview-tts`
- 日本語に対応。

## 呼び出し（Interactions API）
```
POST https://generativelanguage.googleapis.com/v1beta/interactions
x-goog-api-key: <GEMINI_API_KEY>
content-type: application/json

{ "model": "gemini-3.8-flash-tts",
  "input": [{ "type": "user_input", "content": [{
      "type": "text", "text": "読ませる文",
      "annotations": [{ "type": "speech_metadata", "style": "落ち着いた男性ナレーター" }] }] }],
  "response_format": { "type": "audio" },
  "generation_config": { "speech_config": [{ "voice": "Charon" }] } }
```
- 返り値: `steps[]` のうち `type: "model_output"` の `content[]` に `{ type: "audio", mime_type: "audio/wav", data: <base64> }`。**WAV（RIFF ヘッダ付き）24kHz / 16bit / mono** なので、そのままファイルに書ける。
- `text` は**一字一句そのまま読む原稿**として扱われる。「明るく」などの演技の指示は text に混ぜず `style` に書く。一瞬の演技は text の中に `<short pause>` `<sigh>` `<laugh>` のように書ける。
- SDK なら `client.interactions.create(...)` → `interaction.output_audio.data`（今回は依存を増やさないため fetch で直接呼んでいる）。

## 声（公式の30種。説明は公式の一語）
Zephyr: Bright / Puck: Upbeat / Charon: Informative / Kore: Firm / Fenrir: Excitable / Leda: Youthful / Orus: Firm / Aoede: Breezy / Callirrhoe: Easy-going / Autonoe: Bright / Enceladus: Breathy / Iapetus: Clear / Umbriel: Easy-going / Algieba: Smooth / Despina: Smooth / Erinome: Clear / Algenib: Gravelly / Rasalgethi: Informative / Laomedeia: Upbeat / Achernar: Soft / Alnilam: Firm / Schedar: Even / Gacrux: Mature / Pulcherrima: Forward / Achird: Friendly / Zubenelgenubi: Casual / Vindemiatrix: Gentle / Sadachbia: Lively / Sadaltager: Knowledgeable / Sulafat: Warm

- 解説ナレーションには Informative / Knowledgeable / Firm の声が合う。既定は **Charon**（男性の解説役として選んだ。公式一覧には性別が書いていないので、違う声にしたいときは短い文で数種類録って聞き比べる）。
- ほかに数百の声が `GET /v1beta/voices` で一覧できる。

## 尺の目安（実測）
| 語り口（style）の指定 | 速さ | 例: 約250字の台本 |
|---|---|---|
| 「落ち着いた低めの男性ナレーター。科学ドキュメンタリーの語り口で、やや速めに」 | 約 5.5 字/秒 | 声だけで約 43 秒 |
| 「テンポよく、やや速めに、はっきりと。間を取りすぎず」 | 約 6.6 字/秒 | 声だけで約 40 秒 |
| 「ゆっくり」を含む指定 | 4 字/秒前後（試作で約 61 秒になった） | 長くなりすぎる |
- 字数は句読点と記号を除いて数える。動画の長さ = 声 ＋ `lead` ＋ シーン間の `gap`（または `pad`）× シーン数 ＋ `tail`。
- `--dry` の見積もりは 6 字/秒で計算する。狙いの尺に足りないときは、語り口を変えるより、見せ場のシーンの `pad`（声のあとの間）を伸ばす。

## 読み間違いの直し方
- 漢語・専門用語・略号は `say` をかなにする（字幕 `captions` は漢字のまま）。例: 風帽 →「ふうぼう」、APCBC →「エー、ピー、シー、ビー、シー」。
- 直したら、そのシーンだけ `"retake": true` で録り直す（セリフが変わればハッシュが変わるので、`say` を直した場合は retake なしでも録り直される）。

## キャッシュ（使い回し）
- `voice/<say のハッシュ12桁>.wav` と `.json`（録ったときの model・voice・style）。
- 判定は **say の文字だけ**。シーン名・順番・字幕・間を変えても録り直さない。声・スタイル・モデルを変えたときは警告だけ出して使い回す。全部録り直すなら `--fresh`。
