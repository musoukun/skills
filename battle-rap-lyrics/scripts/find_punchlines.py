# /// script
# requires-python = ">=3.9"
# dependencies = ["fugashi", "unidic-lite", "e2k"]
# ///
"""実例の歌詞から、パンチラインとフックの候補の行を探して、行番号つきで並べる。

パンチラインやフックを作る前に、実例のどの行が強いかを見るために使う。
出すのは次の 2 つ。
  - くり返し: 曲の中で 2 回以上出てくる行。曲の旗になる言葉（フック）の候補
  - 行の中の韻: 空白で区切った言葉の終わりどうしか頭どうしで、口で言う音の母音が 3 個以上そろう行。パンチラインの候補

行番号は、ファイルの行番号（空行も数える）。歌詞を読むときは、その前後も読む。
行の中の韻は、空白で区切られた言葉どうしでしか数えない。空白の無い行は、強い行でも出てこない。

使い方:
  uv run scripts/find_punchlines.py                 references/lyrics の歌詞を全部見る（chip-n-dale.txt は除く）
  uv run scripts/find_punchlines.py 歌詞.txt ...    指定したファイルだけ見る
"""
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_rhyme import RHYME_MIN, inner_count  # noqa: E402

LYRICS_DIR = Path(__file__).resolve().parent.parent / "references" / "lyrics"
SKIP = {"chip-n-dale.txt"}


def scan(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    body = [(i + 1, l.strip()) for i, l in enumerate(lines)
            if any(ch.isalnum() for ch in l) and not l.startswith("http") and not l.startswith("[")]
    counts = Counter(text for _, text in body)

    print(f"===== {path.name}")
    hooks = []
    for no, text in body:
        if counts[text] >= 2 and text not in [h for _, h in hooks]:
            hooks.append((no, text))
    print("くり返し（フックの候補）:")
    for no, text in hooks:
        print(f"  {no:>4}  x{counts[text]}  {text}")

    print(f"行の中の韻が {RHYME_MIN} 個以上（パンチラインの候補）:")
    seen = set()
    for no, text in body:
        if text in seen:
            continue
        seen.add(text)
        n = inner_count(text)
        if n >= RHYME_MIN:
            print(f"  {no:>4}  {n}  {text}")
    print()


def main():
    if len(sys.argv) > 1:
        paths = [Path(p) for p in sys.argv[1:]]
    else:
        paths = sorted(p for p in LYRICS_DIR.glob("*.txt") if p.name not in SKIP)
    for p in paths:
        scan(p)


if __name__ == "__main__":
    main()
