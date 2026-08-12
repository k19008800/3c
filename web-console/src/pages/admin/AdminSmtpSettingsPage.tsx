import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, StatusBadge, SkeletonGroup, useToast } from "@3cloud/shared-ui";

/**
 * 运维配置 → SMTP 邮箱
 *
 * 配置平台 SMTP 发送邮箱，供价格变更通知（A 级站内信 + 邮件）、邮件模板测试发送使用。
 * 配置项存在 system_config 的 smtp_* 键，由后端统一读写；密码留空不覆盖。
 */

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const btnPrimary: React.CSSProperties = { ...btnBase, background: "#4f6ef7", color: "#fff" };
const btnGhost: React.CSSProperties = { ...btnBase, background: "#fff", color: "#4f6ef7", border: "1px solid #4f6ef7" };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box", fontSize: 13, fontFamily: "inherit" };
const label: React.CSSProperties = { fontSize: 13, color: "#333", display: "block", marginBottom: 6, fontWeight: 500 };

export default function AdminSmtpSettingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [enabled, setEnabled] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("465");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [from, setFrom] = useState("");
  const [testTo, setTestTo] = useState("");

  const settingsQ = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => (await api.get("/admin/settings")).data.data,
  });

  // 初始化表单
  useEffect(() => {
    const s = settingsQ.data ?? {};
    setEnabled(!!s.smtp_enabled);
    if (s.smtp_host) setHost(s.smtp_host);
    if (s.smtp_port != null) setPort(String(s.smtp_port));
    if (s.smtp_user) setUser(s.smtp_user);
    if (s.smtp_from) setFrom(s.smtp_from);
  }, [settingsQ.data]);

  const saveMut = useMutation({
    mutationFn: async () =>
      (await api.put("/admin/settings/smtp", {
        smtp_enabled: enabled,
        smtp_host: host.trim(),
        smtp_port: Number(port) || 465,
        smtp_user: user.trim(),
        smtp_pass: pass, // 留空则不覆盖已保存密码
        smtp_from: from.trim(),
      })).data,
    onSuccess: () => {
      toast.success("SMTP 配置已保存");
      setPass("");
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (e: any) => toast.error(extractError(e)),
  });

  const testMut = useMutation({
    mutationFn: async () => (await api.post("/admin/settings/smtp/test", { to: testTo.trim() })).data,
    onSuccess: (d: { message?: string }) => toast.success(d?.message ?? "测试邮件已发送"),
    onError: (e: any) => toast.error(extractError(e)),
  });

  const smtpReady = settingsQ.data?.smtp_enabled && !!settingsQ.data?.smtp_host;

  return (
    <div>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        SMTP 邮箱
        <HelpIcon text="配置平台 SMTP 发送邮箱。启用后，价格变更通知（A 级紧急通知）会通过邮件触达用户；「邮件模板」页的测试邮件也可真实发送。密码留空不修改。" level="page" />
      </h2>

      {/* 状态卡 */}
      <div style={{ ...card, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatusBadge status={smtpReady ? "success" : "default"}>{smtpReady ? "已启用" : "未启用"}</StatusBadge>
          <span style={{ fontSize: 13, color: "#666" }}>当前发送账号：<b>{settingsQ.data?.smtp_user || "—"}</b></span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="收件邮箱（发送测试邮件）" style={{ ...inp, width: 260 }} />
          <button style={btnGhost} onClick={() => testMut.mutate()} disabled={!testTo.includes("@") || testMut.isPending}>
            {testMut.isPending ? "发送中..." : "发送测试邮件"}
          </button>
        </div>
      </div>

      <div style={card}>
        {settingsQ.isLoading ? <SkeletonGroup lines={6} /> : (
          <div style={{ maxWidth: 560 }}>
            {/* enable toggle */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--color-border)" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>启用 SMTP 发送</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>关闭后所有邮件进入 skipped 状态，仅保留站内信通知</div>
              </div>
              <div
                onClick={() => setEnabled(!enabled)}
                style={{ position: "relative", width: 40, height: 22, cursor: "pointer", flexShrink: 0 }}
              >
                <div style={{ position: "absolute", inset: 0, borderRadius: 11, background: enabled ? "#4f6ef740" : "#d9d9d9" }}>
                  <div style={{ position: "absolute", width: 18, height: 18, top: 2, left: enabled ? 20 : 2, background: enabled ? "#4f6ef7" : "#fff", borderRadius: "50%", transition: "transform .2s, background .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={label}>SMTP 服务器</label>
                <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.example.com" style={inp} />
              </div>
              <div>
                <label style={label}>端口</label>
                <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="465（SSL）/ 587（STARTTLS）" style={inp} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={label}>账号</label>
                <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="no-reply@example.com" style={inp} />
              </div>
              <div>
                <label style={label}>密码 / 授权码</label>
                <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={settingsQ.data?.smtp_pass ? "已保存，留空不修改" : "SMTP 密码或授权码"} style={inp} />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={label}>发件人地址</label>
              <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="3Cloud <no-reply@example.com>" style={inp} />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button style={btnPrimary} onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                {saveMut.isPending ? "保存中..." : "保存配置"}
              </button>
            </div>

            <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8, background: "#f7f9fc", fontSize: 12, color: "#666", lineHeight: 1.7 }}>
              <b>使用说明：</b>
              ① 配置并保存 SMTP → ② 在「邮件模板」页维护模板并发送测试邮件 → ③ 供应商在「定价」页调价后，价格变更通知每小时自动分发，A 级紧急通知邮件实时发送。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
