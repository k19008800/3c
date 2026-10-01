import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, useToast, CopyButton } from "@3cloud/shared-ui";
import "./console-misc.css";

/** 邀请记录（P1-2 后端返回：code / status('active'|'disabled') / invitee_* / used_at） */
interface InviteRecord {
  id: number;
  code: string;
  status: string;
  invitee_name: string | null;
  invitee_email: string | null;
  used_at: string | null;
  reward_amount: number;
  created_at: string;
}

/** 营销素材（P2-2：type='marketing-material' 且 status='published'） */
interface MarketingMaterial {
  id: number;
  slug: string;
  title: string;
  content: string;
  updated_at: string;
}

const INVITE_STATUS_LABEL: Record<string, string> = {
  active: "待使用",
  disabled: "已失效",
};

export default function AgentInvitePage() {
  const { toast } = useToast();
  const [inviteCode, setInviteCode] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [records, setRecords] = useState<InviteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<MarketingMaterial[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/agent/invite/code").then(r => {
        const d = r.data?.data ?? {};
        const code: string = d.code ?? "";
        setInviteCode(code);
        // 邀请链接落地：注册页预填 invite_code（web-console basename=/app）
        setInviteLink(code ? `${window.location.origin}/app/register?invite_code=${encodeURIComponent(code)}` : "");
      }),
      api.get("/agent/invite/records").then(r => setRecords(r.data?.data?.list ?? [])),
      api.get("/agent/materials").then(r => {
        setMaterials(r.data?.data?.list ?? []);
      }).catch(() => {}).finally(() => setMaterialsLoading(false)),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function regenerateCode() {
    if (!confirm("重新生成邀请码？旧邀请码将失效。")) return;
    try {
      const r = await api.post("/agent/invite/code/regenerate", {});
      const code: string = r.data?.data?.code ?? "";
      setInviteCode(code);
      setInviteLink(code ? `${window.location.origin}/app/register?invite_code=${encodeURIComponent(code)}` : "");
      toast.success("邀请码已重新生成");
    } catch { toast.error("操作失败"); }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(inviteLink); toast.success("已复制邀请链接"); } catch { /* 剪贴板权限/浏览器不支持时静默 */ }
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>加载中…</div>;

  // 已成功邀请数 = 有 used_at 的记录数（未使用的码不算）
  const invitedCount = records.filter(r => r.used_at).length;
  const totalReward = records.reduce((s, r) => s + r.reward_amount, 0);

  return (
    <div>
      <div className="cm-pagehead">
        <div className="cm-pagehead__titles">
          <div className="cm-pagehead__title">邀请管理
            <HelpIcon
              text={"适用角色：代理商\n功能定位：管理邀请码/邀请链接，跟踪邀请注册情况，复制平台营销素材。\n核心操作：复制邀请链接、重新生成邀请码、查看邀请记录、查看营销素材。\n注意事项：邀请仅作拉新激励，不自动建立客户归属；客户归属以平台报备审核划拨为准（SPEC-§8 模型对齐）。\n常见问题：Q 邀请链接打开后没有自动填入邀请码？A 请确认链接完整复制，注册页会从链接自动读取。\nQ 重新生成邀请码会影响已邀请客户吗？A 不会，已使用记录保留。"}
              level="page"
            />
          </div>
          <div className="cm-pagehead__sub">管理邀请码与邀请链接，跟踪邀请注册并复制平台营销素材。</div>
        </div>
      </div>

      <div className="cm-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div style={{ background: "var(--color-panel)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-lg)", padding: 24, boxShadow: "var(--shadow-card)" }}>
          <h4 style={{ margin: "0 0 16px", fontSize: 15, color: "var(--color-text)" }}>您的邀请链接
            <HelpIcon text="将此链接分享给客户，客户打开注册页并填写邀请码即完成邀请登记。邀请仅作拉新激励，不自动建立客户归属。" />
          </h4>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1, background: "var(--color-divider-light)", padding: "10px 14px", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-family-mono)", fontSize: 12, wordBreak: "break-all", color: "var(--color-text-secondary)" }}>
              {inviteLink || "暂无邀请链接"}
            </div>
            <button onClick={copyLink} style={{ padding: "8px 16px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
              复制
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>邀请码：</span>
            <code style={{ background: "var(--color-primary-light)", padding: "4px 12px", borderRadius: "var(--radius-xs)", fontSize: 16, fontWeight: 700, color: "var(--color-primary)", letterSpacing: 2 }}>{inviteCode || "—"}</code>
            <button onClick={regenerateCode} style={{ padding: "4px 12px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-xs)", background: "var(--color-panel)", cursor: "pointer", fontSize: 12 }}>
              重新生成
              <HelpIcon text="重新生成后旧邀请码和链接将立即失效，历史使用记录保留。" />
            </button>
          </div>
        </div>

        <div style={{ background: "var(--color-panel)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-lg)", padding: 24, boxShadow: "var(--shadow-card)" }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 15, color: "var(--color-text)" }}>邀请统计
            <HelpIcon text="已邀请客户 = 通过您的邀请码完成注册的用户数；累计返利为平台发放的拉新奖励（如有）。" />
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ textAlign: "center", padding: 16, background: "var(--color-success-bg)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--color-success-text)" }}>{invitedCount}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>已邀请客户</div>
            </div>
            <div style={{ textAlign: "center", padding: 16, background: "var(--color-primary-lighter)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--color-primary)" }}>
                ¥{(totalReward / 100).toFixed(2)}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>累计返利</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: "var(--color-panel)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
        <h4 style={{ margin: 0, padding: "16px 20px", borderBottom: "1px solid var(--color-divider)", fontSize: 15, color: "var(--color-text)" }}>邀请记录
          <HelpIcon text="本代理商所有邀请码（含已失效历史码）及使用情况，按创建时间倒序。" />
        </h4>
        <table className="cm-table">
          <thead><tr>
            <th>邀请码</th><th>客户</th><th>邮箱</th><th className="num">返利金额</th><th style={{textAlign:"center"}}>状态</th><th>使用时间</th>
          </tr></thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id}>
                <td style={{ fontFamily: "var(--font-family-mono)", fontWeight: 600, color: "var(--color-primary)", letterSpacing: 1 }}>{r.code}</td>
                <td style={{ fontWeight: 500 }}>{r.invitee_name ?? "—"}</td>
                <td style={{ color: "var(--color-text-muted)" }}>{r.invitee_email ?? "—"}</td>
                <td className="num" style={{ fontWeight: 600, color: r.reward_amount > 0 ? "var(--color-success-text)" : "var(--color-text-muted)" }}>
                  {r.reward_amount > 0 ? `¥${(r.reward_amount / 100).toFixed(2)}` : "-"}
                </td>
                <td style={{ textAlign: "center" }}>
                  <span style={{
                    padding: "2px 10px", borderRadius: "var(--radius-pill)", fontSize: 11,
                    background: r.used_at ? "var(--color-success-bg)" : r.status === "active" ? "var(--color-warning-bg)" : "var(--color-disabled-bg)",
                    color: r.used_at ? "var(--color-success-text)" : r.status === "active" ? "var(--color-warning-text)" : "var(--color-text-muted)",
                  }}>
                    {r.used_at ? "已使用" : (INVITE_STATUS_LABEL[r.status] ?? r.status)}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {r.used_at ? new Date(r.used_at).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>暂无邀请记录</td></tr>}
          </tbody>
        </table>
      </div>

      {/* P2-2：营销素材库（仅 published 素材） */}
      <div style={{ background: "var(--color-panel)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-lg)", overflow: "hidden", marginTop: 20, boxShadow: "var(--shadow-card)" }}>
        <h4 style={{ margin: 0, padding: "16px 20px", borderBottom: "1px solid var(--color-divider)", fontSize: 15, color: "var(--color-text)" }}>营销素材库
          <HelpIcon
            text={"平台为代理商提供的推广素材模板（推广文案/海报文案等）。展开可查看模板正文，一键复制用于客户触达。素材仅作营销用途，不产生客户归属；客户归属以平台报备审核划拨为准。"}
          />
        </h4>
        {materialsLoading ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)", fontSize: 13 }}>素材加载中…</div>
        ) : materials.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>暂无已发布的营销素材</div>
        ) : (
          materials.map(m => (
            <div key={m.id} style={{ borderBottom: "1px solid var(--color-divider)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{m.title}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                    {m.slug} · 更新于 {new Date(m.updated_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                  style={{ padding: "5px 12px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-xs)", background: "var(--color-panel)", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}
                >
                  {expandedId === m.id ? "收起" : "查看模板"}
                  <HelpIcon text={expandedId === m.id ? "收起模板正文。" : "展开查看该素材的完整模板正文。"} />
                </button>
                <CopyButton text={m.content} label="复制文案" />
              </div>
              {expandedId === m.id && (
                <div style={{ padding: "0 20px 16px" }}>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", background: "var(--color-divider-light)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", padding: "14px 16px", fontSize: 13, lineHeight: 1.8, color: "var(--color-text-secondary)", fontFamily: "inherit" }}>
                    {m.content}
                  </pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
