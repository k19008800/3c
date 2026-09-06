/* #22 verify: build artifact runnable — start dist/index.js non-interactively, hit /health */
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const apiDir = __dirname;
const outLog = path.join(apiDir, 'verify-start.out.log');
const errLog = path.join(apiDir, 'verify-start.err.log');

// kill any existing node dist/index.js on :3000 prevention: try to detect via header node
const child = spawn(process.execPath, ['dist/index.js'], {
  cwd: apiDir,
  env: { ...process.env },
  stdio: ['ignore', fs.openSync(outLog, 'w'), fs.openSync(errLog, 'w')],
});

const deadline = Date.now() + 20000;
function probe() {
  if (Date.now() > deadline) {
    console.log('RESULT=TIMEOUT');
    child.kill('SIGKILL');
    process.exit(1);
  }
  const req = http.get('http://127.0.0.1:3000/health', (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => {
      console.log('RESULT=HTTP ' + res.statusCode);
      console.log('BODY=' + body);
      child.kill('SIGKILL');
      process.exit(res.statusCode === 200 ? 0 : 1);
    });
  });
  req.on('error', (e) => {
    setTimeout(probe, 800);
  });
  req.setTimeout(2000, () => req.destroy());
}
setTimeout(probe, 3000);