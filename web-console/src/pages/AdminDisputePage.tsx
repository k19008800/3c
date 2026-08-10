import { useState, useEffect } from "react";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, useToast } from "@3cloud/shared-ui";

interface Dispute { id: number; dispute_no: string; user_id: number; username: string; amount: number; reason: string; status: string; status_label: string; handler_id: number | null; handler_name: string | null; resolution: string | null; created_at: string; updated_at: string; }

/* ───────── 演示数据（后端 /admin/disputes 待接入） ───────── */
const MOCK_DISPUTES: Dispute[] = [
  { id: 1, dispute_no: "DS20260810001", user_id: 1001, username: "用户小王", amount: 5000, reason: "重复扣费，同一请求计费两次", status: "pending", status_label: "待处理", handler_id: null, handler_name: null, resolution: null, created_at: "2026-08-10 09:15:00", updated_at: "2026-08-10 09:15:00" },
  { id: 2, dispute_no: "DS20260809003", user_id: 1002, username: "用户小李", amount: 12800, reason: "费用不符，账单金额与预估不一致", status: "investigating", status_label: "调查中", handler_id: 1, handler_name: "张明", resolution: null, created_at: "2026-08-09 16:40:00", updated_at: "2026-08-10 08:30:00" },
  { id: 3, dispute_no: "DS20260808002", user_id: 1003, username: "用户小张", amount: 3000, reason: "误扣费，未使用该模型但产生费用", status: "refunded", status_label: "已退款", handler_id: 1, handler_name: "张明", resolution: "系统日志确认重复计费，已退款", created_at: "2026-08-08 11:00:00", updated_at: "2026-08-08 14:20:00" },
  { id: 4, dispute_no: "DS20260807001", user_id: 1004, username: "用户小赵", amount: 990, reason: "服务不可用仍计费", status: "dismissed", status_label: "已驳回", handler_id: 2, handler_name: "李芳", resolution: "调用日志正常，无重复计费", created_at: "2026-08-07 10:30:00", updated_at: "2026-08-07 13:00:00" },
];

