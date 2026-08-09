import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, Modal, SkeletonGroup, useToast } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

export default function AdminBalanceAlertPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editConfig, setEditConfig] = useState<any>(null);

  const alertsQ = useQuery({
    queryKey: ["admin-balance-alerts"],
    queryFn: async () => (await api.get("/admin/balance-alerts")).data.data,
  });

  const configQ = useQuery({
    queryKey: ["admin-balance-alert-config"],
    queryFn: async () => (await api.get("/admin/balance-alert-config")).data.data,
  });

  const saveConfigMut = useMutation({
    mutationFn: async (body: any) => (await api.put("/admin/balance-alert-config", body)).data,
    onSuccess: () => { toast.success("配置已保存"); setEditConfig(null); qc.invalidateQueries({ queryKey: ["admin-balance-alert-config"] }); },
    onError: (e: any) => toast.error(extractError(e)),
  });

  const notifyMut = useMutation({
    mutationFn: async (userId: number) => (await api.post(`/admin/balance-alerts/${userId}/notify`, {})).data,
    onSuccess: () => { toast.success("提醒已发送"); qc.invalidateQueries({ queryKey: ["admin-balance-alerts"] }); },
    onError: (e: any) => toast.error(extractError(e)),
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>余额预警</h2>
        <HelpIcon text="balance_alert" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 20 }}>
        {[{ icon: "⚠️", label: "余额不足用户", value: alertsQ.data?.summary?.low_balance_count ?? "—", color: "#e53935" },
          { icon: "🔴", label: "已耗尽", value: alertsQ.data?.summary?.exhausted_count ?? "—", color: "#e53935" },
          { icon: "🟡", label: "即将不足", value: alertsQ.data?.summary?.warning_count ?? "—", color: "#f59e0b" },
          { icon: "🔔", label: "今日提醒", value: alertsQ.data?.summary?.notified_today ?? "—", color: "#4f6ef7" },
        ].map((s, i) => (
          <div key={i} style={{ ...card, borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontWeight: 600 }}>⚙️ 预警配置 <HelpIcon text="balance_alert" /></span>
          <button style={{ ...btnBase, background: "#fff", border: "1px solid #ddd", fontSize: 12 }}
            onClick={() => setEditConfig(configQ.data ?? { warning_threshold: 10, critical_threshold: 0 })}>修改配置</button>
        </div>
        <div style={{ display: "flex", gap: 24, fontSize: 13, color: "#666" }}>
          <span>🟡 警告阈值: ¥{configQ.data?.warning_threshold ?? 10}</span>
          <span>🔴 严重阈值: ¥{configQ.data?.critical_threshold ?? 0}</span>
          <span>📱 通知方式: {configQ.data?.notify_methods?.join(", ") ?? "站内信, 邮件"}</span>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>⚠️ 余额预警列表 <HelpIcon text="balance_alert" /></div>
        {alertsQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>用户</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>当前余额</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>近7日消费</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>预估耗尽</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>状态</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>上次提醒</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
            </tr></thead>
            <tbody>
              {(alertsQ.data?.list ?? []).map((a: any) => (
                <tr key={a.user_id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{a.user_email}</td>
                  <td style={{ padding: "10px 12px", color: a.balance <= 0 ? "#e53935" : a.balance <= 10 ? "#f59e0b" : "#333", fontWeight: 600 }}>
                    ¥{a.balance}
                  </td>
                  <td style={{ padding: "10px 12px" }}>¥{a.week_spend}</td>
                  <td style={{ padding: "10px 12px", color: "#888" }}>{a.exhaustion_estimate ?? "—"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 11, background: a.balance <= 0 ? "#fce4ec" : a.balance <= 10 ? "#fff8e1" : "#e8f5e9",
                      color: a.balance <= 0 ? "#c62828" : a.balance <= 10 ? "#e65100" : "#2e7d32" }}>
                      {a.balance <= 0 ? "已耗尽" : a.balance <= 10 ? "即将不足" : "正常"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{a.last_notified ?? "—"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <button style={{ ...btnBase, background: "#4f6ef7", color: "#fff", fontSize: 12 }}
                      onClick={() => notifyMut.mutate(a.user_id)}>发送提醒</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editConfig && (
        <Modal open onClose={() => setEditConfig(null)} title="余额预警配置">
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 10 }}>
            <label>警告阈值 (¥) <input type="number" value={editConfig.warning_threshold || 0}
              onChange={e => setEditConfig({ ...editConfig, warning_threshold: Number(e.target.value) })}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%" }} /></label>
            <label>严重阈值 (¥) <input type="number" value={editConfig.critical_threshold || 0}
              onChange={e => setEditConfig({ ...editConfig, critical_threshold: Number(e.target.value) })}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%" }} /></label>
            <button style={{ ...btnBase, background: "#4f6ef7", color: "#fff", marginTop: 8 }}
              onClick={() => saveConfigMut.mutate(editConfig)}>保存配置</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
