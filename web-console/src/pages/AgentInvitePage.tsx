import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, useToast, CopyButton } from "@3cloud/shared-ui";

interface InviteRecord { id: number; invite_code: string; invitee_name: string; invitee_email: string; status: string; reward_amount: number; created_at: string; }

export default function AgentInvitePage() {
  const { toast } = useToast();
  const [inviteCode, setInviteCode] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [records, setRecords] = useState<InviteRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/agent/invite/code").then(r => {
        const d = r.data?.data ?? {};
        setInviteCode(d.code ?? "");
        setInviteLink(d.link ?? "");
      }),
      api.get("/agent/invite/records").then(r => setRecords(r.data?.data?.list ?? [])),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function regenerateCode() {
    if (!confirm("重新生成邀请码？旧邀请码将失效。")) return;
    try {
      const r = await api.post("/agent/invite/code/regenerate", {});
      setInviteCode(r.data?.data?.code ?? "");
      setInviteLink(r.data?.data?.link ?? "");
      toast.success("邀请码已重新生成");
    } catch { toast.error("操作失败"); }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(inviteLink); toast.success("已复制邀请链接"); } catch {}
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#888" }}>加载中…</div>;

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>🔗</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>邀请管理
          <HelpIcon text="管理您的邀请码和邀请链接，查看已邀请客户列表。客户通过您的链接注册后将绑定为您名下客户。" level="page" />
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div style={{ background: "var(--color-panel)", borderRadius: 10, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <h4 style={{ margin: "0 0 16px", fontSize: 15 }}>🔗 您的邀请链接 <HelpIcon text="将此链接分享给客户，客户注册后将自动绑定为您名下。" /></h4>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1, background: "#f5f5f5", padding: "10px 14px", borderRadius: 6, fontFamily: "monospace", fontSize: 12, wordBreak: "break-all", color: "#666" }}>
              {inviteLink || "暂无邀请链接"}
            </div>
            <button onClick={copyLink} style={{ padding: "8px 16px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
              📋 复制
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#666" }}>邀请码：</span>
            <code style={{ background: "#f0f5ff", padding: "4px 12px", borderRadius: 4, fontSize: 16, fontWeight: 700, color: "#4f6ef7", letterSpacing: 2 }}>{inviteCode}</code>
            <button onClick={regenerateCode} style={{ padding: "4px 12px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-panel)", cursor: "pointer", fontSize: 12 }}>
              重新生成
              <HelpIcon text="重新生成后旧邀请码和链接将立即失效。" />
            </button>
          </div>
        </div>

        <div style={{ background: "var(--color-panel)", borderRadius: 10, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 15 }}>📋 邀请统计</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ textAlign: "center", padding: 16, background: "#f0fdf4", borderRadius: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#22c55e" }}>{records.length}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>已邀请客户</div>
            </div>
            <div style={{ textAlign: "center", padding: 16, background: "#eef2ff", borderRadius: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#4f6ef7" }}>
                ¥{(records.reduce((s, r) => s + r.reward_amount, 0) / 100).toFixed(2)}
              </div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>累计返利</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: "var(--color-panel)", borderRadius: 10, overflow: "hidden" }}>
        <h4 style={{ margin: 0, padding: "16px 20px", borderBottom: "1px solid #f0f0f0", fontSize: 15 }}>📋 邀请记录</h4>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#fafafa" }}>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>客户</th>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>邮箱</th>
            <th style={{ padding: "10px 14px", textAlign: "right" }}>返利金额</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>状态</th>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>邀请时间</th>
          </tr></thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                <td style={{ padding: "8px 14px", fontWeight: 500 }}>{r.invitee_name}</td>
                <td style={{ padding: "8px 14px", color: "#888" }}>{r.invitee_email}</td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 600, color: r.reward_amount > 0 ? "#22c55e" : "#888" }}>
                  {r.reward_amount > 0 ? `¥${(r.reward_amount / 100).toFixed(2)}` : "-"}
                </td>
                <td style={{ padding: "8px 14px", textAlign: "center" }}>
                  <span style={{ padding: "2px 10px", borderRadius: 10, fontSize: 11, background: r.status === "completed" ? "#f0fdf4" : "#fff7e6", color: r.status === "completed" ? "#22c55e" : "#f59e0b" }}>
                    {r.status === "completed" ? "已完成" : r.status === "pending" ? "待验证" : r.status}
                  </span>
                </td>
                <td style={{ padding: "8px 14px", fontSize: 12, color: "#888" }}>{new Date(r.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无邀请记录</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
