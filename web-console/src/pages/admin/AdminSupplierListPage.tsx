import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, StatusBadge, SkeletonGroup, useToast } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

export default function AdminSupplierListPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const { toast } = useToast();

  const listQ = useQuery({
    queryKey: ["admin-suppliers", status, search],
    queryFn: async () => (await api.get(`/admin/vendors/all?keyword=${search}&status=${status}`)).data.data,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>供应商列表</h2>
        <HelpIcon text="suppliers" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 20 }}>
        {[{ icon: "🔌", label: "供应商总数", value: listQ.data?.list?.length ?? "—", sub: "管理上游 AI 厂商" },
          { icon: "✅", label: "运行中", value: "—", sub: "健康率 —" },
          { icon: "🤖", label: "模型总数", value: "—", sub: "已同步" },
          { icon: "⚠️", label: "需要关注", value: "—", sub: "连接异常" },
        ].map((s, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#aaa" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <input style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", flex: 1 }}
          placeholder="搜索供应商..." value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="active">启用</option>
          <option value="maintenance">维护中</option>
          <option value="offline">离线</option>
        </select>
        <button style={{ ...btnBase, background: "#4f6ef7", color: "#fff" }}>搜索</button>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>🔌 供应商列表 <HelpIcon text="suppliers" /></div>
        {listQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>供应商名称</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>状态</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>模型数</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>最近同步</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>健康状态</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
            </tr></thead>
            <tbody>
              {(listQ.data?.list ?? []).map((v: any) => (
                <tr key={v.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{v.name}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <StatusBadge status={v.status === "active" ? "success" : v.status === "maintenance" ? "warning" : "danger"}>
                      {v.status_label ?? v.status}
                    </StatusBadge>
                  </td>
                  <td style={{ padding: "10px 12px" }}>{v.model_count ?? "—"}</td>
                  <td style={{ padding: "10px 12px", color: "#888" }}>{v.created_at ?? "—"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                      background: v.is_active ? "#22c55e" : "#e53935", marginRight: 6 }} />
                    {v.is_active ? "正常" : "异常"}
                  </td>
                  <td style={{ padding: "10px 12px", display: "flex", gap: 6 }}>
                    <button style={{ ...btnBase, background: "#f0f0f0", fontSize: 12 }}>同步</button>
                    <button style={{ ...btnBase, background: "#f0f0f0", fontSize: 12 }}>测试</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
