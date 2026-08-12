import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { PageHeader, Panel, Tag, Table, Modal, SkeletonGroup, EmptyState, useToast } from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

/** 结账管理 · 月度财务锁定（原型 Tab4 重建） */

interface CloseStatus {
  period: string;
  status: "open" | "locked" | "unlocked";
  status_label: string;
  record: PeriodRow | null;
}

interface PeriodRow {
  id: number;
  period: string;
  status: string;
  status_label: string;
  income_total: number;
  expense_total: number;
  gross_profit: number;
  gross_margin: number;
  voucher_no: string | null;
  unlocked_reason: string | null;
  relock_at: string | null;
  locked_at: string | null;
}

/** 元 → ¥ 金额 */
function fmtAmount(n: number): string {
  return `¥${n.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function statusTag(status: string): { type: "green" | "orange" | "gray" | "blue"; label: string } {
  if (status === "locked") return { type: "green", label: "已锁账" };
  if (status === "unlocked") return { type: "orange", label: "临时解锁" };
  return { type: "gray", label: "未结账" };
}

export default function AdminClosePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unlock, setUnlock] = useState<{ period: string; reason: string } | null>(null);

  const statusQ = useQuery({
    queryKey: ["finance-close-status"],
    queryFn: async () => (await api.get<{ data: CloseStatus }>("/admin/finance/close/status")).data.data,
  });
  const histQ = useQuery({
    queryKey: ["finance-close-hist"],
    queryFn: async () => (await api.get<{ data: { list: PeriodRow[] } }>("/admin/finance/close/history")).data.data,
  });

  const closeMut = useMutation({
    mutationFn: async (period: string) => (await api.post("/admin/finance/close/execute", { period })).data,
    onSuccess: (d: any) => {
      toast.success(d?.data?.message ?? "结账完成");
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["finance-close-status"] });
      qc.invalidateQueries({ queryKey: ["finance-close-hist"] });
    },
    onError: (e: any) => {
      toast.error(extractError(e));
      setConfirmOpen(false);
    },
  });

  const unlockMut = useMutation({
    mutationFn: async () => (await api.post(`/admin/finance/close/${unlock?.period}/unlock`, { reason: unlock?.reason })).data,
    onSuccess: (d: any) => {
      toast.success(d?.data?.message ?? "已解锁");
      setUnlock(null);
      qc.invalidateQueries({ queryKey: ["finance-close-status"] });
      qc.invalidateQueries({ queryKey: ["finance-close-hist"] });
    },
    onError: (e: any) => {
      toast.error(extractError(e));
      setUnlock(null);
    },
  });

  const cur = statusQ.data;
  const list = histQ.data?.list ?? [];

  const columns: ColumnDef<PeriodRow>[] = [
    { key: "period", title: "期间", dataIndex: "period", render: (v) => <strong>{String(v)}</strong> },
    { key: "income", title: "收入", dataIndex: "income_total", render: (v) => fmtAmount(Number(v)) },
    { key: "expense", title: "支出", dataIndex: "expense_total", render: (v) => fmtAmount(Number(v)) },
    { key: "profit", title: "毛利", dataIndex: "gross_profit", render: (v) => <span className="c3-rank-amount">{fmtAmount(Number(v))}</span> },
    { key: "margin", title: "毛利率", dataIndex: "gross_margin", render: (v) => `${Number(v)}%` },
    { key: "voucher", title: "结转凭证", dataIndex: "voucher_no", render: (v) => (v ? <code>{String(v)}</code> : "—") },
    {
      key: "status",
      title: "状态",
      dataIndex: "status",
      render: (_, r) => <Tag type={statusTag(r.status).type}>{statusTag(r.status).label}</Tag>,
    },
    {
      key: "action",
      title: "操作",
      dataIndex: "status",
      render: (_, r) =>
        r.status === "locked" ? (
          <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => setUnlock({ period: r.period, reason: "" })}>
            临时解锁（超管）
          </button>
        ) : (
          <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>—</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader title="结账管理" help="每月财务结账：锁定该月数据并生成结转凭证。已锁账月份不可修改；超管可临时解锁（1 小时后自动重锁）。" />

      {/* 本期状态 */}
      <Panel title="本期状态">
        {statusQ.isLoading ? (
          <SkeletonGroup lines={2} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>本期 · {cur?.period ?? "—"}</div>
              <div style={{ color: "var(--color-text-muted)", marginTop: 6 }}>
                结账状态：<Tag type={statusTag(cur?.status ?? "open").type}>{cur?.status_label ?? "未结账"}</Tag>
              </div>
              {cur?.status === "unlocked" && cur?.record?.relock_at && (
                <div style={{ color: "var(--color-warning)", fontSize: 13, marginTop: 4 }}>
                  临时解锁中，将于 {new Date(cur.record.relock_at).toLocaleString()} 自动重锁
                </div>
              )}
              {cur?.record?.unlocked_reason && (
                <div style={{ color: "var(--color-text-muted)", fontSize: 13, marginTop: 4 }}>解锁原因：{cur.record.unlocked_reason}</div>
              )}
              {cur?.record?.voucher_no && (
                <div style={{ color: "var(--color-text-muted)", fontSize: 13, marginTop: 4 }}>结转凭证：{cur.record.voucher_no}</div>
              )}
            </div>
            {cur?.status !== "locked" && (
              <button type="button" className="c3-btn c3-btn--primary" onClick={() => setConfirmOpen(true)}>
                开始结账
              </button>
            )}
          </div>
        )}
      </Panel>

      {/* 历史结账记录 */}
      <div style={{ marginTop: 16 }}>
        <Panel title="📋 历史结账记录" help="最近 24 期结账结果。">
        {histQ.isLoading ? (
          <SkeletonGroup lines={6} />
        ) : list.length === 0 ? (
          <EmptyState title="暂无结账记录" description="尚未对任何月份执行结账" />
        ) : (
          <Table columns={columns} dataSource={list} rowKey={(r) => String(r.id)} />
        )}
        </Panel>
      </div>

      {/* 结账确认 */}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="结账确认" width={480}>
        <div style={{ color: "var(--color-text)", lineHeight: 1.7 }}>
          确认锁定 <strong>{cur?.period}</strong> 月的所有财务数据？锁定后该月充值/消费/退款/佣金将不可修改，并自动生成结转凭证。
        </div>
        <div style={{ marginTop: 12, padding: 12, background: "var(--color-bg-warning, #fef3c7)", borderRadius: 8, fontSize: 13, color: "var(--color-warning)" }}>
          ⚠️ 结账前请确认所有退款、提现、佣金已完成处理。
        </div>
        <div className="c3-btn-group" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="c3-btn c3-btn--default" onClick={() => setConfirmOpen(false)}>
            取消
          </button>
          <button
            type="button"
            className="c3-btn c3-btn--primary"
            disabled={closeMut.isPending}
            onClick={() => closeMut.mutate(cur?.period ?? new Date().toISOString().slice(0, 7))}
          >
            {closeMut.isPending ? "结账中..." : "确认结账"}
          </button>
        </div>
      </Modal>

      {/* 临时解锁 */}
      <Modal open={!!unlock} onClose={() => setUnlock(null)} title={`临时解锁 · ${unlock?.period ?? ""}`} width={440}>
        <div style={{ fontSize: 13, color: "var(--color-warning)", background: "var(--color-bg-warning, #fef3c7)", padding: 10, borderRadius: 8, marginBottom: 12 }}>
          仅超管可操作，解锁 1 小时后自动重新锁定。
        </div>
        <div className="c3-form-group">
          <label>解锁理由（必填）</label>
          <textarea
            rows={3}
            value={unlock?.reason ?? ""}
            onChange={(e) => setUnlock((u) => (u ? { ...u, reason: e.target.value } : u))}
            placeholder="填写解锁理由"
            style={{ resize: "vertical", fontFamily: "inherit" }}
          />
        </div>
        <div className="c3-btn-group" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="c3-btn c3-btn--default" onClick={() => setUnlock(null)}>
            取消
          </button>
          <button
            type="button"
            className="c3-btn c3-btn--primary"
            disabled={unlockMut.isPending || !unlock?.reason}
            onClick={() => unlockMut.mutate()}
          >
            {unlockMut.isPending ? "解锁中..." : "确认解锁"}
          </button>
        </div>
      </Modal>
    </>
  );
}
