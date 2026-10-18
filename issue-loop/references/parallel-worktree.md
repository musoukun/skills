# 並列実行（オプション、最大2）

選んだ issue のうち2件までを、worktree＋サブエージェントで並列に処理してよい。3件以上は並列にしない。

- 2件とも、worktree の親フォルダの中の「使い終わった worktree」で作業する（基本ルール 4）。空きが無ければ親フォルダの中に新しく作る
- 1件目は本体が処理し、2件目は別の worktree でサブエージェントに処理させる
- サブエージェントには、この SKILL.md と issue 番号を渡し、Step 4 を最後まで自走させる
- サブエージェントも、リンク先・画像の確認、4-1b の質問ルール、A/B 判定を守る

worktree には `node_modules` や `.env` のような git に入っていないものが無い。**サブエージェントを起動する前に**環境を作る。忘れるとチェックも開発サーバーも動かない。

```bash
MAIN=<メインのフォルダ>
WORKTREE=<使う worktree>
# 1. git に入っていない設定ファイルをコピーする
for f in $(cd "$MAIN" && find . -maxdepth 4 -name ".env*" -not -path "*/node_modules/*"); do
  mkdir -p "$WORKTREE/$(dirname "$f")"; cp "$MAIN/$f" "$WORKTREE/$f"
done
# 2. 依存を入れる（リポジトリのパッケージマネージャーで）
cd "$WORKTREE" && npm install
```
