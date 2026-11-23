#!/usr/bin/env node
// Dry run: stands in for the real `claude` CLI so you can test the pipeline plumbing without using any Claude usage.
// AUTOMATION_CLAUDE_BIN=automation/tools/dry-run-claude.mjs AUTOMATION_SKIP_CREDENTIAL_CHECK=1 node automation/ctl.mjs tick
// FAKE_MODE can contain: block (ideate asks a question), fail (design fails), resume (audit finds work done), badl10n.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('9.9.9 (fake)'); process.exit(0); }
const cloud = a[0] === '--cloud';
const prompt = cloud ? a[1] : a[a.indexOf('-p') + 1];
const job = prompt.match(/pipeline job "([^"]+)" \(attempt (\d+)\)/);
const branch = prompt.match(/branch named exactly (\S+?) \(/)[1];
const [_, id, attempt] = job;
const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
{ // Safety: a dry run merges fake files into main, so only allow local test remotes.
  const url = g(process.cwd(), 'remote', 'get-url', 'origin').trim();
  if (!/^(\/|file:|[A-Za-z]:\\)/.test(url)) { console.error(`dry-run-claude refuses to run against ${url}. Use a local test copy (see README "Dry run").`); process.exit(1); }
}
let work = process.cwd();
if (cloud) { // cloud clones the remote at the current branch
  const url = g(process.cwd(), 'remote', 'get-url', 'origin').trim();
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-')); g(work, 'clone', '-q', url, '.');
}
const cfg = JSON.parse(fs.readFileSync(path.join(work, 'automation/config.json'), 'utf8'));
let status = 'done', questions = [];
const mode = process.env.FAKE_MODE || '';
if (id === 'ideate' && attempt === '1' && mode.includes('block')) { status = 'blocked'; questions = [{ question: 'Free tier: 3 or 5 workouts?', options: ['3', '5'], why: 'I would pick 3' }]; }
if (id === 'design' && mode.includes('fail')) status = 'failed';
if (id === 'audit') fs.writeFileSync(path.join(work, 'automation/reviews/audit.md'), 'audit\n');
if (id === 'ideate') fs.writeFileSync(path.join(work, 'automation/spec.md'), '# Spec\nAC-1\n' + (prompt.includes('ANSWER') ? 'got answer\n' : ''));
if (id === 'translate') {
  fs.writeFileSync(path.join(work, 'automation/l10n/strings.source.json'), JSON.stringify({ 'home.title': { value: 'Hello {0}', comment: 'title' } }));
  fs.mkdirSync(path.join(work, 'automation/l10n/translations'), { recursive: true });
  for (const l of cfg.app.languages) if (l !== 'en') fs.writeFileSync(path.join(work, `automation/l10n/translations/${l}.json`), JSON.stringify({ 'home.title': (mode.includes('badl10n') && l === 'de') ? 'Hallo' : `${l} {0}` }));
}
if (id.startsWith('screenshots')) {
  const p = id.endsWith('ios') ? 'ios' : 'android';
  for (const l of cfg.app.languages) {
    const loc = cfg.app.storeLocales[p][l];
    const d = p === 'ios' ? path.join(work, 'fastlane/screenshots', loc) : path.join(work, 'fastlane/metadata/android', loc, 'images/phoneScreenshots');
    fs.mkdirSync(d, { recursive: true });
    for (const dev of (p === 'ios' ? cfg.checks.screenshotDevices.ios : ['phone'])) for (let i = 0; i < cfg.checks.screenshotsPerDevice; i++) fs.writeFileSync(path.join(d, `${dev}-${i}.png`), 'x');
  }
}
fs.mkdirSync(path.join(work, 'automation/results'), { recursive: true });
const result = { jobId: id, attempt: Number(attempt), status, summary: `fake ${status} ${id} on ${cloud ? 'cloud' : process.env.AUTOMATION_MACHINE}`, questions, decisions: [`fake decision from ${id}`] };
if (id === 'audit' && mode.includes('resume')) result.jobsAlreadyDone = ['ideate', 'design'];
fs.writeFileSync(path.join(work, `automation/results/${id}.json`), JSON.stringify(result));
fs.writeFileSync(path.join(work, `automation/handoffs/${id}.md`), 'handoff\n');
g(work, 'checkout', '-q', '-b', branch); g(work, 'add', '-A'); g(work, 'commit', '-q', '-m', `job ${id}`); g(work, 'push', '-q', '-u', 'origin', branch);
if (cloud) console.log(`Created cloud session.\nSession ID: session_${id}_${attempt}\nView: https://claude.ai/code/session_${id}_${attempt}?from=cli`);
else console.log(JSON.stringify(result));
