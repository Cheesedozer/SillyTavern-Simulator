---
name: sillytavern-tester
description: Boots a real, live SillyTavern instance in this sandbox, installs a third-party extension from a git URL through the real install flow, exercises its functions through the actual browser UI, and reports bugs with screenshots and logs. Use this whenever the user gives a SillyTavern extension's git repo URL and asks to test it, check for bugs, verify a new/changed function works, or otherwise QA a SillyTavern extension -- especially useful for a non-coder "vibe coder" extension author who cannot easily test it themselves.
---

# SillyTavern extension tester

## What this does

This skill runs a **real** copy of SillyTavern (cloned fresh from the official upstream repo,
never simulated) in this sandbox, drives it with a real headless browser (Playwright), installs
a third-party extension exactly the way a human would -- pasting its git URL into SillyTavern's
own "Install extension" dialog -- and then exercises whatever the user asked about: clicking a
button, sending a chat message, running a slash command, or triggering the extension's
LLM-function-calling hook. It captures screenshots, browser console errors, network activity, and
the SillyTavern server log, and writes all of it into a plain-English report.

The point is to replace slow manual clicking-through-the-UI testing with something Claude can do
in one shot and then explain in plain English: "here's what I tried, here's what happened, here's
the bug."

## Safety notes -- read before running

- This only runs inside this sandboxed environment, against a disposable copy of SillyTavern in
  `.work/` (gitignored, recreated on demand). Never point this at a real personal SillyTavern
  install or real user data.
- Installing a third-party extension means cloning and running someone else's JavaScript inside a
  real browser page. **Always tell the user what URL you're about to install and get their
  explicit go-ahead first**, even if they already mentioned the URL earlier in the conversation --
  don't install a URL you found by searching or that appeared in extension docs/README without
  asking.
- **Never install or enable a SillyTavern "server plugin"** (the separate, unsandboxed,
  full-Node-privileges extension system living in a `plugins/` directory, gated by
  `enableServerPlugins` in `config.yaml`). This skill only ever installs normal UI extensions via
  the git-URL flow into the per-user `extensions/` folder. If a user's extension turns out to be a
  server plugin, stop and tell them this skill doesn't support testing that kind of extension.
- SillyTavern itself shows its own "using third-party extensions can have unintended side effects"
  confirmation dialog on every install -- that's expected, the driver clicks through it as part of
  the normal flow described below.

## Required input

- The extension's git URL (e.g. `https://github.com/author/extension-name`).
- What to actually test: a specific button, slash command, or new/changed function the user
  mentioned. If they didn't say, ask, or open the cloned extension's own `index.js`/README (after
  installing) to find out what it exposes rather than guessing.
