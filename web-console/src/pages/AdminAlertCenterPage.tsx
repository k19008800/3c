import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  PageHeader,
  Panel,
  Tag,
  Table,
  SkeletonGroup,
  Modal,
  Pagination,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";
import type { TagType } from "@3cloud/shared-ui";

/**
 * 告警中心 — PRD §5.4
 *
 * 后端契约（api/src/routes/admin-alerts.ts）：
 *   GET    /admin/alerts/rules      → { data: { rules: Rule[] } }
 *   POST   /admin/alerts/rules      → 201 { data, message }   （super_admin）
 *   PUT    /admin/alerts/rules/:id  → { data, message }        （super_admin）
 *   DELETE /admin/alerts/rules/:id  → { data, message }        （super_admin）
 *   GET    /admin/alerts?status&rule_id&page&page_size → { data: { items, total, page, pageSize } }
 *   POST   /admin/alerts/:id/ack    → { data, message }
 *
 * 读写分离：admin 可读；写操作仅 super_admin（后端 superAdminOnly 拦截）。
 * 前端据 role 隐藏写入口，减少必然 403 的无效操作，但**不替代后端鉴权**。
 */

/* ============ 类型 ============
 * 注意：后端响应是 Drizzle 原样返回 → **camelCase**；
 * 而 POST/PUT 的**请求体**是 snake_case（window_sec / channel_ids）。
 * 读侧与写侧字段名不同，这里刻意区分，避免混用。
 */
interface AlertRule {
  id: number;
  name: string;
  metric: string;
  threshold: number;
  windowSec: number;
  channelIds: number[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AlertEvent {
  id: number;
  ruleId: number;
  status: "firing" | "acknowledged" | "resolved";
  metricValue: number;
  threshold: number;
  message: string;
  firedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

/* ============ 展示辅助 ============ */

/** 指标 → 中文名与单位（对齐后端 ALLOWED_METRICS） */
const METRIC_META: Record<string, { label: string; unit: string }> = {
  response_latency: { label: "响应延迟", unit: "ms" },
  error_rate: { label: "错误率", unit: "%" },
  qps: { label: "QPS", unit: "" },
  cost_spike: { label: "成本突增", unit: "倍" },
  balance_low: { label: "余额不足", unit: "元" },
  vendor_health: { label: "供应商健康度", unit: "%" },
  cache_hit_rate: { label: "缓存命中率", unit: "%" },
};
const METRICS = Object.keys(METRIC_META);

function metricLabel(m: string): string {
  return METRIC_META[m]?.label ?? m;
}
function metricUnit(m: string): string {
  return METRIC_META[m]?.unit ?? "";
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { hour12: false });
}

/** 告警状态 → Tag 颜色（对应 TagType） */
function statusTag(s: AlertEvent["status"]): TagType {
  switch (s) {
    case "firing": return "red";
    case "acknowledged": return "orange";
    case "resolved": return "green";
    default: return "gray";
  }
}
function statusLabel(s: AlertEvent["status"]): string {
  switch (s) {
    case "firing": return "触发中";
    case "acknowledged": return "已确认";
    case "resolved": return "已解决";
    default: return s;
  }
}

/** 判断当前用户是否超级管理员（决定是否展示写入口） */
function isSuperAdmin(): boolean {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return false;
    const u = JSON.parse(raw);
    return u?.role === "super_admin";
  } catch {
    return false;
  }
}

type Tab = "events" | "rules";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "events", label: "告警事件", icon: "\u{1F514}" },
  { key: "rules", label: "告警规则", icon: "\u2699" },
];

