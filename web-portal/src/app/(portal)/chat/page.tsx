/**
 * UserChatPage — 在线客服
 *
 * Features:
 * - Chat window (message list + input box)
 * - WebSocket connection status indicator
 */
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { StatusBadge } from "@3cloud/shared-ui";
import PortalTopbar from "../_components/PortalTopbar";

interface Message {
  id: string;
  sender: "user" | "agent";
  text: string;
  time: string;
}

const MOCK_MESSAGES: Message[] = [
  { id: "1", sender: "agent", text: "您好！我是 3cloud 客服小云，请问有什么可以帮您？", time: "14:30" },
  { id: "2", sender: "user", text: "我想问一下 DeepSeek-V4 Pro 的限流是多少？", time: "14:31" },
  { id: "3", sender: "agent", text: "DeepSeek-V4 Pro 模型默认并发限制为 5 QPM。您可以在 API Key 管理页面的限流配置中调整，最高可设置 100 QPM。", time: "14:32" },
  { id: "4", sender: "user", text: "好的，那充值最低金额是多少？", time: "14:33" },
  { id: "5", sender: "agent", text: "充值最低金额为 ¥10.00。支持支付宝、微信支付、对公转账和 USDT 多种方式。", time: "14:34" },
];

const QUICK_REPLIES = [
  "如何充值？",
  "API 调用失败怎么办？",
  "如何提升限流？",
  "发票怎么开？",
];

type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

