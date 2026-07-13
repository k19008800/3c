// Quick test to reproduce the error
const http = require('http');

const data = JSON.stringify({ email: 'admin@3cloud.ai', password: 'admin123' });

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/v1/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Login response:', res.statusCode, body);
    try {
      const authData = JSON.parse(body);
      if (authData.data?.accessToken) {
        // Now try vendors endpoint
        const token = authData.data.accessToken;
        const req2 = http.request({
          hostname: 'localhost',
          port: 3000,
          path: '/api/v1/admin/vendors',
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }, (res2) => {
          let body2 = '';
          res2.on('data', chunk => body2 += chunk);
          res2.on('end', () => {
            console.log('Vendors response:', res2.statusCode, body2);
          });
        });
        req2.end();
      } else {
        console.log('Login failed - no token');
      }
    } catch(e) {
      console.log('Parse error:', e.message);
    }
  });
});

req.on('error', (e) => console.error('Request error:', e.message));
req.write(data);
req.end();
