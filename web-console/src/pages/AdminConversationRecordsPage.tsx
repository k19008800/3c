import { useCallback, useEffect, useMemo, useState } from "react";
import { api, extractError } from "../lib/api";
import {
  FilterBar,
  type FilterDef,
  Table,
  type ColumnDef,
  Pagination,
  StatusBadge,
  EmptyState,
  Modal,
  useToast,
} from "@3cloud/shared-ui";

/* ───────── 类型 ───────── */

type RetainUnit = "day" | "week" | "month" | "quarter" | "halfYear" | "year";
type PollUnit = "day" | "week" | "month" | "quarter" | "halfYear" | "year";

interface RetentionConfig {
  enabled: boolean;
  retainUnit: RetainUnit;
  retainAmount: number;
  pollUnit: PollUnit;
  pollHour: number;
  pollDayOfWeek: number;
  pollDayOfMonth: number;
  pollMonth: number;
}

interface RetentionData {
  config: RetentionConfig;
  lastPoll: string | null;
  currentPeriod: string;
}

const RETAIN_LABELS: Record<RetainUnit, string> = { day: "日", week: "周", month: "月", quarter: "季度", halfYear: "半年", year: "全年" };
const POLL_LABELS: Record<PollUnit, string> = { day: "每天", week: "每周", month: "每月", quarter: "每季度", halfYear: "每半年", year: "每年" };
const DOW_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const DEFAULT_RETENTION: RetentionConfig = {
  enabled: false,
  retainUnit: "month",
  retainAmount: 12,
  pollUnit: "day",
  pollHour: 3,
  pollDayOfWeek: 1,
  pollDayOfMonth: 1,
  pollMonth: 1,
};

function pad2(n: number): string { return String(n).padStart(2, "0"); }

/** pollHour (0-23) → "HH:00" */
function hourToLabel(h: number): string { return `${pad2(h)}:00`; }

/* ───────── 类型 ───────── */

interface RecordRow {
  requestId: string;
  occurredAt: string;
  completedAt: string | null;
  userId: number;
  email: string | null;
  name: string | null;
  requestedModel: string;
  routedModel: string | null;
  supplierId: number | null;
  supplierKeyFp: string | null;
  status: string;
  errorCode: string | null;
  inputTokens: number;
  outputTokens: number;
  cost: string | null;
  finishReason: string | null;
  clientIp: string | null;
}

interface DetailData {
  record: RecordRow & { messages: unknown[]; responseText: string | null };
  email: string | null;
  name: string | null;
  apiKeyName: string | null;
  apiKeyPrefix: string | null;
  supplierName: string | null;
}

/* ───────── 工具 ───────── */

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const STATUS_META: Record<string, { type: "success" | "danger" | "warning" | "default"; label: string }> = {
  succeeded: { type: "success", label: "成功" },
  failed: { type: "danger", label: "失败" },
  rate_limited: { type: "warning", label: "限流" },
  pending: { type: "warning", label: "处理中" },
};

function statusMeta(status: string) {
  return STATUS_META[status] ?? { type: "default" as const, label: status };
}

/* ───────── 筛选栏 ───────── */

const FILTERS: FilterDef[] = [
  { key: "keyword", label: "关键词", type: "input", placeholder: "搜索消息内容" },
  { key: "model", label: "请求模型", type: "input", placeholder: "如 gpt-4o" },
  { key: "userId", label: "用户ID", type: "input", placeholder: "精确用户 ID" },
  { key: "status", label: "状态", type: "select", options: [
    { label: "成功", value: "succeeded" },
    { label: "失败", value: "failed" },
    { label: "限流", value: "rate_limited" },
  ]},
  { key: "dateRange", label: "时间", type: "dateRange" },
];

/* ───────── 页面 ───────── */

