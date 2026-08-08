import { useEffect, useState } from "react";
import AgentLayout from "../../components/AgentLayout";
import HelpModal from "../../components/HelpModal";
import {
  agentApi,
  type CommissionRecord,
  type CommissionRule,
} from "../../services/agent";

// ── Helpers ──
const STATUS_MAP: Record<string, { label: string; className: string }> = {
  settled: { label: "已结算", className: "badge-success" },
  pending: { label: "待结算", className: "badge-warning" },
  frozen: { label: "已冻结", className: "badge-info" },
};

function statusBadge(s: string) {
  return STATUS_MAP[s] ?? { label: s, className: "badge-info" };
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "-";
  return iso.slice(0, 10);
}

// ── Component ──
export default function AgentCommission() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [stats, setStats] = useState({
    totalCommission: 0,
    monthlyCommission: 0,
    pendingCommission: 0,
    settledCount: 0,
  });
  const [statusFilter, setStatusFilter] = useState<string>("全部");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // ── Fetch data from API ──
  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setError(null);

      const [commRes, summaryRes, rulesRes] = await Promise.all([
        agentApi.getCommissions({ page: 1, page_size: 100 }),
        agentApi.getWithdrawSummary(),
        agentApi.getCommissionRules(),
      ]);

      if (cancelled) return;

      const commErr = commRes.error || summaryRes.error;
      if (commErr) {
        if (commErr.includes("非代理商") || commErr.includes("NOT_AGENT")) {
          setError("您尚未开通代理商权限，请联系管理员。");
        } else {
          setError(commErr);
        }
        setLoading(false);
        return;
      }

      const commList = commRes.data?.list ?? [];
      const summary = summaryRes.data;

      setRecords(commList);
      setRules(rulesRes.data?.rules ?? []);

      setStats({
        totalCommission: summary?.commission_total ?? 0,
        monthlyCommission: 0, // TODO: monthly aggregation endpoint
        pendingCommission: summary?.pending ?? 0,
        settledCount: commList.filter((r: CommissionRecord) => r.status === "settled").length,
      });

      setLoading(false);
    }
    fetchData();
    return () => { cancelled = true; };
  }, []);

  // ── Filter ──
  let filtered = records;
  if (statusFilter !== "全部") {
    filtered = filtered.filter((r) => r.status === statusFilter);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageData = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <AgentLayout>
      <h1 className="page-title">
        💰 我的佣金
        <HelpModal title="我的佣金">
          <p>查看您的佣金收入和结算明细。</p>
          <p style={{ marginTop: 8 }}>
            佣金按客户月度消费额计算。基础佣金比例 15%，月消费超过 ¥10,000 的客户享受 18% 等级佣金。佣金在次月 5 日结算。
          </p>
        </HelpModal>
      </h1>
      <p className="page-subtitle">跟踪佣金收入，了解结算状态</p>

      {/* Commission Rules */}
      <div className="commission-rules mb-20">
        <div className="commission-rules-title">📋 佣金规则说明</div>
        <div className="commission-rules-body">
          {rules.length > 0 ? (
            rules.map((r) => {
              const ratePct = (r.rate * 100).toFixed(0);
              return (
                <div key={r.level} className="commission-rule-item" style={r.current ? { fontWeight: 600 } : undefined}>
                  <span className="commission-rule-rate">{ratePct}%</span>
                  <span className="commission-rule-desc">
                    {r.label} — {r.desc}
                    {r.current ? " ✅ 当前" : ""}
                  </span>
                </div>
              );
            })
          ) : (
            <>
              <div className="commission-rule-item">
                <span className="commission-rule-rate">15%</span>
                <span className="commission-rule-desc">基础佣金 — 客户月度消费 ¥10,000 以下</span>
              </div>
              <div className="commission-rule-item">
                <span className="commission-rule-rate">18%</span>
                <span className="commission-rule-desc">等级佣金 — 客户月度消费 ¥10,000 及以上</span>
              </div>
            </>
          )}
          <div className="commission-rule-item">
            <span className="commission-rule-rate">次月5日</span>
            <span className="commission-rule-desc">结算周期 — 每月佣金次月5日统一结算</span>
          </div>
        </div>
      </div>

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
          {/* Stats */}
          <div className="stats-grid">
            {[
              { l: "累计佣金（元）", v: `¥${stats.totalCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
              { l: "本月佣金（元）", v: `¥${stats.monthlyCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
              { l: "待结算（元）", v: `¥${stats.pendingCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
              { l: "已结算笔数", v: String(stats.settledCount) },
            ].map((s, i) => (
              <div key={i} className="stat-card" style={{ cursor: "default" }}>
                <div className="stat-card-label">{s.l}</div>
                <div className="stat-card-value">{s.v}</div>
              </div>
            ))}
          </div>

          {/* Commission List */}
          <div className="panel">
            <div className="panel-header">
              <span>佣金明细</span>
              <div className="filter-tabs">
                {["全部", "settled", "pending", "frozen"].map((s) => (
                  <button
                    key={s}
                    className={`filter-tab${statusFilter === s ? " active" : ""}`}
                    onClick={() => { setStatusFilter(s); setPage(1); }}
                  >
                    {s === "全部" ? "全部" : (statusBadge(s).label)}
                  </button>
                ))}
              </div>
            </div>
            <div className="panel-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>客户</th>
                    <th>消费额</th>
                    <th>佣金比例</th>
                    <th>佣金金额</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center" style={{ padding: 40, color: "var(--color-text-secondary)" }}>
                        暂无佣金记录
                      </td>
                    </tr>
                  ) : (
                    pageData.map((r) => {
                      const badge = statusBadge(r.status);
                      return (
                        <tr key={r.id}>
                          <td>{formatDate(r.created_at || r.settled_at)}</td>
                          <td>{r.customer_name || r.customer_email || "-"}</td>
                          <td className="text-mono">¥{(r.consumption ?? 0).toLocaleString()}</td>
                          <td>{r.rate != null ? `${(Number(r.rate) * 100).toFixed(0)}%` : "-"}</td>
                          <td className="text-mono" style={{ fontWeight: 600, color: "var(--color-success-text)" }}>
                            ¥{(r.amount ?? 0).toFixed(2)}
                          </td>
                          <td>
                            <span className={`badge ${badge.className}`}>
                              {badge.label}
                            </span>
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
    </AgentLayout>
  );
}
