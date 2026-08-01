import { useState } from "react";
import { Link } from "react-router-dom";

export default function VendorRegisterPage() {
  const [form, setForm] = useState({ name: "", contact_name: "", contact_email: "", contact_phone: "", password: "", base_url: "", api_auth_type: "bearer_token", commission_rate: "0.1" });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  const inp: React.CSSProperties = { width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #cbd5e1", marginBottom: 14, fontFamily: "inherit" };

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", fontFamily: "system-ui, sans-serif", padding: "40px 20px" }}>
      <div style={{ maxWidth: 520, margin: "auto", background: "#fff", padding: 36, borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,.2)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 26, marginBottom: 4 }}>🏭</div>
          <h1 style={{ marginBottom: 4, fontSize: 22 }}>供应商入驻申请</h1>
          <div style={{ fontSize: 13, color: "#64748b" }}>提交资料，审核通过后即可接入平台</div>
        </div>

        {success ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{success}</div>
            <p style={{ color: "#64748b", fontSize: 14 }}>平台将在 1-3 个工作日内审核。审核通过后，可使用注册邮箱登录供应商自助平台。</p>
            <Link to="/vendor/login" style={{ display: "inline-block", marginTop: 16, padding: "10px 24px", background: "#0ea5e9", color: "#fff", borderRadius: 6, textDecoration: "none" }}>返回登录</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h3 style={{ fontSize: 15, color: "#475569", marginBottom: 12 }}>基本信息</h3>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="供应商名称 *" style={inp} required />
            <input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} placeholder="联系人姓名 *" style={inp} required />
            <input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} placeholder="联系邮箱（作登录账号）*" style={inp} required />
            <input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} placeholder="联系电话（11 位手机号）*" style={inp} required />
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="密码（至少 8 位）*" style={inp} required minLength={8} />

            <h3 style={{ fontSize: 15, color: "#475569", margin: "16px 0 12px" }}>API 接入信息</h3>
            <input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="API Base URL (https://...)" style={inp} />
            <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
              <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><input type="radio" checked={form.api_auth_type === "bearer_token"} onChange={() => setForm({ ...form, api_auth_type: "bearer_token" })} /> Bearer Token</label>
              <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><input type="radio" checked={form.api_auth_type === "api_key"} onChange={() => setForm({ ...form, api_auth_type: "api_key" })} /> API Key</label>
            </div>
            <input type="number" step="0.01" value={form.commission_rate} onChange={(e) => setForm({ ...form, commission_rate: e.target.value })} placeholder="平台佣金率（如 0.1 = 10%）" style={inp} />

            {error && <div style={{ color: "#dc2626", marginBottom: 12, fontSize: 14 }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ width: "100%", padding: 12, background: "#0ea5e9", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 15 }}>{loading ? "提交中..." : "提交入驻申请"}</button>
            <div style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: "#64748b" }}>
              已有账号？ <Link to="/vendor/login" style={{ color: "#0ea5e9" }}>去登录</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
