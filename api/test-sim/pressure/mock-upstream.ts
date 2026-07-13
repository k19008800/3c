// ============================================================
//  3cloud (3C) — Mock 上游服务器（压力测试用）
//  返回 OpenAI 兼容格式，确保代理路由完整流转
//  监听 :3099
// ============================================================

import http from "node:http";

const PORT = 3099;
const MOCK_API_KEY = "sk-mock-test-key-not-used";

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type, authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405);
    res.end(JSON.stringify({ error: "method not allowed" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const parsed = JSON.parse(body);
      const model = parsed.model || "unknown";
      const inputTokens = Math.max(10, Math.floor((parsed.messages?.[0]?.content?.length || 20) * 0.75));
      const outputTokens = Math.max(10, Math.floor(Math.random() * 150) + 50);

      const delay = Math.floor(Math.random() * 500) + 100; // 100-600ms latency

      setTimeout(() => {
        // 5% chance of 502 to test fallback
        if (Math.random() < 0.05) {
          res.writeHead(502);
          res.end(JSON.stringify({
            error: { message: "upstream temporarily unavailable", type: "server_error" },
          }));
          return;
        }

        // Normal OpenAI-compatible success response
        const response = {
          id: `chatcmpl-mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: `这是压力测试的模拟回复。模型: ${model}。当前时间: ${new Date().toISOString()}`,
            },
            finish_reason: "stop",
          }],
          usage: {
            prompt_tokens: inputTokens,
            completion_tokens: outputTokens,
            total_tokens: inputTokens + outputTokens,
          },
        };

        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(response));
      }, delay);
    } catch (err) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: { message: "invalid request body", type: "invalid_request_error" } }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ Mock upstream running on http://localhost:${PORT}`);
  console.log(`   Simulating 100-600ms latency, 5% error rate`);
});
