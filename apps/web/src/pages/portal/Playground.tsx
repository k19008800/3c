import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import HelpModal from "../../components/HelpModal";
import api from "../../services/api";

// ── Types ──
interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CodeSample {
  lang: string;
  icon: string;
  generate: (messages: Message[], model: string) => string;
}

// ── Models ──
const MODELS = [
  "deepseek-v4",
  "deepseek-v4-flash",
  "glm-5.2-pro",
  "qwen3.5-397b",
  "kimi-k2.5",
  "gpt-5.4",
  "gpt-5.4-mini",
];

const CODE_SAMPLES: CodeSample[] = [
  {
    lang: "curl",
    icon: "📋",
    generate: (msgs, model) => {
      const json = JSON.stringify({
        model,
        messages: msgs.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
      }, null, 2);
      return `curl https://api.3cloud.ai/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $API_KEY" \\
  -d '${json}'`;
    },
  },
  {
    lang: "python",
    icon: "🐍",
    generate: (msgs, model) => {
      const msgLines = msgs.filter((m) => m.role !== "system").map(
        (m) => `        {"role": "${m.role}", "content": """${m.content}"""}`
      );
      return `import requests

response = requests.post(
    "https://api.3cloud.ai/v1/chat/completions",
    headers={
        "Authorization": "Bearer YOUR_API_KEY",
        "Content-Type": "application/json"
    },
    json={
        "model": "${model}",
        "messages": [
${msgLines.join(",\n")}
        ]
    }
)

print(response.json())`;
    },
  },
  {
    lang: "nodejs",
    icon: "🟢",
    generate: (msgs, model) => {
      const msgLines = msgs.filter((m) => m.role !== "system").map(
        (m) => `    { role: "${m.role}", content: \`${m.content}\` }`
      );
      return `const response = await fetch("https://api.3cloud.ai/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "${model}",
    messages: [
${msgLines.join(",\n")}
    ]
  })
});

const data = await response.json();
console.log(data);`;
    },
  },
];

