#!/usr/bin/env node
const fs = require('fs');
const lines = fs.readFileSync('e2e-api.log', 'utf8').split(/\r?\n/);
let inReq = false, cur = {};
const out = [];
for (const l of lines) {
  if (l.includes('incoming request')) {
    const t = l.match(/\[(\d{2}:\d{2}:\d{2}\.\d+)\]/)?.[1] || '';
    if (t >= '12:18:00' && t <= '12:19:00') inReq = true; else inReq = false;
    cur = { t };
  } else if (inReq && l.includes('"url"')) {
    cur.url = l.match(/"url": "([^"]+)"/)?.[1];
  } else if (inReq && l.includes('statusCode')) {
    cur.status = l.match(/statusCode": (\d+)/)?.[1];
    out.push(`${cur.t} ${cur.status} ${cur.url}`);
    inReq = false;
  }
}
console.log(out.join('\n'));
