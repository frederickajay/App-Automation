---
name: auto-build
description: Pipeline job. Implements the app on one platform (ios or android) from the spec and designs, using the developer agent (Opus).
argument-hint: ios|android
arguments: [platform]
disable-model-invocation: true
---

# Build ($platform)

1. Read `automation/spec.md`, `automation/design/`, `automation/decisions.md`, and the existing code. Make a short plan in `automation/handoffs/build-$platform.plan.md`: ACs → files/modules.
2. Delegate implementation to the `developer` agent in focused chunks (one feature or screen per request), so each runs in a clean context.
   - ios: Swift/SwiftUI. Strings via the String Catalog: run `node automation/tools/export-strings.mjs --ios <path to Localizable.xcstrings>`.
   - android: Kotlin/Compose in this (Android) repo. Strings via `node automation/tools/export-strings.mjs --android app/src/main/res`.
3. You're in a cloud session: no Xcode/emulator. Run what you can (Gradle on Linux for Android: `./gradlew assembleDebug testDebugUnitTest`; for iOS, `swift build` only works for pure Swift packages). Device tests happen in the next job.
4. Ask the `reviewer` agent to review the diff into `automation/reviews/code-$platform.md`. Fix blocking issues.
5. In the handoff, list anything the test job should look at first.
