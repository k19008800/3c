import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon } from "@3cloud/shared-ui";

interface Vendor { id: number; name: string; logo_url: string | null; description: string | null; credit_rating: number; recommended: boolean; model_count: number; }

export default function VendorSelectorPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/vendors/public").then(r => setVendors(r.data?.data?.list ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#888" }}>加载中…</div>;

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#4f6ef7,#6366f1)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>🏭</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>供应商选择器
          <HelpIcon text="浏览所有可用的 AI 模型供应商，查看其基本信息、信用评级和提供模型数量，选择适合您的供应商。" level="page" />
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {vendors.map(v => (
          <div key={v.id} style={{ background: "var(--color-panel)", borderRadius: 10, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,.06)", border: v.recommended ? "2px solid #f59e0b" : "1px solid var(--color-border)", position: "relative" }}>
            {v.recommended && (
              <span style={{ position: "absolute", top: -8, right: 16, background: "#f59e0b", color: "#fff", padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>⭐ 推荐</span>
            )}
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "#f0f5ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, overflow: "hidden" }}>
                {v.logo_url ? <img src={v.logo_url} alt={v.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🏢"}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{v.name}</div>
                <div style={{ fontSize: 12, color: "#888" }}>
                  信用评级：{"⭐".repeat(Math.min(v.credit_rating, 5))}{"☆".repeat(Math.max(0, 5 - v.credit_rating))}
                </div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: "#666", margin: "0 0 12px", minHeight: 36 }}>{v.description ?? "暂无简介"}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ padding: "4px 12px", borderRadius: 14, background: "#eef2ff", color: "#4f6ef7", fontSize: 12, fontWeight: 500 }}>{v.model_count} 个模型</span>
            </div>
          </div>
        ))}
        {vendors.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#888", gridColumn: "1/-1" }}>暂无供应商数据</div>}
      </div>
    </div>
  );
}
