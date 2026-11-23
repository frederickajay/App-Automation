#!/usr/bin/env node
// Translation gate. Exits 0 only if every language is complete and safe to ship.
//   automation/l10n/strings.source.json   { "key": { "value": "Hi {0}", "comment": "...", "maxLength": 30 } }
//   automation/l10n/translations/<lang>.json   { "key": "Hallo {0}" }
// Checks: missing/empty keys, placeholder mismatch ({0}, {1}...), length limits, unknown keys.
import fs from 'node:fs';
import path from 'node:path';
import { AUTOMATION_DIR, loadConfig, readJson } from '../lib/util.mjs';

const config = loadConfig();
const dir = path.join(AUTOMATION_DIR, 'l10n');
const source = readJson(path.join(dir, 'strings.source.json'), null);
if (!source) { console.error('Missing automation/l10n/strings.source.json'); process.exit(1); }

const ratio = config.checks?.maxTranslationLengthRatio || 1.6;
const placeholders = (s) => (String(s).match(/\{\d+\}/g) || []).sort().join(',');
const langs = config.app.languages.filter((l) => l !== config.app.sourceLanguage);
const report = {};
let problems = 0;

for (const lang of langs) {
  const issues = [];
  const t = readJson(path.join(dir, 'translations', `${lang}.json`), null);
  if (!t) { issues.push('translation file missing'); }
  else {
    for (const [key, src] of Object.entries(source)) {
      const v = t[key];
      if (typeof v !== 'string' || !v.trim()) { issues.push(`${key}: missing`); continue; }
      if (placeholders(v) !== placeholders(src.value)) issues.push(`${key}: placeholders ${placeholders(v) || 'none'} ≠ source ${placeholders(src.value) || 'none'}`);
      const limit = src.maxLength || Math.ceil(src.value.length * ratio) + 10;
      if ([...v].length > limit) issues.push(`${key}: ${[...v].length} chars > limit ${limit}`);
    }
    for (const key of Object.keys(t)) if (!(key in source)) issues.push(`${key}: not in source (remove it)`);
  }
  report[lang] = issues;
  problems += issues.length;
}

const total = Object.keys(source).length;
for (const [lang, issues] of Object.entries(report)) {
  console.log(`${issues.length ? '✗' : '✓'} ${lang.padEnd(8)} ${issues.length ? issues.length + ' problem(s)' : `${total}/${total} strings`}`);
  for (const i of issues.slice(0, 15)) console.log(`    ${i}`);
  if (issues.length > 15) console.log(`    …and ${issues.length - 15} more`);
}
fs.mkdirSync(path.join(AUTOMATION_DIR, 'reviews'), { recursive: true });
fs.writeFileSync(path.join(AUTOMATION_DIR, 'reviews', 'strings-check.json'), JSON.stringify(report, null, 2) + '\n');
process.exit(problems ? 1 : 0);
