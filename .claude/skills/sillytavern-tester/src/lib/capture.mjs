import fsp from 'node:fs/promises';
import path from 'node:path';
import { RUNS_DIR, ST_LOGFILE, MOCK_LOGFILE } from './paths.mjs';

/** Creates a fresh timestamped run directory under .work/runs/ and returns its path. */
export async function createRunDir() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(RUNS_DIR, stamp);
  await fsp.mkdir(path.join(dir, 'screenshots'), { recursive: true });
  return dir;
}

/** Writes the session's captured console/network/page-error logs, and tails the server logs, into the run dir. */
export async function writeCaptureArtifacts(runDir, session) {
  await fsp.writeFile(path.join(runDir, 'console.jsonl'), session.consoleLogs.map((e) => JSON.stringify(e)).join('\n'));
  await fsp.writeFile(path.join(runDir, 'page-errors.jsonl'), session.pageErrors.map((e) => JSON.stringify({ message: e })).join('\n'));
  await fsp.writeFile(path.join(runDir, 'network.jsonl'), session.networkLog.map((e) => JSON.stringify(e)).join('\n'));

  await copyTail(ST_LOGFILE, path.join(runDir, 'st-server.log'));
  await copyTail(MOCK_LOGFILE, path.join(runDir, 'mock-llm.log'));
}

async function copyTail(src, dest, maxLines = 500) {
  try {
    const content = await fsp.readFile(src, 'utf8');
    const lines = content.split('\n');
    const tail = lines.slice(-maxLines).join('\n');
    await fsp.writeFile(dest, tail);
  } catch {
    // Source log doesn't exist yet -- nothing to copy.
  }
}
