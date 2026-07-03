import { resetData } from '../lib/fixtures.mjs';

console.log('[reset] Wiping SillyTavern per-user data for a clean slate...');
await resetData();
console.log('[reset] Done. Next bootstrap/run will start from a fresh state.');
