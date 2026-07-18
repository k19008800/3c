// Quick mock server for testing sync-models
const http = require('http');

const modelsResponse = {
  object: "list",
  data: [
    { id: "gpt-4o", object: "model", created: 1687882411, owned_by: "openai" },
    { id: "gpt-4o-mini", object: "model", created: 1687882411, owned_by: "openai" },
    { id: "text-embedding-3-small", object: "model", created: 1687882411, owned_by: "openai" },
    { id: "deepseek-chat", object: "model", created: 1687882411, owned_by: "deepseek" },
    { id: "dall-e-3", object: "model", created: 1687882411, owned_by: "openai" },
    { id: "tts-1", object: "model", created: 1687882411, owned_by: "openai" },
    { id: "whisper-1", object: "model", created: 1687882411, owned_by: "openai" },
    { id: "moderation-latest", object: "model", created: 1687882411, owned_by: "openai" },
  ]
};

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);
  
  if (req.url === '/v1/models') {
    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(modelsResponse));
  } else if (req.url.startsWith('/v1/chat/completions')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: "test", object: "chat.completion", choices: [] }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const PORT = 18999;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock vendor API running on http://127.0.0.1:${PORT}/v1/models`);
  console.log(`Models: ${modelsResponse.data.map(m => m.id).join(', ')}`);
});
