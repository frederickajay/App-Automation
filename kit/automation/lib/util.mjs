// Shared helpers. No dependencies: Node 20+ and git only.
import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const AUTOMATION_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HOME_REPO = path.resolve(AUTOMATION_DIR, '..');
export const IS_WIN = process.platform === 'win32';

export function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (fallback !== undefined) return fallback; throw new Error(`Cannot read ${file}: ${e.message}`); }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

export function loadConfig() {
  const config = readJson(path.join(AUTOMATION_DIR, 'config.json'));
  const local = readJson(path.join(AUTOMATION_DIR, 'config.local.json'), {});
  return deepMerge(config, local);
}

export function loadStages() {
  return readJson(path.join(AUTOMATION_DIR, 'stages.json')).jobs;
}

function deepMerge(a, b) {
  if (Array.isArray(a) || Array.isArray(b) || typeof a !== 'object' || typeof b !== 'object' || !a || !b) return b ?? a;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k in a ? deepMerge(a[k], v) : v;
  return out;
}

export function repoPath(config, repoKey) {
  const r = config.repos[repoKey];
  if (!r) throw new Error(`Unknown repo "${repoKey}" in config.repos`);
  return path.resolve(HOME_REPO, r.path);
}

export const now = () => new Date().toISOString();
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const hostname = () => os.hostname();

export function log(...args) {
  console.log(`[${new Date().toLocaleTimeString()}]`, ...args);
}

// On Windows we go through cmd.exe so .cmd shims (claude.cmd, fastlane.bat) resolve.
// cmd.exe can't take newlines inside an argument, and quotes must be doubled.
const needsShell = (cmd) => IS_WIN && !/\.(exe|com)$/i.test(cmd) && cmd !== 'cmd.exe';
const winQuote = (a) => /[\s"&|<>^%]/.test(a) ? `"${String(a).replace(/\r?\n/g, ' ').replace(/"/g, '""')}"` : a;
const prepArgs = (cmd, args) => (needsShell(cmd) ? args.map(winQuote) : args);

/** Run a command synchronously. Returns {code, stdout, stderr}. Never throws unless check=true. */
export function run(cmd, args, { cwd, env, check = false, input, timeoutMs } = {}) {
  const res = spawnSync(cmd, prepArgs(cmd, args), {
    cwd, input, encoding: 'utf8', timeout: timeoutMs,
    env: { ...process.env, ...(env || {}) },
    shell: needsShell(cmd),
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = { code: res.status ?? (res.error ? 1 : 0), stdout: res.stdout || '', stderr: (res.stderr || '') + (res.error ? String(res.error) : '') };
  if (check && out.code !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${out.code}): ${out.stderr || out.stdout}`);
  return out;
}

/** Run a shell one-liner (used for beforeJob/afterJob hooks in config). */
export function runShell(line, { cwd, env } = {}) {
  return IS_WIN ? run('cmd.exe', ['/d', '/s', '/c', line], { cwd, env }) : run('/bin/sh', ['-c', line], { cwd, env });
}

/** Run a long command, streaming output to a log file. Resolves with exit code. */
export function runLogged(cmd, args, { cwd, env, logFile, timeoutMs }) {
  return new Promise((resolve) => {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const out = fs.openSync(logFile, 'a');
    const child = spawn(cmd, prepArgs(cmd, args), {
      cwd, env: { ...process.env, ...(env || {}) }, stdio: ['ignore', out, out],
      shell: needsShell(cmd),
    });
    let timer;
    if (timeoutMs) timer = setTimeout(() => { child.kill('SIGTERM'); }, timeoutMs);
    child.on('close', (code) => { clearTimeout(timer); fs.closeSync(out); resolve(code ?? 1); });
    child.on('error', () => { clearTimeout(timer); fs.closeSync(out); resolve(127); });
  });
}

export const git = (cwd, args, opts = {}) => run('git', args, { cwd, ...opts });

export function claudeBin() {
  return process.env.AUTOMATION_CLAUDE_BIN || 'claude';
}
