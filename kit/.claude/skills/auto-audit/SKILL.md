---
name: auto-audit
description: Pipeline job 0. Audits the repo to find which pipeline jobs are already done, partly done or out of date, and checks credentials, so the pipeline can resume midway.
disable-model-invocation: true
---

# Audit and resume

Work out where this app actually is, from evidence in the repo, not from notes or file names alone. Don't change app code in this job.

1. Read `automation/stages.json` (the job list and each job's `done` condition) and `automation/config.json`.
2. For each job, check its done condition against the repo as it is now:
   - ideate: `automation/spec.md` with numbered acceptance criteria. If there's no spec but there is an app, write the spec from the existing app and `automation/inputs/requirements.md` (mark it as reconstructed) and treat ideate as done.
   - design: `automation/design/` covers the spec's screens.
   - build/test: does the code implement the acceptance criteria? Tests exist? (You can't run Xcode here: mark test jobs done only if `automation/reviews/test-coverage-*.md` exists AND no app code changed after the commit it records. Otherwise list them as not done.)
   - strings/translate: run `node automation/tools/check-strings.mjs`. Count complete languages.
   - screenshots: run `node automation/tools/check-screenshots.mjs ios` (and android in the Android repo, if present).
   - captions/blog/forums: files exist for every language/forum and match the current spec.
   - release: only done if `automation/handoffs/release-*.md` records an upload for the current version.
3. A job is **stale** if what it produced is older than what it depends on (e.g. screenshots taken before the UI changed: compare `git log -1 --format=%cI -- <paths>`).
4. Write `automation/reviews/audit.md`: one line per job with done / partial (what's missing) / not started / stale, and the evidence.
5. In the result file set `jobsAlreadyDone` (job ids fully done and not stale) and `jobsStale`. Partly-done jobs are neither: they'll run and finish only what's missing.
6. If `automation/inputs/requirements.md` is missing and there's no app to reconstruct from, end "blocked" asking the owner to add it.
