// ============================================================
//  仿真模式 Mock（SIMULATION）
// ============================================================

import type { VendorModelRoute } from "./types.js";
import type { ForwardResult, StreamForwardResult } from "./types.js";

const SIMULATION = process.env.SIMULATION === "true";

/**
 * 仿真模式下生成模拟的上游响应（不发起真实 HTTP 请求）
 */
export function mockVendorResponse(
  route: VendorModelRoute,
  rawBody: unknown,
): ForwardResult {
  // 估算 prompt tokens
  let promptTokens = 0;
  if (rawBody && typeof rawBody === "object") {
    const body = rawBody as any;
    if (body.messages) {
      promptTokens = JSON.stringify(body.messages).length / 2;
    } else if (body.input) {
      promptTokens = (typeof body.input === "string" ? body.input.length : JSON.stringify(body.input).length) / 2;
    }
  }
  promptTokens = Math.max(10, Math.min(8000, Math.round(promptTokens)));
  if (promptTokens < 100) promptTokens = Math.floor(Math.random() * 2000) + 100;

  const completionTokens = Math.floor(Math.random() * 3000) + 50;
  const totalTokens = promptTokens + completionTokens;

  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: {
      id: "chatcmpl-sim-" + Date.now(),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: route.upstreamModelName,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "这是一个仿真模式下的模拟回复。" },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
      },
    },
    usage: { promptTokens, completionTokens, totalTokens },
  };
}

/**
 * 仿真模式下生成模拟的流式上游响应
 */
export function mockStreamResponse(
  route: VendorModelRoute,
  rawBody: unknown,
): StreamForwardResult {
  let promptTokens = 0;
  if (rawBody && typeof rawBody === "object") {
    const body = rawBody as any;
    if (body.messages) {
      promptTokens = JSON.stringify(body.messages).length / 2;
    } else if (body.input) {
      promptTokens = (typeof body.input === "string" ? body.input.length : JSON.stringify(body.input).length) / 2;
    }
  }
  promptTokens = Math.max(10, Math.min(8000, Math.round(promptTokens)));
  if (promptTokens < 100) promptTokens = Math.floor(Math.random() * 2000) + 100;

  const completionTokens = Math.floor(Math.random() * 3000) + 50;
  const totalTokens = promptTokens + completionTokens;

  const usage = { promptTokens, completionTokens, totalTokens };

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  // 构造模拟的 SSE 流
  const deltaMessages = ["好的", "让我", "想想", "这个", "问题。"];
  for (const delta of deltaMessages) {
    const sseLine = `data: ${JSON.stringify({
      id: "chatcmpl-sim-" + Date.now(),
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: route.upstreamModelName,
      choices: [{
        index: 0,
        delta: { content: delta },
        finish_reason: null,
      }],
    })}\n\n`;
    chunks.push(encoder.encode(sseLine));
  }

  // 最后一块带 usage
  const finalLine = `data: ${JSON.stringify({
    id: "chatcmpl-sim-" + Date.now(),
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: route.upstreamModelName,
    choices: [{
      index: 0,
      delta: {},
      finish_reason: "stop",
    }],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    },
  })}\n\n`;
  chunks.push(encoder.encode(finalLine));
  chunks.push(encoder.encode("data: [DONE]\n\n"));

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  return {
    status: 200,
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
    stream,
    usagePromise: Promise.resolve(usage),
  };
}

export { SIMULATION };
