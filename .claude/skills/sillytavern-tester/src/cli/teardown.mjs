import { stopServer } from '../lib/st-bootstrap.mjs';
import { stopMockLlm } from '../lib/mock-llm.mjs';

console.log('[teardown] Stopping SillyTavern server...');
await stopServer();

console.log('[teardown] Stopping mock LLM server...');
await stopMockLlm();

console.log('[teardown] Done.');
