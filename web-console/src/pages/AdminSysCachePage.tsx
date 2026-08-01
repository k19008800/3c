import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * §12.3 缓存管理控制台
 * [?] 缓存管理控制台 — 查看 Redis 缓存键列表、查询具体键值、删除键、清理业务缓存。仅超级管理员可修改。
 */
export default function AdminSysCachePage() {
  const [pattern, setPattern] = useState("*");
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-sys-cache-keys", pattern],
    queryFn: async () => (await api.get(`/admin/sys/cache/keys?pattern=${encodeURIComponent(pattern)}`)).data.data,
  });

  const delMut = useMutation({
    mutationFn: async (key: string) => (await api.delete("/admin/sys/cache/key", { data: { key } })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-sys-cache-keys"] }),
  });

  const flushMut = useMutation({
    mutationFn: async () => (await api.post("/admin/sys/cache/flush")).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-sys-cache-keys"] }),
  });

  return (
    <div>
      <h2>
        缓存管理
        <span title="缓存管理控制台 — 查看 Redis 缓存键列表、按模式搜索、删除指定缓存键、一键清理业务缓存（billing:*）。"
          style={{ cursor: "help", fontSize: 14, color: "#94a3b8", marginLeft: 6 }}>[?]</span>
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="缓存键模式 (如 billing:*)" style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #cbd5e1", width: 240 }} />
        <span style={{ fontSize: 12, color: "#64748b" }}>共 {q.data?.count || 0} 个键</span>
        <span style={{ fontSize: 12, color: "#64748b" }}>{q.data?.memory || ""}</span>
        <button onClick={() => flushMut.mutate()} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #ef4444", background: "#fff", color: "#ef4444", cursor: "pointer", marginLeft: "auto" }}>
          清理业务缓存
        </button>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8 }}>
        {q.data?.keys?.length > 0 ? q.data.keys.map((key: string) => (
          <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px", borderBottom: "1px solid #e2e8f0", fontSize: 13, fontFamily: "monospace" }}>
            <span>{key}</span>
            <button onClick={() => delMut.mutate(key)} style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid #ef4444", background: "#fff", color: "#ef4444", fontSize: 11, cursor: "pointer" }}>
              删除
            </button>
          </div>
        )) : (
          <div style={{ padding: 32, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            {q.data ? "未找到匹配的缓存键" : "加载中..."}
          </div>
        )}
      </div>
    </div>
  );
}
