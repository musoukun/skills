# TypeScriptで「場合ごとに処理を差し替える」書き方

## 結論（3行）

ケースが3〜4個までで今後ほぼ増えないなら、名前付き関数を先に定義して switch 文で呼び分けるのが一番読みやすい。ケースが多い、または表として一覧性がほしいときは、関数に名前を付けてから `satisfies Record<共用体, 関数の型>` の対応表にまとめ、1行1ケースで改行する。無名のアロー関数をその場で対応表に詰め込む書き方（質問にあった1行の書き方）は、名前が無いぶん「これは何をする処理か」を毎回中身を読んで判断する必要があるので避ける。ts-pattern のようなライブラリは、値の形（ネストしたオブジェクトなど）で分岐が複雑になったときだけ検討すればよく、単純な1対1の対応表には過剰。

---

## 書き方ごとの節

### 1. 名前付き関数 + switch文

**こういうときに向く**
ケース数が少なく（目安3〜4個程度）、追加が滅多にない場合。処理の中身が長い場合。

**読みやすくするコツ**
- 各 case の中身を直接書かず、名前付き関数を呼ぶだけにする。関数名がそのまま「何をする処理か」の説明になる。
- `default` を必ず書き、`never` 型と `assertUnreachable` のようなヘルパーで「ケース漏れ」をコンパイルエラーにする（次の節で詳しく書く）。

**コード例**
```ts
function calcPhoneFee(base: number): number {
  return base;
}
function calcAppFee(base: number): number {
  return base - 100;
}

function calcFee(channel: Channel, base: number): number {
  switch (channel) {
    case "PHONE":
      return calcPhoneFee(base);
    case "APP":
      return calcAppFee(base);
    default:
      return assertUnreachable(channel);
  }
}
```

**根拠URL**
- [Evaluating alternatives to TypeScript's switch case (LogRocket, Rahul Chhodde, 2022)](https://blog.logrocket.com/evaluating-alternatives-typescript-switch-case/)
- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)（switch文には必ず default 節を書く、という規約が明記されている）

---

### 2. 対応表（Record型のlookup table）

**こういうときに向く**
ケース数が多い（5個以上が目安）、または「一覧として全部見渡したい」場合。追加・削除が頻繁にある場合。

**読みやすくするコツ**
- その場で無名のアロー関数を書かず、先に名前付き関数として定義してから表に入れる。名前が説明になるので、表を見ただけで中身を推測できる。
- `satisfies Record<共用体の型, 関数の型>` を付けて、ケース漏れをコンパイルエラーにする（`Record<X, Y>` で直接型付けしてもよいが、`satisfies` の方が値のリテラル型を保ったまま網羅性だけをチェックできる）。
- キーごとに改行して1行1ケースにする。詰め込んで1行にしない。

**コード例**
```ts
function calcPhoneFee(base: number): number {
  return base;
}
function calcAppFee(base: number): number {
  return base - 100;
}

const feeCalculators = {
  PHONE: calcPhoneFee,
  APP: calcAppFee,
} satisfies Record<Channel, (base: number) => number>;

feeCalculators[channel](base);
```

