import { useState } from "react";
import { Link } from "react-router-dom";
import { useVendorAuthStore } from "../../store/vendor-auth";
import { useI18n } from "../../lib/i18n-context";

export default function VendorLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const vendorLogin = useVendorAuthStore((s) => s.vendorLogin);
  const { t } = useI18n();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await vendorLogin(email, password);
      window.location.href = "/vendor";
    } catch (err: any) {
      setError(err?.message ?? t("vendor.errorSubmit"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a", fontFamily: "system-ui, sans-serif" }}>
      <form onSubmit={handleSubmit} style={{ background: "#fff", padding: 40, borderRadius: 12, width: 380, boxShadow: "0 4px 20px rgba(0,0,0,.2)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 26, marginBottom: 4 }}>🏭</div>
          <h1 style={{ marginBottom: 4, fontSize: 22 }}>{t("vendor.title")}</h1>
          <div style={{ fontSize: 13, color: "#64748b" }}>{t("vendor.subtitle")}</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 6, fontSize: 14 }}>{t("vendor.emailLabel")}</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("vendor.emailPlaceholder")} style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #cbd5e1" }} required />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", marginBottom: 6, fontSize: 14 }}>{t("vendor.passwordLabel")}</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("vendor.passwordPlaceholder")} style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #cbd5e1" }} required />
        </div>
        {error && <div style={{ color: "#dc2626", marginBottom: 12, fontSize: 14 }}>{error}</div>}
        <button type="submit" disabled={loading} style={{ width: "100%", padding: 12, background: "#0ea5e9", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 15 }}>{loading ? t("vendor.loggingIn") : t("vendor.loginButton")}</button>
        <div style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: "#64748b" }}>
          {t("vendor.noAccount")} <Link to="/vendor/register" style={{ color: "#0ea5e9" }}>{t("vendor.applyOnboard")}</Link>
        </div>
      </form>
    </div>
  );
}
