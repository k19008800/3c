import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, Modal, SkeletonGroup, useToast } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

export default function AdminVendorProfilesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [editItem, setEditItem] = useState<any>(null);

  const listQ = useQuery({
    queryKey: ["admin-vendor-profiles", keyword],
    queryFn: async () => (await api.get(`/admin/vendor-profiles?keyword=${keyword}`)).data.data,
  });

  const saveMut = useMutation({
    mutationFn: async (body: any) =>
      body.id ? (await api.put(`/admin/vendor-profiles/${body.id}`, body)).data : (await api.post("/admin/vendor-profiles", body)).data,
    onSuccess: () => { toast.success("已保存"); setEditItem(null); qc.invalidateQueries({ queryKey: ["admin-vendor-profiles"] }); },
    onError: (e: any) => toast.error(extractError(e)),
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>厂商资料管理</h2>
        <HelpIcon text="vendor_profiles" />
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 10, flex: 1 }}>
          <input style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", flex: 1 }}
            placeholder="搜索厂商..." value={keyword} onChange={e => setKeyword(e.target.value)} />
        </div>
        <button style={{ ...btnBase, background: "#4f6ef7", color: "#fff" }} onClick={() => setEditItem({ name: "", logo_url: "", description: "", credit_rating: "" })}>
          ＋ 新增厂商
        </button>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>🏢 厂商资料列表 <HelpIcon text="vendor_profiles" /></div>
        {listQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>厂商名称</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>Logo</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>信用评级</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>推荐标记</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
            </tr></thead>
            <tbody>
              {(listQ.data?.list ?? []).map((v: any) => (
                <tr key={v.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{v.name}</td>
                  <td style={{ padding: "10px 12px" }}>{v.logo_url ? "🖼️ 已设置" : "—"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {v.credit_rating === "AAA" ? "🌟 AAA" : v.credit_rating === "AA" ? "⭐ AA" : v.credit_rating || "—"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>{v.is_recommended ? "✅ 推荐" : "—"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <button style={{ ...btnBase, background: "#fff", border: "1px solid #ddd", fontSize: 12 }}
                      onClick={() => setEditItem(v)}>编辑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editItem && (
        <Modal open onClose={() => setEditItem(null)} title={editItem.id ? "编辑厂商资料" : "新增厂商"}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 10 }}>
            <label>厂商名称 <input value={editItem.name || ""} onChange={e => setEditItem({ ...editItem, name: e.target.value })}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%" }} /></label>
            <label>Logo URL <input value={editItem.logo_url || ""} onChange={e => setEditItem({ ...editItem, logo_url: e.target.value })}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%" }} /></label>
            <label>描述 <textarea value={editItem.description || ""} onChange={e => setEditItem({ ...editItem, description: e.target.value })}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", minHeight: 60 }} /></label>
            <label>信用评级
              <select value={editItem.credit_rating || ""} onChange={e => setEditItem({ ...editItem, credit_rating: e.target.value })}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%" }}>
                <option value="">选择评级</option>
                <option value="AAA">AAA</option>
                <option value="AA">AA</option>
                <option value="A">A</option>
                <option value="BBB">BBB</option>
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={!!editItem.is_recommended} onChange={e => setEditItem({ ...editItem, is_recommended: e.target.checked })} />
              推荐标记
            </label>
            <button style={{ ...btnBase, background: "#4f6ef7", color: "#fff", marginTop: 8 }}
              onClick={() => saveMut.mutate(editItem)}>保存</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
