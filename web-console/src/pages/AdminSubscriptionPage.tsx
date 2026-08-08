import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, useToast } from "@3cloud/shared-ui";

interface Plan { id: number; name: string; description: string; price: number; billing_cycle: string; features: string[]; status: string; sort_order: number; created_at: string; }
interface Subscriber { id: number; user_id: number; username: string; plan_id: number; plan_name: string; status: string; started_at: string; expires_at: string; }

const card: React.CSSProperties = { background: "var(--color-panel)", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <div style={{ width: 44, height: 24, borderRadius: 12, background: on ? "#22c55e" : "#d9d9d9", position: "relative", cursor: "pointer", display: "inline-flex", alignItems: "center", flexShrink: 0 }} onClick={() => onChange(!on)}>
    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: 3, transform: on ? "translateX(20px)" : "translateX(0)", transition: "transform .2s" }} />
  </div>
);

export default function AdminSubscriptionPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"plans" | "subscribers">("plans");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<Partial<Plan>>({ name: "", description: "", price: 0, billing_cycle: "monthly", features: [], status: "active", sort_order: 0 });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [p, s] = await Promise.all([
        api.get("/admin/subscription/plans"),
        api.get("/admin/subscription/subscribers"),
      ]);
      setPlans(p.data?.data?.list ?? []);
      setSubs(s.data?.data?.list ?? []);
    } catch {}
  }

  async function savePlan() {
    if (editing) {
      await api.put(`/admin/subscription/plans/${editing.id}`, editing);
      toast.success("计划已更新");
    } else {
      await api.post("/admin/subscription/plans", form);
      toast.success("计划已创建");
      setShowNew(false);
    }
    setEditing(null); loadData();
  }

  async function togglePlanStatus(id: number, status: string) {
    await api.put(`/admin/subscription/plans/${id}`, { status: status === "active" ? "inactive" : "active" });
    toast.success("状态已切换");
    loadData();
  }

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>📦</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>订阅计划管理
          <HelpIcon text="管理平台订阅计划（月付/年付），查看订阅用户列表。支持创建、编辑、启停计划。" level="page" />
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab("plans")} style={{ padding: "8px 20px", borderRadius: 8, border: tab === "plans" ? "2px solid #4f6ef7" : "1px solid var(--color-border)", background: tab === "plans" ? "#eef2ff" : "var(--color-panel)", color: tab === "plans" ? "#4f6ef7" : "#666", cursor: "pointer", fontWeight: 600 }}>📦 订阅计划</button>
        <button onClick={() => setTab("subscribers")} style={{ padding: "8px 20px", borderRadius: 8, border: tab === "subscribers" ? "2px solid #4f6ef7" : "1px solid var(--color-border)", background: tab === "subscribers" ? "#eef2ff" : "var(--color-panel)", color: tab === "subscribers" ? "#4f6ef7" : "#666", cursor: "pointer", fontWeight: 600 }}>👥 订阅用户</button>
      </div>

      {tab === "plans" && (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <button onClick={() => { setShowNew(true); setForm({ name: "", description: "", price: 0, billing_cycle: "monthly", features: [], status: "active", sort_order: 0 }); }} style={{ padding: "6px 16px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>+ 新建计划</button>
          </div>
          {showNew && (
            <div style={{ ...card, marginBottom: 16, border: "2px solid #86efac" }}>
              <h4 style={{ margin: "0 0 12px" }}>新建订阅计划</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <input placeholder="计划名称" value={form.name} onChange={e => setForm({...form, name: e.target.value})} style={{ padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }} />
                <select value={form.billing_cycle} onChange={e => setForm({...form, billing_cycle: e.target.value})} style={{ padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }}>
                  <option value="monthly">月付</option><option value="yearly">年付</option>
                </select>
                <div>
                  <span style={{ fontSize: 12, color: "#888" }}>价格 (分)</span>
                  <input type="number" value={form.price} onChange={e => setForm({...form, price: Number(e.target.value)})} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }} />
                </div>
                <div>
                  <span style={{ fontSize: 12, color: "#888" }}>排序</span>
                  <input type="number" value={form.sort_order} onChange={e => setForm({...form, sort_order: Number(e.target.value)})} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }} />
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <input placeholder="描述" value={form.description} onChange={e => setForm({...form, description: e.target.value})} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={() => { setEditing({...form as Plan, id: 0} as Plan); savePlan(); }} style={{ padding: "6px 16px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>创建</button>
                <button onClick={() => setShowNew(false)} style={{ padding: "6px 16px", background: "var(--color-border)", border: "none", borderRadius: 6, cursor: "pointer" }}>取消</button>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {plans.map(p => (
              <div key={p.id} style={{ ...card, border: p.status === "active" ? "1px solid var(--color-border)" : "1px solid #ddd", opacity: p.status === "active" ? 1 : 0.6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <h4 style={{ margin: 0, fontSize: 16 }}>{p.name}</h4>
                  <Toggle on={p.status === "active"} onChange={() => togglePlanStatus(p.id, p.status)} />
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, margin: "8px 0", color: "#4f6ef7" }}>¥{(p.price / 100).toFixed(2)}<span style={{ fontSize: 14, fontWeight: 400, color: "#888" }}>/{p.billing_cycle === "monthly" ? "月" : "年"}</span></div>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>{p.description}</p>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => setEditing(p)} style={{ padding: "4px 12px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-panel)", cursor: "pointer", fontSize: 12 }}>编辑</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "subscribers" && (
        <div style={{ background: "var(--color-panel)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#fafafa" }}>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>用户</th>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>计划</th>
              <th style={{ padding: "10px 14px", textAlign: "center" }}>状态</th>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>开始日期</th>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>到期日期</th>
            </tr></thead>
            <tbody>
              {subs.map(s => (
                <tr key={s.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "8px 14px" }}>{s.username}</td>
                  <td style={{ padding: "8px 14px" }}>{s.plan_name}</td>
                  <td style={{ padding: "8px 14px", textAlign: "center" }}>
                    <StatusBadge label={s.status === "active" ? "生效中" : s.status === "expired" ? "已过期" : s.status} variant={s.status === "active" ? "success" : s.status === "expired" ? "danger" : "warning"} />
                  </td>
                  <td style={{ padding: "8px 14px", fontSize: 12 }}>{new Date(s.started_at).toLocaleDateString()}</td>
                  <td style={{ padding: "8px 14px", fontSize: 12 }}>{new Date(s.expires_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {subs.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无订阅用户</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
