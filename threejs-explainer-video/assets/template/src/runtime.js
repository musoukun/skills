// runtime.js — タイムライン（out/timeline.json）に沿ってカットを選び、3D の絵に字幕と名札を重ねる
// 書き出し用に window.EX = { ready, duration, fps, size, frame(t), sheet(times) } を出す。
// ?render なしで開くと、ナレーション付きでその場で再生する（クリックで再生/停止）。
import * as THREE from 'three';
import { createStage } from './kit.js';
import * as project from './project.js';

const builders = project.scenes, captionStyle = project.caption ?? {};

const tl = await (await fetch('out/timeline.json', { cache: 'no-store' })).json();
const [W, H] = tl.size;
const stage = createStage(W, H);
const out = document.getElementById('out');
out.width = W; out.height = H;
const g = out.getContext('2d');
const CAP = { font: '"Noto Sans JP", "Yu Gothic", sans-serif', weight: 800, size: Math.round(W * 0.056), y: 0.63, color: '#ffffff', ...captionStyle };

await document.fonts.load(`${CAP.weight} ${CAP.size}px ${CAP.font}`, tl.scenes.flatMap((s) => s.captions.map((c) => c.text)).join(''));

// ---- カットは最初に使うときに組み立てる ----
const built = new Map();
let labels = [];
const labelTexts = new Set(); // 名札に出た文字（あとでフォントの読み込みに足す）
const ctx = {
  THREE, stage, W, H, tl,
  label: (pos, text, opt = {}) => { labelTexts.add(text); labels.push({ pos: pos.clone(), text, ...opt }); },
  // シーン id の i 番目の字幕が出る時刻（そのシーンの頭からの秒）。動きを言葉に合わせるのに使う
  cue: (id, i = 0) => {
    const s = tl.scenes.find((s) => s.id === id);
    return s.captions[Math.min(i, s.captions.length - 1)].t0 - s.t0;
  },
  assets: {},
};
// 素材（HDRI・テクスチャ・モデル）は、カットを組み立てる前にまとめて読む
if (project.preload) ctx.assets = (await project.preload(ctx)) ?? {};
function sceneAt(t) {
  const i = Math.max(0, tl.scenes.findIndex((s) => t >= s.t0 && t < s.t1));
  const s = t >= tl.duration ? tl.scenes[tl.scenes.length - 1] : tl.scenes[i];
  if (!built.has(s.id)) {
    const b = builders[s.id];
    if (!b) throw new Error(`project.js に scenes.${s.id} がありません`);
    built.set(s.id, b(ctx));
  }
  return { s, cut: built.get(s.id) };
}

