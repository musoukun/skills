# GoF 23パターンの2026年TypeScript再評価

## 結論(3行)

23パターンのうち、そのまま道具として残すべきは10種類、別のパターンに寄せてよいのは4種類、TypeScriptの言語機能や標準ライブラリで足りて名前を意識する必要がないのは7種類、実務でほぼ使わないのは2種類。
判定の根拠は、Peter Norvigが1996年に発表した「動的言語では23パターン中16パターンが不要または単純になる」という分析と、2020年代に書かれたTypeScript/Java向けの再評価記事にある。
逆引き表を作るなら、23項目を並べるより「残す10種類＋寄せ先4種類」の実質14種類だけで足りる。

## 1. 23パターン全部の表

判定の意味。
「残す」は、TypeScriptで書いても今なお固有の設計判断として名前を持つ価値があるもの。
「別に寄せる」は、同じ組の他のパターンに統合して1つとして覚えればよいもの。
「言語機能で足りる」は、TypeScript/JavaScriptの構文や標準ライブラリがそのままパターンの役目を果たすので、わざわざ名前を意識して実装する必要がないもの。
「ほぼ使わない」は、今の一般的なWebアプリ開発ではまず出番がないもの。

| パターン | 判定 | TypeScriptでの実態 | 理由 | 根拠URL |
|---|---|---|---|---|
| Abstract Factory | 別に寄せる | 関連オブジェクトの組を切り替える場面は、ただのファクトリ関数が返すオブジェクトで済むことが多い | Norvigは「型が第一級である」ためAbstract Factoryは見えなくなると分析している。TypeScriptでもクラスや型は値として渡せるので、専用の二重クラス階層は不要 | https://norvig.com/design-patterns/design-patterns.pdf |
| Builder | 残す | 相互に依存する制約を型レベルで強制したいとき（AWS CDK風の設定、クエリビルダー、テスト用データ生成）に使う | ジェネリクスと条件型で「必須項目を埋めるまでbuild()を呼べない」を型エラーとして検出できる。ただし2〜3個の独立したプロパティならオブジェクトリテラルで十分と釘を刺されている | https://sph.sh/en/posts/builder-pattern-typescript/ |
| Factory Method | 言語機能で足りる | 「型に応じてインスタンスを作る」はただの関数（`function createX(): X`）で書く | Norvigの分類でも第一級型により見えなくなるパターンの一つ。サブクラスでファクトリメソッドを上書きするという儀式がTypeScriptでは不要 | https://norvig.com/design-patterns/design-patterns.pdf |
| Prototype | 言語機能で足りる | オブジェクトの複製は`structuredClone`や`{ ...obj }`、委譲は`Object.create`やプロトタイプチェーンがそのまま担う | JavaScriptのコア機能自体がプロトタイプ委譲であり、「クローンして使う」という発想そのものが薄れている | https://www.patterns.dev/vanilla/prototype-pattern/ |
| Singleton | 言語機能で足りる | ただ1つの共有インスタンスが欲しい場面（Prisma Clientなど）はESモジュール自体がそれを保証する | ESモジュールは読み込まれた時点で1度だけ実行され、以後はキャッシュされた同じインスタンスが返る。加えてgetInstance()方式のSingletonクラスは、グローバル状態を持ち込みテストしにくくなるとして批判されている | https://accu.org/journals/overload/11/57/radford_337/ |
| Adapter | 残す | 外部APIのレスポンスやPrismaのモデル型を、アプリ内部のドメイン型に変換する薄い関数・クラスとして生き続ける | 外部の都合と自分のコードの都合が食い違う境界は、言語が何であっても発生する。Norvigの16パターンにも含まれておらず、動的言語でも単純化されない | https://norvig.com/design-patterns/design-patterns.pdf |
| Bridge | 別に寄せる | 「抽象と実装を分けて差し替え可能にする」はStrategyや素朴な依存性注入と同じ形になる | TypeScriptでは関数やオブジェクトをコンストラクタ引数として渡すだけで実装を差し替えられるので、Bridge専用の抽象クラス階層を作る理由が薄い | https://www.geeksforgeeks.org/system-design/difference-between-the-facade-proxy-adapter-and-decorator-design-patterns/ |
| Composite | 残す | UIコンポーネントツリー、コメントのネスト、ファイルツリーなど「木構造を一様に扱いたい」場面でそのまま使う | Reactのコンポーネントがコンポーネントを内包する構造自体がCompositeであり、木構造を持つドメインが存在する限りなくならない | https://eli.thegreenplace.net/2016/on-the-composite-and-interpreter-design-patterns/ |
| Decorator | 残す | 高階関数でログ・リトライ・キャッシュを後から重ねる、NestJSのデコレータ構文で機能を付け足す | TypeScriptにはデコレータ構文（`@Injectable()`等）が言語機能として存在するほど需要が定着している | https://www.geeksforgeeks.org/system-design/difference-between-the-facade-proxy-adapter-and-decorator-design-patterns/ |
| Facade | 言語機能で足りる | 複数の下位処理をまとめて1つの入口にする役目は、`index.ts`のバレルエクスポートや1つのサービス関数でそのまま実現できる | Norvigは「モジュール機能がある言語ではFacadeは見えなくなる」と分析している。TypeScriptもモジュールを持つのでこれに当てはまる | https://norvig.com/design-patterns/design-patterns.pdf |
| Flyweight | ほぼ使わない | 大量の似たオブジェクトのメモリを共有する最適化で、一般的なNext.js/Prismaアプリではまず出番がない | メモリ最適化が問題になるのはゲームエンジンや大量描画など特殊な領域。通常のWebアプリはV8のガベージコレクションに任せてよい | https://norvig.com/design-patterns/design-patterns.pdf |
| Proxy | 残す | APIクライアントのラッパー、遅延読み込み（`dynamic import`）、アクセス制御の薄いラッパーとして生きている | JavaScript自体にProxyオブジェクトというメタプログラミング機構があるほど、「本物の代わりに間に入る」という発想は言語に根付いている | https://www.geeksforgeeks.org/system-design/difference-between-the-facade-proxy-adapter-and-decorator-design-patterns/ |
| Chain of Responsibility | 残す | 実装名は「ミドルウェア」に変わったが、Express/Next.js/tRPCの処理を順番に渡していく仕組みとして毎日使われている | 元のGoF流の「後続ハンドラへのポインタを持つクラス連鎖」は書かないが、「関数の配列を順番に呼ぶ」という考え方そのものは残っている | https://refactoring.guru/design-patterns/chain-of-responsibility/php/example |
| Command | 残す | Reduxのaction、ジョブキュー（BullMQ等）に積むジョブ、エディタのundo/redoは実質Commandの考え方 | 「操作をあとで実行できるデータとして持ち運ぶ」という発想は非同期処理やキューが増えた今ほど価値がある。実装はクラスでなく素朴なオブジェクトと関数で十分 | https://www.compiler.today/software-engineering/design-patterns-overrated-pragmatic-simplicity-2026 |
| Interpreter | ほぼ使わない | 独自のミニ言語を自分でパースして評価する場面は稀で、あってもASTを解釈する部分はCompositeの延長でしかない | GoF流の「式ごとにクラスを作る」実装を自作することは少なく、既存のパーサライブラリに頼ることが多い | https://eli.thegreenplace.net/2016/on-the-composite-and-interpreter-design-patterns/ |
| Iterator | 言語機能で足りる | `for...of`、ジェネレータ関数、`Symbol.iterator`がそのままIteratorの役目を果たす | Norvigの分類ではマクロで単純化されるパターンだが、TypeScript/JavaScriptでは言語のコア機能として組み込まれ、独自のIteratorクラスを書く方がむしろ不自然 | https://norvig.com/design-patterns/design-patterns.pdf |
| Mediator | 残す | 複数のコンポーネントが互いに影響し合う場面で、状態管理ライブラリ（Redux、Zustand等）が中央の調整役として機能する | 各コンポーネントが直接やり取りする代わりに1箇所を経由させる発想は、双方向・多方向のやり取りが増えるほど有効 | https://takt.dev/design-pattern/advanced/comparisons/observer-mediator |
| Memento | 別に寄せる | undo機能はImmerのようなイミュータブル（書き換えず新しい値を作る）データ構造で状態の配列を持つだけで実現できることが多い | Originator・Caretaker・Mementoという3役のクラスを揃えなくても、単に「過去の状態の配列」を持てば同じ効果が得られる。実質Commandの逆操作か単純な履歴配列に寄せられる | https://www.compiler.today/software-engineering/design-patterns-overrated-pragmatic-simplicity-2026 |
| Observer | 残す | 状態の変化を複数箇所に知らせる仕組みは、EventEmitter・DOMのEventTarget・Reactの状態更新・RxJSまで幅広く現役 | 「1つの変化を複数箇所に知らせる」という一対多の通知は、単純な場合はEventEmitterで十分、複数ストリームの合成が必要な場合だけRxJSに進む | https://dev.to/gabrielanhaia/the-observer-pattern-in-typescript-when-you-dont-need-rxjs-4l7j |
| State | 残す | 判別可能な共用体（discriminated union）と`switch`で状態ごとの型と処理を分ける。複雑な遷移が絡む場合はXStateのようなライブラリも使われる | TypeScriptのコンパイラは共用体の網羅性チェック（`never`型）ができるので、「あり得ない状態」を防ぐというStateパターン本来の目的をむしろ強く達成できる | https://sph.sh/en/posts/behavioral-patterns-reactive-programming/ |
| Strategy | 言語機能で足りる | 「アルゴリズムを丸ごと差し替える」は、クラスではなく関数を1つ渡すだけで済む | TypeScriptは関数が第一級の値なので、Strategyインターフェースとその実装クラス群という構成そのものが不要になる | https://sph.sh/en/posts/behavioral-patterns-reactive-programming/ |
| Template Method | 別に寄せる | 「骨組みは固定、一部だけ差し替え」は、継承ではなくコールバック関数を受け取る高階関数として書く | 継承ベースの骨組みは実質Strategy（関数を渡す形）に置き換えられ、TypeScriptでは継承より合成が好まれる | https://ieftimov.com/posts/pattern-to-pattern-template-method-and-strategy/ |
| Visitor | 言語機能で足りる | 判別可能な共用体に対する`switch`文が同じ役目を果たす | TypeScriptの網羅性チェックが、Visitorが本来コンパイラに求めていた「型を追加したら対応漏れをエラーにする」という保証をそのまま与えてくれる | https://nipafx.dev/java-visitor-pattern-pointless/ |

