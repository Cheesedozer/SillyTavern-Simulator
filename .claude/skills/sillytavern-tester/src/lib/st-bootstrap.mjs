import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {
  ST_DIR,
  ST_PIDFILE,
  ST_PORTFILE,
  ST_LOGFILE,
  WORK_DIR,
} from './paths.mjs';
import {
  runCommand,
  spawnDetached,
  findFreePort,
  waitForHttp,
  readPidFile,
  isRunning,
  killPid,
} from './process-utils.mjs';

const ST_REPO_URL = 'https://github.com/SillyTavern/SillyTavern.git';
const ST_BRANCH = 'release';

/**
 * Clones (or reuses) the real upstream SillyTavern repo and installs its dependencies.
 * SillyTavern's own source is never committed to this repo -- it always lives in the
 * gitignored .work/ directory, cloned fresh from upstream so the harness tracks "latest".
 */
export async function ensureCloned({ fresh = false } = {}) {
  if (fresh && fs.existsSync(ST_DIR)) {
    await fsp.rm(ST_DIR, { recursive: true, force: true });
  }
  if (!fs.existsSync(ST_DIR)) {
    await fsp.mkdir(WORK_DIR, { recursive: true });
    await runCommand('git', ['clone', '--depth', '1', '--branch', ST_BRANCH, ST_REPO_URL, ST_DIR]);
  }
  await runCommand('npm', ['install', '--no-audit', '--no-fund'], { cwd: ST_DIR });
}

/**
 * Starts the SillyTavern server as a detached background process on a free port,
 * with CSRF disabled and no forced whitelist, since this is a local, ephemeral,
 * single-user test instance. Returns the port it's listening on.
 */
export async function startServer() {
  const existingPid = await readPidFile(ST_PIDFILE);
  if (isRunning(existingPid)) {
    const port = Number.parseInt(await fsp.readFile(ST_PORTFILE, 'utf8').catch(() => ''), 10);
    if (Number.isFinite(port)) return port;
  }

  const port = await findFreePort();
  spawnDetached({
    command: 'node',
    args: [
      'server.js',
      '--port', String(port),
      '--listen', 'false',
      '--disableCsrf', 'true',
      '--browserLaunchEnabled', 'false',
      '--dataRoot', './data',
    ],
    cwd: ST_DIR,
    logFile: ST_LOGFILE,
    pidFile: ST_PIDFILE,
  });
  await fsp.writeFile(ST_PORTFILE, String(port));
  await waitForHttp(`http://127.0.0.1:${port}/`, { timeoutMs: 90_000 });
  return port;
}

export async function stopServer() {
  const pid = await readPidFile(ST_PIDFILE);
  await killPid(pid);
}
