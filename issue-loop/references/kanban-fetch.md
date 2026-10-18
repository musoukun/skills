# Kanban からの候補取得（issue-loop Step 1）

Kanban の列（Status）はラベルではなく **GitHub Projects のカスタムフィールド**にあるため、`gh issue list --label` だけでは絞れない。**`gh project item-list` を JSON で取得して、その結果からタグと列で絞り込む**。

手順：

1. **プロジェクト番号を確かめる**: 設定表に書いてなければ `gh project list --owner <org>` で、このリポジトリが紐づく Project の番号を確認する。分かったら設定表に書いておく
2. **アイテム取得**: `gh project item-list <番号> --owner <org> --format json --limit 100`
3. **列で絞る**: JSON の `items[].status` が Pre-flight で選んだ列（`Ready` / `Backlog` / `In progress`）と一致するものに絞る
4. **タグで絞る**: 各アイテムの `labels` に Pre-flight で選んだタグが含まれるものに絞る
5. **assignee 除外**: `assignees` が自分以外になっている issue は除外する（作業の重なり防止）。自分の login は `gh api user --jq .login`
6. **件数調整**: 10 件を超えたら新しい順に 10 件で打ち切る
7. **表にする**: 番号 / タイトル / タグ / assignee の表にして次のステップへ渡す

`gh project item-list` で取れない（Projects を使っていない等）ときに限り、`gh issue list --label <tag> --state open --json number,title,labels,assignees` を使う。この場合は列で絞れないので、「列で絞れないが続けるか」を人間に聞く。
