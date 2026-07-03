import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ST_DATA_DIR, FIXTURES_DIR } from './paths.mjs';
import { startServer, stopServer } from './st-bootstrap.mjs';

const SETTINGS_PATH = path.join(ST_DATA_DIR, 'settings.json');

export const personaFixture = JSON.parse(
  fs.readFileSync(path.join(FIXTURES_DIR, 'personas', 'sample-persona.json'), 'utf8'),
);
export const characterFixture = JSON.parse(
  fs.readFileSync(path.join(FIXTURES_DIR, 'characters', 'sample-character.json'), 'utf8'),
);

/**
 * Builds the settings.json overlay that points SillyTavern's Chat Completion source at our
 * local scripted mock LLM, and pre-fills the persona name so the first-run onboarding modal
 * never has to be clicked through. This is harness configuration, not the extension under
 * test, so it's applied by patching JSON directly rather than driving the settings UI.
 */
function buildOverlay(mockBaseUrl) {
  return {
    firstRun: false,
    main_api: 'openai',
    power_user: {
      personas: { 'user-default.png': personaFixture.name },
    },
    oai_settings: {
      chat_completion_source: 'custom',
      custom_url: mockBaseUrl,
      custom_model: 'mock-model',
      stream_openai: false,
      function_calling: true,
    },
  };
}

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof target[key] === 'object') {
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

/** Ensures data/default-user/settings.json exists by booting SillyTavern once if needed. */
async function ensureDataDirMaterialized() {
  if (fs.existsSync(SETTINGS_PATH)) return;
  await startServer();
  await stopServer();
}

/**
 * Patches settings.json to point at the mock LLM and pre-set the persona. The server must
 * not be running while this happens, since SillyTavern only reads settings.json at boot.
 */
export async function applySettingsOverlay(mockBaseUrl) {
  await ensureDataDirMaterialized();
  const settings = JSON.parse(await fsp.readFile(SETTINGS_PATH, 'utf8'));
  deepMerge(settings, buildOverlay(mockBaseUrl));
  await fsp.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 4));
}

/** Wipes all per-user data (characters, chats, extensions, settings) for a clean-slate run. */
export async function resetData() {
  await stopServer();
  await fsp.rm(ST_DATA_DIR, { recursive: true, force: true });
}

/**
 * Copies the first-party tool-echo fixture extension straight into the data dir. Unlike a
 * third-party extension under test, this one has no git repo of its own -- it exists only to
 * self-test the mock LLM's tool_calls plumbing, so it's placed on disk directly rather than
 * going through the real "install from git URL" flow.
 */
export async function installToolEchoFixture() {
  const src = path.join(FIXTURES_DIR, 'sample-extensions', 'tool-echo');
  const dest = path.join(ST_DATA_DIR, 'extensions', 'tool-echo');
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.cp(src, dest, { recursive: true });
}
