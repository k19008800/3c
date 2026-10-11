import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  PageHeader,
  Panel,
  Tag,
  Table,
  SkeletonGroup,
  EmptyState,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";
import { api, extractError } from "../../lib/api";

/**
 * 供应商账单核对 — PRD §9.6.3/ §25.1.8
 *
 * 后端契约（api/src/routes/admin-vendor-settlements.ts）：
 *   GET /admin/supplier-bill-match/list?period&supplier_id
 *        → { data: { period, items: [{ supplier_id, supplier_name,
 *                                    platform_amount, bill_amount,
 *                                    diff, diff_percent, status, call_count }] } }
 *        只读概览：列出当月各供应商的平台应付金额（bill_amount 恒为 0，未录入账单）
 *   GET /admin/supplier-bill-match?period&supplier_id&bill_amount
 *        → { data: BillMatchResult } 单供应商核对：财务填入供应商实际账单金额后调此端点
 *
 * 工作流：选周期 → 看全量平台应付 → 逐行填入供应商账单金额 → 点「核对」得差异 → 标记处理。
 *
 * 注意：后端响应字段是 **snake_case**（本端点返回对象字面量，非 Drizzle camelCase），
 * 与 /admin/alerts 那类直接返回 drizzle 行的端点不同。
 */

/** pending = 尚未录入账单金额（列表初始态）；其余三态来自单供应商核对端点 */
type MatchStatus = "matched" | "diff" | "missing" | "pending";

interface MatchRow {
  supplier_id: number;
  supplier_name: string;
  platform_amount: number;
  bill_amount: number;
  diff: number;
  diff_percent: number | null;
  status: MatchStatus;
  call_count: number;
}

/** 无法归因到供应商的成本（mock 回退 / 历史脏数据） */
interface Unattributed {
  amount: number;
  callCount: number;
}

/** 前端本地维护的对账结论（不落库，与结算单的确认/争议流程分离） */
type RowAction = "confirmed" | "flagged" | "ignored" | null;

/* ───────── 展示辅助 ───────── */

const fmt = (n: number) => n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString("zh-CN");

const STATUS_META: Record<MatchStatus, { label: string; type: "green" | "orange" | "red" | "gray" }> = {
  pending: { label: "待核对", type: "gray" },
  matched: { label: "完全匹配", type: "green" },
  diff: { label: "存在差异", type: "orange" },
  missing: { label: "平台无记录", type: "red" },
};

/** 当前月份 YYYY-MM（时区无关，避免 toISOString 的 UTC 偏移问题） */
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 上一个月 YYYY-MM */
function prevMonth(period: string): string {
  const parts = period.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isInteger(y) || !Number.isInteger(m)) return currentMonth();
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* ───────── 页面 ───────── */

