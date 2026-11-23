#!/usr/bin/env node
// PreToolUse(Bash): blocks commands that could leak secrets or damage the repo.
// Exit 2 = block; stderr is shown to Claude so it can take another route.
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let cmd = '';
  try { cmd = JSON.parse(input).tool_input?.command || ''; } catch { process.exit(0); }
  const job = process.env.AUTOMATION_JOB;

  const rules = [
    [/\b(cat|less|more|head|tail|type|bat|xxd|base64|od|strings|cp|scp|curl\s+.*-F|curl\s+.*--data-binary)\b[^|;&]*(\.p8|\.p12|\.jks|\.keystore|service[-_]account[^\s]*\.json|\.env\b|\.env\.|automation\/secrets\/)/i,
      'Reading or copying key files is blocked. Pass the file path to the tool that needs it (fastlane reads it from the env var) instead of reading it.'],
    [/^\s*(env|printenv|set|export\s+-p)\s*($|[|;>])/m, 'Dumping the environment is blocked (it contains credentials). Check one variable with: [ -n "$NAME" ] && echo set'],
    [/\becho\s+[^|;&]*\$\{?(\w*(KEY|TOKEN|SECRET|PASSWORD|PASS)\w*)/i, 'Printing a credential variable is blocked. Check it is set with: [ -n "$NAME" ] && echo set'],
    [/\bgit\s+push\b[^|;&]*(\s--force\b|\s-f\b|\s--force-with-lease\b)/, 'Force-push is blocked.'],
    [/\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\$HOME)(\s|$)/i, 'Deleting the root or home folder is blocked.'],
    [/\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f)\b[^|;&]*\b(origin\/)?main\b/, 'Resetting or cleaning main is blocked.'],
  ];
  if (job) rules.push([/\bgit\s+push\b[^|;&]*\s(HEAD:)?(main|master)\b/, 'Pipeline jobs push only to their job branch (named in the prompt), never to main.']);

  for (const [re, msg] of rules) {
    if (re.test(cmd)) { process.stderr.write(`Blocked by automation guard: ${msg}\n`); process.exit(2); }
  }
  process.exit(0);
});
