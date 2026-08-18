import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, Modal, SkeletonGroup, useToast } from "@3cloud/shared-ui";

/* ───────── 真实接口契约（GET/POST /admin/subscription/plans） ───────── */

interface Plan {
  id: number;
  name: string;
  description: string | null;
  price: number; // 单位：分
  billing_cycle: string; // monthly / yearly
  quota: Record<string, unknown>;
  status: string; // active / inactive
  sort_order: number;
  created_at: string;
}

const card: React.CSSProperties = { background: "var(--color-panel)", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <div style={{ width: 44, height: 24, borderRadius: 12, background: on ? "#22c55e" : "#d9d9d9", position: "relative", cursor: "pointer", display: "inline-flex", alignItems: "center", flexShrink: 0 }} onClick={() => onChange(!on)}>
    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: 3, transform: on ? "translateX(20px)" : "translateX(0)", transition: "transform .2s" }} />
  </div>
);

interface PlanForm {
  name: string;
  description: string;
  price_yuan: number; // 表单以元输入，保存时 ×100 转分
  billing_cycle: string;
  quotaText: string; // 每行 key=value
  sort_order: number;
}

const emptyForm: PlanForm = { name: "", description: "", price_yuan: 0, billing_cycle: "monthly", quotaText: "", sort_order: 0 };

/** 配额对象 ↔ 文本（每行 key=value）互转 */
function quotaToText(quota: Record<string, unknown>): string {
  return Object.entries(quota ?? {}).map(([k, v]) => `${k}=${String(v)}`).join("\n");
}
function textToQuota(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

export default function AdminSubscriptionPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Plan | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<PlanForm>(emptyForm);

  const plansQ = useQuery({
    queryKey: ["admin-subscription-plans"],
    queryFn: async () => (await api.get("/admin/subscription/plans")).data.data,
    retry: 0,
  });
  const plans = plansQ.data?.list ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-subscription-plans"] });

  const saveMut = useMutation<any, unknown, { id?: number; payload: Record<string, unknown> }>({
    mutationFn: async ({ id, payload }) =>
      id != null
        ? (await api.put(`/admin/subscription/plans/${id}`, payload)).data
        : (await api.post("/admin/subscription/plans", payload)).data,
    onSuccess: (_d, vars) => {
      toast.success(vars.id != null ? "计划已更新" : "计划已创建");
      setShowNew(false); setEditing(null); invalidate();
    },
    onError: (e: any) => { toast.error(extractError(e)); },
  });

  function buildPayload(): Record<string, unknown> {
    return {
      name: form.name.trim(),
      description: form.description.trim(),
      price: Math.round(form.price_yuan * 100),
      billing_cycle: form.billing_cycle,
      quota: textToQuota(form.quotaText),
      sort_order: form.sort_order,
    };
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowNew(true);
  }

  function openEdit(p: Plan) {
    setShowNew(false);
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description ?? "",
      price_yuan: p.price / 100,
      billing_cycle: p.billing_cycle,
      quotaText: quotaToText(p.quota),
      sort_order: p.sort_order,
    });
  }

  function togglePlanStatus(p: Plan) {
    saveMut.mutate({ id: p.id, payload: { status: p.status === "active" ? "inactive" : "active" } });
  }

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>📦</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>订阅计划管理
          <HelpIcon text="管理平台订阅计划（月付/年付）。支持创建、编辑、启停计划。" level="page" />
        </span>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <button onClick={openNew} style={{ padding: "6px 16px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>+ 新建计划</button>
      </div>

      {plansQ.isLoading ? <SkeletonGroup lines={4} /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {plans.map((p: Plan) => (
            <div key={p.id} style={{ ...card, border: p.status === "active" ? "1px solid var(--color-border)" : "1px solid #ddd", opacity: p.status === "active" ? 1 : 0.6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <h4 style={{ margin: 0, fontSize: 16 }}>{p.name}</h4>
                <Toggle on={p.status === "active"} onChange={() => togglePlanStatus(p)} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, margin: "8px 0", color: "#4f6ef7" }}>¥{(p.price / 100).toFixed(2)}<span style={{ fontSize: 14, fontWeight: 400, color: "#888" }}>/{p.billing_cycle === "monthly" ? "月" : "年"}</span></div>
              <p style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>{p.description || "—"}</p>
              {Object.keys(p.quota ?? {}).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                  {Object.entries(p.quota).map(([k, v]) => (
                    <span key={k} style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, background: "#eef2ff", color: "#4f6ef7" }}>{k}: {String(v)}</span>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={() => openEdit(p)} style={{ padding: "4px 12px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-panel)", cursor: "pointer", fontSize: 12 }}>编辑</button>
              </div>
            </div>
          ))}
          {plans.length === 0 && !plansQ.isLoading && <div style={{ ...card, textAlign: "center", color: "#888", padding: 40 }}>暂无订阅计划</div>}
        </div>
      )}

      {(showNew || editing) && (
        <Modal open onClose={() => { setShowNew(false); setEditing(null); }} title={editing ? `编辑套餐：${editing.name}` : "新建订阅计划"}>
          <div style={{ padding: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <input placeholder="计划名称" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }} />
              <select value={form.billing_cycle} onChange={e => setForm({ ...form, billing_cycle: e.target.value })} style={{ padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }}>
                <option value="monthly">月付</option><option value="yearly">年付</option>
              </select>
              <div>
                <span style={{ fontSize: 12, color: "#888" }}>价格 (元)</span>
                <input type="number" value={form.price_yuan} onChange={e => setForm({ ...form, price_yuan: Number(e.target.value) })} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }} />
              </div>
              <div>
                <span style={{ fontSize: 12, color: "#888" }}>排序</span>
                <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: Number(e.target.value) })} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <input placeholder="描述" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6 }} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <span style={{ fontSize: 12, color: "#888" }}>配额（每行 key=value，如 token_month=1000万）</span>
                <textarea value={form.quotaText} onChange={e => setForm({ ...form, quotaText: e.target.value })}
                  style={{ width: "100%", minHeight: 80, padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 13, fontFamily: "monospace" }}
                  placeholder={"token_month=1000万\nrequests_per_min=100"} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={() => saveMut.mutate({ id: editing?.id, payload: buildPayload() })} style={{ padding: "6px 16px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>保存</button>
              <button onClick={() => { setShowNew(false); setEditing(null); }} style={{ padding: "6px 16px", background: "var(--color-border)", border: "none", borderRadius: 6, cursor: "pointer" }}>取消</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
