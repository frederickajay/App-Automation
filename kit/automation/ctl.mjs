#!/usr/bin/env node
// One command for everything. Run from the app repo root:
//   node automation/ctl.mjs start                 run the orchestrator (keep it running)
//   node automation/ctl.mjs worker mac            run the Mac worker (Xcode jobs)
//   node automation/ctl.mjs worker windows        run the Windows worker (Android jobs)
//   node automation/ctl.mjs status                show jobs and open questions
//   node automation/ctl.mjs answer <id> "text"    answer a question ("retry", "skip", "wait" are special)
//   node automation/ctl.mjs pause [hours]         stop starting new jobs (running ones finish)
//   node automation/ctl.mjs resume
//   node automation/ctl.mjs rerun <job>           run a job again (and everything after it)
//   node automation/ctl.mjs skip <job>
//   node automation/ctl.mjs check [mac|windows|cloud]   check credentials and tools on this machine
//   node automation/ctl.mjs tick                  run one orchestrator pass and exit (for testing)
import { loadConfig, loadStages, log } from './lib/util.mjs';
import { State } from './lib/state.mjs';
import { snapshot, printStatus, writeHtml } from './lib/dashboard.mjs';
import { checkCredentials } from './lib/credentials.mjs';

const [cmd, ...rest] = process.argv.slice(2);

async function main() {
  switch (cmd) {
    case 'start': {
      const { Orchestrator } = await import('./lib/orchestrator.mjs');
      return new Orchestrator().loop();
    }
    case 'tick': {
      const { Orchestrator } = await import('./lib/orchestrator.mjs');
      return new Orchestrator().loop({ once: true });
    }
    case 'worker': {
      const { Worker } = await import('./lib/worker.mjs');
      if (!rest[0]) throw new Error('Usage: worker mac|windows');
      return new Worker(rest[0]).loop({ once: rest.includes('--once') });
    }
    case 'status': {
      const st = new State(loadConfig()).init(); st.pull();
      const snap = snapshot(st, loadStages());
      printStatus(snap);
      writeHtml(st.file('dashboard.html'), snap);
      console.log(`\nDashboard: ${st.file('dashboard.html')}`);
      return;
    }
    case 'answer': {
      const [id, ...words] = rest;
      if (!id || !words.length) throw new Error('Usage: answer <question-id> "your answer"');
      const st = new State(loadConfig()).init(); st.pull();
      if (!st.questions().some((q) => q.id === id)) throw new Error(`No question with id ${id}. Run: node automation/ctl.mjs status`);
      const fs = await import('node:fs');
      fs.writeFileSync(st.file('answers', `${id}.md`), words.join(' ') + '\n');
      st.commit(`automation: answer ${id}`);
      return log(`Answered ${id}. The orchestrator picks it up on its next pass.`);
    }
    case 'pause': {
      const st = new State(loadConfig()).init(); st.pull();
      const hours = Number(rest[0]);
      st.setControl({ paused: true, reason: 'paused by you', resumeAt: hours ? new Date(Date.now() + hours * 3600000).toISOString() : null });
      st.commit('automation: pause');
      return log(`Paused${hours ? ` for ${hours}h` : ''}. Running jobs finish; nothing new starts.`);
    }
    case 'resume': {
      const st = new State(loadConfig()).init(); st.pull();
      st.setControl({ paused: false, reason: '', resumeAt: null });
      st.commit('automation: resume');
      return log('Resumed.');
    }
    case 'rerun':
    case 'skip': {
      const id = rest[0];
      const stages = loadStages();
      if (!stages.some((s) => s.id === id)) throw new Error(`Unknown job ${id}. Jobs: ${stages.map((s) => s.id).join(', ')}`);
      const st = new State(loadConfig()).init(); st.pull();
      st.setJob(id, cmd === 'skip' ? { status: 'skipped', summary: 'skipped by you' } : { status: 'stale', summary: 'rerun requested by you' });
      st.commit(`automation: ${cmd} ${id}`);
      return log(`${id} marked ${cmd === 'skip' ? 'skipped' : 'to run again'}.`);
    }
    case 'check': {
      const machine = rest[0] || (process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'cloud');
      const config = loadConfig();
      const repos = [...new Set(loadStages().filter((j) => j.machine === machine).map((j) => j.repo))];
      const base = checkCredentials(config, machine, repos, { forRelease: false });
      const rel = checkCredentials(config, machine, repos, { forRelease: true });
      const relOnly = rel.problems.filter((p) => !base.problems.includes(p));
      console.log(base.ok ? `✓ ${machine}: ready for build, test and screenshot jobs` : `✗ ${machine}: needed before any job runs here:\n - ${base.problems.join('\n - ')}`);
      console.log(relOnly.length ? `… ${machine}: needed only for the release job:\n - ${relOnly.join('\n - ')}` : `✓ ${machine}: release keys in place`);
      process.exitCode = base.ok ? 0 : 1;
      return;
    }
    default:
      console.log(`Commands: start | worker mac|windows | status | answer <id> "text" | pause [hours] | resume | rerun <job> | skip <job> | check [machine] | tick`);
  }
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
