# /// script
# requires-python = ">=3.9"
# dependencies = ["fugashi", "unidic-lite"]
# ///
"""歌詞の行の終わりの母音を出して、前の行と何個そろっているかを数える。
行の中の韻も数える。空白で区切った言葉どうしで、終わりどうしと頭どうしの母音が何個そろうかを見る。

漢字の読みは fugashi（辞書は unidic-lite）で、前後の言葉を見て付ける。
読みを間違えることがあるので、出てきた「よみ」も見る。

数え方は references/rhyme-patterns.md の「母音の数え方」に合わせている。
  - 小さい「ゃゅょぁぃぅぇぉ」は、前の字と合わせて 1 つ。母音は小さい字のほう
  - 「ー」は、前の母音をもう 1 回
  - 「っ」「ん」は母音が無いので、そろっているかを数えるときは飛ばす

[Verse 1] のようなタグの行は飛ばす。空行で区切った塊の中で、前の行と比べる。

使い方:
  uv run scripts/check_rhyme.py 歌詞.txt
  pbpaste | uv run scripts/check_rhyme.py
"""
import argparse
import re
import sys

from fugashi import Tagger

# 行の終わりの母音が、前の行といくつ以上そろえば「踏んでいる」とするか
RHYME_MIN = 3
# 表に出す、行の終わりの母音の数
SHOW_LAST = 6

VOWEL_ROWS = {
    "a": "あかさたなはまやらわがざだばぱ",
    "i": "いきしちにひみりぎじぢびぴ",
    "u": "うくすつぬふむゆるぐずづぶぷゔ",
    "e": "えけせてねへめれげぜでべぺ",
    "o": "おこそとのほもよろをごぞどぼぽ",
}
VOWEL_OF = {ch: v for v, chars in VOWEL_ROWS.items() for ch in chars}
SMALL = {"ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o",
         "ゃ": "a", "ゅ": "u", "ょ": "o", "ゎ": "a"}

tagger = Tagger()


def to_hira(text):
    """行をひらがなの読みにする。かな以外の記号や空白は落とす。"""
    kana = "".join(word.feature.kana or word.surface for word in tagger(text))
    # カタカナをひらがなにする
    hira = "".join(chr(ord(ch) - 0x60) if "ァ" <= ch <= "ヶ" else ch for ch in kana)
    return re.sub(r"[^ぁ-ゖー]", "", hira)


def to_vowels(hira):
    """ひらがなを、母音の並びにする。「っ」は Q、「ん」は N で残す。"""
    out = []
    for ch in hira:
        if ch in SMALL and out and out[-1] not in "QN":
            out[-1] = SMALL[ch]
        elif ch in SMALL:
            out.append(SMALL[ch])
        elif ch == "ー" and out and out[-1] not in "QN":
            out.append(out[-1])
        elif ch == "っ":
            out.append("Q")
        elif ch == "ん":
            out.append("N")
        elif ch in VOWEL_OF:
            out.append(VOWEL_OF[ch])
    return out


def match_count(a, b):
    """2 つの母音の並びが、終わりから何個そろっているかを数える。「っ」「ん」は飛ばす。"""
    a = [v for v in a if v not in "QN"]
    b = [v for v in b if v not in "QN"]
    n = 0
    while n < min(len(a), len(b)) and a[-1 - n] == b[-1 - n]:
        n += 1
    return n


def head_count(a, b):
    """2 つの母音の並びが、頭から何個そろっているかを数える。「っ」「ん」は飛ばす。"""
    a = [v for v in a if v not in "QN"]
    b = [v for v in b if v not in "QN"]
    n = 0
    while n < min(len(a), len(b)) and a[n] == b[n]:
        n += 1
    return n


def inner_count(line):
    """行を空白で区切り、言葉どうしで母音がいちばん多くそろう数を返す。終わりどうしと、頭どうしの両方を見る。"""
    segs = [to_vowels(to_hira(seg)) for seg in line.split()]
    best = 0
    for i in range(len(segs)):
        for j in range(i + 1, len(segs)):
            best = max(best, match_count(segs[i], segs[j]), head_count(segs[i], segs[j]))
    return best


def read_blocks(lines):
    """タグの行を飛ばし、空行で区切った塊のリストにする。"""
    blocks, cur = [], []
    for raw in lines:
        line = raw.strip()
        if line.startswith("["):
            continue
        if not line:
            if cur:
                blocks.append(cur)
            cur = []
            continue
        cur.append(line)
    if cur:
        blocks.append(cur)
    return blocks


def main():
    parser = argparse.ArgumentParser(description="歌詞の行の終わりの母音を数える")
    parser.add_argument("file", nargs="?", help="歌詞のファイル。無ければ標準入力から読む")
    args = parser.parse_args()

    if args.file:
        with open(args.file, encoding="utf-8") as f:
            lines = f.read().splitlines()
    else:
        lines = sys.stdin.read().splitlines()

    hits = 0
    inner_hits = 0
    total = 0
    for block in read_blocks(lines):
        prev = None
        for line in block:
            hira = to_hira(line)
            vowels = to_vowels(hira)
            tail = "".join(vowels[-SHOW_LAST:])
            if prev is None:
                mark = ""
            else:
                n = match_count(prev, vowels)
                mark = f"前の行と {n}"
                if n >= RHYME_MIN:
                    mark += " ◎"
                    hits += 1
            m = inner_count(line)
            inner = f"行の中 {m}" + (" ◎" if m >= RHYME_MIN else "")
            if m >= RHYME_MIN:
                inner_hits += 1
            total += 1
            print(f"{line}\n    よみ: {hira}  終わり: {tail}  {mark}  {inner}")
            prev = vowels
        print()
    print(f"前の行と母音が {RHYME_MIN} 個以上そろった行: {hits} / {total}")
    print(f"行の中で母音が {RHYME_MIN} 個以上そろった行: {inner_hits} / {total}")


if __name__ == "__main__":
    main()
