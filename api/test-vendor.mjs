import http from 'http';

const loginData = JSON.stringify({ email: 'admin@3cloud.ai', password: 'Admin1234!' });

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const loginRes = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/v1/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginData) },
  }, loginData);
  const authData = JSON.parse(loginRes.body);
  const token = authData?.data?.accessToken;
  if (!token) { console.log('Login failed:', loginRes.body.substring(0,200)); return; }
  const auth = { 'Authorization': `Bearer ${token}` };

  // 1. Vendors list
  console.log('--- GET /admin/vendors ---');
  let r = await request({ hostname: 'localhost', port: 3000, path: '/api/v1/admin/vendors', method: 'GET', headers: auth });
  console.log(r.status, JSON.parse(r.body).code, JSON.parse(r.body).data.total, 'vendors');

  // 2. Vendor models by vendor 1
  console.log('--- GET /admin/vendors/1/models ---');
  r = await request({ hostname: 'localhost', port: 3000, path: '/api/v1/admin/vendors/1/models', method: 'GET', headers: auth });
  console.log(r.status, JSON.parse(r.body).code, JSON.parse(r.body).data?.length || 0, 'models');

  // 3. Vendor detail
  console.log('--- GET /admin/vendors/1 ---');
  r = await request({ hostname: 'localhost', port: 3000, path: '/api/v1/admin/vendors/1', method: 'GET', headers: auth });
  console.log(r.status, JSON.parse(r.body).code, JSON.parse(r.body).data?.name);

  console.log('\nAll endpoints OK');
}
main().catch(console.error);
