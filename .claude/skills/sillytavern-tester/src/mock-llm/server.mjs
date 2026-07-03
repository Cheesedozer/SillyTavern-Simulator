import http from 'node:http';
import fs from 'node:fs';

/**
 * A minimal OpenAI-compatible chat completion stub for deterministic extension testing.
 * SillyTavern's "Custom (OpenAI-compatible)" chat completion source POSTs to
 * `${custom_url}/chat/completions` and forwards our JSON response straight to the browser,
 * so this only needs to speak the OpenAI response shape, not proxy a real model.
 *
 * Scenario format (array, matched in request order): each entry is
 *   { match?: { contains: string }, content?: string, toolCalls?: OpenAIToolCall[] }
 * Entries without a `match` always match. The first unconsumed matching entry is used;
 * if nothing matches, a fallback reply is returned and a warning is logged, since an
 * unscripted request usually means the test scenario doesn't cover what actually happened.
 */

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : fallback;
};

const port = Number.parseInt(getArg('port', '0'), 10);
const scenarioPath = getArg('scenario', null);

let scenario = [];
if (scenarioPath) {
  scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
}
const consumed = new Array(scenario.length).fill(false);
const receivedRequests = [];

function lastUserMessage(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return String(messages[i].content ?? '');
  }
  return '';
}

function pickScenarioEntry(body) {
  const userText = lastUserMessage(body).toLowerCase();
  for (let i = 0; i < scenario.length; i++) {
    if (consumed[i]) continue;
    const entry = scenario[i];
    const needle = entry.match?.contains?.toLowerCase();
    if (!needle || userText.includes(needle)) {
      consumed[i] = true;
      return entry;
    }
  }
  return null;
}

function buildCompletion(entry) {
  const hasToolCalls = Array.isArray(entry?.toolCalls) && entry.toolCalls.length > 0;
  return {
    id: `mock-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'mock-model',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: entry?.content ?? (hasToolCalls ? null : ''),
          ...(hasToolCalls ? { tool_calls: entry.toolCalls } : {}),
        },
        finish_reason: hasToolCalls ? 'tool_calls' : 'stop',
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url?.startsWith('/v1/chat/completions')) {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      receivedRequests.push(body);

      const entry = pickScenarioEntry(body);
      if (!entry) {
        console.warn(`[mock-llm] WARNING: unscripted request (no matching scenario entry). Last user message: ${JSON.stringify(lastUserMessage(body))}`);
      }
      const completion = buildCompletion(entry ?? { content: '[mock-llm: unscripted request -- no scenario entry matched]' });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(completion));
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/v1/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'mock-model', object: 'model' }] }));
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/_control/requests')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(receivedRequests));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'not found' } }));
  } catch (err) {
    console.error('[mock-llm] request handling error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: err.message } }));
  }
});

server.listen(port, '127.0.0.1', () => {
  const actualPort = server.address().port;
  console.log(`[mock-llm] listening on http://127.0.0.1:${actualPort}/v1 (scenario: ${scenarioPath ?? 'none'})`);
});
