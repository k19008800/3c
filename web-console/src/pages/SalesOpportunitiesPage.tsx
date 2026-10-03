import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, EmptyState, SkeletonGroup, useToast } from "@3cloud/shared-ui";
import "./console-misc.css";

/**
 * 销售 — 商机看板（CRM §11.4）
 * - 按阶段分列的 Kanban：方案 → 谈判 → 成交 / 丢单
 * - 卡片显示商机名 / 公司 / 预估合同额 / 预计成交日
 * - 卡片内下拉直接推进阶段
 * - 新增商机（内联表单）
 */

const BTN_BASE: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 6, border: "none",
  cursor: "pointer", fontWeight: 600, fontSize: 13,
};

const STAGES = [
  { key: "proposal", label: "方案", color: "#6a8aff" },
  { key: "negotiation", label: "谈判", color: "#f59e0b" },
  { key: "closed_won", label: "成交", color: "#10b981" },
  { key: "closed_lost", label: "丢单", color: "#ef4444" },
] as const;

export default function SalesOpportunitiesPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", expected_value_cents: "", expected_close_date: "" });
  const { toast } = useToast();

  const q = useQuery({
    queryKey: ["me-crm-opportunities"],
    queryFn: async () => (await api.get("/me/crm/opportunities")).data.data,
  });

  const qc = useQueryClient();

  const createMut = useMutation({
    mutationFn: async (d: typeof form) =>
      (await api.post("/me/crm/opportunities", {
        name: d.name,
        expected_value_cents: Number(d.expected_value_cents || 0) * 100,
        expected_close_date: d.expected_close_date || undefined,
      })).data,
    onSuccess: () => {
      toast.success("商机已创建");
      qc.invalidateQueries({ queryKey: ["me-crm-opportunities"] });
      setShowForm(false);
      setForm({ name: "", expected_value_cents: "", expected_close_date: "" });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const stageMut = useMutation({
    mutationFn: async ({ id, stage }: { id: number; stage: string }) =>
      (await api.put(`/me/crm/opportunities/${id}`, { stage })).data,
    onSuccess: () => {
      toast.success("阶段已更新");
      qc.invalidateQueries({ queryKey: ["me-crm-opportunities"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const list: any[] = q.data?.list ?? [];
  const byStage = (stage: string) => list.filter((o) => o.stage === stage);
  const totalValue = list.filter((o) => o.stage !== "closed_lost").reduce((s, o) => s + Number(o.expected_value_cents ?? 0), 0);

  return (
    <div>
      <h2 style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        商机看板
        <HelpIcon text="商机看板 — 按阶段管理销售机会（类似 Trello）。阶段：方案→谈判→成交/丢单。每张卡片显示预估合同额，可下拉直接推进阶段。确认意向的线索会自动出现在「方案」列。" level="page" />
      </h2>

      {/* 汇总 + 操作栏 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, marginTop: 8, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          在途商机 <strong style={{ color: "var(--color-text)" }}>{list.filter(o => o.stage !== "closed_won" && o.stage !== "closed_lost").length}</strong> 个 ·
          在途预估合同额 <strong style={{ color: "var(--color-primary)" }}>¥{(totalValue / 100).toLocaleString()}</strong>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          style={{ ...BTN_BASE, background: "var(--color-primary)", color: "#fff" }}>
          + 新增商机
        </button>
      </div>

      {/* 新增商机表单 */}
      {showForm && (
        <div style={{ background: "var(--color-panel)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-xl)", padding: 20, marginBottom: 16, maxWidth: 560 }}>
          <h4 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>新增商机</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input placeholder="商机名称 *" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
            <input placeholder="预估合同额（元）" type="number" value={form.expected_value_cents}
              onChange={e => setForm(f => ({ ...f, expected_value_cents: e.target.value }))} style={inputStyle} />
            <input type="date" value={form.expected_close_date}
              onChange={e => setForm(f => ({ ...f, expected_close_date: e.target.value }))} style={inputStyle} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowForm(false)} style={{ ...BTN_BASE, background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>取消</button>
              <button onClick={() => createMut.mutate(form)} disabled={!form.name}
                style={{ ...BTN_BASE, background: "var(--color-primary)", color: "#fff", opacity: !form.name ? 0.6 : 1 }}>创建商机</button>
            </div>
          </div>
        </div>
      )}

      {/* Kanban 列 */}
      {q.isLoading ? <SkeletonGroup lines={6} /> : list.length === 0 ? (
        <EmptyState title="暂无商机" description="从线索转商机，或点击「新增商机」直接录入" />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, alignItems: "start" }}>
          {STAGES.map((stage) => {
            const cards = byStage(stage.key);
            return (
              <div key={stage.key} style={{ background: "var(--color-bg)", borderRadius: "var(--radius-lg)", padding: 10, minHeight: 200 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, padding: "0 4px" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: stage.color }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{stage.label}</span>
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{cards.length}</span>
                </div>
                {cards.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", padding: "8px 4px" }}>—</div>
                ) : (
                  cards.map((o) => (
                    <div key={o.id} style={{ background: "var(--color-panel)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 12, marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{o.name}</div>
                      {o.company && <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>{o.company}</div>}
                      <div style={{ fontFamily: "monospace", fontSize: 13, color: "var(--color-primary)", marginBottom: 6 }}>
                        ¥{Number(o.expected_value_cents ?? 0).toLocaleString()}
                      </div>
                      {o.expected_close_date && (
                        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 8 }}>
                          预计 {o.expected_close_date.slice(0, 10)} 成交
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <select value={o.stage}
                          onChange={e => stageMut.mutate({ id: o.id, stage: e.target.value })}
                          style={{ flex: 1, height: 26, fontSize: 12, border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-panel)" }}>
                          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                        <button
                          onClick={() => window.location.href = `/sales/quotes?opportunity_id=${o.id}`}
                          style={{ padding: "3px 8px", fontSize: 11, borderRadius: 6, border: "1px solid var(--color-primary)", background: "var(--color-panel)", color: "var(--color-primary)", cursor: "pointer" }}>
                          报价
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)",
  fontSize: 14, width: "100%", boxSizing: "border-box",
};
