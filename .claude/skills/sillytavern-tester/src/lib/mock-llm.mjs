import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOCK_PIDFILE, MOCK_PORTFILE, MOCK_LOGFILE } from './paths.mjs';
import { spawnDetached, findFreePort, waitForHttp, readPidFile, isRunning, killPid } from './process-utils.mjs';

const SERVER_SCRIPT = path.resolve(fileURLToPath(import.meta.url), '../../mock-llm/server.mjs');

/** Starts the scripted mock LLM server and returns its base URL (e.g. http://127.0.0.1:PORT/v1). */
export async function startMockLlm(scenarioPath) {
  const existingPid = await readPidFile(MOCK_PIDFILE);
  if (isRunning(existingPid)) {
    const port = Number.parseInt(await fsp.readFile(MOCK_PORTFILE, 'utf8').catch(() => ''), 10);
    if (Number.isFinite(port)) return `http://127.0.0.1:${port}/v1`;
  }

  const port = await findFreePort();
  const args = ['--port', String(port)];
  if (scenarioPath) args.push('--scenario', scenarioPath);

  spawnDetached({
    command: 'node',
    args: [SERVER_SCRIPT, ...args],
    logFile: MOCK_LOGFILE,
    pidFile: MOCK_PIDFILE,
  });
  await fsp.writeFile(MOCK_PORTFILE, String(port));
  await waitForHttp(`http://127.0.0.1:${port}/v1/models`, { timeoutMs: 10_000 });
  return `http://127.0.0.1:${port}/v1`;
}

export async function stopMockLlm() {
  const pid = await readPidFile(MOCK_PIDFILE);
  await killPid(pid);
}