## 2. 役割が被る組

### Adapter / Facade / Proxy / Decorator

4つとも「何かをそのまま使わせず間に挟む」という形は同じだが、目的が違う。
インターフェースを変換して繋ぐのがAdapter、複雑な内部をまとめて簡単な入口にするのがFacade、アクセスを制御・遅延・キャッシュするのがProxy、同じ形のまま機能を後から重ねるのがDecorator。
迷ったら「外部の都合に合わせて型を変換する」ならAdapter、「サービス層の入口を1つにまとめる」ならFacade（実質モジュールのexportで足りる）、「本物の前にワンクッション挟む」ならProxy、「同じインターフェースのまま処理を足す」ならDecoratorを選ぶ。
根拠: https://www.geeksforgeeks.org/system-design/difference-between-the-facade-proxy-adapter-and-decorator-design-patterns/

### Strategy / State / Template Method

Strategyはアルゴリズムを丸ごと実行時に差し替える、Stateは内部状態に応じて振る舞いが変わり状態遷移がある、Template Methodは骨組みは固定で一部だけ違う。
TypeScriptでは、Template Methodは継承ではなく高階関数（骨組みの関数がコールバックを受け取る形）に書き直せるので、実質Strategyに合流させてよい。
状態遷移が明確にある場合だけStateを別枠として残し、判別可能な共用体で実装する。
根拠: https://ieftimov.com/posts/pattern-to-pattern-template-method-and-strategy/ 、 https://sph.sh/en/posts/behavioral-patterns-reactive-programming/

