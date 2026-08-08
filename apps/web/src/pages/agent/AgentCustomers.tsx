import { useEffect, useState } from "react";
import AgentLayout from "../../components/AgentLayout";
import HelpModal from "../../components/HelpModal";
import Modal from "../../components/Modal";
import { agentApi, type AgentReport } from "../../services/agent";

// ── Types ──
interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  registerDate: string;
  consumption: number;
  status: string;
}

interface NewCustomerForm {
  target_phone: string;
  target_email: string;
  note: string;
}

// ── Helpers ──
const STATUS_MAP: Record<string, { label: string; className: string }> = {
  active: { label: "活跃", className: "badge-success" },
  passed: { label: "已通过", className: "badge-success" },
  inactive: { label: "停用", className: "badge-danger" },
  pending: { label: "待审核", className: "badge-warning" },
  rejected: { label: "已驳回", className: "badge-danger" },
};

function statusBadge(s: string) {
  const item = STATUS_MAP[s] ?? { label: s, className: "badge-info" };
  return { ...item };
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "-";
  return iso.slice(0, 10);
}

function reportToCustomer(r: AgentReport): Customer {
  return {
    id: String(r.id),
    name: r.target_username || r.target_email_resolved || r.target_email || `报备 #${r.id}`,
    email: r.target_email_resolved || r.target_email || "-",
    phone: r.target_phone || "-",
    registerDate: formatDate(r.created_at),
    consumption: 0, // not in report endpoint
    status: r.status,
  };
}

const EMPTY_FORM: NewCustomerForm = { target_phone: "", target_email: "", note: "" };

// ── Component ──
export default function AgentCustomers() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("全部");
  const [page, setPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState<NewCustomerForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const pageSize = 10;

  // ── Fetch customers from API ──
  useEffect(() => {
    let cancelled = false;
    async function fetchCustomers() {
      setLoading(true);
      setError(null);
      const res = await agentApi.getReports();
      if (cancelled) return;
      if (res.error) {
        // Treat empty profile gracefully (user may not be agent)
        if (res.error.includes("非代理商") || res.error.includes("NOT_AGENT")) {
          setError("您尚未开通代理商权限，请联系管理员。");
        } else {
          setError(res.error);
        }
      } else {
        setCustomers((res.data?.list ?? []).map(reportToCustomer));
      }
      setLoading(false);
    }
    fetchCustomers();
    return () => { cancelled = true; };
  }, []);

  // ── Filter ──
  let filtered = customers;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.includes(q),
    );
  }
  if (statusFilter !== "全部") {
    filtered = filtered.filter((c) => c.status === statusFilter);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageData = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // ── Bind new customer ──
  const handleAdd = async () => {
    if (!form.target_email && !form.target_phone) {
      alert("请至少填写邮箱或手机号之一");
      return;
    }
    setSubmitting(true);
    const res = await agentApi.createReport({
      target_phone: form.target_phone || undefined,
      target_email: form.target_email || undefined,
      note: form.note || undefined,
    });
    setSubmitting(false);

    if (res.error) {
      alert(`报备失败: ${res.error}`);
      return;
    }

    alert("报备已提交，待后台审核。");
    setForm(EMPTY_FORM);
    setShowAddModal(false);

    // Refresh list
    const refresh = await agentApi.getReports();
    if (!refresh.error) {
      setCustomers((refresh.data?.list ?? []).map(reportToCustomer));
    }
  };

  return (
    <AgentLayout>
      <h1 className="page-title">
        👥 我的客户
        <HelpModal title="我的客户">
          <p>管理您报备的客户列表。查看客户基本信息和报备状态。</p>
          <p style={{ marginTop: 8 }}>
            点击「报备新客户」提交客户信息，待平台审核通过后即可开始追踪消费数据。
          </p>
        </HelpModal>
      </h1>
      <p className="page-subtitle">管理您的客户资源，跟踪客户消费和活跃度</p>

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
          {/* Filter Bar */}
          <div className="flex-between mb-16">
            <div className="flex-wrap gap-8">
              <input
                type="text"
                className="form-input"
                placeholder="搜索客户名称、邮箱或手机号…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                style={{ width: 280 }}
              />
              <div className="filter-tabs">
                {["全部", "pending", "passed", "rejected"].map((s) => (
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
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              ➕ 报备新客户
            </button>
          </div>

          {/* Table */}
          <div className="panel">
            <div className="panel-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>客户名称</th>
                    <th>邮箱</th>
                    <th>报备时间</th>
                    <th>消费额</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center" style={{ padding: 40, color: "var(--color-text-secondary)" }}>
                        暂无匹配的客户
                      </td>
                    </tr>
                  ) : (
                    pageData.map((c) => {
                      const badge = statusBadge(c.status);
                      return (
                        <tr key={c.id}>
                          <td>
                            <div style={{ fontWeight: 500 }}>{c.name}</div>
                            <div className="text-sm text-muted">{c.phone}</div>
                          </td>
                          <td>{c.email}</td>
                          <td>{c.registerDate}</td>
                          <td className="text-mono">¥{c.consumption.toLocaleString()}</td>
                          <td>
                            <span className={`badge ${badge.className}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td>
                            <button className="btn btn-xs btn-secondary">📋 详情</button>
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
                        <span key={`dot-${i}`} className="text-muted" style={{ padding: "0 4px" }}>…</span>
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

      {/* Add Customer Modal */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="报备新客户"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowAddModal(false)} disabled={submitting}>
              取消
            </button>
            <button className="btn btn-primary" onClick={handleAdd} disabled={submitting}>
              {submitting ? "提交中..." : "提交报备"}
            </button>
          </>
        }
        width={560}
      >
        <div className="form-group">
          <label className="form-label">客户邮箱 *</label>
          <input
            type="email"
            className="form-input"
            placeholder="customer@example.com"
            value={form.target_email}
            onChange={(e) => setForm({ ...form, target_email: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">客户手机号</label>
          <input
            type="text"
            className="form-input"
            placeholder="请输入手机号"
            value={form.target_phone}
            onChange={(e) => setForm({ ...form, target_phone: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">备注</label>
          <textarea
            className="form-textarea"
            placeholder="备注信息（选填）"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>
      </Modal>
    </AgentLayout>
  );
}
