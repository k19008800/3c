import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  HelpIcon,
  Table,
  StatusBadge,
  SkeletonGroup,
  EmptyState,
  Pagination,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

/**
 * 我的工单 — 门户端工单中心
 *
 * 原型参考: kb/3cloud/prototypes/portal-ticket.html
 *
 * 功能:
 * - 工单列表（按时间/状态筛选）
 * - 创建工单（分类选择、标题、描述、附件上传）
 * - 工单详情（对话式回复流、客服/客户气泡）
 * - 确认解决工单
 * - 页面级 + 按钮级 [?] 帮助
 */

/* ---------- types ---------- */

interface Ticket {
  id: number;
  ticket_no: string;
  title: string;
  category: string;
  category_label: string;
  priority: string;
  priority_label: string;
  status: "pending" | "processing" | "replied" | "resolved";
  status_label: string;
  created_at: string;
  last_reply_at: string | null;
  unread: number;
  description?: string;
}

interface Reply {
  id: number;
  customer_name?: string;
  staff_name?: string;
  is_staff: boolean;
  content: string;
  attachments: string[];
  created_at: string;
}

/* ---------- constants ---------- */

const TICKET_CATEGORIES = [
  { value: "technical", label: "技术问题" },
  { value: "billing", label: "计费咨询" },
  { value: "feature_request", label: "功能建议" },
  { value: "account", label: "账户问题" },
  { value: "other", label: "其他" },
] as const;

const STATUS_OPTIONS = [
  { value: "all", label: "全部状态" },
  { value: "pending", label: "待处理" },
  { value: "processing", label: "处理中" },
  { value: "replied", label: "已回复" },
  { value: "resolved", label: "已解决" },
] as const;

const TIME_OPTIONS = [
  { value: "all", label: "全部时间" },
  { value: "today", label: "今天" },
  { value: "week", label: "本周" },
  { value: "month", label: "本月" },
] as const;

type ViewMode = "list" | "create" | "detail";

/* ---------- helpers ---------- */

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case "pending": return "warning" as const;
    case "processing": return "info" as const;
    case "replied": return "success" as const;
    default: return "default" as const;
  }
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/* ---------- styles ---------- */

