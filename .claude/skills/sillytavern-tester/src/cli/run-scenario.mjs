import fs from 'node:fs';
import path from 'node:path';
import { ensureCloned, startServer, stopServer } from '../lib/st-bootstrap.mjs';
import { startMockLlm, stopMockLlm } from '../lib/mock-llm.mjs';
import { applySettingsOverlay, resetData, installToolEchoFixture, characterFixture, personaFixture } from '../lib/fixtures.mjs';
import { SillyTavernSession } from '../lib/st-client.mjs';
import { createRunDir, writeCaptureArtifacts } from '../lib/capture.mjs';
import { writeReport } from '../lib/report.mjs';
import { ST_PORTFILE } from '../lib/paths.mjs';

/**
 * Test plan JSON schema (see test-fixtures/scenarios/*.json for examples):
 * {
 *   "extensionUrl": "https://github.com/author/extension-name",   // optional
 *   "mockScenario": "test-fixtures/scenarios/mock-responses.json", // optional; omit to use whatever real API is already configured
 *   "installToolEchoFixture": false,                               // optional; only needed for tool-calling tests
 *   "character": { "name": "...", "description": "...", "firstMessage": "..." }, // optional; defaults to the fixture character
 *   "steps": [
 *     { "type": "message", "text": "hello" },
 *     { "type": "slashCommand", "command": "/roll 1d6" },
 *     { "type": "click", "selector": "text=Example Button", "label": "Click the example button" },
 *     { "type": "screenshot", "label": "after clicking" }
 *   ]
 * }
 */

function getArg(name, fallback = undefined) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : fallback;
}

const planPath = getArg('plan');
const fresh = process.argv.includes('--fresh');
const keepData = process.argv.includes('--keep-data');
const keepRunning = process.argv.includes('--keep-running');

if (!planPath) {
  console.error('Usage: node run-scenario.mjs --plan <path-to-test-plan.json> [--fresh] [--keep-data] [--keep-running]');
  process.exit(1);
}

const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const steps = [];
let screenshotIndex = 0;

function formatDetail(detail) {
  if (detail === undefined || typeof detail === 'string') return detail;
  return JSON.stringify(detail);
}

async function runStep(label, fn) {
  try {
    const detail = await fn();
    steps.push({ label, ok: true, detail: formatDetail(detail) });
  } catch (err) {
    steps.push({ label, ok: false, detail: err.message });
    throw err;
  }
}

const runDir = await createRunDir();
async function screenshot(session, label) {
  screenshotIndex += 1;
  const fileName = `${String(screenshotIndex).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
  const filePath = path.join(runDir, 'screenshots', fileName);
  await session.screenshot(filePath);
  return path.join('screenshots', fileName);
}

let session;
let exitCode = 0;
try {
  await runStep('Clone/update SillyTavern', () => ensureCloned({ fresh }));

  if (!keepData) {
    await runStep('Reset to a clean data slate', () => resetData());
  }

  let mockUrl;
  if (plan.mockScenario) {
    await runStep('Start scripted mock LLM', async () => {
      mockUrl = await startMockLlm(path.resolve(plan.mockScenario));
      return mockUrl;
    });
    await runStep('Apply settings overlay (point at mock LLM)', () => applySettingsOverlay(mockUrl));
  }

  if (plan.installToolEchoFixture) {
    await runStep('Install tool-echo fixture extension', () => installToolEchoFixture());
  }

  await runStep('Start SillyTavern server', () => startServer().then((port) => `http://127.0.0.1:${port}/`));

  session = new SillyTavernSession(`http://127.0.0.1:${fs.readFileSync(ST_PORTFILE, 'utf8').trim()}/`);
  await runStep('Launch browser and open SillyTavern', () => session.launch());
  await runStep('Dismiss onboarding modal if present', () => session.dismissOnboardingIfPresent(personaFixture.name));

  if (plan.mockScenario) {
    await runStep('Connect Chat Completion API', () => session.ensureApiConnected());
  }

  const character = plan.character ?? characterFixture;
  await runStep(`Create/select character "${character.name}"`, async () => {
    await session.createCharacter(character);
    await session.selectCharacter(character.name);
  });

  if (plan.extensionUrl) {
    await runStep(`Install extension: ${plan.extensionUrl}`, () => session.installExtension(plan.extensionUrl));
    steps.at(-1).screenshot = await screenshot(session, 'after-install');
  }

  for (const [i, step] of (plan.steps ?? []).entries()) {
    const label = step.label ?? `Step ${i + 1}: ${step.type}`;
    await runStep(label, async () => {
      switch (step.type) {
        case 'message':
          await session.sendMessage(step.text);
          return await session.getLastMessageText();
        case 'slashCommand':
          await session.sendMessage(step.command);
          return await session.getLastMessageText();
        case 'click':
          await session.page.click(step.selector);
          await session.page.waitForTimeout(500);
          return `clicked ${step.selector}`;
        case 'screenshot':
          return undefined;
        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }
    });
    steps.at(-1).screenshot = await screenshot(session, label);
  }
} catch (err) {
  console.error('[run-scenario] A step failed:', err.message);
  exitCode = 1;
} finally {
  if (session) {
    await writeCaptureArtifacts(runDir, session);
    await session.close();
  }
  const reportPath = await writeReport(runDir, { extensionUrl: plan.extensionUrl, steps, session });
  console.log(`[run-scenario] Report written to ${reportPath}`);

  if (!keepRunning) {
    await stopServer();
    await stopMockLlm();
  }
}

process.exit(exitCode);
