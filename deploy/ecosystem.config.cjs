// 3cloud PM2 配置（pnpm monorepo 版）— P3-3
// 生产服内存小（2C/1.7G）：所有调度器（价格通知/佣金回填/留痕保留/健康聚合/任务轮询/预扣清理）
// 均内嵌于 app 启动（api/src/app.ts startApp），无需独立 worker 进程 → 单实例部署避免 OOM
const fs = require('node:fs');
const path = require('node:path');

// 读取 api/.env（若存在）注入 PM2 环境，保证 PM2 启动/重启时带全量生产配置
// （deploy.sh 的 set -a source 只对本次 shell 生效，PM2 daemon 需自持 env）
const envFile = path.join(__dirname, '..', 'api', '.env');
const fileEnv = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) fileEnv[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

const apiEnv = {
  NODE_ENV: 'production',
  PORT: 3000,
  HOST: '0.0.0.0',
  ...fileEnv,
};
const portalEnv = {
  NODE_ENV: 'production',
  PORT: 3100,
};

module.exports = {
  apps: [
    {
      name: '3cloud-api',
      cwd: '/root/3cloud',
      script: 'api/dist/index.js',
      instances: 1, // 1.7G 内存不跑 cluster，避免 OOM
      exec_mode: 'fork',
      env: apiEnv,
      max_memory_restart: '1G',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/var/log/3cloud/api-error.log',
      out_file: '/var/log/3cloud/api-out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: '3cloud-portal',
      cwd: '/root/3cloud/web-portal',
      script: './node_modules/next/dist/bin/next',
      args: 'start -p 3100',
      instances: 1,
      exec_mode: 'fork',
      env: portalEnv,
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/var/log/3cloud/portal-error.log',
      out_file: '/var/log/3cloud/portal-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
