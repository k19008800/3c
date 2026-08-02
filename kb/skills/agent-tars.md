# Agent TARS (字节跳动 UI-TARS Desktop) 接入记录

## 概述
字节跳动开源的多模态 GUI Agent 套件（Apache-2.0），GitHub ⭐38k+。
核心能力：让 AI 像真人一样看屏幕、点按钮、填表单、控制桌面 GUI 应用。

## 接入方式：CLI 子进程调用（已验证 ✅）

```bash
# 全局安装（可选）
npm install @agent-tars/cli@latest -g

# 或直接用 npx
npx @agent-tars/cli@latest run --headless --input "<任务描述>" --format json \
  --model.provider openai \
  --model.id deepseek-v4-flash-1.00 \
  --model.apiKey "sk-xxx" \
  --model.baseURL "https://open.ospreyai.cn/v1"
```

## 已验证功能
| 功能 | 状态 |
|------|------|
| 文本对话 | ✅ |
| 桌面截图 + 识别 | ✅ 能准确识别桌面图标、运行窗口 |
| 桌面操作（打开计算器/计算等）| ✅ |
| MCP Server 方式暴露工具 | ❌ Agent TARS 是 MCP 消费者，不暴露为 MCP Server |

## 配置说明
- **推荐 Provider**：OspreyAI (open.ospreyai.cn) — 直连，不需要代理
- **推荐 Model**：`deepseek-v4-flash-1.00`（多模态 VLM 支持）
- **关键参数**：`--headless` + `--input "<任务>"` + `--format json`
- **输出格式**：JSON，`result.content` 包含最终回答
- **端口冲突**：默认 8899，用 `--port` 指定不同端口

## 适用场景
1. **操作原生桌面应用**（计算器、Office 等）
2. **远程机器控制**（VNC/RDP）
3. **浏览器操作**（DOM 复杂页面的视觉理解）
4. **UI 自动化测试**（截图对比、流程操作）

## 局限性
- Agent TARS 是 MCP **消费者**（吃外部 MCP Server），不是 **生产者**（自己做 MCP Server）
- 不能作为 MCP Tool 直接注册到 OpenClaw
- headless server 模式下没有公开 REST API（仅 WebSocket 供 Web UI 使用）
- 每次调用需要 spawn 子进程，有一定的启动开销
