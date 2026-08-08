import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  HelpIcon,
  Table,
  StatusBadge,
  SkeletonGroup,
  EmptyState,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

/**
 * 我的工单 对齐 SPEC-§26（用户端）
 * 列表 / 创建 / 详情回复 / 满意度评价
 */
interface Ticket {
  id: number;
  ticket_no: string;
  title: string;
  category: string;
  category_label: string;
  priority: string;
  priority_label: string;
  status: string;
  status_label: string;
  created_at: string;
  unread: number;
  description?: string;
  satisfaction?: { rating: number; comment: string | null } | null;
}
interface Reply {
  id: number;
  user_id: number;
  is_staff: boolean;
  content: string;
  attachments: string[];
  created_at: string;
}

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
const inp: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  width: "100%",
  boxSizing: "border-box",
  marginBottom: 10,
  fontFamily: "inherit",
};
const lbl: React.CSSProperties = {
  fontSize: 13,
  color: "var(--color-text-secondary)",
  display: "block",
  marginBottom: 4,
};
const CATEGORIES = [
  ["billing", "计费问题"],
  ["api", "API 调用"],
  ["account", "账户与安全"],
  ["key", "Key 管理"],
  ["invoice_refund", "发票与退款"],
  ["feature_request", "功能建议"],
  ["other", "其他"],
] as const;

function getStatusBadge(status: string, label: string) {
  if (status === "pending") return <StatusBadge status="warning">{label}</StatusBadge>;
  if (status === "processing") return <StatusBadge status="info">{label}</StatusBadge>;
  if (status === "resolved") return <StatusBadge status="success">{label}</StatusBadge>;
  return <StatusBadge status="default">{label}</StatusBadge>;
}

