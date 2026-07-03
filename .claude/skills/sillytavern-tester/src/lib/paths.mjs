import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SKILL_DIR is the sillytavern-tester/ folder itself, resolved from this file's
// location so every path here is stable regardless of the caller's cwd.
export const SKILL_DIR = path.resolve(fileURLToPath(import.meta.url), '../../..');

export const WORK_DIR = path.join(SKILL_DIR, '.work');
export const ST_DIR = path.join(WORK_DIR, 'sillytavern');
export const RUNS_DIR = path.join(WORK_DIR, 'runs');

export const ST_PIDFILE = path.join(WORK_DIR, 'st.pid');
export const ST_PORTFILE = path.join(WORK_DIR, 'st.port');
export const ST_LOGFILE = path.join(WORK_DIR, 'st-server.log');

export const MOCK_PIDFILE = path.join(WORK_DIR, 'mock-llm.pid');
export const MOCK_PORTFILE = path.join(WORK_DIR, 'mock-llm.port');
export const MOCK_LOGFILE = path.join(WORK_DIR, 'mock-llm.log');

export const FIXTURES_DIR = path.join(SKILL_DIR, 'test-fixtures');
export const ST_DATA_DIR = path.join(ST_DIR, 'data', 'default-user');
