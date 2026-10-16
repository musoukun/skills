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

- **[animated-arch-diagram](animated-arch-diagram/SKILL.md)**: 仕組みを説明する動画（MP4 と GIF）を作る。実例の操作を 1 回見せ、解説したい瞬間で止めて、その裏の仕組みを動きで見せる。作りかけ（場面の並べ方・ズーム・画面いっぱいに広げる切り替えまで）。
