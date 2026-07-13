const http = require('http');

const API_KEY = 'sk-3c-ac788b0e98e0115e0b45f4b101ef439256f91b6ab5c059dc';

function sendRequest() {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 10,
    });
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(data),
      },
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: body,
        });
      });
    });
    req.on('error', (e) => resolve({ status: 0, headers: {}, body: e.message }));
    req.write(data);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  // First clear any residual rate limits by waiting
  await sleep(65000);
  
  console.log('=== RPM Test with Node.js http ===');
  console.log('');
  
  for (let i = 1; i <= 8; i++) {
    const result = await sendRequest();
    const headerInfo = result.headers['retry-after'] || result.headers['retry-after'] === '' ? `retry-after:${result.headers['retry-after']}` : 'no-retry-after';
    const shortBody = result.body.substring(0, 200);
    console.log(`Req ${i}: HTTP ${result.status} | ${headerInfo}`);
    console.log(`  Body: ${shortBody}...`);
    console.log('');
  }
}

main().catch(e => console.error(e));
