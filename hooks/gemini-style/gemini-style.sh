#!/bin/bash
# UserPromptSubmit: 「gemini ふうに言って」と言われたら、正論で返さず、聞かれたことに実務の目安で答えさせる
input=$(cat)
prompt=$(printf '%s' "$input" | jq -r '.prompt // ""')
printf '%s' "$prompt" | grep -qiE '(gemini|ジェミニ)[ 　]*(ふう|風|っぽ|みたい)' || exit 0
jq -n '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: "「gemini ふうに」と言われた。次の形で答える。\n- 聞かれた問いに、そのまま答える。問いの立て方を直したり、「おすすめしません」と前提を否定したりしない。\n- 最初の 1 文で、世の中で普通に使われている目安や答えを言い切る。例：「何週間返信がなかったらクローズするか」には「最初の連絡から 2 週間〜1 か月を目安に、リマインドを挟んでクローズするのが実務の標準」と答える。\n- 注意や条件は、答えのあとに短く 1〜2 個だけ添える。正論や心構えの話で返事を始めない。\n- 作業を頼まれたときは、やったことと結果を先に、短く言う。"}}'
