import { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/AdminLayout";
import HelpModal from "../../components/HelpModal";
import { apiGet, apiPost } from "../../services/api";

// ── Types ──
interface Coupon {
  id: string;
  name: string;
  type: "fixed" | "percent" | "trial";
  amount: number;
  min_order?: number;
  minOrder?: number;
  max_discount?: number;
  maxDiscount?: number;
  total_count?: number;
  totalCount?: number;
  used_count?: number;
  usedCount?: number;
  start_date?: string;
  startDate?: string;
  end_date?: string;
  endDate?: string;
  status: "active" | "expired" | "paused" | "draft";
  description: string;
}

const STATUS_MAP: Record<Coupon["status"], { cls: string; label: string }> = {
  active: { cls: "badge-success", label: "进行中" },
  expired: { cls: "badge-danger", label: "已过期" },
  paused: { cls: "badge-warning", label: "已暂停" },
  draft: { cls: "badge-info", label: "草稿" },
};

const TYPE_MAP: Record<Coupon["type"], string> = {
  fixed: "固定金额",
  percent: "百分比折扣",
  trial: "免费试用",
};

export default function AdminCoupon() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"coupons" | "records">("coupons");
  const [showCreate, setShowCreate] = useState(false);
  const [newCoupon, setNewCoupon] = useState({
    name: "", type: "fixed" as Coupon["type"], amount: 0, minOrder: 0,
    maxDiscount: 0, totalCount: 100, startDate: "", endDate: "", description: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchCoupons = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiGet<Coupon[]>("/campaigns");
      setCoupons(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setLoadError(e.message || "加载优惠券列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const toggleStatus = async (coupon: Coupon) => {
    const statusMap: Record<Coupon["status"], Coupon["status"]> = {
      active: "paused", paused: "active", expired: "expired", draft: "active",
    };
    const newStatus = statusMap[coupon.status] || coupon.status;
    setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, status: newStatus } : c)));
    try {
      await apiPost(`/campaigns`, { id: coupon.id, status: newStatus });
    } catch {
      setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, status: coupon.status } : c)));
    }
  };

  const createCoupon = async () => {
    if (!newCoupon.name.trim()) return;
    setSaving(true);
    try {
      await apiPost("/campaigns", newCoupon);
      setNewCoupon({ name: "", type: "fixed", amount: 0, minOrder: 0, maxDiscount: 0, totalCount: 100, startDate: "", endDate: "", description: "" });
      setShowCreate(false);
      fetchCoupons();
    } catch {}
    setSaving(false);
  };

  const fmtVal = <T,>(c: T, key1: string, key2: string, fallback: any = 0) => (c as any)[key1] ?? (c as any)[key2] ?? fallback;

  return (
    <AdminLayout>
      <h1 className="page-title">
        优惠券管理
        <HelpModal title="优惠券管理">
          <p>管理平台的优惠券活动：创建优惠券、查看发放记录和使用情况。</p>
          <p style={{ marginTop: 8 }}>🎫 功能说明：</p>
          <ul style={{ paddingLeft: 20, marginTop: 4 }}>
            <li><strong>优惠券列表</strong>：名称、类型（固定/百分比/试用）、面额、有效期、状态</li>
            <li><strong>新建/编辑</strong>：配置满减条件、折扣上限、发放总量</li>
            <li><strong>发放记录</strong>：查看每张优惠券的使用明细</li>
          </ul>
        </HelpModal>
      </h1>
      <p className="page-subtitle">管理优惠券的创建、发放和使用情况</p>

      {loadError && (
        <div style={{ padding: "8px 12px", marginBottom: 12, background: "var(--color-warning-bg)", borderRadius: 6, fontSize: 13, color: "var(--color-warning-text)" }}>
          ⚠️ {loadError}
        </div>
      )}

      <div className="filter-tabs mb-16">
        {(["coupons", "records"] as const).map((tab) => (
          <button
            key={tab}
            className={`filter-tab${activeTab === tab ? " active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "coupons" ? "优惠券列表" : "发放记录"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="panel" style={{ padding: 60, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
          <div style={{ color: "var(--color-text-secondary)" }}>加载中...</div>
        </div>
      ) : (
      <>
      {activeTab === "coupons" && (
        <>
          <div className="flex-between mb-16">
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              共 {coupons.length} 张优惠券
            </span>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
              + 新建优惠券
            </button>
          </div>

          {coupons.length === 0 ? (
            <div className="panel" style={{ padding: 60, textAlign: "center", color: "var(--color-text-secondary)" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎫</div>
              <div>暂无优惠券</div>
            </div>
          ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
            {coupons.map((c) => {
              const minOrder = fmtVal(c, "min_order", "minOrder") as number;
              const maxDiscount = fmtVal(c, "max_discount", "maxDiscount") as number;
              const totalCount = fmtVal(c, "total_count", "totalCount") as number;
              const usedCount = fmtVal(c, "used_count", "usedCount") as number;
              const startDate = fmtVal(c, "start_date", "startDate", "") as string;
              const endDate = fmtVal(c, "end_date", "endDate", "") as string;
              const statusInfo = STATUS_MAP[c.status] || STATUS_MAP["draft"];
              return (
              <div key={c.id} className="panel">
                <div className="panel-header">
                  <div>
                    <strong>{c.name}</strong>
                    <span className={`badge ${statusInfo.cls}`} style={{ marginLeft: 8 }}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <button className="btn btn-xs btn-secondary" onClick={() => toggleStatus(c)}>
                    {c.status === "active" ? "暂停" : c.status === "paused" ? "启用" : c.status === "draft" ? "发布" : "—"}
                  </button>
                </div>
                <div className="panel-body">
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: "var(--color-primary)" }}>
                        {c.type === "percent" ? `${c.amount}%` : `¥${c.amount}`}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                        {TYPE_MAP[c.type]}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13 }}>
                        已用 <strong>{usedCount}</strong> / <strong>{totalCount}</strong>
                      </div>
                      <div style={{ marginTop: 4, height: 6, background: "var(--color-disabled-bg)", borderRadius: 3, width: 120 }}>
                        <div style={{ height: 6, background: "var(--color-primary)", borderRadius: 3, width: `${Math.min(100, (totalCount > 0 ? (usedCount / totalCount) * 100 : 0))}%` }} />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", fontSize: 12, color: "var(--color-text-secondary)" }}>
                    <div>有效期：{startDate} ~ {endDate}</div>
                    {minOrder > 0 && <div>满 ¥{minOrder} 可用</div>}
                    {c.type === "percent" && maxDiscount > 0 && <div>最高减 ¥{maxDiscount}</div>}
                    <div>{c.description}</div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
          )}
        </>
      )}

      {activeTab === "records" && (
        <div className="panel">
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>优惠券</th>
                  <th>用户 ID</th>
                  <th>订单金额</th>
                  <th>优惠金额</th>
                  <th>使用时间</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 60 }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🎫</div>
                    <div style={{ color: "var(--color-text-secondary)" }}>
                      优惠券发放记录需单独对接 API (GET /admin/campaigns/:id/stats)
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>
      )}

      {/* Create Coupon Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
            <div className="modal-header">
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>新建优惠券</h3>
              <button className="modal-close" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">优惠券名称 *</label>
                <input
                  className="form-input"
                  placeholder="例如：新用户注册礼包"
                  value={newCoupon.name}
                  onChange={(e) => setNewCoupon({ ...newCoupon, name: e.target.value })}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">类型</label>
                  <select
                    className="form-select"
                    value={newCoupon.type}
                    onChange={(e) => setNewCoupon({ ...newCoupon, type: e.target.value as Coupon["type"] })}
                  >
                    <option value="fixed">固定金额</option>
                    <option value="percent">百分比折扣</option>
                    <option value="trial">免费试用</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    {newCoupon.type === "percent" ? "折扣率 (%)" : "优惠金额 (¥)"}
                  </label>
                  <input
                    className="form-input"
                    type="number"
                    value={newCoupon.amount}
                    onChange={(e) => setNewCoupon({ ...newCoupon, amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">最低消费 (¥)</label>
                  <input
                    className="form-input"
                    type="number"
                    value={newCoupon.minOrder}
                    onChange={(e) => setNewCoupon({ ...newCoupon, minOrder: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">最高优惠 (¥)</label>
                  <input
                    className="form-input"
                    type="number"
                    value={newCoupon.maxDiscount}
                    onChange={(e) => setNewCoupon({ ...newCoupon, maxDiscount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">发放总量</label>
                  <input
                    className="form-input"
                    type="number"
                    value={newCoupon.totalCount}
                    onChange={(e) => setNewCoupon({ ...newCoupon, totalCount: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">开始日期</label>
                    <input
                      type="date"
                      className="form-input"
                      value={newCoupon.startDate}
                      onChange={(e) => setNewCoupon({ ...newCoupon, startDate: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">结束日期</label>
                    <input
                      type="date"
                      className="form-input"
                      value={newCoupon.endDate}
                      onChange={(e) => setNewCoupon({ ...newCoupon, endDate: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">描述</label>
                <textarea
                  className="form-textarea"
                  placeholder="优惠券使用说明…"
                  value={newCoupon.description}
                  onChange={(e) => setNewCoupon({ ...newCoupon, description: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn btn-primary" onClick={createCoupon} disabled={saving || !newCoupon.name.trim()}>
                {saving ? "保存中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
