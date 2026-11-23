// A worker runs on the Mac (Xcode jobs) or the Windows PC (Android emulator jobs).
// It only takes jobs queued for its machine, one at a time, each in a fresh `claude -p` session.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, loadStages, repoPath, runLogged, runShell, git, claudeBin, log, now, sleep, AUTOMATION_DIR, HOME_REPO } from './util.mjs';
import { State } from './state.mjs';
import { checkCredentials } from './credentials.mjs';

export class Worker {
  constructor(machine) {
    process.env.AUTOMATION_ROLE = `worker-${machine}`;
    this.machine = machine;
    this.config = loadConfig();
    this.mcfg = this.config.machines[machine];
    if (!this.mcfg || machine === 'cloud') throw new Error(`Machine "${machine}" isn't a local machine in config.machines`);
    this.stages = loadStages().filter((j) => j.machine === machine);
    this.state = new State(this.config).init();
  }

  async loop({ once = false } = {}) {
    log(`Worker "${this.machine}" started. Jobs it can take: ${this.stages.map((j) => j.id).join(', ') || 'none'}`);
    const creds = checkCredentials(this.config, this.machine, [...new Set(this.stages.map((j) => j.repo))]);
    if (!creds.ok) log('Credential problems (jobs needing them will fail until fixed):\n - ' + creds.problems.join('\n - '));
    for (;;) {
      try { await this.tick(creds); } catch (e) { log('Worker error:', e.stack || e.message); }
      if (once) return;
      await sleep((this.config.state.pollSeconds || 60) * 1000);
    }
  }

  async tick(creds) {
    this.state.pull();
    if (this.state.control().paused) return;
    const job = this.stages.find((j) => {
      const st = this.state.job(j.id);
      return st.status === 'queued' && !this.state.claim(j.id, st.attempt);
    });
    if (!job) return;
    const st = this.state.job(job.id);

    // Claim it. If another worker on the same machine type won the race, the push fails and we back off.
    this.state.setClaim(job.id, st.attempt, { status: 'running', startedAt: now(), machine: this.machine });
    if (!this.state.commit(`automation: ${this.machine} claims ${job.id}`)) return;

    if (!creds.ok) {
      return this.report(job, st, { status: 'error', error: `Credentials missing on this machine: ${creds.problems.join('; ')}` });
    }
    await this.runJob(job, st);
  }

  async runJob(job, st) {
    const repo = repoPath(this.config, job.repo);
    const remote = this.config.repos[job.repo].remote || 'origin';
    const main = this.config.repos[job.repo].mainBranch || 'main';
    const env = { ...(this.mcfg.env || {}), AUTOMATION_JOB: job.id, AUTOMATION_ATTEMPT: String(st.attempt), AUTOMATION_MACHINE: this.machine };
    const logFile = path.join(AUTOMATION_DIR, 'logs', `${job.id}-a${st.attempt}.log`);

    // Work in a dedicated worktree on a fresh copy of main, so your own checkout is untouched.
    const wt = path.join(HOME_REPO, '.automation-jobs', `${job.repo}`);
    git(repo, ['fetch', '--quiet', remote, main]);
    if (!fs.existsSync(path.join(wt, '.git'))) git(repo, ['worktree', 'add', '--detach', wt, `${remote}/${main}`], { check: true });
    git(wt, ['fetch', '--quiet', remote]);
    git(wt, ['checkout', '--quiet', '--detach', '--force', `${remote}/${main}`], { check: true });
    git(wt, ['clean', '-fdq', '-e', '.derived-data']);

    for (const c of this.mcfg.beforeJob || []) runShell(c, { cwd: wt, env });
    log(`Running ${job.id} (attempt ${st.attempt}) on ${this.machine}. Log: ${logFile}`);

    const prompt = fs.readFileSync(this.state.file('jobs', `${job.id}.prompt.txt`), 'utf8');
    const args = ['-p', prompt, '--permission-mode', this.config.claude.permissionMode || 'auto', '--output-format', 'text'];
    if (job.model) args.push('--model', job.model);
    const code = await runLogged(claudeBin(), args, { cwd: wt, env, logFile, timeoutMs: this.config.claude.localJobTimeoutMinutes * 60000 });

    for (const c of this.mcfg.afterJob || []) runShell(c, { cwd: wt, env });
    if (this.mcfg.cleanDerivedDataAfterJob) {
      // Only this pipeline's build folder (skills build with -derivedDataPath .derived-data);
      // your other projects' DerivedData is left alone.
      fs.rmSync(path.join(wt, '.derived-data'), { recursive: true, force: true });
    }

    // Safety net: if Claude wrote a result but didn't push, push it now.
    const branch = st.branch;
    const hasResult = fs.existsSync(path.join(wt, 'automation', 'results', `${job.id}.json`));
    const pushed = git(repo, ['ls-remote', '--heads', remote, branch]).stdout.trim().length > 0;
    if (hasResult && !pushed) {
      git(wt, ['checkout', '-B', branch]);
      git(wt, ['add', '-A']);
      git(wt, ['commit', '--quiet', '-m', `automation: ${job.id} attempt ${st.attempt} (pushed by worker)`]);
      git(wt, ['push', '--quiet', '-u', remote, branch]);
    }

    const tail = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').slice(-4000) : '';
    if (!hasResult) {
      const usageLimit = /usage limit|rate[_ ]limit|limit reached|resets? at/i.test(tail);
      return this.report(job, st, { status: 'error', usageLimit, error: `claude exited ${code} without writing a result. Last output: ${tail.slice(-500)}` });
    }
    return this.report(job, st, { status: 'reported', exitCode: code, finishedAt: now() });
  }

  report(job, st, patch) {
    this.state.setClaim(job.id, st.attempt, patch);
    this.state.event({ type: 'worker', job: job.id, status: patch.status, message: patch.error?.slice(0, 200) });
    this.state.commit(`automation: ${this.machine} reports ${job.id}`);
    log(`${job.id}: ${patch.status}${patch.error ? ' - ' + patch.error.slice(0, 200) : ''}`);
  }
}
