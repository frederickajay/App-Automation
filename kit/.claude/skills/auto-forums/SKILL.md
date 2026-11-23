---
name: auto-forums
description: Pipeline job. Researches each configured forum's rules and drafts a compliant post per forum for the owner to approve. Never posts automatically.
disable-model-invocation: true
---

# Forum drafts

1. For each forum in `app.forums`, read its rules (`rulesUrl`, plus its self-promotion policy). Summarise the rules that matter in `automation/marketing/forums/<forum>.rules.md`.
2. A `copywriter` agent drafts `automation/marketing/forums/<forum>.md` that follows those rules exactly (disclosure that you're the developer, required flair/format, no link if links are banned, in the forum's language).
3. Do not post anything. End "blocked" with one question listing the drafts and asking which to post (options: "post all", "post none", or forum names). Posting accounts and auto-posting are deliberately out of scope: forums ban automated promotion.
