import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, extractError } from "../lib/api";
import { useAuthStore } from "../store/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@3cloud.io");
  const [password, setPassword] = useState("seed-admin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err: any) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9", fontFamily: "system-ui, sans-serif" }}>
      <form onSubmit={handleSubmit} style={{ background: "#fff", padding: 40, borderRadius: 12, width: 360, boxShadow: "0 4px 20px rgba(0,0,0,.08)" }}>
        <h1 style={{ marginBottom: 24, fontSize: 22 }}>3Cloud 控制台</h1>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 6, fontSize: 14 }}>邮箱</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="邮箱"
            style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #cbd5e1" }}
            required
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", marginBottom: 6, fontSize: 14 }}>密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #cbd5e1" }}
            required
          />
        </div>
        {error && <div style={{ color: "#dc2626", marginBottom: 12, fontSize: 14 }}>{error}</div>}
        <button
          type="submit"
          disabled={loading}
          style={{ width: "100%", padding: 12, background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 15 }}
        >
          {loading ? "登录中..." : "登录"}
        </button>
        <p style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>默认演示账号：admin@3cloud.io / seed-admin</p>
      </form>
    </div>
  );
}
