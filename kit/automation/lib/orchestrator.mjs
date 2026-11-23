// The orchestrator: decides which job runs next, starts cloud jobs, queues Mac/Windows jobs
// for their workers, collects results from job branches, merges them, and turns blockers
// into questions for you. It's light: run it on whichever machine is on most (or both, never twice).
import fs from 'node:fs';
import { loadConfig, loadStages, run, claudeBin, log, now, sleep } from './util.mjs';
import { State } from './state.mjs';
import { Repos } from './repos.mjs';
import { buildPrompt, jobBranch } from './prompt.mjs';
import { notify } from './notify.mjs';
import { snapshot, writeHtml } from './dashboard.mjs';

const MAX_ATTEMPTS = 3;
const FINISHED = new Set(['done', 'skipped']);

export class Orchestrator {
  constructor() {
    process.env.AUTOMATION_ROLE = 'orchestrator';
    this.config = loadConfig();
    this.stages = loadStages();
    this.state = new State(this.config).init();
    this.repos = new Repos(this.config);
    this.byId = Object.fromEntries(this.stages.map((s) => [s.id, s]));
  }

  async loop({ once = false } = {}) {
    log(`Orchestrator started for ${this.config.app.name}. Dashboard: ${this.state.file('dashboard.html')}`);
    for (;;) {
      try { await this.tick(); } catch (e) { log('Tick error:', e.stack || e.message); }
      if (once) return;
      await sleep((this.config.state.pollSeconds || 60) * 1000);
    }
  }

  async tick() {
    const s = this.state;
    s.pull();

    await this.collectAnswers();

    for (const job of this.stages) {
      const st = s.job(job.id);
      if (st.status === 'running' || st.status === 'queued') await this.checkJob(job, st);
    }

    const ctl = s.control();
    if (ctl.paused && ctl.resumeAt && ctl.resumeAt <= now()) {
      s.setControl({ paused: false, reason: '', resumeAt: null });
      s.event({ type: 'resume', message: 'auto-resumed after usage pause' });
    }
    if (!s.control().paused) {
      for (const job of this.stages) {
        const st = s.job(job.id);
        if (this.isReady(job, st)) await this.launch(job, st);
      }
    }

    writeHtml(s.file('dashboard.html'), snapshot(s, this.stages));
    s.commit('automation: orchestrator tick');
    this.checkAllDone();
  }

  isReady(job, st) {
    if (st.status !== 'pending' && st.status !== 'stale') return false;
    if (job.id !== 'audit' && this.state.job('audit').status !== 'done' && this.byId.audit) return false;
    if (!job.dependsOn.every((d) => FINISHED.has(this.state.job(d).status))) return false;
    if (job.machine === 'cloud') {
      const running = this.stages.filter((j) => j.machine === 'cloud' && this.state.job(j.id).status === 'running').length;
      if (running >= (this.config.machines.cloud.maxParallel || 3)) return false;
    }
    return true;
  }

