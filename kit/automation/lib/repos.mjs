// Git work the orchestrator does on your behalf, in private worktrees under
// <home repo>/.automation-merge/<repo>, so your own checkouts are never touched.
import fs from 'node:fs';
import path from 'node:path';
import { HOME_REPO, git, repoPath, runShell, log, now } from './util.mjs';

const SHARED_PATHS = [
  'automation/config.json', 'automation/spec.md', 'automation/design', 'automation/l10n', 'automation/decisions.md',
  'automation/handoffs', 'automation/reviews', 'automation/marketing/captions', 'automation/inputs',
];

export class Repos {
  constructor(config) { this.config = config; }

  remote(key) { return this.config.repos[key].remote || 'origin'; }
  main(key) { return this.config.repos[key].mainBranch || 'main'; }

  /** Worktree on the main branch, up to date with the remote. Created on first use. */
  worktree(key) {
    const dir = path.join(HOME_REPO, '.automation-merge', key);
    const src = repoPath(this.config, key);
    const remote = this.remote(key), main = this.main(key);
    if (!fs.existsSync(path.join(dir, '.git'))) {
      git(src, ['fetch', remote, main], { check: true });
      git(src, ['worktree', 'add', '--detach', dir, `${remote}/${main}`], { check: true });
    }
    git(dir, ['fetch', '--quiet', remote], { check: true });
    git(dir, ['checkout', '--quiet', '--detach', `${remote}/${main}`], { check: true });
    git(dir, ['reset', '--quiet', '--hard', `${remote}/${main}`], { check: true });
    git(dir, ['clean', '-fdq']);
    return dir;
  }

  branchExists(key, branch) {
    const r = git(repoPath(this.config, key), ['ls-remote', '--heads', this.remote(key), branch]);
    return r.code === 0 && r.stdout.trim().length > 0;
  }

  /** Read automation/results/<job>.json from a pushed job branch. */
  readResult(key, branch, jobId) {
    const dir = this.worktree(key);
    git(dir, ['fetch', '--quiet', this.remote(key), branch], { check: true });
    const r = git(dir, ['show', `FETCH_HEAD:automation/results/${jobId}.json`]);
    if (r.code !== 0) return { error: `Branch ${branch} has no automation/results/${jobId}.json` };
    try { return { result: JSON.parse(r.stdout), commit: git(dir, ['rev-parse', 'FETCH_HEAD']).stdout.trim() }; }
    catch (e) { return { error: `Result file is not valid JSON: ${e.message}` }; }
  }

  /** Run the job's independent check on the branch, then merge it into main and push. */
  verifyAndMerge(key, branch, job) {
    const dir = this.worktree(key);
    const remote = this.remote(key), main = this.main(key);
    git(dir, ['fetch', '--quiet', remote, branch], { check: true });

    if (job.verify) {
      git(dir, ['checkout', '--quiet', '--detach', 'FETCH_HEAD'], { check: true });
      const v = runShell(job.verify, { cwd: dir });
      git(dir, ['checkout', '--quiet', '--detach', `${remote}/${main}`]);
      if (v.code !== 0) return { ok: false, reason: `Independent check failed: ${job.verify}\n${(v.stdout + v.stderr).trim().slice(-1500)}` };
    }

    const m = git(dir, ['merge', '--no-ff', '--quiet', '-m', `automation: merge ${branch}`, 'FETCH_HEAD']);
    if (m.code !== 0) {
      git(dir, ['merge', '--abort']);
      return { ok: false, conflict: true, reason: `Merge conflict merging ${branch} into ${main}` };
    }
    const p = git(dir, ['push', '--quiet', remote, `HEAD:${main}`]);
    if (p.code !== 0) return { ok: false, reason: `Push to ${main} failed: ${p.stderr.trim()}` };
    return { ok: true, commit: git(dir, ['rev-parse', 'HEAD']).stdout.trim() };
  }

  /** Append lines to automation/decisions.md on main in the home repo (other repos get it via syncShared). */
  appendDecisions(lines) {
    for (const key of Object.keys(this.config.repos).slice(0, 1)) {
      try {
        const dir = this.worktree(key);
        const f = path.join(dir, 'automation', 'decisions.md');
        fs.mkdirSync(path.dirname(f), { recursive: true });
        if (!fs.existsSync(f)) fs.writeFileSync(f, '# Decisions\n\nEvery decision the pipeline made or you answered. Jobs read this before starting.\n');
        const cur = fs.readFileSync(f, 'utf8');
        fs.appendFileSync(f, (cur.endsWith('\n') ? '' : '\n') + lines.map((l) => `- ${now().slice(0, 10)} ${l}`).join('\n') + '\n');
        this.commitPush(key, dir, 'automation: record decisions');
      } catch (e) { log(`Could not record decisions in ${key}: ${e.message}`); }
    }
  }

  /** Copy shared artifacts (spec, design, strings, decisions...) from the home repo into another repo. */
  syncShared(fromKey, toKey) {
    if (fromKey === toKey) return;
    const from = this.worktree(fromKey), to = this.worktree(toKey);
    for (const p of SHARED_PATHS) {
      const src = path.join(from, p);
      if (!fs.existsSync(src)) continue;
      fs.rmSync(path.join(to, p), { recursive: true, force: true });
      fs.cpSync(src, path.join(to, p), { recursive: true });
    }
    this.commitPush(toKey, to, `automation: sync shared artifacts from ${fromKey}`);
  }

  commitPush(key, dir, message) {
    git(dir, ['add', '-A']);
    if (git(dir, ['diff', '--cached', '--quiet']).code === 0) return;
    git(dir, ['commit', '--quiet', '-m', message], { check: true });
    git(dir, ['push', '--quiet', this.remote(key), `HEAD:${this.main(key)}`], { check: true });
  }
}
