/**
 * Playground — Chat 调试 Tab（POST /v1/chat/completions）
 *
 * 模型编码化改造：模型编码由 PlaygroundPage 统一选择（props.model = model_code），
 * 本 Tab 不再维护模型选择；请求体 model 直接透传所选编码，不做名称→编码映射。
 *
 * 行为：
 * - 多消息编辑器（system/user/assistant，可增删）
 * - 非流式请求（stream:false），展示 choices[0].message.content + usage
 *
 * @module components/playground
 */

import { useState } from "react";
import { HelpIcon, useToast } from "@3cloud/shared-ui";
import { sendDebugRequest } from "./request";
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

export function ChatTab(props: PlaygroundTabProps) {
  const { keys, selectedKeyId, fullKey, model } = props;
  const { toast } = useToast();

  const [messages, setMessages] = useState<MessageItem[]>([
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "请用一句话介绍什么是 AI" },
  ]);
  const [result, setResult] = useState<ProxyResult | null>(null);
  const [sending, setSending] = useState(false);

  const activeKey = keys?.find((k) => k.id === selectedKeyId) ?? keys?.[0];

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
      toast.error("请先粘贴完整 API Key——列表只展示前缀，需在「API Key 管理」创建时复制完整 Key（已自动预填最近创建的一条）。");
      return;
    }
    const modelCode = model.trim();
    if (!modelCode) {
      toast.error("请先在上方选择模型编码。");
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await sendDebugRequest({
        path: "/api/v1/v1/chat/completions",
        apiKey: fullKey,
        body: {
          model: modelCode,
          messages: messages.filter((m) => m.content.trim()),
          stream: false,
        },
      });
      setResult(res);
      if (res.ok) toast.success("请求完成");
      else toast.error("请求失败：" + (res.error ?? `HTTP ${res.status}`));
    } finally {
      setSending(false);
    }
  };

  const chatTextExtractor = (json: unknown): string | null => {
    if (!json || typeof json !== "object") return null;
    const j = json as Record<string, unknown>;
    const choice = Array.isArray(j.choices) ? (j.choices[0] as Record<string, unknown> | undefined) : undefined;
    const msg = choice?.message as Record<string, unknown> | undefined;
    return typeof msg?.content === "string" ? msg.content : null;
  };

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {/* 左侧：消息编辑 */}
      <div style={{ flex: 1, minWidth: 320 }}>
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>消息</h3>
            <HelpIcon text="编辑对话消息序列，点击「发送请求」调用 /v1/chat/completions（非流式）。请求体 model 为上方所选模型编码。" level="button" />
          </div>
          {messages.map((msg, i) => (
            <div key={i} style={{ marginBottom: 12, padding: 12, background: "var(--color-bg)", borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <select
                  value={msg.role}
                  onChange={(e) => {
                    setMessages((prev) =>
                      prev.map((m, idx) => (idx === i ? { ...m, role: e.target.value as MessageItem["role"] } : m)),
                    );
                  }}
                  style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid var(--color-border)", fontSize: 12 }}
                >
                  <option value="system">system</option>
                  <option value="user">user</option>
                  <option value="assistant">assistant</option>
                </select>
                <button
                  onClick={() => removeMessage(i)}
                  style={{ background: "none", border: "none", color: "var(--color-danger-text)", cursor: "pointer", fontSize: 13 }}
                >
                  删除
                </button>
              </div>
              <textarea
                value={msg.content}
                onChange={(e) => updateMessage(i, e.target.value)}
                style={{ ...controlStyle, minHeight: 60, fontFamily: "monospace", resize: "vertical" }}
              />
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => addMessage("user")} style={{ padding: "6px 14px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
              + 添加用户消息
            </button>
            <button
              onClick={() => addMessage("system")}
              style={{ padding: "6px 14px", background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
            >
              + System
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            onClick={handleSend}
            disabled={sending || !activeKey}
            style={{ ...primaryBtnStyle, flex: 1, opacity: sending || !activeKey ? 0.6 : 1 }}
          >
            {sending ? "发送中..." : "🚀 发送请求"}
          </button>
          <HelpIcon text="发送 chat/completions 非流式请求：鉴权 → 余额预检 → 按模型编码精确路由到供应商 → 转发 → 计费。" level="button" />
        </div>
      </div>

      {/* 右侧：响应 */}
      <div style={{ flex: 1, minWidth: 320 }}>
        <ResponseViewer
          result={result}
          loading={sending}
          textExtractor={chatTextExtractor}
        />
      </div>
    </div>
  );
}
