# Setup checklist

Do these in order. Steps 1–11 get the pipeline running (no store keys needed). Steps 12–17 are only needed before releases and publishing; the pipeline asks you when it reaches them.

## Get running
- [ ] **1. Kit on your Mac + dry run** – `git clone https://github.com/frederickajay/App-Automation.git ~/App-Automation`, then `cd ~/App-Automation && bash dry-run/sandbox.sh`. Open the dashboard path it prints.
- [ ] **2. App repos** – create the app's iOS and Android repos on GitHub (private), clone them, then `node ~/App-Automation/install.mjs <repo>` for each. Commit and push.
- [ ] **3. Requirements** – write `automation/inputs/requirements.md` in the iOS repo: what it does, who for, must-haves, free vs paid, pricing, claims to avoid.
- [ ] **4. Config** – `automation/config.json`: app name, bundle ID, Android package, languages, Android repo path. Machine-specific paths in `automation/config.local.json`.
- [ ] **5. Claude sign-in** – `claude auth login` on Mac and Windows; add `"autoContinueAtUsageLimit": true` to `~/.claude/settings.json` on both.
- [ ] **6. Cloud access** – at claude.ai/code install the Claude GitHub App on both app repos and create a cloud environment.
- [ ] **7. Mac tools** – Xcode, `brew install fastlane node`; then `node automation/ctl.mjs check mac`.
- [ ] **8. Windows tools** – JDK 17+, Android Studio (SDK + one emulator), fastlane, Node, Git for Windows; then `node automation/ctl.mjs check windows`.
- [ ] **9. Phone notifications** – install the ntfy app, subscribe to a long random topic, put `NTFY_TOPIC=<topic>` in `automation/secrets/.env` on both machines.
- [ ] **10. First-run checks** – `claude --cloud "Say hello and stop"` prints a session link; the first (audit) job runs without stopping for permission.
- [ ] **11. Start** – Mac: worker mac. Windows: worker windows. One machine: `ctl.mjs start`. (Commands in README.)

## Before releases
- [ ] **12. App Store Connect API key** – `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_PATH` (Mac only).
- [ ] **13. iOS signing** – private certificates repo + `fastlane match` once; `MATCH_GIT_URL`, `MATCH_PASSWORD`.
- [ ] **14. Google Play** – create the app in Play Console, upload the first build by hand, service account JSON as `PLAY_JSON_KEY` (Windows only).
- [ ] **15. Android keystore** – create once; `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

## Fewer questions
- [ ] **16. Blog publishing** – CMS API token env var + `app.blog.publishCommand`.
- [ ] **17. Forums + glossary** – forums with rules links in the config; tone and brand terms in `automation/l10n/glossary.md`.

Details for every key: `kit/automation/SETUP-KEYS.md`.