### Observer / Mediator

Observerは一対多の通知で、通知の向きは発信者から受信者への一方向。
Mediatorは複数のコンポーネントが互いに影響し合う場合に、やり取りを1箇所に集めて調整する。
迷ったらまずObserver（EventEmitterやイベントバス）で組み、コンポーネント同士のやり取りが増えて双方向・多方向になってきたら状態管理ライブラリのようなMediatorに寄せる。
根拠: https://takt.dev/design-pattern/advanced/comparisons/observer-mediator

### Factory Method / Abstract Factory / Builder

単純に「型に応じて1個作る」だけならFactory Methodはただの関数でよく、名前を意識する必要すらない。
「関連する複数のオブジェクトをまとめて切り替える」場面（テーマ切り替え、テナントごとの接続先切り替えなど）だけ、Abstract Factory相当の考え方が要るが、これも普通は関数が返すオブジェクトで足りる。
必須項目の強制や相互依存する設定が絡む複雑な生成だけBuilderを使う。
根拠: https://sph.sh/en/posts/builder-pattern-typescript/

### Composite / Interpreter

Interpreterが扱う構文木（AST）自体がCompositeの実例であり、Interpreterは「その木にinterpret()という振る舞いを足したもの」という関係にある。
木構造を一様に扱いたいだけならCompositeの考え方だけで十分で、独自のミニ言語を自作して評価するほどの場面は実務では稀。
迷ったらCompositeだけを意識し、Interpreterは既存のパーサライブラリに任せる。
根拠: https://eli.thegreenplace.net/2016/on-the-composite-and-interpreter-design-patterns/

