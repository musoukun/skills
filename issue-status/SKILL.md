---
name: issue-status
description: 自分が担当している GitHub issue の「今どうなっているか」と、作業フォルダ（git worktree）の空き状況をまとめて確認する skill。「担当 issue の状況」「自分のチケット確認」「今抱えてる issue 一覧」「何が止まってる？」「ボールどっち？」「自分の issue の進捗まとめて」「空いてる worktree ある？」などと言われたら使う。issue 番号を指定されなくても、自分の担当 issue を棚卸ししたい意図が見えたら起動する。最重要: ブランチや PR の有無だけで「未着手」などと判断してはいけない。各 issue のコメントを 1 件ずつ実際に読んで現状を出す。
---

# issue-status

自分が担当している GitHub issue を棚卸しして、1 件ずつ「今どこで止まっているか・誰の対応待ちか」を表にまとめる。あわせて、次の作業に使える空き worktree を表にする。

## 設定（使う前に書き換える）

worktree は、リポジトリごとに 1 つの親フォルダにまとめておく前提で動く。

| 項目 | 値（例） |
|---|---|
| base ブランチ | `main` |
| worktree の親フォルダ | `~/develop/<リポジトリ名>-worktree/` |

親フォルダが無いリポジトリでは `git worktree list` の全部を出す。ツールが自動で作る worktree（例: `.claude/worktrees/` の下）は表に入れない。

## この skill が生まれた背景（守るべき教訓）

- **ブランチ／PR の有無だけで状況を判断したら間違えた。** 「PR が無い＝未着手」と決めつけたが、実際にはコメントで質問を投げて相手の回答待ちだったり、本人が調査中で方針を練っていたりした。**必ず各 issue のコメントを 1 件ずつ読む。**
- **事実だけを書く。** 「優先度を上げた方がいい」「先に動いた方がいい」のような判断・提案は添えない。誰が何を言ったか、今ボールはどちらか、という事実だけ。
- **平易な日本語で短く。** 表にして一目で分かる形にする。専門用語・英語のステータス語を並べない。

## いつ使うか

「担当 issue の状況」「自分のチケットの今」「何が止まってる」「ボールどっち」など、自分の持ち issue を一覧で把握したいとき。番号指定があればその範囲だけでもよい。

## 手順

### 0. worktree の空き状況を取る（毎回必ず出す）

issue の棚卸しと**必ずセット**で、worktree の空き状況も出す。並行開発しているなら、次にどのフォルダで着手できるかを一緒に知りたいはずなので、省かない。

#### 状態を取る

```bash
git fetch -q origin         # origin/<base> を最新にしてから比べる
for p in <worktree の親フォルダ>/*/; do
  b=$(git -C "$p" branch --show-current)          # 空なら detached
  m=$(git -C "$p" status --porcelain | grep -v '^??' | wc -l | tr -d ' ')
  u=$(git -C "$p" status --porcelain | grep '^??' | wc -l | tr -d ' ')
  git -C "$p" merge-base --is-ancestor HEAD origin/<base> && inbase=yes || inbase=no
  echo "$p | [${b:-detached}] | 変更 ${m} 未追跡 ${u} | base に含まれる: ${inbase}"
done
```

#### 「空き」の決め方

次の 2 つを両方満たすフォルダを「空き」と書く。

- 変更も未追跡も 0 件。
- 次のどれかに当てはまる。
  - HEAD が origin/<base> に含まれている。
  - そのブランチの PR がマージ済み（squash マージだと含まれないので、手順 3 の PR 一覧で確かめる）。
  - コミットが全部 push 済みで、そのブランチの issue が閉じている（課題が完了している）。

それ以外は「○○ 作業中」と書く。未追跡だけ残っていて PR がマージ済みのものは、「#N マージ済み・未追跡 N件」と事実をそのまま書く。1 issue = 1 branch なので、着手前にここで既存ブランチ／worktree の重複を確認する。

#### 空きのフォルダで着手するとき・終わったとき

```bash
# 着手: 空きのフォルダで、origin/<base> から新しいブランチを切る
git -C <空きのフォルダ> fetch -q origin
git -C <空きのフォルダ> switch -c <feat/N-xxx> origin/<base>

# PR がマージされたら: base の最新に戻して空きにする（変更が無いことを確かめてから）
git -C <フォルダ> fetch -q origin
git -C <フォルダ> switch --detach origin/<base>
```

`.env` のように git に入れていないファイルは worktree に無い。新しく作り直したときはメインフォルダからコピーする。

### 1. 自分とリポジトリを特定する

```bash
gh api user --jq .login                                   # 自分の login
gh repo view --json nameWithOwner -q .nameWithOwner       # 今のリポジトリ
```

以降 `REPO` はこの nameWithOwner。

### 2. 担当の open issue を取る

