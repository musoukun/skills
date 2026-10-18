# ralph-loop で全体を自走させたい場合（任意）

外側を自走化したい場合は、SKILL.md の本文をプロンプトとして渡す：

```bash
/ralph-loop "$(cat ~/.claude/skills/issue-loop/SKILL.md)" \
  --max-iterations 30 \
  --completion-promise "ISSUE_LOOP_DONE"
```

Step 5 の終了時に、最後の応答へ `<promise>ISSUE_LOOP_DONE</promise>` を含めると ralph-loop が終了する。HARD-GATE（設計 Accept、ゴール未達の相談）では人間の応答が必要なので、ralph-loop で包んでも完全な自動にはならない（そこは想定どおり）。
