/**
 * Token 计费模块测试 — Phase 1.3 交付验收
 *
 * 覆盖 7 个测试 case（对齐 development-plan.md §1.3 测试要求）：
 *   1. 上游返回完整 usage → trustUpstream=true
 *   2. 上游中途断开但最后帧有 usage → 采信最后一帧
 *   3. 上游中断且无 usage → 本地 tiktoken fallback
 *   4. 非流式请求 → 从 response.usage 提取
 *   5. 流式请求 → 从 finish_reason 非空的 chunk 提取 usage
 *   6. input token 估算 → 使用 tiktoken 请求前估算
 *   7. 补全倍率 → 输出 token 价格 = 输入价 × output_multiplier
 *
 * @see development-plan.md §1.3 Token 计数
 * @see newapi-migration-guide.md §2.2
 */

import { describe, it, expect } from "vitest";
import {
  estimateInputTokens,
  countOutputTokens,
  getModelEncoding,
} from "../src/services/billing/token-counter";
import {
  extractUsageFromResponse,
  extractUsageFromStream,
  updateStreamState,
  createStreamState,
  calculateOutputPrice,
  calculateTotalCost,
  round4,
  type StreamState,
  type StreamChunk,
} from "../src/services/billing/usage-parser";

// ============================================================
// Case 1: 上游返回完整 usage → 完全采信，trustUpstream=true
// ============================================================
describe("Token 计费 — Usage 解析", () => {
  describe("Case 1: 上游返回完整 usage → 完全采信", () => {
    it("非流式响应含完整 usage → trustUpstream=true, fallback=false", () => {
      const body = {
        id: "chatcmpl-123",
        object: "chat.completion",
        model: "gpt-4o",
        choices: [{ index: 0, message: { role: "assistant", content: "Hello!" }, finish_reason: "stop" }],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 8,
          total_tokens: 23,
        },
      };

      const result = extractUsageFromResponse(body);

      expect(result.inputTokens).toBe(15);
      expect(result.outputTokens).toBe(8);
      expect(result.totalTokens).toBe(23);
      expect(result.trustUpstream).toBe(true);
      expect(result.fallback).toBe(false);
    });

    it("流式正常结束 + 最后帧有 usage → trustUpstream=true", () => {
      const state: StreamState = {
        lastValidUsage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        generatedText: "The quick brown fox jumps over the lazy dog.",
        finishReason: "stop",
        totalChunks: 20,
        abnormalEnd: false,
      };

      const result = extractUsageFromStream(state, 120, "gpt-4o");

      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
      expect(result.totalTokens).toBe(150);
      expect(result.trustUpstream).toBe(true);
      expect(result.fallback).toBe(false);
    });
  });

  // ============================================================
  // Case 2: 上游中途断开但最后帧有 usage → 采信最后一帧 usage
  // ============================================================
  describe("Case 2: 上游中途断开但最后帧有 usage → 采信", () => {
    it("abnormalEnd=true + lastValidUsage 存在 → trustUpstream=true", () => {
      const state: StreamState = {
        lastValidUsage: { prompt_tokens: 200, completion_tokens: 120, total_tokens: 320 },
        generatedText: "Partial response that was cut off mid",
        finishReason: null, // 断开 → 无正常 finish_reason
        totalChunks: 5,
        abnormalEnd: true,
      };

      const result = extractUsageFromStream(state, 250, "gpt-4o");

      expect(result.inputTokens).toBe(200);
      expect(result.outputTokens).toBe(120);
      expect(result.totalTokens).toBe(320);
      expect(result.trustUpstream).toBe(true);
      expect(result.fallback).toBe(false);
    });

    it("异常断开但上游返回了 usage（仅 prompt_tokens）→ 采信", () => {
      const state: StreamState = {
        lastValidUsage: { prompt_tokens: 50 },
        generatedText: "",
        finishReason: null,
        totalChunks: 1,
        abnormalEnd: true,
      };

      const result = extractUsageFromStream(state, 60, "gpt-4o");

      expect(result.inputTokens).toBe(50);
      expect(result.outputTokens).toBe(0);
      expect(result.trustUpstream).toBe(true);
      expect(result.fallback).toBe(false);
    });
  });

  // ============================================================
  // Case 3: 上游中断且无 usage → 本地 tiktoken 计算，fallback=true
  // ============================================================
  describe("Case 3: 上游中断且无 usage → 本地 tiktoken fallback", () => {
    it("无 usage + 有生成文本 → fallback=true, 用 countOutputTokens 估算", () => {
      const generatedText = "This is a test response.";
      const estimatedInput = 50;

      const state: StreamState = {
        lastValidUsage: null,
        generatedText,
        finishReason: null,
        totalChunks: 3,
        abnormalEnd: true,
      };

      const result = extractUsageFromStream(state, estimatedInput, "gpt-4o");

      expect(result.trustUpstream).toBe(false);
      expect(result.fallback).toBe(true);
      // 输入 token 使用预估数
      expect(result.inputTokens).toBe(estimatedInput);
      // 输出 token 使用本地 tiktoken 计数
      expect(result.outputTokens).toBeGreaterThan(0);
      expect(result.totalTokens).toBe(estimatedInput + result.outputTokens);

      // 验证本地 tiktoken 计数：与 countOutputTokens 一致
      const directCount = countOutputTokens("gpt-4o", generatedText);
      expect(result.outputTokens).toBe(directCount);
    });

    it("无 usage + 无生成文本 → fallback=true, outputTokens=0", () => {
      const state: StreamState = {
        lastValidUsage: null,
        generatedText: "",
        finishReason: null,
        totalChunks: 1,
        abnormalEnd: true,
      };

      const result = extractUsageFromStream(state, 30, "gpt-4o");

      expect(result.trustUpstream).toBe(false);
      expect(result.fallback).toBe(true);
      expect(result.inputTokens).toBe(30);
      expect(result.outputTokens).toBe(0);
      expect(result.totalTokens).toBe(30);
    });
  });

  // ============================================================
  // Case 4: 非流式请求 → 从 response.usage 提取
  // ============================================================
  describe("Case 4: 非流式请求 → 从 response.usage 提取", () => {
    it("标准 OpenAI chat completion 响应 → 提取 usage", () => {
      const body = {
        id: "chatcmpl-456",
        object: "chat.completion",
        created: 1234567890,
        model: "gpt-3.5-turbo",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Hi there!" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      const result = extractUsageFromResponse(body);

      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(5);
      expect(result.totalTokens).toBe(15);
      expect(result.trustUpstream).toBe(true);
      expect(result.fallback).toBe(false);
    });

    it("响应中无 usage → trustUpstream=false, fallback=true", () => {
      const body = {
        id: "chatcmpl-789",
        object: "chat.completion",
        model: "some-model",
        choices: [
          { index: 0, message: { role: "assistant", content: "Hi" }, finish_reason: "stop" },
        ],
        // 无 usage 字段
      };

      const result = extractUsageFromResponse(body);

      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
      expect(result.totalTokens).toBe(0);
      expect(result.trustUpstream).toBe(false);
      expect(result.fallback).toBe(true);
    });

    it("usage 字段为 {} → trustUpstream=false", () => {
      const body = {
        usage: {},
      };

      const result = extractUsageFromResponse(body);

      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
      expect(result.trustUpstream).toBe(false);
      expect(result.fallback).toBe(true);
    });
  });

  // ============================================================
  // Case 5: 流式请求 → 从最后一个 finish_reason 非空的 chunk 提取 usage
  // ============================================================
  describe("Case 5: 流式请求 → 从 finish_reason 非空的 chunk 提取", () => {
    it("多 chunk 流式，最后一帧有 usage → 采信最后一帧", () => {
      const state = createStreamState();

      // 模拟流式 chunks
      const chunks: StreamChunk[] = [
        {
          id: "chatcmpl-1",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
        },
        {
          id: "chatcmpl-1",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { content: "Hello" }, finish_reason: null }],
          usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 },
        },
        {
          id: "chatcmpl-1",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { content: " world" }, finish_reason: null }],
          usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
        },
        {
          id: "chatcmpl-1",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { content: "!" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
        },
      ];

      for (const chunk of chunks) {
        updateStreamState(state, chunk);
      }

      expect(state.totalChunks).toBe(4);
      expect(state.generatedText).toBe("Hello world!");
      expect(state.finishReason).toBe("stop");

      // 最后一帧的 usage 是最终值
      expect(state.lastValidUsage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 3,
        total_tokens: 13,
      });

      const result = extractUsageFromStream(state, 15, "gpt-4o");
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(3);
      expect(result.totalTokens).toBe(13);
      expect(result.trustUpstream).toBe(true);
      expect(result.fallback).toBe(false);
    });

    it("中间 chunk 有 usage 但 finish_reason 非空才覆盖最终值", () => {
      const state = createStreamState();

      // 中间帧有 usage 但最后帧才是 finish_reason="stop"
      const chunks: StreamChunk[] = [
        {
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { content: "abc" }, finish_reason: null }],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        },
        {
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { content: "def" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        },
      ];

      for (const chunk of chunks) {
        updateStreamState(state, chunk);
      }

      // 最后一帧 finish_reason 非空 → usage 被覆盖为最终值
      expect(state.lastValidUsage?.completion_tokens).toBe(2);
      expect(state.finishReason).toBe("stop");
    });

    it("只收到空 chunk → state 保持初始状态", () => {
      const state = createStreamState();
      updateStreamState(state, { choices: [{ delta: {} }] });

      expect(state.totalChunks).toBe(1);
      expect(state.generatedText).toBe("");
      expect(state.lastValidUsage).toBeNull();
    });
  });

  // ============================================================
  // Case 6: input token 估算 → 使用 tiktoken 在请求前估算
  // ============================================================
  describe("Case 6: Input token 估算 → 使用 tiktoken", () => {
    it("estimateInputTokens 对简单消息返回合理的 token 数", () => {
      const tokens = estimateInputTokens("gpt-4o", [
        { role: "user", content: "Hello" },
      ]);

      // 1 条消息，含 "Hello"（1 token）+ "user"（1 token）+ overhead（3+3）
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(20); // 不应超过 20
    });

    it("estimateInputTokens 对多条消息返回递增结果", () => {
      const singleToken = estimateInputTokens("gpt-4o", [
        { role: "user", content: "Hi" },
      ]);

      const multiTokens = estimateInputTokens("gpt-4o", [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is AI?" },
      ]);

      // 多条消息的 token 数应大于单条
      expect(multiTokens).toBeGreaterThan(singleToken);
    });

    it("estimateInputTokens 对空消息数组返回 3（仅 priming overhead）", () => {
      const tokens = estimateInputTokens("gpt-4o", []);
      // 仅 priming overhead (~3 tokens)
      expect(tokens).toBe(3);
    });

    it("countOutputTokens 返回正整数", () => {
      const tokens = countOutputTokens("gpt-4o", "Hello world, this is a test.");
      expect(tokens).toBeGreaterThan(0);
      expect(Number.isInteger(tokens)).toBe(true);
    });

    it("countOutputTokens 空字符串返回 0", () => {
      expect(countOutputTokens("gpt-4o", "")).toBe(0);
    });

    it("countOutputTokens 对较长文本返回更多 token", () => {
      const shortCount = countOutputTokens("gpt-4o", "Hi");
      const longCount = countOutputTokens("gpt-4o", "This is a much longer piece of text with many more words to count.");
      expect(longCount).toBeGreaterThan(shortCount);
    });

    it("不支持的模型 fallback 到 cl100k_base（不抛异常）", () => {
      // deepseek 模型不在 js-tiktoken 内置列表中
      const encoding = getModelEncoding("deepseek-chat");
      expect(encoding).toBe("cl100k_base");

      // 即使模型未知，也能正常计数
      const tokens = countOutputTokens("unknown-xyz-model", "Hello world");
      expect(tokens).toBeGreaterThan(0);
      expect(Number.isInteger(tokens)).toBe(true);
    });
  });
});

