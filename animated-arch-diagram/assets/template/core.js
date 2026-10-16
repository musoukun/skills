// core.js — 台本（scenes.js の window.SCENES）を受け取り、時刻 t の絵を描く。
// t が同じなら必ず同じ絵になる（乱数も実時間も使わない）。録画（tools/render.mjs）は ARCH.render(t) を 1 コマずつ呼ぶ。
// ふつうに開くとループ再生、?t=3.2 でその時刻に止める、?render で録画用（自動再生しない）。
//
// 場面（scene）は 1 つの部品（part）が描く。部品は parts/ にあり、window.PARTS[名前] = { build, render } で登録する。
//   build(scene, world, api)  … 場面の中身を world（1600×900 の箱）に 1 回だけ作る。data-anchor="名前" を付けた要素は、
//                                カメラの寄り先と、場面の切り替えの出どころ・行き先に使える
//   render(handle, lt, scene, api) … 場面の中の時刻 lt（場面の始まりからの秒）の様子にする。handle は build が返したもの
// 場面の項目: part, dur, kicker, caption, color, camera, transition（書式は references/scenes.md）
(() => {
  const S = window.SCENES;
  const W = 1600, H = 900;
  const T = Object.assign({
    bg: '#0b0d12', card: '#121722', fg: '#e8ecf4', dim: '#7d8799', edge: '#2a3245', accent: '#22d3ee',
    font: "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic UI', sans-serif", mono: "'JetBrains Mono', 'Noto Sans JP', monospace",
  }, S.theme);
  const stage = document.getElementById('stage');
  Object.assign(stage.style, { background: T.bg, fontFamily: T.font, color: T.fg });

  // ---- 小道具 ----
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ramp = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const easeInOut = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const easeBack = (x) => { x = clamp(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const el = (tag, cls, parent, css) => { const e = document.createElement(tag); if (cls) e.className = cls; if (css) Object.assign(e.style, css); if (parent) parent.appendChild(e); return e; };
  const lerpRect = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) });
  const FULL = { x: 0, y: 0, w: W, h: H };
  // 要素の位置を、world の中の座標で測る（カメラの拡大に左右されない）
  const rectIn = (node, root) => {
    let x = 0, y = 0, e = node;
    while (e && e !== root) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
    return { x, y, w: node.offsetWidth, h: node.offsetHeight };
  };
  // 文字を 1 字ずつ出す（タイプライター）
  const typed = (text, lt, at = 0, cps = 28) => { const a = Array.from(text || ''); return a.slice(0, Math.round(clamp((lt - at) * cps, 0, a.length))).join(''); };
  const api = { W, H, T, clamp, ramp, lerp, easeOut, easeInOut, easeBack, el, typed };
  window.PARTS = window.PARTS || {};

  // ---- 時間割 ----
  const TR = { cut: 0, fade: 0.5, expand: 0.8, collapse: 0.7 };
  const FADE = 0.6;
  let cur = 0;
  const scenes = S.scenes.map((sc, i) => {
    const tr = sc.transition ? { dur: TR[sc.transition.type] ?? 0.5, ...sc.transition } : null;
    const r = { ...sc, i, tr, t0: cur, t1: cur + sc.dur };
    cur = r.t1;
    return r;
  });
  const DUR = cur + FADE;
  const sceneAt = (t) => { let i = scenes.length - 1; while (i > 0 && t < scenes[i].t0) i--; return scenes[i]; };

  // ---- 場面ごとに層を 1 枚ずつ作る ----
  const gLayers = el('div', '', stage, { position: 'absolute', inset: '0' });
  const frame = el('div', 'frame', stage);
  const cap = el('div', 'cap', stage);
  const kicker = el('div', 'kicker', cap);
  const line = el('div', 'line', cap);
  const stamp = el('div', '', stage, { position: 'absolute', right: '24px', top: '16px', color: '#ff5577', font: `22px ${T.mono}` });

  function build() {
    scenes.forEach((sc) => {
      const part = window.PARTS[sc.part];
      if (!part) throw new Error(`部品が無い: ${sc.part}（index.html で parts/${sc.part}.js を読み込む）`);
      sc.layer = el('div', 'layer', gLayers, { visibility: 'hidden', background: sc.bg ?? T.bg }); // 背景を塗る（広がる・縮むときに、下の場面が透けないように）
      sc.world = el('div', 'world', sc.layer);
      sc.handle = part.build(sc, sc.world, api) || {};
    });
  }
  // 寄り先・切り替えの出どころに使う要素の位置を、カメラを動かす前に測っておく（フォントを読み込んだあとに測る）
  function measure() {
    scenes.forEach((sc) => {
      sc.anchors = {};
      sc.world.querySelectorAll('[data-anchor]').forEach((n) => { sc.anchors[n.dataset.anchor] = rectIn(n, sc.world); });
    });
  }
  const anchor = (sc, name) => {
    const r = sc.anchors[name];
    if (!r) { console.warn(`anchor not found: ${name}（場面 ${sc.i + 1}）`); return { x: W / 2 - 100, y: H / 2 - 50, w: 200, h: 100 }; }
    return r;
  };

  // ---- カメラ: camera: [{ at, to, zoom | fit, dur }] を上から順に進める。to が無ければ全体に戻る ----
  function cameraAt(sc, lt) {
    let c = { x: W / 2, y: H / 2, z: 1 };
    for (const k of sc.camera || []) {
      const p = easeInOut(ramp(lt, k.at, k.at + (k.dur ?? 0.7)));
      if (p <= 0) break;
      const r = k.to ? anchor(sc, k.to) : FULL;
      const z = k.fit ? Math.min((W * k.fit) / r.w, (H * k.fit) / r.h) : k.zoom ?? 1;
      c = { x: lerp(c.x, r.x + r.w / 2, p), y: lerp(c.y, r.y + r.h / 2, p), z: lerp(c.z, Math.max(1, z), p) };
    }
    const hw = W / (2 * c.z), hh = H / (2 * c.z); // 画面の外（何も無い所）を映さない
    c.x = clamp(c.x, hw, W - hw); c.y = clamp(c.y, hh, H - hh);
    return c;
  }
  const onScreen = (r, c) => ({ x: W / 2 + (r.x - c.x) * c.z, y: H / 2 + (r.y - c.y) * c.z, w: r.w * c.z, h: r.h * c.z });

  // 層を、画面の中の四角 box に収まるように縮めて置く（Mac の全画面の切り替えのように、四角が広がる・縮む）
  function fitLayer(layer, box, radius = 18) {
    const s = Math.max(box.w / W, box.h / H);
    const left = box.x + box.w / 2 - (W * s) / 2, top = box.y + box.h / 2 - (H * s) / 2;
    const it = (box.y - top) / s, ib = H - (box.y + box.h - top) / s, il = (box.x - left) / s, ir = W - (box.x + box.w - left) / s;
    layer.style.transform = `translate(${left}px, ${top}px) scale(${s})`;
    layer.style.clipPath = `inset(${it}px ${ir}px ${ib}px ${il}px round ${radius / s}px)`;
  }
  function resetLayer(layer) { layer.style.transform = ''; layer.style.clipPath = ''; layer.style.opacity = 1; layer.style.filter = ''; }

  function draw(sc, lt) {
    const layer = sc.layer;
    layer.style.visibility = 'visible';
    resetLayer(layer);
    const c = cameraAt(sc, lt);
    sc.world.style.transform = `translate(${W / 2 - c.x * c.z}px, ${H / 2 - c.y * c.z}px) scale(${c.z})`;
    window.PARTS[sc.part].render(sc.handle, lt, sc, api);
    return c;
  }

  // ---- 1 コマ描く ----
  function render(t, opt = {}) {
    t = clamp(t, 0, DUR);
    scenes.forEach((sc) => { sc.layer.style.visibility = 'hidden'; sc.layer.style.zIndex = 0; });
    frame.style.opacity = 0;
    const sc = sceneAt(t), lt = Math.min(t - sc.t0, sc.dur), prev = scenes[sc.i - 1];
    const tr = sc.tr && prev && lt < sc.tr.dur ? sc.tr : null;
    if (!tr || tr.type === 'cut') draw(sc, lt);
    else {
      const k = easeInOut(lt / tr.dur);
      const pc = draw(prev, prev.dur); // 前の場面は、終わりの絵で止めておく
      const cc = draw(sc, lt);
      if (tr.type === 'fade') { prev.layer.style.opacity = 1 - k; sc.layer.style.zIndex = 1; sc.layer.style.opacity = k; }
      if (tr.type === 'expand') { // 前の場面の中の要素（tr.from）が、画面いっぱいに広がって次の場面になる
        const box = lerpRect(onScreen(anchor(prev, tr.from), pc), FULL, k);
        prev.layer.style.opacity = lerp(1, 0.25, k);
        prev.layer.style.filter = `blur(${k * 4}px)`;
        sc.layer.style.zIndex = 1;
        fitLayer(sc.layer, box, lerp(14, 0, k));
        sc.layer.style.opacity = easeOut(ramp(lt / tr.dur, 0, 0.15));
        Object.assign(frame.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px`, borderRadius: `${lerp(14, 0, k)}px`,
          border: `2px solid ${sc.color ?? T.accent}`, boxShadow: `0 20px 80px rgba(0,0,0,0.6), 0 0 40px ${sc.color ?? T.accent}55`, opacity: 1 - ramp(k, 0.8, 1) });
      }
      if (tr.type === 'collapse') { // 前の場面が縮んで、次の場面の中の要素（tr.to）に戻っていく
        const box = lerpRect(FULL, onScreen(anchor(sc, tr.to), cc), k);
        sc.layer.style.opacity = lerp(0.25, 1, k);
        sc.layer.style.filter = `blur(${(1 - k) * 4}px)`;
        prev.layer.style.zIndex = 1;
        fitLayer(prev.layer, box, lerp(0, 14, k));
        prev.layer.style.opacity = 1 - ramp(k, 0.8, 1);
        Object.assign(frame.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px`, borderRadius: `${lerp(0, 14, k)}px`,
          border: `2px solid ${prev.color ?? T.accent}`, boxShadow: `0 20px 80px rgba(0,0,0,0.6)`, opacity: 1 - ramp(k, 0.8, 1) });
      }
    }

    // 字幕: 小見出しと 1 行
    kicker.textContent = sc.kicker ?? '';
    kicker.style.color = sc.color ?? T.accent;
    line.textContent = typed(sc.caption, lt, 0.15);
    cap.style.opacity = 1 - ramp(lt, sc.dur - 0.2, sc.dur) * (sc.i < scenes.length - 1 ? 1 : 0);

    // 最初は空から出し、最後は空に戻す（最後のコマ = 最初のコマなので、つなげて流しても継ぎ目が無い）
    const vis = easeOut(ramp(t, 0, 0.4)) * (1 - ramp(t, DUR - FADE, DUR - 0.12));
    gLayers.style.opacity = vis; cap.style.opacity = Number(cap.style.opacity) * vis; frame.style.opacity = Number(frame.style.opacity) * vis;

    stamp.textContent = opt.stamp ? `t=${t.toFixed(2)}s` : '';
  }

  // ---- 起動: フォントを読み込んでから組み立てる ----
  const q = new URLSearchParams(location.search);
  window.ARCH = { ready: false, duration: DUR, fps: S.fps ?? 30, posterTime: S.poster ?? DUR / 2, render,
    phases: scenes.map((sc) => ({ kind: sc.kicker ?? sc.part, t0: +sc.t0.toFixed(2), t1: +sc.t1.toFixed(2), caption: sc.caption ?? '' })) };
  // 録画しないときは、窓の大きさに合わせて縮める
  if (!q.has('render')) {
    const fit = () => { const s = Math.min(innerWidth / W, innerHeight / H); stage.style.transform = `translate(${(innerWidth - W * s) / 2}px, ${(innerHeight - H * s) / 2}px) scale(${s})`; };
    addEventListener('resize', fit); fit();
  }
  requestAnimationFrame(async () => {
    build();
    await document.fonts.ready; // 組み立てた文字に要るフォントを読み終えるまで待つ
    measure();
    ARCH.ready = true;
    if (q.has('render')) return render(0);
    if (q.has('t')) return render(Number(q.get('t')), { stamp: true });
    const start = performance.now();
    const loop = () => { render(((performance.now() - start) / 1000) % DUR); requestAnimationFrame(loop); };
    loop();
  });
})();
