// Shared state lives on its own git branch (config.state.branch), checked out in a
// separate worktree at <home repo>/.automation-state so your normal checkout is never touched.
// Every writer owns different files, so concurrent pushes from the orchestrator and the
// Mac/Windows workers rebase cleanly:
//   jobs/<id>.json          orchestrator  - job status
//   claims/<id>-a<n>.json   workers       - "I'm running this attempt" / "I pushed a result"
//   questions/<qid>.json    orchestrator  - questions for you
//   answers/<qid>.md        you           - your answers (answer.mjs or edit on GitHub/phone)
//   events/<writer>.jsonl   each writer   - event log for the dashboard
//   control.json            you           - pause/resume
import fs from 'node:fs';
import path from 'node:path';
import { HOME_REPO, git, log, now, readJson, writeJson, hostname } from './util.mjs';

export class State {
  constructor(config) {
    this.config = config;
    this.branch = config.state.branch;
    this.remote = config.repos.ios?.remote || 'origin';
    this.dir = path.join(HOME_REPO, '.automation-state');
  }

  /** Create the worktree (and the orphan branch on first use). */
  init() {
    if (fs.existsSync(path.join(this.dir, '.git'))) return this;
    git(HOME_REPO, ['fetch', this.remote, this.branch]);
    const remoteHas = git(HOME_REPO, ['rev-parse', '--verify', '--quiet', `${this.remote}/${this.branch}`]).code === 0;
    const localHas = git(HOME_REPO, ['rev-parse', '--verify', '--quiet', this.branch]).code === 0;
    if (remoteHas || localHas) {
      if (!localHas) git(HOME_REPO, ['branch', this.branch, `${this.remote}/${this.branch}`], { check: true });
      git(HOME_REPO, ['worktree', 'add', this.dir, this.branch], { check: true });
    } else {
      git(HOME_REPO, ['worktree', 'add', '--detach', this.dir], { check: true });
      git(this.dir, ['checkout', '--orphan', this.branch], { check: true });
      git(this.dir, ['rm', '-rf', '--quiet', '.']);
      for (const d of ['jobs', 'claims', 'questions', 'answers', 'events']) {
        fs.mkdirSync(path.join(this.dir, d), { recursive: true });
        fs.writeFileSync(path.join(this.dir, d, '.keep'), '');
      }
      writeJson(path.join(this.dir, 'control.json'), { paused: false });
      fs.writeFileSync(path.join(this.dir, 'README.md'), '# Automation state\nWritten by automation/ctl.mjs. Answer questions by adding answers/<question-id>.md\n');
      git(this.dir, ['add', '-A'], { check: true });
      git(this.dir, ['commit', '-m', 'automation: init state branch'], { check: true });
      git(this.dir, ['push', '-u', this.remote, this.branch], { check: true });
      log(`Created state branch ${this.branch}`);
    }
    return this;
  }

  pull() {
    const r = git(this.dir, ['pull', '--rebase', '--autostash', '--quiet', this.remote, this.branch]);
    if (r.code !== 0) {
      git(this.dir, ['rebase', '--abort']);
      log('State pull failed (will retry):', r.stderr.trim().split('\n')[0]);
    }
  }

  /** Commit everything and push, retrying on races with other writers. */
  commit(message) {
    git(this.dir, ['add', '-A']);
    if (git(this.dir, ['diff', '--cached', '--quiet']).code === 0) return true;
    git(this.dir, ['commit', '--quiet', '-m', message], { check: true });
    for (let i = 0; i < 5; i++) {
      if (git(this.dir, ['push', '--quiet', this.remote, this.branch]).code === 0) return true;
      this.pull();
    }
    log('Could not push state after 5 tries; will retry next tick');
    return false;
  }

  file(...p) { return path.join(this.dir, ...p); }

  job(id) { return readJson(this.file('jobs', `${id}.json`), { id, status: 'pending', attempt: 0 }); }
  setJob(id, patch) {
    const j = { ...this.job(id), ...patch, id, updatedAt: now() };
    writeJson(this.file('jobs', `${id}.json`), j);
    this.event({ type: 'job', job: id, status: j.status, attempt: j.attempt, summary: patch.summary });
    return j;
  }

  claim(id, attempt) { return readJson(this.file('claims', `${id}-a${attempt}.json`), null); }
  setClaim(id, attempt, patch) {
    const f = this.file('claims', `${id}-a${attempt}.json`);
    writeJson(f, { ...readJson(f, {}), ...patch, job: id, attempt, host: hostname(), updatedAt: now() });
  }

  questions() {
    const d = this.file('questions');
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(d, f)));
  }
  setQuestion(q) { writeJson(this.file('questions', `${q.id}.json`), q); }
  answer(qid) {
    const f = this.file('answers', `${qid}.md`);
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : null;
  }

  control() { return readJson(this.file('control.json'), { paused: false }); }
  setControl(patch) { writeJson(this.file('control.json'), { ...this.control(), ...patch, updatedAt: now() }); }

  event(e) {
    const writer = (process.env.AUTOMATION_ROLE || 'orchestrator') + '-' + hostname().replace(/[^a-z0-9_-]/gi, '');
    const f = this.file('events', `${writer}.jsonl`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.appendFileSync(f, JSON.stringify({ ts: now(), ...e }) + '\n');
  }

  events(limit = 200) {
    const d = this.file('events');
    if (!fs.existsSync(d)) return [];
    const all = [];
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.jsonl'))) {
      for (const line of fs.readFileSync(path.join(d, f), 'utf8').split('\n')) {
        if (line.trim()) { try { all.push(JSON.parse(line)); } catch {} }
      }
    }
    return all.sort((a, b) => (a.ts < b.ts ? -1 : 1)).slice(-limit);
  }
}
