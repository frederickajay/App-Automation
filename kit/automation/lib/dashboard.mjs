// Builds a self-contained dashboard.html (no server needed) and a terminal summary.
import fs from 'node:fs';

const COLORS = { done: '#1f9d55', running: '#2b6cb0', queued: '#805ad5', pending: '#a0aec0', blocked: '#d69e2e', failed: '#e53e3e', stale: '#dd6b20', skipped: '#718096' };

export function snapshot(state, stages) {
  const jobs = stages.map((s) => ({ ...s, ...state.job(s.id) }));
  const questions = state.questions().filter((q) => q.status === 'open');
  return { generatedAt: new Date().toISOString(), control: state.control(), jobs, questions, events: state.events(60) };
}

export function printStatus(snap) {
  const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
  console.log(`\n${snap.control.paused ? 'PAUSED: ' + (snap.control.reason || '') : 'Running'}   ${snap.generatedAt}`);
  console.log(pad('JOB', 20), pad('MACHINE', 8), pad('STATUS', 9), pad('TRY', 4), 'SUMMARY');
  for (const j of snap.jobs) console.log(pad(j.id, 20), pad(j.machine, 8), pad(j.status, 9), pad(j.attempt, 4), (j.summary || j.url || '').slice(0, 70));
  if (snap.questions.length) {
    console.log('\nQUESTIONS FOR YOU (answer with: node automation/ctl.mjs answer <id> "your answer")');
    for (const q of snap.questions) console.log(`- ${q.id}: ${q.question}${q.options?.length ? `  [${q.options.join(' | ')}]` : ''}`);
  }
}

export function writeHtml(file, snap) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const done = snap.jobs.filter((j) => j.status === 'done').length;
  const rows = snap.jobs.map((j) => `
    <tr><td><b>${esc(j.title)}</b><div class="id">${esc(j.id)} · ${esc(j.machine)}${j.attempt > 1 ? ` · try ${esc(j.attempt)}` : ''}</div>
    ${j.summary || j.url ? `<div class="sum">${esc(j.summary || '')}${j.url ? ` <a href="${esc(j.url)}">session</a>` : ''}</div>` : ''}</td>
    <td class="st"><span class="pill" style="background:${COLORS[j.status] || '#a0aec0'}">${esc(j.status)}</span></td></tr>`).join('');
  const qs = snap.questions.map((q) => `<li><b>${esc(q.id)}</b> (${esc(q.job)}): ${esc(q.question)}${q.why ? `<div class="id">${esc(q.why)}</div>` : ''}${q.options?.length ? `<div class="id">Options: ${q.options.map(esc).join(' · ')}</div>` : ''}<code>node automation/ctl.mjs answer ${esc(q.id)} "…"</code></li>`).join('');
  const ev = snap.events.slice().reverse().slice(0, 25).map((e) => `<li><span class="id">${esc(e.ts.slice(5, 16).replace('T', ' '))}</span> ${esc(e.type)} ${esc(e.job || '')} ${esc(e.status || e.message || '')}</li>`).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="60"><title>Pipeline</title><style>
body{font:15px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:16px;background:#f7f7f8;color:#1a202c}
@media(prefers-color-scheme:dark){body{background:#15171a;color:#e2e8f0}table,section{background:#1f2227!important}td{border-color:#2d3138!important}}
h1{font-size:20px;margin:0 0 4px}.sub{color:#718096;margin-bottom:16px}
section{background:#fff;border-radius:10px;padding:12px 14px;margin-bottom:14px}
table{width:100%;border-collapse:collapse;background:#fff}td{padding:8px 6px;border-top:1px solid #edf2f7;vertical-align:top}
.pill{color:#fff;border-radius:999px;padding:2px 9px;font-size:12px;white-space:nowrap}.id{color:#718096;font-size:12px}
.bar{height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden}.bar>div{height:100%;background:#1f9d55}
td.st{text-align:right;width:1%}.sum{font-size:13px;margin-top:3px;opacity:.85}
code{display:block;font-size:12px;margin-top:4px;opacity:.8}ul{padding-left:18px;margin:6px 0}</style></head><body>
<h1>Pipeline ${snap.control.paused ? '⏸ paused' : ''}</h1>
<div class="sub">Updated ${esc(snap.generatedAt)} · ${done}/${snap.jobs.length} jobs done${snap.control.paused ? ' · ' + esc(snap.control.reason || '') : ''}</div>
<section><div class="bar"><div style="width:${Math.round((100 * done) / Math.max(1, snap.jobs.length))}%"></div></div></section>
${qs ? `<section><b>Questions for you</b><ul>${qs}</ul></section>` : ''}
<section><table>${rows}</table></section>
<section><b>Recent events</b><ul>${ev}</ul></section>
</body></html>`;
  fs.writeFileSync(file, html);
}