// ============================================================
// Case 7: 补全倍率 → 输出 token 价格 = 输入价 × output_multiplier
// ============================================================
describe("Token 计费 — 补全倍率", () => {
  it("output_multiplier 2.0 → 输出价 = 输入价 × 2", () => {
    const inputPrice = 0.03; // 0.03 元/1K tokens
    const multiplier = 2.0;
    const outputPrice = calculateOutputPrice(inputPrice, multiplier);

    expect(outputPrice).toBe(0.06);
  });

  it("output_multiplier 1.0 → 输出价 = 输入价", () => {
    const outputPrice = calculateOutputPrice(0.05, 1.0);
    expect(outputPrice).toBe(0.05);
  });

  it("output_multiplier 1.5 → 精度 4 位小数", () => {
    // 0.01 × 1.5 = 0.015
    const outputPrice = calculateOutputPrice(0.01, 1.5);
    expect(outputPrice).toBe(0.015);
  });

  it("精度 4 位小数 — round4", () => {
    // 0.12345 → 四舍五入到 4 位 → 0.1235
    expect(round4(0.12345)).toBe(0.1235);
    expect(round4(0.12344)).toBe(0.1234);
    expect(round4(0.00005)).toBe(0.0001); // 上舍
    expect(round4(0.00004)).toBe(0);      // 下舍
  });

  it("calculateTotalCost 使用补全倍率", () => {
    const inputTokens = 1000;
    const outputTokens = 500;
    const inputPrice = 0.03; // 元/1K
    const outputMultiplier = 2.0;
    const outputPrice = calculateOutputPrice(inputPrice, outputMultiplier);

    // input: 1000/1000 * 0.03 = 0.03
    // output: 500/1000 * 0.06 = 0.03
    // total = 0.06
    const cost = calculateTotalCost(inputTokens, outputTokens, inputPrice, outputPrice);
    expect(cost).toBe(0.06);
  });

  it("calculateTotalCost 精度 4 位", () => {
    // 测试小数值精度
    // 1 token input @ 0.0001 + 1 token output @ 0.0001 = 0.0000002 → round4 → 0
    const cost = calculateTotalCost(1, 1, 0.0001, 0.0001);
    expect(cost).toBe(0);
  });

  it("负输入价格应抛错", () => {
    expect(() => calculateOutputPrice(-0.01, 1.0)).toThrow("输入价格不能为负数");
  });

  it("负倍率应抛错", () => {
    expect(() => calculateOutputPrice(0.03, -1.0)).toThrow("输出倍率不能为负数");
  });

  it("output_multiplier 3.5 → 输出价 = 输入价 × 3.5（模拟 GPT-4 高倍率场景）", () => {
    const inputPrice = 0.03;
    const multiplier = 3.5;
    const outputPrice = calculateOutputPrice(inputPrice, multiplier);
    expect(outputPrice).toBe(0.105);
  });
});

