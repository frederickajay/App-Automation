---
name: auto-design
description: Pipeline job. Design consultancy with the designer agent (Fable) - screen-by-screen design specs and source strings.
disable-model-invocation: true
---

# Design

1. Read `automation/spec.md`. List the screens and flows needed to satisfy every UI acceptance criterion.
2. Give the whole list to the `designer` agent in one request (it runs on Fable, which has a weekly limit: batch, don't loop). It writes `automation/design/<screen>.md` and adds strings to `automation/l10n/strings.source.json`.
3. Write `automation/design/README.md`: screen list, navigation map, and which ACs each screen covers. Every UI AC must appear.
4. Ask the `reviewer` agent to check the designs against the spec (accessibility, RTL, 40% text expansion) into `automation/reviews/design.md`. Fix blocking issues yourself where they're small; send big ones back to `designer` once.
