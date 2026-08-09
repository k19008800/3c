import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, StatusBadge, SkeletonGroup } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

export default function AdminMarketplacePage() {
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");

  const listQ = useQuery({
    queryKey: ["admin-marketplace", keyword, category],
    queryFn: async () => (await api.get(`/admin/marketplace?keyword=${keyword}&category=${category}`)).data.data,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>模型市场</h2>
        <HelpIcon text="marketplace" />
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <input style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", flex: 1 }}
          placeholder="搜索模型..." value={keyword} onChange={e => setKeyword(e.target.value)} />
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">全部分类</option>
          <option value="text">文本</option>
          <option value="vision">视觉</option>
          <option value="audio">音频</option>
          <option value="embedding">嵌入</option>
          <option value="reasoning">推理</option>
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, marginBottom: 20 }}>
        {listQ.isLoading ? <SkeletonGroup lines={6} /> : (listQ.data?.list ?? []).map((m: any) => (
          <div key={m.id} style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>{m.display_name ?? m.model_name}</span>
              <StatusBadge status={m.status === "active" ? "success" : "default"}>{m.status ?? "active"}</StatusBadge>
            </div>
            <div style={{ fontSize: 12, color: "#888" }}>{m.vendor_name} · {m.category ?? "文本"}</div>
            <div style={{ fontSize: 12, color: "#666" }}>{m.description ?? "—"}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
              <span>¥{m.sell_input_price}/1K tokens (输入)</span>
              <span>¥{m.sell_output_price}/1K tokens (输出)</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 11 }}>
              {(m.tags ?? []).map((t: string) => (
                <span key={t} style={{ padding: "2px 8px", background: "#f0f0f0", borderRadius: 4, color: "#666" }}>{t}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