### Command / Memento

Commandは「あとで実行できる操作」をデータとして持ち運ぶ、Mementoは「オブジェクトの状態そのもの」をスナップショットとして持つ。
undo/redoを作るとき、逆操作を持つならCommand、状態を丸ごと戻すならMemento、と使い分けるのが本来の形。
TypeScriptではイミュータブルなデータ構造（Immer等）を使えば「過去の状態の配列」を持つだけでMementoと同じ効果が得られるため、Originator・Caretaker・Mementoという3役のクラスを揃える必要は薄い。
根拠: https://www.compiler.today/software-engineering/design-patterns-overrated-pragmatic-simplicity-2026

## 3. 参考にした記事の一覧

- Peter Norvig「Design Patterns in Dynamic Programming」（プレゼン資料）、1996年、https://norvig.com/design-patterns/design-patterns.pdf
- Mark Radford「SINGLETON - the anti-pattern!」、Overload誌11号57号、2003年、https://accu.org/journals/overload/11/57/radford_337/
- Nicolai Parlog「Visitor Pattern Considered Pointless - Use Pattern Switches Instead」、2021年、https://nipafx.dev/java-visitor-pattern-pointless/
- Refactoring.Guru「Chain of Responsibility in PHP」（著者名記載なし）、https://refactoring.guru/design-patterns/chain-of-responsibility/php/example
- GeeksforGeeks「Difference Between the Facade, Proxy, Adapter, and Decorator Design Patterns」（著者名記載なし）、https://www.geeksforgeeks.org/system-design/difference-between-the-facade-proxy-adapter-and-decorator-design-patterns/
- Ilija Eftimov「Pattern to pattern: Template Method & Strategy」、2015年、https://ieftimov.com/posts/pattern-to-pattern-template-method-and-strategy/
- Eli Bendersky「On the Composite and Interpreter design patterns」、2016年、https://eli.thegreenplace.net/2016/on-the-composite-and-interpreter-design-patterns/
- Gabriel Anhaia「The Observer Pattern in TypeScript: When You Don't Need RxJS」、2024年、https://dev.to/gabrielanhaia/the-observer-pattern-in-typescript-when-you-dont-need-rxjs-4l7j
- sph.sh（著者名記載なし）「Behavioral Design Patterns in TypeScript」、2025年、https://sph.sh/en/posts/behavioral-patterns-reactive-programming/
- sph.sh（著者名記載なし）「Builder Pattern in TypeScript: Type-Safe Configuration Across Modern Applications」、2025年、https://sph.sh/en/posts/builder-pattern-typescript/
- Giuseppe Russo「Are Gang of Four Patterns Still Important Today?」、2026年、https://giusepperusso.co.uk/blog/are-gang-of-four-patterns-still-important-today
- Noveo Group Blog（著者名記載なし）「Common Design Patterns in TypeScript」、2024年、https://blog.noveogroup.com/2024/07/common-design-patterns-typescript
- Pushpendra Singh「Why Design Patterns Are Overrated: The Return to Pragmatic Simplicity」、compiler.today、2026年、https://www.compiler.today/software-engineering/design-patterns-overrated-pragmatic-simplicity-2026
- mariocervera.com（著者名記載なし）「Are design patterns still relevant?」、公開年記載なし、https://mariocervera.com/are-design-patterns-still-relevant
- Hiroshi Kurabayashi「Observer vs Mediator」、takt.dev、2025年、https://takt.dev/design-pattern/advanced/comparisons/observer-mediator
- patterns.dev（著者名記載なし）「Prototype Pattern」、公開年記載なし、https://www.patterns.dev/vanilla/prototype-pattern/

補足として、以下は検索で見つけたが実際に開けなかったため本文の根拠には使っていない（未確認）。
- Medium「The Gang of Four Gave Us 23 Design Patterns… Are They Still Relevant in 2025?」（Freddy Dordoni）: 403エラーで開けず
- Contentful Blog「The singleton pattern: evil or just misused?」: 429エラーで開けず
- Medium「Chain of Responsibility Design Pattern Use Case: Authentication and Authorization Middleware」（Mehar Chand）: 403エラーで開けず
