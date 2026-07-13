/**
 * 3cloud — Mock Upstream Server
 * 模拟 AI 上游厂商 API，提供 OpenAI 兼容格式响应
 * 让 proxy 路由→转发→计费链路通过真实 HTTP 走通
 *
 * 用法: node mock-upstream.mjs
 * 监听: 0.0.0.0:19999
 */
import http from "node:http";
import crypto from "node:crypto";

// 模拟不同模型返回的 token 数量（让计费引擎产生有意义的数据）
const MODEL_TOKEN_MAP = {
  "gpt-4o":              { input: 150, output: 320 },
  "gpt-4o-mini":         { input: 180, output: 400 },
  "claude-3.5-sonnet":   { input: 200, output: 350 },
  "deepseek-chat":       { input: 250, output: 500 },
  "DeepSeek-V4-Flash（天翼）": { input: 300, output: 600 },
};

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function simulateTokens(model, messages) {
  if (MODEL_TOKEN_MAP[model]) return { ...MODEL_TOKEN_MAP[model] };

  // fallback: 根据消息长度估算
  const textLen = JSON.stringify(messages).length;
  const input = Math.max(50, Math.round(textLen / 4));
  const output = Math.max(50, Math.round(input * 1.8));
  return { input, output };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method.toUpperCase();

  if (method === "POST" && path === "/v1/chat/completions") {
    const body = await parseBody(req);
    const model = body.model || "gpt-4o";
    const messages = body.messages || [];
    const stream = body.stream === true;
    const tokens = simulateTokens(model, messages);
    const id = `chatcmpl-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

    if (stream) {
      // 流式响应 (SSE)
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      // 模拟逐块输出
      const content = "这是一个模拟的流式响应内容。";
      const words = [...content];
      for (let i = 0; i < words.length; i++) {
        const chunk = {
          id,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              delta: { content: words[i] },
              finish_reason: i === words.length - 1 ? "stop" : null,
            },
          ],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        if (i < words.length - 1) {
          await new Promise((r) => setTimeout(r, 20));
        }
      }
      res.write(`data: [DONE]\n\n`);
      res.end();

      // 流式结束后模拟系统处理（延迟一小段时间让系统处理）
      return;
    }

    // 非流式响应
    const usage = {
      prompt_tokens: tokens.input,
      completion_tokens: tokens.output,
      total_tokens: tokens.input + tokens.output,
    };

    const response = {
      id,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: `这是来自 ${model} 的模拟回复。本次请求输入 ${tokens.input} tokens，输出 ${tokens.output} tokens。`,
          },
          finish_reason: "stop",
        },
      ],
      usage,
    };

    // 模拟网络延迟 200-800ms
    const delay = 200 + Math.random() * 600;
    await new Promise((r) => setTimeout(r, delay));

    sendJson(res, 200, response);
    return;
  }

  if (method === "POST" && path === "/v1/embeddings") {
    const body = await parseBody(req);
    const input = Array.isArray(body.input) ? body.input : [body.input || ""];
    const tokens = input.reduce((sum, t) => sum + Math.ceil((t?.length || 0) / 2), 0);

    const response = {
      object: "list",
      data: input.map((_, i) => ({
        object: "embedding",
        index: i,
        embedding: new Array(1536).fill(0).map(() => (Math.random() - 0.5) * 0.01),
      })),
      model: body.model || "text-embedding-ada-002",
      usage: { prompt_tokens: tokens, total_tokens: tokens },
    };

    await new Promise((r) => setTimeout(r, 100));
    sendJson(res, 200, response);
    return;
  }

  // 健康检查 / 未知路径
  sendJson(res, 200, { status: "ok", server: "3cloud-mock-upstream" });
});

server.listen(19999, "0.0.0.0", () => {
  console.log(`✅ Mock upstream server running on http://0.0.0.0:19999`);
  console.log(`   POST /v1/chat/completions  — 非流式 + 流式`);
  console.log(`   POST /v1/embeddings        — 非流式`);
  console.log(`   GET  /                     — 健康检查`);
});
