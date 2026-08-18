// 3cloud PM2 配置（pnpm monorepo 版）— P3-3
// 生产服内存小（2C/1.7G）：所有调度器（价格通知/佣金回填/留痕保留/健康聚合/任务轮询/预扣清理）
// 均内嵌于 app 启动（api/src/app.ts startApp），无需独立 worker 进程 → 单实例部署避免 OOM
module.exports = {
  apps: [
    {
      name: '3cloud-api',
      cwd: '/root/3cloud',
      script: 'api/dist/index.js',
      instances: 1, // 1.7G 内存不跑 cluster，避免 OOM
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOST: '0.0.0.0',
      },
      max_memory_restart: '1G',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/var/log/3cloud/api-error.log',
      out_file: '/var/log/3cloud/api-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
