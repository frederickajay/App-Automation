#!/usr/bin/env node
// SessionStart: tells Claude where it's running, so it uses the right tools and limits.
// Plain text on stdout is added to Claude's context.
import os from 'node:os';

const job = process.env.AUTOMATION_JOB;
const machine = process.env.AUTOMATION_MACHINE;
const gb = Math.round(os.totalmem() / 2 ** 30);
const lines = [];

if (job) lines.push(`Pipeline job ${job} (attempt ${process.env.AUTOMATION_ATTEMPT}) on the ${machine} worker. Follow the job protocol in CLAUDE.md.`);
if (process.platform === 'darwin' && gb <= 8) {
  lines.push(`This Mac has ${gb} GB of memory. Run one simulator and one device size at a time, at most 2 agents in parallel, build with -derivedDataPath .derived-data, and shut simulators down when finished.`);
  if (!job) lines.push('This is a local session on a low-memory Mac: only do work that needs Xcode, the simulator or local signing here. For anything else, tell the owner to move this session to a cloud session (session menu > Open in > Cloud).');
}
if (process.platform === 'linux' && !job) lines.push('If this is a cloud session: there is no Xcode or Android emulator here. Leave device builds and tests to the Mac/Windows pipeline jobs.');
if (lines.length) console.log(lines.join('\n'));
