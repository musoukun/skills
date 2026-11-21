# /// script
# requires-python = ">=3.9"
# dependencies = ["requests", "beautifulsoup4"]
# ///
"""歌詞サイトの URL から歌詞を取り出して、テキストに保存する。

対応しているサイト:
  j-lyric.net / petitlyrics.com / s.awa.fm / lyricstranslate.com / utaten.com

保存先は、指定が無ければこのスキルの references/lyrics フォルダ（git では除外している）。

使い方:
  uv run scripts/fetch_lyrics.py
      URL を渡さないと、lyrics_sources.txt に書いた歌詞のうち、まだ無いものを、
      そこに書いたファイル名で保存する
  uv run scripts/fetch_lyrics.py <URL> [<URL> ...]
      ページのタイトルをファイル名にして、references/lyrics に保存する
  uv run scripts/fetch_lyrics.py <URL> -d ~/Desktop/lyrics   指定したフォルダに保存する
  pbpaste | grep http | xargs uv run scripts/fetch_lyrics.py
      クリップボードの URL をまとめて取り、references/lyrics に保存する
"""
import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_DIR = SCRIPT_DIR.parent / "references" / "lyrics"
SOURCES = SCRIPT_DIR / "lyrics_sources.txt"


def block_text(el, remove=""):
    """要素の文字を、改行を保って取り出す"""
    if remove:
        for junk in el.select(remove):
            junk.decompose()
    for br in el.find_all("br"):
        br.replace_with("\n")
    # 1 行ずつ div や p で並べるサイトのために、ブロックの終わりで改行する
    for blk in el.find_all(["div", "p"]):
        blk.append("\n")
    text = el.get_text().replace("\u00a0", "").replace("\r", "")
    lines = [line.strip() for line in text.split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def select_text(soup, selector, remove=""):
    return "\n\n".join(block_text(el, remove) for el in soup.select(selector))


# ---- サイトごとの取り方 ----

def j_lyric(soup):
    # 歌詞は <p id="Lyric"> に <br> 区切りで入っている
    return select_text(soup, "#Lyric", ".google-anno-skip, svg")


def petitlyrics(soup):
    # 歌詞は画像（canvas）に描かれる。取れるのは canvas の中に埋まっている文字だけで、
    # 曲の途中までしか入っていないことがある
    return select_text(soup, "#lyrics")


def awa(soup):
    # 歌詞はページに埋め込まれたデータ（__NEXT_DATA__）の中にある
    data = json.loads(soup.select_one("script#__NEXT_DATA__").string)
    stores = data["props"]["pageProps"]["dehydrated"]["context"]["dispatcher"]["stores"]
    return "\n\n".join(v["text"].strip() for v in stores["TrackStore"]["lyrics"]["map"].values())


def lyricstranslate(soup):
    # 歌詞は 1 行ずつ div に入っている。[AKLO] のような歌い手の見出し（.ltag）は消す
    return select_text(soup, "#song-body", ".ltag")


def utaten(soup):
    # .hiragana は漢字の上にふりがな（.rt）が付いた版。ふりがなを消すと元の歌詞になる
    return select_text(soup, ".hiragana", ".rt")


SITES = {
    "j-lyric.net": j_lyric,
    "petitlyrics.com": petitlyrics,
    "awa.fm": awa,
    "lyricstranslate.com": lyricstranslate,
    "utaten.com": utaten,
}


def fetch(url):
    """(ページのタイトル, 歌詞) を返す"""
    host = urlparse(url).hostname or ""
    extract = next((f for k, f in SITES.items() if host.endswith(k)), None)
    if extract is None:
        raise ValueError(f"対応していないサイト: {host}")

    res = requests.get(url, headers=HEADERS, timeout=30)
    res.raise_for_status()
    # バイト列のまま渡すと、ページの meta charset から文字コードを判定してくれる
    soup = BeautifulSoup(res.content, "html.parser")
    title = soup.title.get_text(strip=True) if soup.title else url
    return title, extract(soup)


def safe_name(title):
    return re.sub(r'[\\/:*?"<>|]', "_", title).strip()[:100]


def read_sources():
    """lyrics_sources.txt から (ファイル名, URL) の並びを読む"""
    pairs = []
    for line in SOURCES.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            name, url = line.split(maxsplit=1)
            pairs.append((name, url))
    return pairs


def main():
    p = argparse.ArgumentParser(description="歌詞サイトの URL から歌詞を取り出す")
    p.add_argument("urls", nargs="*", help=f"省略すると {SOURCES.name} の歌詞のうち、まだ無いものを取る")
    p.add_argument("-d", "--out-dir", type=Path, default=DEFAULT_DIR,
                   help=f"保存するフォルダ（既定: {DEFAULT_DIR}）")
    args = p.parse_args()
    out_dir = args.out_dir.expanduser()

    if args.urls:
        jobs = [(None, url) for url in args.urls]
    else:
        jobs = [(name, url) for name, url in read_sources() if not (out_dir / name).exists()]
        if not jobs:
            print(f"{SOURCES.name} の歌詞は、すべて {out_dir} にある", file=sys.stderr)

    failed = False
    for name, url in jobs:
        try:
            title, text = fetch(url)
            if not text:
                raise ValueError("歌詞が見つからなかった")
        except Exception as e:  # 1 件失敗しても残りは続ける
            print(f"失敗: {url} ({e})", file=sys.stderr)
            failed = True
            continue

        out = out_dir / (name or f"{safe_name(title)}.txt")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(f"{url}\n\n{text}\n", encoding="utf-8")
        print(f"保存: {out}", file=sys.stderr)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
