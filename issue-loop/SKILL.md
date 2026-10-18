---
name: issue-loop
description: GitHub の Kanban から1〜3件の issue を取って、1件ずつ順番に「理解 → A/B 判定 → （必要なら設計）→ ブランチ → Before → 実装 → After → PR → レビュー対応」まで自走で処理する skill。feedback / enhancement / bug すべて対象。明示トリガーは `/issue-loop`、「kanban から issue 回して」「3件まとめて対応して」「ループで issue 処理」「feedback 回して」など。各 issue で A/B 判定する：A（やることが明確）なら設計を省いてすぐ実装に進めるか確認、B（曖昧）なら設計 HTML を見せて Accept を取ってから実装。「実装しなくていいから A パターン（すぐ迷わず実装できる issue）だけ洗い出して」「簡単なやつリストして」のように着手せず候補だけ見たいときは**スキャンモード**（`--scan`）で、A の issue だけを表にして止まる。
---

# issue-loop

GitHub の Kanban から条件に合う issue を取得し、最大3件を **1件ずつ直列で**「理解 → 実装 → 検証 → PR → レビュー対応」まで進める。各 issue は **A/B 判定**で「すぐ実装」か「設計してから」を分岐させる。失敗時は人間に相談に戻る。

本ファイルは**基本ルールとループの骨格**。詳細手順は references/ にあり、下の表の「読むタイミング」が来たら**その場で Read する**（起動時に全部先読みしない）。

## 設定（使う前に書き換える）

| 項目 | 値（例） |
|---|---|
| base ブランチ | `main` |
| worktree の親フォルダ | `~/develop/<リポジトリ名>-worktree/` |
| チェックコマンド（push 前に通す） | `npm run check` |
| 開発サーバーの起動コマンド | `npm run dev` |
| レビュアー | `<GitHub の login>` |
| Kanban（GitHub Projects）の owner と番号 | `<org>` / `<番号>` |
| 判断に迷ったときの質問先 | `<GitHub の login>` |

## 基本ルール（どの issue でも必ず守る）

1. **issue に着手するときは、base（main）を必ず pull して、最新の main から切る。** 古い main や別のブランチから切らない。
2. **ブランチ名には issue 番号とその名前を入れる。** 形は `<type>/<issue番号>-<issue名を短い英語にしたもの>`（例: `fix/123-login-redirect`）。詳しくは `references/branch-and-commit.md`。
3. **1 issue = 1 ブランチ。** 切る前に、同じ issue のブランチがローカル・remote・他の worktree に無いか探す。あればそれを使う。
4. **worktree は 1 つの親フォルダにまとめる。** 新しく作る前に、親フォルダの中から「使い終わった worktree」を探して、その中で作業する。使い終わったとは、未コミットが 0 件で、ブランチがマージ済みか、全部 push 済みで issue が閉じていること。空きの探し方は `issue-status` スキルの手順 0 と同じ。
5. **gh を使って issue に** ……（未記入。元のメモが途中で切れていたため、続きを書き足す）
6. issue / PR へのコメントは `issue-comment-style` スキルのルールで書く。

## 目次（いつ・何を読むか）

