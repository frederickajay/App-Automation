---
name: auto-release
description: Pipeline job. Uploads the build, localized metadata and screenshots to App Store Connect (ios) or Google Play (android) with fastlane.
argument-hint: ios|android
arguments: [platform]
disable-model-invocation: true
---

# Release ($platform)

Use the `release-manager` agent. Credentials are environment variables only (see `automation/SETUP-KEYS.md`); never print them.

- ios (Mac): fastlane lane `release` (template: `automation/fastlane/Fastfile.ios.example`): API key auth (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_PATH`), `match` for signing, bump build number, `build_app` with `derived_data_path: ".derived-data"`, frame screenshots if `title.strings` exist, `deliver` with `precheck_include_in_app_purchases: false`, `submit_for_review` only if `approvals.storeSubmission` is "automatic" in the config.
- android (Windows): lane `release` (template: `automation/fastlane/Fastfile.android.example`): `bundleRelease` signed from env vars, `supply` with `PLAY_JSON_KEY` to the configured track.

Check before uploading: every locale has metadata within limits and screenshots (`check-screenshots`). After uploading, write the version, build number and store status to `automation/handoffs/release-$platform.md`.
If Apple/Google reject or flag anything, end "blocked" with their exact message and your proposed fix.
