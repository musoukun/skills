# /// script
# requires-python = ">=3.9"
# dependencies = ["fugashi", "unidic-lite", "e2k"]
# ///
"""歌詞の韻を、口で言ったときの音で数える。

字ではなく、ラップで口に出したときの音で数える。数え方は references/rhyme-patterns.md の「母音の数え方」。
  - 日本語の読みは、辞書の発音の欄を使う。伸ばす音は「ー」になる（「そう」は「そー」、「思う」は「おもう」）
  - 「ー」「ん」「っ」は飛ばす
  - 英字の英語は、e2k で発音のカタカナにする。語の終わりの子音に付く「ク」「ト」「ズ」などは飛ばす（「Respect」は「りすぺ」）
  - カタカナで書いた外来語は、字のとおりに数える（「リスペクト」は「りすぺくと」）
  - 半角の数字は、漢数字にしてから読む

英語のつなげ読みや、わざと崩した言い方は、字からは分からない。
そういう行は、歌詞の後ろに「｜」を置いて、口で言う読みをひらがなで書く。伸ばす音は「ー」で書き、言葉の切れ目には空白を入れる。
  Rap Boys｜らっ ぼーい

数えるものは 3 つ。韻は、言葉の終わり（空白の前か、行の終わり）で止まるものだけを数える。
  - 終わり: 前の行と、行の終わりから母音がいくつそろっているか。3 個以上に ◎
  - 長い韻: 3 行前までの行と、言葉の終わりどうしで、母音が続けていちばん長くそろう所。5 個以上に ★
  - 行の中: 同じ行の中の言葉の終わりどうしで、母音が続けていちばん長くそろう所。3 個以上に ◎

読みは間違えることがあるので、出てきた「よみ」を見る。おかしければ「｜」で読みを書く。

[Verse 1] のようなタグの行は飛ばす。空行で区切った塊の中で、前の行と比べる。

使い方:
  uv run scripts/check_rhyme.py 歌詞.txt
  pbpaste | uv run scripts/check_rhyme.py
  uv run scripts/check_rhyme.py --words バンズ ディッキーズ 大谷翔平 --target たきざわしんすけ
      言葉ごとの読みと母音を出す。--target を付けると、その読みと長くそろう順に並べる
"""
import argparse
import re
import sys

from fugashi import Tagger

RHYME_MIN = 3  # 「踏んでいる」とする、そろった母音の数
LONG_MIN = 5   # 「長い韻」とする、そろった母音の数
LOOK_BACK = 3  # 長い韻を探す、さかのぼる行の数
SEP = re.compile(r"[｜|]")

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
# 英語の語の終わりの子音に付く音。口で言うとほとんど聞こえない
EPENTHETIC = set("くぐすずとどぷぶふつちじ")
# e2k がうまく読めない、くだけた英語の読み
SLANG = {
    "yeah": "いぇー", "yo": "よー", "gonna": "がな", "wanna": "わな", "gotta": "がら",
    "whatcha": "わっちゃ", "do": "どぅ", "the": "ざ", "a": "あ", "i": "あい", "we": "うぃー",
    "uh": "あ", "huh": "は", "ok": "おーけー", "okay": "おーけー", "money": "まにー",
}

_tagger = None
_c2k = None


def tagger():
    global _tagger
    if _tagger is None:
        _tagger = Tagger()
    return _tagger


def kata_to_hira(text):
    return "".join(chr(ord(ch) - 0x60) if "ァ" <= ch <= "ヶ" else ch for ch in text)


def english_kana(word):
    """英語の 1 語を、発音のひらがなにする"""
    global _c2k
    low = word.lower()
    if low in SLANG:
        return SLANG[low]
    if _c2k is None:
        from e2k import C2K
        _c2k = C2K()
    return kata_to_hira(_c2k(low))


def trailing_consonants(word):
    """英語の語の終わりにある、子音の字の数。黙字の e は飛ばす"""
    w = word.lower()
    if len(w) > 2 and w.endswith("e") and w[-2] not in "aeiouy":
        w = w[:-1]
    n = 0
    while n < len(w) and w[-1 - n] not in "aeiouy":
        n += 1
    return n


def morae(hira):
    """ひらがなを 1 音ずつに分ける。[かな, 母音, 飛ばす音か, 言葉の終わりか, 言葉の頭か]"""
    out = []
    for ch in hira:
        prev_v = out[-1][1] if out else None
        if ch in SMALL and out and out[-1][1] is not None and not out[-1][2]:
            out[-1][0] += ch
            out[-1][1] = SMALL[ch]
        elif ch in SMALL:
            out.append([ch, SMALL[ch], False, False, False])
        elif ch == "ー":
            out.append([ch, prev_v, True, False, False])
        elif ch in "っん":
            out.append([ch, None, True, False, False])
        elif ch in VOWEL_OF:
            out.append([ch, VOWEL_OF[ch], False, False, False])
    return out


