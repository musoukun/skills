// tts.mjs — 台本（script.json）を Gemini TTS で読み上げ、ナレーションとタイムラインを作る
//   node tools/tts.mjs          → out/narration.wav, out/timeline.json
//   node tools/tts.mjs --dry    → API を呼ばず、文字数から尺を見積もった無音版（絵づくりの下書き用）
//   node tools/tts.mjs --fresh  → 全シーンを録り直す（声やスタイルを変えたとき）
// 録った声は voice/<セリフのハッシュ>.wav に残し、セリフ（say）の文字が同じなら使い回す。
//   シーン名・順番・字幕・スタイル・声を変えても録り直さない（声とスタイルの違いは警告だけ出す）。
//   1シーンだけ録り直すときは、そのシーンに "retake": true を付けて実行し、終わったら外す。
// API キーは環境変数 GEMINI_API_KEY か、作業フォルダの .env（GEMINI_API_KEY=...）から読む
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'out');
const cacheDir = path.join(root, 'voice');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });
const dry = process.argv.includes('--dry');
const fresh = process.argv.includes('--fresh');
const script = JSON.parse(fs.readFileSync(path.join(root, 'script.json'), 'utf8'));
const tts = { model: 'gemini-3.8-flash-tts', voice: 'Charon', style: '', ...script.tts };
const RATE = 24000; // Gemini TTS の出力は 24kHz / 16bit / mono

function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  const env = path.join(root, '.env');
  if (fs.existsSync(env)) {
    const m = fs.readFileSync(env, 'utf8').match(/^GEMINI_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('GEMINI_API_KEY が見つかりません（環境変数か .env に入れてください）');
}

// ---- Gemini TTS（Interactions API）。429 / 5xx は待って再試行 ----
async function speak(text, style) {
  const content = [{ type: 'text', text, ...(style ? { annotations: [{ type: 'speech_metadata', style }] } : {}) }];
  const body = {
    model: tts.model,
    input: [{ type: 'user_input', content }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice: tts.voice }] },
  };
  for (let attempt = 1; ; attempt++) {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey(), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const j = await r.json();
      const audio = (j.steps || []).flatMap((s) => s.content || []).filter((c) => c.type === 'audio').pop();
      if (!audio) throw new Error('音声が返ってきませんでした: ' + JSON.stringify(j).slice(0, 300));
      return Buffer.from(audio.data, 'base64');
    }
    const msg = await r.text();
    if ((r.status === 429 || r.status >= 500) && attempt < 6) {
      const wait = 10 * attempt;
      console.log(`  ${r.status} → ${wait}s 待って再試行 (${attempt}/5)`);
      await new Promise((ok) => setTimeout(ok, wait * 1000));
      continue;
    }
    throw new Error(`TTS ${r.status}: ${msg.slice(0, 400)}`);
  }
}

// ---- WAV（16bit PCM）の読み書き ----
function readWav(buf) {
  let p = 12, rate = RATE, data = null;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4), size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') rate = buf.readUInt32LE(p + 12);
    if (id === 'data') { data = buf.subarray(p + 8, Math.min(buf.length, p + 8 + size)); break; }
    p += 8 + size + (size & 1);
  }
  if (!data) throw new Error('WAV の data チャンクがありません');
  if (rate !== RATE) throw new Error(`想定外のサンプルレート ${rate}`);
  return new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + (data.length & ~1)));
}
function writeWav(file, pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length * 2, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length * 2, 40);
  fs.writeFileSync(file, Buffer.concat([h, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.length * 2)]));
}
// 前後の無音を削る（-40dB 未満を無音とみなし、50ms の余白を残す）
function trim(pcm) {
  const th = 330, m = Math.round(RATE * 0.05);
  let a = 0, b = pcm.length - 1;
  while (a < b && Math.abs(pcm[a]) < th) a++;
  while (b > a && Math.abs(pcm[b]) < th) b--;
  return pcm.subarray(Math.max(0, a - m), Math.min(pcm.length, b + m));
}

