/**
 * 上游转发步骤
 *
 * 职责：
 * - 预处理多模态 base64 数据（body-preprocessor）
 * - 流式：fetch 上游 → streamRelay 逐 chunk 转发 SSE → 写 reply
 * - 非流式：relayNonStream passthrough → 设置 upstreamData
 * - 调用 recordResult 熔断学习
 * - 设置 ctx.upstreamResponse / ctx.upstreamData
 *
 * @see services/upstream/proxy.ts streamRelay / relayNonStream
 * @see services/upstream/body-preprocessor.ts preprocessRequestBody
 * @see services/circuit-breaker.ts recordResult
 * @module pipeline/steps
 */

import type { PipelineStep } from "../types";
import type { GatewayContext } from "../types";
import { preprocessRequestBody } from "../../upstream/body-preprocessor";
import { streamRelay, relayNonStream, UpstreamError } from "../../upstream/proxy";
import type { ForwardResult } from "../../upstream";
import { recordResult } from "../../circuit-breaker";

/**
 * 创建上游转发 Pipeline 步骤
 *
 * execute: 多模态预处理 → fetch 上游 → streamRelay/relayNonStream → 熔断学习
 * rollback: 无（转发不可逆）
 */
export function createProxyStep(): PipelineStep<GatewayContext> {
  return {
    name: "proxy",
    execute: async (ctx) => {
      const isStream = (ctx.body.stream as boolean) === true;

      // 1. 预处理多模态 base64
      const preprocessResult = await preprocessRequestBody(ctx.body);
      const processedBody = { ...preprocessResult.body, model: ctx.upstreamModel };

      // 2. 构建上游 URL
      const baseUrl = (ctx.vendorBaseUrl ?? "").replace(/\/$/, "");
      const upstreamUrl = `${baseUrl}/chat/completions`;
      const apiKey = ctx.vendorApiKey!;

      // 3. 转发
      if (isStream) {
        // 流式：fetch → streamRelay → 逐 chunk 写 SSE reply
        const fetchRes = await fetch(upstreamUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(processedBody),
        });

        if (!fetchRes.ok) {
          let upstreamBody: Record<string, unknown> | undefined;
          try {
            upstreamBody = JSON.parse(await fetchRes.text()) as Record<string, unknown>;
          } catch { /* ignore */ }
          throw new UpstreamError(fetchRes.status, `上游返回 ${fetchRes.status}`, upstreamBody);
        }

        if (!fetchRes.body) {
          throw new UpstreamError(502, "上游返回空 body");
        }

        // 逐 chunk 转发 SSE
        ctx.reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        const streamState = await streamRelay(fetchRes.body, (line: string) => {
          ctx.reply.raw.write(line + "\n");
        });

        ctx.reply.raw.end();

        // 构建响应摘要
        ctx.upstreamResponse = {
          ok: streamState.finishReason !== null,
          status: streamState.finishReason !== null ? 200 : 502,
          latencyMs: 0,
          usage: streamState.lastValidUsage
            ? {
                inputTokens: streamState.lastValidUsage.prompt_tokens,
                outputTokens: streamState.lastValidUsage.completion_tokens,
                totalTokens: streamState.lastValidUsage.total_tokens,
              }
            : undefined,
        };

        // 标记已发送流式响应
        ctx._streamSent = true;

        // 熔断学习
        if (ctx.vendorModelId) {
          await recordResult(ctx.vendorModelId, streamState.finishReason !== null);
        }
      } else {
        // 非流式转发
        const bodyStr = JSON.stringify(processedBody);
        const data = await relayNonStream(upstreamUrl, apiKey, bodyStr);

        // 提取 usage
        const usageObj = (data as Record<string, unknown>).usage as Record<string, unknown> | undefined;
        const usage: ForwardResult["usage"] = usageObj
          ? {
              inputTokens: Number(usageObj.prompt_tokens ?? 0),
              outputTokens: Number(usageObj.completion_tokens ?? 0),
              totalTokens: Number(usageObj.total_tokens ?? 0),
            }
          : undefined;

        const result: ForwardResult = {
          ok: true,
          status: 200,
          data,
          latencyMs: 0,
          usage,
        };

        ctx.upstreamResponse = result;
        if (result.ok && result.data) {
          ctx.upstreamData = result.data;
        }

        // 熔断学习
        if (ctx.vendorModelId) {
          await recordResult(ctx.vendorModelId, true);
        }
      }
    },
  };
}
