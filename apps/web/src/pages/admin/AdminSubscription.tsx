import { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/AdminLayout";
import HelpModal from "../../components/HelpModal";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import { apiGet, apiPost, apiPut } from "../../services/api";

// ── Types ──
interface Plan {
  id: string;
  name: string;
  tokens: number;
  price: number;
  period: "monthly" | "yearly" | "onetime";
  models: string;
  features: string;
  status: "active" | "inactive";
  users: number;
}

export default function AdminSubscription() {
  const [tab, setTab] = useState<"plans" | "subscriptions">("subscriptions");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addPlanOpen, setAddPlanOpen] = useState(false);
  const [newPlan, setNewPlan] = useState({
    name: "", tokens: 0, price: 0, period: "monthly" as Plan["period"],
    models: "全部模型", features: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchPlans = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiGet<Plan[]>("/admin/subscriptions/plans");
      setPlans(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setLoadError(e.message || "加载订阅计划失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const createPlan = async () => {
    if (!newPlan.name.trim()) return;
    setSaving(true);
    try {
      await apiPost("/admin/subscriptions/plans", newPlan);
      setAddPlanOpen(false);
      setNewPlan({ name: "", tokens: 0, price: 0, period: "monthly", models: "全部模型", features: "" });
      fetchPlans();
    } catch {}
    setSaving(false);
  };

  const togglePlanStatus = async (plan: Plan) => {
    const newStatus = plan.status === "active" ? "inactive" : "active";
    setPlans((prev) => prev.map((p) => p.id === plan.id ? { ...p, status: newStatus } : p));
    try {
      await apiPut(`/admin/subscriptions/plans/${plan.id}`, { status: newStatus });
    } catch {
      setPlans((prev) => prev.map((p) => p.id === plan.id ? { ...p, status: plan.status } : p));
    }
  };

  return (
    <AdminLayout>
      <h1 className="page-title">
        订阅管理
        <HelpModal title="订阅管理">
          <p>管理平台的订阅计划和用户的订阅关系。</p>
          <p style={{ marginTop: 8 }}>
            支持创建多档订阅计划（免费/专业/企业/按量），管理用户订阅状态，执行周期重置等操作。
          </p>
        </HelpModal>
      </h1>
      <p className="page-subtitle">订阅计划与用户订阅管理</p>

      {loadError && (
        <div style={{ padding: "8px 12px", marginBottom: 12, background: "var(--color-warning-bg)", borderRadius: 6, fontSize: 13, color: "var(--color-warning-text)" }}>
          ⚠️ {loadError}
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        {[
          { l: "活跃计划", v: String(plans.filter((p) => p.status === "active").length) },
          { l: "总计划数", v: String(plans.length) },
          { l: "免费计划", v: String(plans.filter((p) => p.price === 0).length) },
          { l: "付费计划", v: String(plans.filter((p) => p.price > 0).length) },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ cursor: "default" }}>
            <div className="stat-card-label">{s.l}</div>
            <div className="stat-card-value">{s.v}</div>
          </div>
        ))}
      </div>

      <div className="flex-wrap mb-16">
        <div className="filter-tabs">
          <button className={`filter-tab ${tab === "subscriptions" ? "active" : ""}`} onClick={() => setTab("subscriptions")}>
            用户订阅
          </button>
          <button className={`filter-tab ${tab === "plans" ? "active" : ""}`} onClick={() => setTab("plans")}>
            订阅计划
          </button>
        </div>
      </div>

      {loading ? (
        <div className="panel" style={{ padding: 60, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
          <div style={{ color: "var(--color-text-secondary)" }}>加载中...</div>
        </div>
      ) : (
      <>
      {tab === "subscriptions" ? (
        <div className="panel">
          <div className="panel-header">
            <span>用户订阅列表</span>
            <button className="btn btn-sm btn-primary">+ 添加</button>
          </div>
          <div style={{ padding: 60, textAlign: "center", color: "var(--color-text-secondary)" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            <div>用户订阅数据需独立端点。当前订阅计划已对接 API。</div>
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="panel-header">
            <span>订阅计划</span>
            <button className="btn btn-sm btn-primary" onClick={() => setAddPlanOpen(true)}>+ 新建计划</button>
          </div>
          {plans.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center", color: "var(--color-text-secondary)" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
              <div>暂无订阅计划</div>
            </div>
          ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, padding: 16 }}>
            {plans.map((p) => (
              <div key={p.id} className="stat-card" style={{ cursor: "default", padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 16 }}>{p.name}</span>
                  <StatusBadge status={p.status === "active" ? "active" : "inactive"}>
                    {p.status === "active" ? "上架" : "下架"}
                  </StatusBadge>
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
                  {p.price === 0 ? "免费" : `¥${p.price}`}
                  <span style={{ fontSize: 13, fontWeight: 400, color: "var(--color-text-secondary)" }}>
                    /{p.period === "monthly" ? "月" : p.period === "yearly" ? "年" : "次"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8 }}>
                  {p.tokens > 0 ? `${(p.tokens / 1000).toFixed(0)}K Token/月` : "按量计费"}
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 12 }}>
                  <div>{p.models}</div>
                  <div>{p.features}</div>
                </div>
                <div style={{ fontSize: 12, color: "var(--color-primary)" }}>
                  {p.users.toLocaleString()} 个用户
                </div>
                <div className="flex-wrap" style={{ marginTop: 12 }}>
                  <button className="btn btn-xs btn-secondary">编辑</button>
                  <button className="btn btn-xs btn-secondary" onClick={() => togglePlanStatus(p)}>
                    {p.status === "active" ? "下架" : "上架"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      )}
      </>
      )}

      <Modal open={addPlanOpen} onClose={() => setAddPlanOpen(false)} title="新建订阅计划">
        <div className="form-group">
          <label className="form-label">计划名称</label>
          <input className="form-input" placeholder="如：高级版" value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">周期类型</label>
          <select className="form-select" value={newPlan.period} onChange={(e) => setNewPlan({ ...newPlan, period: e.target.value as Plan["period"] })}>
            <option value="monthly">月付</option>
            <option value="yearly">年付</option>
            <option value="onetime">一次性</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">价格 (¥)</label>
          <input className="form-input" type="number" placeholder="0" value={newPlan.price} onChange={(e) => setNewPlan({ ...newPlan, price: parseFloat(e.target.value) || 0 })} />
        </div>
        <div className="form-group">
          <label className="form-label">Token 额度</label>
          <input className="form-input" type="number" placeholder="0 表示按量" value={newPlan.tokens} onChange={(e) => setNewPlan({ ...newPlan, tokens: parseInt(e.target.value) || 0 })} />
        </div>
        <div className="form-group">
          <label className="form-label">可用模型</label>
          <select className="form-select" value={newPlan.models} onChange={(e) => setNewPlan({ ...newPlan, models: e.target.value })}>
            <option>全部模型</option>
            <option>基础模型</option>
            <option>高级模型</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">功能特性（逗号分隔）</label>
          <input className="form-input" placeholder="API调用, 技术支持" value={newPlan.features} onChange={(e) => setNewPlan({ ...newPlan, features: e.target.value })} />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn btn-secondary" onClick={() => setAddPlanOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={createPlan} disabled={saving || !newPlan.name.trim()}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </Modal>
    </AdminLayout>
  );
}
