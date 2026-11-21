// carry-spec.js — 運搬型の中身。書き換えるのはこのファイルだけ。書式は references/carry-spec.md
// 例: レシートの写真 1 枚が、家計簿の 1 行になるまで（架空の例）。左から右へ流れて終わる一方通行
// 処理が最初の段へ戻る（ループする）ときの見本は examples/carry-loop-spec.js
const ME = '#e2e8f0'; // 人
const PG = '#22d3ee'; // プログラム
const AI = '#f59e0b'; // AI
const NEW = '#34d399'; // できあがった物

window.SPEC = {
  title: 'レシートの写真が、家計簿の 1 行になるしくみ',
  subtitle: 'パン屋のレシートを 1 枚流した例',

  // 最初に「何を、何に変える物か」を 1 枚で見せる
  opening: {
    from: { label: 'レシートの写真', sub: 'スマホで撮った 1 枚', color: ME, kicker: '入れる物' },
    to: { label: '家計簿の 1 行', sub: '日付・お店・金額', color: NEW, kicker: 'できる物' },
    via: '家計簿アプリ',
    caption: '家計簿アプリは、レシートの写真を家計簿の 1 行に変える',
  },

  // 左から右へ一列に並べる。同じ役割は同じ色
  stations: [
    { id: 'me', label: 'あなた', sub: '人', color: ME, x: 105, w: 150 },
    { id: 'p1', label: '① 文字を読む', sub: 'プログラム', color: PG, x: 385 },
    { id: 'p2', label: '② 項目に分ける', sub: 'AI', color: AI, x: 725 },
    { id: 'p3', label: '③ 家計簿に足す', sub: 'プログラム', color: PG, x: 1065 },
    { id: 'book', label: '家計簿', sub: 'できあがり', color: NEW, x: 1405, w: 190 },
  ],

  // 一方通行なので、となりの駅への line だけ。戻り道（under）は描かない
  paths: [
    { id: 'm1', from: 'me', to: 'p1', kind: 'line' },
    { id: '12', from: 'p1', to: 'p2', kind: 'line' },
    { id: '23', from: 'p2', to: 'p3', kind: 'line' },
    { id: '3b', from: 'p3', to: 'book', kind: 'line' },
  ],

  // 駅に着く（at）→ 処理の絵（scene）→ 次の駅へ（move）の順に並べる
  // 吹き出しは 受け取る（take）・すること（act）・渡す（give）の 3 行。give を省くと、札（out）と同じ言葉になる
  beats: [
    {
      at: 'me', dur: 3.0, caption: 'あなたが、レシートを撮って送る', out: { text: 'レシートの写真', color: ME },
      bubble: { title: 'あなたがすること', act: 'レシートをスマホで撮って送る' },
    },
    { move: 'm1' },
    {
      at: 'p1', dur: 3.4, caption: 'プログラムが、写真から文字を読み取る', out: { text: '読み取った文字', color: PG },
      bubble: { title: 'プログラムが読む', take: 'レシートの写真', act: '写真の中の文字を読み取る' },
    },
    {
      scene: { kind: 'fetch', title: '写真から、文字だけを取り出す', from: [{ label: 'レシートの写真', color: ME }],
        items: ['ベーカリー森', '2026/10/05', 'クロワッサン 240円', '食パン 400円', '合計 640円'], to: { label: '読み取った文字', color: PG } },
      dur: 2.6, caption: '店名・日付・品名・値段が、ただの文字の並びになる',
    },
    { move: '12' },
    {
      at: 'p2', dur: 3.4, caption: 'AI が、どの文字が日付・お店・金額かを見分ける', out: { text: '日付・お店・金額', color: AI },
      bubble: { title: 'AI が見分ける', take: '読み取った文字', act: 'どれが日付・お店・金額かを決める' },
    },
    {
      scene: { kind: 'transform', title: 'ばらばらの文字を、決まったマスに入れる',
        from: { label: 'ばらばらの文字', note: '並び方はレシートごとに違う', color: PG },
        to: { label: '項目のマス', note: '日付・お店・金額の 3 つ', color: AI } },
      dur: 2.6, caption: 'レシートごとに違う並びが、同じ形のマスにそろう',
    },
    { move: '23' },
    {
      at: 'p3', dur: 3.4, caption: 'プログラムが、今月の家計簿に 1 行足す', out: { text: '今月の家計簿', color: NEW },
      bubble: { title: 'プログラムが足す', take: '日付・お店・金額', act: '今月の家計簿の終わりに 1 行足す' },
    },
    {
      scene: { kind: 'merge', title: '今までの家計簿に、新しい 1 行を合わせる',
        a: { label: '今月の家計簿', items: ['10/01 スーパー 2,380円', '10/03 薬局 980円'], color: NEW },
        b: { label: '新しい 1 行', items: ['10/05 ベーカリー森 640円'], color: AI },
        to: { label: '今月の家計簿', items: ['10/01 スーパー 2,380円', '10/03 薬局 980円', '10/05 ベーカリー森 640円'], color: NEW } },
      dur: 2.6, caption: '前からある行はそのまま、新しい行が下に増える',
    },
    { move: '3b' },
    {
      at: 'book', dur: 3.0, caption: '家計簿に、今月の合計が出る',
      bubble: { title: 'できあがった家計簿', take: '今月の家計簿', act: '費目ごとに足して、合計を出す', give: '今月の合計 4,000円' },
    },
    {
      scene: { kind: 'stack', title: '費目ごとの金額を積み上げて、今月の合計にする',
        layers: [{ label: '食料品 2,380円', color: NEW }, { label: '日用品 980円', color: PG }, { label: 'パン 640円', color: AI }],
        label: '今月の合計 4,000円' },
      dur: 2.6, caption: '費目ごとの金額が積み上がって、合計になる',
    },
  ],

  // 締め（一方通行）: 左から右へ 1 回だけ光を流し、最後の駅で止まる
  outro: { kicker: 'まとめ', caption: '写真を送るだけで、家計簿に 1 行増える', hold: 3.0 },
};