def drop_epenthetic(ms, budget):
    """英語の語の終わりの「ク」「ト」「ズ」などを、budget 個まで飛ばす音にする"""
    for m in reversed(ms):
        if budget == 0:
            break
        if m[2]:
            continue
        if m[0] in EPENTHETIC:
            m[2] = True
            budget -= 1
        else:
            break
    return ms


DIGITS = "〇一二三四五六七八九"


def to_kanji_number(m):
    """半角の数字を、読める漢数字にする（9999 まで。それより大きい数は 1 字ずつ）"""
    s = m.group()
    n = int(s)
    if n == 0 or n > 9999:
        return "".join(DIGITS[int(c)] for c in s)
    out = ""
    for value, unit in ((1000, "千"), (100, "百"), (10, "十"), (1, "")):
        q, n = divmod(n, value)
        if q:
            out += ("" if q == 1 and unit else DIGITS[q]) + unit
    return out


def word_morae(text):
    """空白の無いひとかたまりを 1 音ずつに分ける。英語は発音に直す"""
    out = []
    text = re.sub(r"[0-9]+", to_kanji_number, text)
    for part in re.findall(r"[A-Za-z']+|[^A-Za-z']+", text):
        word = part.replace("'", "")
        if re.match(r"[A-Za-z]", word):
            ms = morae(english_kana(word))
            if word.lower() not in SLANG:
                drop_epenthetic(ms, min(2, trailing_consonants(word)))
            out += ms
            continue
        for w in tagger()(part):
            pron = w.feature.pron if w.feature.pron not in (None, "*") else None
            kana = pron or w.feature.kana or w.surface
            out += morae(re.sub(r"[^ぁ-ゖー]", "", kata_to_hira(kana)))
    return out


def mark_edges(ms):
    """飛ばさない音のうち、いちばん前の音に「言葉の頭」、いちばん後ろの音に「言葉の終わり」の印を付ける"""
    kept = [m for m in ms if not m[2] and m[1]]
    if kept:
        kept[0][4] = True
        kept[-1][3] = True
    return ms


def parse(line):
    """歌詞の行を (歌詞, 音の並び, 読みを書いたか) にする。空白で区切ったかたまりごとに、言葉の頭と終わりの印を付ける"""
    parts = SEP.split(line, maxsplit=1)
    lyric = parts[0].strip()
    if len(parts) == 2 and parts[1].strip():
        chunks = [morae(re.sub(r"[^ぁ-ゖー]", "", kata_to_hira(c))) for c in parts[1].split()]
        has_reading = True
    else:
        chunks = [word_morae(c) for c in lyric.split()]
        has_reading = False
    ms = []
    for c in chunks:
        ms += mark_edges(c)
    return lyric, ms, has_reading


def show_reading(ms):
    """読みを出す。英語の飛ばした音は（）で囲む"""
    return "".join(f"({m[0]})" if m[2] and m[0] in EPENTHETIC else m[0] for m in ms)


def core(ms):
    """飛ばす音を除いた、(元の位置, 母音, 言葉の終わりか, 言葉の頭か) の並び"""
    return [(i, m[1], m[3], m[4]) for i, m in enumerate(ms) if not m[2] and m[1]]


def span(ms, cs, start, length):
    """core の start から length 個の母音にあたる、元のかなを返す"""
    a, b = cs[start][0], cs[start + length - 1][0]
    return show_reading(ms[a:b + 1])


def end_count(a, b):
    """2 つの行が、終わりから母音をいくつそろえているか"""
    a, b = [c[1] for c in core(a)], [c[1] for c in core(b)]
    n = 0
    while n < min(len(a), len(b)) and a[-1 - n] == b[-1 - n]:
        n += 1
    return n


def best_match(ca, cb, same_line):
    """母音がそろう所のうち、いちばん長いものを (数, a の開始, b の開始) で返す。
    数えるのは、言葉の終わりどうしで止まる所（脚韻）と、言葉の頭どうしから始まる所（頭韻）だけ。
    same_line のときは、ca と cb は同じ並びで、2 か所が重ならないものだけを見る"""
    best = (0, 0, 0)
    # 言葉の終わりどうし: 後ろからさかのぼってそろう数
    for i, x in enumerate(ca):
        for j, y in enumerate(cb):
            if not (x[2] and y[2]) or (same_line and j <= i):
                continue
            n = 0
            while i - n >= 0 and j - n >= 0 and ca[i - n][1] == cb[j - n][1]:
                if same_line and i >= j - n:
                    break
                n += 1
            if n > best[0]:
                best = (n, i - n + 1, j - n + 1)
    # 言葉の頭どうし: 前から進んでそろう数
    for i, x in enumerate(ca):
        for j, y in enumerate(cb):
            if not (x[3] and y[3]) or (same_line and j <= i):
                continue
            n = 0
            while i + n < len(ca) and j + n < len(cb) and ca[i + n][1] == cb[j + n][1]:
                if same_line and i + n >= j:
                    break
                n += 1
            if n > best[0]:
                best = (n, i, j)
    return best


