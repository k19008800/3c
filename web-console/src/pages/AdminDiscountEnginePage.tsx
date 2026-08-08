import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, useToast } from "@3cloud/shared-ui";

interface DiscountRule { id: number; name: string; discount_type: string; discount_value: number; conditions: string; priority: number; enabled: boolean; start_date: string; end_date: string; }

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <div style={{ width: 44, height: 24, borderRadius: 12, background: on ? "#22c55e" : "#d9d9d9", position: "relative", cursor: "pointer", display: "inline-flex", alignItems: "center", flexShrink: 0 }} onClick={() => onChange(!on)}>
    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: 3, transform: on ? "translateX(20px)" : "translateX(0)", transition: "transform .2s" }} />
  </div>
);

export default function AdminDiscountEnginePage() {
  const { toast } = useToast();
  const [rules, setRules] = useState<DiscountRule[]>([]);
  const [editing, setEditing] = useState<DiscountRule | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<Partial<DiscountRule>>({ name: "", discount_type: "percentage", discount_value: 0, conditions: "{}", priority: 0, enabled: true, start_date: "", end_date: "" });

  useEffect(() => {
    api.get("/admin/discount-rules").then(r => setRules(r.data?.data?.list ?? [])).catch(() => {});
  }, []);

  async function toggleRule(id: number, enabled: boolean) {
    await api.put(`/admin/discount-rules/${id}`, { enabled });
    setRules(rules.map(r => r.id === id ? {...r, enabled} : r));
    toast.success(enabled ? "规则已启用" : "规则已禁用");
  }

  async function saveRule() {
    if (editing) {
      await api.put(`/admin/discount-rules/${editing.id}`, editing);
      toast.success("规则已更新");
    } else {
      await api.post("/admin/discount-rules", form);
      toast.success("规则已创建");
      setShowNew(false);
    }
    setEditing(null);
    const r = await api.get("/admin/discount-rules");
    setRules(r.data?.data?.list ?? []);
  }

  async function deleteRule(id: number) {
    if (!confirm("确认删除此折扣规则？")) return;
    await api.post(`/admin/discount-rules/${id}/delete`, {});
    toast.success("已删除");
    setRules(rules.filter(r => r.id !== id));
  }

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>🎫</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>折扣规则引擎
          <HelpIcon text="配置灵活的折扣规则（满减/百分比/固定折扣），按条件匹配自动计算折扣。支持多规则优先级排序。" level="page" />
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={() => { setShowNew(true); setForm({ name: "", discount_type: "percentage", discount_value: 0, conditions: "{}", priority: 0, enabled: true, start_date: "", end_date: "" }); }}
          style={{ padding: "6px 16px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>+ 新建规则</button>
      </div>

      {showNew && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <h4 style={{ margin: "0 0 12px" }}>新建折扣规则</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <input placeholder="规则名称" value={form.name} onChange={e => setForm({...form, name: e.target.value})} style={{ padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }} />
            <select value={form.discount_type} onChange={e => setForm({...form, discount_type: e.target.value})} style={{ padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }}>
              <option value="percentage">按比例折扣</option><option value="fixed">固定减免</option><option value="threshold">满减</option>
            </select>
            <input type="number" placeholder="折扣值" value={form.discount_value} onChange={e => setForm({...form, discount_value: Number(e.target.value)})} style={{ padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }} />
            <input type="number" placeholder="优先级 (数字越小越优先)" value={form.priority} onChange={e => setForm({...form, priority: Number(e.target.value)})} style={{ padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }} />
            <input type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} style={{ padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }} />
            <input type="date" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} style={{ padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }} />
            <div style={{ gridColumn: "1/-1" }}>
              <textarea placeholder={`条件 JSON (如 {"min_amount": 100, "user_level": "vip"})`} value={form.conditions}
                onChange={e => setForm({...form, conditions: e.target.value})}
                style={{ width: "100%", minHeight: 60, padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6, fontFamily: "monospace", fontSize: 13, boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => { setEditing({...form as DiscountRule, id: 0} as DiscountRule); saveRule(); }} style={{ padding: "6px 16px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>创建</button>
            <button onClick={() => setShowNew(false)} style={{ padding: "6px 16px", background: "var(--color-border)", border: "none", borderRadius: 6, cursor: "pointer" }}>取消</button>
          </div>
        </div>
      )}

      <div style={{ background: "var(--color-panel)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#fafafa" }}>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>规则名称</th>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>类型</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>折扣值</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>优先级</th>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>有效期</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>状态</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>操作</th>
          </tr></thead>
          <tbody>
            {rules.map(r => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                <td style={{ padding: "8px 14px", fontWeight: 600 }}>{r.name}</td>
                <td style={{ padding: "8px 14px" }}>
                  <span style={{ padding: "2px 10px", borderRadius: 10, fontSize: 11, background: "#f0f5ff", color: "#4f6ef7" }}>
                    {r.discount_type === "percentage" ? "比例折扣" : r.discount_type === "fixed" ? "固定减免" : "满减"}
                  </span>
                </td>
                <td style={{ padding: "8px 14px", textAlign: "center", fontWeight: 600 }}>
                  {r.discount_type === "percentage" ? `${r.discount_value}%` : `¥${r.discount_value}`}
                </td>
                <td style={{ padding: "8px 14px", textAlign: "center" }}>{r.priority}</td>
                <td style={{ padding: "8px 14px", fontSize: 12 }}>{r.start_date ? `${r.start_date} ~ ${r.end_date || "永久"}` : "长期有效"}</td>
                <td style={{ padding: "8px 14px", textAlign: "center" }}>
                  <Toggle on={r.enabled} onChange={v => toggleRule(r.id, v)} />
                </td>
                <td style={{ padding: "8px 14px", textAlign: "center" }}>
                  <button onClick={() => setEditing(r)} style={{ padding: "2px 10px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-panel)", cursor: "pointer", marginRight: 4 }}>编辑</button>
                  <button onClick={() => deleteRule(r.id)} style={{ padding: "2px 10px", border: "1px solid #e53935", borderRadius: 4, background: "var(--color-panel)", color: "#e53935", cursor: "pointer" }}>删除</button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无折扣规则</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