// ── Component ──
export default function Playground() {
  const [model, setModel] = useState(MODELS[0]!);
  const [systemPrompt, setSystemPrompt] = useState("你是一个有用的 AI 助手。");
  const [userMessage, setUserMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResponse, setShowResponse] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [apiError, setApiError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("response"); // "response" | "code"
  const [codeLang, setCodeLang] = useState("curl");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = userMessage.trim();
    if (!trimmed) return;

    const allMessages: Message[] = [];
    if (systemPrompt.trim()) {
      allMessages.push({ role: "system", content: systemPrompt });
    }
    allMessages.push({ role: "user", content: trimmed });

    setMessages(allMessages);
    setLoading(true);
    setShowResponse(false);
    setResponseText("");
    setApiError(null);

    try {
      const { data, error } = await api.post<{ content?: string; message?: string }>(
        "/me/playground/chat",
        {
          model,
          messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
        }
      );
      if (error) throw new Error(error);

      const reply = data?.content || data?.message || "(无响应内容)";
      setResponseText(reply);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      setShowResponse(true);
    } catch (e: any) {
      const errMsg = e.message || "请求失败";
      setApiError(errMsg);
      setMessages((prev) => [...prev, { role: "assistant", content: `❌ 错误: ${errMsg}` }]);
      setShowResponse(true);
    } finally {
      setLoading(false);
    }
  };

  const currentMessages: Message[] = [
    ...(systemPrompt.trim() ? [{ role: "system" as const, content: systemPrompt }] : []),
    ...(userMessage.trim() ? [{ role: "user" as const, content: userMessage }] : []),
  ];

  const codeSample = CODE_SAMPLES.find((s) => s.lang === codeLang)?.generate(currentMessages, model) ?? "";

  return (
    <div className="portal-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">3Cloud</div>
        <nav className="sidebar-nav">
          <Link to="/dashboard" className="nav-item">📊 概览</Link>
          <Link to="/billing" className="nav-item">💰 消费明细</Link>
          <Link to="/api-keys" className="nav-item">🔑 API Key</Link>
          <Link to="/playground" className="nav-item active">🧪 Playground</Link>
          <Link to="/consumption" className="nav-item">📈 消费统计</Link>
        </nav>
      </aside>

      {/* Main */}
      <main className="portal-main">
        <h1 className="page-title">
          API Playground
          <HelpModal title="API Playground">
            <p>在线调试 3Cloud API。选择模型、输入消息并查看响应。</p>
            <p style={{ marginTop: 8 }}>支持三种语言代码示例：curl / Python / Node.js。</p>
            <p style={{ marginTop: 8 }}>后端已接入真实 Chat API 端点。</p>
          </HelpModal>
        </h1>
        <p className="page-subtitle">在线调试 API 接口，快速测试模型效果</p>

        {apiError && (
          <div style={{ padding: "8px 12px", marginBottom: 8, background: "var(--color-warning-bg)", borderRadius: 6, fontSize: 13, color: "var(--color-warning-text)" }}>
            ⚠️ {apiError}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, height: "calc(100% - 80px)", minHeight: 500 }}>
          {/* Left: Input */}
          <div className="panel" style={{ display: "flex", flexDirection: "column", marginBottom: 0 }}>
            <div className="panel-header">
              <span>📝 请求</span>
              <select
                className="form-select"
                style={{ width: 200 }}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                data-hint="选择模型"
              >
                {MODELS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="panel-body" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div className="form-group">
                <label className="form-label">
                  System Prompt
                </label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  placeholder="设置 system prompt..."
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  data-hint="系统提示词"
                />
              </div>
              <div className="form-group" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <label className="form-label">
                  User Message
                </label>
                <textarea
                  className="form-textarea"
                  rows={6}
                  style={{ flex: 1 }}
                  placeholder="输入您的消息…"
                  value={userMessage}
                  onChange={(e) => setUserMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.ctrlKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  data-hint="用户消息"
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={handleSend}
                disabled={!userMessage.trim() || loading}
                data-hint="发送请求"
                style={{ alignSelf: "flex-start" }}
              >
                {loading ? "⏳ 请求中..." : "🚀 发送"}
              </button>
              <span className="text-sm text-muted" style={{ marginTop: 8 }}>
                提示：按 Ctrl+Enter 快速发送
              </span>
            </div>
          </div>

          {/* Right: Response / Code */}
          <div className="panel" style={{ display: "flex", flexDirection: "column", marginBottom: 0 }}>
            <div className="panel-header">
              <div className="filter-tabs">
                <button
                  className={`filter-tab ${activeTab === "response" ? "active" : ""}`}
                  onClick={() => setActiveTab("response")}
                >
                  💬 响应
                </button>
                <button
                  className={`filter-tab ${activeTab === "code" ? "active" : ""}`}
                  onClick={() => setActiveTab("code")}
                >
                  📋 代码示例
                </button>
              </div>
              {activeTab === "code" && (
                <div className="filter-tabs" style={{ marginLeft: 8 }}>
                  {CODE_SAMPLES.map((s) => (
                    <button
                      key={s.lang}
                      className={`filter-tab ${codeLang === s.lang ? "active" : ""}`}
                      onClick={() => setCodeLang(s.lang)}
                    >
                      {s.icon} {s.lang}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="panel-body" style={{ flex: 1, overflow: "auto" }}>
              {activeTab === "response" ? (
                showResponse ? (
                  <div>
                    {messages.filter((m) => m.role !== "system").map((m, i) => (
                      <div
                        key={i}
                        style={{
                          marginBottom: 16,
                          padding: 12,
                          borderRadius: "var(--radius-lg)",
                          background: m.role === "user" ? "var(--color-primary-light)" : "var(--color-success-bg)",
                        }}
                      >
                        <div className="text-sm text-muted" style={{ marginBottom: 4 }}>
                          {m.role === "user" ? "🧑 你" : "🤖 助手"}
                        </div>
                        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{m.content}</div>
                      </div>
                    ))}
                    {loading && (
                      <div style={{ padding: 12, color: "var(--color-text-secondary)" }}>
                        ⏳ 正在请求...
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                ) : (
                  <div className="text-center" style={{ padding: 60, color: "var(--color-text-secondary)" }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
                    <div>在左侧输入消息并点击发送</div>
                    <div className="text-sm" style={{ marginTop: 8 }}>也可以查看代码示例标签</div>
                  </div>
                )
              ) : (
                <div>
                  {currentMessages.length === 0 ? (
                    <div className="text-center" style={{ padding: 60, color: "var(--color-text-secondary)" }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
                      <div>在左侧输入消息后，这里将生成对应的代码示例</div>
                    </div>
                  ) : (
                    <>
                      <div className="code-block">{codeSample}</div>
                      <div className="mt-16">
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => {
                            navigator.clipboard.writeText(codeSample).catch(() => {});
                          }}
                          data-hint="复制代码"
                        >
                          📋 复制代码
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
