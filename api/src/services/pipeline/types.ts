import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';

// ============================================================
// Pipeline Types
// ============================================================

export interface PipelineContext {
  requestId: string;
  userId: number;
  apiKeyId: number;
  model: string;
  body: Record<string, unknown>;
  stream: boolean;
  metadata: Record<string, unknown>;
  /** P0-4: 网关路由注入的请求对象（pipeline steps 使用；无则省略） */
  request?: FastifyRequest;
  /** P0-4: 网关路由注入的响应对象（pipeline steps 使用；无则省略） */
  reply?: FastifyReply;
}

export interface PipelineStep<T = void> {
  name: string;
  execute: (ctx: PipelineContext) => Promise<T>;
  rollback?: (ctx: PipelineContext) => Promise<void>;
  /** Don't rollback this step even if a later step fails */
  noRollbackOn?: boolean;
}

export type PipelineResult<T extends unknown[]> = {
  success: true;
  results: T;
} | {
  success: false;
  error: Error;
  failedStep: string;
  results: Partial<T>;
};
