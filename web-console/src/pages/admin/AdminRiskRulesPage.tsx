import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, StatusBadge, Modal, SkeletonGroup, useToast, ConfirmPopover } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

export default function AdminRiskRulesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editItem, setEditItem] = useState<any>(null);

  const listQ = useQuery({
    queryKey: ["admin-risk-rules"],
    queryFn: async () => (await api.get("/admin/risk/rules")).data.data,
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) =>
      (await api.put(`/admin/risk/rules/${id}`, { is_enabled: enabled })).data,
    onSuccess: () => { toast.success("已更新"); qc.invalidateQueries({ queryKey: ["admin-risk-rules"] }); },
    onError: (e: any) => toast.error(extractError(e)),
  });

  const saveMut = useMutation({
    mutationFn: async (body: any) =>
      body.id ? (await api.put(`/admin/risk/rules/${body.id}`, body)).data : (await api.post("/admin/risk/rules", body)).data,
    onSuccess: () => { toast.success("已保存"); setEditItem(null); qc.invalidateQueries({ queryKey: ["admin-risk-rules"] }); },
    onError: (e: any) => toast.error(extractError(e)),
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>风控规则配置</h2>
        <HelpIcon text="risk_rules" />
      </div>

      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontWeight: 600 }}>📏 风控规则列表 <HelpIcon text="risk_rules" /></span>
          <button style={{ ...btnBase, background: "#4f6ef7", color: "#fff" }} onClick={() => setEditItem({ name: "", description: "", type: "frequency", threshold: 0, action: "block" })}>＋ 新增规则</button>
        </div>
        {listQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>规则名</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>类型</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>阈值</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>动作</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>状态</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
            </tr></thead>
            <tbody>
              {(listQ.data?.list ?? []).map((r: any) => (
                <tr key={r.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{r.name}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {({ frequency: "高频调用", ip_anomaly: "异常IP", multi_account: "多账号关联", abnormal_spend: "异常消费", geo_anomaly: "地域异常" } as Record<string, string>)[r.type] ?? r.type}
                  </td>
                  <td style={{ padding: "10px 12px" }}>{r.threshold ?? "—"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {({ block: "⛔ 阻断", warn: "⚠️ 告警", freeze: "❄️ 冻结", review: "📋 人工审核" } as Record<string, string>)[r.action] ?? r.action}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <StatusBadge status={r.is_enabled ? "success" : "default"}>{r.is_enabled ? "启用" : "禁用"}</StatusBadge>
                  </td>
                  <td style={{ padding: "10px 12px", display: "flex", gap: 4 }}>
                    <button style={{ ...btnBase, background: "#fff", border: "1px solid #ddd", fontSize: 12 }}
                      onClick={() => setEditItem(r)}>编辑</button>
                    <ConfirmPopover title={r.is_enabled ? "禁用该规则？" : "启用该规则？"}
                      onConfirm={() => toggleMut.mutate({ id: r.id, enabled: !r.is_enabled })}>
                      <button style={{ ...btnBase, background: r.is_enabled ? "#f0f0f0" : "#4f6ef7", color: r.is_enabled ? "#333" : "#fff", fontSize: 12 }}>
                        {r.is_enabled ? "禁用" : "启用"}
                      </button>
                    </ConfirmPopover>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editItem && (
        <Modal open onClose={() => setEditItem(null)} title={editItem.id ? "编辑风控规则" : "新增风控规则"}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 10 }}>
            <label>规则名称 <input value={editItem.name || ""} onChange={e => setEditItem({ ...editItem, name: e.target.value })}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%" }} /></label>
            <label>描述 <textarea value={editItem.description || ""} onChange={e => setEditItem({ ...editItem, description: e.target.value })}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", minHeight: 60 }} /></label>
            <label>类型
              <select value={editItem.type || ""} onChange={e => setEditItem({ ...editItem, type: e.target.value })}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%" }}>
                <option value="frequency">高频调用</option>
                <option value="ip_anomaly">异常IP</option>
                <option value="multi_account">多账号关联</option>
                <option value="abnormal_spend">异常消费</option>
                <option value="geo_anomaly">地域异常</option>
              </select>
            </label>
            <label>阈值 <input type="number" value={editItem.threshold || 0} onChange={e => setEditItem({ ...editItem, threshold: Number(e.target.value) })}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%" }} /></label>
            <label>动作
              <select value={editItem.action || ""} onChange={e => setEditItem({ ...editItem, action: e.target.value })}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%" }}>
                <option value="warn">告警</option>
                <option value="block">阻断</option>
                <option value="freeze">冻结</option>
                <option value="review">人工审核</option>
              </select>
            </label>
            <button style={{ ...btnBase, background: "#4f6ef7", color: "#fff", marginTop: 8 }}
              onClick={() => saveMut.mutate(editItem)}>保存</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
