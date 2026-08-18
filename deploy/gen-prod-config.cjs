#!/usr/bin/env node
/**
 * 3cloud 生产配置生成器 — P3-3
 *
 * 生成生产部署所需密钥与配置模板（不落盘生产值，仅输出到 stdout 供手动写入生产 .env）：
 *   - JWT_SECRET（64 字节随机）
 *   - 加密密钥（32 字节随机，hex）
 *   - 建议的 DATABASE_URL / REDIS_URL 占位
 * 用法: node deploy/gen-prod-config.cjs
 * 输出: 生产环境变量清单（复制到生产 .env）
 */
const crypto = require('node:crypto');

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

const lines = [
  '# ===== 3cloud 生产环境变量（生成时间 ' + new Date().toISOString() + '）=====',
  '# ⚠️ 禁止复用开发配置；此输出仅本次可见，请立即写入生产 .env 并妥善保管',
  '',
  'NODE_ENV=production',
  'PORT=3000',
  'HOST=0.0.0.0',
  '',
  `JWT_SECRET=${randomHex(64)}`,
  `JWT_REFRESH_SECRET=${randomHex(64)}`,
  `ENCRYPTION_KEY=${randomHex(32)}`, // AES-256 密钥（敏感字段加密）
  '',
  'DATABASE_URL=postgres://postgres:CHANGE_ME@localhost:5432/threecloud_v3',
  'REDIS_URL=redis://localhost:6379',
  'LOG_LEVEL=info',
  'BODY_LIMIT_MB=64',
  '',
  '# 邮件（生产必配）',
  'SMTP_HOST=CHANGE_ME',
  'SMTP_PORT=465',
  'SMTP_USER=CHANGE_ME',
  'SMTP_PASS=CHANGE_ME',
  '',
  '# 支付（上线前按需配置）',
  '# PAY_WECHAT_*',
  '# PAY_ALIPAY_*',
];

console.log(lines.join('\n'));
