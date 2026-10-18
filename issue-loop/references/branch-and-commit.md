# ブランチとコミットの決まり（issue-loop Step 4-4）

## ブランチを切る手順

1. **同じ issue のブランチが無いか探す**（あればそれを使う。2本目を作らない）

   ```bash
   git branch -a | grep <issue番号>
   git ls-remote --heads origin "*<issue番号>*"
   git worktree list | grep <issue番号>
   ```

2. **作業する worktree を決める**。worktree の親フォルダの中から、使い終わったもの（未コミット 0 件で、マージ済み、または全部 push 済みで issue が閉じている）を選ぶ。探し方は `issue-status` スキルの手順 0。見つからなければ親フォルダの中に新しく作る

3. **main を pull して、main から切る**

   ```bash
   gh issue view <issue番号> --json title -q .title    # 名前を確かめる
   git -C <worktree> fetch origin main
   git -C <worktree> switch -c <ブランチ名> origin/main
   ```

4. **push は行き先を明示する**: `git push -u origin HEAD:<ブランチ名>`。追跡先が main のままだと、素の `git push` が main に飛ぶことがある

## ブランチ名

- 形: `<type>/<issue番号>-<issue名を短い英語にしたもの>`（小文字・ハイフンつなぎ）
- type: `feat` / `fix` / `chore` / `docs` / `refactor` / `test` / `ci` / `build`
- 例: issue #259「テストできる環境の整備」→ `feat/259-test-environment`

## コミットメッセージ

- 英語で書く
- 形: `<type>: <subject> (#<issue番号>)`。1 行目は 50 文字以内。issue があるときだけ末尾に `(#番号)` を付ける（GitHub が issue とコミットをつなげてくれる）
- 本文は任意。1 行空けてから英語で書く
- 例: `fix: redirect after login (#123)`
