---
name: auto-test
description: Pipeline job. Writes all unit and UI tests and runs them in the iOS simulator or Android emulator, fixing bugs until clean (tester agent, Sonnet).
argument-hint: ios|android
arguments: [platform]
disable-model-invocation: true
---

# Test until clean ($platform)

This runs on the Mac (ios) or Windows PC (android). Memory is limited: one simulator/emulator, one device size, at most 2 agents at a time.

1. Use the `tester` agent. It maps every AC in `automation/spec.md` to tests and writes the missing unit and UI tests.
2. Run:
   - ios: pick one simulator from `xcrun simctl list devices available` (prefer the first device in `config.checks.screenshotDevices.ios`), boot only that one, then
     `xcodebuild test -scheme <scheme> -destination 'platform=iOS Simulator,name=<device>' -derivedDataPath .derived-data -resultBundlePath .derived-data/tests.xcresult`
   - android: start one emulator (`emulator -avd <name> -no-snapshot-save -no-audio -no-window` if none is running), then `./gradlew testDebugUnitTest connectedDebugAndroidTest`.
3. Fix failures (app bugs first). Repeat until the full suite passes **twice in a row**. Show both final runs' summaries in the session.
4. Write `automation/reviews/test-coverage-$platform.md` (AC → tests) and record the commit you tested in it.
5. Shut down: `xcrun simctl shutdown all` / `adb emu kill`.
If the build can't run because of signing or a missing tool, end "blocked" naming exactly what's missing.
