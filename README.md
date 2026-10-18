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

- **[threejs-explainer-video](threejs-explainer-video/SKILL.md)**: ものの仕組みを 3D で見せる縦型の解説ショート動画（字幕・男性ナレーション付き MP4）を、Three.js とコードだけで作る。参考動画の 1 秒 1 枚の分解、Gemini TTS の声（セリフが同じなら使い回し）、CC0 素材（Poly Haven）の取得、Codex の画像 → ローカル ComfyUI での 3D 化、「仕組みが働く瞬間に時間を止めて説明する」ための部品を同梱。

- **[pattern-abstraction](pattern-abstraction/SKILL.md)**: 要件・問い合わせ・事例の集まりを、対応が変わる分かれ目で階層に分けて整理する（パターン分け・ケース分け）。上の階層ほど根本の問い、下の階層は「なぜそうなるか」で分け、名前は相手の側で何が起きているかで付ける。