export default function TicketsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: "",
    category: "billing",
    priority: "normal",
    description: "",
  });
  const [replyDraft, setReplyDraft] = useState("");
  const [rating, setRating] = useState(0);
  const [satComment, setSatComment] = useState("");

  const listQ = useQuery({
    queryKey: ["me-tickets"],
    queryFn: async () =>
      (await api.get<{ data: { list: Ticket[] } }>("/me/tickets?page_size=50")).data.data,
  });
  const detailQ = useQuery({
    queryKey: ["me-ticket-detail", activeId],
    queryFn: async () =>
      (await api.get<{ data: { ticket: Ticket; replies: Reply[] } }>(`/me/tickets/${activeId}`))
        .data.data,
    enabled: !!activeId,
  });

  const createMut = useMutation({
    mutationFn: async () => (await api.post("/me/tickets", form)).data,
    onSuccess: () => {
      toast.success("工单已提交");
      setView("list");
      setForm({ title: "", category: "billing", priority: "normal", description: "" });
      qc.invalidateQueries({ queryKey: ["me-tickets"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });
  const replyMut = useMutation({
    mutationFn: async () =>
      (await api.post(`/me/tickets/${activeId}/reply`, { content: replyDraft })).data,
    onSuccess: () => {
      setReplyDraft("");
      qc.invalidateQueries({ queryKey: ["me-ticket-detail"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });
  const closeMut = useMutation({
    mutationFn: async () => (await api.post(`/me/tickets/${activeId}/close`, {})).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me-ticket-detail"] });
      qc.invalidateQueries({ queryKey: ["me-tickets"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });
  const satMut = useMutation({
    mutationFn: async () =>
      (await api.post(`/me/tickets/${activeId}/satisfaction`, { rating, comment: satComment }))
        .data,
    onSuccess: () => {
      toast.success("感谢您的评价");
      setRating(0);
      setSatComment("");
      qc.invalidateQueries({ queryKey: ["me-ticket-detail"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  useEffect(() => {
    setRating(0);
    setSatComment("");
  }, [activeId]);

  const ticketColumns: ColumnDef<Ticket>[] = [
    {
      key: "ticket_no",
      title: "工单号",
      dataIndex: "ticket_no",
      render: (v, record) => (
        <span style={{ fontWeight: 600, color: "var(--color-primary)" }}>
          {v as string}
          {(record as Ticket).unread > 0 ? (
            <span
              style={{
                background: "var(--color-danger-text)",
                color: "#fff",
                borderRadius: 10,
                padding: "0 6px",
                fontSize: 11,
                marginLeft: 6,
              }}
            >
              {(record as Ticket).unread}
            </span>
          ) : null}
        </span>
      ),
    },
    { key: "title", title: "标题", dataIndex: "title" },
    {
      key: "category_label",
      title: "分类",
      dataIndex: "category_label",
      render: (v) => <span style={{ color: "var(--color-text-secondary)" }}>{v as string}</span>,
    },
    {
      key: "status",
      title: "状态",
      render: (_, record) => getStatusBadge((record as Ticket).status, (record as Ticket).status_label),
    },
    {
      key: "created_at",
      title: "时间",
      dataIndex: "created_at",
      render: (v) => (
        <span style={{ color: "var(--color-text-secondary)" }}>
          {(v as string) ? new Date(v as string).toLocaleString() : "—"}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h2 style={{ margin: 0 }}>
          我的工单
          <HelpIcon text="提交和管理您的工单。选择分类和优先级提交问题，查看客服回复并进行满意度评价。" level="page" />
        </h2>
        <button
          onClick={() => setView("create")}
          style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}
        >
          + 创建工单
        </button>
      </div>

      {view === "create" ? (
        <div style={card}>
          <h3 style={{ margin: "0 0 16px" }}>创建工单</h3>
          <label style={lbl}>标题</label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="简洁描述问题"
            style={inp}
          />
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>分类</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                style={inp}
              >
                {CATEGORIES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>优先级</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                style={inp}
              >
                <option value="low">低</option>
                <option value="normal">普通</option>
                <option value="high">高</option>
                <option value="urgent">紧急</option>
              </select>
            </div>
          </div>
          <label style={lbl}>描述</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="详细描述您遇到的问题"
            rows={5}
            style={{ ...inp, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => setView("list")}
              style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}
            >
              取消
            </button>
            <button
              onClick={() => createMut.mutate()}
              disabled={!form.title || !form.description}
              style={{
                ...btnBase,
                background: "var(--color-primary)",
                color: "#fff",
              }}
            >
              {createMut.isPending ? "提交中..." : "提交工单"}
            </button>
          </div>
        </div>
      ) : view === "detail" && detailQ.data ? (
        <div style={card}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <h3 style={{ margin: 0 }}>工单 {detailQ.data.ticket.ticket_no}</h3>
            <button
              onClick={() => setView("list")}
              style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}
            >
              ← 返回
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {getStatusBadge(
              detailQ.data.ticket.status,
              detailQ.data.ticket.status_label,
            )}
            <span
              style={{
                padding: "2px 10px",
                borderRadius: 6,
                fontSize: 12,
                background: "var(--color-bg)",
                color: "var(--color-text-secondary)",
              }}
            >
              {detailQ.data.ticket.category_label}
            </span>
            <span
              style={{
                padding: "2px 10px",
                borderRadius: 6,
                fontSize: 12,
                background: "var(--color-bg)",
                color: "var(--color-text-secondary)",
              }}
            >
              优先级: {detailQ.data.ticket.priority_label}
            </span>
          </div>
          <div
            style={{
              padding: 12,
              background: "var(--color-bg)",
              borderRadius: 8,
              fontSize: 14,
              lineHeight: 1.7,
              marginBottom: 16,
            }}
          >
            <strong>{detailQ.data.ticket.title}</strong>
            <div style={{ color: "var(--color-text)", marginTop: 6 }}>
              {detailQ.data.ticket.description}
            </div>
          </div>

          {/* 回复流 */}
          <div style={{ marginBottom: 16 }}>
            {detailQ.data.replies.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  justifyContent: r.is_staff ? "flex-start" : "flex-end",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    maxWidth: "70%",
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: r.is_staff ? "var(--color-bg)" : "var(--color-success-bg)",
                    lineHeight: 1.6,
                    fontSize: 14,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--color-text-secondary)",
                      marginBottom: 4,
                    }}
                  >
                    {r.is_staff ? "客服" : "我"} · {new Date(r.created_at).toLocaleString()}
                  </div>
                  {r.content}
                </div>
              </div>
            ))}
          </div>

          {/* 回复框（未关闭） */}
          {detailQ.data.ticket.status !== "closed" && (
            <div style={{ display: "flex", gap: 8 }}>
              <textarea
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                placeholder="输入回复..."
                rows={2}
                style={{ ...inp, marginBottom: 0, flex: 1 }}
              />
              <button
                onClick={() => replyMut.mutate()}
                disabled={!replyDraft}
                style={{
                  ...btnBase,
                  background: "var(--color-primary)",
                  color: "#fff",
                  alignSelf: "flex-end",
                }}
              >
                发送
              </button>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {detailQ.data.ticket.status === "pending" && (
              <button
                onClick={() => closeMut.mutate()}
                style={{
                  ...btnBase,
                  background: "var(--color-danger-bg)",
                  color: "var(--color-danger-text)",
                }}
              >
                关闭工单
              </button>
            )}
            {["resolved", "closed"].includes(detailQ.data.ticket.status) &&
              !detailQ.data.ticket.satisfaction && (
                <div
                  style={{
                    padding: 12,
                    background: "var(--color-bg)",
                    borderRadius: 8,
                    width: "100%",
                  }}
                >
                  <strong>请对本次服务评价</strong>
                  <div style={{ display: "flex", gap: 4, margin: "8px 0" }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => setRating(n)}
                        style={{
                          fontSize: 24,
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          opacity: rating >= n ? 1 : 0.3,
                        }}
                      >
                        ⭐
                      </button>
                    ))}
                  </div>
                  <input
                    value={satComment}
                    onChange={(e) => setSatComment(e.target.value)}
                    placeholder="补充意见（可选）"
                    style={inp}
                  />
                  <button
                    onClick={() => satMut.mutate()}
                    disabled={!rating}
                    style={{
                      ...btnBase,
                      background: "var(--color-primary)",
                      color: "#fff",
                    }}
                  >
                    提交评价
                  </button>
                </div>
              )}
          </div>
        </div>
      ) : (
        <div style={card}>
          {listQ.isLoading ? (
            <SkeletonGroup lines={5} />
          ) : (listQ.data?.list?.length ?? 0) === 0 ? (
            <EmptyState
              icon="📋"
              title="暂无工单"
              description="您还没有提交过工单"
              actionText="创建工单"
              onAction={() => setView("create")}
            />
          ) : (
            <Table
              columns={ticketColumns}
              dataSource={listQ.data?.list ?? []}
              loading={listQ.isLoading}
              emptyText="暂无工单"
              onRowClick={(record) => {
                setActiveId((record as Ticket).id);
                setView("detail");
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
