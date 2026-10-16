// spec.js — 図の中身（主体）。書き換えるのはこのファイルだけ。書式は references/spec.md
// 例: 「Codex をメイン＋サブエージェント＋建築家で回す」ツリー
window.SPEC = {
  title: 'Codex エージェント構成',
  subtitle: 'Sol が書き、Astra は3回だけ呼ぶ',
  grid: [4, 2], // 列数, 行数（col / row は小数も可）

  // 並び順 = 登場順
  nodes: [
    { id: 'main', label: 'GPT-6.1 Sol', sub: 'main loop', tag: 'high', color: '#f59e0b', col: 1.5, row: 0, w: 300 },
    { id: 'explorer', label: 'explorer', sub: 'gpt-6-luna', tag: 'medium', color: '#22d3ee', col: 0, row: 1 },
    { id: 'worker', label: 'worker', sub: 'gpt-6.1-sol', tag: 'medium', color: '#f59e0b', col: 1, row: 1 },
    { id: 'researcher', label: 'researcher', sub: 'gpt-6-luna', tag: 'medium', color: '#22d3ee', col: 2, row: 1 },
    { id: 'review', label: 'auto_review', sub: 'approvals', color: '#94a3b8', col: 3, row: 1 },
    { id: 'jev', label: 'Jev', sub: 'router < 0.5s', color: '#34d399', col: 0, row: 0, w: 220 },
    { id: 'architect', label: 'Astra', sub: 'architect', tag: 'high', color: '#f472b6', col: 3, row: 0, w: 240 },
  ],

  edges: [
    { from: 'main', to: 'explorer' },
    { from: 'main', to: 'worker' },
    { from: 'main', to: 'researcher' },
    { from: 'main', to: 'review' },
    { from: 'main', to: 'jev' },
    { from: 'main', to: 'architect', dashed: true }, // 常時ではなく呼び出し時だけ
  ],

  // 1ステップ = 1つの出来事。flow は順番に流れる [from, to] の列（繰り返す）
  steps: [
    { kicker: 'ROUTE', caption: '迷わない分岐は Jev が0.5秒で返す', focus: ['main', 'jev'], flow: [['main', 'jev'], ['jev', 'main']], hop: 0.5 },
    { kicker: 'EXPLORE', caption: 'explorer（Luna）がコードを読む', focus: ['main', 'explorer'], flow: [['main', 'explorer'], ['explorer', 'main']] },
    { kicker: 'BUILD', caption: 'worker（Sol）が編集してテストを回す', focus: ['main', 'worker'], flow: [['main', 'worker'], ['worker', 'main']] },
    { kicker: 'RESEARCH', caption: 'researcher（Luna）がドキュメントを取ってくる', focus: ['main', 'researcher'], flow: [['main', 'researcher'], ['researcher', 'main']] },
    {
      kicker: 'ARCHITECT', caption: 'Astra を呼ぶのは3回だけ', focus: ['main', 'architect'], dur: 3.9,
      flow: [['main', 'architect'], ['architect', 'main']], hop: 0.55,
      badges: [
        { node: 'architect', text: '① 計画の前', at: 0.3 },
        { node: 'architect', text: '② 同じエラー', at: 1.6 },
        { node: 'architect', text: '③ 完了の前', at: 2.9 },
      ],
    },
    { kicker: 'REVIEW', caption: 'auto_review がすべての承認をチェック', focus: ['main', 'review'], flow: [['main', 'review'], ['review', 'main']] },
  ],

  outro: { caption: 'Astra がレビュー。Sol が出荷。', hold: 2.2 },
};
