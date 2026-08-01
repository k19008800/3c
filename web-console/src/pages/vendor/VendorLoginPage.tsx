import { useState } from "react";
import { Link } from "react-router-dom";
import { useVendorAuthStore } from "../../store/vendor-auth";

export default function VendorLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const vendorLogin = useVendorAuthStore((s) => s.vendorLogin);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await vendorLogin(email, password);
      window.location.href = "/vendor";
    } catch (err: any) {
      setError(err?.message ?? "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a", fontFamily: "system-ui, sans-serif" }}>
      <form onSubmit={handleSubmit} style={{ background: "#fff", padding: 40, borderRadius: 12, width: 380, boxShadow: "0 4px 20px rgba(0,0,0,.2)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 26, marginBottom: 4 }}>🏭</div>
          <h1 style={{ marginBottom: 4, fontSize: 22 }}>供应商自助平台</h1>
          <div style={{ fontSize: 13, color: "#64748b" }}>登录管理你的模型、统计与结算</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 6, fontSize: 14 }}>联系邮箱</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="供应商注册邮箱" style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #cbd5e1" }} required />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", marginBottom: 6, fontSize: 14 }}>密码</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码（至少 8 位）" style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #cbd5e1" }} required />
        </div>
        {error && <div style={{ color: "#dc2626", marginBottom: 12, fontSize: 14 }}>{error}</div>}
        <button type="submit" disabled={loading} style={{ width: "100%", padding: 12, background: "#0ea5e9", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 15 }}>{loading ? "登录中..." : "登录"}</button>
        <div style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: "#64748b" }}>
          还没有供应商账号？ <Link to="/vendor/register" style={{ color: "#0ea5e9" }}>申请入驻</Link>
        </div>
      </form>
    </div>
  );
}
