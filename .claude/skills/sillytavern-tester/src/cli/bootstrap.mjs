import { ensureCloned, startServer } from '../lib/st-bootstrap.mjs';

const fresh = process.argv.includes('--fresh');

console.log(`[bootstrap] ${fresh ? 'Fresh cloning' : 'Ensuring'} SillyTavern (release branch)...`);
await ensureCloned({ fresh });

console.log('[bootstrap] Starting server...');
const port = await startServer();

console.log(`[bootstrap] SillyTavern is up at http://127.0.0.1:${port}/`);
