#!/usr/bin/env python3
"""mp3 から、ジャケット・動く背景・波形・歌詞スクロールの縦動画を作る。

静止画（背景、曲名とジャケット、歌詞の縦長画像、薄くするマスク）を Pillow で作り、
動き（背景の揺れ、波形、歌詞のスクロール）は ffmpeg のフィルタで付ける。
歌詞が無い mp3 では、ジャケットを大きく出して波形だけを動かす。
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

W, H = 1080, 1920
SUNG_ROW = 2  # 歌っている行を、歌詞の窓の上から何段目に置くか（0 がいちばん上）
PAUSE_SEC = 4.0  # 歌い終わりから次の歌い出しまでがこの秒数より長いと、間奏とみなして歌詞を止める
FONT_CANDIDATES = {
    "bold": [
        "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "C:/Windows/Fonts/meiryob.ttc",
    ],
    "regular": [
        "/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "C:/Windows/Fonts/meiryo.ttc",
    ],
}


def find_font(kind, override):
    if override:
        return override
    for path in FONT_CANDIDATES[kind]:
        if os.path.exists(path):
            return path
    sys.exit(f"日本語フォントが見つからない。--font-{kind} で指定してほしい。")


def probe(mp3):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", mp3],
        capture_output=True, text=True, check=True,
    ).stdout
    info = json.loads(out)
    tags = {k.lower(): v for k, v in info["format"].get("tags", {}).items()}
    lyrics = next((v for k, v in tags.items() if k.startswith("lyrics")), "")
    has_cover = any(s.get("codec_type") == "video" for s in info["streams"])
    return {
        "duration": float(info["format"]["duration"]),
        "title": tags.get("title", os.path.splitext(os.path.basename(mp3))[0]),
        "artist": tags.get("artist", ""),
        "lyrics": lyrics,
        "has_cover": has_cover,
    }


def clean_lyrics(text):
    """[Verse 1] や [soft chords] のような、歌わない括弧の行を外す。"""
    lines = []
    for raw in text.replace("\r", "").split("\n"):
        line = raw.strip()
        if re.fullmatch(r"\[.*\]", line):
            continue
        if not line and (not lines or not lines[-1]):
            continue
        lines.append(line)
    while lines and not lines[-1]:
        lines.pop()
    return lines


def wrap(line, font, max_w):
    if not line or font.getlength(line) <= max_w:
        return [line]
    rows, cur = [], ""
    for ch in line:
        if font.getlength(cur + ch) > max_w and cur:
            rows.append(cur.rstrip())
            cur = ch.lstrip()
        else:
            cur += ch
    rows.append(cur)
    return rows


def load_cover(mp3, tmp):
    path = os.path.join(tmp, "cover.png")
    r = subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", mp3, "-an", "-frames:v", "1", path],
        capture_output=True,
    )
    if r.returncode != 0 or not os.path.exists(path):
        return None
    return Image.open(path).convert("RGB")


def make_background(cover, path):
    """blur の背景。ジャケットを縦長に引き伸ばして強くぼかし、少し暗くする。動かす余白のため画面より大きく作る。"""
    bw, bh = W + 600, H + 800
    if cover is None:
        img = Image.new("RGB", (bw, bh), (40, 40, 52))
    else:
        # 小さく縮めてから引き伸ばすと、ジャケットの色がにじんだ大きな色の塊になる
        small = cover.resize((6, 10), Image.BOX)
        img = small.resize((bw, bh), Image.BICUBIC).filter(ImageFilter.GaussianBlur(60))
        img = ImageEnhance.Color(img).enhance(1.35)
        img = ImageEnhance.Brightness(img).enhance(0.78)
    img.save(path)


def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *img.size), radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def center_text(draw, y, text, font, fill):
    w = font.getlength(text)
    draw.text(((W - w) / 2, y), text, font=font, fill=fill)


def make_foreground(meta, cover, fonts, path, cover_size, top):
    """曲名、アーティスト名、ジャケットを載せた透明な画像。"""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    title_font = ImageFont.truetype(fonts["bold"], 64)
    artist_font = ImageFont.truetype(fonts["regular"], 32)
    y = top
    for row in wrap(meta["title"], title_font, W - 160):
        center_text(draw, y, row, title_font, (255, 255, 255, 255))
        y += 84
    if meta["artist"]:
        center_text(draw, y + 4, f"by {meta['artist']}", artist_font, (255, 255, 255, 215))
        y += 60
    y += 40
    if cover is not None:
        c = rounded(cover.resize((cover_size, cover_size), Image.LANCZOS), 18)
        shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle(
            ((W - cover_size) // 2, y + 12, (W + cover_size) // 2, y + 12 + cover_size), 18,
            fill=(0, 0, 0, 110),
        )
        img = Image.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(18)), img)
        img.alpha_composite(c, ((W - cover_size) // 2, y))
        y += cover_size
    img.save(path)
    return y


def make_lyrics_strip(lines, font_path, path, win_h, line_h, font_size):
    """歌詞を白黒の縦長画像にする。白い所が文字。前後に空白を足して、最初と最後も窓の中を通るようにする。

    返すのは、画像の高さ、上の空白の高さ、歌詞の各行が画像の何段目から始まるか。
    """
    font = ImageFont.truetype(font_path, font_size)
    rows, row_starts = [], []
    for line in lines:
        row_starts.append(len(rows))
        rows.extend(wrap(line, font, W - 140))
    pad_top = win_h - line_h * 2
    pad_bottom = line_h * 2
    strip_h = pad_top + line_h * len(rows) + pad_bottom
    img = Image.new("L", (W, strip_h), 0)
    draw = ImageDraw.Draw(img)
    y = pad_top
    for row in rows:
        if row:
            w = font.getlength(row)
            draw.text(((W - w) / 2, y + (line_h - font_size) / 2 - 4), row, font=font, fill=255)
        y += line_h
    img.save(path)
    return strip_h, pad_top, row_starts


def scroll_expr(lines, row_starts, pad_top, line_h, scroll, dur, timings, start=None, end=None, even=False):
    """歌詞の画像を切り出す縦の位置を、時刻 t の式で返す。

    歌っている行が、窓の上から SUNG_ROW 段目に来るようにする。
    timings があれば、行ごとの歌い出しの時刻に合わせて、行と行の間をまっすぐつなぐ。
    even も付いていれば、最初の行と最後の行の歌い出しだけを使い、その間を一定の速さで流す。
    どちらでも、間奏の間は歌詞を止める。even では、間奏で区切った区間ごとに一定の速さで流す。
    timings が無ければ、start 秒から end 秒までを一定の速さで流す。start より前は動かない。
    """
    lead = pad_top - SUNG_ROW * line_h
    if not timings:
        s = 0.0 if start is None else start
        e = dur if end is None else end
        if e <= s:
            sys.exit(f"--end（{e}）は --start（{s}）より後の秒にしてほしい。")
        return f"min({scroll},max(0,{lead}+clip((t-{s:.2f})/{e - s:.2f},0,1)*{scroll}))"
    if len(timings) != len(lines):
        sys.exit(f"時刻の行数（{len(timings)}）が歌詞の行数（{len(lines)}）と合わない。同じ歌詞で時刻を作り直してほしい。")
    sung = []
    for line, row, item in zip(lines, row_starts, timings):
        t = float(item["t"])
        if line and (not sung or t > sung[-1][0]):
            sung.append((t, lead + row * line_h, item.get("end")))
    # 歌い終わりから次の歌い出しまでが PAUSE_SEC 秒より長い所は、間奏とみなす。
    # 歌い終わりまでに次の行を定位置に送り、次の歌い出しまで止める。
    # parts は、間奏で区切った、止まらずに流れる区間の並び
    parts = [[]]
    for i, (t, y, end) in enumerate(sung):
        parts[-1].append((t, y))
        if i + 1 < len(sung) and end is not None:
            t1, y1 = sung[i + 1][0], sung[i + 1][1]
            if t1 - float(end) > PAUSE_SEC and float(end) > t:
                parts[-1].append((float(end), y1))
                parts.append([])
    if even:
        parts = [[part[0], part[-1]] if len(part) > 2 else part for part in parts]
    keys = [key for part in parts for key in part]
    expr = str(keys[0][1])
    for (t0, y0), (t1, y1) in zip(keys, keys[1:]):
        expr += f"+{y1 - y0}*clip((t-{t0:.2f})/{t1 - t0:.2f},0,1)"
    return f"min({scroll},max(0,{expr}))"


def make_mask(win_h, line_h, path):
    """窓の上端と下端で文字が消えていくマスク。下端は長めに薄くして、次の行が見えるようにする。"""
    img = Image.new("L", (W, win_h), 255)
    px = img.load()
    for y in range(win_h):
        if y < line_h:
            v = int(255 * (y / line_h) ** 1.4)
        elif y > win_h - line_h * 1.5:
            v = int(255 * (1 - (y - (win_h - line_h * 1.5)) / (line_h * 1.5)) ** 0.8)
        else:
            v = 255
        for x in range(W):
            px[x, y] = v
    img.save(path)


def palette(cover, n=4):
    """ジャケットで多く使われている色を、多い順に返す。"""
    if cover is None:
        return [(60, 60, 80), (20, 20, 30)]
    q = cover.resize((120, 120)).quantize(n)
    pal = q.getpalette()
    counts = sorted(q.getcolors(), reverse=True)
    return [tuple(pal[i * 3:i * 3 + 3]) for _, i in counts]


def dim(c, k):
    return tuple(int(v * k) for v in c)


def bg_layer(style, cover, tmp, fps):
    """背景の入力（ffmpeg の引数）と、[bg] を作るフィルタを返す。"""
    path = os.path.join(tmp, "bg.png")
    loop = ["-loop", "1", "-framerate", str(fps), "-i", path]
    cols = palette(cover)
    if style == "blur":
        make_background(cover, path)
        bgw, bgh = W + 600, H + 800
        return loop, [f"[1:v]crop={W}:{H}:x='{(bgw - W) // 2}+280*sin(t*0.11)':"
                      f"y='{(bgh - H) // 2}+380*sin(t*0.07+1.3)',setsar=1[bg]"]
    if style == "grain":
        # ジャケットの2色で上から下へのグラデーション。フィルムの粒を毎フレーム変えて乗せる
        top, bottom = dim(cols[0], 0.8), dim(cols[1], 0.35)
        img = Image.new("RGB", (W, H))
        d = ImageDraw.Draw(img)
        for y in range(H):
            r = y / H
            d.line([(0, y), (W, y)], fill=tuple(int(a + (b - a) * r) for a, b in zip(top, bottom)))
        img.save(path)
        return loop, ["[1:v]format=yuv420p,noise=alls=18:allf=t+u,setsar=1[bg]"]
    if style == "dots":
        # ジャケットを縦横のマス目に縮め、1マスを1つの丸い点にする。ゆっくり上に流れる
        # 点の模様は cols_n 行ごとに繰り返すので、その 1 周ぶんを足した高さで作ると切れ目なく流せる
        cell = 60
        cols_n = W // cell
        rows_n = (H + cols_n * cell) // cell
        side = cover.width if cover else 1
        src = (cover or Image.new("RGB", (1, 1), cols[0])).crop(
            (0, 0, side, side)).resize((cols_n, cols_n), Image.BOX)
        img = Image.new("RGB", (W, rows_n * cell), (12, 12, 16))
        d = ImageDraw.Draw(img)
        for gy in range(rows_n):
            for gx in range(cols_n):
                c = dim(src.getpixel((gx, gy % cols_n)), 0.38)
                cx, cy = gx * cell + cell // 2, gy * cell + cell // 2
                d.ellipse((cx - 22, cy - 22, cx + 22, cy + 22), fill=c)
        img.save(path)
        per = cols_n * cell
        return loop, [f"[1:v]crop={W}:{H}:0:'mod(t*12,{per})',setsar=1[bg]"]
    if style == "tiles":
        # 小さなジャケットを並べて、斜めにゆっくり流す
        size, gap = 260, 40
        per = size + gap
        img = Image.new("RGB", (W + per, H + per), dim(cols[0], 0.2))
        tile = ImageEnhance.Brightness(cover.resize((size, size), Image.LANCZOS)).enhance(0.24) if cover else None
        for y in range(0, H + per, per):
            for x in range(0, W + per, per):
                if tile:
                    img.paste(tile, (x + gap // 2, y + gap // 2))
        img.save(path)
        return loop, [f"[1:v]crop={W}:{H}:'mod(t*14,{per})':'mod(t*14,{per})',setsar=1[bg]"]
    sys.exit(f"背景の種類が分からない: {style}")


def shrink(path, max_mb, dur, tmp):
    """動画が max_mb より大きいときに、max_mb のすぐ下に収まるように映像を圧縮し直す。

    1MB は 1,000,000 バイトで数える。投稿先が 1,048,576 バイトで数えていても、上限を超えない。
    映像のビットレートを決めて 2 回通しで書き出す。音はそのまま写す。
    """
    limit = max_mb * 1_000_000
    size = os.path.getsize(path)
    if size <= limit:
        print(f"{size / 1e6:.1f}MB で、{max_mb:g}MB 以下なので圧縮しない")
        return
    out = os.path.join(tmp, "small.mp4")
    log = os.path.join(tmp, "pass")
    target = limit * 0.99
    for _ in range(3):
        # 音（192k）と mp4 の入れ物の分を引いた残りを、映像に使う
        v_kbps = int(target * 8 / dur / 1000 - 192 - 12)
        if v_kbps < 300:
            sys.exit(f"{max_mb:g}MB に収めるには映像が粗くなりすぎる。上限を上げてほしい。")
        base = ["ffmpeg", "-v", "error", "-y", "-i", path, "-c:v", "libx264", "-preset", "slow",
                "-b:v", f"{v_kbps}k", "-passlogfile", log]
        subprocess.run(base + ["-pass", "1", "-an", "-f", "mp4", os.devnull], check=True)
        subprocess.run(base + ["-pass", "2", "-pix_fmt", "yuv420p", "-c:a", "copy",
                               "-movflags", "+faststart", out], check=True)
        small = os.path.getsize(out)
        if small <= limit:
            shutil.move(out, path)
            print(f"圧縮した: {size / 1e6:.1f}MB → {small / 1e6:.1f}MB")
            return
        target *= limit / small * 0.99
    sys.exit(f"{max_mb:g}MB に収まらなかった。")


def build(args):
    meta = probe(args.mp3)
    if args.title:
        meta["title"] = args.title
    if args.artist is not None:
        meta["artist"] = args.artist
    if args.lyrics:
        with open(args.lyrics, encoding="utf-8") as f:
            meta["lyrics"] = f.read()
    lines = [] if args.no_lyrics else clean_lyrics(meta["lyrics"])
    has_lyrics = any(lines)
    fonts = {"bold": find_font("bold", args.font_bold), "regular": find_font("regular", args.font_regular)}
    dur = meta["duration"]
    fps = args.fps

    with tempfile.TemporaryDirectory() as tmp:
        if args.cover:
            cover = Image.open(args.cover).convert("RGB")
        else:
            cover = load_cover(args.mp3, tmp) if meta["has_cover"] else None
        fg = os.path.join(tmp, "fg.png")
        bg_inputs, bg_graph = bg_layer(args.bg, cover, tmp, fps)

        inputs = ["-i", args.mp3, *bg_inputs, "-loop", "1", "-framerate", str(fps), "-i", fg]
        graph = list(bg_graph)

        if has_lyrics:
            cover_bottom = make_foreground(meta, cover, fonts, fg, 440, 300)
            line_h, font_size, n_lines = 70, 42, 6
            win_h = line_h * n_lines
            win_y = cover_bottom + 50
            wave_y = win_y + win_h - 60
            strip, mask = os.path.join(tmp, "lyrics.png"), os.path.join(tmp, "mask.png")
            strip_h, pad_top, row_starts = make_lyrics_strip(lines, fonts["bold"], strip, win_h, line_h, font_size)
            make_mask(win_h, line_h, mask)
            inputs += ["-loop", "1", "-framerate", str(fps), "-i", strip,
                       "-loop", "1", "-framerate", str(fps), "-i", mask]
            scroll = strip_h - win_h
            timings = None
            if args.timings:
                with open(args.timings, encoding="utf-8") as f:
                    timings = json.load(f)["lines"]
            y_expr = scroll_expr(lines, row_starts, pad_top, line_h, scroll, dur, timings,
                                 start=args.start, end=args.end, even=args.even)
            graph += [
                f"[0:a]showwaves=s={W}x{H - wave_y - 120}:mode=cline:scale=sqrt:rate={fps}:"
                f"colors=white@0.32,format=rgba[wv]",
                "[bg][wv]overlay=0:" + str(wave_y) + "[b1]",
                "[b1][2:v]overlay=0:0[b2]",
                f"[3:v]crop={W}:{win_h}:0:'{y_expr}',format=gray[lw]",
                "[4:v]format=gray[mk]",
                "[lw][mk]blend=all_mode=multiply[al]",
                f"color=white:s={W}x{win_h}:r={fps}[wc]",
                "[wc][al]alphamerge[ly]",
                f"[b2][ly]overlay=0:{win_y}[v]",
            ]
        else:
            cover_bottom = make_foreground(meta, cover, fonts, fg, 760, 260)
            wave_y = cover_bottom + 80
            graph += [
                f"[0:a]showwaves=s={W}x{min(520, H - wave_y - 120)}:mode=cline:scale=sqrt:rate={fps}:"
                f"colors=white@0.45,format=rgba[wv]",
                "[bg][2:v]overlay=0:0[b1]",
                f"[b1][wv]overlay=0:{wave_y}[v]",
            ]

        cmd = ["ffmpeg", "-v", "error", "-stats", "-y", *inputs, "-filter_complex", ";".join(graph)]
        if args.preview is not None:
            # 出力側で読み飛ばすので、背景の揺れや歌詞の位置は本番と同じ時刻の絵になる
            cmd += ["-map", "[v]", "-ss", str(args.preview), "-frames:v", "1", "-update", "1", args.out]
        else:
            cmd += ["-map", "[v]", "-map", "0:a", "-t", f"{dur:.3f}",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
                    "-r", str(fps), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
                    args.out]
        subprocess.run(cmd, check=True)
        if args.max_mb and args.preview is None:
            shrink(args.out, args.max_mb, dur, tmp)
    print(f"done: {args.out}  (歌詞 {'あり' if has_lyrics else 'なし'}, {dur:.1f} 秒)")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("mp3")
    p.add_argument("-o", "--out", required=True, help="出力する mp4（--preview のときは png）")
    p.add_argument("--lyrics", help="歌詞のテキストファイル。mp3 の歌詞より優先する")
    p.add_argument("--timings", help="align_lyrics.py が書き出した、行ごとの歌い出しの時刻の JSON。歌詞を声に合わせて流す")
    p.add_argument("--even", action="store_true",
                   help="--timings と一緒に使う。イントロが終わって最初の行を歌い出す秒から、最後の行を歌い出す秒までを、一定の速さで流す")
    p.add_argument("--start", type=float, metavar="SEC",
                   help="--timings を使わないとき、歌詞を流し始める秒。イントロの長さを入れる")
    p.add_argument("--end", type=float, metavar="SEC",
                   help="--timings を使わないとき、歌詞を流し終える秒。指定が無ければ曲の終わり")
    p.add_argument("--no-lyrics", action="store_true", help="歌詞を出さず、ジャケットを大きく出す")
    p.add_argument("--title", help="曲名を上書きする")
    p.add_argument("--cover", help="ジャケットにする画像。mp3 に入っているジャケットより優先する")
    p.add_argument("--artist", default="musoukun",
                   help="「by 〜」に出す名前。初期値は musoukun で、mp3 のタグの名前は使わない。空文字で非表示")
    p.add_argument("--fps", type=int, default=30)
    p.add_argument("--max-mb", type=float, metavar="MB",
                   help="動画がこの大きさを超えたら、すぐ下に収まるように圧縮し直す。50MB までの投稿先なら 49 を渡す")
    p.add_argument("--bg", default="dots", choices=["dots", "grain", "blur", "tiles"],
                   help="背景。dots=色の点（初期値）、grain=2色グラデ＋粒子、blur=ぼかし、tiles=ジャケットを並べる")
    p.add_argument("--font-bold")
    p.add_argument("--font-regular")
    p.add_argument("--preview", type=float, metavar="SEC", help="指定秒の1枚だけを png で書き出す")
    build(p.parse_args())


if __name__ == "__main__":
    main()
