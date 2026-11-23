---
name: auto-captions
description: Pipeline job. Synthetic captioning - writes and reviews localized marketing captions for each screenshot, then frames them.
disable-model-invocation: true
---

# Captions

1. Read `automation/marketing/screenshot-plan.md`, the spec and the English screenshots. For each screenshot, write an English headline (≤ 30 characters) and optional subline (≤ 40) that names the benefit shown, backed by an AC.
2. Fan out: one `copywriter` agent per language (batches of up to 6) writes `automation/marketing/captions/<lang>.json` as `{ "<screenshot id>": { "title": "...", "subtitle": "..." } }`, written natively, not word-for-word.
3. A `reviewer` agent checks each language for claims, length and tone into `automation/reviews/captions/<lang>.md`. Fix and re-review (max 2 rounds).
4. If the repo uses fastlane frameit, also write `fastlane/screenshots/<locale>/title.strings` (and `keyword.strings`) from the captions, so the Mac release job can frame them. Don't run frameit here (it needs macOS).
