import { useState, useEffect, useCallback } from "react";
import HelpModal from "../../components/HelpModal";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import { apiGet, apiPost, type PaginatedResponse } from "../../services/api";

// ── API types ──

interface LedgerEntry {
  id: number;
  serial_no: string;
  type: string;
  type_label: string;
  direction: string;
  amount: number;
  balance_after: number;
  status: string;
  status_label: string;
  related_order_no: string;
  external_ref: string;
  remark: string;
  created_at: string;
  user_id: number;
}

interface FinanceAccountOverview {
  total_balance: number;
  available_balance: number;
  frozen_balance: number;
  user_recharge_total: number;
  user_consumption_total: number;
  platform_gross_profit: number;
  platform_gross_margin: number;
  settled_to_vendor: number;
  pending_vendor_settlement: number;
}

interface ReconciliationDiff {
  id: number;
  period: string;
  subject_type: string;
  subject_id: number;
  subject_name: string;
  platform_amount: number;
  counterparty_amount: number;
  diff_amount: number;
  status: string;
  status_label: string;
  created_at: string;
}

type FinanceTab = "orders" | "adjustment" | "reconciliation";

export default function AdminFinance() {
  const [tab, setTab] = useState<FinanceTab>("orders");

  // ── Ledger (orders) state ──
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerPagination, setLedgerPagination] = useState({ page: 1, page_size: 20, total: 0 });
  const [ledgerSummary, setLedgerSummary] = useState({ total_in: 0, total_out: 0, net_flow: 0 });

  // ── Accounts overview ──
  const [accounts, setAccounts] = useState<FinanceAccountOverview | null>(null);

  // ── Reconciliation ──
  const [diffs, setDiffs] = useState<ReconciliationDiff[]>([]);
  const [diffsPagination, setDiffsPagination] = useState({ page: 1, page_size: 20, total: 0 });
  const [diffsPending, setDiffsPending] = useState({ pending_count: 0, pending_amount: 0 });

  // ── Adjust modal ──
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustRemark, setAdjustRemark] = useState("");

  // ── Loading/error ──
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch ledger ──
  const fetchLedger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{
        list: LedgerEntry[];
        pagination: { page: number; page_size: number; total: number };
        summary: { total_in: number; total_out: number; net_flow: number };
      }>("/admin/finance/ledger", { page: 1, page_size: 100 });
      setLedger(data.list ?? []);
      setLedgerPagination(data.pagination);
      setLedgerSummary(data.summary);
    } catch (e: any) {
      setError(e.message ?? "加载流水失败");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch accounts ──
  const fetchAccounts = useCallback(async () => {
    try {
      const data = await apiGet<FinanceAccountOverview>("/admin/finance/accounts");
      setAccounts(data);
    } catch {
      // accounts are non-critical for the tab views
    }
  }, []);

  // ── Fetch reconciliation ──
  const fetchDiffs = useCallback(async () => {
    try {
      const data = await apiGet<{
        list: ReconciliationDiff[];
        pagination: { page: number; page_size: number; total: number };
        stats: { pending_count: number; pending_amount: number };
      }>("/admin/finance/reconciliation/differences", { page: 1, page_size: 100 });
      setDiffs(data.list ?? []);
      setDiffsPagination(data.pagination);
      setDiffsPending(data.stats);
    } catch {
      // diffs are non-critical
    }
  }, []);

  useEffect(() => {
    fetchLedger();
    fetchAccounts();
    fetchDiffs();
  }, [fetchLedger, fetchAccounts, fetchDiffs]);

  // ── Handle adjust ──
  const handleAdjust = async () => {
    if (!adjustAmount || !adjustRemark) return;
    setActionLoading(true);
    try {
      await apiPost("/admin/finance/ledger/adjust", {
        amount: Number(adjustAmount),
        remark: adjustRemark,
      });
      setAdjustOpen(false);
      setAdjustAmount("");
      setAdjustRemark("");
      await fetchLedger();
    } catch (e: any) {
      alert(e.message ?? "调账失败");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Derived stats ──
  const totalRevenue = accounts?.user_recharge_total ?? 0;
  const totalIn = ledgerSummary?.total_in ?? 0;
  const pendingCount = ledger.filter((r) => r.status === "pending").length;

  return (
    <div>
      <div className="admin-page-header">
        <h2 className="admin-page-title">
          财务管理
          <HelpModal title="财务管理">
            <p>财务管理包含收入概览、资金流水、调账功能和对账差异工作台。</p>
            <p><strong>资金流水</strong>：平台所有充值与消费记录，支持筛选和搜索。</p>
            <p><strong>调账</strong>：管理员可通过 /admin/finance/ledger/adjust 进行内部调账。</p>
            <p><strong>对账差异</strong>：查看平台与供应商对账差异记录。</p>
          </HelpModal>
        </h2>
      </div>

      {error && (
        <div className="panel" style={{ marginBottom: 12, background: "#fef2f2", borderColor: "#fecaca" }}>
          <div className="panel-body" style={{ color: "#dc2626" }}>⚠️ 加载失败: {error}</div>
        </div>
      )}

      {/* Revenue Stats — from accounts */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-label">💰 用户充值总额</div>
          <div className="stat-card-value">¥{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="stat-card-action">全部成功订单</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">📥 资金流入</div>
          <div className="stat-card-value" style={{ color: "#22c55e" }}>¥{totalIn.toFixed(2)}</div>
          <div className="stat-card-action">已完成的流入</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">⏳ 待处理笔数</div>
          <div className="stat-card-value">{pendingCount}</div>
          <div className="stat-card-action">需人工处理</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">📊 平台毛利率</div>
          <div className="stat-card-value" style={{ color: "#22c55e" }}>
            {accounts ? `${accounts.platform_gross_margin}%` : "—"}
          </div>
          <div className="stat-card-action">毛利 ¥{accounts?.platform_gross_profit.toFixed(2) ?? "—"}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="panel">
        <div className="panel-header">
          <div className="filter-tabs">
            <button className={`filter-tab${tab === "orders" ? " active" : ""}`} onClick={() => setTab("orders")}>
              🧾 资金流水
            </button>
            <button className={`filter-tab${tab === "adjustment" ? " active" : ""}`} onClick={() => setTab("adjustment")}>
              ⚖️ 调账
            </button>
            <button className={`filter-tab${tab === "reconciliation" ? " active" : ""}`} onClick={() => setTab("reconciliation")}>
              📊 对账差异
            </button>
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => setAdjustOpen(true)}>⚖️ 调账</button>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {loading && (
            <div style={{ padding: 40, textAlign: "center", color: "#888" }}>⏳ 加载中…</div>
          )}

          {!loading && tab === "orders" && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>流水号</th><th>类型</th><th>方向</th><th>金额</th><th>状态</th><th>备注</th><th>时间</th>
                </tr>
              </thead>
              <tbody>
                {ledger.length > 0 ? ledger.map((r) => (
                  <tr key={r.id}>
                    <td className="text-mono" style={{ fontSize: 11 }}>{r.serial_no}</td>
                    <td>{r.type_label}</td>
                    <td style={{ color: r.direction === "in" ? "#22c55e" : "#ef4444" }}>
                      {r.direction === "in" ? "流入" : "流出"}
                    </td>
                    <td className="text-mono" style={{ color: r.direction === "in" ? "#22c55e" : "#ef4444" }}>
                      {r.direction === "in" ? "+" : "-"}¥{r.amount.toFixed(2)}
                    </td>
                    <td>
                      <StatusBadge status={r.status === "completed" ? "success" : r.status === "reversed" ? "error" : r.status === "pending" ? "warning" : "info"}>
                        {r.status_label}
                      </StatusBadge>
                    </td>
                    <td>{r.remark ?? r.related_order_no ?? "—"}</td>
                    <td style={{ fontSize: 12 }}>{new Date(r.created_at).toLocaleString("zh-CN")}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: "#888" }}>暂无流水记录</td></tr>
                )}
              </tbody>
            </table>
          )}

          {!loading && tab === "adjustment" && (
            <div style={{ padding: 40, textAlign: "center" }}>
              <p style={{ color: "#888", marginBottom: 16 }}>
                调账功能通过 POST /api/v1/admin/finance/ledger/adjust 实现。<br />
                点击右上角「调账」按钮或下方按钮发起调账。
              </p>
              <button className="btn btn-primary" onClick={() => setAdjustOpen(true)}>⚖️ 发起调账</button>
            </div>
          )}

          {!loading && tab === "reconciliation" && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>周期</th><th>主体</th><th>平台金额</th><th>对方金额</th><th>差异</th><th>状态</th>
                </tr>
              </thead>
              <tbody>
                {diffs.length > 0 ? diffs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.period}</td>
                    <td>{r.subject_name || `#${r.subject_id}`}</td>
                    <td className="text-mono">¥{r.platform_amount.toFixed(2)}</td>
                    <td className="text-mono">¥{r.counterparty_amount.toFixed(2)}</td>
                    <td className="text-mono" style={{ color: r.diff_amount !== 0 ? "#ef4444" : "#22c55e" }}>
                      {r.diff_amount > 0 ? "+" : ""}¥{r.diff_amount.toFixed(2)}
                    </td>
                    <td>
                      <StatusBadge status={r.status === "pending" ? "warning" : r.status === "verified" ? "success" : "info"}>
                        {r.status_label}
                      </StatusBadge>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "#888" }}>
                    暂无对账差异
                    {diffsPending.pending_count > 0 && `（待处理: ${diffsPending.pending_count} 条）`}
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Adjust Modal */}
      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="内部调账"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setAdjustOpen(false)}>取消</button>
            <button
              className="btn btn-primary"
              onClick={handleAdjust}
              disabled={actionLoading || !adjustAmount || !adjustRemark}
            >
              {actionLoading ? "提交中…" : "确认调账"}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">调整金额 (正数为加款，负数为扣款)</label>
          <input
            className="form-input"
            type="number"
            step="0.01"
            placeholder="例如: 100 或 -50"
            value={adjustAmount}
            onChange={(e) => setAdjustAmount(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">调整原因（必填）</label>
          <textarea
            className="form-textarea"
            placeholder="请填写调整原因"
            value={adjustRemark}
            onChange={(e) => setAdjustRemark(e.target.value)}
          />
        </div>
        <div style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
          POST /api/v1/admin/finance/ledger/adjust — 调用后端 internalAdjust 服务
        </div>
      </Modal>
    </div>
  );
}
