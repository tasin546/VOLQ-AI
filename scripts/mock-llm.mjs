import http from 'node:http';

const PORT = 11435;

const MOCK_MODELS = [
  { id: 'demo-fast', object: 'model', created: 1700000000, owned_by: 'demo' },
  { id: 'demo-reasoner', object: 'model', created: 1700000000, owned_by: 'demo' },
  { id: 'demo-vision', object: 'model', created: 1700000000, owned_by: 'demo' },
];

const SAMPLE_RESPONSES = [
  `### Architecture Overview

Here is a recommended Docker Compose setup for a high-performance Python microservice:

\`\`\`yaml
services:
  api:
    image: python:3.12-slim
    ports:
      - "8000:8000"
    environment:
      - WORKERS=4
      - LOG_LEVEL=info
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/healthz"]
      interval: 10s
\`\`\`

#### Key Metrics & Performance

| Component | Target Latency | P99 SLA | Concurrency |
| :--- | :--- | :--- | :--- |
| **API Gateway** | < 5ms | 15ms | 10,000 req/s |
| **Cache Layer** | < 2ms | 5ms | 50,000 req/s |
| **Database** | < 12ms | 45ms | 2,500 req/s |

Let me know if you would like me to configure the monitoring pipeline.`,

  `Here is a clean implementation of the QuickSort algorithm with step-by-step partition logic:

\`\`\`python
def quicksort(arr: list[int]) -> list[int]:
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)

# Example usage
numbers = [38, 27, 43, 3, 9, 82, 10]
sorted_numbers = quicksort(numbers)
print("Sorted:", sorted_numbers)
\`\`\`

The average time complexity is $\\mathcal{O}(n \\log n)$, with space complexity $\\mathcal{O}(\\log n)$.`,
];

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (url.pathname === '/v1/models' || url.pathname === '/api/tags') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (url.pathname === '/api/tags') {
      res.end(JSON.stringify({ models: MOCK_MODELS.map((m) => ({ name: m.id })) }));
    } else {
      res.end(JSON.stringify({ object: 'list', data: MOCK_MODELS }));
    }
    return;
  }

  if (url.pathname === '/v1/chat/completions') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      let parsed = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        // ignore
      }

      const isStream = parsed.stream === true;
      const responseText =
        SAMPLE_RESPONSES[Math.floor(Math.random() * SAMPLE_RESPONSES.length)];

      if (!isStream) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: parsed.model || 'demo-fast',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: responseText },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 35, completion_tokens: 120, total_tokens: 155 },
          })
        );
        return;
      }

      // Streaming SSE mode
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const words = responseText.split(' ');
      for (const word of words) {
        const chunk = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: parsed.model || 'demo-fast',
          choices: [
            {
              index: 0,
              delta: { content: word + ' ' },
              finish_reason: null,
            },
          ],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        await new Promise((r) => setTimeout(r, 20));
      }

      res.write('data: [DONE]\n\n');
      res.end();
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Mock LLM server running on http://127.0.0.1:${PORT}`);
});
