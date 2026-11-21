#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = ["faster-whisper", "pillow"]
# ///
"""mp3 の声を聞き取り、歌詞の行ごとの歌い出しの時刻を JSON に書き出す。

聞き取った文字と歌詞の文字を突き合わせ、合った所の時刻を行の時刻にする。
合う文字が無かった行は、前後の行の時刻から文字数で割り振る。
合った行には、歌い終わりの時刻も付ける。間奏で歌詞を止めるのに使う。
書き出した JSON は make_lyric_video.py の --timings に渡す。

    uv run align_lyrics.py 曲.mp3 -o timings.json
"""
import argparse
import difflib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_lyric_video import clean_lyrics, probe  # noqa: E402


def normalize(text):
    """突き合わせ用に、カタカナをひらがなに寄せ、記号と空白を落とす。"""
    out = []
    for ch in text.lower():
        code = ord(ch)
        if 0x30A1 <= code <= 0x30F6:
            ch = chr(code - 0x60)
        if re.match(r"[0-9a-zぁ-ゖー一-鿿]", ch):
            out.append(ch)
    return "".join(out)


def transcribe(mp3, model_name, prompt):
    import subprocess

    import numpy as np
    from faster_whisper import WhisperModel

    # 音は ffmpeg で読む。faster-whisper に mp3 を直接渡すと、中の PyAV の版によっては読めない
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", mp3, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
        capture_output=True, check=True,
    ).stdout
    audio = np.frombuffer(raw, dtype=np.float32)

    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, _ = model.transcribe(
        audio, language="ja", word_timestamps=True, initial_prompt=prompt,
        condition_on_previous_text=False, vad_filter=False, beam_size=5,
    )
    words = []
    for seg in segments:
        for w in seg.words or []:
            words.append({"text": w.word, "start": float(w.start), "end": float(w.end)})
    return words


def heard_chars(words):
    """聞き取った文字を 1 文字ずつ、時刻を付けて並べる。"""
    chars, times, ends = [], [], []
    for w in words:
        text = normalize(w["text"])
        for i, ch in enumerate(text):
            chars.append(ch)
            times.append(w["start"] + (w["end"] - w["start"]) * i / max(1, len(text)))
            ends.append(w["end"])
    return "".join(chars), times, ends


def align(lines, words, duration):
    heard, times, word_ends = heard_chars(words)
    norm = [normalize(line) for line in lines]
    starts, pos = [], 0
    for n in norm:
        starts.append(pos)
        pos += len(n)
    lyric = "".join(norm)
    total = max(1, len(lyric))

    # 歌詞の文字の位置 → 聞き取った時刻
    at, at_end = {}, {}
    matcher = difflib.SequenceMatcher(None, lyric, heard, autojunk=False)
    for a, b, size in matcher.get_matching_blocks():
        if size < 2:
            continue
        for k in range(size):
            at[a + k] = times[b + k]
            at_end[a + k] = word_ends[b + k]

    # 1 文字あたりの秒数。合った所の最初と最後から出す
    if len(at) >= 2:
        first, last = min(at), max(at)
        rate = (at[last] - at[first]) / max(1, last - first)
    else:
        rate = duration / total

    result = []
    for i, n in enumerate(norm):
        hits = [p for p in range(starts[i], starts[i] + len(n)) if p in at]
        if hits:
            p = hits[0]
            t = at[p] - (p - starts[i]) * rate
            # 歌い終わりの時刻。合った最後の文字が入っている単語の終わりに、残りの文字の分を足す
            q = hits[-1]
            end = at_end[q] + (starts[i] + len(n) - 1 - q) * rate
            result.append({"text": lines[i], "t": t, "end": end, "matched": True})
        else:
            result.append({"text": lines[i], "t": None, "end": None, "matched": False})

    # 合わなかった行は、前後の合った行の間を文字数で割り振る
    known = [i for i, r in enumerate(result) if r["matched"]]
    for i, r in enumerate(result):
        if r["matched"]:
            continue
        prev = max((k for k in known if k < i), default=None)
        nxt = min((k for k in known if k > i), default=None)
        if prev is not None and nxt is not None:
            span = max(1, starts[nxt] - starts[prev])
            ratio = (starts[i] - starts[prev]) / span
            r["t"] = result[prev]["t"] + (result[nxt]["t"] - result[prev]["t"]) * ratio
        elif prev is not None:
            r["t"] = result[prev]["t"] + (starts[i] - starts[prev]) * rate
        elif nxt is not None:
            r["t"] = result[nxt]["t"] - (starts[nxt] - starts[i]) * rate
        else:
            r["t"] = duration * starts[i] / total

    # 時刻が前の行より戻らないようにそろえる
    last_t = 0.0
    for r in result:
        r["t"] = round(min(duration, max(last_t, r["t"])), 2)
        last_t = r["t"]
        if r["end"] is not None:
            r["end"] = round(min(duration, max(r["t"], r["end"])), 2)
    return result, heard, times


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("mp3")
    p.add_argument("-o", "--out", required=True, help="書き出す JSON")
    p.add_argument("--lyrics", help="歌詞のテキストファイル。mp3 の歌詞より優先する")
    p.add_argument("--model", default="medium", help="faster-whisper のモデルの名前")
    p.add_argument("--words", help="聞き取った単語と時刻を、確かめ用に書き出す JSON")
    args = p.parse_args()

    meta = probe(args.mp3)
    text = meta["lyrics"]
    if args.lyrics:
        with open(args.lyrics, encoding="utf-8") as f:
            text = f.read()
    lines = clean_lyrics(text)
    if not any(lines):
        sys.exit("歌詞が無いので、時刻を合わせられない。")

    words = transcribe(args.mp3, args.model, " ".join(lines)[:200])
    if args.words:
        with open(args.words, "w", encoding="utf-8") as f:
            json.dump(words, f, ensure_ascii=False, indent=1)
    result, _, _ = align(lines, words, meta["duration"])
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"duration": meta["duration"], "lines": result}, f, ensure_ascii=False, indent=1)

    # 空行は歌わないので、画面にも数にも入れない
    sung = [r for r in result if r["text"]]
    hit = sum(1 for r in sung if r["matched"])
    for r in sung:
        end = f"{r['end']:7.2f}" if r["end"] is not None else "      -"
        print(f"{r['t']:7.2f} {end}  {'○' if r['matched'] else '×'}  {r['text']}")
    print(f"done: {args.out}  ({len(sung)} 行のうち {hit} 行が聞き取りと合った)")


if __name__ == "__main__":
    main()
