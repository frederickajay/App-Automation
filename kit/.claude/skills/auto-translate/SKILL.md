---
name: auto-translate
description: Pipeline job. Heavy multi-agent translation into every configured language with independent back-translation review.
disable-model-invocation: true
---

# Translate (multi-agent)

Languages: `app.languages` in `automation/config.json` minus the source language.

1. Work out which languages need work: run `node automation/tools/check-strings.mjs`. Languages already passing and with `VERDICT: PASS` in `automation/reviews/l10n/<lang>.md` for the current source are done; skip them.
2. For each remaining language, in parallel batches of up to 6, start one `translator` agent: "Translate into <lang>. Source: automation/l10n/strings.source.json. Glossary: automation/l10n/glossary.md. Write automation/l10n/translations/<lang>.json."
3. As each finishes, start a `translation-reviewer` agent for that language (a different agent from the translator).
4. For `VERDICT: FIX`, send the reviewer's table back to a `translator` for that language, then review again. Maximum 3 rounds per language; after that, record the unresolved keys in the result and continue.
5. Run `node automation/tools/check-strings.mjs` until it exits 0. Fix any placeholder or length problems it reports.
6. Export: `node automation/tools/export-strings.mjs --ios <path to Localizable.xcstrings>`.
7. Store listing text: the `store.*` keys are included above; also write `fastlane/metadata/<store-locale>/` files for iOS if a `fastlane/metadata` folder exists (store locale names are in `app.storeLocales.ios`).

Tip: after the first good run, the owner can turn this into a saved workflow (open the run in `/workflows`, press `s`) for faster, cheaper reruns.