  async launch(job, st) {
    const attempt = (st.attempt || 0) + 1;
    const branch = jobBranch(this.config, job, attempt);
    const homeKey = Object.keys(this.config.repos)[0];

    // A rerun of something that was finished invalidates everything built on top of it.
    if (st.finishedOnce) this.invalidateDependents(job.id);
    if (job.repo !== homeKey) this.repos.syncShared(homeKey, job.repo);

    const prompt = buildPrompt(this.config, job, attempt, { answers: st.pendingAnswers || [] });
    fs.writeFileSync(this.state.file('jobs', `${job.id}.prompt.txt`), prompt);

    if (job.machine === 'cloud') {
      const cwd = this.repos.worktree(job.repo); // clean checkout of main, so the cloud clones main
      // `claude --cloud "<task>"` creates the session; we only need its ID/URL from the output.
      // If the CLI keeps a live view open, the timeout ends our side; the cloud session keeps running.
      const launchArgs = this.config.claude.cloudLaunchArgs || ['--cloud'];
      const r = run(claudeBin(), [...launchArgs, prompt], { cwd, timeoutMs: 3 * 60 * 1000, input: '' });
      const out = r.stdout + r.stderr;
      const url = (out.match(/https:\/\/claude\.ai\/code\/[^\s)"']+/) || [])[0];
      const sessionId = (out.match(/Session ID:\s*(\S+)/) || out.match(/\b((?:session|cse)_[A-Za-z0-9]+)/) || [])[1];
      if (!sessionId) {
        this.state.setJob(job.id, { status: 'failed', attempt, summary: `Could not start cloud session: ${out.trim().slice(0, 300)}` });
        return this.ask(job, attempt, [{ question: `The cloud session for "${job.title}" didn't start: ${out.trim().slice(0, 200)}. Reply "retry" once it's fixed.`, options: ['retry', 'skip'] }]);
      }
      this.state.setJob(job.id, { status: 'running', attempt, branch, sessionId, url, startedAt: now(), pendingAnswers: [], summary: '' });
      log(`Started ${job.id} in the cloud: ${url || sessionId}`);
    } else {
      this.state.setJob(job.id, { status: 'queued', attempt, branch, machine: job.machine, queuedAt: now(), startedAt: null, pendingAnswers: [], summary: `waiting for ${job.machine}` });
      log(`Queued ${job.id} for the ${job.machine} worker`);
    }
  }

  async checkJob(job, st) {
    const branch = st.branch;
    const claim = this.state.claim(job.id, st.attempt);

    // Local workers report problems running claude itself (credentials, usage limit, crash).
    if (claim?.status === 'error') {
      if (claim.usageLimit) return this.pauseForUsage(job, claim.error);
      return this.handleResult(job, st, { status: 'failed', summary: `Worker on ${claim.host}: ${claim.error}` });
    }
    if (claim?.status === 'running' && st.status === 'queued') {
      this.state.setJob(job.id, { status: 'running', startedAt: claim.startedAt, summary: `running on ${claim.host}` });
    }

    if (this.repos.branchExists(job.repo, branch)) {
      const { result, error } = this.repos.readResult(job.repo, branch, job.id);
      if (error) return this.handleResult(job, st, { status: 'failed', summary: error });
      if (Number(result.attempt) !== Number(st.attempt)) log(`Note: ${job.id} result says attempt ${result.attempt}, expected ${st.attempt}`);
      return this.handleResult(job, st, result);
    }

    // No result yet: time out stuck jobs into a question rather than waiting forever.
    const started = st.startedAt || st.queuedAt;
    const limitMin = job.machine === 'cloud' ? this.config.claude.cloudJobTimeoutMinutes : this.config.claude.localJobTimeoutMinutes;
    if (st.status === 'running' && started && Date.now() - Date.parse(started) > limitMin * 60000) {
      this.state.setJob(job.id, { status: 'blocked', summary: `No result after ${limitMin} min` });
      await this.ask(job, st.attempt, [{
        question: `"${job.title}" has run ${limitMin} minutes without pushing ${branch}. Open the session to check it${st.url ? ` (${st.url})` : ''}. Reply "wait" to give it more time, "retry" to start over, or "skip".`,
        options: ['wait', 'retry', 'skip'],
      }]);
    }
  }

  async handleResult(job, st, result) {
    const status = result.status;
    if (Array.isArray(result.decisions) && result.decisions.length) {
      this.repos.appendDecisions(result.decisions.map((d) => `[${job.id}] ${typeof d === 'string' ? d : JSON.stringify(d)}`));
    }

    if (status === 'done') {
      const m = this.repos.verifyAndMerge(job.repo, st.branch, job);
      if (!m.ok) {
        return this.handleResult(job, st, { status: 'failed', summary: m.reason });
      }
      this.state.setJob(job.id, { status: 'done', finishedAt: now(), finishedOnce: true, commit: m.commit, summary: result.summary || 'done' });
      log(`Done: ${job.id}`);
      if (job.id === 'audit') this.applyAudit(result);
      if (job.notifyOnDone || /release/.test(job.id)) await notify(this.config, { title: `${job.title} done`, message: result.summary || 'Finished', url: st.url, tags: ['white_check_mark'] });
      return;
    }

    if (status === 'blocked') {
      this.state.setJob(job.id, { status: 'blocked', summary: result.summary || 'needs your input' });
      return this.ask(job, st.attempt, result.questions?.length ? result.questions : [{ question: result.summary || 'The job is blocked. What should it do?' }]);
    }

    // failed
    if (st.attempt < MAX_ATTEMPTS) {
      log(`${job.id} failed (attempt ${st.attempt}), retrying: ${result.summary}`);
      this.state.setJob(job.id, {
        status: 'pending', summary: `retrying: ${result.summary || ''}`.slice(0, 300),
        pendingAnswers: [{ id: `${job.id}-a${st.attempt}-failure`, question: 'Why the previous attempt failed', answer: String(result.summary || 'unknown').slice(0, 600) }],
      });
    } else {
      this.state.setJob(job.id, { status: 'failed', summary: result.summary });
      await this.ask(job, st.attempt, [{ question: `"${job.title}" failed ${MAX_ATTEMPTS} times. Last error: ${String(result.summary).slice(0, 300)}. Give direction, or reply "retry" or "skip".`, options: ['retry', 'skip'] }]);
    }
  }

  applyAudit(result) {
    for (const id of result.jobsAlreadyDone || []) {
      if (this.byId[id] && id !== 'audit') this.state.setJob(id, { status: 'done', finishedOnce: true, summary: 'already done (found by audit)', finishedAt: now() });
    }
    for (const id of result.jobsStale || []) {
      if (this.byId[id]) this.state.setJob(id, { status: 'stale', summary: 'out of date (found by audit)' });
    }
  }

  invalidateDependents(id) {
    for (const j of this.stages) {
      if (j.dependsOn.includes(id) && FINISHED.has(this.state.job(j.id).status)) {
        this.state.setJob(j.id, { status: 'stale', summary: `rerun because ${id} changed` });
        this.invalidateDependents(j.id);
      }
    }
  }

  async ask(job, attempt, questions) {
    const made = [];
    questions.forEach((q, i) => {
      const id = `${job.id}-a${attempt}-q${i + 1}`;
      if (this.state.questions().some((x) => x.id === id)) return;
      const rec = { id, job: job.id, attempt, status: 'open', askedAt: now(), question: q.question || String(q), options: q.options || [], why: q.why || '' };
      this.state.setQuestion(rec);
      made.push(rec);
    });
    if (made.length) {
      this.state.event({ type: 'question', job: job.id, message: made.map((q) => q.id).join(', ') });
      await notify(this.config, {
        title: `Question from ${job.title}`,
        message: made.map((q) => `${q.id}: ${q.question}`).join('\n\n') + '\n\nAnswer: node automation/ctl.mjs answer <id> "..."',
        priority: 'high', tags: ['question'],
      });
    }
  }

  async collectAnswers() {
    const open = this.state.questions().filter((q) => q.status === 'open');
    const decisions = [];
    for (const q of open) {
      const answer = this.state.answer(q.id);
      if (!answer) continue;
      this.state.setQuestion({ ...q, status: 'answered', answer, answeredAt: now() });
      decisions.push(`[${q.job}] Q: ${q.question.replace(/\s+/g, ' ').slice(0, 200)} → A: ${answer.replace(/\s+/g, ' ')}`);
      const st = this.state.job(q.job);
      const word = answer.trim().toLowerCase();
      if (word === 'skip') {
        this.state.setJob(q.job, { status: 'skipped', summary: 'skipped by you' });
      } else if (word === 'wait') {
        this.state.setJob(q.job, { status: 'running', startedAt: now(), summary: 'waiting longer' });
      } else if (this.state.questions().some((x) => x.job === q.job && x.attempt === q.attempt && x.status === 'open' && x.id !== q.id)) {
        // Still other open questions for this attempt: wait for all of them.
        this.state.setJob(q.job, { pendingAnswers: [...(st.pendingAnswers || []), { id: q.id, question: q.question, answer }] });
      } else {
        const answers = [...(st.pendingAnswers || []), ...(word === 'retry' ? [] : [{ id: q.id, question: q.question, answer }])];
        this.state.setJob(q.job, { status: 'pending', pendingAnswers: answers, summary: 'answered, rerunning' });
      }
    }
    if (decisions.length) this.repos.appendDecisions(decisions);
  }

  async pauseForUsage(job, message) {
    const resumeAt = new Date(Date.now() + 60 * 60000).toISOString();
    this.state.setControl({ paused: true, reason: `Usage limit hit during ${job.id}`, resumeAt });
    this.state.setJob(job.id, { status: 'pending', summary: 'paused for usage limit' });
    await notify(this.config, { title: 'Paused: usage limit', message: `${message}\nWill try again at ${resumeAt}. Resume sooner: node automation/ctl.mjs resume`, tags: ['hourglass'] });
  }

  checkAllDone() {
    const allDone = this.stages.every((j) => FINISHED.has(this.state.job(j.id).status));
    const announced = this.state.control().completeAnnouncedAt;
    if (allDone && !announced) {
      this.state.setControl({ completeAnnouncedAt: now() });
      this.state.commit('automation: pipeline complete');
      notify(this.config, { title: 'Pipeline complete', message: 'Every job is done or skipped.', tags: ['tada'] });
    } else if (!allDone && announced) {
      this.state.setControl({ completeAnnouncedAt: null });
    }
  }
}
