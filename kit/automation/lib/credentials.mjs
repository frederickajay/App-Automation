// Checks that a machine has every non-interactive credential and tool its jobs need,
// so a missing key becomes one question at the start instead of a failure mid-run.
// Nothing here prints secret values: only whether they exist and work.
import fs from 'node:fs';
import { run, claudeBin, repoPath } from './util.mjs';

const has = (name) => Boolean(process.env[name]);
const fileVar = (name) => has(name) && fs.existsSync(process.env[name]);

/** neededRepos: repo keys this machine's jobs work in (the home repo is always needed for state). */
/** forRelease: also require store/signing keys (only the release jobs need them). */
export function checkCredentials(config, machine, neededRepos = Object.keys(config.repos), { forRelease = true } = {}) {
  if (process.env.AUTOMATION_SKIP_CREDENTIAL_CHECK === '1') return { ok: true, problems: [] }; // dry runs only
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };
  const tool = (cmd, args, msg) => ok(run(cmd, args, { timeoutMs: 60000 }).code === 0, msg);

  tool(claudeBin(), ['--version'], 'Claude Code CLI not found (install it and sign in with `claude auth login`)');
  tool('git', ['--version'], 'git not found');
  const home = Object.keys(config.repos)[0];
  for (const key of new Set([home, ...neededRepos])) {
    const p = repoPath(config, key);
    if (!fs.existsSync(p)) { problems.push(`Repo "${key}" not found at ${p} (set repos.${key}.path in automation/config.local.json)`); continue; }
    const r = config.repos[key].remote || 'origin';
    ok(run('git', ['ls-remote', '--heads', r], { cwd: p, timeoutMs: 60000 }).code === 0, `Can't reach git remote "${r}" for ${key} (set up a GitHub token or SSH key)`);
  }

  if (machine === 'mac') {
    tool('xcodebuild', ['-version'], 'Xcode not found (xcodebuild)');
    tool('xcrun', ['simctl', 'list', 'devices', 'available'], 'iOS simulators not available (xcrun simctl)');
    ok(run('fastlane', ['--version'], { timeoutMs: 120000 }).code === 0 || run('bundle', ['exec', 'fastlane', '--version'], { timeoutMs: 120000 }).code === 0, 'fastlane not found (brew install fastlane, or add it to your Gemfile)');
    if (forRelease) {
      ok(has('ASC_KEY_ID') && has('ASC_ISSUER_ID'), 'App Store Connect API key IDs missing (ASC_KEY_ID, ASC_ISSUER_ID)');
      ok(fileVar('ASC_KEY_PATH'), 'App Store Connect .p8 key file missing (ASC_KEY_PATH)');
      ok(has('MATCH_PASSWORD') && has('MATCH_GIT_URL'), 'Code signing (fastlane match) not configured (MATCH_GIT_URL, MATCH_PASSWORD)');
    }
  }

  if (machine === 'windows') {
    ok(run('java', ['-version'], { timeoutMs: 60000 }).code === 0, 'Java (JDK 17+) not found');
    ok(has('ANDROID_HOME') || has('ANDROID_SDK_ROOT'), 'Android SDK not found (ANDROID_HOME)');
    tool('adb', ['version'], 'adb not found on PATH (Android platform-tools)');
    ok(run('fastlane', ['--version'], { timeoutMs: 120000 }).code === 0 || run('bundle', ['exec', 'fastlane', '--version'], { timeoutMs: 120000 }).code === 0, 'fastlane not found');
    if (forRelease) {
      ok(fileVar('PLAY_JSON_KEY'), 'Google Play service account JSON missing (PLAY_JSON_KEY)');
      ok(fileVar('ANDROID_KEYSTORE_PATH') && has('ANDROID_KEYSTORE_PASSWORD') && has('ANDROID_KEY_ALIAS'), 'Android upload keystore not configured (ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD)');
    }
  }

  // Optional clouds: only checked if you set the variables, so unused ones don't nag.
  if (has('AWS_PROFILE') || has('AWS_ACCESS_KEY_ID')) tool('aws', ['sts', 'get-caller-identity'], 'AWS credentials set but not working (aws sts get-caller-identity)');
  if (has('GOOGLE_APPLICATION_CREDENTIALS')) ok(fileVar('GOOGLE_APPLICATION_CREDENTIALS'), 'GOOGLE_APPLICATION_CREDENTIALS points to a missing file');

  return { ok: problems.length === 0, problems };
}
