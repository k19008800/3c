import { Worker, type Job } from "bullmq";
import { redisConnection } from "../lib/redis";

/**
 * BullMQ Worker 入口（独立进程）
 * 消费各队列任务。部署时与 API 进程分开（见 ecosystem.config.js）
 */

// 结算 worker
const settlementWorker = new Worker(
  "settlement",
  async (job: Job) => {
    console.log(`[settlement] 处理任务 ${job.id}:`, job.data);
    // TODO(Phase 1): 调用 settlement service
  },
  { connection: redisConnection },
);

// 佣金 worker
new Worker(
  "commission",
  async (job: Job) => {
    console.log(`[commission] 处理任务 ${job.id}:`, job.data);
  },
  { connection: redisConnection },
);

// 对账 worker
new Worker(
  "reconciliation",
  async (job: Job) => {
    console.log(`[reconciliation] 处理任务 ${job.id}:`, job.data);
  },
  { connection: redisConnection },
);

// 通知 worker
new Worker(
  "notification",
  async (job: Job) => {
    console.log(`[notification] 处理任务 ${job.id}:`, job.data);
  },
  { connection: redisConnection },
);

// Webhook worker
new Worker(
  "webhook",
  async (job: Job) => {
    console.log(`[webhook] 处理任务 ${job.id}:`, job.data);
  },
  { connection: redisConnection },
);

settlementWorker.on("ready", () => console.log("worker 已就绪，等待任务..."));
settlementWorker.on("error", (e) => console.error("worker 错误:", e));

process.on("SIGTERM", async () => {
  console.log("worker 关闭中...");
  await settlementWorker.close();
  process.exit(0);
});
