# gemini-style

「gemini ふうに」「ジェミニ風に」などと書いて送ると、Claude が正論や前提の否定から入らず、聞かれた問いに世の中の目安で答えるようになる hook です。

## 何をするか

送った文に「gemini」か「ジェミニ」と、「ふう」「風」「っぽ」「みたい」のどれかが入っていると、Claude に次の指示を足します。

- 聞かれた問いに、そのまま答える。前提を否定しない。
- 最初の 1 文で、普通に使われている目安や答えを言い切る。
- 注意や条件は、答えのあとに 1〜2 個だけ添える。
- 作業を頼まれたときは、やったことと結果を先に短く言う。

入っていなければ何もしません。

## 入れ方

`jq` が要ります。

```bash
mkdir -p ~/.claude/hooks
cp hooks/gemini-style/gemini-style.sh ~/.claude/hooks/
chmod +x ~/.claude/hooks/gemini-style.sh
```

`~/.claude/settings.json` の `hooks` に、次を足します。

```json
"UserPromptSubmit": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "bash ~/.claude/hooks/gemini-style.sh"
      }
    ]
  }
]
```
