import { useState, useEffect, useCallback, useMemo } from "react";
import HelpModal from "../../components/HelpModal";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import { apiGet, apiPost } from "../../services/api";

// ── API types ──

interface AgentProfile {
  id: number;
  user_id: number;
  level: string;
  level_label: string;
  commission_rate: number;
  verify_status: string;
  referral_code: string;
  email: string;
  username: string;
  real_name_status: string;
  created_at: string;
  balance: number;
  customer_count: number;
}

interface AgentReport {
  id: number;
  agent_user_id: number;
  target_phone: string;
  target_email: string;
  target_user_id: number | null;
  note: string;
  status: string;
  reject_reason: string | null;
  agent_email: string;
  agent_username: string;
  target_email_user: string;
  target_username: string;
  current_agent: number | null;
  created_at: string;
}

interface AgentWithdrawal {
  id: number;
  user_id: number;
  withdrawal_no: string;
  amount: number;
  status: string;
  status_label: string;
  account: string;
  bank: string;
  account_name: string;
  reject_reason: string | null;
  email: string;
  username: string;
  created_at: string;
}

type AgentTab = "list" | "approvals" | "settlements";

export default function AdminAgent() {
  const [tab, setTab] = useState<AgentTab>("list");
  const [search, setSearch] = useState("");

  // ── Agent list ──
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);

  // ── Reports (approvals) ──
  const [reports, setReports] = useState<AgentReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // ── Withdrawals (settlements) ──
  const [withdrawals, setWithdrawals] = useState<AgentWithdrawal[]>([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);

  // ── Detail modal ──
  const [selectedAgent, setSelectedAgent] = useState<AgentProfile | null>(null);

  const fetchAgents = useCallback(async () => {
    setAgentsLoading(true);
    setAgentsError(null);
    try {
      const data = await apiGet<{ list: AgentProfile[]; pagination: { total: number } }>(
        "/admin/agents",
        { page: 1, page_size: 100 },
      );
      setAgents(data.list ?? []);
    } catch (e: any) {
      setAgentsError(e.message ?? "加载代理列表失败");
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  const fetchReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const data = await apiGet<{ list: AgentReport[]; pagination: { total: number } }>(
        "/admin/agent-reports",
        { page: 1, page_size: 100 },
      );
      setReports(data.list ?? []);
    } catch {
      // non-critical
    } finally {
      setReportsLoading(false);
    }
  }, []);

  const fetchWithdrawals = useCallback(async () => {
    setWithdrawalsLoading(true);
    try {
      const data = await apiGet<{ list: AgentWithdrawal[]; pagination: { total: number } }>(
        "/admin/agent-withdrawals",
        { page: 1, page_size: 100 },
      );
      setWithdrawals(data.list ?? []);
    } catch {
      // non-critical
    } finally {
      setWithdrawalsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    fetchReports();
    fetchWithdrawals();
  }, [fetchAgents, fetchReports, fetchWithdrawals]);

  // ── Audit a report (pass/reject) ──
  const handleAudit = async (id: number, action: "pass" | "reject") => {
    setActionLoading(true);
    try {
      await apiPost(`/admin/agent-reports/${id}/audit`, { action });
      await fetchReports();
      await fetchAgents(); // refresh customer counts
    } catch (e: any) {
      alert(e.message ?? "操作失败");
    } finally {
      setActionLoading(false);
    }
  };

  const filteredAgents = useMemo(
    () => agents.filter((a) => !search || a.username?.includes(search) || a.email?.includes(search)),
    [agents, search],
  );

  const levelLabel = (l: string) => {
    switch (l) {
      case "senior": return "🥇 高级代理";
      case "level1": return "🥈 一级代理";
      case "prepare": return "🥉 预备代理";
      default: return l;
    }
  };

  const pendingReports = reports.filter((r) => r.status === "pending").length;

  return (
    <div>
      <div className="admin-page-header">
        <h2 className="admin-page-title">
          代理管理
          <HelpModal title="代理管理">
            <p>管理平台所有代理商，包括代理列表、报备审批和佣金提现。</p>
            <p><strong>代理列表</strong>：GET /api/v1/admin/agents — 查看代理基本信息、佣金比例、客户数和余额。</p>
            <p><strong>报备审批</strong>：GET /api/v1/admin/agent-reports — 审核代理提交的客户报备申请。</p>
            <p><strong>提现管理</strong>：GET /api/v1/admin/agent-withdrawals — 管理代理提现（双审制）。</p>
          </HelpModal>
        </h2>
        <button className="btn btn-sm btn-secondary" onClick={() => { fetchAgents(); fetchReports(); fetchWithdrawals(); }}>
          🔄 刷新
        </button>
      </div>

      {agentsError && (
        <div className="panel" style={{ marginBottom: 12, background: "#fef2f2", borderColor: "#fecaca" }}>
          <div className="panel-body" style={{ color: "#dc2626" }}>⚠️ {agentsError}</div>
        </div>
      )}

      {/* Tab bar */}
      <div className="panel">
        <div className="panel-header">
          <div className="filter-tabs">
            <button className={`filter-tab${tab === "list" ? " active" : ""}`} onClick={() => setTab("list")}>
              📋 代理列表
            </button>
            <button className={`filter-tab${tab === "approvals" ? " active" : ""}`} onClick={() => setTab("approvals")}>
              ✅ 报备审批 {pendingReports > 0 && `(${pendingReports})`}
            </button>
            <button className={`filter-tab${tab === "settlements" ? " active" : ""}`} onClick={() => setTab("settlements")}>
              💸 提现管理
            </button>
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {tab === "list" && (
            <>
              <div style={{ padding: "12px 20px" }}>
                <input
                  className="form-input"
                  style={{ width: 260 }}
                  placeholder="搜索代理姓名或邮箱…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {agentsLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "#888" }}>⏳ 加载中…</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th><th>姓名</th><th>邮箱</th><th>等级</th><th>佣金比例</th><th>客户数</th><th>推荐码</th><th>加入时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAgents.length > 0 ? filteredAgents.map((a) => (
                      <tr key={a.id} onClick={() => setSelectedAgent(a)} style={{ cursor: "pointer" }}>
                        <td>{a.user_id}</td>
                        <td><strong>{a.username || a.email}</strong></td>
                        <td style={{ fontSize: 13 }}>{a.email}</td>
                        <td>{levelLabel(a.level)}</td>
                        <td>{((a.commission_rate ?? 0) * 100).toFixed(0)}%</td>
                        <td>{a.customer_count}</td>
                        <td className="text-mono" style={{ fontSize: 11 }}>{a.referral_code || "—"}</td>
                        <td style={{ fontSize: 12 }}>{a.created_at ? new Date(a.created_at).toLocaleDateString("zh-CN") : "—"}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={8} style={{ textAlign: "center", padding: 40, color: "#888" }}>暂无代理数据</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </>
          )}

          {tab === "approvals" && (
            <>
              {reportsLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "#888" }}>⏳ 加载中…</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th><th>代理</th><th>客户邮箱</th><th>客户手机</th><th>备注</th><th>提交时间</th><th>状态</th><th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.length > 0 ? reports.map((r) => (
                      <tr key={r.id}>
                        <td>{r.id}</td>
                        <td>{r.agent_username || r.agent_email}</td>
                        <td>{r.target_email || r.target_email_user || r.target_username || "—"}</td>
                        <td>{r.target_phone || "—"}</td>
                        <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.note || "—"}</td>
                        <td style={{ fontSize: 12 }}>{r.created_at ? new Date(r.created_at).toLocaleString("zh-CN") : "—"}</td>
                        <td>
                          <StatusBadge status={r.status === "passed" ? "success" : r.status === "pending" ? "warning" : "error"}>
                            {r.status === "passed" ? "已通过" : r.status === "pending" ? "待审核" : "已拒绝"}
                          </StatusBadge>
                        </td>
                        <td>
                          {r.status === "pending" && (
                            <div className="flex-wrap gap-8">
                              <button
                                className="btn btn-xs btn-primary"
                                disabled={actionLoading}
                                onClick={() => handleAudit(r.id, "pass")}
                              >
                                通过
                              </button>
                              <button
                                className="btn btn-xs btn-danger"
                                disabled={actionLoading}
                                onClick={() => handleAudit(r.id, "reject")}
                              >
                                拒绝
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={8} style={{ textAlign: "center", padding: 40, color: "#888" }}>暂无报备记录</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </>
          )}

          {tab === "settlements" && (
            <>
              {withdrawalsLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "#888" }}>⏳ 加载中…</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th><th>提现编号</th><th>代理</th><th>邮箱</th><th>金额</th><th>银行</th><th>状态</th><th>时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawals.length > 0 ? withdrawals.map((w) => (
                      <tr key={w.id}>
                        <td>{w.id}</td>
                        <td className="text-mono" style={{ fontSize: 11 }}>{w.withdrawal_no}</td>
                        <td><strong>{w.username || w.email}</strong></td>
                        <td style={{ fontSize: 13 }}>{w.email}</td>
                        <td className="text-mono">¥{w.amount.toFixed(2)}</td>
                        <td>{w.bank || w.account || "—"}</td>
                        <td>
                          <StatusBadge status={
                            w.status === "completed" ? "success" :
                            w.status === "pending_first_review" || w.status === "pending_second_review" ? "warning" :
                            w.status === "processing" ? "info" : "error"
                          }>
                            {w.status_label}
                          </StatusBadge>
                        </td>
                        <td style={{ fontSize: 12 }}>{w.created_at ? new Date(w.created_at).toLocaleString("zh-CN") : "—"}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={8} style={{ textAlign: "center", padding: 40, color: "#888" }}>暂无提现记录</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>

      {/* Agent Detail Modal */}
      <Modal
        open={!!selectedAgent}
        onClose={() => setSelectedAgent(null)}
        title={`代理详情 — ${(selectedAgent?.username || selectedAgent?.email) ?? ""}`}
      >
        {selectedAgent && (
          <div className="admin-detail-grid">
            <div><strong>ID：</strong>{selectedAgent.user_id}</div>
            <div><strong>姓名：</strong>{selectedAgent.username || selectedAgent.email}</div>
            <div><strong>邮箱：</strong>{selectedAgent.email}</div>
            <div><strong>等级：</strong>{levelLabel(selectedAgent.level)}</div>
            <div><strong>佣金比例：</strong>{((selectedAgent.commission_rate ?? 0) * 100).toFixed(0)}%</div>
            <div><strong>客户数：</strong>{selectedAgent.customer_count}</div>
            <div><strong>余额：</strong>¥{((selectedAgent.balance ?? 0) / 100).toFixed(2)}</div>
            <div><strong>推荐码：</strong>{selectedAgent.referral_code || "—"}</div>
            <div><strong>实名认证：</strong>{selectedAgent.real_name_status === "verified" ? "✅ 已认证" : "—"}</div>
            <div><strong>加入时间：</strong>{selectedAgent.created_at ? new Date(selectedAgent.created_at).toLocaleDateString("zh-CN") : "—"}</div>
          </div>
        )}
      </Modal>
    </div>
  );
}