export default function UserChatPage() {
  const [messages, setMessages] = useState<Message[]>(MOCK_MESSAGES);
  const [input, setInput] = useState("");
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("connected");
  const [typing, setTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    // Simulate connection status changes
    const timer = setTimeout(() => {
      setConnStatus("disconnected");
      setTimeout(() => setConnStatus("reconnecting"), 2000);
      setTimeout(() => setConnStatus("connected"), 3500);
    }, 15000);
    return () => clearTimeout(timer);
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMsg: Message = {
      id: String(Date.now()),
      sender: "user",
      text: trimmed,
      time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    // Simulate agent reply after delay
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      const replyMap: Record<string, string> = {
        "如何充值": "您可以在「充值」页面选择充值金额和支付方式。支持支付宝、微信支付、对公转账和 USDT。",
        "api": "请检查您的 API Key 是否有效、余额是否充足。如仍有问题请提供具体的错误码，我们会帮您排查。",
        "限流": "您可以在 API Key 管理页面对对应 Key 调整限流配置，最高 100 QPM。",
        "发票": "您可以在「发票」页面申请开具发票，支持增值税电子普通发票和增值税专用发票。",
        "便宜": "3cloud 提供多种计费模式：按量计费和包月套餐。您可以对比不同厂商的价格，选择最适合的方案。",
        "模型": "3cloud 已支持 DeepSeek-V4、GPT-5、Claude Opus 4.8、Qwen3 等 30+ 主流模型。您可以在模型目录页面查看完整列表。",
      };

      let reply = "感谢您的咨询！如需要更详细的帮助，请提供具体的问题描述，我们会尽快回复您。";
      for (const [key, text] of Object.entries(replyMap)) {
        if (trimmed.includes(key)) { reply = text; break; }
      }

      const agentMsg: Message = {
        id: String(Date.now() + 1),
        sender: "agent",
        text: reply,
        time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, agentMsg]);
    }, 1500);
  }, [input]);

  const handleQuickReply = useCallback((text: string) => {
    const userMsg: Message = {
      id: String(Date.now()),
      sender: "user",
      text: text,
      time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);

    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      const agentMsg: Message = {
        id: String(Date.now() + 1),
        sender: "agent",
        text: "收到！正在为您查询相关信息，请稍候…",
        time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, agentMsg]);
    }, 1500);
  }, []);

  const connConfig: Record<ConnectionStatus, { color: string; label: string; badge: "success" | "warning" | "danger" }> = {
    connected: { color: "var(--color-success-text)", label: "已连接", badge: "success" },
    disconnected: { color: "var(--color-danger-text)", label: "已断开", badge: "danger" },
    reconnecting: { color: "#f59e0b", label: "重连中…", badge: "warning" },
  };
  const connStatusInfo = connConfig[connStatus];

  return (
    <>
      <PortalTopbar title="在线客服" helpHint="与 3cloud 客服团队实时沟通，获取帮助和支持" />

      <div style={{ display: "flex", gap: 20, height: "calc(100vh - 160px)" }}>
        {/* Chat Panel */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-panel)", overflow: "hidden",
        }}>
          {/* Connection Status Bar */}
          <div style={{
            padding: "8px 20px", borderBottom: "1px solid var(--color-divider)",
            display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-size-sm)",
            background: connStatus === "disconnected" ? "var(--color-danger-bg)" : "#fafafa",
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: connStatus === "connected" ? "var(--color-success-text)" :
                          connStatus === "reconnecting" ? "#f59e0b" : "var(--color-danger-text)",
              animation: connStatus === "reconnecting" ? "pulse 1s infinite" : "none",
            }} />
            <span style={{ fontWeight: 500, color: connStatusInfo.color }}>{connStatusInfo.label}</span>
            <StatusBadge status={connStatusInfo.badge}>{connStatus === "connected" ? "WebSocket" : "离线"}</StatusBadge>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
            {messages.map((msg) => {
              const isUser = msg.sender === "user";
              return (
                <div key={msg.id} style={{
                  display: "flex", flexDirection: "column",
                  alignItems: isUser ? "flex-end" : "flex-start",
                  marginBottom: 16,
                }}>
                  <div style={{
                    display: "flex", alignItems: "flex-end", gap: 8,
                    flexDirection: isUser ? "row-reverse" : "row",
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: isUser
                        ? "linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))"
                        : "linear-gradient(135deg, var(--color-success-text), #66bb6a)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontSize: "var(--font-size-sm)", fontWeight: 600,
                      flexShrink: 0,
                    }}>
                      {isUser ? "你" : "客"}
                    </div>
                    <div style={{
                      maxWidth: 360, padding: "10px 16px", borderRadius: 12,
                      background: isUser ? "var(--color-primary-light)" : "var(--color-divider)",
                      color: "var(--color-text)", fontSize: "var(--font-size-base)",
                      lineHeight: 1.6, wordBreak: "break-word",
                      borderBottomRightRadius: isUser ? 4 : 12,
                      borderBottomLeftRadius: isUser ? 12 : 4,
                    }}>
                      {msg.text}
                    </div>
                  </div>
                  <div style={{
                    fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)",
                    marginTop: 4, marginLeft: 40, marginRight: 40,
                    textAlign: isUser ? "right" : "left",
                  }}>
                    {msg.time}
                  </div>
                </div>
              );
            })}

            {typing && (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 16 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "linear-gradient(135deg, var(--color-success-text), #66bb6a)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: "var(--font-size-sm)", fontWeight: 600,
                  flexShrink: 0,
                }}>
                  客
                </div>
                <div style={{
                  padding: "10px 16px", borderRadius: 12, borderBottomRightRadius: 4,
                  background: "var(--color-divider)", color: "var(--color-text-secondary)",
                  fontSize: "var(--font-size-base)",
                }}>
                  正在输入<span style={{ animation: "dots 1.5s steps(3, end) infinite" }}>...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Replies */}
          <div style={{
            padding: "8px 20px", borderTop: "1px solid var(--color-divider-light)",
            display: "flex", gap: 8, flexWrap: "wrap",
          }}>
            {QUICK_REPLIES.map((reply) => (
              <button
                key={reply}
                onClick={() => handleQuickReply(reply)}
                style={{
                  padding: "6px 14px", borderRadius: 16, border: "1px solid var(--color-border)",
                  background: "var(--color-panel)", color: "var(--color-primary)",
                  fontSize: "var(--font-size-sm)", cursor: "pointer",
                  transition: "all var(--transition-fast)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
              >
                {reply}
              </button>
            ))}
          </div>

          {/* Input */}
          <div style={{
            padding: "12px 20px", borderTop: "1px solid var(--color-divider)",
            display: "flex", gap: 12, alignItems: "center",
          }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="输入您的问题…"
              style={{
                flex: 1, height: 44, border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)", padding: "0 16px",
                fontSize: "var(--font-size-base)", background: "var(--color-panel)",
                color: "var(--color-text)", outline: "none",
                transition: "border var(--transition-fast)",
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              style={{
                height: 44, padding: "0 24px", borderRadius: "var(--radius-lg)",
                background: input.trim() ? "var(--color-primary)" : "#a0b4f9",
                color: "#fff", border: "none", fontSize: "var(--font-size-base)",
                cursor: input.trim() ? "pointer" : "not-allowed",
                transition: "background var(--transition-fast)",
              }}
            >
              发送
            </button>
          </div>
        </div>

        {/* Sidebar Info */}
        <div style={{ width: 260, flexShrink: 0 }}>
          <div style={{
            background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
            padding: 20, boxShadow: "var(--shadow-panel)", marginBottom: 16,
          }}>
            <h4 style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              💬 客服信息
            </h4>
            <div style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              <div>👤 客服代表：小云</div>
              <div>🕐 在线时间：9:00-21:00</div>
              <div>📧 邮件：support@3cloud.ai</div>
              <div>⚡ 平均回复：&lt;3 分钟</div>
            </div>
          </div>

          <div style={{
            background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
            padding: 20, boxShadow: "var(--shadow-panel)",
          }}>
            <h4 style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              📚 快捷入口
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "帮助中心", href: "/help-center" },
                { label: "提交工单", href: "/ticket" },
                { label: "API 文档", href: "#" },
                { label: "状态页面", href: "/status" },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  style={{
                    display: "block", padding: "8px 12px", borderRadius: "var(--radius-md)",
                    background: "var(--color-divider-light)", color: "var(--color-text)",
                    fontSize: "var(--font-size-md)", textDecoration: "none",
                    transition: "all var(--transition-fast)",
                  }}
                >
                  {link.label} →
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes dots {
          0% { content: ''; }
          33% { content: '.'; }
          66% { content: '..'; }
          100% { content: '...'; }
        }
      `}</style>
    </>
  );
}
