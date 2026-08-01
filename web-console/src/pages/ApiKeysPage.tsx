import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

interface ApiKey {
  id: number;
  name: string;
  keyPrefix: string;
  status: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ list: ApiKey[] }>({
    queryKey: ["api-keys"],
    queryFn: async () => (await api.get("/me/api-keys")).data,
  });

  // 全部模型（用于白名单选择）
  const allModels = useQuery<{ list: { id: string; displayName?: string }[] }>({
    queryKey: ["all-models"],
    queryFn: async () => (await api.get("/public/models")).data,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => (await api.post("/me/api-keys", { name, model_whitelist: selectedModels.length ? selectedModels : undefined })).data,
    onSuccess: (data) => {
      setCreatedSecret(data.key);
      setNewKeyName("");
      setSelectedModels([]);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e: any) => setError(extractError(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => await api.delete(`/me/api-keys/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => await api.patch(`/me/api-keys/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>API Keys</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="Key 名称" style={{ padding: 8, borderRadius: 6, border: "1px solid #cbd5e1" }} />
          <button
            onClick={() => createMutation.mutate(newKeyName)}
            disabled={!newKeyName || createMutation.isPending}
            style={{ padding: "8px 14px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
          >
            创建 Key
          </button>
        </div>
      </div>

      {error && <div style={{ color: "#dc2626", marginBottom: 12 }}>{error}</div>}

      {/* 模型白名单选择（可选） */}
      <div style={{ marginBottom: 16, background: "#f8fafc", padding: 12, borderRadius: 8 }}>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>
          模型白名单（{selectedModels.length ? `已选 ${selectedModels.length}` : "不限制所有模型"}）
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(allModels.data?.list ?? []).map((m) => {
            const name = typeof m === "string" ? m : (m?.id ?? m?.displayName ?? "");
            const on = selectedModels.includes(name);
            return (
              <button
                key={name}
                onClick={() => {
                  setSelectedModels(on ? selectedModels.filter((x) => x !== name) : [...selectedModels, name]);
                }}
                style={{ padding: "5px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", border: "1px solid #cbd5e1", background: on ? "#2563eb" : "#fff", color: on ? "#fff" : "#475569" }}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {createdSecret && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", padding: 16, borderRadius: 8, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>✅ Key 创建成功（仅此一次显示，请妥善保存）</div>
          <code style={{ background: "#fff", padding: 8, borderRadius: 4, display: "block", wordBreak: "break-all" }}>{createdSecret}</code>
          <button onClick={() => setCreatedSecret(null)} style={{ marginTop: 8, background: "none", border: "none", color: "#2563eb", cursor: "pointer" }}>关闭</button>
        </div>
      )}

      {isLoading ? (
        <div>加载中...</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10, overflow: "hidden" }}>
          <thead>
            <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
              <th style={{ padding: 12 }}>名称</th>
              <th style={{ padding: 12 }}>Key</th>
              <th style={{ padding: 12 }}>状态</th>
              <th style={{ padding: 12 }}>创建时间</th>
              <th style={{ padding: 12 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {data?.list.map((k) => (
              <tr key={k.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: 12 }}>{k.name}</td>
                <td style={{ padding: 12, fontFamily: "monospace", fontSize: 13 }}>{k.keyPrefix}...</td>
                <td style={{ padding: 12 }}>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      background: k.status === "active" ? "#dcfce7" : k.status === "disabled" ? "#fef9c3" : "#fee2e2",
                      color: k.status === "active" ? "#166534" : k.status === "disabled" ? "#854d0e" : "#991b1b",
                    }}
                  >
                    {k.status}
                  </span>
                </td>
                <td style={{ padding: 12, fontSize: 13, color: "#64748b" }}>{new Date(k.createdAt).toLocaleString()}</td>
                <td style={{ padding: 12 }}>
                  <button
                    onClick={() => toggleMutation.mutate({ id: k.id, status: k.status === "active" ? "disabled" : "active" })}
                    style={{ marginRight: 8, padding: "4px 10px", cursor: "pointer" }}
                  >
                    {k.status === "active" ? "禁用" : "启用"}
                  </button>
                  <button onClick={() => deleteMutation.mutate(k.id)} style={{ padding: "4px 10px", cursor: "pointer", color: "#dc2626" }}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