// 字幕の文字数（記号と改行は数えない）。字幕の表示時間はこの比で配る
const weight = (s) => Math.max(1, s.replace(/[\s、。，．,.!?！？「」『』（）()・…ー〜]/g, '').length);

// ---- 本体: シーンごとに読み上げ → 無音を削る → つなぐ ----
const sec = (n) => Math.round(n * RATE);
const parts = [new Int16Array(sec(script.lead ?? 0.3))];
let cursor = parts[0].length / RATE;
const scenes = [];
for (const sc of script.scenes) {
  const style = sc.style ?? tts.style;
  let pcm;
  if (dry) {
    pcm = new Int16Array(sec(weight(sc.say) / 6)); // 実測: Gemini TTS の日本語は 1秒あたり 5.5〜6.6字（語り口の指定で変わる）
  } else {
    const key = crypto.createHash('sha1').update(sc.say.trim()).digest('hex').slice(0, 12);
    const file = path.join(cacheDir, `${key}.wav`), metaFile = path.join(cacheDir, `${key}.json`);
    const want = { model: tts.model, voice: tts.voice, style };
    if (fresh || sc.retake || !fs.existsSync(file)) {
      console.log(`TTS ${sc.id}: ${sc.say}`);
      fs.writeFileSync(file, await speak(sc.say, style));
      fs.writeFileSync(metaFile, JSON.stringify({ say: sc.say, ...want }, null, 2));
    } else {
      const had = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
      const diff = Object.keys(want).filter((k) => had[k] !== undefined && had[k] !== want[k]);
      console.log(`再利用 ${sc.id}${diff.length ? `（${diff.join('・')} が録ったときと違います。録り直すなら --fresh か "retake": true）` : ''}`);
    }
    pcm = trim(readWav(fs.readFileSync(file)));
  }
  const a0 = cursor, a1 = cursor + pcm.length / RATE;
  const caps = sc.captions ?? [sc.say];
  const total = caps.reduce((s, c) => s + weight(c), 0);
  let c0 = a0;
  const captions = caps.map((text) => {
    const c1 = c0 + ((a1 - a0) * weight(text)) / total;
    const c = { text, t0: +c0.toFixed(3), t1: +c1.toFixed(3) };
    c0 = c1;
    return c;
  });
  const pad = sc.pad ?? script.gap ?? 0.3;
  parts.push(pcm, new Int16Array(sec(pad)));
  cursor = a1 + sec(pad) / RATE;
  scenes.push({ id: sc.id, audio: [+a0.toFixed(3), +a1.toFixed(3)], captions });
}
parts.push(new Int16Array(sec(script.tail ?? 1)));
const duration = parts.reduce((s, p) => s + p.length, 0) / RATE;

// 絵のカットは「声の少し前」で切り替える（最初は 0 秒、最後は動画の終わりまで）
scenes.forEach((s, i) => {
  s.t0 = i === 0 ? 0 : +(s.audio[0] - 0.15).toFixed(3);
});
scenes.forEach((s, i) => {
  s.t1 = i === scenes.length - 1 ? +duration.toFixed(3) : scenes[i + 1].t0;
  // 字幕は次のカットの手前まで残す（最後の字幕の消え際だけ伸ばす）
  s.captions[s.captions.length - 1].t1 = s.t1;
});

const pcmAll = new Int16Array(parts.reduce((s, p) => s + p.length, 0));
let off = 0;
for (const p of parts) { pcmAll.set(p, off); off += p.length; }
writeWav(path.join(out, 'narration.wav'), pcmAll);
const timeline = { title: script.title, size: script.size, fps: script.fps, duration: +duration.toFixed(3), dry, scenes };
fs.writeFileSync(path.join(out, 'timeline.json'), JSON.stringify(timeline, null, 2));
for (const s of scenes) console.log(`${s.id.padEnd(10)} ${s.t0.toFixed(2).padStart(6)} → ${s.t1.toFixed(2).padStart(6)}  (${(s.t1 - s.t0).toFixed(2)}s)`);
console.log(`合計 ${duration.toFixed(2)}s${dry ? '（--dry: 無音の見積もり）' : ''} → out/narration.wav, out/timeline.json`);
