import { useState, useEffect } from "react";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, useToast } from "@3cloud/shared-ui";

interface Plan { id: number; name: string; description: string; price: number; billing_cycle: string; features: string[]; status: string; sort_order: number; created_at: string; }
interface Subscriber { id: number; user_id: number; username: string; plan_id: number; plan_name: string; status: string; started_at: string; expires_at: string; }

const card: React.CSSProperties = { background: "var(--color-panel)", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <div style={{ width: 44, height: 24, borderRadius: 12, background: on ? "#22c55e" : "#d9d9d9", position: "relative", cursor: "pointer", display: "inline-flex", alignItems: "center", flexShrink: 0 }} onClick={() => onChange(!on)}>
    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: 3, transform: on ? "translateX(20px)" : "translateX(0)", transition: "transform .2s" }} />
  </div>
);

/* ───────── 演示数据（后端 /admin/subscription 待接入） ───────── */
const MOCK_PLANS: Plan[] = [
  { id: 1, name: "免费版", description: "基础功能，适合个人体验", price: 0, billing_cycle: "monthly", features: [], status: "active", sort_order: 1, created_at: "2026-01-01T00:00:00" },
  { id: 2, name: "基础版", description: "每月 100 万 Token + 标准支持", price: 9900, billing_cycle: "monthly", features: [], status: "active", sort_order: 2, created_at: "2026-01-01T00:00:00" },
  { id: 3, name: "专业版", description: "每月 1000 万 Token + 优先支持", price: 99000, billing_cycle: "monthly", features: [], status: "active", sort_order: 3, created_at: "2026-01-01T00:00:00" },
  { id: 4, name: "高级版", description: "每月 5000 万 Token + 专属客户经理", price: 29900, billing_cycle: "monthly", features: [], status: "inactive", sort_order: 4, created_at: "2026-01-01T00:00:00" },
  { id: 5, name: "企业版", description: "定制化方案 + SLA 保障", price: 99900, billing_cycle: "yearly", features: [], status: "active", sort_order: 5, created_at: "2026-01-01T00:00:00" },
];
const MOCK_SUBS: Subscriber[] = [
  { id: 1, user_id: 1001, username: "用户小王", plan_id: 2, plan_name: "基础版", status: "active", started_at: "2026-07-01T00:00:00", expires_at: "2026-08-01T00:00:00" },
  { id: 2, user_id: 1002, username: "用户小李", plan_id: 3, plan_name: "专业版", status: "active", started_at: "2026-06-15T00:00:00", expires_at: "2026-09-15T00:00:00" },
  { id: 3, user_id: 1003, username: "用户小张", plan_id: 1, plan_name: "免费版", status: "expired", started_at: "2026-01-01T00:00:00", expires_at: "2026-02-01T00:00:00" },
];

export default function AdminSubscriptionPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"plans" | "subscribers">("plans");
  // 演示兜底：本地可变列表（写操作在演示模式下直接改它）
  const [plans, setPlans] = useState<Plan[]>(MOCK_PLANS);
  const [subs, setSubs] = useState<Subscriber[]>(MOCK_SUBS);
  const [demo, setDemo] = useState(true);
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
      setDemo(false);
    } catch (e: any) {
      // 演示模式：后端未实现时保持本地演示数据
      if (e?.response?.status === 404) {
        setPlans(MOCK_PLANS);
        setSubs(MOCK_SUBS);
      }
    }
  }

  async function savePlan() {
    try {
      if (editing) {
        await api.put(`/admin/subscription/plans/${editing.id}`, editing);
        toast.success("计划已更新");
      } else {
        await api.post("/admin/subscription/plans", form);
        toast.success("计划已创建");
        setShowNew(false);
      }
      setEditing(null); loadData();
    } catch (e: any) {
      // 演示模式：后端未实现时本地生效
      if (e?.response?.status === 404) {
        if (editing) {
          setPlans(prev => prev.map(p => p.id === editing.id ? { ...p, ...editing } : p));
          toast.success("计划已更新（演示）");
        } else {
          const np: Plan = { id: Date.now(), name: form.name ?? "", description: form.description ?? "", price: form.price ?? 0, billing_cycle: form.billing_cycle ?? "monthly", features: form.features ?? [], status: "active", sort_order: form.sort_order ?? 0, created_at: new Date().toISOString() };
          setPlans(prev => [...prev, np]);
          toast.success("计划已创建（演示）");
          setShowNew(false);
        }
        setEditing(null);
      } else {
        toast.error(extractError(e));
      }
    }
  }

  async function togglePlanStatus(id: number, status: string) {
    try {
      await api.put(`/admin/subscription/plans/${id}`, { status: status === "active" ? "inactive" : "active" });
      toast.success("状态已切换");
      loadData();
    } catch (e: any) {
      // 演示模式：后端未实现时本地生效
      if (e?.response?.status === 404) {
        const ns = status === "active" ? "inactive" : "active";
        setPlans(prev => prev.map(p => p.id === id ? { ...p, status: ns } : p));
        toast.success(ns === "active" ? "已启用（演示）" : "已停用（演示）");
      } else {
        toast.error(extractError(e));
      }
    }
  }

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>📦</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>订阅计划管理
          <HelpIcon text="管理平台订阅计划（月付/年付），查看订阅用户列表。支持创建、编辑、启停计划。" level="page" />
        </span>
        {demo && <span style={{ fontSize: 11, color: "#fef08a" }}>⚠️ 演示数据（后端 /admin/subscription 待接入）</span>}
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
                    <StatusBadge status={s.status === "active" ? "success" : s.status === "expired" ? "danger" : "warning"}>{s.status === "active" ? "生效中" : s.status === "expired" ? "已过期" : s.status}</StatusBadge>
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
