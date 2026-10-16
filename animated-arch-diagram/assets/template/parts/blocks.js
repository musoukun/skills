// parts/blocks.js — 四角・文字・窓・入力欄などを、座標で置くだけの部品。専用の部品が無い場面や、仮の場面に使う。
// scene.blocks: [{ id, kind, x, y, w, h, text, title, color, size, bold, align, dashed, light, at, typeAt, css }]
//   kind: box（枠つきの四角）/ window（題名の帯つきの窓）/ text（文字だけ）/ pill（丸い札）/ input（入力欄）/ button / bubble（吹き出し）
//   id を付けると、カメラの寄り先と、場面の切り替えの出どころ・行き先に使える
//   at: 出てくる秒（場面の始まりから）。typeAt: その秒から文字を 1 字ずつ打つ（入力の様子）
window.PARTS = window.PARTS || {};
window.PARTS.blocks = {
  build(sc, world, { el, T }) {
    const items = (sc.blocks || []).map((b) => {
      const color = b.color ?? T.accent;
      const light = b.light;
      const n = el('div', '', world, {
        position: 'absolute', left: `${b.x}px`, top: `${b.y}px`, width: b.w ? `${b.w}px` : 'auto', height: b.h ? `${b.h}px` : 'auto',
        fontSize: `${b.size ?? 24}px`, fontWeight: b.bold ? 700 : 400, textAlign: b.align ?? 'left', lineHeight: 1.5,
        color: light ? '#1f2937' : T.fg, display: 'flex', alignItems: 'center', justifyContent: b.align === 'center' ? 'center' : 'flex-start',
      });
      const box = { background: light ? '#ffffff' : T.card, border: `2px ${b.dashed ? 'dashed' : 'solid'} ${light ? '#d1d5db' : color}`, borderRadius: '14px', padding: '12px 20px' };
      const looks = {
        box,
        window: { ...box, alignItems: 'flex-start', padding: '0', overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' },
        text: {},
        pill: { background: color, color: T.bg, borderRadius: '999px', padding: '6px 22px', fontWeight: 900 },
        input: { background: light ? '#f9fafb' : T.bg, border: `2px solid ${light ? '#d1d5db' : T.edge}`, borderRadius: '10px', padding: '0 18px', color: light ? '#111827' : T.fg },
        button: { background: color, color: light ? '#ffffff' : T.bg, borderRadius: '10px', justifyContent: 'center', fontWeight: 700 },
        bubble: { background: light ? '#eef2ff' : T.card, border: light ? 'none' : `2px solid ${color}`, borderRadius: '18px', padding: '12px 20px' },
      };
      Object.assign(n.style, looks[b.kind ?? 'box'] ?? box, b.css);
      if (b.kind === 'window') {
        const bar = el('div', '', n, { width: '100%', height: '52px', background: light ? '#f3f4f6' : T.edge, display: 'flex', alignItems: 'center', gap: '10px', padding: '0 18px', fontSize: '20px', fontWeight: 700 });
        ['#ff5f57', '#febc2e', '#28c840'].forEach((c) => el('span', '', bar, { width: '14px', height: '14px', borderRadius: '50%', background: c, display: 'inline-block' }));
        el('span', '', bar, { marginLeft: '12px' }).textContent = b.title ?? '';
      } else n.textContent = b.typeAt != null ? '' : b.text ?? '';
      if (b.id) n.dataset.anchor = b.id;
      return { b, n };
    });
    return { items };
  },
  render(h, lt, sc, { easeOut, ramp, typed }) {
    h.items.forEach(({ b, n }) => {
      const at = b.at ?? 0, k = easeOut(ramp(lt, at, at + 0.35));
      n.style.opacity = k;
      n.style.transform = `translateY(${(1 - k) * 12}px)`;
      if (b.typeAt != null) n.textContent = typed(b.text, lt, b.typeAt, b.cps ?? 14);
    });
  },
};
