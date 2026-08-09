import { z } from 'zod';

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
