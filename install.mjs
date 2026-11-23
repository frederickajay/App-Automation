#!/usr/bin/env node
// Installs (or updates) the automation kit into an app repo.
//   node install.mjs /path/to/MyApp-ios                 first install
//   node install.mjs /path/to/MyApp-android             same kit in the Android repo
//   node install.mjs /path/to/repo --update             refresh scripts, skills, agents, hooks (keeps your config, spec and outputs)
// Never deletes anything in the target repo. Existing files you've customised are kept unless --update.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'kit');
const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
const update = args.includes('--update');
if (!target) { console.log('Usage: node install.mjs <app repo path> [--update]'); process.exit(1); }
const repo = path.resolve(target);
if (!fs.existsSync(path.join(repo, '.git'))) { console.error(`${repo} is not a git repository (run git init first, and add a GitHub remote).`); process.exit(1); }

const done = [];
// Files that are yours after install: never overwritten, even with --update.
const USER_OWNED = [/^automation\/config\.json$/, /^automation\/stages\.json$/, /^automation\/inputs\//, /^automation\/l10n\//, /^automation\/decisions\.md$/];
// Files that --update refreshes.
const KIT_OWNED = [/^automation\/(lib|tools|fastlane)\//, /^automation\/ctl\.mjs$/, /^automation\/secrets\/(load-secrets|\.env\.example)/, /^\.claude\/(agents|skills|hooks)\//];

function copyTree(rel) {
  const src = path.join(KIT, rel);
  if (fs.statSync(src).isDirectory()) { for (const f of fs.readdirSync(src)) copyTree(path.join(rel, f)); return; }
  const relPosix = rel.split(path.sep).join('/');
  const dst = path.join(repo, rel);
  const exists = fs.existsSync(dst);
  if (exists && (USER_OWNED.some((r) => r.test(relPosix)) || !(update && KIT_OWNED.some((r) => r.test(relPosix))))) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  if (/\.(mjs|sh)$/.test(dst)) fs.chmodSync(dst, 0o755);
  done.push(`${exists ? 'updated' : 'added  '} ${relPosix}`);
}

copyTree('automation');
for (const sub of ['agents', 'skills', 'hooks']) copyTree(path.join('.claude', sub));

// .claude/settings.json: merge permissions and hooks into what's there.
const settingsPath = path.join(repo, '.claude', 'settings.json');
const kitSettings = JSON.parse(fs.readFileSync(path.join(KIT, '.claude', 'settings.json'), 'utf8'));
if (!fs.existsSync(settingsPath)) {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(kitSettings, null, 2) + '\n');
  done.push('added   .claude/settings.json');
} else {
  const cur = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  cur.permissions ??= {};
  for (const k of ['allow', 'deny']) cur.permissions[k] = [...new Set([...(cur.permissions[k] || []), ...kitSettings.permissions[k]])];
  cur.hooks ??= {};
  for (const [event, groups] of Object.entries(kitSettings.hooks)) {
    const existing = cur.hooks[event] || [];
    const have = new Set(existing.flatMap((g) => g.hooks.map((h) => h.command)));
    cur.hooks[event] = [...existing, ...groups.filter((g) => g.hooks.some((h) => !have.has(h.command)))];
  }
  fs.writeFileSync(settingsPath, JSON.stringify(cur, null, 2) + '\n');
  done.push('merged  .claude/settings.json (your existing rules and hooks kept)');
}

// CLAUDE.md: add the automation section once (refresh it with --update).
const claudeMd = path.join(repo, 'CLAUDE.md');
const section = fs.readFileSync(path.join(KIT, 'CLAUDE.automation.md'), 'utf8');
const START = '<!-- automation:start -->', END = '<!-- automation:end -->';
const block = `${START}\n${section.trim()}\n${END}\n`;
let md = fs.existsSync(claudeMd) ? fs.readFileSync(claudeMd, 'utf8') : '';
if (!md.includes(START)) { md = (md ? md.trimEnd() + '\n\n' : '') + block; done.push('updated CLAUDE.md (automation section added)'); }
else if (update) { md = md.replace(new RegExp(`${START}[\\s\\S]*?${END}\\n?`), block); done.push('updated CLAUDE.md (automation section refreshed)'); }
fs.writeFileSync(claudeMd, md);

// .gitignore: local-only folders and secrets.
const gi = path.join(repo, '.gitignore');
const want = ['.automation-state/', '.automation-merge/', '.automation-jobs/', '.derived-data/', 'automation/logs/', 'automation/config.local.json', 'automation/secrets/.env', '*.p8', '*.jks', '*.keystore'];
const cur = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
const missing = want.filter((l) => !cur.split(/\r?\n/).includes(l));
if (missing.length) {
  fs.writeFileSync(gi, cur.trimEnd() + (cur ? '\n\n' : '') + '# App automation\n' + missing.join('\n') + '\n');
  done.push(`updated .gitignore (+${missing.length} lines)`);
}

console.log(done.length ? done.join('\n') : 'Nothing to do (already installed). Use --update to refresh the kit files.');
console.log(`\nNext: edit automation/config.json and automation/inputs/requirements.md in ${repo}, commit, push, then follow README.md "Start".`);
