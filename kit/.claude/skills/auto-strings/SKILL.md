---
name: auto-strings
description: Pipeline job. Collects every user-facing string into the platform-neutral source file with translator comments and length limits.
disable-model-invocation: true
---

# Source strings

1. Find every user-facing string in the app (UI text, alerts, notifications, accessibility labels, App Store/Play listing text, onboarding, errors).
2. Make sure each is in `automation/l10n/strings.source.json` as `{ "key": { "value": "...", "comment": "where/what it is", "maxLength": n } }`. Use `{0}`, `{1}` for placeholders. Keys are stable dotted names (`home.title`); never rename an existing key.
3. Store listing text goes under `store.*` keys: `store.name` (max 30), `store.subtitle` (max 30), `store.keywords` (max 100), `store.description`, `store.promo` (max 170).
4. Replace any remaining hard-coded strings in the code with keys, and re-export (`node automation/tools/export-strings.mjs --ios …`).
5. Write or update `automation/l10n/glossary.md`: product tone (e.g. friendly, motivating, informal "you"), brand terms that stay untranslated, fitness terms with preferred translations where known.
