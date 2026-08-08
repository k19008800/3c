import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  HelpIcon,
  Table,
  StatusBadge,
  Modal,
  Pagination,
  SkeletonGroup,
  EmptyState,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

/**
 * 代理端 — 结算对账
 * 对齐原型: agent-consumption.html (统计卡片 + 筛选)
 *           agent-customers.html (表格 + 详情 Modal)
 */

/* ===== 样式片段 ===== */
const CARD: React.CSSProperties = {
  background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
  padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)",
};
const BTN_BASE: React.CSSProperties = {
  padding: "8px 14px", borderRadius: "var(--radius-lg)", border: "none",
  cursor: "pointer", fontWeight: 600, fontSize: 13,
};

export default function AgentSettlementPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["agent/settlements", statusFilter, page],
    queryFn: () =>
      api.get("/agent/settlements", {
        params: { status: statusFilter || undefined, page, page_size: 20 },
      }).then(r => r.data.data),
  });

  const { data: detail } = useQuery({
    queryKey: ["agent/settlements", detailId],
    queryFn: () => api.get(`/agent/settlements/${detailId}`).then(r => r.data.data),
    enabled: detailId !== null,
  });

  const confirmMut = useMutation({
    mutationFn: (id: number) => api.post(`/agent/settlements/${id}/confirm`),
    onSuccess: () => {
      toast.success("结算单已确认，金额已转入余额");
      setDetailId(null);
      setConfirmingId(null);
      qc.invalidateQueries({ queryKey: ["agent/settlements"] });
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const list = data?.rows ?? [];
  const stats: Record<string, number> = data?.stats ?? {};
  const pagination = data?.pagination;

  /* ===== 导出 CSV ===== */
  const exportCSV = () => {
    const header = "\uFEFF周期,佣金总额,调整金额,结算金额,状态,生成时间\n";
    const rows = list.map((r: any) =>
      [
        `${r.period_start ?? "-"} ~ ${r.period_end ?? "-"}`,
        Number(r.total_commission ?? 0).toFixed(2),
        Number(r.adjustment_amount ?? 0).toFixed(2),
        Number(r.settled_amount ?? 0).toFixed(2),
        r.status === "pending" ? "待确认" : "已结算",
        new Date(r.created_at).toLocaleDateString("zh-CN"),
      ].join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `结算对账_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success("CSV 已开始导出");
  };

  const settlementColumns: ColumnDef<any>[] = [
    {
      key: "period", title: "结算周期",
      render: (_, record) => (
        <span style={{ fontSize: 13 }}>
          {record.period_start ?? "-"} ~ {record.period_end ?? "-"}
        </span>
      ),
    },
    {
      key: "total_commission", title: "佣金总额",
      render: (_, record) => (
        <span style={{ fontFamily: "monospace", fontWeight: 500 }}>
          ¥{Number(record.total_commission ?? 0).toFixed(2)}
        </span>
      ),
    },
    {
      key: "adjustment", title: "调整",
      render: (_, record) => {
        const adj = Number(record.adjustment_amount ?? 0);
        if (adj === 0) return <span style={{ color: "var(--color-text-secondary)" }}>-</span>;
        return (
          <span style={{ color: adj < 0 ? "var(--color-danger-text)" : "var(--color-success-text)", fontFamily: "monospace" }}>
            {adj > 0 ? "+" : ""}¥{adj.toFixed(2)}
          </span>
        );
      },
    },
    {
      key: "settled_amount", title: "结算金额",
      render: (_, record) => (
        <span style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text)" }}>
          ¥{Number(record.settled_amount ?? 0).toFixed(2)}
        </span>
      ),
    },
    {
      key: "status", title: "状态",
      render: (_, record) =>
        record.status === "pending" ? (
          <StatusBadge status="warning">待确认</StatusBadge>
        ) : (
          <StatusBadge status="success">已结算</StatusBadge>
        ),
    },
    {
      key: "created_at", title: "生成时间",
      render: (_, record) => (
        <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>
          {new Date(record.created_at).toLocaleDateString("zh-CN")}
        </span>
      ),
    },
    {
      key: "action", title: "操作",
      render: (_, record) => (
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => setDetailId(record.id)}
            style={{ ...BTN_BASE, background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)", fontSize: 12 }}
          >
            详情
          </button>
          {record.status === "pending" && (
            <button
              onClick={() => setConfirmingId(record.id)}
              style={{ ...BTN_BASE, background: "var(--color-primary)", color: "#fff", fontSize: 12 }}
            >
              确认
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        结算对账
        <HelpIcon text="结算对账模块：查看每个结算周期的佣金账单，可查看明细和导出 CSV。确认后金额转入余额。" level="page" />
      </h2>
      <p style={{ color: "var(--color-text-secondary)", marginTop: 0, marginBottom: 16, fontSize: 13 }}>
        佣金结算账单 · 确认后金额转入余额
      </p>

      {/* 统计卡片 — 对齐 agent-consumption.html stats-grid */}
      {stats && Object.keys(stats).length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          <StatCard label="待确认" value={stats.pending ?? 0} color="var(--color-warning-text)" subtitle="笔" />
          <StatCard label="已结算" value={stats.settled ?? 0} color="var(--color-success-text)" subtitle="笔" />
          <StatCard label="本月佣金" value={`¥${Number(stats.month_commission ?? 0).toFixed(2)}`} color="var(--color-primary)" subtitle="累计" />
          <StatCard label="累计结算" value={`¥${Number(stats.total_settled ?? 0).toFixed(2)}`} color="var(--color-text)" subtitle="总额" />
        </div>
      )}

      {/* 筛选 + 操作栏 — 对齐 agent-consumption.html filter-bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>筛选：</span>
        {[
          { key: "", label: "全部" },
          { key: "pending", label: "待确认" },
          { key: "settled", label: "已结算" },
        ].map(t => (
          <button key={t.key}
            onClick={() => { setStatusFilter(t.key); setPage(1); }}
            style={{
              padding: "6px 16px", borderRadius: 6, border: "1px solid",
              borderColor: statusFilter === t.key ? "var(--color-primary)" : "var(--color-border)",
              background: statusFilter === t.key ? "var(--color-primary)" : "#fff",
              color: statusFilter === t.key ? "#fff" : "var(--color-text-secondary)",
              fontSize: 13, cursor: "pointer", transition: ".15s",
            }}
          >
            {t.label}
          </button>
        ))}
        <button onClick={() => { setStatusFilter(""); setPage(1); }}
          style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid var(--color-border)", background: "#fff", fontSize: 12, cursor: "pointer", color: "var(--color-text-secondary)" }}>
          重置
        </button>
        <div style={{ marginLeft: "auto" }}>
          <button onClick={exportCSV}
            style={{ height: 32, padding: "0 14px", borderRadius: 6, border: "1px solid var(--color-border)", background: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            📥 导出 CSV
          </button>
        </div>
      </div>

      {/* 表格 */}
      {isLoading && !data ? (
        <SkeletonGroup lines={5} />
      ) : list.length === 0 ? (
        <EmptyState icon="📊" title="暂无结算数据" description="当前没有结算记录" />
      ) : (
        <>
          <Table columns={settlementColumns} dataSource={list} loading={isLoading} emptyText="暂无数据" />
          {pagination && (
            <div style={{ marginTop: 16 }}>
              <Pagination
                current={pagination.page}
                total={pagination.total}
                pageSize={20}
                onChange={setPage}
              />
            </div>
          )}
        </>
      )}

      {/* ===== 详情弹窗 ===== */}
      <Modal open={detailId !== null && !!detail} onClose={() => setDetailId(null)}
        title={`结算单 #${detail?.settlement?.id ?? ""}`} width={540}>
        {detail && (
          <div>
            {/* 基本信息 — 对齐原型 detail 视图 */}
            <div style={{ background: "var(--color-bg)", borderRadius: 8, padding: 16, marginBottom: 16, fontSize: 13 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)", marginBottom: 12 }}>基本信息</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", color: "var(--color-text)" }}>
                <Row label="周期">{detail.cycle?.period_start ?? "-"} ~ {detail.cycle?.period_end ?? "-"}</Row>
                <Row label="周期状态">{statusLabel(detail.cycle?.status)}</Row>
                <Row label="佣金总额">¥{Number(detail.settlement.total_commission ?? 0).toFixed(2)}</Row>
                <Row label="调整金额">
                  {Number(detail.settlement.adjustment_amount ?? 0) !== 0
                    ? `¥${Number(detail.settlement.adjustment_amount).toFixed(2)}`
                    : "无"}
                </Row>
                {detail.settlement.adjustment_reason && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <span style={{ color: "var(--color-text-secondary)" }}>调整原因：</span>{detail.settlement.adjustment_reason}
                  </div>
                )}
                <div style={{ fontWeight: 600, gridColumn: "1 / -1", paddingTop: 4 }}>
                  结算金额：¥{Number(detail.settlement.settled_amount ?? 0).toFixed(2)} · {statusLabel(detail.settlement.status)}
                </div>
              </div>
            </div>

            {/* 操作日志 */}
            {detail.logs && detail.logs.length > 0 && (
              <div style={{ fontSize: 13, marginBottom: 16 }}>
                <div style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: 8 }}>操作日志</div>
                {detail.logs.map((log: any) => (
                  <div key={log.id} style={{
                    display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--color-divider-light)",
                    fontSize: 12, color: "var(--color-text)",
                  }}>
                    <span style={{ color: actionColor(log.action), fontWeight: 500, minWidth: 70 }}>
                      {actionLabel(log.action)}
                    </span>
                    <span style={{ flex: 1 }}>{log.detail ?? ""}</span>
                    <span style={{ color: "var(--color-text-secondary)" }}>
                      {new Date(log.created_at).toLocaleString("zh-CN")}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", borderTop: "1px solid var(--color-divider)", paddingTop: 16 }}>
              <button onClick={() => setDetailId(null)}
                style={{ ...BTN_BASE, background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>
                关闭
              </button>
              {detail.settlement.status === "pending" && (
                <button onClick={() => { setConfirmingId(detail.settlement.id); setDetailId(null); }}
                  style={{ ...BTN_BASE, background: "var(--color-primary)", color: "#fff" }}>
                  确认结算
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ===== 确认弹窗 ===== */}
      <Modal open={confirmingId !== null} onClose={() => setConfirmingId(null)} title="确认结算单">
        <p style={{ color: "var(--color-text)", fontSize: 14, lineHeight: 1.6 }}>
          确认后该结算单金额将自动转入您的账号余额。
          <strong style={{ color: "var(--color-danger-text)" }}> 此操作不可撤销。</strong>
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={() => setConfirmingId(null)}
            style={{ ...BTN_BASE, background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>
            取消
          </button>
          <button onClick={() => confirmMut.mutate(confirmingId!)}
            disabled={confirmMut.isPending}
            style={{ ...BTN_BASE, background: "var(--color-primary)", color: "#fff", opacity: confirmMut.isPending ? 0.6 : 1 }}>
            {confirmMut.isPending ? "确认中..." : "确认结算"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ===== 子组件 ===== */
function StatCard({ label, value, subtitle, color }: {
  label: string; value: string | number; subtitle?: string; color?: string;
}) {
  return (
    <div style={{
      background: "var(--color-panel)", borderRadius: "var(--radius-lg)",
      padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,.06)",
    }}>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: color || "var(--color-text)" }}>{value}</div>
      {subtitle && <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>{label}</span>
      <span style={{ color: "var(--color-text)" }}>{children}</span>
    </>
  );
}

function actionLabel(action: string): string {
  const m: Record<string, string> = { generate: "生成", confirm: "确认", auto_confirm: "自动确认", adjust: "调整" };
  return m[action] ?? action;
}
function actionColor(action: string): string {
  const m: Record<string, string> = { generate: "#64748b", confirm: "#2563eb", auto_confirm: "#10b981", adjust: "#f59e0b" };
  return m[action] ?? "#64748b";
}
function statusLabel(s: string): string {
  const m: Record<string, string> = { open: "开启", closed: "已关账", settled: "已结算", pending: "待确认" };
  return m[s] ?? s;
}
