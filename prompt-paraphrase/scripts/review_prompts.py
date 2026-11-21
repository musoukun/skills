"""指示のレビューで、毎回同じ答えが出るところをプログラムでする。AI は呼ばない。標準のライブラリだけで動く。

- collect：資料の一覧（JSON）に書いたファイルを集め、レビューする役が読む sources.md と、確かめに使う sources.json を出す。
  一覧の placement（ファイルごとに何を書き、何を書かないか）があれば、sources.md の最初に入れる
- check：レビューする役が書いた findings-*.json の引用が、資料に本当にあるかを文字で確かめ、review.md と review.json にまとめる。
  無い引用は外し、引用が足りなくなったもの（食い違いと重なりとフローの抜けは 2 つ、置き場所の違いと書き方は 1 つ）は「外したもの」に移す

資料の一覧の形:
  {"sources": [{"name": "persona.md", "path": "prompts/persona.md", "when": "会話の最初に受け取る"}],
   "placement": [{"source": "persona.md", "write": "どの場面でも同じ話し方", "dont": "場面で変わる話し方"}]}
  path は、一覧のファイルがあるフォルダからの相対か、絶対のパス。

使い方:
  python3 review_prompts.py collect --manifest prompt-sources.json [--out .prompt-review]
  python3 review_prompts.py check [--out .prompt-review]
"""
import argparse
import datetime
import json
import pathlib
import re
import unicodedata

KINDS = ["食い違い", "重なり", "置き場所の違い", "書き方", "フローの抜け"]


def collect(manifest: pathlib.Path, out: pathlib.Path) -> None:
    conf = json.loads(manifest.read_text(encoding="utf-8"))
    base = manifest.resolve().parent
    src, when = {}, {}
    for s in conf["sources"]:
        p = pathlib.Path(s["path"])
        src[s["name"]] = (p if p.is_absolute() else base / p).read_text(encoding="utf-8")
        when[s["name"]] = s.get("when", "")
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("findings-*.json"):  # 前の回の結果を混ぜない
        old.unlink()
    (out / "sources.json").write_text(json.dumps({"root": str(manifest), "sources": src}, ensure_ascii=False, indent=1), encoding="utf-8")
    parts = []
    if conf.get("placement"):
        rows = "\n".join(f"| {p['source']} | {p.get('write', '')} | {p.get('dont', '')} |" for p in conf["placement"])
        parts.append("=== 置き場所の決まり ===\n| 置き場所 | 書くこと | 書かないこと |\n|---|---|---|\n" + rows)
    parts += [f"=== 資料: {k} ===\nAI がいつ読むか：{when[k] or '（書いていない）'}\n{v}" for k, v in src.items()]
    (out / "sources.md").write_text("\n\n".join(parts) + "\n", encoding="utf-8")
    print(f"資料 {len(src)} 個（{'、'.join(src)}）→ {out / 'sources.md'}")


def flat(s: str) -> str:
    """引用と資料を比べる形。空白と改行を除き、全角と半角をそろえる"""
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", s))


def verify(findings: list, src: dict) -> tuple[list, list]:
    """引用が資料に本当にあるかを確かめる。無い引用は missing に移し、引用が足りなくなったものは外す"""
    kept, dropped = [], []
    for f in findings:
        ok = [q for q in f["quotes"] if len(flat(q["text"])) >= 4 and flat(q["text"]) in flat(src.get(q["source"], ""))]
        f = {**f, "quotes": ok, "missing": [q for q in f["quotes"] if q not in ok]}
        (kept if len(ok) >= (1 if f["kind"] in ("置き場所の違い", "書き方") else 2) else dropped).append(f)
    return kept, dropped


def cell(s: str) -> str:
    return s.replace("|", "\\|").replace("\n", " ")


def quoted(qs: list) -> str:
    return "、".join(f"「{cell(q['text'])}」" for q in qs)


def markdown(result: dict) -> str:
    kept, dropped = result["findings"], result["dropped"]
    counts = "、".join(f"{k} {sum(f['kind'] == k for f in kept)} 件" for k in KINDS)
    lines = ["# 指示のレビュー", "", f"{counts}。引用が資料に無かったので外したもの {len(dropped)} 件。", "",
             f"- 対象：{result['root']}", f"- 日時：{result['date']}", ""]
    n = 0
    for kind in KINDS:
        lines += [f"## {kind}", ""]
        for f in (f for f in kept if f["kind"] == kind):
            n += 1
            lines += [f"### {n}. {f['scene']}", "", "| 資料 | 見出し | 引用 |", "|---|---|---|",
                      *(f"| {cell(q['source'])} | {cell(q['heading'])} | {cell(q['text'])} |" for q in f["quotes"]), "",
                      f["why"], "", f"案：{f['suggestion']}", ""]
            lines += [f"外した引用（資料に無い）：{quoted(f['missing'])}", ""] if f["missing"] else []
    if dropped:
        lines += ["## 外したもの", "", "| 種類 | 場面 | 資料に無かった引用 |", "|---|---|---|",
                  *(f"| {f['kind']} | {cell(f['scene'])} | {quoted(f['missing'])} |" for f in dropped), ""]
    return "\n".join(lines)


def check(out: pathlib.Path) -> None:
    got = json.loads((out / "sources.json").read_text(encoding="utf-8"))
    findings = [f for p in sorted(out.glob("findings-*.json")) for f in json.loads(p.read_text(encoding="utf-8"))]
    kept, dropped = verify(findings, got["sources"])
    result = {"root": got["root"], "date": datetime.datetime.now().isoformat(timespec="seconds"), "findings": kept, "dropped": dropped}
    (out / "review.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "review.md").write_text(markdown(result), encoding="utf-8")
    print(markdown(result).split("\n\n", 2)[1])
    print(f"→ {out / 'review.md'}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("step", choices=["collect", "check"])
    p.add_argument("--manifest", type=pathlib.Path, default=pathlib.Path("prompt-sources.json"), help="資料の一覧（JSON）")
    p.add_argument("--out", type=pathlib.Path, default=pathlib.Path(".prompt-review"))
    args = p.parse_args()
    collect(args.manifest, args.out) if args.step == "collect" else check(args.out)


if __name__ == "__main__":
    main()
