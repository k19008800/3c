/**
 * Playground — Messages 调试 Tab（POST /v1/messages，Anthropic Messages API 兼容）
 *
 * Anthropic 格式兼容端点：{ model, messages, system?, max_tokens?, temperature? }。
 * 网关在入口做 Claude → OpenAI 转换，出口把 chat 响应映射回 Claude 格式。
 * 鉴权走 API Key（Bearer 或 x-api-key 均可）。
 *
 * @see api/src/routes/messages.ts + services/upstream/claude-adapter.ts（后端契约）
 * @see newapi-gap-analysis.md Batch 3 任务 3.1
 * @module components/playground
 */

import { useState } from "react";
import { HelpIcon, useToast } from "@3cloud/shared-ui";
import { sendDebugRequest } from "./request";
import { ModelInput } from "./ModelInput";
import { ResponseViewer, controlStyle, primaryBtnStyle } from "./ResponseViewer";
import type { PlaygroundTabProps, ProxyResult } from "./types";
import type { MessageItem } from "./tabTypes";

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 10,
  padding: 20,
  boxShadow: "0 1px 4px rgba(0,0,0,.06)",
  marginBottom: 16,
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "var(--color-text)",
  display: "block",
  marginBottom: 4,
};

export function MessagesTab(props: PlaygroundTabProps) {
  const { fullKey, models } = props;
  const { toast } = useToast();

  const [model, setModel] = useState("");
  const [system, setSystem] = useState("You are a helpful assistant.");
  const [messages, setMessages] = useState<MessageItem[]>([
    { role: "user", content: "请用一句话介绍什么是 3cloud" },
  ]);
  const [maxTokens, setMaxTokens] = useState(128);
  const [result, setResult] = useState<ProxyResult | null>(null);
  const [sending, setSending] = useState(false);

  const updateMessage = (index: number, content: string) => {
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, content } : m)));
  };

  const removeMessage = (index: number) => {
    if (messages.length <= 1) return;
    setMessages((prev) => prev.filter((_, i) => i !== index));
  };

  const addMessage = (role: MessageItem["role"]) => {
    setMessages((prev) => [...prev, { role, content: "" }]);
  };

  const handleSend = async () => {
    if (!fullKey.trim()) {
      toast.error("请先粘贴完整 API Key");
      return;
    }
    if (!model.trim()) {
      toast.error("请填写模型名（如 deepseek-chat / claude-sonnet-4-20250514）");
      return;
    }
    const nonEmpty = messages.filter((m) => m.content.trim());
    if (nonEmpty.length === 0) {
      toast.error("至少一条非空消息");
      return;
    }

    const body: Record<string, unknown> = {
      model: model.trim(),
      messages: nonEmpty.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens > 0 ? maxTokens : 64,
    };
    if (system.trim()) body.system = system;

    setSending(true);
    setResult(null);
    try {
      const res = await sendDebugRequest({
        path: "/api/v1/v1/messages",
        apiKey: fullKey,
        body,
      });
      setResult(res);
      if (res.ok) toast.success("请求完成");
      else toast.error("请求失败：" + (res.error ?? `HTTP ${res.status}`));
    } finally {
      setSending(false);
    }
  };

  /** Anthropic 响应文本提取：content[].text 拼接 */
  const messagesTextExtractor = (json: unknown): string | null => {
    if (!json || typeof json !== "object") return null;
    const j = json as Record<string, unknown>;
    const content = Array.isArray(j.content) ? (j.content as Array<Record<string, unknown>>) : null;
    if (!content) return null;
    const texts = content
      .map((block) => (typeof block?.text === "string" ? block.text : null))
      .filter((t): t is string => t !== null);
    return texts.length ? texts.join("\n") : null;
  };

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {/* 左侧：参数配置 */}
      <div style={{ flex: 1, minWidth: 320 }}>
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>参数</h3>
            <HelpIcon text="Anthropic Messages API 兼容端点：请求/响应为 Claude 格式，网关内部转换为 OpenAI 格式转发上游再映射回 Claude 格式。" level="button" />
          </div>

          <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
            <ModelInput
              value={model}
              onChange={setModel}
              models={models}
              help="Anthropic 格式请求的模型名，网关按名路由到可用供应商（如 deepseek-chat / claude 系列）。"
              placeholder="例如 deepseek-chat"
            />
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={fieldLabelStyle}>
                max_tokens
                <HelpIcon text="最大生成 token 数（Anthropic 必填字段）。" level="button" />
              </label>
              <input
                type="number"
                min={1}
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 0)}
                style={controlStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={fieldLabelStyle}>
              system（系统提示，可选）
              <HelpIcon text="顶层 system 字段（字符串），转换时并入 OpenAI messages 开头。" level="button" />
            </label>
            <textarea
              value={system}
              onChange={(e) => setSystem(e.target.value)}
              style={{ ...controlStyle, minHeight: 52, fontFamily: "monospace", resize: "vertical" }}
            />
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <label style={{ ...fieldLabelStyle, marginBottom: 0 }}>
                messages（消息列表）
                <HelpIcon text="Anthropic 格式消息序列（role: user / assistant）。" level="button" />
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => addMessage("user")} style={{ padding: "4px 10px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
                  + user
                </button>
                <button onClick={() => addMessage("assistant")} style={{ padding: "4px 10px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
                  + assistant
                </button>
              </div>
            </div>
            {messages.map((msg, i) => (
              <div key={i} style={{ marginBottom: 8, padding: 8, background: "var(--color-bg)", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <select
                    value={msg.role}
                    onChange={(e) => {
                      setMessages((prev) =>
                        prev.map((m, idx) => (idx === i ? { ...m, role: e.target.value as MessageItem["role"] } : m)),
                      );
                    }}
                    style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid var(--color-border)", fontSize: 12 }}
                  >
                    <option value="user">user</option>
                    <option value="assistant">assistant</option>
                  </select>
                  <button
                    onClick={() => removeMessage(i)}
                    disabled={messages.length <= 1}
                    style={{ background: "none", border: "none", color: "var(--color-danger-text)", cursor: "pointer", fontSize: 12 }}
                  >
                    删除
                  </button>
                </div>
                <textarea
                  value={msg.content}
                  onChange={(e) => updateMessage(i, e.target.value)}
                  style={{ ...controlStyle, minHeight: 56, fontFamily: "monospace", resize: "vertical" }}
                />
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            onClick={handleSend}
            disabled={sending}
            style={{ ...primaryBtnStyle, flex: 1, opacity: sending ? 0.6 : 1 }}
          >
            {sending ? "请求中..." : "🚀 发送 Messages 请求"}
          </button>
          <HelpIcon text="调用 /v1/messages（Anthropic 格式）：Claude→OpenAI 转换 → 鉴权 → 余额预检 → 渠道选择 → 上游转发 → 响应映射回 Claude 格式 → 计费。" level="button" />
        </div>
      </div>

      {/* 右侧：响应 */}
      <div style={{ flex: 1, minWidth: 320 }}>
        <ResponseViewer result={result} loading={sending} textExtractor={messagesTextExtractor} />
      </div>
    </div>
  );
}
