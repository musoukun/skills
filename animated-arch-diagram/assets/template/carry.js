// carry.js — 運搬型。1 つのデータ（札）が駅から駅へ運ばれ、駅を通るたびに中身が変わる様子を、時刻 t の絵として描く。
// engine.js と同じく、t が同じなら必ず同じ絵（乱数も実時間も使わない）。中身は carry-spec.js、書式は references/carry-spec.md
// 駅に着くと札は駅に入り、駅の上に吹き出しが出て、中身が変わった札（out）が次の駅へ出ていく。
(() => {
  const S = window.SPEC;
  const W = 1600, H = 900, ROW = S.row ?? 560, SH = 84;
  const T = Object.assign({
    bg: '#0b0d12', dot: '#1b2130', card: '#121722', fg: '#e8ecf4', dim: '#7d8799', edge: '#2a3245',
    font: "'Noto Sans JP', 'Yu Gothic UI', 'Hiragino Sans', sans-serif",
  }, S.theme);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('stage');
  const set = (e, a) => { for (const k in a) e.setAttribute(k, a[k]); return e; };
  const el = (tag, a, parent) => { const e = set(document.createElementNS(NS, tag), a || {}); if (parent) parent.appendChild(e); return e; };
  const txt = (s, a, parent) => { const e = el('text', { 'font-family': T.font, ...a }, parent); e.textContent = s; return e; };
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ramp = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const easeInOut = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const easeBack = (x) => { x = clamp(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

  // ---- 駅と線 ----
  const st = Object.fromEntries(S.stations.map((s, i) => [s.id, { ...s, y: ROW, w: s.w ?? 230, h: SH, t0: 0.5 + i * 0.16 }]));
  const defs = el('defs', {}, svg);
  defs.innerHTML = `
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="16"/></filter>
    <filter id="glowS" x="-100%" y="-200%" width="300%" height="500%"><feGaussianBlur stdDeviation="8"/></filter>
    <pattern id="dots" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="${T.dot}"/></pattern>
    <radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset="55%" stop-color="${T.bg}" stop-opacity="0"/><stop offset="100%" stop-color="${T.bg}" stop-opacity="0.9"/></radialGradient>`;
  const dotPattern = defs.querySelector('#dots');
  el('rect', { width: W, height: H, fill: T.bg }, svg);
  el('rect', { width: W, height: H, fill: 'url(#dots)' }, svg);
  el('rect', { width: W, height: H, fill: 'url(#vig)' }, svg);
  const gAll = el('g', {}, svg);
  const gTitle = el('g', {}, gAll), gEdges = el('g', {}, gAll), gSt = el('g', {}, gAll), gBub = el('g', {}, gAll), gFx = el('g', {}, gAll), gCap = el('g', {}, gAll);
  const measurer = txt('', { x: -9999, y: -9999 }, svg);

  if (S.title) txt(S.title, { x: 80, y: 96, fill: T.fg, 'font-size': 42, 'font-weight': 900 }, gTitle);
  if (S.subtitle) txt(S.subtitle, { x: 80, y: 136, fill: T.dim, 'font-size': 22 }, gTitle);

  const paths = Object.fromEntries(S.paths.map((p) => {
    const a = st[p.from], b = st[p.to];
    let d;
    if (p.kind === 'line') d = `M${a.x + a.w / 2},${ROW} L${b.x - b.w / 2},${ROW}`;
    else {
      const sx = a.x + (p.dx?.[0] ?? 0), ex = b.x + (p.dx?.[1] ?? 0), y = ROW + SH / 2, L = p.depth ?? 130;
      d = `M${sx},${y} C${sx},${y + L} ${ex},${y + L} ${ex},${y}`;
    }
    const base = el('path', { d, fill: 'none', stroke: T.edge, 'stroke-width': 3, 'stroke-linecap': 'round' }, gEdges);
    const hot = el('path', { d, fill: 'none', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0 }, gEdges);
    const len = base.getTotalLength();
    set(base, { 'stroke-dasharray': `${len} ${len}` });
    let label = null;
    if (p.label) {
      const m = base.getPointAtLength(len / 2);
      label = txt(p.label, { x: m.x, y: m.y + 26, fill: T.dim, 'font-size': 18, 'text-anchor': 'middle' }, gEdges);
    }
    return [p.id, { ...p, a, b, base, hot, len, label, t0: Math.max(a.t0, b.t0) + 0.3 }];
  }));

  Object.values(st).forEach((n) => {
    const box = { x: -n.w / 2, y: -n.h / 2, width: n.w, height: n.h, rx: 16 };
    n.g = el('g', {}, gSt);
    n.glow = el('rect', { ...box, fill: n.color, filter: 'url(#glow)', opacity: 0 }, n.g);
    n.ring = el('rect', { ...box, fill: 'none', stroke: n.color, 'stroke-width': 2, opacity: 0 }, n.g);
    el('rect', { ...box, fill: T.card, stroke: n.color, 'stroke-width': 2 }, n.g);
    txt(n.label, { x: 0, y: n.sub ? -4 : 8, fill: T.fg, 'font-size': 24, 'font-weight': 700, 'text-anchor': 'middle' }, n.g);
    if (n.sub) txt(n.sub, { x: 0, y: 24, fill: n.color, 'font-size': 16, 'font-weight': 700, 'text-anchor': 'middle' }, n.g);
    n.bar = el('rect', { x: -n.w / 2 + 18, y: n.h / 2 - 9, width: 0, height: 4, rx: 2, fill: n.color }, n.g);
  });

  // ---- 時間割 ----
  const INTRO = 2.0, FADE = 0.6;
  let cur = INTRO, out = null;
  const beats = S.beats.map((b) => {
    const dur = b.dur ?? (b.move ? 1.0 : 3);
    const r = { ...b, t0: cur, t1: cur + dur, pkg: b.move ? out : null };
    if (!b.move && b.out) out = b.out;
    cur += dur;
    return r;
  });
  const outro = { ...(S.outro || {}), t0: cur, t1: cur + (S.outro?.hold ?? 3) };
  const DUR = outro.t1 + FADE;
  // 吹き出しは、同じ周（loop）が終わるまで残す
  const stays = beats.filter((b) => !b.move);
  // keep: 'next' の吹き出しは、次の駅に着いたら消す（隣の吹き出しと重なるとき）
  stays.forEach((b, i) => {
    b.until = (stays.find((x) => x.loop !== b.loop && x.t0 > b.t0)?.t0) ?? outro.t1;
    if (b.bubble?.keep === 'next' && stays[i + 1]) b.until = Math.min(b.until, stays[i + 1].t0 + 0.3);
  });
  // 字幕と小見出しは、直前の駅の出来事のものを出し続ける
  let cap = '', kick = '';
  beats.forEach((b) => { if (b.caption) cap = b.caption; if (b.kicker) kick = b.kicker; b.cap = cap; b.kick = kick; });

  // ---- 文字の折り返し（実際の幅を測る。行頭に句読点を置かない） ----
  const NO_HEAD = /^[、。，．）」』］・ー〜？！]/;
  function wrap(ln, width) {
    if (ln._w) return ln._w;
    set(measurer, { 'font-size': ln.size ?? 22, 'font-weight': ln.bold ? 700 : 400 });
    const out = [];
    let rest = Array.from(ln.text), first = true;
    while (rest.length) {
      const avail = width - (ln.indent ?? 0) - (first ? 0 : ln.hang ?? 0);
      let n = rest.length;
      measurer.textContent = rest.join('');
      if (measurer.getComputedTextLength() > avail) {
        n = 1;
        while (n < rest.length) { measurer.textContent = rest.slice(0, n + 1).join(''); if (measurer.getComputedTextLength() > avail) break; n++; }
        while (n < rest.length && NO_HEAD.test(rest[n])) n++;
      }
      out.push({ text: rest.slice(0, n).join(''), first });
      rest = rest.slice(n); first = false;
    }
    return (ln._w = out);
  }

  function pill(text, x, y, color, size, parent, alpha = 1) {
    const g = el('g', { opacity: alpha }, parent);
    const t = txt(text, { x: 0, y: size * 0.36, fill: T.bg, 'font-size': size, 'font-weight': 900, 'text-anchor': 'middle' }, g);
    const w = t.getComputedTextLength() + size * 1.5, hh = size * 1.9;
    g.insertBefore(el('rect', { x: -w / 2, y: -hh / 2, width: w, height: hh, rx: hh / 2, fill: color }), t);
    set(g, { transform: `translate(${x} ${y})` });
    return g;
  }

  // 運ばれている荷物（光る札）
  function pkg(p, k, color, text) {
    const head = p.base.getPointAtLength(k * p.len);
    set(p.hot, { stroke: color, opacity: 0.9, 'stroke-dasharray': `${k * p.len} ${p.len}` });
    el('ellipse', { cx: head.x, cy: head.y, rx: 90, ry: 26, fill: color, filter: 'url(#glowS)', opacity: 0.55 }, gFx);
    pill(text, head.x, head.y, color, 20, gFx);
  }

  // 駅の上の吹き出し。lines（そのまま並べる）か、groups（囲みごとに見出しを付けて並べる）
  function bubble(b, t) {
    const n = st[b.at], B = b.bubble, w = B.w ?? 330, color = B.color ?? n.color;
    const lt = t - b.t0, inK = easeOut(ramp(lt, 0, 0.35));
    const now = t < b.t1;
    const alpha = inK * (now ? 1 : 0.5) * (1 - ramp(t, b.until - 0.3, b.until));
    if (alpha <= 0) return;
    const lh = (ln) => (ln.size ?? 22) * 1.5;
    // 並べ方を先に決める（y は吹き出しの上端から）
    const secs = (B.groups || [{ lines: B.lines, plain: true }]).map((g) => ({ ...g }));
    let y = 50, idx = 0;
    secs.forEach((sec) => {
      const pad = sec.plain ? 0 : 14;
      sec.top = y;
      if (!sec.plain) y += 30;
      sec.rows = sec.lines.map((ln) => {
        y += ln.gap ?? 0;
        const pieces = wrap(ln, w - 44 - pad * 2), row = { ln, pieces, y, at: ln.at ?? 0.35 + idx++ * 0.5 };
        y += lh(ln) * pieces.length;
        return row;
      });
      sec.at = sec.at ?? (sec.rows[0]?.at ?? 0.3) - 0.15;
      if (!sec.plain) { y += 8; sec.h = y - sec.top; y += 8; }
    });
    const h = y + 6;
    const bottom = ROW - SH / 2 - 26;
    const x = clamp(n.x - w / 2 + (B.dx ?? 0), 24, W - 24 - w), top = bottom - h;
    const g = el('g', { opacity: alpha, transform: `translate(${n.x} ${bottom}) scale(${lerp(0.88, 1, easeBack(ramp(lt, 0, 0.4)))}) translate(${-n.x} ${-bottom})` }, gBub);
    el('path', { d: `M${n.x - 14},${bottom - 1} L${n.x},${bottom + 14} L${n.x + 14},${bottom - 1}`, fill: T.card, stroke: color, 'stroke-width': 1.5 }, g);
    el('rect', { x, y: top, width: w, height: h, rx: 14, fill: T.card, stroke: color, 'stroke-width': 1.5 }, g);
    el('rect', { x: n.x - 13, y: bottom - 2, width: 26, height: 3, fill: T.card }, g);
    txt(B.title, { x: x + 22, y: top + 33, fill: color, 'font-size': 18, 'font-weight': 900 }, g);
    secs.forEach((sec) => {
      const pad = sec.plain ? 0 : 14, sc = sec.color ?? color;
      if (!sec.plain) {
        const k = easeOut(ramp(lt, sec.at, sec.at + 0.3));
        if (k > 0) {
          const sg = el('g', { opacity: k }, g);
          el('rect', { x: x + 14, y: top + sec.top, width: w - 28, height: sec.h, rx: 10, fill: sc, 'fill-opacity': 0.07, stroke: sc, 'stroke-width': 1.5, 'stroke-opacity': 0.7, ...(sec.dashed ? { 'stroke-dasharray': '6 5' } : {}) }, sg);
          txt(sec.label, { x: x + 28, y: top + sec.top + 23, fill: sc, 'font-size': 16, 'font-weight': 900 }, sg);
        }
        if (sec.fly && now) { // 囲みの中身が札になって駅に入る
          const f = ramp(lt, sec.at + 0.5, sec.at + 1.1);
          if (f > 0 && f < 1) {
            const e = easeInOut(f);
            pill(sec.fly, lerp(x + 120, n.x, e), lerp(top + sec.top + 18, ROW, e), sc, lerp(17, 12, e), gFx, 1 - ramp(f, 0.8, 1));
          }
        }
      }
      sec.rows.forEach(({ ln, pieces, y: y0, at }) => {
        const k = easeOut(ramp(lt, at, at + 0.3));
        if (k <= 0) return;
        const lg = el('g', { opacity: k * (ln.dim ? 0.55 : 1), transform: `translate(${(1 - k) * 10} 0)` }, g);
        const lx = x + 22 + pad + (ln.indent ?? 0);
        if (ln.mark) el('rect', { x: lx - 8, y: top + y0 + 2, width: w - 44 - pad * 2 - (ln.indent ?? 0) + 16, height: lh(ln) * pieces.length, rx: 6, fill: ln.color, opacity: 0.2 }, lg);
        pieces.forEach((pc, j) => txt(pc.text, { x: lx + (pc.first ? 0 : ln.hang ?? 0), y: top + y0 + lh(ln) * (j + 0.72), fill: ln.color ?? T.fg, 'font-size': ln.size ?? 22, 'font-weight': ln.bold ? 700 : 400 }, lg));
      });
    });
  }

  const kicker = el('g', {}, gCap);
  const caption = txt('', { x: W / 2, y: H - 40, fill: T.fg, 'font-size': 34, 'font-weight': 700, 'text-anchor': 'middle' }, gCap);
  const stamp = txt('', { x: W - 24, y: 36, fill: '#ff5577', 'font-size': 22, 'text-anchor': 'end' }, svg);

  // ---- 1コマ描く ----
  function render(t, opt = {}) {
    t = clamp(t, 0, DUR);
    gFx.innerHTML = ''; gBub.innerHTML = ''; kicker.innerHTML = '';
    set(gAll, { opacity: 1 - ramp(t, outro.t1, DUR - 0.12) });
    set(dotPattern, { patternTransform: `translate(${(t / DUR) * 32} ${(t / DUR) * 32})` });
    set(gTitle, { opacity: easeOut(ramp(t, 0, 0.6)) });

    const b = beats.find((x) => t >= x.t0 && t < x.t1);
    const active = b && !b.move ? b.at : null;

    Object.values(st).forEach((n) => {
      const k = ramp(t, n.t0, n.t0 + 0.45);
      const arrive = beats.find((x) => !x.move && x.at === n.id && t >= x.t0 && t < x.t0 + 0.6);
      const pu = arrive ? 1 - (t - arrive.t0) / 0.6 : 0;
      const on = active === n.id;
      set(n.g, { transform: `translate(${n.x} ${n.y}) scale(${lerp(0.6, 1, easeBack(k)) * (1 + pu * 0.05)})`, opacity: easeOut(k) * (b && !on && t < outro.t0 ? 0.6 : 1) });
      set(n.glow, { opacity: on ? 0.4 : t >= outro.t0 ? 0.25 : 0 });
      set(n.ring, { opacity: pu * 0.9, transform: `scale(${1 + (1 - pu) * 0.2})` });
      set(n.bar, { width: on ? (n.w - 36) * ramp(t, b.t0 + 0.2, b.t1 - 0.2) : 0 });
    });

    Object.values(paths).forEach((p) => {
      const k = easeOut(ramp(t, p.t0, p.t0 + 0.5));
      set(p.base, { 'stroke-dashoffset': p.len * (1 - k) });
      set(p.hot, { opacity: 0 });
      if (p.label) set(p.label, { opacity: k });
    });

    // 吹き出し（同じ周のものは残す）
    stays.forEach((x) => { if (x.bubble && t >= x.t0 && t < x.until) bubble(x, t); });

    // 荷物
    if (b && b.move && b.pkg) pkg(paths[b.move], easeInOut(ramp(t, b.t0, b.t1)), b.pkg.color, b.pkg.text);
    if (t >= outro.t0) { // 締め: outro.loop の線に光を流し続ける（ループが回っている絵）
      (outro.loop || Object.keys(paths)).forEach((id, i) => {
        const p = paths[id], u = ((t - outro.t0) * 0.9 + i * 0.25) % 1;
        const h = p.base.getPointAtLength(easeInOut(u) * p.len);
        el('circle', { cx: h.x, cy: h.y, r: 16, fill: p.a.color, filter: 'url(#glowS)', opacity: 0.8 }, gFx);
        el('circle', { cx: h.x, cy: h.y, r: 7, fill: '#fff' }, gFx);
      });
    }

    // 字幕と小見出し
    const c = t >= outro.t0 ? outro.caption : b ? b.cap : '';
    const ct = t >= outro.t0 ? outro.t0 : b ? beats.find((x) => x.caption === b.cap).t0 : 0;
    const chars = Array.from(c || '');
    caption.textContent = chars.slice(0, Math.round(ramp(t - ct, 0.1, 0.1 + chars.length * 0.035) * chars.length)).join('');
    const kt = t >= outro.t0 ? (outro.kicker ?? '') : b ? b.kick : '';
    if (kt) pill(kt, W - 140, 100, t >= outro.t0 ? T.fg : '#94a3b8', 24, kicker);

    stamp.textContent = opt.stamp ? `t=${t.toFixed(2)}s` : '';
  }

  // ---- 起動: 文字を一度置いてフォントを読ませる ----
  const warm = el('g', { opacity: 0 }, svg);
  const all = [S.title, S.subtitle, outro.caption, outro.kicker, ...S.stations.flatMap((s) => [s.label, s.sub]), ...S.paths.map((p) => p.label),
    ...S.beats.flatMap((b) => [b.caption, b.kicker, b.out?.text, b.bubble?.title, ...(b.bubble?.groups || []).flatMap((g) => [g.label, g.fly]), ...[...(b.bubble?.lines || []), ...(b.bubble?.groups || []).flatMap((g) => g.lines)].map((l) => l.text)])].filter(Boolean).join(' ');
  [400, 700, 900].forEach((w) => txt(all, { 'font-weight': w }, warm));

  const q = new URLSearchParams(location.search);
  window.ARCH = { ready: false, duration: DUR, fps: S.fps ?? 30, posterTime: S.poster ?? outro.t0 + 1.0, render,
    phases: beats.map((x) => ({ kind: x.move ? 'move' : 'stay', t0: +x.t0.toFixed(2), t1: +x.t1.toFixed(2), caption: x.move ? `→ ${x.move}` : x.caption ?? '' })) };
  requestAnimationFrame(async () => {
    await document.fonts.ready;
    warm.remove();
    ARCH.ready = true;
    if (q.has('render')) return render(0);
    if (q.has('t')) return render(Number(q.get('t')), { stamp: true });
    const start = performance.now();
    const loop = () => { render(((performance.now() - start) / 1000) % DUR); requestAnimationFrame(loop); };
    loop();
  });
})();
