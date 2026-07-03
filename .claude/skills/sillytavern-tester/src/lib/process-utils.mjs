import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

export async function findFreePort(preferred = 0) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(preferred, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Spawns a detached child process, redirecting stdout/stderr to logFile, and records its pid. */
export function spawnDetached({ command, args = [], cwd, env, logFile, pidFile }) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const out = fs.openSync(logFile, 'a');
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
  fs.mkdirSync(path.dirname(pidFile), { recursive: true });
  fs.writeFileSync(pidFile, String(child.pid));
  return child.pid;
}

export async function readPidFile(pidFile) {
  try {
    const content = await fsp.readFile(pidFile, 'utf8');
    const pid = Number.parseInt(content.trim(), 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

export function isRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function killPid(pid, { timeoutMs = 5000 } = {}) {
  if (!isRunning(pid)) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isRunning(pid)) return;
    await sleep(200);
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // already gone
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs a command to completion, inheriting stdio, and throws if it exits non-zero. */
export function runCommand(command, args = [], { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

/** Polls a URL until it responds with any HTTP status (server is up), or throws on timeout. */
export async function waitForHttp(url, { timeoutMs = 60_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.resume();
          resolve(res.statusCode);
        });
        req.on('error', reject);
        req.setTimeout(2000, () => req.destroy(new Error('request timed out')));
      });
      return true;
    } catch (err) {
      lastError = err;
      await sleep(intervalMs);
    }
  }
  throw new Error(`Timed out waiting for ${url} to respond: ${lastError?.message ?? 'unknown error'}`);
}
