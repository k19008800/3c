import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, useToast } from "@3cloud/shared-ui";

interface UserGroup { id: number; name: string; description: string | null; member_count: number; is_default: boolean; created_at: string; }

export default function UserGroupsPage() {
  const { toast } = useToast();
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    api.get("/me/groups").then(r => setGroups(r.data?.data?.list ?? [])).catch(() => {});
  }, []);

  async function createGroup() {
    if (!name.trim()) { toast.error("组名不能为空"); return; }
    await api.post("/me/groups", { name, description: desc });
    toast.success("用户组已创建");
    setShowNew(false); setName(""); setDesc("");
    const r = await api.get("/me/groups");
    setGroups(r.data?.data?.list ?? []);
  }

  async function deleteGroup(id: number) {
    if (!confirm("确认删除该用户组？组内 API Key 将恢复为未分组状态。")) return;
    await api.post(`/me/groups/${id}/delete`, {});
    toast.success("已删除");
    setGroups(groups.filter(g => g.id !== id));
  }

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#4f6ef7,#6366f1)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>👥</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>用户组管理
          <HelpIcon text="创建用户组来组织您的 API Key，方便按组管理权限和配额。每个组可包含多个 API Key。" level="page" />
        </span>
      </div>

      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setShowNew(true)} style={{ padding: "8px 20px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
          + 新建用户组 <HelpIcon text="为用户组命名并添加描述，创建后可将 API Key 绑定到该组。" />
        </button>
      </div>

      {showNew && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <input placeholder="组名" value={name} onChange={e => setName(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6, width: "100%", marginBottom: 8, boxSizing: "border-box" }} />
          <input placeholder="描述（可选）" value={desc} onChange={e => setDesc(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6, width: "100%", marginBottom: 8, boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={createGroup} style={{ padding: "6px 16px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>创建</button>
            <button onClick={() => setShowNew(false)} style={{ padding: "6px 16px", background: "var(--color-border)", border: "none", borderRadius: 4, cursor: "pointer" }}>取消</button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {groups.map(g => (
          <div key={g.id} style={{ background: "var(--color-panel)", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)", border: g.is_default ? "2px solid #4f6ef7" : "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                  {g.name}
                  {g.is_default && <span style={{ fontSize: 10, background: "#eef2ff", color: "#4f6ef7", padding: "2px 6px", borderRadius: 4, marginLeft: 8 }}>默认</span>}
                </div>
                <div style={{ fontSize: 12, color: "#888" }}>{g.description ?? "—"}</div>
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 13, color: "#666" }}>
              <span style={{ fontWeight: 600, color: "#4f6ef7" }}>{g.member_count}</span> 个 API Key
            </div>
            {!g.is_default && (
              <button onClick={() => deleteGroup(g.id)} style={{ marginTop: 8, padding: "4px 12px", border: "1px solid #e53935", borderRadius: 4, background: "var(--color-panel)", color: "#e53935", cursor: "pointer", fontSize: 12 }}>
                删除
              </button>
            )}
          </div>
        ))}
        {groups.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#888", gridColumn: "1/-1" }}>暂无用户组，点击上方按钮创建</div>}
      </div>
    </div>
  );
}
