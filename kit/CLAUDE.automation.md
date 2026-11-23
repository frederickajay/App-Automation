# App automation pipeline

This repo is driven by an automated pipeline (`automation/`). The owner gives directions and answers questions; everything else is yours to do and decide.

## Job protocol (every pipeline session)
- You were started for one job. The first message names it, its attempt number, and the branch to push to. Do only that job.
- Start by reading, in this order: `automation/decisions.md`, `automation/handoffs/` (what earlier jobs left), the job's skill in `.claude/skills/`.
- Finish by writing `automation/results/<job>.json`, `automation/handoffs/<job>.md`, committing, and pushing to **the job branch named in the prompt**. Never push to `main`; the orchestrator merges after its own checks.
- `status` is `"done"` only when the job's done-condition is actually demonstrated in this session (run the command, show the output). Otherwise `"blocked"` (needs the owner) or `"failed"` (you tried and couldn't).

## When to ask the owner (and when not to)
Ask, by ending the job `"blocked"` with `questions`, ONLY for:
- requirements that are ambiguous or contradict each other, where a wrong guess would waste a stage
- anything that costs money (paid assets, ads, services) or creates a legal/privacy commitment (privacy policy wording, health claims, terms)
- brand, naming, pricing
- approval to post on public forums
- a check that still fails after you've genuinely tried to fix it

Everything else: decide, and record it as one line in `decisions` in the result file (it's appended to `automation/decisions.md`). Good questions are specific, give 2–4 options, and say what you'd pick and why in `why`.

Question format in the result file:
```json
{ "question": "Should free users get 3 or 5 workouts a week?", "options": ["3", "5"], "why": "Spec says 'limited'. I'd pick 3 to make the paid tier clearer." }
```

## Models
The heavy work runs in subagents with fixed models (`.claude/agents/`): design → `designer` (Fable), implementation → `developer` (Opus), tests → `tester` (Sonnet), translation → `translator` (Sonnet) with `translation-reviewer` (Opus), marketing → `copywriter` (Sonnet), independent review → `reviewer` (Opus). Delegate to them; keep your own context for coordinating. Use Fable sparingly: it has its own weekly limit.

## Machines
- Cloud sessions: no Xcode, no simulators, no Android emulator. Write code and docs, run Linux-friendly checks, leave device testing to the Mac/Windows jobs.
- Mac jobs (8 GB RAM): one simulator at a time, one device size at a time, at most 2 agents in parallel. Build with `-derivedDataPath .derived-data`. Shut simulators down when done (`xcrun simctl shutdown all`).
- Windows jobs: Gradle and the Android emulator. One emulator at a time.

## Secrets
Credentials come from environment variables (see `automation/SETUP-KEYS.md`). Never print, echo, cat, log or commit a key, token, password or key file. Refer to them only by variable name. If one is missing, end the job `"blocked"` naming the variable.

## Shared files
- `automation/spec.md` – requirements with numbered acceptance criteria (AC-1…). The source of truth.
- `automation/design/` – design specs per screen.
- `automation/l10n/strings.source.json` + `translations/<lang>.json` – the only place strings are edited. Platforms get them via `node automation/tools/export-strings.mjs`.
- `automation/marketing/` – captions, blog, forum drafts.
- `automation/reviews/` – reviewer sign-offs and check reports.
