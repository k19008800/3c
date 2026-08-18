import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, useToast, Pagination } from "@3cloud/shared-ui";

/**
 * 在线客服工作台 对齐 SPEC-§27.1（客服端）
 * 会话列表（GET /admin/chat/conversations）→ 选择会话查看消息（GET .../:id/messages）
 * → 回复（POST .../:id/reply）→ 关闭（POST .../:id/close）。
 * 数据全部来自真实后端，轮询刷新。
 */
const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const HELP = "客服会话工作台：浏览在线客服会话（可按状态筛选），选择会话查看聊天记录并回复，可关闭会话。";

interface Conversation {
  id: number;
  user_id: number | null;
  user: { id: number; email: string | null; name: string | null } | null;
  status: string;
  last_message: string | null;
  created_at: string;
  updated_at: string;
}
interface ChatMessage {
  id: number;
  conversation_id: number;
  role: string;
  content: string;
  created_at: string;
}

export default function AdminChatPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // 会话列表（轮询刷新）
  const convQ = useQuery({
    queryKey: ["admin-chat-conversations", statusFilter, page, pageSize],
    queryFn: async () => (await api.get<{ data: { list: Conversation[]; total: number; page: number; pageSize: number } }>("/admin/chat/conversations", {
      params: { status: statusFilter || undefined, page, pageSize },
    })).data.data,
    refetchInterval: 5000,
    retry: 0,
  });
  const conversations = convQ.data?.list ?? [];

  // 当前会话消息
  const messagesQ = useQuery({
    queryKey: ["admin-chat-messages", currentId],
    queryFn: async () => (await api.get<{ data: { list: ChatMessage[] } }>(`/admin/chat/conversations/${currentId}/messages`)).data.data,
    enabled: currentId != null,
    retry: 0,
  });
  const messages = messagesQ.data?.list ?? [];

  // 回复
  const replyMut = useMutation({
    mutationFn: async (content: string) => (await api.post(`/admin/chat/conversations/${currentId}/reply`, { content })).data,
    onSuccess: () => {
      setInput("");
      qc.invalidateQueries({ queryKey: ["admin-chat-messages", currentId] });
      qc.invalidateQueries({ queryKey: ["admin-chat-conversations"] });
    },
    onError: (e: any) => toast.error(extractError(e)),
  });

  // 关闭会话
  const closeMut = useMutation({
    mutationFn: async () => (await api.post(`/admin/chat/conversations/${currentId}/close`, {})).data,
    onSuccess: () => {
      toast.success("会话已关闭");
      setCurrentId(null);
      qc.invalidateQueries({ queryKey: ["admin-chat-conversations"] });
    },
    onError: (e: any) => toast.error(extractError(e)),
  });

  // 消息自动滚动到底部
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = () => {
    const content = input.trim();
    if (!content || currentId == null) return;
    replyMut.mutate(content);
  };

  const currentConv = conversations.find((c) => c.id === currentId);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>
        在线客服
        <HelpIcon text={HELP} level="page" />
      </h2>
      <p style={{ color: "#94a3b8", marginTop: 0, fontSize: 13 }}>客服工作台 · SPEC-§27</p>

      {/* 状态筛选 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        {([["", "全部"], ["open", "进行中"], ["closed", "已关闭"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => { setStatusFilter(v); setPage(1); }} style={{ ...btnBase, background: statusFilter === v ? "var(--color-primary)" : "var(--color-panel)", color: statusFilter === v ? "#fff" : "#475569", border: `1px solid var(--color-border)` }}>{l}</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8" }}>共 {convQ.data?.total ?? 0} 个会话（5s 自动刷新）</span>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* 左：会话列表 */}
        <div style={{ ...card, width: 320, maxHeight: 600, overflowY: "auto" }}>
          <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>会话列表</h4>
          {convQ.isLoading ? <div style={{ color: "#94a3b8", fontSize: 13 }}>加载中...</div> : conversations.length === 0 ? (
            <div style={{ color: "#94a3b8", fontSize: 13 }}>暂无会话</div>
          ) : (
            conversations.map((c) => (
              <div key={c.id} onClick={() => setCurrentId(c.id)} style={{ padding: 10, marginBottom: 6, background: currentId === c.id ? "#dbeafe" : "var(--color-bg)", borderRadius: 6, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <strong style={{ fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.user?.name ?? c.user?.email ?? `用户 #${c.user_id ?? "?"}`}</strong>
                  <StatusBadge status={c.status === "open" ? "warning" : "default"}>{c.status === "open" ? "进行中" : "已关闭"}</StatusBadge>
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{c.last_message ?? "（无消息）"}</div>
                <div style={{ fontSize: 10, color: "#cbd5e1", marginTop: 2 }}>{c.updated_at ? new Date(c.updated_at).toLocaleString("zh-CN") : ""}</div>
              </div>
            ))
          )}
          {convQ.data && (
            <div style={{ marginTop: 8 }}>
              <Pagination
                current={page}
                total={convQ.data.total}
                pageSize={pageSize}
                onChange={(p, size) => { setPage(p); setPageSize(size); }}
              />
            </div>
          )}
        </div>

        {/* 右：聊天窗口 */}
        <div style={{ ...card, flex: 1, display: "flex", flexDirection: "column", minHeight: 600 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <strong>会话 {currentId ? `#${currentId}${currentConv?.user?.email ? ` · ${currentConv.user.email}` : ""}` : "（未选择）"}</strong>
            {currentId && currentConv?.status === "open" && (
              <button onClick={() => closeMut.mutate()} disabled={closeMut.isPending} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-danger-text)", padding: "4px 10px" }}>{closeMut.isPending ? "关闭中..." : "关闭会话"}</button>
            )}
          </div>

          {/* 消息区 */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 4px" }}>
            {!currentId ? <div style={{ color: "#94a3b8", textAlign: "center", padding: 40 }}>请选择一个会话</div> : messagesQ.isLoading ? (
              <div style={{ color: "#94a3b8", textAlign: "center", padding: 40 }}>消息加载中...</div>
            ) : messages.length === 0 ? (
              <div style={{ color: "#94a3b8", textAlign: "center", padding: 40 }}>暂无消息，输入内容回复用户</div>
            ) : messages.map((m) => (
              <div key={m.id} style={{ display: "flex", justifyContent: m.role === "staff" ? "flex-end" : "flex-start", marginBottom: 10 }}>
                <div style={{ maxWidth: "75%", padding: "10px 14px", borderRadius: 10, lineHeight: 1.6, fontSize: 14, background: m.role === "staff" ? "#eef2ff" : m.role === "user" ? "var(--color-bg)" : "#f1f5f9" }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>{m.role === "staff" ? "客服" : m.role === "user" ? "用户" : "系统"} · {new Date(m.created_at).toLocaleTimeString("zh-CN")}</div>
                  {m.content}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {currentId && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="输入回复..."
                style={{ ...card, padding: "10px 14px", boxShadow: "none", border: `1px solid var(--color-border)`, flex: 1, margin: 0 }}
              />
              <button onClick={send} disabled={!input.trim() || replyMut.isPending} style={{ ...btnBase, background: input.trim() ? "var(--color-primary)" : "var(--color-border)", color: "#fff" }}>{replyMut.isPending ? "发送中..." : "发送"}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
