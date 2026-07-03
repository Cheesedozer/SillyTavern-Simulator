import fs from 'node:fs';
import { ensureCloned, startServer } from '../lib/st-bootstrap.mjs';
import { personaFixture } from '../lib/fixtures.mjs';
import { SillyTavernSession } from '../lib/st-client.mjs';
import { ST_PORTFILE } from '../lib/paths.mjs';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node install-extension.mjs <git-url>');
  process.exit(1);
}

await ensureCloned();
await startServer();

const session = new SillyTavernSession(`http://127.0.0.1:${fs.readFileSync(ST_PORTFILE, 'utf8').trim()}/`);
await session.launch();
await session.dismissOnboardingIfPresent(personaFixture.name);
await session.installExtension(url);

console.log(`[install-extension] Installed ${url}. Server is still running -- use "npm run teardown" when done.`);
await session.close();
