// carry-spec.js — 運搬型の中身。書き換えるのはこのファイルだけ。書式は references/carry-spec.md
// 例: 問い合わせチャットが返事を 1 回作るまで（架空の例）。AI は判断して答えるだけ、処理と確かめはプログラム。2 周で返事が決まる
const PG = '#22d3ee'; // プログラム
const AI = '#f59e0b'; // AI
const NEW = '#34d399'; // 処理で新しく増えたもの
const CU = '#e2e8f0'; // お客様

window.SPEC = {
  title: '問い合わせチャットが返事を作るしくみ',
  subtitle: '「返品したい」という質問を 1 つ流した例',

  // 左から右へ一列に並べる。同じ役割は同じ色
  stations: [
    { id: 'cust', label: 'お客様', sub: 'チャット画面', color: CU, x: 105, w: 150 },
    { id: 'p1', label: '① 指示をまとめる', sub: 'プログラム', color: PG, x: 385 },
    { id: 'p2', label: '② 判断して答える', sub: 'AI', color: AI, x: 725 },
    { id: 'p3', label: '③ 処理する', sub: 'プログラム', color: PG, x: 1065 },
    { id: 'p4', label: '④ 次へ回す', sub: 'プログラム', color: PG, x: 1405 },
  ],

  // line = となりの駅へまっすぐ。under = 下を回る（戻り道）。2 本の under は、外側を深くして入れ子にする（交差させない）
  paths: [
    { id: 'c1', from: 'cust', to: 'p1', kind: 'line' },
    { id: '12', from: 'p1', to: 'p2', kind: 'line' },
    { id: '23', from: 'p2', to: 'p3', kind: 'line' },
    { id: '34', from: 'p3', to: 'p4', kind: 'line' },
    { id: 'back', from: 'p4', to: 'p1', kind: 'under', depth: 130, dx: [-50, 0], label: '返事がまだなら、① へ戻る' },
    { id: 'reply', from: 'p4', to: 'cust', kind: 'under', depth: 225, dx: [50, 0], label: '返事が決まったら、お客様へ' },
  ],

  // 駅での出来事（at）と、線の上の移動（move）を交互に並べる。move で運ばれる札は、直前の駅の out
  beats: [
    {
      at: 'cust', dur: 3.2, loop: 1, kicker: '1 周目', caption: 'お客様の質問が届く', out: { text: '質問', color: CU },
      bubble: { title: 'お客様の質問', keep: 'next', lines: [{ text: '先週届いた靴を返品したい' }] },
    },
    { move: 'c1' },
    {
      at: 'p1', dur: 5.0, loop: 1, caption: 'プログラムが、AI への指示をまとめる', out: { text: 'AI への指示', color: PG },
      bubble: {
        // 毎回同じものと、増えていくものは囲みを分ける。中身は「名前：何のためか」で書く
        title: 'プログラムがまとめる', w: 420, dx: -130,
        groups: [
          {
            label: '毎回同じ指示（はじめに渡す決まり）', color: PG, fly: '毎回同じ指示',
            lines: [
              { text: '応対の決まり：話し方と、確かめる順番', size: 19 },
              { text: 'できること：探す・返事・つなぐ', size: 19 },
            ],
          },
          {
            label: '会話の記録（話すたびに増える）', color: CU, fly: '会話の記録', dashed: true,
            lines: [{ text: 'お客様：靴を返品したい', size: 19 }],
          },
        ],
      },
    },
    { move: '12' },
    {
      at: 'p2', dur: 4.6, loop: 1, caption: 'AI が判断して、「規約を探す」と答える', out: { text: '答え：探す', color: AI },
      bubble: {
        title: 'AI が判断して答える',
        lines: [
          { text: '答え：返品の規約を探す', bold: true, color: AI },
          { text: '決まりの文章：手続きを案内する前に、規約を確かめる', dim: true, size: 18, gap: 6 },
        ],
      },
    },
    { move: '23' },
    {
      at: 'p3', dur: 4.0, loop: 1, caption: 'プログラムが、規約を検索する', out: { text: '見つけた規約', color: NEW },
      bubble: {
        title: 'プログラムが処理する',
        lines: [{ text: '規約を検索', bold: true }, { text: '→ 返品の節 2 つ', color: NEW }, { text: '→ よくある質問 1 つ', color: NEW }],
      },
    },
    { move: '34' },
    {
      at: 'p4', dur: 2.8, loop: 1, caption: '返事はまだ無いので、規約を会話の記録に足して ① へ戻る',
      bubble: { title: 'プログラムが次へ回す', lines: [{ text: '返事はまだ無い' }, { text: '→ 規約を会話の記録に足して ① へ', bold: true, color: NEW }] },
    },
    { move: 'back', dur: 1.8 },

    // ---- 2 周目: 前の周で増えたものだけを光らせ、ほかは薄くする ----
    {
      at: 'p1', dur: 4.6, loop: 2, kicker: '2 周目', caption: '見つけた規約が、会話の記録に加わる', out: { text: 'AI への指示', color: PG },
      bubble: {
        title: 'プログラムがまとめる', w: 420, dx: -130,
        groups: [
          {
            label: '毎回同じ指示（はじめに渡す決まり）', color: PG, at: 0.1,
            lines: [
              { text: '応対の決まり：話し方と、確かめる順番', size: 19, dim: true, at: 0.2 },
              { text: 'できること：探す・返事・つなぐ', size: 19, dim: true, at: 0.2 },
            ],
          },
          {
            label: '会話の記録（話すたびに増える）', color: CU, dashed: true, at: 0.3,
            lines: [
              { text: 'お客様：靴を返品したい', size: 19, dim: true, at: 0.4 },
              { text: 'AI：規約を探す', size: 19, dim: true, at: 0.4 },
              { text: '＋ 見つけた規約：返品の節 2 つ ほか', size: 19, bold: true, color: NEW, mark: true, at: 1.1 },
            ],
          },
        ],
      },
    },
    { move: '12' },
    {
      at: 'p2', dur: 4.8, loop: 2, caption: 'AI が判断して、注文番号を聞く返事を書く', out: { text: '答え：返事', color: AI },
      bubble: {
        title: 'AI が判断して答える',
        lines: [
          { text: '答え：返事を出す', bold: true, color: AI },
          { text: '「注文番号を教えていただけますか？」' },
          { text: '規約：返品は届いてから 30 日以内', dim: true, size: 18, gap: 6 },
        ],
      },
    },
    { move: '23' },
    {
      at: 'p3', dur: 4.4, loop: 2, caption: 'プログラムが、送ってよいかを確かめる', out: { text: '返事（確認ずみ）', color: NEW },
      bubble: {
        title: 'プログラムが確かめる',
        lines: [{ text: '○ 書かない言葉：なし', size: 20 }, { text: '○ 約束していない内容：なし', size: 20 }, { text: '→ 送ってよい', bold: true, color: NEW }],
      },
    },
    { move: '34' },
    {
      at: 'p4', dur: 2.4, loop: 2, caption: '確かめた返事を、お客様へ送る',
      bubble: { title: 'プログラムが送る', lines: [{ text: '→ お客様の画面に出す', bold: true, color: NEW }] },
    },
    { move: 'reply', dur: 2.0 },
    {
      at: 'cust', dur: 4.4, loop: 3, caption: 'お客様の画面に返事が出る',
      bubble: { title: 'チャットの返事', w: 440, color: NEW, lines: [{ text: '返品を承ります。注文番号を教えていただけますか？', at: 0.3 }] },
    },
  ],

  // 締め: loop に並べた線に光を流し続ける
  outro: { kicker: 'まとめ', caption: 'AI が判断して答え、プログラムが処理して次へ回す', hold: 3.4, loop: ['12', '23', '34', 'back'] },
};