const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.06)", border: "1px solid var(--color-border)" };
const btnPrimary: React.CSSProperties = { padding: "8px 20px", borderRadius: 6, border: "none", background: "#4f6ef7", color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" };
const btnGhost: React.CSSProperties = { padding: "8px 16px", borderRadius: 6, border: "1px solid #d9d9d9", background: "#fff", color: "#333", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" };
const filterSelect: React.CSSProperties = { padding: "8px 14px", borderRadius: 6, border: "1px solid #d9d9d9", background: "#fff", fontSize: 13, color: "#333", outline: "none", cursor: "pointer" };
const inp: React.CSSProperties = { width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid #d9d9d9", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const lbl: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#888", marginBottom: 6 };

export default function TicketsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---------- state ---------- */
  const [view, setView] = useState<ViewMode>("list");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // create form
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState("technical");
  const [formDesc, setFormDesc] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);

  // detail
  const [replyDraft, setReplyDraft] = useState("");
  const [showResolvePop, setShowResolvePop] = useState(false);

  /* ---------- queries ---------- */

  const listQ = useQuery({
    queryKey: ["me-tickets", statusFilter, timeFilter, page, pageSize],
    queryFn: async () =>
      (await api.get<{ data: { list: Ticket[]; total: number } }>("/me/tickets", {
        params: {
          status: statusFilter === "all" ? undefined : statusFilter,
          time: timeFilter === "all" ? undefined : timeFilter,
          page,
          page_size: pageSize,
        },
      })).data.data,
  });

  const detailQ = useQuery({
    queryKey: ["me-ticket-detail", activeId],
    queryFn: async () =>
      (await api.get<{ data: { ticket: Ticket; replies: Reply[] } }>(`/me/tickets/${activeId}`))
        .data.data,
    enabled: !!activeId,
  });

  /* ---------- mutations ---------- */

  const createMut = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("title", formTitle);
      fd.append("category", formCategory);
      fd.append("description", formDesc);
      attachments.forEach((f) => fd.append("attachments", f));
      return (await api.post("/me/tickets", fd)).data;
    },
    onSuccess: () => {
      toast.success("工单已提交");
      setView("list");
      setFormTitle("");
      setFormCategory("technical");
      setFormDesc("");
      setAttachments([]);
      qc.invalidateQueries({ queryKey: ["me-tickets"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const replyMut = useMutation({
    mutationFn: async () =>
      (await api.post(`/me/tickets/${activeId}/reply`, { content: replyDraft })).data,
    onSuccess: () => {
      setReplyDraft("");
      qc.invalidateQueries({ queryKey: ["me-ticket-detail", activeId] });
      qc.invalidateQueries({ queryKey: ["me-tickets"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const resolveMut = useMutation({
    mutationFn: async () => (await api.post(`/me/tickets/${activeId}/resolve`, {})).data,
    onSuccess: () => {
      toast.success("工单已标记为已解决");
      setShowResolvePop(false);
      qc.invalidateQueries({ queryKey: ["me-ticket-detail", activeId] });
      qc.invalidateQueries({ queryKey: ["me-tickets"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  /* ---------- handlers ---------- */

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setAttachments((prev) => {
        const combined = [...prev, ...newFiles].slice(0, 3);
        if (combined.length < prev.length + newFiles.length) toast.error("最多上传 3 个文件");
        return combined;
      });
      e.target.value = "";
    }
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  /* ---------- columns ---------- */

  const ticketColumns: ColumnDef<Ticket>[] = [
    {
      key: "ticket_no",
      title: "工单号",
      dataIndex: "ticket_no",
      render: (v, r) => (
        <span style={{ fontWeight: 600, color: "#4f6ef7" }}>
          {v as string}
          {(r as Ticket).unread > 0 ? (
            <span style={{ background: "#e53935", color: "#fff", borderRadius: 10, padding: "0 6px", fontSize: 11, marginLeft: 6 }}>{(r as Ticket).unread}</span>
          ) : null}
        </span>
      ),
    },
    { key: "title", title: "标题", dataIndex: "title" },
    {
      key: "category_label",
      title: "类型",
      dataIndex: "category_label",
      render: (v) => <span style={{ color: "#888" }}>{v as string}</span>,
    },
    {
      key: "status",
      title: "状态",
      render: (_, r) => (
        <StatusBadge status={getStatusBadgeVariant((r as Ticket).status)}>
          {(r as Ticket).status_label}
        </StatusBadge>
      ),
    },
    {
      key: "created_at",
      title: "创建时间",
      render: (_, r) => (
        <span style={{ color: "#666", fontSize: 13 }}>
          {formatDate((r as Ticket).created_at)}
        </span>
      ),
    },
    {
      key: "last_reply_at",
      title: "最后回复",
      render: (_, r) => (
        <span style={{ color: "#666", fontSize: 13 }}>
          {formatDate((r as Ticket).last_reply_at)}
        </span>
      ),
    },
    {
      key: "action",
      title: "操作",
      render: (_, r) => (
        <span
          style={{ color: "#4f6ef7", cursor: "pointer", fontSize: 13 }}
          onClick={(e) => { e.stopPropagation(); setActiveId((r as Ticket).id); setView("detail"); }}
        >
          查看详情
        </span>
      ),
    },
  ];

  /* ---------- render ---------- */

  return (
    <div>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          工单中心
          <HelpIcon text="工单中心是您与 3Cloud 技术支持团队沟通的渠道。点击「创建工单」提交问题或建议，在列表中查看详情进入对话，客服回复后可继续追问，问题解决后点击「确认解决」关闭工单。工单一般在 2 小时内得到响应。" level="page" />
        </h2>
        {view === "list" ? (
          <button style={btnPrimary} onClick={() => setView("create")}>
            ＋ 创建工单
            <HelpIcon text="新建一个工单，选择分类后填写标题和描述，可上传截图等附件（最多3个）" level="button" />
          </button>
        ) : null}
      </div>

      {/* ── LIST VIEW ── */}
      {view === "list" && (
        <div style={card}>
          {/* toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <select style={filterSelect} value={timeFilter} onChange={(e) => { setTimeFilter(e.target.value); setPage(1); }}>
              {TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select style={filterSelect} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div style={{ flex: 1 }} />
            <button style={btnPrimary} onClick={() => setView("create")}>
              ＋ 创建工单
               <HelpIcon text="新建工单提交您的问题或建议" level="button" />
            </button>
          </div>

          {/* table */}
          {listQ.isLoading ? (
            <SkeletonGroup lines={5} />
          ) : (listQ.data?.list?.length ?? 0) === 0 ? (
            <EmptyState icon="🎫" title="暂无工单" description="您还没有提交过工单，点击上方按钮创建" actionText="创建工单" onAction={() => setView("create")} />
          ) : (
            <>
              <Table
                columns={ticketColumns}
                dataSource={listQ.data?.list ?? []}
                loading={listQ.isLoading}
                emptyText="暂无工单"
                onRowClick={(r) => { setActiveId((r as Ticket).id); setView("detail"); }}
              />
              <div style={{ marginTop: 16 }}>
                <Pagination
                  current={page}
                  total={listQ.data?.total ?? 0}
                  pageSize={pageSize}
                  onChange={(p, s) => { setPage(p); setPageSize(s); }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── CREATE VIEW ── */}
      {view === "create" && (
        <div style={card}>
          <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 600 }}>
            创建工单
            <HelpIcon text="提交新的工单请求，请选择恰当的分类和填写详细描述以便快速处理" level="button" />
          </h3>

          {/* title */}
          <div style={{ marginBottom: 18 }}>
            <label style={lbl}>
              标题
              <HelpIcon text="简要描述您的问题，例如：API 调用频繁返回 429 限流" level="button" />
            </label>
            <input style={inp} value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="请输入工单标题" />
          </div>

          {/* category */}
          <div style={{ marginBottom: 18 }}>
            <label style={lbl}>
              类型
              <HelpIcon text="选择合适的工单分类以便分配给对应的处理团队" level="button" />
            </label>
            <select style={{ ...inp, width: "100%", cursor: "pointer" }} value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
              {TICKET_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          {/* description */}
          <div style={{ marginBottom: 18 }}>
            <label style={lbl}>
              描述
              <HelpIcon text="详细说明遇到的问题，包含复现步骤、错误信息等" level="button" />
            </label>
            <textarea
              style={{ ...inp, minHeight: 100, resize: "vertical" }}
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="请详细描述您的问题…"
              rows={5}
            />
          </div>

          {/* attachments */}
          <div style={{ marginBottom: 18 }}>
            <label style={lbl}>
              附件
              <HelpIcon text="支持图片、PDF 等文件，最多上传 3 个文件" level="button" />
            </label>
            <div
              style={{ border: "2px dashed #d9d9d9", borderRadius: 8, padding: 24, textAlign: "center", cursor: "pointer", color: "#888", fontSize: 13, transition: "border-color .15s" }}
              onClick={() => attachments.length < 3 && fileInputRef.current?.click()}
            >
              📎 点击或拖拽文件到此处上传（最多 3 个）
            </div>
            <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleFileChange} accept="image/*,.pdf,.doc,.docx,.txt" />
            {attachments.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {attachments.map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f5f5f5", border: "1px solid #d9d9d9", padding: "8px 12px", borderRadius: 6, marginBottom: 6, fontSize: 12 }}>
                    <span style={{ color: "#333" }}>📎 {f.name}</span>
                    <span style={{ color: "#e53935", cursor: "pointer", fontSize: 16 }} onClick={() => removeAttachment(i)}>✕</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button style={btnGhost} onClick={() => { setView("list"); setAttachments([]); }}>取消</button>
            <button
              style={btnPrimary}
              onClick={() => createMut.mutate()}
              disabled={!formTitle || !formDesc || createMut.isPending}
            >
              {createMut.isPending ? "提交中..." : "提交工单"}
               <HelpIcon text='提交后工单状态为&ldquo;待处理&rdquo;，客服将在 2 小时内响应' level="button" />
            </button>
          </div>
        </div>
      )}

      {/* ── DETAIL VIEW ── */}
      {view === "detail" && detailQ.data && (
        <div style={card}>
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button style={btnGhost} onClick={() => { setView("list"); setActiveId(null); }}>← 返回列表</button>
              <span style={{ fontSize: 20, fontWeight: 600 }}>工单详情</span>
            </div>
            <div style={{ position: "relative" }}>
              {detailQ.data.ticket.status !== "resolved" && (
                <>
                  <button style={btnPrimary} onClick={() => setShowResolvePop(!showResolvePop)}>
                    ✓ 确认解决
                  </button>
                  {showResolvePop && (
                    <div style={{ position: "absolute", bottom: "100%", right: 0, marginBottom: 8, background: "#fff", border: "1px solid #d9d9d9", borderRadius: 8, padding: 12, boxShadow: "0 -4px 16px rgba(0,0,0,.1)", zIndex: 10, whiteSpace: "nowrap" }}>
                      <p style={{ fontSize: 13, color: "#333", margin: "0 0 10px" }}>确认将此工单标记为已解决？</p>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer", border: "1px solid #d9d9d9", background: "#fff" }} onClick={() => setShowResolvePop(false)}>取消</button>
                        <button style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer", border: "none", background: "#2e7d32", color: "#fff" }} onClick={() => resolveMut.mutate()}>确认</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* meta */}
          <div style={{ display: "flex", gap: 16, marginBottom: 16, fontSize: 13, color: "#888", flexWrap: "wrap" }}>
            <span>工单号：{detailQ.data.ticket.ticket_no}</span>
            <span>类型：{detailQ.data.ticket.category_label}</span>
            <span>状态：<StatusBadge status={getStatusBadgeVariant(detailQ.data.ticket.status)}>{detailQ.data.ticket.status_label}</StatusBadge></span>
            <span>创建时间：{formatDate(detailQ.data.ticket.created_at)}</span>
          </div>

          {/* chat area */}
          <div style={{ background: "#fff", border: "1px solid #d9d9d9", borderRadius: 12, padding: 24, maxHeight: 500, overflowY: "auto", marginBottom: 16 }}>
            {detailQ.data.replies.map((r) => (
              <div key={r.id} style={{ marginBottom: 16, maxWidth: "70%", marginLeft: r.is_staff ? 0 : "auto", textAlign: r.is_staff ? "left" : "right" }}>
                <div style={{
                  display: "inline-block",
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: r.is_staff ? "#e8f0ff" : "#f5f5f5",
                  border: r.is_staff ? "1px solid #c5d4ff" : "1px solid #d9d9d9",
                  borderBottomLeftRadius: r.is_staff ? 4 : undefined,
                  borderBottomRightRadius: !r.is_staff ? 4 : undefined,
                  fontSize: 14,
                  lineHeight: 1.6,
                  textAlign: "left",
                }}>
                  {r.content}
                </div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                  {r.is_staff ? r.staff_name || "客服" : r.customer_name || "我"} · {formatDate(r.created_at)}
                </div>
              </div>
            ))}
            {detailQ.data.replies.length === 0 && (
              <div style={{ textAlign: "center", color: "#888", padding: 40 }}>
                暂无回复内容。工单描述：{detailQ.data.ticket.description || "无"}
              </div>
            )}
          </div>

          {/* reply area */}
          {detailQ.data.ticket.status !== "resolved" && (
            <div style={{ background: "#fff", border: "1px solid #d9d9d9", borderRadius: 12, padding: 16 }}>
              <textarea
                style={{ ...inp, minHeight: 80, resize: "vertical", marginBottom: 0 }}
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                placeholder="输入回复内容…"
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
                <button style={btnGhost} onClick={() => setReplyDraft("")}>清空</button>
                <button
                  style={btnPrimary}
                  onClick={() => replyMut.mutate()}
                  disabled={!replyDraft || replyMut.isPending}
                >
                  {replyMut.isPending ? "发送中..." : "发送回复"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