| 読むタイミング | ファイル | 中身 |
|---|---|---|
| 起動時（必ず） | `issue-comment-style` スキル | issue / PR コメントの書き方ルール |
| スキャンモードに入るとき | `references/scan-mode.md` | 洗い出しだけして止まるモードの手順 |
| Step 1 候補取得 | `references/kanban-fetch.md` | `gh project item-list` での取得・絞り込み |
| Step 4-3〜4-3.5 の前 | `references/ambiguity-and-abc.md` | 2種類の曖昧さ・2レーンの見せ方・ABC 質問のルール |
| グラフ・表を作る plan を書く前 | `references/chart-question-first.md` | 図を作る前に「答えたい問い」を書く |
| Step 4-4 ブランチ作成 | `references/branch-and-commit.md` | ブランチ名・コミットメッセージの決まり |
| Step 4-5 / 4-6c 撮る前（必ず） | `references/before-after-capture.md` | Before/After 撮影の鉄則と、よくある事故 |
| Step 4-6a 実装委譲の前 | `references/implementation-delegation.md` | 実装サブエージェントに渡す指示の必須項目 |
| Step 4-7 証拠コメント | `references/evidence.md` | Before/After エビデンスの雛形 |
| Step 4-9〜4-10 push・PR の前 | `references/push-and-pr.md` | push 前のチェックと PR の決まり |
| 並列実行するとき | `references/parallel-worktree.md` | worktree の準備と並列の約束事 |
| サブエージェントを使う各ステップ | `references/model-selection.md` | ステップ×モデルの使い分け表 |
| 外側を自走化したいとき | `references/ralph-loop.md` | ralph-loop で回す方法 |

## 前提ツール

- **GitHub CLI（`gh`）**：認証済みであること。Kanban を読むので `gh auth refresh -s project` で project の権限も付けておく
- **`gh attach` 拡張**（`gh extension install Addono/gh-attach`）：Before/After 画像を issue / PR コメントに貼るため
- **Playwright**（または `webapp-testing` のようなスキル）：UI の Before/After スクショ用
- **Slack MCP**（任意）：issue 本文に Slack スレッドのリンクが貼られる運用なら、スレッドと添付画像を読むのに使う

## A/B 判定（各 issue で必ず行う）

各 issue を理解したら「やることが明確か」を見る。

- **A（明確）**：本文だけで「どこをどう直すか」が一意に決まる。手段が分岐しない。困りごと/動機が表に出ていない純粋な指示
- **B（曖昧）**：タイトルだけだと推論が要る、修正パターンが複数ある、困りごと/動機が書かれている

判定結果で設計ステップを分岐する（下の Step 4-2）。**A でも軽い設計が欲しいこともある**ので、A のときは決め打ちせず人間に 2 択で聞く。

## HARD-GATE（破ったら失敗）

1. **設計 Accept**：設計 HTML を作る場合（B、または A で「設計する」を選んだ場合）は、HTML を見せて Accept をもらうまで実装に進まない。**「すぐ実装」を選んだ A はこのゲートなし**
2. **ゴール未達時**：実装→検証を3回回してもゴールが満たせない場合、PR を出さずに人間に相談（`NEEDS_HUMAN` で停止）。検証で失敗しているのに PR を出すのは厳禁
3. **リンク先・画像を必ず読む**：issue 本文に Slack スレッドなどのリンクがあれば必ず開く。添付画像があれば必ず中身を見る。本文だけで難易度や方針を判断しない（本文は薄く、画像にエラーや該当画面が映っているのが普通）。開けなかったら「見れていない」と申告する
4. **推測で事実を足さない**：画像にない演出・起票者が言ってない動機・勝手な業界パターン当てを禁止。判断がつかない点は Step 4-1b で質問先に聞いて、その issue は中断
5. **「試作 / プロトタイプ」は本物の画面に実装する**：「試作してみて」と言われても、別ルートや使い捨てページを**新規に作らない**。その issue が指す**実際の画面・コンポーネント**に最小実装し、設定の起動コマンドで実画面を開いて試す。閲覧用に認証を外すなど本筋でない改変もしない
6. **スクショは「実装が組み込まれた本物の画面」を撮る**：確認用の一時ページ・プレビュー route・コンポーネント単体のハーネスを作って、それを「実装結果」として貼らない。本物の画面がデータ不足で出せないときは、止まって「どのデータなら実画面を出せるか」をユーザーに聞く。サンプル値で代用してよいのは、ユーザーが明示的に「サンプルでいい」と言ったときだけ
7. **plan ファイルはコミットしない**：plan やローカルの計画メモは手元用。`git add` で拾わない・PR に含めない。ステージ前に `git status` を見て、混じっていたら外す

