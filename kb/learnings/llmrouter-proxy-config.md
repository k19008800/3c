# LLMRouter 代理配置

> 踩坑日期：2026-07-02

## 问题

OpenClaw 接入 LLMRouter (llmrouter.top) 后，Claude Opus 4.8 / Sonnet / Haiku 等模型无法响应，请求超时。

## 原因

Claude 系列模型需要通过海外代理访问。国内网络环境无法直连。

## 解决方案

在 OpenClaw 的 `openclaw.json` models.providers 配置中，为 LLMRouter provider 添加 `request.proxy` 配置：

```json5
{
  "models": {
    "providers": {
      "llmrouter": {
        "baseUrl": "https://llmrouter.top/v1",
        "apiKey": "sk-***",
        "api": "openai-completions",
        "request": {
          "proxy": "http://127.0.0.1:7897"
        },
        "models": [
          // 29 个模型定义
        ]
      }
    }
  }
}
```

## 代理规则

- **走代理**：Claude 系列（Claude Opus 4.8, Claude Sonnet 4.7, Claude GPT, Claude Haiku 4.7 等）
- **直连**：Llama 系列、Doubao Seedance 系列、DeepSeek 系列等国内可达模型

## 注意

- 确保本地 Clash (或其他代理) 服务在 `127.0.0.1:7897` 运行
- 如果代理停掉，Claude 系列模型请求会全部失败
- PCI/GLM/MiniMax/Kimi/Qwen 等国内友好模型不需要代理
