import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, Table, StatusBadge, Modal, useToast } from "@3cloud/shared-ui";

interface UndoRecord { id: number; operation_type: string; operation_label: string; target_type: string; target_id: number; operator_id: number; operator_name: string; snapshot: any; reverted: boolean; expires_at: string; created_at: string; }

const TYPE_MAP: Record<string, { label: string; color: string }> = {
  user_delete: { label: "删除用户", color: "#e53935" },
  user_edit: { label: "编辑用户", color: "#fa8c16" },
  user_disable: { label: "禁用用户", color: "#f59e0b" },
  balance_adjust: { label: "余额调整", color: "#4f6ef7" },
  role_assign: { label: "角色分配", color: "#722ed1" },
  vendor_delete: { label: "删除供应商", color: "#e53935" },
  model_delete: { label: "删除模型", color: "#e53935" },
  config_edit: { label: "配置修改", color: "#13c2c2" },
};

const card: React.CSSProperties = { background: "var(--color-panel)", borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

export default function AdminUndoPage() {
  const { toast } = useToast();
  const [records, setRecords] = useState<UndoRecord[]>([]);
  const [timeoutSec, setTimeoutSec] = useState(300);
  const [enabledTypes, setEnabledTypes] = useState<string[]>([]);
  const [detail, setDetail] = useState<UndoRecord | null>(null);
  const [tab, setTab] = useState<"log" | "config">("log");

  useEffect(() => {
    api.get("/admin/undo/records").then(r => setRecords(r.data?.data?.list ?? [])).catch(() => {});
    api.get("/admin/undo/config").then(r => {
      const c = r.data?.data ?? {};
      setTimeoutSec(c.timeout_seconds ?? 300);
      setEnabledTypes(c.enabled_types ?? Object.keys(TYPE_MAP));
    }).catch(() => {});
  }, []);

  async function undoRecord(id: number) {
    try {
      await api.post(`/admin/undo/${id}/execute`, {});
      toast.success("撤销操作已执行");
      const r = await api.get("/admin/undo/records");
      setRecords(r.data?.data?.list ?? []);
    } catch (e: any) { toast.error(e?.response?.data?.message ?? "撤销失败"); }
  }

  async function saveConfig() {
    await api.put("/admin/undo/config", { timeout_seconds: timeoutSec, enabled_types: enabledTypes });
    toast.success("撤销配置已保存");
  }

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>↩️</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>撤销操作日志
          <HelpIcon text="记录管理员的敏感操作快照，支持在有效时间内一键撤销。配置哪些操作类型可撤销及撤销窗口时长。" level="page" />
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab("log")} style={{ padding: "8px 20px", borderRadius: 8, border: tab === "log" ? "2px solid #4f6ef7" : "1px solid var(--color-border)", background: tab === "log" ? "#eef2ff" : "var(--color-panel)", color: tab === "log" ? "#4f6ef7" : "#666", cursor: "pointer", fontWeight: 600 }}>📋 撤销记录</button>
        <button onClick={() => setTab("config")} style={{ padding: "8px 20px", borderRadius: 8, border: tab === "config" ? "2px solid #4f6ef7" : "1px solid var(--color-border)", background: tab === "config" ? "#eef2ff" : "var(--color-panel)", color: tab === "config" ? "#4f6ef7" : "#666", cursor: "pointer", fontWeight: 600 }}>⚙️ 撤销配置</button>
      </div>

      {tab === "log" && (
        <div style={{ background: "var(--color-panel)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <th style={{ padding: "10px 14px", textAlign: "left" }}>操作时间</th>
                <th style={{ padding: "10px 14px", textAlign: "left" }}>操作类型</th>
                <th style={{ padding: "10px 14px", textAlign: "left" }}>操作人</th>
                <th style={{ padding: "10px 14px", textAlign: "left" }}>目标ID</th>
                <th style={{ padding: "10px 14px", textAlign: "center" }}>状态</th>
                <th style={{ padding: "10px 14px", textAlign: "center" }}>可撤销截止</th>
                <th style={{ padding: "10px 14px", textAlign: "center" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => {
                const t = TYPE_MAP[r.operation_type];
                const expired = new Date(r.expires_at) < new Date();
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ padding: "8px 14px", fontSize: 12, color: "#888" }}>{new Date(r.created_at).toLocaleString()}</td>
                    <td style={{ padding: "8px 14px" }}>
                      <span style={{ padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 500, background: `${t?.color ?? "#888"}20`, color: t?.color ?? "#888" }}>{t?.label ?? r.operation_type}</span>
                    </td>
                    <td style={{ padding: "8px 14px" }}>{r.operator_name}</td>
                    <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 12 }}>#{r.target_id}</td>
                    <td style={{ padding: "8px 14px", textAlign: "center" }}>
                      {r.reverted ? <span style={{ color: "#22c55e" }}>✅ 已撤销</span> : expired ? <span style={{ color: "#888" }}>⏰ 已过期</span> : <span style={{ color: "#f59e0b" }}>🟡 可撤销</span>}
                    </td>
                    <td style={{ padding: "8px 14px", textAlign: "center", fontSize: 12, color: "#888" }}>{new Date(r.expires_at).toLocaleString()}</td>
                    <td style={{ padding: "8px 14px", textAlign: "center" }}>
                      <button onClick={() => setDetail(r)} style={{ padding: "2px 10px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-panel)", cursor: "pointer", marginRight: 4 }}>详情</button>
                      {!r.reverted && !expired && (
                        <button onClick={() => undoRecord(r.id)} style={{ padding: "2px 10px", border: "1px solid #22c55e", borderRadius: 4, background: "#f0fdf4", color: "#22c55e", cursor: "pointer", fontWeight: 600 }}>
                          撤销 <HelpIcon text={`恢复到 ${r.operation_label} 操作之前的状态。此操作不可逆。`} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {records.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无撤销记录</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "config" && (
        <div style={card}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>⚙️ 撤销窗口配置 <HelpIcon text="配置撤销窗口时长（秒）和哪些操作类型可以撤销。" /></h3>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
            <span style={{ width: 140, fontSize: 13, color: "#666" }}>撤销窗口 (秒)</span>
            <input type="number" value={timeoutSec} onChange={e => setTimeoutSec(Number(e.target.value))}
              style={{ width: 100, padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4, textAlign: "center" }} />
            <span style={{ fontSize: 12, color: "#888" }}>操作后在此时间内可撤销，建议 300-600 秒</span>
          </div>
          <div style={{ padding: "12px 0" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>可撤销操作类型 <HelpIcon text="勾选的操作类型将在执行时自动记录快照，支持在窗口期内撤销。" /></span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              {Object.entries(TYPE_MAP).map(([key, val]) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", border: `2px solid ${enabledTypes.includes(key) ? val.color : "#d9d9d9"}`, borderRadius: 6, cursor: "pointer", background: enabledTypes.includes(key) ? `${val.color}10` : "transparent" }}>
                  <input type="checkbox" checked={enabledTypes.includes(key)} onChange={() => setEnabledTypes(enabledTypes.includes(key) ? enabledTypes.filter(t => t !== key) : [...enabledTypes, key])} />
                  <span style={{ fontSize: 12, color: enabledTypes.includes(key) ? val.color : "#888" }}>{val.label}</span>
                </label>
              ))}
            </div>
          </div>
          <button onClick={saveConfig} style={{ marginTop: 12, padding: "8px 24px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>保存配置</button>
        </div>
      )}

      {/* Detail Modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={`操作快照详情 — #${detail?.id ?? ""}`}>
        {detail && (
          <div style={{ fontSize: 13 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              <div><span style={{ color: "#888" }}>操作类型：</span>{TYPE_MAP[detail.operation_type]?.label ?? detail.operation_type}</div>
              <div><span style={{ color: "#888" }}>操作人：</span>{detail.operator_name}</div>
              <div><span style={{ color: "#888" }}>目标类型：</span>{detail.target_type}</div>
              <div><span style={{ color: "#888" }}>目标ID：</span>#{detail.target_id}</div>
              <div><span style={{ color: "#888" }}>操作时间：</span>{new Date(detail.created_at).toLocaleString()}</div>
              <div><span style={{ color: "#888" }}>过期时间：</span>{new Date(detail.expires_at).toLocaleString()}</div>
            </div>
            <div style={{ background: "#1e1e1e", color: "#d4d4d4", padding: 12, borderRadius: 6, fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto" }}>
              {JSON.stringify(detail.snapshot, null, 2)}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
