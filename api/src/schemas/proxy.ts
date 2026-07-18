// ============================================================
//  3cloud (3C) — OpenAI Compatible / Token Proxy Zod Schemas
// ============================================================

import { z } from "zod";

// OpenAI Chat Completions Request (validated subset)
export const chatCompletionSchema = z.object({
  model: z.string().min(1),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.union([z.string(), z.array(z.any())]),
  })).min(1),
  stream: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  top_p: z.number().min(0).max(1).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
});

export type ChatCompletionInput = z.infer<typeof chatCompletionSchema>;

// Embeddings Request
export const embeddingsSchema = z.object({
  model: z.string().min(1),
  input: z.union([z.string(), z.array(z.string())]),
});
export type EmbeddingsInput = z.infer<typeof embeddingsSchema>;
