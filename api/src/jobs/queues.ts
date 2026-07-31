import { Queue } from "bullmq";
import { redisConnection } from "../lib/redis";

/**
 * BullMQ 队列定义
 * 覆盖异步任务：结算 / 佣金 / 对账 / 通知 / Webhook 投递
 * 原则：业务重活一律走队列，不在请求处理里同步执行
 */
export const queues = {
  /** 结算任务 */
  settlement: new Queue("settlement", { connection: redisConnection }),
  /** 佣金计算 */
  commission: new Queue("commission", { connection: redisConnection }),
  /** 对账任务 */
  reconciliation: new Queue("reconciliation", { connection: redisConnection }),
  /** 邮件/站内通知 */
  notification: new Queue("notification", { connection: redisConnection }),
  /** Webhook 投递 */
  webhook: new Queue("webhook", { connection: redisConnection }),
} as const;

export type QueueName = keyof typeof queues;
