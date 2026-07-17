#!/usr/bin/env python3
"""スクリーンショットに「使い方ガイド」の注釈を重ねる。

英語UIの画面などに、番号付きの赤枠＋番号バッジを要素に重ね、下部に日本語の凡例
（番号→意味）パネルを描く。実データを隠したいときはモザイクもかけられる。

使い方: 先頭の「設定」だけ書き換えて実行する。
    python3 annotate.py
出力画像は必ず開いて、枠が要素に合っているか目で確認する（推定座標はズレる）。
ズレたら BOXES の数値を直して出し直す。必要: Pillow（pip install pillow）。

座標はすべて「元画像の実ピクセル」。Retina など高解像度ディスプレイのスクショは
表示の2倍あることが多いので、先に実寸を確認してから座標を決める:
    python3 -c "from PIL import Image; print(Image.open('SRC').size)"
"""
import os

from PIL import Image, ImageDraw, ImageFont

# ===== 設定: ここだけ書き換える ==========================================
SRC = "input.png"        # 元のスクリーンショット（絶対パス推奨）
OUT = "annotated.png"    # 出力先（入力と同じフォルダに置く）

# 日本語が出るフォントの候補（上から順に、最初に見つかったものを使う）。
# どれも無い環境では、手元の日本語フォントのパスを先頭に足す。
FONT_BOLD_CANDIDATES = [
    "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",         # macOS
    "C:/Windows/Fonts/meiryob.ttc",                            # Windows（メイリオ 太字）
    "C:/Windows/Fonts/YuGothB.ttc",                            # Windows（游ゴシック 太字）
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",     # Linux（Noto Sans CJK）
]
FONT_REG_CANDIDATES = [
    "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",         # macOS
    "C:/Windows/Fonts/meiryo.ttc",                             # Windows（メイリオ）
    "C:/Windows/Fonts/YuGothR.ttc",                            # Windows（游ゴシック）
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",  # Linux（Noto Sans CJK）
]


def _pick_font(candidates, kind):
    for p in candidates:
        if os.path.exists(p):
            return p
    raise SystemExit(
        f"日本語フォント（{kind}）が見つからない。"
        "FONT_BOLD_CANDIDATES / FONT_REG_CANDIDATES に手元の日本語フォントのパスを足す。"
    )


FB = _pick_font(FONT_BOLD_CANDIDATES, "太字")  # 見出し・バッジ
FR = _pick_font(FONT_REG_CANDIDATES, "本文")   # 本文

# 番号付きの枠 {番号: (x1, y1, x2, y2)}。画面の要素に重ねる（実ピクセル）。
BOXES = {
    # 1: (40, 180, 320, 240),
}

# 番号ごとの凡例。(番号, 見出し, 説明)。説明は \n で2行まで。平易な日本語で短く。
GUIDE = [
    # (1, "Datasets（データ一覧）", "登録したデータの一覧。\nここから中身を確認できる"),
]

# 凡例パネルの左上と幅 (x, y, width)。画面の空きスペース or 重要でない領域に置く。
PANEL = (400, 900, 1000)
PANEL_TITLE = "使い方ガイド（番号は画面の赤枠に対応）"

# 実データを隠すモザイク範囲 [(x1, y1, x2, y2), ...]（実ピクセル）。不要なら空。
MOSAIC = []
# ========================================================================

RED = (225, 29, 72, 255)
INK = (17, 24, 39, 255)

img = Image.open(SRC).convert("RGBA")


def fb(sz):
    return ImageFont.truetype(FB, sz)


def fr(sz):
    return ImageFont.truetype(FR, sz)


def mosaic(box, block=24):
    x1, y1, x2, y2 = box
    r = img.crop(box)
    small = r.resize((max(1, (x2 - x1) // block), max(1, (y2 - y1) // block)), Image.BILINEAR)
    img.paste(small.resize(r.size, Image.NEAREST), (x1, y1))


for b in MOSAIC:
    mosaic(b)

ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
d = ImageDraw.Draw(ov)


def badge(cx, cy, n, r, sz):
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=RED, outline=(255, 255, 255, 255), width=3)
    tb = d.textbbox((0, 0), str(n), font=fb(sz))
    d.text((cx - (tb[2] - tb[0]) / 2 - tb[0], cy - (tb[3] - tb[1]) / 2 - tb[1]),
           str(n), font=fb(sz), fill=(255, 255, 255, 255))


# 枠 + 角の番号バッジ
for n, (x1, y1, x2, y2) in BOXES.items():
    d.rounded_rectangle((x1, y1, x2, y2), radius=12, outline=RED, width=5)
    badge(x1, y1, n, 30, 34)

# 凡例パネル（2列）
if GUIDE:
    px, py, pw = PANEL
    n_left = (len(GUIDE) + 1) // 2
    row_h = 132
    ph = 108 + n_left * row_h
    d.rounded_rectangle((px, py, px + pw, py + ph), radius=18,
                        fill=(255, 255, 255, 244), outline=RED, width=5)
    d.text((px + 44, py + 30), PANEL_TITLE, font=fb(46), fill=INK)
    col_x = [px + 44, px + pw // 2 + 20]
    col_y = py + 108
    for i, (n, head, body) in enumerate(GUIDE):
        col = 0 if i < n_left else 1
        row = i if i < n_left else i - n_left
        x = col_x[col]
        y = col_y + row * row_h
        badge(x + 20, y + 20, n, 22, 28)
        d.text((x + 56, y - 4), head, font=fb(34), fill=(185, 28, 28, 255))
        d.multiline_text((x + 56, y + 44), body, font=fr(29), fill=(31, 41, 55, 255), spacing=7)

Image.alpha_composite(img, ov).convert("RGB").save(OUT)
print("saved", OUT, img.size)
