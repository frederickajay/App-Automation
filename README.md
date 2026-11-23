# App Automation

A reusable kit that takes an app from written requirements to the App Store and Google Play using Claude Code, with you only answering questions and giving direction.

It isn't tied to one app. Install it into any app repo, fill in two files, and start it.

```
requirements → audit/resume → spec → design (Fable) → build (Opus) → tests until clean (Sonnet, Mac)
→ strings → 18-language translation (multi-agent) → screenshots (Mac) → captions → blog
→ App Store release (Mac) → Android build → tests (Windows) → screenshots → Play release → forum drafts (you approve)
```

## What's in this folder

```
App-Automation/
  install.mjs            puts the kit into an app repo (or updates it)
  dry-run/sandbox.sh     runs the whole pipeline with a fake Claude: no usage, no real repos
  kit/
    CLAUDE.automation.md      rules every session follows (added to the repo's CLAUDE.md)
    .claude/agents/           designer (Fable), developer (Opus), tester, translator (Sonnet),
                              translation-reviewer, reviewer (Opus), copywriter, release-manager
    .claude/skills/           one skill per pipeline job (auto-*), plus /pipeline for status and answers
    .claude/hooks/            secret/force-push guard, session context, phone notifications
    .claude/settings.json     permissions (allow the tools jobs need, deny reading key files)
    automation/
      config.json             your app: name, languages, repos, machines, forums, limits
      stages.json             the jobs, which machine runs each, and each job's "done" check
      ctl.mjs                 the one command you run
      lib/                    orchestrator, workers, state, notifications, dashboard
      tools/                  independent checks (strings, screenshots) and string export to iOS/Android
      fastlane/               Fastfile templates (API-key auth, no logins)
      secrets/                .env.example and loaders (Keychain/1Password/.env)
      SETUP-KEYS.md           one-time credential setup, service by service
      inputs/requirements.md  where you write what you want
```

## How it works

- **The orchestrator** (`ctl.mjs start`) decides what runs next. It's light, so run it on whichever machine stays on.
- **Cloud jobs** (spec, design, code, translation, captions, blog, forum drafts) start as Claude Code cloud sessions with `claude --cloud`. They use none of your machines' memory.
- **Mac jobs** (simulator tests, iOS screenshots, App Store upload) and **Windows jobs** (emulator tests, Play upload) wait in a queue. A worker on each machine (`ctl.mjs worker mac` / `worker windows`) takes them one at a time.
- **Each job is a fresh session**, which gives you session rotation. Jobs pass context to each other only through files: `automation/handoffs/`, `spec.md` and `decisions.md`.
- **Each job runs under `/goal`**, so a separate model checks the job's done condition before it can stop. The condition is in `stages.json`, for example "`xcodebuild test` exits 0 twice in a row and every acceptance criterion has a test".
- **Results come back as git branches** (`automation/<job>-a<attempt>`). Before merging one into `main`, the orchestrator runs its own check: `check-strings` for translations and `check-screenshots` for screenshots.
- **Failures retry automatically.** A job is tried up to 3 times, and each retry is told why the last one failed. After that, or whenever a job hits a decision only you can make, you get a **question**.
- **Answers become decisions.** They're written to `automation/decisions.md`, so you're never asked the same thing twice, and the job reruns with your answer.
- **Shared state lives on the `automation-state` branch** of your repo. That's how the orchestrator, the Mac and the Windows PC coordinate with no extra servers.

## Setup (once per app)

1. **Create the repos on GitHub**: one for iOS and one for Android. Install the Claude GitHub App on both (claude.ai/code), so cloud sessions can clone and push.
2. **Install the kit** into both:
   ```
   node install.mjs ~/MyApp-ios
   node install.mjs ~/MyApp-android
   ```
3. **Edit `automation/config.json`** in the iOS repo. This is the home repo, and its config is used for both. Set the app name, bundle IDs, languages, Android repo path, forums and blog publish command. Machine-specific paths go in `automation/config.local.json`, which is gitignored. For example, on Windows:
   ```json
   { "repos": { "ios": { "path": "." }, "android": { "path": "C:/code/MyApp-android" } } }
   ```
4. **Write `automation/inputs/requirements.md`** in your own words.
5. **Set up credentials** by following `automation/SETUP-KEYS.md` (about an hour, once). Then check each machine:
   ```
   ./automation/secrets/load-secrets.sh node automation/ctl.mjs check mac
   ```
6. **Commit and push** both repos.