// ============================================================
// 集成场景测试：流式 chunks 完整模拟
// ============================================================
describe("Token 计费 — 集成场景", () => {
  it("完整流式流程：多 chunk → updateStreamState → extractUsageFromStream", () => {
    const state = createStreamState();

    const chunks: StreamChunk[] = [
      {
        id: "chatcmpl-integration-1",
        object: "chat.completion.chunk",
        created: 1234567890,
        model: "gpt-4o",
        choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
      },
      {
        id: "chatcmpl-integration-1",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { content: "The answer is 42." }, finish_reason: null }],
      },
      {
        id: "chatcmpl-integration-1",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 25, completion_tokens: 7, total_tokens: 32 },
      },
    ];

    for (const chunk of chunks) {
      updateStreamState(state, chunk);
    }

    // 验证状态
    expect(state.totalChunks).toBe(3);
    expect(state.generatedText).toBe("The answer is 42.");
    expect(state.finishReason).toBe("stop");
    expect(state.lastValidUsage).toEqual({
      prompt_tokens: 25,
      completion_tokens: 7,
      total_tokens: 32,
    });

    // 正常结束 → 完全采信上游
    const result = extractUsageFromStream(state, 30, "gpt-4o");
    expect(result.inputTokens).toBe(25);
    expect(result.outputTokens).toBe(7);
    expect(result.totalTokens).toBe(32);
    expect(result.trustUpstream).toBe(true);
    expect(result.fallback).toBe(false);
  });

  it("中断流式流程：2 chunks → 断开，有 generatedText 但无 usage", () => {
    const state = createStreamState();
    state.abnormalEnd = true;

    updateStreamState(state, {
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: { content: "Partial" }, finish_reason: null }],
    });
    updateStreamState(state, {
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: { content: " response" }, finish_reason: null }],
    });

    expect(state.generatedText).toBe("Partial response");
    expect(state.lastValidUsage).toBeNull();

    const estimatedInput = estimateInputTokens("gpt-4o", [
      { role: "user", content: "Tell me a story" },
    ]);

    const result = extractUsageFromStream(state, estimatedInput, "gpt-4o");
    expect(result.trustUpstream).toBe(false);
    expect(result.fallback).toBe(true);
    expect(result.inputTokens).toBe(estimatedInput);
    expect(result.outputTokens).toBeGreaterThan(0);
    expect(result.totalTokens).toBe(result.inputTokens + result.outputTokens);
  });
});
