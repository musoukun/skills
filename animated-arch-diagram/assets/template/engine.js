// engine.js — SPEC（spec.js）を受け取り、時刻 t の絵を描く加工機。
// t が同じなら必ず同じ絵になる（乱数も実時間も使わない）。録画（tools/render.mjs）は ARCH.render(t) を1コマずつ呼ぶ。
// ふつうに開くとループ再生、?t=3.2 でその時刻に止める、?render で録画用（自動再生しない）。
(() => {
  const S = window.SPEC;
  const W = 1600, H = 900;
  const T = Object.assign({
    bg: '#0b0d12', dot: '#1b2130', card: '#121722', fg: '#e8ecf4', dim: '#7d8799', edge: '#2a3245',
    font: "'Noto Sans JP', 'Yu Gothic UI', 'Hiragino Sans', sans-serif",
    mono: "'JetBrains Mono', Consolas, monospace",
  }, S.theme);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('stage');

  // ---- 小道具 ----
  const set = (e, a) => { for (const k in a) e.setAttribute(k, a[k]); return e; };
  const el = (tag, a, parent) => { const e = set(document.createElementNS(NS, tag), a || {}); if (parent) parent.appendChild(e); return e; };
  const txt = (s, a, parent) => { const e = el('text', a, parent); e.textContent = s; return e; };
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ramp = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const easeInOut = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const easeBack = (x) => { x = clamp(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

  // ---- 時間割（秒）: 登場 → ステップ… → 全体稼働 → フェードアウト（最後のコマ＝最初のコマなのでループが継ぎ目なし） ----
  const POP = 0.45, GAP = S.gap ?? 0.18, XF = 0.35, FADE = 0.6;
  const nodes = S.nodes.map((n, i) => ({ ...n, t0: 0.4 + i * GAP }));
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  let cur = nodes[nodes.length - 1].t0 + POP + 0.6;
  const phases = [{ kind: 'intro', t0: 0, t1: cur }];
  S.steps.forEach((s, i) => { phases.push({ ...s, kind: 'step', i, t0: cur, t1: cur + (s.dur ?? 2.4), hop: s.hop ?? 0.8 }); cur = phases.at(-1).t1; });
  const outro = { ...(S.outro || {}), kind: 'outro', t0: cur };
  outro.t1 = cur + (outro.hold ?? 2);
  phases.push(outro);
  const DUR = outro.t1 + FADE;
  const phaseIndex = (t) => { let i = phases.length - 1; while (i > 0 && t < phases[i].t0) i--; return i; };

  // ---- 配置: grid の升目の中心に置く ----
  const [GC, GR] = S.grid || [3, 3];
  const PX = 80, TOP = S.title ? 170 : 60, BOTTOM = 170;
  const cw = (W - PX * 2) / GC, ch = (H - TOP - BOTTOM) / GR;
  nodes.forEach((n) => {
    n.x = PX + (n.col + 0.5) * cw; n.y = TOP + (n.row + 0.5) * ch;
    n.w = n.w ?? Math.min(280, cw - 40); n.h = n.h ?? 88;
  });

  // 行が違えば上下の辺から S字、同じ行なら左右の辺を直線で結ぶ
  function edgePath(a, b) {
    if (Math.abs(a.y - b.y) > 1) {
      const s = a.y < b.y ? 1 : -1;
      const x1 = a.x, y1 = a.y + (s * a.h) / 2, x2 = b.x, y2 = b.y - (s * b.h) / 2, m = (y2 - y1) / 2;
      return `M${x1},${y1} C${x1},${y1 + m} ${x2},${y2 - m} ${x2},${y2}`;
    }
    const s = a.x < b.x ? 1 : -1;
    return `M${a.x + (s * a.w) / 2},${a.y} L${b.x - (s * b.w) / 2},${b.y}`;
  }

  // ---- 部品を一度だけ組み立てる（render は属性を書き換えるだけ） ----
  const defs = el('defs', {}, svg);
  defs.innerHTML = `
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="18"/></filter>
    <filter id="glowS" x="-300%" y="-300%" width="700%" height="700%"><feGaussianBlur stdDeviation="5"/></filter>
    <pattern id="dots" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="${T.dot}"/></pattern>
    <radialGradient id="vig" cx="50%" cy="45%" r="75%"><stop offset="55%" stop-color="${T.bg}" stop-opacity="0"/><stop offset="100%" stop-color="${T.bg}" stop-opacity="0.9"/></radialGradient>`;
  const dotPattern = defs.querySelector('#dots');
  el('rect', { width: W, height: H, fill: T.bg }, svg);
  el('rect', { width: W, height: H, fill: 'url(#dots)' }, svg);
  el('rect', { width: W, height: H, fill: 'url(#vig)' }, svg);
  const gAll = el('g', {}, svg);
  const gTitle = el('g', {}, gAll), gEdges = el('g', {}, gAll), gFx = el('g', {}, gAll);
  const gNodes = el('g', {}, gAll), gBadges = el('g', {}, gAll), gCap = el('g', {}, gAll);
  const gStamp = el('g', {}, svg);

  if (S.title) {
    txt(S.title, { x: PX, y: 96, fill: T.fg, 'font-family': T.font, 'font-size': 42, 'font-weight': 900 }, gTitle);
    if (S.subtitle) txt(S.subtitle, { x: PX, y: 136, fill: T.dim, 'font-family': T.font, 'font-size': 22 }, gTitle);
  }

  const edges = (S.edges || []).map((e) => {
    const a = byId[e.from], b = byId[e.to], d = edgePath(a, b);
    const base = el('path', { d, fill: 'none', stroke: T.edge, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, gEdges);
    const hot = el('path', { d, fill: 'none', stroke: a.color, 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0 }, gEdges);
    const len = base.getTotalLength();
    if (e.dashed) { set(base, { 'stroke-dasharray': '7 9' }); set(hot, { 'stroke-dasharray': '7 9' }); }
    else set(base, { 'stroke-dasharray': `${len} ${len}` }); // 線を「引く」演出用
    const mid = base.getPointAtLength(len / 2);
    const label = e.label ? txt(e.label, { x: mid.x + 10, y: mid.y - 8, fill: T.dim, 'font-family': T.mono, 'font-size': 14 }, gEdges) : null;
    return { ...e, a, b, base, hot, len, label, t0: Math.max(a.t0, b.t0) + POP * 0.6 };
  });
  const findEdge = (f, t) => {
    for (const e of edges) {
      if (e.from === f && e.to === t) return { e, rev: false };
      if (e.from === t && e.to === f) return { e, rev: true };
    }
    console.warn(`edge not found: ${f} -> ${t}（edges に足してください）`);
    return null;
  };
  phases.forEach((p) => { if (p.kind === 'step') p.hops = (p.flow || []).map(([f, t]) => findEdge(f, t)); });

  nodes.forEach((n) => {
    const box = { x: -n.w / 2, y: -n.h / 2, width: n.w, height: n.h, rx: 16 };
    n.g = el('g', {}, gNodes);
    n.glow = el('rect', { ...box, fill: n.color, filter: 'url(#glow)', opacity: 0 }, n.g);
    n.ringG = el('g', { opacity: 0 }, n.g);
    el('rect', { ...box, fill: 'none', stroke: n.color, 'stroke-width': 2 }, n.ringG); // 到着パルス
    el('rect', { ...box, fill: T.card, stroke: n.color, 'stroke-width': 2 }, n.g);
    el('rect', { x: -n.w / 2 + 12, y: -n.h / 2 + 18, width: 5, height: n.h - 36, rx: 2.5, fill: n.color }, n.g);
    const lx = -n.w / 2 + 32;
    txt(n.label, { x: lx, y: n.sub ? -2 : 9, fill: T.fg, 'font-family': T.font, 'font-size': 27, 'font-weight': 700 }, n.g);
    if (n.sub) txt(n.sub, { x: lx, y: 26, fill: T.dim, 'font-family': T.mono, 'font-size': 16 }, n.g);
    if (n.tag) {
      const tg = el('g', {}, n.g);
      const tt = txt(n.tag, { x: 0, y: 5, fill: n.color, 'font-family': T.mono, 'font-size': 14, 'font-weight': 700, 'text-anchor': 'middle' }, tg);
      n.tagParts = { tg, tt };
    }
  });

  const kicker = txt('', { x: W / 2, y: H - 142, 'font-family': T.mono, 'font-size': 17, 'font-weight': 700, 'text-anchor': 'middle', 'letter-spacing': 3 }, gCap);
  const caption = txt('', { x: W / 2, y: H - 92, fill: T.fg, 'font-family': T.font, 'font-size': 36, 'font-weight': 700, 'text-anchor': 'middle' }, gCap);
  const steps = phases.filter((p) => p.kind === 'step');
  const dots = steps.map((_, i) => el('circle', { cx: W / 2 + (i - (steps.length - 1) / 2) * 22, cy: H - 50, r: 4 }, gCap));
  const stamp = txt('', { x: W - 24, y: 36, fill: '#ff5577', 'font-family': T.mono, 'font-size': 22, 'text-anchor': 'end' }, gStamp);

  // tag の枠は文字幅が分かってから作る（フォント読み込み後）
  function layoutTags() {
    nodes.forEach((n) => {
      if (!n.tagParts) return;
      const { tg, tt } = n.tagParts, w = tt.getComputedTextLength() + 22;
      tg.querySelector('rect')?.remove();
      tg.insertBefore(el('rect', { x: -w / 2, y: -12, width: w, height: 24, rx: 12, fill: T.bg, stroke: n.color, 'stroke-width': 1.5 }), tt);
      set(tg, { transform: `translate(${n.w / 2 - w / 2 - 16} ${-n.h / 2})` });
    });
  }

  // ---- 状態: フェーズごとの「明るさ, 光」。切り替わりは XF 秒で混ぜる ----
  const level = (p, id) =>
    p.kind === 'intro' ? [1, 0] : p.kind === 'outro' ? [1, 0.5] : !p.focus ? [1, 0] : p.focus.includes(id) ? [1, 1] : [0.28, 0];
  function nodeLevel(t, id) {
    const i = phaseIndex(t), p = phases[i], q = phases[i - 1] || p, k = easeInOut(ramp(t, p.t0, p.t0 + XF));
    const [a1, b1] = level(q, id), [a2, b2] = level(p, id);
    return [lerp(a1, a2, k), lerp(b1, b2, k)];
  }

  function packet(e, rev, p, color) {
    const at = (q) => e.base.getPointAtLength((rev ? 1 - q : q) * e.len);
    for (let k = 5; k >= 1; k--) { // 尾
      const pt = at(clamp(p - k * 0.035));
      el('circle', { cx: pt.x, cy: pt.y, r: 6 - k * 0.8, fill: color, opacity: 0.55 - k * 0.08 }, gFx);
    }
    const h = at(p);
    el('circle', { cx: h.x, cy: h.y, r: 15, fill: color, filter: 'url(#glowS)', opacity: 0.9 }, gFx);
    el('circle', { cx: h.x, cy: h.y, r: 7, fill: color }, gFx);
    el('circle', { cx: h.x, cy: h.y, r: 3.2, fill: '#fff' }, gFx);
  }

  function badge(n, text, k, fade) {
    const g = el('g', { opacity: fade }, gBadges);
    const t = txt(text, { x: 0, y: 7, fill: T.bg, 'font-family': T.font, 'font-size': 20, 'font-weight': 900, 'text-anchor': 'middle' }, g);
    const w = t.getComputedTextLength() + 32;
    g.insertBefore(el('rect', { x: -w / 2, y: -18, width: w, height: 36, rx: 18, fill: n.color }), t);
    set(g, { transform: `translate(${n.x} ${n.y - n.h / 2 - 40}) scale(${lerp(0.5, 1, easeBack(k))})` });
  }

  // ---- 1コマ描く ----
  function render(t, opt = {}) {
    t = clamp(t, 0, DUR);
    gFx.innerHTML = ''; gBadges.innerHTML = '';
    set(gAll, { opacity: 1 - ramp(t, outro.t1, DUR - 0.12) }); // 最後の数コマは空 → 先頭の空コマとつながる
    set(dotPattern, { patternTransform: `translate(${(t / DUR) * 32} ${(t / DUR) * 32})` }); // 1周でちょうど1マス → ループ
    set(gTitle, { opacity: easeOut(ramp(t, 0, 0.6)), transform: `translate(0 ${(1 - easeOut(ramp(t, 0, 0.6))) * 12})` });

    const pi = phaseIndex(t), p = phases[pi], lt = t - p.t0;
    const pulse = {}, hot = new Map();

    // 粒の流れ
    if (p.kind === 'step' && p.hops.length) {
      const span = p.t1 - p.t0 - 0.25, cyc = p.hops.length * p.hop + 0.35;
      for (let c = 0; c * cyc < span; c++) {
        p.hops.forEach((h, i) => {
          if (!h) return;
          const st = 0.2 + c * cyc + i * p.hop, en = st + p.hop;
          if (en > span) return; // 最後まで流れ切らない便は出さない
          const target = h.rev ? h.e.a : h.e.b;
          if (lt >= st && lt <= en) {
            const col = (h.rev ? h.e.b : h.e.a).color;
            packet(h.e, h.rev, easeInOut(ramp(lt, st, en)), col);
            hot.set(h.e, 1); set(h.e.hot, { stroke: col });
          } else if (lt > en && lt < en + 0.6) {
            pulse[target.id] = Math.max(pulse[target.id] || 0, 1 - (lt - en) / 0.6);
            hot.set(h.e, Math.max(hot.get(h.e) || 0, 1 - (lt - en) / 0.4));
          }
        });
      }
    }
    if (p.kind === 'outro') { // 全部の線に同時に流す
      edges.forEach((e, i) => {
        const u = lt - 0.2 - i * 0.12, per = 1.3;
        if (u > 0 && u < outro.t1 - outro.t0 - 0.2) packet(e, false, easeInOut((u % per) / per), e.b.color);
        hot.set(e, 0.55 * easeOut(ramp(lt, 0, 0.4)));
      });
    }

    edges.forEach((e) => {
      const k = easeOut(ramp(t, e.t0, e.t0 + 0.5));
      if (e.dashed) set(e.base, { opacity: k, 'stroke-dashoffset': -t * 30 });
      else set(e.base, { 'stroke-dashoffset': e.len * (1 - k) });
      set(e.hot, { opacity: hot.get(e) || 0, ...(e.dashed ? { 'stroke-dashoffset': -t * 30 } : {}) });
      if (e.label) set(e.label, { opacity: k });
    });

    nodes.forEach((n) => {
      const k = ramp(t, n.t0, n.t0 + POP), [bright, glow] = nodeLevel(t, n.id), pu = pulse[n.id] || 0;
      set(n.g, { transform: `translate(${n.x} ${n.y}) scale(${lerp(0.6, 1, easeBack(k)) * (1 + pu * 0.04)})`, opacity: easeOut(k) * bright });
      set(n.glow, { opacity: Math.max(glow * 0.45, pu * 0.8) });
      set(n.ringG, { opacity: pu * 0.9, transform: `scale(${1 + (1 - pu) * 0.18})` });
    });

    // バッジ（同じノードの次のバッジが出るまで表示）
    if (p.kind === 'step' && p.badges) {
      p.badges.forEach((b, i) => {
        const next = p.badges.slice(i + 1).find((x) => x.node === b.node);
        const at = b.at ?? 0.2, end = next ? next.at : p.t1 - p.t0 - 0.15;
        if (lt >= at && lt < end) badge(byId[b.node], b.text, ramp(lt, at, at + 0.35), 1 - ramp(lt, end - 0.15, end));
      });
    }

    // 字幕（タイプライター）と進み具合
    const cap = p.kind === 'step' ? p.caption : p.kind === 'outro' ? outro.caption : '';
    const chars = Array.from(cap || '');
    caption.textContent = chars.slice(0, Math.round(ramp(lt, 0.1, 0.1 + chars.length * 0.035) * chars.length)).join('');
    const kc = p.kind === 'step' ? (p.color ?? byId[(p.focus || []).at(-1)]?.color ?? T.fg) : T.fg;
    kicker.textContent = p.kind === 'step' ? `${String(p.i + 1).padStart(2, '0')}  ${p.kicker ?? 'STEP'}` : p.kind === 'outro' ? (outro.kicker ?? '') : '';
    set(kicker, { fill: kc });
    set(gCap, { opacity: p.kind === 'intro' ? easeOut(ramp(lt, p.t1 - p.t0 - 0.3, p.t1 - p.t0)) : 1 }); // 進み具合の点は登場の終わりに出す
    set(caption, { opacity: easeOut(ramp(lt, 0, 0.15)) * (p.kind === 'step' ? 1 - ramp(lt, p.t1 - p.t0 - 0.2, p.t1 - p.t0) : 1) });
    set(kicker, { opacity: caption.getAttribute('opacity') });
    dots.forEach((d, i) => set(d, { fill: p.kind === 'outro' || (p.kind === 'step' && i <= p.i) ? T.fg : T.edge }));

    stamp.textContent = opt.stamp ? `t=${t.toFixed(2)}s` : '';
  }

  // ---- 起動: 全部の文字を一度置いてフォントを読ませてから ready ----
  const warm = el('g', { opacity: 0 }, svg);
  const all = [S.title, S.subtitle, outro.caption, outro.kicker, ...S.steps.flatMap((s) => [s.caption, s.kicker, ...(s.badges || []).map((b) => b.text)]),
    ...nodes.flatMap((n) => [n.label, n.sub, n.tag])].filter(Boolean).join(' ');
  [[T.font, 400], [T.font, 700], [T.font, 900], [T.mono, 700]].forEach(([f, w]) => txt(all, { 'font-family': f, 'font-weight': w }, warm));

  const q = new URLSearchParams(location.search);
  window.ARCH = { ready: false, duration: DUR, fps: S.fps ?? 30, posterTime: outro.t0 + 1.0, render,
    phases: phases.map((p) => ({ kind: p.kind, t0: +p.t0.toFixed(3), t1: +p.t1.toFixed(3), caption: p.caption ?? '' })) };
  requestAnimationFrame(async () => {
    await document.fonts.ready;
    warm.remove(); layoutTags();
    ARCH.ready = true;
    if (q.has('render')) return render(0);
    if (q.has('t')) return render(Number(q.get('t')), { stamp: true });
    const start = performance.now();
    const loop = () => { render(((performance.now() - start) / 1000) % DUR); requestAnimationFrame(loop); };
    loop();
  });
})();