3件中いずれかで `NEEDS_HUMAN` が出たら、残りの件には自動で進まず人間の判断を仰ぐ。

## 全体フロー

各ステップを 1 タスクずつタスクリストに積んで順に進める。
**スキャンモード**（`--scan`、または「洗い出しだけ」の依頼）のときは `references/scan-mode.md` に従い、候補の表を出して止まる。

### Pre-flight: 3つの質問

AskUserQuestion で以下を **1 問ずつ** 聞く。ラベル・説明はすべて平易な日本語で。

1. **タグは？** — `feedback` / `enhancement` / 両方
2. **どこから取る？** — `Ready` / `Backlog` / `In progress`
3. **選び方は？** — `手動で3件選ぶ` / `自動で簡単そうな3件を選ぶ`

### Step 1: 候補取得（最大10件）

Kanban の列（Status）はラベルではなく GitHub Projects のカスタムフィールドにあるので、`references/kanban-fetch.md` の手順で取得する。列・タグで絞り、assignee が他人の issue を除外し、10 件に打ち切って「番号 / タイトル / タグ / assignee」の表にする。

### Step 2: 各候補を軽く読む

各候補の本文・コメント・画像を読み、次の表にまとめる（設計 HTML はまだ作らない）。

| # | タイトル | やること | 触るファイル目安 | 不明点 | 難易度 |
|---|---|---|---|---|---|

### Step 3: 3件を選ぶ

- **手動モード**: 表を見せて「どの3件にする？」とテキストで聞き、番号で答えてもらう
- **自動モード**: 難易度 `低` の上位3件を取る。`低` が3件未満なら、不足分を `中` から拾うか件数を減らすかを人間に聞く

### Step 4: 1件ずつ直列で処理（最大3件）

1件終わるまで次に進まない。**4-1〜4-3.6 は A/B で分岐するが、4-4 以降（ブランチ・Before/After・push・PR・レビュー対応）は A も B も共通**。

