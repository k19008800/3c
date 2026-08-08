import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { HelpIcon, SkeletonGroup, useToast } from "@3cloud/shared-ui";

/**
 * 在线客服 对齐 SPEC-§27.1（用户端）
 */
const card: React.CSSProperties = {
  background: "#fff",
  padding: 20,
  borderRadius: 10,
  boxShadow: "0 1px 4px rgba(0,0,0,.06)",
};
const btnBase: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

interface ChatMsg {
  id: number;
  sender_type: string;
  content: string;
  created_at: string;
}
interface HistItem {
  session_id: number;
  status: string;
  created_at: string;
  msg_count: number;
}

export default function UserChatPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<string>("idle");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [queued, setQueued] = useState<{ position: number } | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const authToken = useAuthToken();
  const histQ = useQuery({
    queryKey: ["me-chat-history"],
    queryFn: async () =>
      (await api.get<{ data: { list: HistItem[] } }>("/me/chat/history")).data.data,
  });
  const sessMsgsQ = useQuery({
    queryKey: ["me-chat-msgs", historyId],
    queryFn: async () =>
      (await api.get<{ data: { messages: ChatMsg[] } }>(`/me/chat/sessions/${historyId}/messages`))
        .data.data,
    enabled: !!historyId,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(
    () => () => {
      wsRef.current?.close();
    },
    [],
  );

  const connect = () => {
    if (!authToken) {
      toast.error("请先登录");
      return;
    }
    setStatus("connecting");
    const ws = new WebSocket(
      `ws://${location.host}/api/v1/ws/chat?token=${encodeURIComponent(authToken)}`,
    );
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "start" }));
    };
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.type === "queued") {
        setStatus("queued");
        setQueued({ position: d.position });
      } else if (d.type === "connected" || d.type === "staff_connected") {
        setStatus("active");
        setMessages((m) => [
          ...m,
          {
            id: Date.now(),
            sender_type: "system",
            content: "客服已接入，请问有什么可以帮助您？",
            created_at: new Date().toISOString(),
          },
        ]);
      } else if (d.type === "staff_message") {
        setMessages((m) => [
          ...m,
          {
            id: d.message.id,
            sender_type: "staff",
            content: d.message.content,
            created_at: d.message.created_at,
          },
        ]);
      } else if (d.type === "closed" || d.type === "session_closed") {
        setStatus("closed");
        ws.close();
      } else if (d.type === "error") toast.error(d.message);
    };
    ws.onerror = () => {
      setStatus("idle");
      toast.error("连接失败");
    };
  };

  const send = () => {
    if (!input.trim() || !wsRef.current) return;
    const content = input.trim();
    wsRef.current.send(JSON.stringify({ type: "message", content }));
    setMessages((m) => [
      ...m,
      {
        id: Date.now(),
        sender_type: "user",
        content,
        created_at: new Date().toISOString(),
      },
    ]);
    setInput("");
  };

  const closeChat = () => {
    wsRef.current?.send(JSON.stringify({ type: "close" }));
    setStatus("closed");
    wsRef.current?.close();
  };

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>
        在线客服
        <HelpIcon text="与客服实时沟通，支持文本聊天。常见问题通常在 5 分钟内回复。可查看历史会话记录。" level="page" />
      </h2>
      <p style={{ color: "var(--color-text-secondary)", marginTop: 0, fontSize: 13 }}>
        常见问题 5 分钟内回复 · SPEC-§27
      </p>

      <div style={{ display: "flex", gap: 16 }}>
        {/* 当前会话 */}
        <div style={{ ...card, flex: 3, display: "flex", flexDirection: "column", minHeight: 480 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <strong>客服会话</strong>
            {["active", "queued"].includes(status) && (
              <button
                onClick={closeChat}
                style={{
                  ...btnBase,
                  background: "var(--color-bg)",
                  color: "var(--color-danger-text)",
                  padding: "4px 10px",
                }}
              >
                关闭会话
              </button>
            )}
          </div>

          {status === "idle" && (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-text-secondary)",
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
              <div>需要帮助？我们通常会在 5 分钟内回复</div>
              <button
                onClick={connect}
                style={{
                  ...btnBase,
                  background: "var(--color-primary)",
                  color: "#fff",
                  marginTop: 16,
                }}
              >
                开始咨询
              </button>
            </div>
          )}
          {status === "connecting" && <SkeletonGroup lines={3} />}
          {status === "queued" && (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-warning-text)",
              }}
            >
              <div style={{ fontSize: 40 }}>⏳</div>
              <div style={{ marginTop: 8 }}>您前面还有 {queued?.position} 位用户在等待</div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--color-text-secondary)",
                  marginTop: 8,
                }}
              >
                不想等待？可先留言描述问题，客服空闲后回复您
              </div>
            </div>
          )}

          {["active", "closed"].includes(status) && (
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 4px" }}>
              {messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    justifyContent: m.sender_type === "user" ? "flex-end" : "flex-start",
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      maxWidth: "75%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      lineHeight: 1.6,
                      fontSize: 14,
                      background:
                        m.sender_type === "user"
                          ? "var(--color-success-bg)"
                          : m.sender_type === "system"
                          ? "var(--color-bg)"
                          : "var(--color-bg)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--color-text-secondary)",
                        marginBottom: 4,
                      }}
                    >
                      {m.sender_type === "user"
                        ? "我"
                        : m.sender_type === "staff"
                        ? "客服"
                        : "系统"}
                    </div>
                    {m.content}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}

          {status === "active" && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="输入消息..."
                style={{
                  ...card,
                  padding: "10px 14px",
                  boxShadow: "none",
                  border: "1px solid var(--color-border)",
                  flex: 1,
                  margin: 0,
                }}
              />
              <button
                onClick={send}
                disabled={!input.trim()}
                style={{
                  ...btnBase,
                  background: input.trim() ? "var(--color-primary)" : "var(--color-border)",
                  color: "#fff",
                }}
              >
                发送
              </button>
            </div>
          )}
          {status === "closed" && (
            <div style={{ textAlign: "center", color: "var(--color-text-secondary)", padding: 16 }}>
              <div>💬 感谢您的咨询，本次会话已结束</div>
              <button
                onClick={() => {
                  setStatus("idle");
                  setMessages([]);
                }}
                style={{
                  ...btnBase,
                  background: "var(--color-primary)",
                  color: "#fff",
                  marginTop: 12,
                }}
              >
                重新发起咨询
              </button>
            </div>
          )}
        </div>

        {/* 历史记录 */}
        <div style={{ ...card, flex: 2 }}>
          <h4 style={{ margin: "0 0 12px" }}>历史会话</h4>
          {(histQ.data?.list ?? []).length === 0 ? (
            <div style={{ color: "var(--color-text-secondary)" }}>暂无历史记录</div>
          ) : (
            <div>
              {(histQ.data?.list ?? []).map((h) => (
                <div
                  key={h.session_id}
                  onClick={() => {
                    setHistoryId(h.session_id);
                  }}
                  style={{
                    padding: 10,
                    marginBottom: 8,
                    background: "var(--color-bg)",
                    borderRadius: 8,
                    cursor: "pointer",
                    border:
                      h.session_id === historyId
                        ? "1px solid var(--color-primary)"
                        : "1px solid transparent",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong style={{ fontSize: 13 }}>会话 #{h.session_id}</strong>
                    <span
                      style={{
                        fontSize: 11,
                        color:
                          h.status === "closed"
                            ? "var(--color-text-secondary)"
                            : "var(--color-success-text)",
                      }}
                    >
                      {h.status === "closed"
                        ? "已结束"
                        : h.status === "active"
                        ? "进行中"
                        : "等待中"}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--color-text-secondary)",
                      marginTop: 4,
                    }}
                  >
                    {h.created_at ? new Date(h.created_at).toLocaleString() : ""} ·{" "}
                    {h.msg_count} 条消息
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 从 local storage 读取 token */
function useAuthToken() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("3cloud_token") ?? localStorage.getItem("token");
      setT(raw ?? null);
    } catch {
      setT(null);
    }
  }, []);
  return t;
}
