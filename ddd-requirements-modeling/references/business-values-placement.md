> このスキルでの既定: 業務上の数値は定数ファイルか JSON 設定ファイルに置く。DB の設定テーブルにするのは、ユーザーから指示があったときだけ。下の比較表と DB 設計例は、その指示があったときの参考。

# 割引額・手数料率などの「業務上の数値」をどこに置くか

## 結論(3行)

- 変わる頻度が高く、業務担当者が変える値は、コードでなくDBの設定テーブルに日付範囲付きで置く。コードは「その日に有効な行を1件取ってきて計算するだけ」にする。
- 変わる頻度が低く、変える人がエンジニアだけなら、コード内の定数ファイルか環境変数でよい。消費税率のように法律で決まっていて滅多に変わらない値や、テスト用の値はコードに直書きしてよい。
- 日付範囲で「今日有効な1件」を取るクエリは、範囲の重なりとタイムゾーンでバグりやすい。重複を防ぐ制約と、日付だけで比較する設計が要る。

---

## 1. 置き場所ごとの比較表

| 置き場所 | 向くもの | 変える人 | 履歴・監査 | 例 | 根拠URL |
|---|---|---|---|---|---|
| DBの設定テーブル(マスタ/ルールテーブル) | 金額・料率・上限値など、業務担当者が頻繁に変える数値。適用開始日・終了日を持たせて過去の履歴も追える | 業務担当者(管理画面経由)、または運用担当者 | 要る。行を残せば履歴になる | 料金マスタ、割引ルールテーブル、手数料率テーブル | [Rules Engine Pattern (Heri Hermawan, Medium)](https://medium.com/@herihermawan/the-ultimate-multifunctional-database-table-design-rules-engine-pattern-d55460f048c4)、[Rules as Data (Business Rules Journal)](https://www.brcommunity.com/articles.php?id=b516) |
| 環境変数(.env) | デプロイ環境ごとに変わる設定。APIキー、接続先URL、ログレベルなど「業務ルール」ではないもの | エンジニア(デプロイ時) | 不要。変更にはデプロイが要る | DATABASE_URL、外部APIキー | [Beyond Environment Variables (ConfigCat)](https://configcat.com/blog/feature-flags-vs-environment-variables/) |
| コード内の定数ファイル(constants.ts) | 変更頻度が低く、業務担当者は触らない値。ロジックの一部として扱ってよいもの | エンジニア(コードレビュー経由) | git履歴のみ | 内部の閾値、UI表示件数 | このスキルでは名前付き定数を既定にする。数値の意味と変更箇所を分かるようにする |
| フィーチャーフラグ/リモート設定(LaunchDarkly, Unleash, Vercel Flagsなど) | 「誰に見せるか」「いつ有効にするか」を実行時に切り替えたいもの。A/Bテスト、段階的リリース、キルスイッチ | プロダクト担当者・エンジニア(管理画面経由) | サービス側にログが残ることが多い | 新機能のON/OFF、ベータ版の対象ユーザー | [Feature Flags vs Configuration (PostHog, Ian Vanagas, 2023)](https://posthog.com/product-engineers/feature-flags-vs-configuration)、[Feature Flags 101 (LaunchDarkly)](https://launchdarkly.com/blog/what-are-feature-flags/) |
| ルールエンジン(json-rules-engineなど) | 条件と結果の組み合わせが複雑で、単純な「1件取り出すだけ」では表現できないもの。承認基準、割引の適用条件など | エンジニアが組み込み、ルールの中身は業務担当者やエンジニアが更新 | ルールの保存場所(DB等)次第 | 「购入金額が1万円以上かつ会員ランクがゴールドなら10%引き」のような複合条件 | [json-rules-engine (GitHub)](https://github.com/CacheControl/json-rules-engine)、[DecisionRules FAQ](https://www.decisionrules.io/en/faq/) |

補足として、PostHogの記事(Ian Vanagas, 2023年6月30日)は「設定値は永続的で変更頻度が低いもの、フィーチャーフラグは一時的で頻繁に変わり実行時にすぐ反映したいもの」という基準で使い分けを説明している。DecisionRules社のFAQは「ルールがめったに変わらず、ロジックが単純で、監査証跡が要らないなら、本格的なルールエンジンより設定テーブルやフィーチャーフラグの方が速くて安い」と述べている([DecisionRules FAQ](https://www.decisionrules.io/en/faq/))。

---

## 2. DBに置く場合の最小の設計例

考え方は、コードは「計算のやり方(構造)」だけを持ち、金額や日付は行データとして持つという形。

Prismaスキーマ(割引ルールテーブル、10行以内)

```prisma
model DiscountRule {
  id          String   @id @default(cuid())
  code        String   // 例: "APP_BOOKING"（アプリ予約割引）
  amount      Int      // 割引額（円）
  effectiveFrom DateTime
  effectiveTo   DateTime?
  @@index([code, effectiveFrom, effectiveTo])
}
```

計算するTypeScript(15行以内)

```ts
async function appFee(base: number, today: Date) {
  const rule = await prisma.discountRule.findFirst({
    where: {
      code: "APP_BOOKING",
      effectiveFrom: { lte: today },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!rule) return base;
  return base - rule.amount;
}
```

100円という数字はコードのどこにも出てこない。値を変えたいときは、テーブルの行を1件足すか更新するだけで、デプロイが要らない。

---

## 3. 「コードには構造だけ、数値はデータとして外に出す」という考え方の名前・根拠

- **table-driven methods(テーブル駆動)**: 条件と結果の対応を、配列や設定の表として持つ。処理は条件に合う値を選んで使う。対応関係を変更する場所をまとめられる。
- **magic number(マジックナンバー)を避ける**: 意味の説明が無い数値をコード中に直書きすることを指す用語。1960年代からの慣習で、名前付き定数にする、あるいはさらに外部化することが勧められている。([Wikipedia: Magic number (programming)](https://en.wikipedia.org/wiki/Magic_number_(programming)))
- **rules as data / configuration as data**: 「業務ルールをコードでなくデータとして扱う」という考え方。Business Rules Journalの記事は、決定表(decision table)をリレーショナルDBの行として持たせる設計を「Rules as Data」と呼んでいる。([Rules as Data (Business Rules Journal)](https://www.brcommunity.com/articles.php?id=b516))
- **rules engine pattern(ルールエンジンパターン)**: Medium記事(Heri Hermawan)は、ハードコードされた業務ルールを、条件(JSON)・結果(JSON)・優先度・有効フラグを持つ汎用テーブルに置き換える設計を紹介している。([Rules Engine Pattern](https://medium.com/@herihermawan/the-ultimate-multifunctional-database-table-design-rules-engine-pattern-d55460f048c4))（このページはWebFetchで403となり本文は開けず、検索結果のスニペットのみで確認。見出しと概要は検索結果に基づく。未確認扱い）

---

## 4. コードに直書きしてよい場合

- 法律・制度で決まっていて、勝手に変えられない値。例として消費税率のように、変更が国の制度改正のタイミングでしか起きず、変更時はどのみちコードレビューと動作確認が必要になるもの。ただし「値が変わりうる」こと自体は事実なので、直書きするにしても名前付き定数にはする、という意見が一般的([Magic number (programming), Wikipedia](https://en.wikipedia.org/wiki/Magic_number_(programming)))。
- テスト・プロトタイプ用の値。本番の業務ルールではなく、動作確認のための仮の数値。
- 業務担当者が触らず、エンジニアだけが変更し、変更頻度が低い内部的な閾値やUI表示件数などの実装都合の値。
- DecisionRules社のFAQは、ルール変更がめったに起きず、ロジックが単純で、監査証跡が不要な小規模アプリでは、本格的な仕組みを導入せずコードや簡単な設定で十分と述べている([DecisionRules FAQ](https://www.decisionrules.io/en/faq/))。

---

## 5. 適用日を持つルールで「その日に有効な1件」を取るときの典型的なクエリと落とし穴

典型的なクエリ(考え方)

```sql
SELECT * FROM discount_rule
WHERE code = 'APP_BOOKING'
  AND effective_from <= :today
  AND (effective_to IS NULL OR effective_to >= :today)
ORDER BY effective_from DESC
LIMIT 1;
```

落とし穴

- **期間の重なり(オーバーラップ)**: 同じ種別のルールで、適用期間が重なる行を誤って2件登録してしまうと、「その日に有効な1件」のはずが2件返ってきて、どちらを使うかが曖昧になる。PostgreSQLの`OVERLAPS`演算子で判定できるが、インデックスが効かず遅いという指摘がある。GiSTインデックスと`&&`演算子(範囲型どうしの重なり判定)を使う方法が、件数が多いときの実用的な解決策として紹介されている([Solving the Overlap Query Problem in PostgreSQL, Lee Asher, 2024年9月3日](https://www.red-gate.com/simple-talk/databases/postgresql/solving-the-overlap-query-problem-in-postgresql/))。PostgreSQL 18からは範囲型の重なりそのものを許さない`WITHOUT OVERLAPS`制約も使える([PostgreSQL 18 Temporal Constraints, Neon](https://neon.com/postgresql/18/temporal-constraints))。
- **タイムゾーン**: 「適用開始日」を日付だけで持つか、日時(タイムスタンプ)で持つかで挙動が変わる。タイムゾーン付きの日時型で比較すると、同じ瞬間でもサーバーとクライアントで日付がずれることがある。業務上「その日」が単純な暦日を指すなら、日付型(timezoneを持たない)で統一し、比較のタイミングでタイムゾーン変換をしない設計が安全という考え方が紹介されている([Making SQL Queries That Compare Dates and Timestamps Correctly](https://alexanderobregon.substack.com/p/making-sql-queries-that-compare-dates))。
- **終了日のNULL扱い**: 「終了日が決まっていない(今も有効)」をNULLで表すか、遠い未来の日付(例: 9999-12-31)で表すかは設計判断が必要。クエリの`OR effective_to IS NULL`のような分岐を書き忘れると、終了日未設定の行が検索から漏れる。

---

## 参考記事一覧

- Ian Vanagas「Feature flags vs configuration: Which should you choose?」PostHog、2023年、https://posthog.com/product-engineers/feature-flags-vs-configuration
- Lee Asher「Solving the Overlap Query Problem in PostgreSQL」Simple Talk (Red Gate)、2024年9月3日、https://www.red-gate.com/simple-talk/databases/postgresql/solving-the-overlap-query-problem-in-postgresql/
- 「Beyond Environment Variables: When to Use Feature Flags (and Why)」ConfigCat Blog、著者未確認、https://configcat.com/blog/feature-flags-vs-environment-variables/
- 「Feature Flags 101: Use Cases, Benefits, and Best Practices」LaunchDarkly Blog、著者未確認、https://launchdarkly.com/blog/what-are-feature-flags/
- 「Rules as Data: Decision Tables and Relational Databases」Business Rules Journal (BRCommunity)、著者未確認、https://www.brcommunity.com/articles.php?id=b516
- Heri Hermawan「The Ultimate Multifunctional Database Table Design: Rules Engine Pattern」Medium、著者・公開日は本文未確認(WebFetch 403、検索結果スニペットのみで確認)、https://medium.com/@herihermawan/the-ultimate-multifunctional-database-table-design-rules-engine-pattern-d55460f048c4
- Heri Hermawan「The Ultimate Multifunctional Database Table Design: Configuration Table Pattern」Medium、未確認(WebFetch 403で本文開けず)、https://medium.com/@herihermawan/the-ultimate-multifunctional-database-table-design-configuration-table-pattern-4e7f1ee5ed79
- json-rules-engine 公式README、CacheControl、著者・年未確認、https://github.com/CacheControl/json-rules-engine
- 「Magic number (programming)」Wikipedia、著者なし(百科事典)、https://en.wikipedia.org/wiki/Magic_number_(programming)
- 「PostgreSQL 18 Temporal Constraints with WITHOUT OVERLAPS」Neon、著者未確認、https://neon.com/postgresql/18/temporal-constraints
- 「Making SQL Queries That Compare Dates and Timestamps Correctly」著者名(Alexander Obregon、Substackアカウント名より推定)、年未確認、https://alexanderobregon.substack.com/p/making-sql-queries-that-compare-dates
- 「FAQ」DecisionRules、著者なし(企業サイト)、https://www.decisionrules.io/en/faq/
- 「Top 10 Business Rule Engines & Decision Automation Platforms for 2026」DecisionRules、著者未確認、https://www.decisionrules.io/en/articles/top-10-business-rule-engines/