- Optional: if the user wants a real LLM response tested (not just the extension's own UI logic),
  ask whether they want to use the scripted mock backend (default, free, deterministic) or their
  own real API key (only if the extension's behavior actually depends on what the model says).

## How to run it

All commands below assume `cwd` is this skill's directory:
`.claude/skills/sillytavern-tester/`. First run `npm install` once if `node_modules` isn't there
yet (Playwright is the only dependency; this environment already has Chromium pre-installed at
`/opt/pw-browsers`, so no browser download is needed).

### The common case: install + exercise + report

Write a small test plan JSON (see schema below) describing what to click/send, then run:

```
node src/cli/run-scenario.mjs --plan <path-to-plan.json>
```

This clones/updates SillyTavern, resets to a clean data slate, boots the server, launches a
browser, creates a placeholder test character, installs the extension, runs through the plan's
steps, and writes `report.md` plus screenshots into a fresh timestamped folder under
`.work/runs/`. Read that `report.md` and summarize it for the user in plain English -- **quote the
actual captured console errors and log lines**, don't paraphrase "no errors found" without having
actually checked.

Two example plans are already in `test-fixtures/scenarios/` to use as templates:
- `smoke-ui-click.json` -- installs a real sample extension and clicks a couple of its UI elements.
- `tool-call-echo.json` -- exercises the LLM function-calling path against a scripted tool call.

### When the plan schema doesn't fit

Extensions vary a lot -- some register slash commands, some only show a settings panel, some hook
chat events. If the generic step types (`message`, `slashCommand`, `click`, `screenshot`) aren't
enough, write a short one-off Node script instead of fighting the JSON schema. Import the same
building blocks directly:

```js
import { ensureCloned, startServer } from './src/lib/st-bootstrap.mjs';
import { resetData, applySettingsOverlay, characterFixture, personaFixture } from './src/lib/fixtures.mjs';
import { startMockLlm } from './src/lib/mock-llm.mjs';
import { SillyTavernSession } from './src/lib/st-client.mjs';

await ensureCloned();
await resetData();
const mockUrl = await startMockLlm('/path/to/a/scenario.json'); // optional
if (mockUrl) await applySettingsOverlay(mockUrl);
await startServer();

const session = new SillyTavernSession('http://127.0.0.1:' + /* port from .work/st.port */ '/');
await session.launch();
await session.dismissOnboardingIfPresent(personaFixture.name);
if (mockUrl) await session.ensureApiConnected();
await session.createCharacter(characterFixture);
await session.selectCharacter(characterFixture.name);
await session.installExtension('https://github.com/author/extension-name');

// ... whatever the extension actually needs: session.page is a real Playwright Page,
// so use session.page.click/fill/locator directly for anything extension-specific.

await session.screenshot('/tmp/whatever.png');
console.log(session.consoleErrors, session.pageErrors);
await session.close();
```

`SillyTavernSession` (in `src/lib/st-client.mjs`) exposes: `launch`, `dismissOnboardingIfPresent`,
`ensureApiConnected`, `createCharacter`, `selectCharacter`, `sendMessage`, `getLastMessageText`,
`getAllMessageTexts`, `installExtension`, `screenshot`, `consoleErrors` (getter), `pageErrors`,
`networkLog`, and the raw `page` (a Playwright `Page`) for anything extension-specific.

Run `node src/cli/teardown.mjs` when done with an ad hoc script, since it leaves the server and
mock LLM running in the background otherwise.

## Test plan schema (for `run-scenario.mjs --plan`)

```jsonc
{
  "extensionUrl": "https://github.com/author/extension-name",   // optional
  "mockScenario": "test-fixtures/scenarios/some.mock.json",       // optional; omit to use whatever real API the user already configured
  "installToolEchoFixture": false,                                // optional; only for testing the LLM tool-calling path itself
  "character": { "name": "...", "description": "...", "firstMessage": "..." }, // optional; defaults to a placeholder fixture
  "steps": [
    { "type": "message", "text": "hello", "label": "optional human-readable label" },
    { "type": "slashCommand", "command": "/roll 1d6" },
    { "type": "click", "selector": "text=Example Button" },
    { "type": "screenshot", "label": "just capture the current state" }
  ]
}
```

`mockScenario` files are arrays of scripted responses, matched in order against the last user
message (see `test-fixtures/scenarios/tool-call-echo.mock.json`):

```jsonc
[
  { "match": { "contains": "roll the dice" }, "content": "You rolled a 4." },
  { "toolCalls": [{ "id": "call_1", "type": "function", "function": { "name": "tool_echo", "arguments": "{\"message\":\"hi\"}" } }] },
  { "content": "fallback reply used when nothing else matches" }
]
```

Entries without `match` always match (useful as a catch-all last entry). An unscripted request
(nothing matched) still gets a reply so the test doesn't hang, but it's logged as a warning and
shows up in the report -- treat that as a sign the scenario file needs another entry, not as a
real extension bug.

## Troubleshooting

- **"API did not report a valid connection"**: SillyTavern requires clicking "Connect" every
  browser session even when `settings.json` already has the right `chat_completion_source`/
  `custom_url` -- this is handled by `ensureApiConnected()`, but if it fails, check
  `.work/mock-llm.log` to confirm the mock server actually started and is reachable.
  Note that this step doesn't need to be run for scenarios that don't send chat messages
- **Extension install fails with "Directory already exists"**: a previous run left that
  extension's folder in place. Run `node src/cli/reset.mjs` (or don't pass `--keep-data` to
  `run-scenario.mjs`) for a clean slate.
- **A click times out because an element "intercepts pointer events"**: almost always means a
  drawer/panel toggle was clicked while already open (closing it) or a dialog is still open from a
  previous step. Check `console.jsonl`/screenshots from the step before it.
- **Server port already in use / stale processes**: `.work/st.pid` and `.work/mock-llm.pid` track
  the background processes; `node src/cli/teardown.mjs` stops both. Ports are chosen dynamically
  per run so collisions between runs shouldn't happen, but a crashed prior run can leave a
  process alive -- check `ps aux | grep server.js`.
- **SillyTavern itself changed and a selector broke**: this skill drives the real, current
  upstream UI, so a SillyTavern update can change an id/class. If a step fails in a way that looks
  like a missing/renamed element rather than an extension bug, say so explicitly rather than
  attributing it to the extension under test.

## Where evidence lives

Each `run-scenario.mjs` run writes to `.work/runs/<timestamp>/`: `report.md`, `screenshots/*.png`,
`console.jsonl`, `page-errors.jsonl`, `network.jsonl`, and tails of the SillyTavern and mock LLM
server logs. This directory is gitignored -- copy anything the user should keep somewhere durable
before the sandbox is reclaimed.
