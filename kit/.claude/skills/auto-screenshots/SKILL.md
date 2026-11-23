---
name: auto-screenshots
description: Pipeline job. Takes store screenshots in every language with fastlane (snapshot on iOS, screengrab on Android), one device at a time.
argument-hint: ios|android
arguments: [platform]
disable-model-invocation: true
---

# Screenshots ($platform)

Needs UI tests that navigate to the screens worth showing (5 per device by default, `checks.screenshotsPerDevice`). Pick the screens that best show the main ACs; list them in `automation/marketing/screenshot-plan.md` if it doesn't exist yet.

- ios: `fastlane snapshot` with a `Snapfile` that sets `devices` to `checks.screenshotDevices.ios`, `languages` to the store locales in `app.storeLocales.ios`, `concurrent_simulators(false)`, `erase_simulator(true)`, `derived_data_path(".derived-data")`. Output: `fastlane/screenshots/<locale>/`.
- android: `fastlane screengrab` with locales from `app.storeLocales.android`, output under `fastlane/metadata/android/<locale>/images/phoneScreenshots/`.

Memory: run one device at a time (one fastlane run per device if needed) and shut simulators/emulators down between runs.

Done when `node automation/tools/check-screenshots.mjs $platform` exits 0. Screenshots are binary files: commit them (Git LFS if the repo uses it).
