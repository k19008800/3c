import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { HelpIcon, SkeletonGroup, EmptyState, useToast } from "@3cloud/shared-ui";

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
  const { toast } = useToast();

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
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, content } : m)));
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
      const proxyUrl = "/api/v1/v1/chat/completions";
      const model = customModel || selectedModel;

      const res = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeKey.keyPrefix}`,
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
          cost: 0,
        });
      }
      toast.success("请求完成");
    } catch (err: any) {
      setError(err.message ?? "请求失败");
      toast.error("请求失败：" + (err.message ?? "未知错误"));
    } finally {
      setIsSending(false);
      setIsStreaming(false);
    }
  };

  const card = {
    background: "#fff",
    borderRadius: 10,
    padding: 20,
    boxShadow: "0 1px 4px rgba(0,0,0,.06)",
    marginBottom: 16,
  };

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>
        🧪 API Playground
        <HelpIcon text="在线调试 API，无需编写代码即可测试模型调用。选择 API Key 和模型，编辑消息后发送请求查看响应。" level="page" />
      </h2>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: 20, fontSize: 14 }}>
        在线调试 API，零代码测试模型调用
      </p>

      {/* 配置区域 */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--color-text)",
              display: "block",
              marginBottom: 4,
            }}
          >
            API Key
          </label>
          <select
            value={selectedKeyId ?? ""}
            onChange={(e) =>
              setSelectedKeyId(e.target.value ? parseInt(e.target.value) : null)
            }
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid var(--color-border)",
              fontSize: 13,
            }}
          >
            {keys?.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name} ({k.keyPrefix}...)
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--color-text)",
              display: "block",
              marginBottom: 4,
            }}
          >
            模型
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={customModel ? "__custom__" : selectedModel}
              onChange={(e) => {
                if (e.target.value === "__custom__") return;
                setSelectedModel(e.target.value);
                setCustomModel("");
              }}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                fontSize: 13,
              }}
            >
              <optgroup label="常用模型">
                <option value="deepseek-chat">DeepSeek Chat</option>
                <option value="qwen-plus">Qwen Plus</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                {models?.slice(0, 20).map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
              <option value="__custom__">自定义模型名...</option>
            </select>
            {customModel !== null && (
              <input
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="输入模型名"
                style={{
                  width: 150,
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--color-border)",
                  fontSize: 13,
                }}
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
              <div
                key={i}
                style={{ marginBottom: 12, padding: 12, background: "var(--color-bg)", borderRadius: 8 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <select
                    value={msg.role}
                    onChange={(e) => {
                      setMessages((prev) =>
                        prev.map((m, idx) =>
                          idx === i ? { ...m, role: e.target.value as Message["role"] } : m,
                        ),
                      );
                    }}
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      border: "1px solid var(--color-border)",
                      fontSize: 12,
                    }}
                  >
                    <option value="system">system</option>
                    <option value="user">user</option>
                    <option value="assistant">assistant</option>
                  </select>
                  <button
                    onClick={() => removeMessage(i)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--color-danger-text)",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
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
                    border: "1px solid var(--color-border)",
                    fontSize: 13,
                    fontFamily: "monospace",
                    resize: "vertical",
                  }}
                />
              </div>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => addMessage("user")} style={btnStyle}>
                + 添加用户消息
              </button>
              <button
                onClick={() => addMessage("system")}
                style={{ ...btnStyle, background: "var(--color-bg)", color: "var(--color-text)" }}
              >
                + System
              </button>
            </div>
          </div>

          <button
            onClick={handleSend}
            disabled={isSending || !activeKey}
            style={{
              width: "100%",
              padding: "12px",
              background: isSending ? "var(--color-border)" : "var(--color-primary)",
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
              <div
                style={{
                  background: "var(--color-danger-bg)",
                  color: "var(--color-danger-text)",
                  padding: 12,
                  borderRadius: 8,
                  marginBottom: 12,
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}
            {isStreaming && !response && (
              <SkeletonGroup lines={3} />
            )}
            {response && (
              <div
                style={{
                  background: "#0f172a",
                  color: "var(--color-border)",
                  padding: 16,
                  borderRadius: 8,
                  fontSize: 13,
                  whiteSpace: "pre-wrap",
                  fontFamily: "monospace",
                  maxHeight: 400,
                  overflow: "auto",
                }}
              >
                {response}
              </div>
            )}
            {tokens && (
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  gap: 16,
                  fontSize: 13,
                  color: "var(--color-text-secondary)",
                }}
              >
                <span>输入: {tokens.input} tokens</span>
                <span>输出: {tokens.output} tokens</span>
              </div>
            )}
            {!response && !error && !isStreaming && (
              <EmptyState icon="📨" title="等待请求" description='编辑左侧消息后点击「发送请求」' />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "6px 14px",
  background: "var(--color-primary)",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
};