export default function AdminAlertCenterPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState<Tab>("events");
  const [statusFilter, setStatusFilter] = useState<"" | AlertEvent["status"]>("");
  const [page, setPage] = useState(1);

  const [ruleModal, setRuleModal] = useState<{ open: boolean; target: AlertRule | null }>({
    open: false,
    target: null,
  });
  const [form, setForm] = useState({ name: "", metric: "error_rate", threshold: "5", window_sec: "300" });
  const [delTarget, setDelTarget] = useState<AlertRule | null>(null);

  const canWrite = isSuperAdmin();
  const PAGE_SIZE = 20;

  /* ---- 告警事件 ----
   * refetchInterval：引擎每 60s tick 一次，页面同步轮询，
   * 运营不必手动刷新即可看到新告警（否则切Tab 会一直停留在进入时的快照）。
   */
  const eventsQ = useQuery({
    queryKey: ["admin-alerts", statusFilter, page],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (statusFilter) p.set("status", statusFilter);
      return (await api.get<{ data: { items: AlertEvent[]; total: number } }>(`/admin/alerts?${p}`)).data
        .data;
    },
    refetchInterval: 30_000,
  });

  /* ---- 告警规则 ---- */
  const rulesQ = useQuery({
    queryKey: ["admin-alert-rules"],
    queryFn: async () =>
      (await api.get<{ data: { rules: AlertRule[] } }>("/admin/alerts/rules")).data.data.rules,
  });

  /* ---- 确认告警 ---- */
  const ackMut = useMutation({
    mutationFn: async (id: number) => (await api.post(`/admin/alerts/${id}/ack`)).data,
    onSuccess: () => {
      toast.success("告警已确认");
      qc.invalidateQueries({ queryKey: ["admin-alerts"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  /* ---- 规则：新建 / 更新 ---- */
  const saveRuleMut = useMutation({
    mutationFn: async (payload: { id?: number; body: Record<string, unknown> }) =>
      payload.id
        ? (await api.put(`/admin/alerts/rules/${payload.id}`, payload.body)).data
        : (await api.post("/admin/alerts/rules", payload.body)).data,
    onSuccess: () => {
      toast.success("告警规则已保存");
      setRuleModal({ open: false, target: null });
      qc.invalidateQueries({ queryKey: ["admin-alert-rules"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  /* ---- 规则：启停 ---- */
  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) =>
      (await api.put(`/admin/alerts/rules/${id}`, { enabled })).data,
    onSuccess: (_d, v) => {
      toast.success(v.enabled ? "规则已启用" : "规则已停用");
      qc.invalidateQueries({ queryKey: ["admin-alert-rules"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  /* ---- 规则：删除 ---- */
  const delMut = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/alerts/rules/${id}`)).data,
    onSuccess: () => {
      toast.success("告警规则已删除");
      setDelTarget(null);
      qc.invalidateQueries({ queryKey: ["admin-alert-rules"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const events = eventsQ.data?.items ?? [];
  const total = eventsQ.data?.total ?? 0;
  const rules = rulesQ.data ?? [];
  const firingCount = events.filter((e) => e.status === "firing").length;

  /* ---- 列定义 ---- */
  const eventCols: ColumnDef<AlertEvent>[] = [
    {
      key: "status",
      title: "状态",
      dataIndex: "status",
      width: "96px",
      render: (_v, r) => <Tag type={statusTag(r.status)}>{statusLabel(r.status)}</Tag>,
    },
    {
      key: "message",
      title: "告警内容",
      dataIndex: "message",
      render: (v, r) => (
        <div style={{ whiteSpace: "normal", overflow: "visible", textOverflow: "clip", lineHeight: 1.5 }}>
          <div style={{ fontWeight: 500 }}>{String(v ?? "")}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
            规则 #{r.ruleId} · 实际 {r.metricValue}
          </div>
        </div>
      ),
    },
    {
      key: "metricValue",
      title: "实际值 / 阈值",
      width: "150px",
      render: (_v, r) => (
        <span>
          <strong>{r.metricValue}</strong>
          <span style={{ color: "var(--color-text-muted)" }}> / {r.threshold}</span>
        </span>
      ),
    },
    {
      key: "firedAt",
      title: "触发时间",
      dataIndex: "firedAt",
      width: "170px",
      render: (v) => fmtTime(String(v ?? "")),
    },
    {
      key: "ops",
      title: "操作",
      width: "100px",
      render: (_v, r) =>
        r.status === "resolved" ? (
          <span style={{ color: "var(--color-text-muted)" }}>—</span>
        ) : (
          <button
            type="button"
            className="c3-btn c3-btn--default c3-btn--sm"
            disabled={ackMut.isPending || r.status === "acknowledged"}
            onClick={() => ackMut.mutate(r.id)}
          >
            {r.status === "acknowledged" ? "已确认" : "确认"}
          </button>
        ),
    },
  ];

  const ruleCols: ColumnDef<AlertRule>[] = [
    {
      key: "name",
      title: "规则名称",
      dataIndex: "name",
      render: (v) => (
        <strong style={{ whiteSpace: "normal", overflow: "visible", textOverflow: "clip" }}>
          {String(v ?? "")}
        </strong>
      ),
    },
    {
      key: "metric",
      title: "监控指标",
      dataIndex: "metric",
      width: "140px",
      render: (v) => {
        const m = String(v ?? "");
        return <Tag type="blue">{metricLabel(m)}</Tag>;
      },
    },
    {
      key: "threshold",
      title: "阈值",
      dataIndex: "threshold",
      width: "120px",
      render: (v, r) => (
        <span>
          {String(v ?? "")}
          <span style={{ color: "var(--color-text-muted)" }}> {metricUnit(r.metric)}</span>
        </span>
      ),
    },
    {
      key: "windowSec",
      title: "窗口",
      dataIndex: "windowSec",
      width: "110px",
      render: (v) => `${Number(v) >= 3600 ? `${(Number(v) / 3600).toFixed(1)} 小时` : `${v} 秒`}`,
    },
    {
      key: "enabled",
      title: "状态",
      dataIndex: "enabled",
      width: "90px",
      render: (v) => (v ? <Tag type="green">启用</Tag> : <Tag type="gray">停用</Tag>),
    },
    {
      key: "ops",
      title: "操作",
      width: "210px",
      render: (_v, r) =>
        canWrite ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="c3-btn c3-btn--default c3-btn--sm"
              onClick={() => {
                setForm({
                  name: r.name,
                  metric: r.metric,
                  threshold: String(r.threshold),
                  window_sec: String(r.windowSec),
                });
                setRuleModal({ open: true, target: r });
              }}
            >
              编辑
            </button>
            <button
              type="button"
              className="c3-btn c3-btn--default c3-btn--sm"
              disabled={toggleMut.isPending}
              onClick={() => toggleMut.mutate({ id: r.id, enabled: !r.enabled })}
            >
              {r.enabled ? "停用" : "启用"}
            </button>
            <button
              type="button"
              className="c3-btn c3-btn--danger c3-btn--sm"
              onClick={() => setDelTarget(r)}
            >
              删除
            </button>
          </div>
        ) : (
          <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>仅超级管理员可操作</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="告警中心"
        help="监控网关与供应商健康度，触发阈值即产生告警；支持规则配置与告警确认。"
      />

      {/* 概览 */}
      <div className="c3-stat-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon" />
          <div className="c3-stat-card__label">告警总数</div>
          <div className="c3-stat-card__value">{eventsQ.isLoading ? "—" : total}</div>
          <div className="c3-stat-card__sub">当前筛选条件下</div>
        </div>
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon" />
          <div className="c3-stat-card__label">触发中</div>
          <div className="c3-stat-card__value">{eventsQ.isLoading ? "—" : firingCount}</div>
          <div className="c3-stat-card__sub">本页待处理告警数</div>
        </div>
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon" />
          <div className="c3-stat-card__label">规则总数</div>
          <div className="c3-stat-card__value">{rulesQ.isLoading ? "—" : rules.length}</div>
          <div className="c3-stat-card__sub">启用 {rules.filter((r) => r.enabled).length} 条</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="c3-sub-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`c3-sub-tab${tab === t.key ? " c3-sub-tab--active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <span>{t.icon}</span>
            {t.label}
            {t.key === "events" && firingCount > 0 && (
              <span className="c3-sub-tab__badge">{firingCount}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "events" ? (
        <Panel
          title="告警事件"
          help="告警由检测引擎每 60s 评估生成；确认后状态变为「已确认」，历史记录保留。"
          extra={
            <select
              className="c3-select c3-select--sm"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as "" | AlertEvent["status"]);
                setPage(1);
              }}
            >
              <option value="">全部状态</option>
              <option value="firing">触发中</option>
              <option value="acknowledged">已确认</option>
              <option value="resolved">已解决</option>
            </select>
          }
        >
          {eventsQ.isLoading ? (
            <SkeletonGroup lines={6} />
          ) : (
            <>
              <Table columns={eventCols} dataSource={events} rowKey="id" emptyText="暂无告警" />
              {total > PAGE_SIZE && (
                <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                  <Pagination
                    current={page}
                    pageSize={PAGE_SIZE}
                    total={total}
                    onChange={(p) => setPage(p)}
                  />
                </div>
              )}
            </>
          )}
        </Panel>
      ) : (
        <Panel
          title="告警规则"
          help="规则决定监控哪个指标、超过什么阈值、在多长时间窗口内判定。历史告警不随规则删除而清除。"
          extra={
            canWrite ? (
              <button
                type="button"
                className="c3-btn c3-btn--primary c3-btn--sm"
                onClick={() => {
                  setForm({ name: "", metric: "error_rate", threshold: "5", window_sec: "300" });
                  setRuleModal({ open: true, target: null });
                }}
              >
                ＋ 新建规则
              </button>
            ) : null
          }
        >
          {rulesQ.isLoading ? (
            <SkeletonGroup lines={5} />
          ) : (
            <Table columns={ruleCols} dataSource={rules} rowKey="id" emptyText="暂无告警规则" />
          )}
        </Panel>
      )}

      {/* 新建 / 编辑规则 */}
      <Modal
        open={ruleModal.open}
        onClose={() => setRuleModal({ open: false, target: null })}
        title={ruleModal.target ? `编辑规则 — ${ruleModal.target.name}` : "新建告警规则"}
      >
        <div className="c3-form-group">
          <label>规则名称</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="如：网关错误率告警"
          />
        </div>
        <div className="c3-form-group">
          <label>监控指标</label>
          <select
            value={form.metric}
            onChange={(e) => setForm({ ...form, metric: e.target.value })}
          >
            {METRICS.map((m) => (
              <option key={m} value={m}>
                {metricLabel(m)}（{m}）
              </option>
            ))}
          </select>
        </div>
        <div className="c3-form-group">
          <label>阈值（{metricUnit(form.metric) || "数值"}）</label>
          <input
            type="number"
            step="any"
            value={form.threshold}
            onChange={(e) => setForm({ ...form, threshold: e.target.value })}
          />
        </div>
        <div className="c3-form-group">
          <label>评估窗口（秒，30-86400）</label>
          <input
            type="number"
            value={form.window_sec}
            onChange={(e) => setForm({ ...form, window_sec: e.target.value })}
          />
        </div>
        <div className="c3-btn-group" style={{ justifyContent: "flex-end" }}>
          <button
            type="button"
            className="c3-btn c3-btn--default"
            onClick={() => setRuleModal({ open: false, target: null })}
          >
            取消
          </button>
          <button
            type="button"
            className="c3-btn c3-btn--primary"
            disabled={saveRuleMut.isPending}
            onClick={() => {
              const name = form.name.trim();
              if (!name) {
                toast.error("请填写规则名称");
                return;
              }
              const threshold = Number(form.threshold);
              if (!Number.isFinite(threshold)) {
                toast.error("阈值须为数字");
                return;
              }
              const windowSec = Number(form.window_sec);
              if (!Number.isInteger(windowSec) || windowSec < 30 || windowSec > 86400) {
                toast.error("窗口须为 30-86400 的整数秒");
                return;
              }
              saveRuleMut.mutate({
                id: ruleModal.target?.id,
                body: { name, metric: form.metric, threshold, window_sec: windowSec },
              });
            }}
          >
            {saveRuleMut.isPending ? "保存中..." : "保存"}
          </button>
        </div>
      </Modal>

      {/* 删除确认 */}
      <Modal open={!!delTarget} onClose={() => setDelTarget(null)} title="删除告警规则">
        <p style={{ marginTop: 0 }}>
          确认删除规则「{delTarget?.name}」？已产生的历史告警记录会保留，但该规则将不再评估。
        </p>
        <div className="c3-btn-group" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="c3-btn c3-btn--default" onClick={() => setDelTarget(null)}>
            取消
          </button>
          <button
            type="button"
            className="c3-btn c3-btn--danger"
            disabled={delMut.isPending}
            onClick={() => delTarget && delMut.mutate(delTarget.id)}
          >
            {delMut.isPending ? "删除中..." : "确认删除"}
          </button>
        </div>
      </Modal>
    </>
  );
}