Each machine needs Node 20+, git and Claude Code signed in with `claude auth login`. The Mac also needs Xcode and fastlane. The Windows PC also needs a JDK, the Android SDK and fastlane, and Git for Windows (Claude Code uses Git Bash there).

## Start

Clone the **iOS repo** on both machines, since that's where the shared state lives. Clone the Android repo on the Windows PC too.

**Mac** (keep it awake with `caffeinate`):
```
caffeinate -i ./automation/secrets/load-secrets.sh node automation/ctl.mjs worker mac
```
**Windows PC:**
```
powershell -ExecutionPolicy Bypass -File automation\secrets\load-secrets.ps1 node automation/ctl.mjs worker windows
```
**Orchestrator** (one machine only, in a second terminal):
```
./automation/secrets/load-secrets.sh node automation/ctl.mjs start
```

The first job is always the **audit**. It looks at what's already in the repo and marks finished jobs as done, so an app that's halfway through picks up from there.

### First real run: check these two things once
1. **Cloud launch.** In the iOS repo, run `claude --cloud "Say hello and stop"`. The output should include a `Session ID:` or a `claude.ai/code/...` link, which is what the orchestrator reads. If your CLI version needs different flags, set `claude.cloudLaunchArgs` in `automation/config.json`.
2. **No permission stops in the cloud.** Open the first cloud job (the audit) on claude.ai/code. If it stops to ask permission for a command, add that command to `.claude/settings.json` → `permissions.allow`. Alternatively, set the cloud environment's default mode to Auto.

## Day to day

- **Notifications:** set `NTFY_TOPIC` and install the ntfy app on your phone, or set `AUTOMATION_WEBHOOK_URL` for Slack or Discord. You're notified about questions, releases, usage pauses and when the pipeline finishes.
- **Answering questions**, whichever is handiest:
  - `node automation/ctl.mjs answer <id> "your answer"`
  - from your phone: open a cloud session on the repo and type `/pipeline answer <id> your answer`
  - or add `answers/<id>.md` on the `automation-state` branch in GitHub's web editor

  Special answers: `retry`, `skip`, and `wait` (when a job timed out but is still working).
- **Status:** `node automation/ctl.mjs status` prints the jobs and writes `.automation-state/dashboard.html`, a phone-friendly page that refreshes itself. `/pipeline` in any session does the same.
- **Control:**
  - `pause [hours]` stops new jobs from starting; running ones finish.
  - `resume` starts again.
  - `rerun <job>` runs a job again, and everything after it.
  - `skip <job>` marks a job as done without running it.

## Usage on the Ultra plan

- **Fable** is only used by the `designer` agent, once per design pass, because it has its own weekly limit.
- **Heaviest stages:** translation, captions and blog, at one agent per language in batches of 6.
- **Weekly limit:** scripts can't read your remaining weekly allowance, so the pipeline reacts when a job hits the limit. It pauses for an hour, notifies you, and resumes. Also set `"autoContinueAtUsageLimit": true` in `~/.claude/settings.json` on each machine. Check Settings > Usage yourself before a big run, and use `pause` if you want to keep some allowance free.
- **Model control:** the `model` field in `stages.json` sets the main model for Mac and Windows jobs. Cloud jobs start on your default model, but the heavy work runs in the agents, which have fixed models.

## Things it won't do, on purpose

- **Post on forums.** It drafts compliant posts and asks you, because most forums ban automated promotion.
- **Upload the first Android build.** Google requires the first upload to be done by hand in Play Console.
- **Read or print keys.** Credentials only reach tools through environment variables, and the guard hook blocks attempts to read them.

## Dry run (recommended before the first real run)

```
bash dry-run/sandbox.sh
FAKE_MODE=block,fail bash dry-run/sandbox.sh   # see questions and retries
```
This builds throwaway local repos, swaps in a fake `claude`, and runs every job through the orchestrator and both workers. It uses no Claude usage and touches nothing real. The fake refuses to run against a GitHub remote.

## Customising

- **Add or remove jobs:** edit `stages.json`. Each job needs a skill, a machine, `dependsOn` and a `done` condition. Add `verify` for an independent check command.
- **Tune behaviour:** edit the skills in `.claude/skills/auto-*`. `node install.mjs <repo> --update` refreshes the kit's scripts, skills, agents and hooks without touching your config, spec or outputs. It does overwrite the kit's own skill files, so keep custom ones under a different name.
- **Speed up translation:** once a translation run looks right, open it in `/workflows` in an interactive session and press `s` to save it as a workflow.