```
for issue_n in selected:
  4-1. 理解
       - gh issue view <N> --json title,body,comments で本文・コメントを取る
       - 本文のリンク（Slack スレッドなど）は必ず開く。添付画像は必ず中身を見る
       - ここまでの事実だけを根拠に「何をすべきか」を 1〜2 文で固める

  4-1b. 判断がつかない点が残ったら、質問先に issue コメントで聞いてこの issue は中断
       - 自分のたたき台を1つ出して「〜で良さそう？」と聞く（issue-comment-style）
       - 質問したら次の issue へ。返事が来たら次のループで再着手

  4-2. A/B 判定
       - A → AskUserQuestion で2択:「進め方だけ書いて実装に進む」/「設計 HTML を作って確認する」
           - 「進め方だけ」→ 進め方コメントを issue に投稿 → 4-3.5 へ
           - 「設計 HTML」→ 4-3 へ
       - B → 4-3 へ

  4-3. 設計 HTML を 1 枚作って見せる（＝見た目・体験の方向を決める）← HARD-GATE 1
       - 「今の画面 / 変更後の画面 / 必要な変更」が 1 枚で分かるもの
       - 見た目の案が割れているときは、A/B/C 案を 1 枚に横並びで描いて番号で選んでもらう

  4-3.5. 残った曖昧さを潰す（references/ambiguity-and-abc.md）
       - 見た目が変わるもの → 案を絵で並べて選んでもらう
       - 見た目に出ないもの → AskUserQuestion で 1 問ずつ A/B/C
       - 割れていなければ質問ゼロでよい

  4-3.6. plan を書く（実装サブエージェントへ渡す唯一の入力）
       - テンプレ: Goal / Current Findings / Decisions / Open Questions Resolved /
         Scope / Steps / Validation / Risks
       - Decisions に「設計で決めた方向」と「4-3.5 の回答」を両方書く
       - グラフ・表を作るなら references/chart-question-first.md の 3 行を書く
       - plan を人間に見せて承認を待つ（A で「進め方だけ」を選んだ場合は省略可）

  4-4. ブランチ作成（基本ルール 1〜4）
       - worktree の親フォルダから使い終わった worktree を探して、そこに入る
       - 同じ issue のブランチが既に無いか探す（ローカル・remote・他の worktree）
       - 無ければ main を pull して、main から 1 本だけ切る
       - push は `git push -u origin HEAD:<branch>` と行き先を明示する

  4-5. Before キャプチャ（references/before-after-capture.md を読んでから撮る）
       - 自分の環境で現状を再現して撮る。お客さんが貼った画像を Before の代わりにしない

  4-6. 実装→検証ループ（最大3周）
       a. 実装は実装サブエージェントへ委譲する（references/implementation-delegation.md）
       b. チェックコマンドを通す
       c. After キャプチャ（Before と同じ手段で、本物の画面を撮る）
       d. ゴールを満たしているか自己レビュー
          - 満たしている → 4-7 へ
          - 満たしていない → 3回未満なら a へ戻る、3回到達なら NEEDS_HUMAN

  4-7. 証拠を issue にコメント（references/evidence.md）
       gh attach upload before.png after.png \
         --target <owner>/<repo>#<N> --strategy release-asset --format markdown
       出てきた markdown を 1 つのコメントにまとめて投稿する

  4-8. issue の assignee を自分にする（gh issue edit <N> --add-assignee @me）
       理由: 着手済みを見えるようにして、他の人と作業が重ならないようにする

  4-9. push（references/push-and-pr.md：チェックが通らなければここで止まる）

  4-10. PR 作成（references/push-and-pr.md）

  4-11. レビュー指摘に対応
       - インラインコメント: gh api repos/<owner>/<repo>/pulls/<N>/comments
       - 全体コメント: gh pr view <N> --json comments
       - 指摘は [must]/[imo]/[nits] 全部対応する。自分の判断で勝手に取捨選択しない
       - 対応しないものは、黙って落とさず理由を添えて確認する
       - 直したら同じブランチに追加コミットして push

  4-12. PR URL を人間に伝えて次の issue へ
```

### 並列実行（オプション、最大2）

選んだ issue のうち2件まで、worktree＋サブエージェントで並列に処理してよい。3件以上は並列にしない（レビューが同時に来て見切れない、衝突もしやすい）。始める前に `references/parallel-worktree.md` を読む。

### Step 5: 終了報告

| # | タイトル | 結果 | PR / 相談理由 |
|---|---|---|---|
| 123 | ... | PR 作成 | #999 |
| 456 | ... | 相談 | 検証3回失敗、原因不明 |

## やってはいけないこと

HARD-GATE と基本ルールに書いたものは再掲しない。それ以外で守ること：

- **3件を並列で処理する**（最大2まで）
- **A/B 判定を省いて、全部設計する／全部すぐ実装する**。issue ごとに判定し、A では2択を人間に聞く
- **OS のキーチェーンや OAuth トークンを掘り出して、外部 API を直接叩く**
- **Before キャプチャを省く**。差分が見えなくなりレビューの価値が落ちる
- **「ついでにこれも直しました」と範囲を広げる**。PR が大きくなりレビューが遅れる
- **詰まったまま黙る**。必ず issue にコメントを残してから次に進む
- **ユーザーが選んだ機能を「最小の一歩」と称して別物に切り縮める**。例: 「フィルタ機能を作る」と決めた人に「まず表示/非表示の切り替えだけ」と勧めて、欲しかった本体を後回しにする。小さく切ってよいのは「その機能の範囲・条件・順序」であって、「欲しい本体を作るかどうか」ではない
- **plan を書かずに実装に入る**、または **決まったことを plan に書かずに実装サブに渡す**
- **assignee が他人の issue を選ぶ**
- **Pre-flight の質問を1問にまとめる**
- **AskUserQuestion のラベルや説明に専門語を混ぜる**
