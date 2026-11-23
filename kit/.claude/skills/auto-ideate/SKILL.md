---
name: auto-ideate
description: Pipeline job. Turns the owner's requirements into an enriched spec with numbered, testable acceptance criteria.
disable-model-invocation: true
---

# Ideate and write the spec

Input: `automation/inputs/requirements.md` (the owner's words; never edit it).

1. Read the requirements. Research comparable apps briefly (WebSearch) to spot missing table-stakes features, onboarding, retention, monetisation and edge cases.
2. Write `automation/spec.md`:
   - Summary, target users, platforms, languages (from config).
   - Features, each with numbered acceptance criteria `AC-1`, `AC-2`… that a test can verify ("Given/When/Then" or a precise statement).
   - Non-functional: accessibility, offline behaviour, privacy (what data, where it's stored), performance on low-memory devices.
   - Out of scope.
   - Ideas you added beyond the requirements, marked **[added]** so the owner can see them.
3. Ask the `reviewer` agent to review it into `automation/reviews/spec.md`. Fix every blocking issue and re-review until `VERDICT: PASS`.
4. Ask the owner (blocked) only about real forks in the product: pricing, what's free vs paid, health/legal claims, anything [added] that changes scope a lot. Put your recommendation in `why`.
