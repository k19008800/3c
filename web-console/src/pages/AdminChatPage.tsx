import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

/**
 * 在线客服工作台 对齐 SPEC-§27.1（客服端）
 * 等待队列 / 活动会话 / 聊天窗口 / 预设消息
 */
const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const icon = { cursor: "pointer", color: "#64748b", fontSize: 14, marginLeft: 8 } as const;
const HELP = "客服实时会话工作台：等待队列可抢单，活动会话实时收发消息，支持转工单/关闭/快捷回复模板。WS 实时双向通信。";

interface WsMsg { id: number; sender_type: string; content: string; created_at: string; }
interface QueueItem { session_id: number; email: string; username: string; wait_seconds: number; }
interface ActiveItem { session_id: number; user_id: number; email: string; username: string; last_message: string; unread: number; }

export default function AdminChatPage() {
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [help, setHelp] = useState(false);
  const [staffStatus, setStaffStatus] = useState("online");
  const [currentSession, setCurrentSession] = useState<number | null>(null);
  const [messages, setMessages] = useState<WsMsg[]>([]);
  const [input, setInput] = useState("");
  const [showPresets, setShowPresets] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const token = localStorage.getItem("token") ?? "";

  const queueQ = useQuery({
    queryKey: ["admin-chat-queue"],
    queryFn: async () => (await api.get<{ data: { list: QueueItem[] } }>("/admin/chat/queue")).data.data,
    refetchInterval: 5000,
  });
  const activeQ = useQuery({
    queryKey: ["admin-chat-active"],
    queryFn: async () => (await api.get<{ data: { list: ActiveItem[] } }>("/admin/chat/active")).data.data,
    refetchInterval: 5000,
  });
  const presetsQ = useQuery({ queryKey: ["admin-chat-presets"], queryFn: async () => (await api.get<{ data: { list: any[] } }>("/admin/chat/presets")).data.data });

  const statusMut = useMutation({
    mutationFn: async (s: string) => (await api.post("/admin/chat/status", { status: s })).data,
    onSuccess: (d: any) => { setStaffStatus(d.data.status); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const transferMut = useMutation({
    mutationFn: async (sid: number) => (await api.post(`/admin/chat/sessions/${sid}/transfer`, {})).data,
    onSuccess: (d: any) => { setNotice({ type: "success", msg: `已转工单 ${d.data.ticket_no}` }); qc.invalidateQueries({ queryKey: ["admin-chat-queue"] }); qc.invalidateQueries({ queryKey: ["admin-chat-active"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const closeMut = useMutation({
    mutationFn: async (sid: number) => (await api.post(`/admin/chat/sessions/${sid}/close`, {})).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-chat-active"] }); setCurrentSession(null); setMessages([]); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  // 建立客服 WS
  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/api/v1/ws/chat/staff?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.type === "user_message" && d.session_id === currentSession) {
        setMessages((m) => [...m, { id: d.message.id, sender_type: "user", content: d.message.content, created_at: d.message.created_at }]);
      } else if (d.type === "session_closed") {
        setNotice({ type: "success", msg: "用户已结束会话" });
        qc.invalidateQueries({ queryKey: ["admin-chat-active"] });
      }
    };
    return () => ws.close();
  }, [token, currentSession]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const loadSession = (sid: number) => {
    setCurrentSession(sid);
    setMessages([]);
    // 拉历史消息
    api.get<{ data: { messages: any[] } }>(`/admin/chat/sessions/${sid}/messages`).then((r) => {
      setMessages(r.data.data.messages.map((m: any) => ({ id: m.id, sender_type: m.sender_type, content: m.content, created_at: m.created_at })));
    }).catch(() => setMessages([]));
    // 客服 WS 接受会话
    wsRef.current?.send(JSON.stringify({ type: "accept", session_id: sid }));
  };

  const send = () => {
    if (!input.trim() || !currentSession) return;
    const content = input.trim();
    wsRef.current?.send(JSON.stringify({ type: "message", content }));
    setMessages((m) => [...m, { id: Date.now(), sender_type: "staff", content, created_at: new Date().toISOString() }]);
    setInput("");
  };

  const acceptFirst = () => {
    const first = queueQ.data?.list?.[0];
    if (first) loadSession(first.session_id);
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>在线客服 <span onClick={() => setHelp(true)} style={icon} title="帮助">[?]</span></h2>
      <p style={{ color: "#94a3b8", marginTop: 0, fontSize: 13 }}>客服工作台 · SPEC-§27</p>

      {/* 客服状态栏 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        {([["online", "🟢 在线"], ["busy", "🟡 忙碌"], ["offline", "🔴 离线"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => statusMut.mutate(v)} style={{ ...btnBase, background: staffStatus === v ? "#2563eb" : "#fff", color: staffStatus === v ? "#fff" : "#475569", border: "1px solid #cbd5e1" }}>{l}</button>
        ))}
        <button onClick={acceptFirst} style={{ ...btnBase, background: "#16a34a", color: "#fff", marginLeft: "auto" }}>抢单第一个</button>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* 左：会话列表 */}
        <div style={{ ...card, width: 300, maxHeight: 560, overflowY: "auto" }}>
          <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>等待中 ({queueQ.data?.list?.length ?? 0})</h4>
          <div style={{ marginBottom: 12 }}>
            {(queueQ.data?.list ?? []).length === 0 ? <div style={{ color: "#94a3b8", fontSize: 13 }}>暂无等待用户</div> : (
              (queueQ.data?.list ?? []).map((q) => (
                <div key={q.session_id} onClick={() => loadSession(q.session_id)} style={{ padding: 10, marginBottom: 6, background: "#fef3c7", borderRadius: 6, cursor: "pointer" }}>
                  <strong style={{ fontSize: 13 }}>{q.username ?? q.email}</strong>
                  <div style={{ fontSize: 11, color: "#92400e" }}>等待 {Math.floor(q.wait_seconds / 60)}m{q.wait_seconds % 60}s</div>
                </div>
              ))
            )}
          </div>
          <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>正在服务 ({activeQ.data?.list?.length ?? 0})</h4>
          {(activeQ.data?.list ?? []).length === 0 ? <div style={{ color: "#94a3b8", fontSize: 13 }}>暂无进行中会话</div> : (
            (activeQ.data?.list ?? []).map((a) => (
              <div key={a.session_id} onClick={() => loadSession(a.session_id)} style={{ padding: 10, marginBottom: 6, background: currentSession === a.session_id ? "#dbeafe" : "#f8fafc", borderRadius: 6, cursor: "pointer" }}>
                <strong style={{ fontSize: 13 }}>{a.username ?? a.email}</strong>
                {a.unread > 0 && <span style={{ background: "#dc2626", color: "#fff", borderRadius: 10, padding: "0 6px", fontSize: 11, marginLeft: 6 }}>{a.unread}</span>}
                <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.last_message ?? ""}</div>
              </div>
            ))
          )}
        </div>

        {/* 右：聊天窗口 */}
        <div style={{ ...card, flex: 1, display: "flex", flexDirection: "column", minHeight: 560 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <strong>会话 {currentSession ? `#${currentSession}` : "（未选择）"}</strong>
            <div style={{ display: "flex", gap: 8 }}>
              {currentSession && (
                <>
                  <button onClick={() => transferMut.mutate(currentSession)} style={{ ...btnBase, background: "#eef2ff", color: "#4f46e5", padding: "4px 10px" }}>转工单</button>
                  <button onClick={() => closeMut.mutate(currentSession)} style={{ ...btnBase, background: "#f1f5f9", color: "#dc2626", padding: "4px 10px" }}>关闭</button>
                </>
              )}
              <button onClick={() => setShowPresets(!showPresets)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", padding: "4px 10px" }}>快捷回复</button>
            </div>
          </div>

          {showPresets && (
            <div style={{ marginBottom: 12, padding: 10, background: "#f0f9ff", borderRadius: 8 }}>
              <strong style={{ fontSize: 12 }}>预设消息：</strong>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {(presetsQ.data?.list ?? []).map((p: any) => (
                  <button key={p.id} onClick={() => setInput(p.content)} style={{ ...btnBase, background: "#e0f2fe", color: "#0369a1", padding: "4px 8px", fontSize: 12 }}>{p.title ?? p.type}</button>
                ))}
              </div>
            </div>
          )}

          {/* 消息区 */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 4px" }}>
            {!currentSession ? <div style={{ color: "#94a3b8", textAlign: "center", padding: 40 }}>请选择或等待一个会话</div> : messages.map((m) => (
              <div key={m.id} style={{ display: "flex", justifyContent: m.sender_type === "staff" ? "flex-end" : "flex-start", marginBottom: 10 }}>
                <div style={{ maxWidth: "75%", padding: "10px 14px", borderRadius: 10, lineHeight: 1.6, fontSize: 14, background: m.sender_type === "staff" ? "#eef2ff" : m.sender_type === "user" ? "#f8fafc" : "#f1f5f9" }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{m.sender_type === "staff" ? "客服" : m.sender_type === "user" ? "用户" : "系统"}</div>
                  {m.content}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {currentSession && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="输入回复..."
                style={{ ...card, padding: "10px 14px", boxShadow: "none", border: "1px solid #cbd5e1", flex: 1, margin: 0 }}
              />
              <button onClick={send} disabled={!input.trim()} style={{ ...btnBase, background: input.trim() ? "#2563eb" : "#cbd5e1", color: "#fff" }}>发送</button>
            </div>
          )}
        </div>
      </div>

      {help && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }} onClick={() => setHelp(false)}>
          <div style={{ ...card, width: 480 }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ margin: "0 0 8px" }}>帮助 · 在线客服</h4><p style={{ color: "#475569", lineHeight: 1.7, margin: 0 }}>{HELP}</p>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}><button onClick={() => setHelp(false)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>关闭</button></div>
          </div>
        </div>
      )}

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 3000, padding: "12px 20px", borderRadius: 8, color: "#fff", background: notice.type === "success" ? "#16a34a" : "#dc2626" }}>
          {notice.msg}<button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}