**根拠URL**
- [Evaluating alternatives to TypeScript's switch case (LogRocket, Rahul Chhodde, 2022)](https://blog.logrocket.com/evaluating-alternatives-typescript-switch-case/)（オブジェクトのlookup tableはswitch文より冗長性が低く読みやすい、と紹介）
- [How to Enforce Exhaustive TypeScript Enum Mappings Using Records (Danny Guo, 2023)](https://www.dannyguo.com/blog/how-to-enforce-exhaustive-typescript-enum-mappings-using-records)（Record型で対応表を作ると、ケース漏れが実行時エラーではなくコンパイルエラーになる。union型でも同じ手法が使える、という説明）

---

### 3. ts-pattern などのパターンマッチングライブラリ

**こういうときに向く**
分岐の条件が「値がこの形のオブジェクトだったら」のように、単純なキー一致では表現しにくい場合。ネストしたデータや複数の値の組み合わせで分岐する場合。

**読みやすくするコツ**
- 単純な「共用体の1つの値ごとに関数を1つ」という対応なら、ts-pattern を使わず Record 表の方がシンプル。
- ライブラリを増やすコストと、既存メンバーがライブラリの書き方を覚えるコストを考えてから導入する。

**コード例**
```ts
import { match } from "ts-pattern";

const result = match(status)
  .with("success", () => "成功")
  .with("error", () => "失敗")
  .exhaustive();
```

**根拠URL**
- [How ts-pattern can improve your code readability? (dev.to, Tauan Camargo, 2024)](https://dev.to/tauantcamargo/how-ts-pattern-can-improve-your-code-readability-37dd)
  この記事のコメント欄では意見が割れている。肯定意見は「網羅性チェックがあり、バンドルサイズも約2.5kBと軽い」。否定意見は「単なる糖衣構文で依存を増やすだけ」「package.jsonは最小限に保つべき」。結論として、プロジェクトの規模と分岐の複雑さで判断すべきとまとめられている。

---

## 網羅性チェック（ケース漏れをコンパイルエラーにする）

switch文で書く場合は、`never` 型を受け取るヘルパー関数を `default` に置く。

```ts
function assertUnreachable(x: never): never {
  throw new Error(`想定していないケース: ${x}`);
}
```

これを `default` の中で呼ぶと、共用体に新しい値が増えたときに、そのヘルパーへ渡す引数の型が `never` でなくなり、コンパイルエラーになる。

同じことを typescript-eslint の `switch-exhaustiveness-check` ルールでも実現できる。こちらは `assertUnreachable` を毎回書かなくても、ESLintが自動でケース漏れを検出してくれる。ただし型情報を使うルールなので、Lint実行が多少重くなるという注意点がある。

**根拠URL**
- [Check switch statement exhaustiveness with Typescript (Gautier Blandin, 2024)](https://www.gautierblandin.com/articles/typescript-switch-exhaustiveness-check)
- [switch-exhaustiveness-check | typescript-eslint（公式ルール解説）](https://typescript-eslint.io/rules/switch-exhaustiveness-check/)
- [TypeScript satisfies never: Exhaustiveness Checking (dev.to, Cefn Hoile, 2022)](https://dev.to/cefn/typescript-satisfies-never-exhaustiveness-checking-in-typescript-49-58fh)（`satisfies never` を使う別の書き方も紹介されている）

---

## スタイルガイドの記述

- **Google TypeScript Style Guide**：switch文には必ず `default` 節を書く（中身が空でもよい）という規約がある。ただし「対応表（lookup table）を使うべき」という記述は無かった。
- **Airbnb JavaScript Style Guide**：switch文の `default` 節は最後に書く、各 case で変数宣言があるならブロック `{}` で囲む、という規約がある。こちらも対応表についての記述は無い。
- どちらのガイドも「対応表かswitch文か」という選択そのものには触れていない。この判断はスタイルガイドの範囲外で、各記事の意見をもとに判断する必要がある。

**根拠URL**
- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- [Airbnb JavaScript Style Guide (GitHub)](https://github.com/airbnb/javascript)

---

## 「何個からswitch/表にするか」の目安

明確な基準を定めた公式ドキュメントは見つからなかった。一般的な目安として、条件が1〜2個ならif文、3個を超えたらswitch文や対応表にする、という説明をしている記事があった。ただしこれはC言語向けの解説記事で、TypeScript固有の基準ではない点に注意。

**根拠URL**
- [Mastering the Switch Case Statement (Guru Software)](https://www.gurusoftware.com/mastering-the-switch-case-statement-an-expert-c-developers-guide/)

---

## 料金計算の例を書き直したコード

```ts
// なぜこう書くか：
// 1. 無名のアロー関数を対応表に直接書くと、中身を読むまで
//    「何の処理か」が分からない。名前付き関数にすることで
//    関数名だけで内容が推測できるようにする。
// 2. satisfies Record<Channel, ...> を付けることで、
//    Channel の値が増えたのに対応表への追加を忘れた場合、
//    実行時ではなくコンパイル時にエラーとして気づける。
// 3. キーごとに改行して1行1ケースにすることで、
//    表として一覧しやすくする。

type Channel = "PHONE" | "APP";

function calcPhoneFee(base: number): number {
  return base;
}

function calcAppFee(base: number): number {
  return base - 100;
}

const feeCalculators = {
  PHONE: calcPhoneFee,
  APP: calcAppFee,
} satisfies Record<Channel, (base: number) => number>;

const fee = feeCalculators[channel](base);
```

---

## 参考にした記事一覧

| タイトル | 著者 | 年 | URL |
|---|---|---|---|
| Evaluating alternatives to TypeScript's switch case | Rahul Chhodde | 2022 | https://blog.logrocket.com/evaluating-alternatives-typescript-switch-case/ |
| How to Enforce Exhaustive TypeScript Enum Mappings Using Records | Danny Guo | 2023 | https://www.dannyguo.com/blog/how-to-enforce-exhaustive-typescript-enum-mappings-using-records |
| Check switch statement exhaustiveness with Typescript | 記載なし | 2024 | https://www.gautierblandin.com/articles/typescript-switch-exhaustiveness-check |
| switch-exhaustiveness-check（公式ルール解説） | typescript-eslint | 不明 | https://typescript-eslint.io/rules/switch-exhaustiveness-check/ |
| How ts-pattern can improve your code readability? | Tauan Camargo | 2024 | https://dev.to/tauantcamargo/how-ts-pattern-can-improve-your-code-readability-37dd |
| Google TypeScript Style Guide | Google | 不明 | https://google.github.io/styleguide/tsguide.html |
| Airbnb JavaScript Style Guide | Airbnb | 不明 | https://github.com/airbnb/javascript |
| TypeScript satisfies never: Exhaustiveness Checking in TypeScript | Cefn Hoile | 2022 | https://dev.to/cefn/typescript-satisfies-never-exhaustiveness-checking-in-typescript-49-58fh |
| Mastering the Switch Case Statement | Guru Software | 不明 | https://www.gurusoftware.com/mastering-the-switch-case-statement-an-expert-c-developers-guide/ |

以下は検索結果には出たが、内容を開けなかった（403エラー等）ため未確認。
- Switch case, if else or a lookup map — A study case（Medium, Maya Shavin）https://medium.com/front-end-weekly/switch-case-if-else-or-a-lookup-map-a-study-case-de1c801d944 — 未確認
- How ts-pattern can improve your code readability?（Medium版）https://tauantcamargo.medium.com/how-ts-pattern-can-improve-your-code-readability-d64996841646 — 未確認（同内容のdev.to版は確認済み）
- satisfies-in-typescript（master.dev）https://blog.master.dev/satisfies-in-typescript/ — 開けたが、質問に関する具体例（Record<共用体,関数>の網羅表）は記事内に見当たらなかった