def longest_common(a, b):
    """2 つの行で、母音が続けていちばん長くそろう所。(数, a のかな, b のかな)"""
    ca, cb = core(a), core(b)
    n, x, y = best_match(ca, cb, False)
    if n == 0:
        return 0, "", ""
    return n, span(a, ca, x, n), span(b, cb, y, n)


def longest_inner(ms):
    """1 つの行の中の、重ならない 2 か所で、母音が続けていちばん長くそろう所"""
    cs = core(ms)
    n, x, y = best_match(cs, cs, True)
    if n == 0:
        return 0, "", ""
    return n, span(ms, cs, x, n), span(ms, cs, y, n)


def inner_count(line):
    """行の中で、母音が続けていちばん長くそろう数"""
    return longest_inner(parse(line)[1])[0]


def read_blocks(lines, min_blank=1):
    """タグの行を飛ばし、空行で区切った塊のリストにする。
    歌詞サイトによっては 1 行ごとに空行が入る。塊の半分以上が 1 行だけなら、空行 2 つ以上を区切りとして読み直す"""
    blocks, cur, blank = [], [], 0
    for raw in lines:
        line = raw.strip()
        if line.startswith("["):
            continue
        if not line:
            blank += 1
            if blank >= min_blank and cur:
                blocks.append(cur)
                cur = []
            continue
        blank = 0
        cur.append(line)
    if cur:
        blocks.append(cur)
    if min_blank == 1 and blocks and sum(len(b) == 1 for b in blocks) * 2 > len(blocks):
        return read_blocks(lines, 2)
    return blocks


def check_lyrics(lines):
    end_hits = long_hits = inner_hits = total = 0
    for block in read_blocks(lines):
        done = []
        for line in block:
            lyric, ms, has_reading = parse(line)
            vowels = "".join(c[1] for c in core(ms))
            notes = []
            if done:
                n = end_count(done[-1], ms)
                notes.append(f"終わり {n}" + (" ◎" if n >= RHYME_MIN else ""))
                end_hits += n >= RHYME_MIN
                best = (0, "", "", 0)
                for back, other in enumerate(reversed(done[-LOOK_BACK:]), 1):
                    m, x, y = longest_common(other, ms)
                    if m > best[0]:
                        best = (m, x, y, back)
                m, x, y, back = best
                if m >= RHYME_MIN:
                    mark = " ★" if m >= LONG_MIN else ""
                    notes.append(f"長い韻 {m}{mark}「{x}」⇔「{y}」({back} 行前)")
                long_hits += m >= LONG_MIN
            m, x, y = longest_inner(ms)
            if m >= RHYME_MIN:
                notes.append(f"行の中 {m} ◎「{x}」⇔「{y}」")
                inner_hits += 1
            total += 1
            label = "読み(手書き)" if has_reading else "よみ"
            print(f"{lyric}\n    {label}: {show_reading(ms)}  母音: {vowels}")
            if notes:
                print("    " + "  ".join(notes))
            done.append(ms)
        print()
    print(f"終わりが前の行と {RHYME_MIN} 個以上そろった行: {end_hits} / {total}")
    print(f"{LOOK_BACK} 行前までと {LONG_MIN} 個以上続けてそろった行（長い韻）: {long_hits} / {total}")
    print(f"行の中で {RHYME_MIN} 個以上続けてそろった行: {inner_hits} / {total}")


def check_words(words, target):
    tms = parse(target)[1] if target else None
    rows = []
    for w in words:
        _, ms, _ = parse(w)
        vowels = "".join(c[1] for c in core(ms))
        if tms is None:
            rows.append((0, f"{w}  よみ: {show_reading(ms)}  母音: {vowels}"))
        else:
            m, x, y = longest_common(ms, tms)
            e = end_count(ms, tms)
            rows.append((m * 10 + e, f"{w}  よみ: {show_reading(ms)}  母音: {vowels}  "
                                     f"続けて {m}「{x}」⇔「{y}」  終わり {e}"))
    if tms is not None:
        print(f"target: {show_reading(tms)}  母音: {''.join(c[1] for c in core(tms))}")
        rows.sort(key=lambda r: -r[0])
    for _, text in rows:
        print(text)


def main():
    p = argparse.ArgumentParser(description="歌詞の韻を、口で言ったときの音で数える")
    p.add_argument("items", nargs="*", help="歌詞のファイル。--words のときは言葉の並び。無ければ標準入力から読む")
    p.add_argument("--words", action="store_true", help="歌詞ではなく、言葉ごとの読みと母音を出す")
    p.add_argument("--target", help="--words のとき、この読みと長くそろう順に並べる")
    args = p.parse_args()

    if args.words:
        words = args.items or sys.stdin.read().split()
        check_words(words, args.target)
        return
    if args.items:
        with open(args.items[0], encoding="utf-8") as f:
            lines = f.read().splitlines()
    else:
        lines = sys.stdin.read().splitlines()
    check_lyrics(lines)


if __name__ == "__main__":
    main()