export default function AdminSupplierBillMatchPage() {
  const { toast } = useToast();

  const [period, setPeriod] = useState(currentMonth());
  const [supplierId, setSupplierId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | MatchStatus>("");
  /** 财务已录入的账单金额：supplier_id → 金额字符串（保留用户原始输入，未核对前不解析） */
  const [billInputs, setBillInputs] = useState<Record<number, string>>({});
  /** 已核对结果：supplier_id → 单供应商核对端点返回 */
  const [checked, setChecked] = useState<Record<number, MatchRow>>({});
  const [actions, setActions] = useState<Record<number, RowAction>>({});

  /* ---- 概览列表 ---- */
  const listQ = useQuery({
    queryKey: ["supplier-bill-match-list", period, supplierId],
    queryFn: async () => {
      const p = new URLSearchParams({ period });
      if (supplierId) p.set("supplier_id", supplierId);
      return (
        await api.get<{
          data: { period: string; items: MatchRow[]; unattributed: Unattributed };
        }>(`/admin/supplier-bill-match/list?${p}`)
      ).data.data;
    },
  });

  /* ---- 单供应商核对（填入账单金额后调用） ---- */
  const checkMut = useMutation({
    mutationFn: async (v: { supplierId: number; billAmount: number }) =>
      (
        await api.get<{ data: MatchRow }>(
          `/admin/supplier-bill-match?period=${period}&supplier_id=${v.supplierId}&bill_amount=${v.billAmount}`,
        )
      ).data.data,
    onSuccess: (res, v) => {
      // 用核对结果覆盖该行的金额字段；供应商名/调用次数保留概览列表的值（后端单查不返回它们）
      setChecked((prev) => ({
        ...prev,
        [v.supplierId]: {
          ...res,
          supplier_id: v.supplierId,
          supplier_name: prev[v.supplierId]?.supplier_name ?? "",
          call_count: prev[v.supplierId]?.call_count ?? 0,
        },
      }));
      toast.success("核对完成");
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const rows = listQ.data?.items ?? [];
  const unattributed = listQ.data?.unattributed ?? { amount: 0, callCount: 0 };

  /** 可归因成本占该月总成本的比例（%），用于覆盖率告警 */
  const coverage = useMemo(() => {
    const attributed = rows.reduce((s, r) => s + r.platform_amount, 0);
    const total = attributed + unattributed.amount;
    if (total <= 0) return null;
    return { attributed, total, percent: (attributed / total) * 100 };
  }, [rows, unattributed]);

  /** 合并概览行与已核对结果，并按状态筛选 */
  const displayRows = useMemo(() => {
    const merged = rows.map((r) => {
      const c = checked[r.supplier_id];
      return c ? { ...r, ...c, supplier_name: r.supplier_name, call_count: r.call_count } : r;
    });
    return statusFilter ? merged.filter((r) => r.status === statusFilter) : merged;
  }, [rows, checked, statusFilter]);

  /* ---- 汇总（以已核对结果为准，未核对行的 bill 按 0 计） ---- */
  const summary = useMemo(() => {
    const platformTotal = displayRows.reduce((s, r) => s + r.platform_amount, 0);
    const billTotal = displayRows.reduce((s, r) => s + r.bill_amount, 0);
    const diffTotal = Math.round((billTotal - platformTotal) * 10000) / 10000;
    const checkedCount = displayRows.filter((r) => r.bill_amount > 0 || r.status !== "diff").length;
    const diffCount = displayRows.filter((r) => r.status !== "matched").length;
    return {
      platformTotal,
      billTotal,
      diffTotal,
      checkedCount,
      diffCount,
      matchRate: platformTotal > 0 ? Math.round((1 - Math.abs(diffTotal) / platformTotal) * 10000) / 100 : null,
      supplierCount: displayRows.length,
      callTotal: displayRows.reduce((s, r) => s + r.call_count, 0),
    };
  }, [displayRows]);

  /* ---- 行操作 ---- */
  function setBill(supplierId: number, val: string) {
    setBillInputs((prev) => ({ ...prev, [supplierId]: val }));
  }

  function doCheck(row: MatchRow) {
    const raw = billInputs[row.supplier_id];
    if (raw === undefined || raw.trim() === "") {
      toast.error("请先填入该供应商的账单金额");
      return;
    }
    const amt = Number(raw);
    if (!Number.isFinite(amt) || amt < 0) {
      toast.error("账单金额须为非负数字");
      return;
    }
    checkMut.mutate({ supplierId: row.supplier_id, billAmount: amt });
  }

  function handleAction(id: number, action: Exclude<RowAction, null>) {
    setActions((prev) => ({ ...prev, [id]: action }));
    toast.success({ confirmed: "已确认", flagged: "已标记差异", ignored: "已忽略" }[action]);
  }

  function resetInputs() {
    setBillInputs({});
    setChecked({});
    toast.info("已清空本轮录入");
  }

  /* ---- 列定义 ---- */
  const cols: ColumnDef<MatchRow>[] = [
    {
      key: "supplier_name",
      title: "供应商",
      dataIndex: "supplier_name",
      render: (v, r) => (
        <div style={{ whiteSpace: "normal", overflow: "visible", textOverflow: "clip" }}>
          <div style={{ fontWeight: 500 }}>{String(v ?? `供应商#${r.supplier_id}`)}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
            ID {r.supplier_id} · 平台调用 {fmtInt(r.call_count)} 次
          </div>
        </div>
      ),
    },
    {
      key: "platform_amount",
      title: "平台应付",
      dataIndex: "platform_amount",
      width: "150px",
      render: (v) => <strong>¥{fmt(Number(v ?? 0))}</strong>,
    },
    {
      key: "bill_amount",
      title: "供应商账单金额",
      width: "180px",
      render: (_v, r) => {
        const c = checked[r.supplier_id];
        const inputVal = billInputs[r.supplier_id] ?? (c ? String(c.bill_amount) : "");
        return (
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="填入账单金额"
            value={inputVal}
            onChange={(e) => setBill(r.supplier_id, e.target.value)}
            style={{
              width: "100%",
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--color-border)",
              fontSize: 13,
            }}
          />
        );
      },
    },
    {
      key: "diff",
      title: "差异",
      width: "160px",
      render: (_v, r) => {
        const c = checked[r.supplier_id];
        if (c) {
          const diff = c.diff;
          return (
            <span>
              <strong style={{ color: Math.abs(diff) <= 0.0001 ? "var(--color-success-text)" : "var(--color-danger-text)" }}>
                {diff >= 0 ? "+" : ""}
                {fmt(diff)}
              </strong>
              {c.diff_percent !== null && (
                <span style={{ color: "var(--color-text-muted)", fontSize: 12, marginLeft: 6 }}>
                  {c.diff_percent > 0 ? "+" : ""}
                  {c.diff_percent}%
                </span>
              )}
            </span>
          );
        }
        return <span style={{ color: "var(--color-text-muted)" }}>未核对</span>;
      },
    },
    {
      key: "status",
      title: "状态",
      dataIndex: "status",
      width: "110px",
      render: (v, r) => {
        // 未核对时状态无意义（后端恒返回 diff），显示为「待核对」
        if (!checked[r.supplier_id]) return <Tag type="gray">待核对</Tag>;
        const meta = STATUS_META[v as MatchStatus];
        return <Tag type={meta.type}>{meta.label}</Tag>;
      },
    },
    {
      key: "ops",
      title: "操作",
      width: "300px",
      render: (_v, r) => {
        const action = actions[r.supplier_id];
        if (action) {
          return (
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              {({ confirmed: "已确认", flagged: "已标记", ignored: "已忽略" } as Record<string, string>)[action]}
            </span>
          );
        }
        const isChecked = !!checked[r.supplier_id];
        return (
          <div style={{ display: "flex", gap: 8, flexWrap: "nowrap" }}>
            <button
              type="button"
              className="c3-btn c3-btn--primary c3-btn--sm"
              disabled={checkMut.isPending}
              onClick={() => doCheck(r)}
            >
              核对
            </button>
            {/* 未核对前不允许标记处理：避免在无差异数据上做结论 */}
            <button
              type="button"
              className="c3-btn c3-btn--default c3-btn--sm"
              disabled={!isChecked}
              title={isChecked ? undefined : "请先核对"}
              onClick={() => handleAction(r.supplier_id, "confirmed")}
            >
              确认
            </button>
            <button
              type="button"
              className="c3-btn c3-btn--default c3-btn--sm"
              disabled={!isChecked}
              title={isChecked ? undefined : "请先核对"}
              onClick={() => handleAction(r.supplier_id, "flagged")}
            >
              标记
            </button>
            <button
              type="button"
              className="c3-btn c3-btn--default c3-btn--sm"
              disabled={!isChecked}
              title={isChecked ? undefined : "请先核对"}
              onClick={() => handleAction(r.supplier_id, "ignored")}
            >
              忽略
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="供应商账单核对"
        help="按月对比各供应商的平台应付金额与其提供的账单金额，定位成本差异。账单金额需人工录入平台，系统只做差异计算，不落库。"
      />

      {/*
       * 成本归属覆盖率告警。
       * mock 回退路径（settle.ts 中 channel 为 null）写入的消费记录没有供应商归属，
       * 这部分成本不进入任何供应商行。若不显式提示，运营会把下方「平台应付合计」
       * 误读成该月全部成本，导致少付供应商。
       */}
      {coverage && coverage.percent < 99.9 && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            borderRadius: 4,
            border: "1px solid var(--color-warning-border, #f0a020)",
            background: "var(--color-warning-bg, #fff8e6)",
            color: "var(--color-text, #1f2329)",
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "var(--color-warning-text, #b7791f)" }}>成本归属覆盖 {coverage.percent.toFixed(1)}%</strong>
          <div style={{ marginTop: 4 }}>
            {period} 共 ¥{fmt(coverage.total)} 成本，其中{" "}
            <strong>¥{fmt(unattributed.amount)}</strong>（{fmtInt(unattributed.callCount)} 次调用）无法归因到任何供应商，
            不计入下方任何一行。下方「平台应付合计 ¥{fmt(coverage.attributed)}」仅为可归因部分，
            <strong>不能直接作为付款依据</strong>。
          </div>
          <div style={{ marginTop: 4, color: "var(--color-text-secondary, #646a73)" }}>
            成因：调用走mock 回退渠道时未绑定供应商（见 api/src/services/billing/settle.ts）。
            需先修复归属链路或人工确认这部分成本归属，再进行付款。
          </div>
        </div>
      )}

      {/* 概览 */}
      <div className="c3-stat-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="c3-stat-card">
          <div className="c3-stat-card__label">平台应付合计</div>
          <div className="c3-stat-card__value">
            {listQ.isLoading ? "—" : `¥${fmt(summary.platformTotal)}`}
          </div>
          <div className="c3-stat-card__sub">
            {period} · {summary.supplierCount} 家供应商 · {fmtInt(summary.callTotal)} 次调用
            {coverage && coverage.percent < 99.9 ? "（仅可归因部分）" : ""}
          </div>
        </div>
        <div className="c3-stat-card">
          <div className="c3-stat-card__label">已录入账单合计</div>
          <div className="c3-stat-card__value">
            {listQ.isLoading ? "—" : `¥${fmt(summary.billTotal)}`}
          </div>
          <div className="c3-stat-card__sub">已核对 {summary.checkedCount} / {summary.supplierCount} 家</div>
        </div>
        <div className="c3-stat-card">
          <div className="c3-stat-card__label">差异金额</div>
          <div
            className="c3-stat-card__value"
            style={{ color: Math.abs(summary.diffTotal) <= 0.0001 ? "var(--color-success-text)" : "var(--color-danger-text)" }}
          >
            {listQ.isLoading ? "—" : `${summary.diffTotal >= 0 ? "+" : ""}¥${fmt(summary.diffTotal)}`}
          </div>
          <div className="c3-stat-card__sub">账单金额 − 平台应付</div>
        </div>
        <div className="c3-stat-card">
          <div className="c3-stat-card__label">差异供应商数</div>
          <div className="c3-stat-card__value">{listQ.isLoading ? "—" : summary.diffCount}</div>
          <div className="c3-stat-card__sub">
            {summary.matchRate !== null ? `金额匹配率 ${summary.matchRate}%` : "暂无平台数据"}
          </div>
        </div>
      </div>

      {/* 筛选栏 */}
      <Panel
        title="对账单"
        help="切换周期查看当月各供应商的平台成本；「供应商账单金额」需人工填写供应商提供的账单总额，填完点「核对」计算差异。"
        extra={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select
              className="c3-select c3-select--sm"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setBillInputs({});
                setChecked({});
              }}
            >
              <option value={currentMonth()}>{currentMonth()}</option>
              <option value={prevMonth(currentMonth())}>{prevMonth(currentMonth())}</option>
            </select>
            <select
              className="c3-select c3-select--sm"
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                setBillInputs({});
                setChecked({});
              }}
            >
              <option value="">全部供应商</option>
              {rows.map((r) => (
                <option key={r.supplier_id} value={r.supplier_id}>
                  {r.supplier_name}（#{r.supplier_id}）
                </option>
              ))}
            </select>
            <select
              className="c3-select c3-select--sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "" | MatchStatus)}
            >
              <option value="">全部状态</option>
              <option value="pending">待核对</option>
              <option value="matched">完全匹配</option>
              <option value="diff">存在差异</option>
              <option value="missing">平台无记录</option>
            </select>
            <button
              type="button"
              className="c3-btn c3-btn--default c3-btn--sm"
              onClick={resetInputs}
              disabled={Object.keys(billInputs).length === 0 && Object.keys(checked).length === 0}
            >
              清空录入
            </button>
          </div>
        }
      >
        {listQ.isLoading ? (
          <SkeletonGroup lines={8} />
        ) : listQ.isError ? (
          <EmptyState title="加载失败" description={extractError(listQ.error)} />
        ) : displayRows.length === 0 ? (
          <EmptyState
            title="该周期无消费数据"
            description={`${period} 没有归属到供应商的消费记录，无法对账。可尝试切换到其他周期。`}
          />
        ) : (
          <Table columns={cols} dataSource={displayRows} rowKey="supplier_id" emptyText="暂无对账数据" />
        )}
      </Panel>
    </div>
  );
}