// Sends you a message when the pipeline needs you or finishes something important.
// Channels (all optional, use any mix):
//  - ntfy.sh push to your phone: set NTFY_TOPIC to a long random topic name, install the ntfy app, subscribe to it.
//  - webhook: set AUTOMATION_WEBHOOK_URL (Slack incoming webhook, Discord, your own endpoint). Receives JSON.
//  - macOS desktop notification (when config.notify.desktop is true).
import { run, IS_WIN, log } from './util.mjs';

export async function notify(config, { title, message, url, priority = 'default', tags = [] }) {
  const n = config.notify || {};
  const topic = process.env[n.ntfyTopicEnv || 'NTFY_TOPIC'];
  const webhook = process.env[n.webhookEnv || 'AUTOMATION_WEBHOOK_URL'];
  const app = config.app?.name || 'App';
  const fullTitle = `${app}: ${title}`;

  if (topic) {
    try {
      const headers = { Title: asciiHeader(fullTitle), Priority: priority, Tags: tags.join(',') };
      if (url) headers.Click = url;
      await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, { method: 'POST', body: message, headers });
    } catch (e) { log('ntfy failed:', e.message); }
  }
  if (webhook) {
    try {
      await fetch(webhook, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `*${fullTitle}*\n${message}${url ? `\n${url}` : ''}`, title: fullTitle, message, url }),
      });
    } catch (e) { log('webhook failed:', e.message); }
  }
  if (n.desktop && process.platform === 'darwin') {
    const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').slice(0, 200);
    run('osascript', ['-e', `display notification "${esc(message)}" with title "${esc(fullTitle)}"`]);
  }
  if (!topic && !webhook && !(n.desktop && !IS_WIN)) log(`NOTIFY ${fullTitle}: ${message}`);
}

// HTTP header values must be ASCII; ntfy also accepts the full title in the body.
const asciiHeader = (s) => s.replace(/[^\x20-\x7E]/g, '?');