// ---- 2D の重ね書き ----
function wrap(line, maxW) {
  const rows = [];
  let cur = '';
  for (const ch of line) {
    if (g.measureText(cur + ch).width > maxW && cur) { rows.push(cur); cur = ch; } else cur += ch;
  }
  return rows.concat(cur ? [cur] : []);
}
function drawCaption(text) {
  g.save();
  g.font = `${CAP.weight} ${CAP.size}px ${CAP.font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const rows = text.split('\n').flatMap((l) => wrap(l, W * 0.86));
  const lh = CAP.size * 1.38, y0 = H * CAP.y - ((rows.length - 1) * lh) / 2;
  rows.forEach((row, i) => {
    const y = y0 + i * lh;
    g.lineJoin = 'round';
    g.lineWidth = CAP.size * 0.16;
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.shadowColor = 'rgba(0,0,0,0.55)';
    g.shadowBlur = CAP.size * 0.35;
    g.strokeText(row, W / 2, y);
    g.shadowBlur = 0;
    g.fillStyle = CAP.color;
    g.fillText(row, W / 2, y);
  });
  g.restore();
}
function drawLabels(camera) {
  g.save();
  const fs = Math.round(W * 0.04);
  g.font = `700 ${fs}px ${CAP.font}`;
  g.textBaseline = 'middle';
  for (const l of labels) {
    const p = l.pos.clone().project(camera);
    if (p.z > 1) continue;
    const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
    const [dx, dy] = l.offset ?? [W * 0.14, -H * 0.06];
    const a = l.alpha ?? 1;
    g.globalAlpha = a;
    g.strokeStyle = g.fillStyle = l.color ?? '#ffffff';
    g.lineWidth = 3;
    g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx, y + dy); g.lineTo(x + dx + Math.sign(dx || 1) * 30, y + dy); g.stroke();
    const tw = g.measureText(l.text).width, pad = 22;
    // 名札の箱は必ず画面の内側に押し込む（縦長は横が狭く、向きの調整だけだと端で切れる）
    const tx = Math.min(W - pad - tw, Math.max(pad, dx >= 0 ? x + dx + 40 : x + dx - 40 - tw));
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(tx - 14, y + dy - fs * 0.75, tw + 28, fs * 1.5);
    g.fillStyle = l.color ?? '#ffffff';
    g.fillText(l.text, tx, y + dy);
  }
  g.restore();
}

// ---- 1コマ描く（t は動画の先頭からの秒） ----
// samples > 1 でモーションブラー: シャッターが開いている間（shutter = 1コマの何割か）の時刻を
// samples 回描いて平均する。カットの境目はまたがない。字幕と名札はコマの中央の時刻で1回だけ描く
function draw(t, samples = 1, shutter = 0.5) {
  const { s, cut } = sceneAt(t);
  const n = Math.max(1, samples | 0);
  for (let i = 0; i < n; i++) {
    const ti = n === 1 ? t : clampT(t + ((i + 0.5) / n - 0.5) * (shutter / tl.fps), s);
    labels = [];
    cut.update(ti - s.t0, s.t1 - s.t0, ti);
    cut.shot.render();
    g.globalAlpha = 1 / (i + 1); // 逐次平均: i 枚目を 1/(i+1) で重ねると全体が等しい重みになる
    g.drawImage(stage.renderer.domElement, 0, 0, W, H);
  }
  g.globalAlpha = 1;
  if (n > 1) { labels = []; cut.update(t - s.t0, s.t1 - s.t0, t); }
  drawLabels(cut.shot.camera);
  const c = s.captions.find((c) => t >= c.t0 && t < c.t1);
  if (c && !cut.noCaption) drawCaption(c.text);
}
const clampT = (t, s) => Math.min(s.t1 - 1e-4, Math.max(s.t0, t));

window.EX = {
  ready: false, duration: tl.duration, fps: tl.fps, size: [W, H],
  frame(t, mime = 'image/jpeg', q = 0.93, samples = 1) {
    draw(t, samples);
    return out.toDataURL(mime, q).split(',')[1];
  },
  // コンタクトシート（確認用）: 時刻ごとの縮小画像を並べ、左上に秒を書く
  sheet(times, cols = 6, w = 240) {
    const h = Math.round((w * H) / W), rows = Math.ceil(times.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * w; c.height = rows * h;
    const sg = c.getContext('2d');
    times.forEach((t, i) => {
      draw(t);
      const x = (i % cols) * w, y = Math.floor(i / cols) * h;
      sg.drawImage(out, x, y, w, h);
      sg.fillStyle = 'rgba(0,0,0,0.6)'; sg.fillRect(x, y, 64, 24);
      sg.fillStyle = '#fff'; sg.font = '16px monospace'; sg.fillText(t.toFixed(2), x + 6, y + 17);
    });
    return c.toDataURL('image/png').split(',')[1];
  },
};

// 全カットを先に一度組み立てて描いておく（シェーダのコンパイルを書き出し前に済ませる）
for (const s of tl.scenes) for (const k of [0.2, 0.5, 0.8]) draw(s.t0 + (s.t1 - s.t0) * k);
// 名札の文字は字幕と別に読み込む（読み込んでいない字＝「→」などは、書き出しで欠けることがある）
await document.fonts.load(`700 ${Math.round(W * 0.04)}px ${CAP.font}`, [...labelTexts].join('') || 'あ');
draw(0);
EX.ready = true;

// ---- 書き出しでないときはその場で再生 ----
if (!location.search.includes('render')) {
  const audio = new Audio('out/narration.wav');
  out.addEventListener('click', () => (audio.paused ? audio.play() : audio.pause()));
  const loop = () => { if (!audio.paused) draw(audio.currentTime); requestAnimationFrame(loop); };
  loop();
}