```bash
gh issue list --repo <REPO> --assignee @me --state open \
  --json number,title --jq '.[] | "\(.number)\t\(.title)"'
```

番号を指定されているときはその issue だけを対象にする。

### 3. 自分の PR を取って issue に対応づける

```bash
gh pr list --repo <REPO> --author @me --state all --limit 50 \
  --json number,state,isDraft,title,body \
  --jq '.[] | "PR#\(.number)\t\(.state)\tdraft=\(.isDraft)\trefs=\([.body|scan("(?i)#[0-9]+")]|join(","))\t\(.title)"'
```

**注意:** リポジトリによっては PR 本文の `Closes #N` が GitHub に自動リンクされておらず、`closingIssuesReferences` が空で返る（その場合マージしても issue は自動で閉じない）。たとえば PR の向き先がデフォルトブランチ以外だと、自動リンクは効かない。だから対応づけは **PR 本文を `#N` でスキャンして**結びつける。`closingIssuesReferences` だけに頼らない。

これで「どの issue にどの PR がぶら下がっているか」「その PR は open / draft / merged のどれか」が分かる。マージ済みなのに issue が open のままなら **閉じ漏れの可能性**として後で印を付ける。

### 4. 各 issue のコメントを 1 件ずつ読む（軽いモデルのサブエージェントを並列で）

ここが肝。issue ごとにサブエージェントを 1 つ立て、全部同じターンで並列に投げる。内容を読んでまとめるだけなので、軽いモデル（Claude Code なら `model: sonnet`）で十分。各サブエージェントへの指示テンプレート：

```
GitHub issue <REPO> #<N> の現在の状況を、本文とコメントを実際に読んで報告してください。推測しないこと。

1. gh issue view <N> --repo <REPO> --json title,body,state,assignees,labels,comments \
     --jq '{title,state,assignees:[.assignees[].login],labels:[.labels[].name],body,comments:[.comments[]|{author:.author.login,createdAt,body}]}'
2. コメントに画像 URL（user-attachments/assets など）があれば存在を記録。状況判断に要りそうなら言及。
3. 事実だけ・平易な日本語で簡潔に報告:
   - 何の依頼か（1〜2行）
   - コメントのやり取りの要点（誰が・いつ・何を、時系列で）
   - 今のボール（誰の対応待ちか）／止まっている理由・決まっていること
   - 担当者がすでに着手・回答・対応しているか（コメント上の証拠ベースで）
判断・提案・優先度の意見は添えない。事実と出典（コメント日時・発言者）だけ。
```

CI bot（github-actions など）の自動コメントは「人のやり取り」と区別する。最後の人間コメントが誰かでボールを判断する。

### 5. まとめて表にする

3（PR の状態）と 4（コメントから読んだ実態）を突き合わせて、issue ごとに 1 行にまとめる。状況欄には「どの段階か＋今ボールが誰か」を書く。

## 出力フォーマット

issue の状況表と worktree の空き状況表を**両方**出す。

**issue の状況**

```
| issue | 内容 | 状況 |
|---|---|---|
| #101 | ログイン画面の文言 | PR #120 レビュー中・指摘対応済み → レビュアーのマージ待ち |
| #102 | 一覧の並び順 | 起票者に3点質問中（並べる基準/向き/保存するか）→ 相手の回答待ち |
| #103 | CSV 出力の文字化け | PR #125 マージ済み＋追加分 #128 が下書き |
| #104 | 検索結果の件数表示 | PR #125 マージ済み（issue 開いたまま＝閉じ漏れの可能性） |
```

**worktree の空き状況**（毎回出す）

```
| フォルダ | ブランチ | 未コミット | 用途 |
|---|---|---|---|
| my-app（メイン） | feat/101-... | 1件 | #101 作業中 |
| my-app-worktree/wt1 | main | 0件 | 空き |
| my-app-worktree/wt2 | feat/103-... | 0件 | #103（push 済み・clean） |
| my-app-worktree/wt3 | chore/try-xxx | 3件 | 試し中 |
```

表の下に 2〜3 行で全体像（例: PR が動いてるのが N 件、相手の回答待ちが N 件、本人検討中が N 件、閉じ漏れ N 件、着手に使える空き worktree が N 件）。ここでも提案はしない。状況の要約だけ。

## やってはいけないこと

- **ブランチ／PR が無いだけで「未着手」と書く**（コメントを読まずに段階を決めつける）。コメントを読めば「質問して回答待ち」「本人が調査中」などが分かる。
- 事実報告に判断・優先度・「こうした方がいい」を混ぜる。
- 英語のステータス語やツール名を並べた読みにくい表にする。
- CI bot の自動コメントを人のやり取りと混同してボールを誤る。
- 番号指定があるのに担当 issue 全部を勝手に広げる。