export default function AdminDisputePage() {
  const { toast } = useToast();
  const [disputes, setDisputes] = useState<Dispute[]>(MOCK_DISPUTES);
  const [filter, setFilter] = useState("");
  const [handling, setHandling] = useState<Dispute | null>(null);
  const [resolution, setResolution] = useState("");
  const [demo, setDemo] = useState(true);

  useEffect(() => {
    api.get("/admin/disputes", { params: { status: filter || undefined } })
      .then(r => { setDisputes(r.data?.data?.list ?? []); setDemo(false); }).catch(() => { /* 演示模式保持本地数据 */ });
  }, [filter]);

  async function handleDispute(action: "refund" | "dismiss") {
    if (!handling) return;
    try {
      await api.post(`/admin/disputes/${handling.id}/resolve`, { action, resolution, refund_amount: action === "refund" ? handling.amount : 0 });
      toast.success(action === "refund" ? "已退款处理" : "已驳回争议");
    } catch (e: any) {
      // 演示模式：后端未实现时本地生效
      if (e?.response?.status === 404 && demo) {
        setDisputes(prev => prev.map(d => d.id === handling.id ? { ...d, status: action === "refund" ? "refunded" : "dismissed", status_label: action === "refund" ? "已退款" : "已驳回", handler_name: "当前管理员", resolution } : d));
        toast.success(action === "refund" ? "已退款处理（演示）" : "已驳回争议（演示）");
      } else {
        toast.error(extractError(e));
      }
    }
    setHandling(null); setResolution("");
    if (!demo) {
      const r = await api.get("/admin/disputes", { params: { status: filter || undefined } });
      setDisputes(r.data?.data?.list ?? []);
    }
  }

  const statusBadge = (s: string, l: string) => {
    const map: Record<string, ["success" | "warning" | "danger" | "info" | "default", string]> = {
      pending: ["warning", "待处理"], investigating: ["info", "调查中"], refunded: ["success", "已退款"], dismissed: ["default", "已驳回"],
    };
    const [v, label] = map[s] ?? ["default" as const, l ?? s];
    return <StatusBadge status={v}>{label}</StatusBadge>;
  };

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>⚖️</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>消费争议处理
          <HelpIcon text="处理用户发起的消费争议（误扣费/费用不符等）。支持调查、退款、驳回全流程。" level="page" />
        </span>
        {demo && <span style={{ fontSize: 11, color: "#fef08a" }}>⚠️ 演示数据（后端 /admin/disputes 待接入）</span>}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "#666" }}>状态:</span>
        {["", "pending", "investigating", "refunded", "dismissed"].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: "4px 14px", borderRadius: 14, border: filter === s ? "2px solid #4f6ef7" : "1px solid var(--color-border)",
            background: filter === s ? "#eef2ff" : "var(--color-panel)", color: filter === s ? "#4f6ef7" : "#666", cursor: "pointer", fontSize: 12,
          }}>{s === "" ? "全部" : s === "pending" ? "待处理" : s === "investigating" ? "调查中" : s === "refunded" ? "已退款" : "已驳回"}</button>
        ))}
      </div>

      <div style={{ background: "var(--color-panel)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#fafafa" }}>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>编号</th>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>用户</th>
            <th style={{ padding: "10px 14px", textAlign: "right" }}>争议金额</th>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>原因</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>状态</th>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>处理人</th>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>发起时间</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>操作</th>
          </tr></thead>
          <tbody>
            {disputes.map(d => (
              <tr key={d.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 12, color: "#4f6ef7" }}>#{d.dispute_no ?? d.id}</td>
                <td style={{ padding: "8px 14px" }}>{d.username}</td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 600, color: "#e53935" }}>¥{(d.amount / 100).toFixed(2)}</td>
                <td style={{ padding: "8px 14px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#666" }}>{d.reason}</td>
                <td style={{ padding: "8px 14px", textAlign: "center" }}>{statusBadge(d.status, d.status_label)}</td>
                <td style={{ padding: "8px 14px" }}>{d.handler_name ?? "-"}</td>
                <td style={{ padding: "8px 14px", fontSize: 12, color: "#888" }}>{new Date(d.created_at).toLocaleString()}</td>
                <td style={{ padding: "8px 14px", textAlign: "center" }}>
                  {(d.status === "pending" || d.status === "investigating") && (
                    <button onClick={() => { setHandling(d); setResolution(""); }} style={{ padding: "4px 12px", border: "1px solid #4f6ef7", borderRadius: 4, background: "#eef2ff", color: "#4f6ef7", cursor: "pointer" }}>
                      处理 <HelpIcon text="调查争议后执行退款或驳回。" />
                    </button>
                  )}
                  {d.status !== "pending" && d.status !== "investigating" && (
                    <span style={{ fontSize: 12, color: "#888" }}>{d.resolution ?? "-"}</span>
                  )}
                </td>
              </tr>
            ))}
            {disputes.length === 0 && <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无争议记录</td></tr>}
          </tbody>
        </table>
      </div>

      {handling && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setHandling(null)}>
          <div style={{ background: "#fff", borderRadius: 10, padding: 24, maxWidth: 520, width: "90%" }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px" }}>处理争议 #{handling.dispute_no ?? handling.id}</h3>
            <div style={{ background: "#fafafa", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
              <div style={{ marginBottom: 4 }}><span style={{ color: "#888" }}>用户：</span>{handling.username}</div>
              <div style={{ marginBottom: 4 }}><span style={{ color: "#888" }}>争议金额：</span><span style={{ color: "#e53935", fontWeight: 600 }}>¥{(handling.amount / 100).toFixed(2)}</span></div>
              <div><span style={{ color: "#888" }}>原因：</span>{handling.reason}</div>
            </div>
            <textarea value={resolution} onChange={e => setResolution(e.target.value)}
              style={{ width: "100%", minHeight: 80, padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
              placeholder="处理备注/调查结果（必填）" />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button onClick={() => setHandling(null)} style={{ padding: "8px 16px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-panel)", cursor: "pointer" }}>取消</button>
              <button onClick={() => handleDispute("dismiss")} style={{ padding: "8px 16px", background: "#666", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>驳回争议</button>
              <button onClick={() => handleDispute("refund")} style={{ padding: "8px 16px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>退款 ¥{(handling.amount / 100).toFixed(2)}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
