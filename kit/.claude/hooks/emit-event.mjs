#!/usr/bin/env node
// Notification / Stop / SubagentStop / StopFailure: logs a line for the dashboard and,
// for things that need you, pings your phone (NTFY_TOPIC) or webhook (AUTOMATION_WEBHOOK_URL).
// Never blocks Claude: always exits 0.
import fs from 'node:fs';
import path from 'node:path';

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', async () => {
  let e = {};
  try { e = JSON.parse(input); } catch {}
  const event = e.hook_event_name || 'unknown';
  const dir = path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), 'automation', 'logs');
  const rec = {
    ts: new Date().toISOString(), event, job: process.env.AUTOMATION_JOB || null,
    machine: process.env.AUTOMATION_MACHINE || null, session: e.session_id,
    type: e.notification_type || e.error_type || e.agent_type || null,
    message: (e.message || e.error || '').toString().slice(0, 300),
  };
  try { fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(path.join(dir, 'hook-events.jsonl'), JSON.stringify(rec) + '\n'); } catch {}

  // Only interrupt you for things that need you, and not for every pipeline job's routine stops.
  const needsYou = (event === 'Notification' && /permission_prompt|idle_prompt|agent_needs_input/.test(rec.type || ''))
    || (event === 'StopFailure' && /rate_limit|billing_error|authentication_failed/.test(rec.type || ''));
  if (needsYou && !(event === 'Notification' && rec.job)) {
    const title = event === 'StopFailure' ? `Claude stopped: ${rec.type}` : 'Claude needs you';
    const body = rec.message || (rec.job ? `Job ${rec.job}` : 'A session is waiting for input');
    const topic = process.env.NTFY_TOPIC, hook = process.env.AUTOMATION_WEBHOOK_URL;
    const tasks = [];
    if (topic) tasks.push(fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, { method: 'POST', body, headers: { Title: title } }).catch(() => {}));
    if (hook) tasks.push(fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `${title}: ${body}` }) }).catch(() => {}));
    await Promise.race([Promise.all(tasks), new Promise((r) => setTimeout(r, 4000))]);
  }
  process.exit(0);
});
