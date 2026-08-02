import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * §22.3 用户端 Playground - API 在线调试
 * 对应 SPEC-§22-用户端体验增强.md §22.3
 */

interface ApiKey {
  id: number;
  name: string;
  keyPrefix: string;
  status: string;
}

interface Model {
  id: number;
  name: string;
  provider: string;
  inputPrice: number;
  outputPrice: number;
}

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export default function PlaygroundPage() {
  const [selectedKeyId, setSelectedKeyId] = useState<number | null>(null);
  const [selectedModel, setSelectedModel] = useState("deepseek-chat");
  const [customModel, setCustomModel] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "请用一句话介绍什么是 AI" },
  ]);
  const [response, setResponse] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokens, setTokens] = useState<{ input: number; output: number; cost: number } | null>(null);
  const responseRef = useRef<HTMLDivElement>(null);

  const { data: keys } = useQuery<ApiKey[]>({
    queryKey: ["me-keys"],
    queryFn: async () => (await api.get<ApiKey[]>("/me/keys")).data,
  });

  const { data: models } = useQuery<Model[]>({
    queryKey: ["me-models"],
    queryFn: async () => (await api.get<Model[]>("/me/models")).data,
  });

  const activeKey = keys?.find((k) => k.id === selectedKeyId) ?? keys?.[0];

  const updateMessage = (index: number, content: string) => {
    setMessages((prev) => prev.map((m, i) => i === index ? { ...m, content } : m));
  };

  const removeMessage = (index: number) => {
    if (messages.length <= 1) return;
    setMessages((prev) => prev.filter((_, i) => i !== index));
  };

  const addMessage = (role: Message["role"]) => {
    setMessages((prev) => [...prev, { role, content: "" }]);
  };

  const handleSend = async () => {
    if (!activeKey || messages.length < 2) return;
    setError(null);
    setTokens(null);
    setResponse("");
    setIsSending(true);
    setIsStreaming(true);

    try {
      // 实际请求走代理
      const proxyUrl = "/api/v1/v1/chat/completions";
      const model = customModel || selectedModel;

      const res = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${activeKey.keyPrefix}`,
          "X-Playground": "1",
        },
        body: JSON.stringify({
          model,
          messages: messages.filter((m) => m.content.trim()),
          stream: false,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? JSON.stringify(data);
      setResponse(content);

      if (data.usage) {
        setTokens({
          input: data.usage.prompt_tokens ?? 0,
          output: data.usage.completion_tokens ?? 0,
          cost: 0, // 费用从 billing 获取
        });
      }
    } catch (err: any) {
      setError(err.message ?? "请求失败");
    } finally {
      setIsSending(false);
      setIsStreaming(false);
    }
  };

  const card = { background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 16 };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>🧪 API Playground</h2>
      <p style={{ color: "#64748b", marginBottom: 20, fontSize: 14 }}>在线调试 API，零代码测试模型调用</p>

      {/* 配置区域 */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: "#475569", display: "block", marginBottom: 4 }}>API Key</label>
          <select
            value={selectedKeyId ?? ""}
            onChange={(e) => setSelectedKeyId(e.target.value ? parseInt(e.target.value) : null)}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13 }}
          >
            {keys?.map((k) => (
              <option key={k.id} value={k.id}>{k.name} ({k.keyPrefix}...)</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: "#475569", display: "block", marginBottom: 4 }}>模型</label>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={customModel ? "__custom__" : selectedModel}
              onChange={(e) => {
                if (e.target.value === "__custom__") return;
                setSelectedModel(e.target.value);
                setCustomModel("");
              }}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13 }}
            >
              <optgroup label="常用模型">
                <option value="deepseek-chat">DeepSeek Chat</option>
                <option value="qwen-plus">Qwen Plus</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                {models?.slice(0, 20).map((m) => (
                  <option key={m.id} value={m.name}>{m.name}</option>
                ))}
              </optgroup>
              <option value="__custom__">自定义模型名...</option>
            </select>
            {customModel !== null && (
              <input
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="输入模型名"
                style={{ width: 150, padding: "8px 12px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13 }}
              />
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {/* 左侧：消息编辑 */}
        <div style={{ flex: 1, minWidth: 320 }}>
          <div style={card}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>消息</h3>
            {messages.map((msg, i) => (
              <div key={i} style={{ marginBottom: 12, padding: 12, background: "#f8fafc", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <select
                    value={msg.role}
                    onChange={(e) => {
                      setMessages((prev) => prev.map((m, idx) => idx === i ? { ...m, role: e.target.value as Message["role"] } : m));
                    }}
                    style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid #e2e8f0", fontSize: 12 }}
                  >
                    <option value="system">system</option>
                    <option value="user">user</option>
                    <option value="assistant">assistant</option>
                  </select>
                  <button
                    onClick={() => removeMessage(i)}
                    style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 13 }}
                  >
                    删除
                  </button>
                </div>
                <textarea
                  value={msg.content}
                  onChange={(e) => updateMessage(i, e.target.value)}
                  style={{
                    width: "100%",
                    minHeight: 60,
                    padding: 8,
                    borderRadius: 6,
                    border: "1px solid #e2e8f0",
                    fontSize: 13,
                    fontFamily: "monospace",
                    resize: "vertical",
                  }}
                />
              </div>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => addMessage("user")} style={btnStyle}>+ 添加用户消息</button>
              <button onClick={() => addMessage("system")} style={{ ...btnStyle, background: "#f1f5f9", color: "#475569" }}>+ System</button>
            </div>
          </div>

          <button
            onClick={handleSend}
            disabled={isSending || !activeKey}
            style={{
              width: "100%",
              padding: "12px",
              background: isSending ? "#93c5fd" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            {isSending ? "发送中..." : "🚀 发送请求"}
          </button>
        </div>

        {/* 右侧：响应 */}
        <div style={{ flex: 1, minWidth: 320 }}>
          <div style={card} ref={responseRef}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>响应</h3>
            {error && (
              <div style={{ background: "#fef2f2", color: "#dc2626", padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                {error}
              </div>
            )}
            {isStreaming && !response && (
              <div style={{ color: "#94a3b8", fontSize: 14 }}>等待响应...</div>
            )}
            {response && (
              <div style={{ background: "#0f172a", color: "#e2e8f0", padding: 16, borderRadius: 8, fontSize: 13, whiteSpace: "pre-wrap", fontFamily: "monospace", maxHeight: 400, overflow: "auto" }}>
                {response}
              </div>
            )}
            {tokens && (
              <div style={{ marginTop: 12, display: "flex", gap: 16, fontSize: 13, color: "#64748b" }}>
                <span>输入: {tokens.input} tokens</span>
                <span>输出: {tokens.output} tokens</span>
              </div>
            )}
            {!response && !error && !isStreaming && (
              <div style={{ color: "#94a3b8", fontSize: 14, padding: 20, textAlign: "center" }}>
                编辑左侧消息后点击"发送请求"
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "6px 14px",
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
};
