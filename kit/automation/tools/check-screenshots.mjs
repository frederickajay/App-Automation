#!/usr/bin/env node
// Screenshot gate: every language has the full set for every device.
//   node automation/tools/check-screenshots.mjs ios       (fastlane/screenshots/<lang>/<device>-*.png)
//   node automation/tools/check-screenshots.mjs android   (fastlane/metadata/android/<lang>/images/phoneScreenshots/*.png)
import fs from 'node:fs';
import path from 'node:path';
import { HOME_REPO, loadConfig } from '../lib/util.mjs';

const platform = process.argv[2];
const root = process.argv[3] || process.cwd() || HOME_REPO;
const config = loadConfig();
const devices = config.checks.screenshotDevices[platform] || [];
const perDevice = config.checks.screenshotsPerDevice || 5;
let bad = 0;

const pngs = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => /\.(png|jpe?g)$/i.test(f)) : []);

for (const appLang of config.app.languages) {
  const missing = [];
  const lang = config.app.storeLocales?.[platform]?.[appLang] || appLang; // store folder name
  if (platform === 'ios') {
    const files = pngs(path.join(root, 'fastlane', 'screenshots', lang));
    for (const dev of devices) {
      const n = files.filter((f) => f.startsWith(dev)).length;
      if (n < perDevice) missing.push(`${dev}: ${n}/${perDevice}`);
    }
  } else if (platform === 'android') {
    const n = pngs(path.join(root, 'fastlane', 'metadata', 'android', lang, 'images', 'phoneScreenshots')).length;
    if (n < perDevice) missing.push(`phone: ${n}/${perDevice}`);
  } else { console.error('Usage: check-screenshots.mjs ios|android [repo root]'); process.exit(2); }
  console.log(`${missing.length ? '✗' : '✓'} ${lang.padEnd(8)} ${missing.join(', ') || 'complete'}`);
  bad += missing.length;
}
process.exit(bad ? 1 : 0);
