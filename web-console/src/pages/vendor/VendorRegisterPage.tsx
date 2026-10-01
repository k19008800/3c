import { useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../../lib/i18n-context";
import "../console-misc.css";

export default function VendorRegisterPage() {
  const [form, setForm] = useState({ name: "", contact_name: "", contact_email: "", contact_phone: "", password: "", base_url: "", api_auth_type: "bearer_token", commission_rate: "0.1" });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/v1/vendor/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, commission_rate: Number(form.commission_rate) }),
      });
      const data = await res.json();
      if (res.status !== 201) {
        setError(data?.message ?? "注册失败");
        return;
      }
      setSuccess(data?.message ?? "入驻申请已提交，请等待平台审核");
    } catch (err: any) {
      setError(err?.message ?? "网络错误");
    } finally {
      setLoading(false);
    }
  };

  const inp: React.CSSProperties = { width: "100%", padding: 10, boxSizing: "border-box", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", marginBottom: 14, fontFamily: "inherit" };

  return (
    <div className="cm-ink-bg" style={{ padding: "40px 20px" }}>
      <div style={{ maxWidth: 520, margin: "auto", background: "var(--color-panel)", padding: 36, borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-modal)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ marginBottom: 4, fontSize: 22, color: "var(--color-text)" }}>{t("vendor.registerTitle")}</h1>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{t("vendor.registerSubtitle")}</div>
        </div>

        {success ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "var(--color-text)" }}>{success}</div>
            <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>{t("vendor.reviewMessage")}</p>
            <Link to="/vendor/login" style={{ display: "inline-block", marginTop: 16, padding: "10px 24px", background: "var(--color-primary)", color: "#fff", borderRadius: "var(--radius-md)", textDecoration: "none" }}>{t("vendor.goToLogin")}</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h3 style={{ fontSize: 15, color: "var(--color-text-secondary)", marginBottom: 12 }}>基本信息</h3>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="供应商名称 *" style={inp} required />
            <input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} placeholder="联系人姓名 *" style={inp} required />
            <input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} placeholder="联系邮箱（作登录账号）*" style={inp} required />
            <input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} placeholder="联系电话（11 位手机号）*" style={inp} required />
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="密码（至少 8 位）*" style={inp} required minLength={8} />

            <h3 style={{ fontSize: 15, color: "var(--color-text-secondary)", margin: "16px 0 12px" }}>API 接入信息</h3>
            <input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="API Base URL (https://...)" style={inp} />
            <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
              <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, color: "var(--color-text)" }}><input type="radio" checked={form.api_auth_type === "bearer_token"} onChange={() => setForm({ ...form, api_auth_type: "bearer_token" })} /> Bearer Token</label>
              <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, color: "var(--color-text)" }}><input type="radio" checked={form.api_auth_type === "api_key"} onChange={() => setForm({ ...form, api_auth_type: "api_key" })} /> API Key</label>
            </div>
            <input type="number" step="0.01" value={form.commission_rate} onChange={(e) => setForm({ ...form, commission_rate: e.target.value })} placeholder="平台佣金率（如 0.1 = 10%）" style={inp} />

            {error && <div style={{ color: "var(--color-danger-text)", marginBottom: 12, fontSize: 14 }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ width: "100%", padding: 12, background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", fontSize: 15 }}>{loading ? t("vendor.submitting") : t("vendor.submitApplication")}</button>
            <div style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: "var(--color-text-secondary)" }}>
              已有账号？ <Link to="/vendor/login" style={{ color: "var(--color-primary)" }}>去登录</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
