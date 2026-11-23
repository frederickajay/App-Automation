# One-time credential setup

The pipeline never logs in interactively. Each service gets a key or token once; after that nothing asks you to sign in. Budget about an hour.

Put the values in `automation/secrets/.env` on each machine (gitignored), or in 1Password and point `AUTOMATION_OP_ENV` at an `op://` env file. Keep Apple keys on the Mac only and Google Play keys on the Windows PC only. Then check a machine with:

```
./automation/secrets/load-secrets.sh node automation/ctl.mjs check mac
powershell -ExecutionPolicy Bypass -File automation\secrets\load-secrets.ps1 node automation/ctl.mjs check windows
```

## Claude Code (both machines)
- Install Claude Code and run `claude auth login` once with your Ultra account. The CLI keeps you signed in; `--cloud` jobs need this claude.ai sign-in (not an API key).
- In `~/.claude/settings.json` on each machine, add `"autoContinueAtUsageLimit": true` so a session waits for your limit to reset instead of failing.
- Cloud sessions: connect GitHub at claude.ai/code (install the Claude GitHub App on both repos) and create a cloud environment for them. Add `NTFY_TOPIC` as an environment variable there if you want phone pings from cloud jobs too.

## GitHub (both machines) → `GH_TOKEN`
Fine-grained personal access token, only the app repos (+ the certificates repo for match), permissions: Contents read/write, Pull requests read/write. Or use an SSH key for git.

## App Store Connect (Mac) → `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_PATH`
App Store Connect → Users and Access → Integrations → App Store Connect API → generate a key with the **App Manager** role. Download the `.p8` once (Apple won't show it again), store it outside the repo (e.g. `~/.keys/`), note the Key ID and Issuer ID.

## iOS code signing (Mac) → `MATCH_GIT_URL`, `MATCH_PASSWORD`
Create an empty private repo for certificates, then run `fastlane match init` and `fastlane match appstore` once with the API key. After that, jobs run `match` read-only.

## Google Play (Windows) → `PLAY_JSON_KEY`
Google Cloud console → create a service account → create a JSON key. Play Console → Users and permissions → invite the service account's email with release permissions for this app. **Create the app in Play Console and upload the first build by hand**: Google requires that before the API can publish.

## Android signing (Windows) → `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
Create an upload keystore once (`keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`), keep it outside the repo, and enrol in Play App Signing.

## Optional
- AWS → `AWS_PROFILE` with a dedicated IAM role/user limited to what the app needs (avoid `aws sso login`, it expires and opens a browser).
- Google Cloud → `GOOGLE_APPLICATION_CREDENTIALS` pointing at a service-account JSON.
- Blog CMS → its API token in an env var, and set `app.blog.publishCommand` in `automation/config.json`.
- Phone notifications → `NTFY_TOPIC` (install the ntfy app and subscribe to the same long random topic) and/or `AUTOMATION_WEBHOOK_URL` (Slack/Discord incoming webhook).

## Still needs you (rarely)
- Accepting new Apple/Google developer agreements.
- Renewing a key that expires or is revoked: `ctl.mjs check` and the worker tell you which one.
