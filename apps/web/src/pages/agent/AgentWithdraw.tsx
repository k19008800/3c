import { useEffect, useState } from "react";
import AgentLayout from "../../components/AgentLayout";
import HelpModal from "../../components/HelpModal";
import Modal from "../../components/Modal";
import {
  agentApi,
  type WithdrawSummary,
  type WithdrawalRecord,
} from "../../services/agent";

// ── Helpers ──
const STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending_first_review: { label: "待初审", className: "badge-warning" },
  pending_second_review: { label: "待复审", className: "badge-warning" },
  processing: { label: "打款中", className: "badge-warning" },
  completed: { label: "已到账", className: "badge-success" },
  rejected: { label: "已驳回", className: "badge-danger" },
};

function statusBadge(s: string) {
  return STATUS_MAP[s] ?? { label: s, className: "badge-info" };
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "-";
  return iso.slice(0, 10);
}

interface WithdrawForm {
  amount: string;
}

const EMPTY_FORM: WithdrawForm = { amount: "" };

// ── Component ──
export default function AgentWithdraw() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<WithdrawSummary | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [statusFilter, setStatusFilter] = useState<string>("全部");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<WithdrawForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const pageSize = 5;

  // ── Fetch data from API ──
  const fetchData = async () => {
    setLoading(true);
    setError(null);

    const [summaryRes, withdrawalsRes] = await Promise.all([
      agentApi.getWithdrawSummary(),
      agentApi.getWithdrawals({ page: 1, page_size: 100 }),
    ]);

    if (summaryRes.error) {
      if (summaryRes.error.includes("非代理商") || summaryRes.error.includes("NOT_AGENT")) {
        setError("您尚未开通代理商权限，请联系管理员。");
      } else {
        setError(summaryRes.error);
      }
      setLoading(false);
      return;
    }

    setSummary(summaryRes.data);

    if (withdrawalsRes.data) {
      setWithdrawals(withdrawalsRes.data.list);
      setPagination({
        page: withdrawalsRes.data.pagination.page,
        pageSize: withdrawalsRes.data.pagination.page_size,
        total: withdrawalsRes.data.pagination.total,
      });
    }

    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    fetchData().then(() => { cancelled; });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Filter ──
  let filtered = withdrawals;
  if (statusFilter !== "全部") {
    filtered = filtered.filter(
      (r) => r.status === statusFilter,
    );
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageData = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // ── Withdraw ──
  const balance = summary?.withdrawable ?? 0;
  const minWithdraw = summary?.min_withdraw ?? 100;

  const amountNum = parseFloat(form.amount);
  const isValidAmount = !isNaN(amountNum) && amountNum >= minWithdraw && amountNum <= balance;

  const handleSubmit = async () => {
    if (!isValidAmount) {
      alert(`提现金额需在 ¥${minWithdraw} ~ ¥${balance.toLocaleString()} 之间`);
      return;
    }
    setSubmitting(true);
    const res = await agentApi.submitWithdraw(amountNum);
    setSubmitting(false);

    if (res.error) {
      alert(`提现失败: ${res.error}`);
      return;
    }

    alert(`提现申请已提交：¥${amountNum.toLocaleString()}\n\n单号: ${res.data?.withdrawal_no}\n状态: ${res.data?.status_label}`);
    setForm(EMPTY_FORM);
    setShowForm(false);

    // Refresh
    await fetchData();
  };

  return (
    <AgentLayout>
      <h1 className="page-title">
        🏦 提现管理
        <HelpModal title="提现管理">
          <p>管理您的佣金提现。查看可提现余额，提交提现申请，跟踪提现记录。</p>
          <p style={{ marginTop: 8 }}>
            最低提现金额 ¥{minWithdraw}。提现申请提交后 1-3 个工作日到账。
          </p>
        </HelpModal>
      </h1>
      <p className="page-subtitle">管理佣金提现，查看提现记录</p>

      {/* Loading / Error */}
      {loading && (
        <div className="panel" style={{ textAlign: "center", padding: 32 }}>
          ⏳ 加载中...
        </div>
      )}

      {error && (
        <div className="panel" style={{ textAlign: "center", padding: 32, color: "var(--color-danger-text)" }}>
          ❌ {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Balance Card */}
          <div className="panel mb-20">
            <div className="panel-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="text-sm text-muted" style={{ marginBottom: 4 }}>可提现余额</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: "var(--color-primary)" }}>
                  ¥{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-sm text-muted" style={{ marginTop: 4 }}>
                  最低提现 ¥{minWithdraw}
                  {!summary?.account_set && (
                    <span style={{ color: "var(--color-danger-text)", marginLeft: 8 }}>
                      ⚠️ 请先设置收款账户
                    </span>
                  )}
                </div>
              </div>
              <button
                className="btn btn-primary"
                style={{ fontSize: 16, padding: "12px 28px" }}
                onClick={() => setShowForm(true)}
                disabled={!summary?.account_set}
              >
                💳 申请提现
              </button>
            </div>
          </div>

          {/* Withdraw Records */}
          <div className="panel">
            <div className="panel-header">
              <span>提现记录</span>
              <div className="filter-tabs">
                {["全部", "completed", "pending_first_review", "pending_second_review", "processing", "rejected"].map((s) => (
                  <button
                    key={s}
                    className={`filter-tab${statusFilter === s ? " active" : ""}`}
                    onClick={() => { setStatusFilter(s); setPage(1); }}
                  >
                    {s === "全部" ? "全部" : statusBadge(s).label}
                  </button>
                ))}
              </div>
            </div>
            <div className="panel-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>申请日期</th>
                    <th>提现单号</th>
                    <th>提现金额</th>
                    <th>状态</th>
                    <th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center" style={{ padding: 40, color: "var(--color-text-secondary)" }}>
                        暂无提现记录
                      </td>
                    </tr>
                  ) : (
                    pageData.map((r) => {
                      const badge = statusBadge(r.status);
                      return (
                        <tr key={r.id}>
                          <td>{formatDate(r.created_at)}</td>
                          <td className="text-mono" style={{ fontSize: 12 }}>{r.withdrawal_no}</td>
                          <td className="text-mono" style={{ fontWeight: 600 }}>
                            ¥{r.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td>
                            <span className={`badge ${badge.className}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="text-sm text-muted">
                            {r.reject_reason ?? r.first_review_note ?? "-"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="panel-body">
              <div className="flex-between">
                <span className="text-sm text-muted">
                  共 {filtered.length} 条，第 {safePage}/{totalPages} 页
                </span>
                <div className="flex-wrap">
                  <button
                    className="btn btn-sm btn-secondary"
                    disabled={safePage <= 1}
                    onClick={() => setPage(safePage - 1)}
                  >
                    ‹ 上一页
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                    .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === "..." ? (
                        <span key={`d-${i}`} className="text-muted" style={{ padding: "0 4px" }}>…</span>
                      ) : (
                        <button
                          key={p}
                          className={`btn btn-sm ${p === safePage ? "btn-primary" : "btn-secondary"}`}
                          style={p === safePage ? undefined : { padding: "6px 12px" }}
                          onClick={() => setPage(p)}
                        >
                          {p}
                        </button>
                      ),
                    )}
                  <button
                    className="btn btn-sm btn-secondary"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage(safePage + 1)}
                  >
                    下一页 ›
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Withdraw Form Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="申请提现"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={submitting}>
              取消
            </button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting || !isValidAmount}>
              {submitting ? "提交中..." : "确认提现"}
            </button>
          </>
        }
        width={520}
      >
        <div style={{ background: "var(--color-primary-light)", borderRadius: "var(--radius-lg)", padding: "12px 16px", marginBottom: 16 }}>
          <div className="text-sm text-muted">可提现余额</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-primary)" }}>
            ¥{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          {!summary?.account_set && (
            <div className="text-sm" style={{ color: "var(--color-danger-text)", marginTop: 4 }}>
              ⚠️ 请先在账户设置中配置收款账户
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">提现金额（元）*</label>
          <input
            type="number"
            className="form-input"
            placeholder={`最低 ¥${minWithdraw}，最高 ¥${balance.toFixed(2)}`}
            value={form.amount}
            onChange={(e) => setForm({ amount: e.target.value })}
            min={minWithdraw}
            max={balance}
          />
          {form.amount && !isValidAmount && (
            <div className="text-sm" style={{ color: "var(--color-danger-text)", marginTop: 4 }}>
              金额需在 ¥{minWithdraw} ~ ¥{balance.toFixed(2)} 之间
            </div>
          )}
        </div>

        <div className="text-sm text-muted" style={{ marginTop: 8 }}>
          💡 提现方式及收款账号来自您的代理账户设置，如需修改请联系管理员。
        </div>
      </Modal>
    </AgentLayout>
  );
}
