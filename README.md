# skills

Claude Code などの AI エージェントで使えるスキル置き場です。

## 使い方

使いたいスキルのフォルダを、手元のスキル用フォルダにコピーして使ってください。
Claude Code なら `~/.claude/skills/` です。

```bash
git clone https://github.com/musoukun/skills.git
cp -R skills/screenshot-annotate ~/.claude/skills/
```

## 収録スキル

- **screenshot-annotate** — スクリーンショットに番号付きの赤枠と日本語の凡例パネルを重ねて、英語UIの「使い方ガイド画像」を作る

- **[ddd-requirements-modeling](ddd-requirements-modeling/SKILL.md)**: 要件から業務の分類、中心となる情報と守る決まり、業務同士のつながりを整理し、設計の土台を作る。判断基準と出力テンプレートを同梱。

- **[threejs-explainer-video](threejs-explainer-video/)**: 独自ライセンスを付けて公開をやめました。二次配布、販売、共有を禁止しています。

- **[pattern-abstraction](pattern-abstraction/SKILL.md)**: 要件・問い合わせ・事例の集まりを、対応が変わる分かれ目で階層に分けて整理する（パターン分け・ケース分け）。上の階層ほど根本の問い、下の階層は「なぜそうなるか」で分け、名前は相手の側で何が起きているかで付ける。

- **[animated-arch-diagram](animated-arch-diagram/SKILL.md)**: 構成図や処理の流れを、X などに貼れる動く図（MP4 / GIF）にする。箱と線の構成図型と、1 つのデータが手順を通って変わっていく様子を見せる運搬型の 2 つの型がある。Playwright で 1 コマずつ撮って ffmpeg で書き出すテンプレートを同梱。

- **[skill-for-lower-model](skill-for-lower-model/SKILL.md)**: 上のモデル（Opus など）で動いているスキルを読み、下のモデル（Sonnet・Haiku など）でも動かすために直す必要がある点を、スキルの文の引用つきで助言する。下のモデルが崩れやすい 8 つの観点の点検表と、2 つのスキルで実際に起きた例を同梱。

- **[battle-rap-lyrics](battle-rap-lyrics/SKILL.md)**: 日本語の MC バトル風ラップの歌詞を、Suno の歌詞欄に貼れる形で書く。ユーザーが書いた歌詞の行は残したまま整え、あらすじを渡されたら出来事を捻って短い言い切りに縮める。MC バトルの技、決め手の行の文の型、韻の踏み方をまとめた資料を同梱。

- **[lyric-scroll-video](lyric-scroll-video/SKILL.md)**: mp3 から、曲名・ジャケット・動く背景・音の波形・下から流れる歌詞が入った縦長の動画（1080x1920 の mp4）を作る。歌詞とジャケットは mp3 のタグから読み、声を聞き取って歌詞を歌い出しの時刻に合わせる。動画を作るスクリプトと、歌詞の時刻を出すスクリプトを同梱。

- **[prompt-refactor](prompt-refactor/SKILL.md)**: AI への指示（プロンプト）を、ふるまいを変えずに意訳して書き直す。縮めたいときは、文を役目で分け、縮めてよい文だけを縮める。指示の食い違いの見つけ方、テストで外れた会話の直し方、縮めて確かめた経緯、引用が資料にあるかを確かめるプログラムを同梱。

- **[tech-article-writer](tech-article-writer/SKILL.md)**: Zenn 向けの技術記事を、過去の記事の文体と構成に合わせて書く。ツール紹介、自作したものの公開、やり方の共有の 3 つの型から記事に合う型を選び、文体の決まりと書き終えた後の点検表に沿って書く。
