// scenes.js — 台本（場面の並び）。書き換えるのはこのファイル。書式は references/scenes.md
// 例: 架空の通販サイトの問い合わせチャット。操作 → 仕組み → 操作 → 締め
const AI = '#f59e0b', PG = '#22d3ee', NEW = '#34d399';

// チャットの窓（操作の場面で 2 回使う）
const chatWindow = (extra) => [
  { kind: 'window', light: true, title: 'サポートチャット', x: 330, y: 90, w: 940, h: 640 },
  { kind: 'bubble', light: true, text: 'ご用件をどうぞ。', x: 380, y: 180, size: 24 },
  { kind: 'input', light: true, id: 'input', x: 380, y: 640, w: 700, h: 60, size: 24 },
  { kind: 'button', light: true, id: 'send', text: '送信', x: 1100, y: 640, w: 120, h: 60, size: 22, color: '#2563eb' },
  ...extra, // 窓の上に重ねるもの（あとに書いたものほど手前に出る）
];

window.SCENES = {
  scenes: [
    {
      part: 'blocks', dur: 4.6, kicker: '操作', caption: 'お客様が質問を送る',
      blocks: chatWindow([
        { kind: 'text', light: true, id: 'typing', text: '先週届いた靴を返品したい', typeAt: 1.2, x: 400, y: 650, h: 40, size: 24, css: { color: '#111827' } },
      ]),
      camera: [{ at: 0.5, to: 'input', fit: 0.6, dur: 0.8 }],
    },
    {
      part: 'blocks', dur: 5.0, kicker: '仕組み', caption: '毎回同じ指示に、会話の記録を足して AI に渡す', color: AI,
      transition: { type: 'expand', from: 'input' },
      blocks: [
        { kind: 'box', text: '先週届いた靴を返品したい', x: 450, y: 405, w: 700, h: 90, size: 36, bold: true, align: 'center', color: NEW },
        { kind: 'box', text: '毎回同じ指示（話し方と、確かめる順番）', x: 450, y: 170, w: 700, h: 90, size: 26, align: 'center', color: PG, at: 1.4 },
        { kind: 'text', text: '＋', x: 780, y: 300, size: 48, bold: true, at: 1.8 },
        { kind: 'text', text: '話すたびに増える会話の記録', x: 450, y: 515, w: 700, size: 22, align: 'center', at: 2.2, css: { color: NEW } },
        { kind: 'pill', text: 'AI へ', x: 730, y: 620, color: AI, size: 26, at: 3.0 },
      ],
    },
    {
      part: 'blocks', dur: 4.6, kicker: '操作', caption: '返事が届く',
      transition: { type: 'collapse', to: 'reply' },
      blocks: chatWindow([
        { kind: 'bubble', light: true, text: '先週届いた靴を返品したい', x: 780, y: 270, size: 24, css: { background: '#2563eb', color: '#ffffff' } },
        { kind: 'bubble', light: true, id: 'reply', text: '返品を承ります。注文番号を教えていただけますか？', x: 380, y: 370, w: 640, size: 24, at: 0.5 },
      ]),
      camera: [{ at: 1.0, to: 'reply', fit: 0.6, dur: 0.8 }, { at: 3.2, dur: 0.7 }],
    },
    {
      part: 'blocks', dur: 3.2, kicker: 'まとめ', caption: 'AI は次にすることを答えるだけ。探すのも送るのもプログラム',
      transition: { type: 'fade' },
      blocks: [],
    },
  ],
};
