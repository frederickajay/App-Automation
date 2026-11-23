---
name: pipeline
description: Check the app automation pipeline status, show open questions, or answer one. Use when the owner asks how the pipeline is doing or wants to answer a pipeline question.
argument-hint: [status | answer <id> <text> | pause | resume | rerun <job>]
---

Run the matching command from the repo root and show the owner the result in plain words:

- status (default): `node automation/ctl.mjs status`
- answer: `node automation/ctl.mjs answer <id> "<text>"`
- pause / resume / rerun <job> / skip <job>: `node automation/ctl.mjs <command> [job]`

Arguments given: $ARGUMENTS

If a command fails because the state branch can't be reached, say so and show the error line.