export default function AdminConversationRecordsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 保留策略
  const [retentionOpen, setRetentionOpen] = useState(false);
  const [retentionCfg, setRetentionCfg] = useState<RetentionConfig>(DEFAULT_RETENTION);
  const [retentionInfo, setRetentionInfo] = useState<Pick<RetentionData, "lastPoll" | "currentPeriod"> | null>(null);
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [retentionSaving, setRetentionSaving] = useState(false);

  // 筛选值 → query params（dateRange [start,end] → from/to）
  const queryParams = useMemo(() => {
    const q: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
    if (filters.keyword) q.keyword = String(filters.keyword);
    if (filters.model) q.model = String(filters.model);
    if (filters.userId) q.userId = String(filters.userId);
    if (filters.status) q.status = String(filters.status);
    const dr = filters.dateRange;
    if (Array.isArray(dr) && dr[0]) q.from = `${dr[0]}T00:00:00Z`;
    if (Array.isArray(dr) && dr[1]) q.to = `${dr[1]}T23:59:59Z`;
    return q;
  }, [filters, page, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/conversation-records", { params: queryParams });
      const d = res.data?.data;
      setRows(d?.list ?? []);
      setTotal(d?.total ?? 0);
    } catch (e: any) {
      toast.error(extractError(e));
    } finally {
      setLoading(false);
    }
  }, [queryParams, toast]);

  useEffect(() => { void load(); }, [load]);

  // 重置筛选回到第 1 页
  const handleFilterChange = useCallback((values: Record<string, any>) => {
    setFilters(values);
    setPage(1);
  }, []);

  const openDetail = useCallback(async (requestId: string) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/admin/conversation-records/${requestId}`);
      setDetail(res.data?.data ?? null);
    } catch (e: any) {
      toast.error(extractError(e));
    } finally {
      setDetailLoading(false);
    }
  }, [toast]);

  const doExport = useCallback(async (format: "csv" | "json") => {
    try {
      const res = await api.get("/admin/conversation-records/export", {
        params: { ...queryParams, format },
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `conversation-records.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`已导出 ${format.toUpperCase()}`);
    } catch (e: any) {
      toast.error(extractError(e));
    }
  }, [queryParams, toast]);

  /* ── 保留策略 ── */
  const openRetention = useCallback(async () => {
    setRetentionOpen(true);
    setRetentionLoading(true);
    try {
      const res = await api.get("/admin/conversation-records/retention");
      const d = res.data?.data;
      if (d?.config) setRetentionCfg({ ...DEFAULT_RETENTION, ...d.config });
      if (d) setRetentionInfo({ lastPoll: d.lastPoll ?? null, currentPeriod: d.currentPeriod ?? null });
    } catch (e: any) {
      toast.error(extractError(e));
    } finally {
      setRetentionLoading(false);
    }
  }, [toast]);

  const saveRetention = useCallback(async () => {
    setRetentionSaving(true);
    try {
      const res = await api.put("/admin/conversation-records/retention", retentionCfg);
      setRetentionCfg({ ...DEFAULT_RETENTION, ...res.data?.data?.config });
      toast.success("保留策略已保存");
    } catch (e: any) {
      toast.error(extractError(e));
    } finally {
      setRetentionSaving(false);
    }
  }, [retentionCfg, toast]);

  const runRetentionNow = useCallback(async () => {
    if (!window.confirm("立即执行一次清理，删除所有超过保留期的对话留痕（不可恢复）。确定继续？")) return;
    setRetentionSaving(true);
    try {
      const res = await api.post("/admin/conversation-records/retention/run");
      toast.success(`已清理 ${res.data?.data?.deleted ?? 0} 条超期记录`);
      // 重新拉取保留信息（上次执行周期已更新）
      const info = await api.get("/admin/conversation-records/retention");
      const d = info.data?.data;
      if (d) setRetentionInfo({ lastPoll: d.lastPoll ?? null, currentPeriod: d.currentPeriod ?? null });
      void load();
    } catch (e: any) {
      toast.error(extractError(e));
    } finally {
      setRetentionSaving(false);
    }
  }, [toast, load]);

  const columns: ColumnDef<RecordRow>[] = [
    {
      key: "occurredAt", title: "时间", dataIndex: "occurredAt", width: "160px",
      render: (v: unknown) => fmtTime(v as string),
    },
    {
      key: "user", title: "用户", width: "140px",
      render: (_v: unknown, r: RecordRow) => `${r.name ?? r.email ?? r.userId}`,
    },
    { key: "requestedModel", title: "请求模型", dataIndex: "requestedModel" },
    {
      key: "routedModel", title: "实际路由", width: "120px",
      render: (v: unknown, r: RecordRow) => r.routedModel ?? "—",
    },
    {
      key: "supplierId", title: "供应商", width: "70px",
      render: (v: unknown, r: RecordRow) => r.supplierId ?? "—",
    },
    {
      key: "status", title: "状态", width: "80px",
      render: (v: unknown, r: RecordRow) => {
        const m = statusMeta(r.status);
        return <StatusBadge status={m.type}>{m.label}</StatusBadge>;
      },
    },
    {
      key: "tokens", title: "Token", width: "110px",
      render: (_v: unknown, r: RecordRow) => `${r.inputTokens}/${r.outputTokens}`,
    },
    { key: "cost", title: "费用(¥)", dataIndex: "cost", width: "90px" },
    {
      key: "action", title: "操作", width: "90px",
      render: (_v: unknown, r: RecordRow) => (
        <a onClick={() => void openDetail(r.requestId)} style={{ cursor: "pointer", color: "var(--color-primary, #2f6bff)" }}>
          查看上下文
        </a>
      ),
    },
  ];

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ margin: "0 0 4px" }}>对话上下文留痕</h2>
      <div style={{ fontSize: 13, color: "var(--color-text-muted, #888)", marginBottom: 16 }}>
        每笔 /v1/chat/completions 请求的完整上下文（上文、响应、模型、Key 指纹、账号、时间），用于交易纠纷举证与政府调证。
      </div>

      <FilterBar filters={FILTERS} onChange={handleFilterChange} />

      <div style={{ display: "flex", gap: 8, margin: "12px 0", alignItems: "center", flexWrap: "wrap" }}>
        <button
          className="btn btn-sm"
          onClick={() => void doExport("json")}
          style={{ cursor: "pointer" }}
        >
          导出 JSON
        </button>
        <button
          className="btn btn-sm"
          onClick={() => void doExport("csv")}
          style={{ cursor: "pointer" }}
        >
          导出 CSV
        </button>
        <button
          className="btn btn-sm"
          onClick={() => void openRetention()}
          style={{ cursor: "pointer", marginLeft: 8 }}
        >
          ⚙️ 保留策略
        </button>
        <span style={{ fontSize: 12, color: "var(--color-text-muted, #888)", alignSelf: "center" }}>
          导出当前筛选结果（上限 5 万条，操作计入审计日志）
        </span>
      </div>

      {loading && rows.length === 0 ? (
        <EmptyState title="加载中…" />
      ) : rows.length === 0 ? (
        <EmptyState title="暂无记录" description="筛选条件下没有匹配的对话留痕" />
      ) : (
        <Table<RecordRow> columns={columns} dataSource={rows} rowKey="requestId" />
      )}

      {total > 0 && (
        <div style={{ marginTop: 12 }}>
          <Pagination
            current={page}
            total={total}
            pageSize={pageSize}
            onChange={(p, ps) => { setPage(p); setPageSize(ps); }}
          />
        </div>
      )}

      {/* ── 详情 / 会话回放 ── */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="会话上下文详情"
        width={840}
      >
        {detailLoading && <EmptyState title="加载中…" />}
        {detail && (
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            {/* 元信息 */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
              <tbody>
                {[
                  ["请求ID", detail.record.requestId],
                  ["用户", `${detail.name ?? ""} ${detail.email ?? ""} (ID ${detail.record.userId})`.trim()],
                  ["客户端 Key", detail.apiKeyName ? `${detail.apiKeyName} (${detail.apiKeyPrefix}…)` : "—"],
                  ["请求模型", detail.record.requestedModel],
                  ["实际路由模型", detail.record.routedModel ?? "—"],
                  ["供应商", detail.supplierName ? `${detail.supplierName} (ID ${detail.record.supplierId ?? "—"})` : "—"],
                  ["供应商 Key 指纹", detail.record.supplierKeyFp ? `${detail.record.supplierKeyFp.slice(0, 8)}…` : "—"],
                  ["状态", `${statusMeta(detail.record.status).label}${detail.record.errorCode ? ` · ${detail.record.errorCode}` : ""}`],
                  ["Token", `${detail.record.inputTokens} / ${detail.record.outputTokens}`],
                  ["费用", detail.record.cost ? `¥${detail.record.cost}` : "—"],
                  ["时间", `${fmtTime(detail.record.occurredAt)} → ${fmtTime(detail.record.completedAt)}`],
                  ["客户端 IP", detail.record.clientIp ?? "—"],
                ].map(([k, v]) => (
                  <tr key={String(k)} style={{ borderBottom: "1px solid var(--color-border, #eee)" }}>
                    <td style={{ padding: "6px 12px 6px 0", color: "var(--color-text-muted, #888)", whiteSpace: "nowrap", verticalAlign: "top" }}>{k}</td>
                    <td style={{ padding: "6px 0", wordBreak: "break-all" }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 上文 messages */}
            <div style={{ fontWeight: 600, margin: "12px 0 6px" }}>上文（messages）</div>
            <div style={{ background: "var(--color-bg-muted, #f7f7f7)", border: "1px solid var(--color-border, #eee)", borderRadius: 8, padding: 12, maxHeight: 320, overflow: "auto" }}>
              {(Array.isArray(detail.record.messages) ? detail.record.messages : []).map((m, i) => {
                const msg = m as { role?: string; content?: unknown };
                const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "", null, 2);
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <span style={{ fontWeight: 600, color: msg.role === "user" ? "#1a6bff" : "#1a8a5a" }}>{msg.role}</span>
                    <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: "2px 0 0", fontFamily: "inherit", fontSize: 13 }}>{content}</pre>
                  </div>
                );
              })}
            </div>

            {/* 响应全文 */}
            <div style={{ fontWeight: 600, margin: "12px 0 6px" }}>响应全文（response）</div>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "var(--color-bg-muted, #f7f7f7)", border: "1px solid var(--color-border, #eee)", borderRadius: 8, padding: 12, maxHeight: 320, overflow: "auto", margin: 0, fontFamily: "inherit", fontSize: 13 }}>
              {detail.record.responseText ?? "（无响应内容 / 失败）"}
            </pre>
          </div>
        )}
      </Modal>

      {/* ── 保留策略设置 ── */}
      <Modal open={retentionOpen} onClose={() => setRetentionOpen(false)} title="对话留痕 · 数据保留策略" width={720}>
        {retentionLoading ? (
          <EmptyState title="加载中…" />
        ) : (
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            <div style={{ marginBottom: 14, color: "var(--color-text-muted, #666)" }}>
              配置对话上下文留痕的自动清理。关闭自动清理 = 全量永久保留（默认）。清理按「保留期截止 + 轮询计划」执行，命中轮询日期时删除超过保留期的记录；每次执行与上次记录到不同周期才生效，避免重复清理。
            </div>

            {/* 启用 */}
            <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={retentionCfg.enabled} onChange={(e) => setRetentionCfg({ ...retentionCfg, enabled: e.target.checked })} />
              <label>启用自动清理</label>
            </div>

            {/* 保留期 */}
            <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <label>保留最近</label>
              <input
                type="number" min={1} max={10000} value={retentionCfg.retainAmount}
                onChange={(e) => setRetentionCfg({ ...retentionCfg, retainAmount: parseInt(e.target.value) || 1 })}
                style={{ width: 80 }}
              />
              <select
                value={retentionCfg.retainUnit}
                onChange={(e) => setRetentionCfg({ ...retentionCfg, retainUnit: e.target.value as RetainUnit })}
              >
                {(Object.keys(RETAIN_LABELS) as RetainUnit[]).map((u) => (
                  <option key={u} value={u}>{RETAIN_LABELS[u]}</option>
                ))}
              </select>
              <span style={{ color: "var(--color-text-muted, #888)" }}>之前的数据将被自动删除</span>
            </div>

            {/* 轮询计划 */}
            <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <label>轮询频率</label>
              <select
                value={retentionCfg.pollUnit}
                onChange={(e) => setRetentionCfg({ ...retentionCfg, pollUnit: e.target.value as PollUnit })}
              >
                {(Object.keys(POLL_LABELS) as PollUnit[]).map((u) => (
                  <option key={u} value={u}>{POLL_LABELS[u]}</option>
                ))}
              </select>
              <label>执行时间（UTC+8）</label>
              <select
                value={retentionCfg.pollHour}
                onChange={(e) => setRetentionCfg({ ...retentionCfg, pollHour: parseInt(e.target.value) })}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{hourToLabel(h)}</option>
                ))}
              </select>
            </div>

            {/* 具体日期 */}
            {retentionCfg.pollUnit === "week" && (
              <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <label>每周</label>
                <select
                  value={retentionCfg.pollDayOfWeek}
                  onChange={(e) => setRetentionCfg({ ...retentionCfg, pollDayOfWeek: parseInt(e.target.value) })}
                >
                  {DOW_LABELS.map((l, i) => (
                    <option key={i} value={i}>{l}</option>
                  ))}
                </select>
              </div>
            )}
            {(retentionCfg.pollUnit === "month" || retentionCfg.pollUnit === "quarter" || retentionCfg.pollUnit === "halfYear") && (
              <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <label>每{retentionCfg.pollUnit === "month" ? "月" : retentionCfg.pollUnit === "quarter" ? "季度" : "半年"}</label>
                <select
                  value={retentionCfg.pollDayOfMonth}
                  onChange={(e) => setRetentionCfg({ ...retentionCfg, pollDayOfMonth: parseInt(e.target.value) })}
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d} 日</option>
                  ))}
                </select>
              </div>
            )}
            {retentionCfg.pollUnit === "year" && (
              <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <label>每年</label>
                <select
                  value={retentionCfg.pollMonth}
                  onChange={(e) => setRetentionCfg({ ...retentionCfg, pollMonth: parseInt(e.target.value) })}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{m} 月</option>
                  ))}
                </select>
                <select
                  value={retentionCfg.pollDayOfMonth}
                  onChange={(e) => setRetentionCfg({ ...retentionCfg, pollDayOfMonth: parseInt(e.target.value) })}
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d} 日</option>
                  ))}
                </select>
              </div>
            )}

            {retentionInfo?.lastPoll && (
              <div style={{ fontSize: 12, color: "var(--color-text-muted, #888)", margin: "8px 0" }}>
                上次执行周期：{retentionInfo.lastPoll} · 当前周期：{retentionInfo.currentPeriod}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
              <button className="btn btn-sm" onClick={() => void saveRetention()} disabled={retentionSaving} style={{ cursor: "pointer" }}>
                {retentionSaving ? "保存中…" : "保存策略"}
              </button>
              <button className="btn btn-sm" onClick={() => void runRetentionNow()} disabled={retentionSaving} style={{ cursor: "pointer" }}>
                立即清理
              </button>
              <span style={{ fontSize: 12, color: "var(--color-text-muted, #888)" }}>
                立即清理将删除所有超过保留期的记录，操作计入审计日志
              </span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
