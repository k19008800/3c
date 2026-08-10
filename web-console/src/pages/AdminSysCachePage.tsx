import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { HelpIcon, useToast } from "@3cloud/shared-ui";

/**
 * §12.3 缓存管理控制台
 * [?] 缓存管理控制台 — 查看 Redis 缓存键列表、查询具体键值、删除键、清理业务缓存。仅超级管理员可修改。
 */

/* ───────── 演示数据（后端 /admin/sys/cache 待接入） ───────── */
const MOCK_KEYS = ["billing:balance:1001", "billing:balance:1002", "rate-limit:sk-abc123", "user:session:2003", "announcement:latest"];

export default function AdminSysCachePage() {
  const [pattern, setPattern] = useState("*");
  const { toast } = useToast();
  const qc = useQueryClient();
  // 演示兜底：本地可变列表（写操作在演示模式下直接改它）
  const [localKeys, setLocalKeys] = useState<string[]>(MOCK_KEYS);

  const q = useQuery({
    queryKey: ["admin-sys-cache-keys", pattern],
    queryFn: async () => (await api.get(`/admin/sys/cache/keys?pattern=${encodeURIComponent(pattern)}`)).data.data,
    // 后端未实现时立即回退演示数据，避免 404 反复重试导致页面卡加载
    retry: 0,
  });

  // 后端未实现时回退到演示数据（未来接入真实端点后此兜底自动失效）
  const keys = q.data?.keys != null ? q.data.keys : localKeys;
  const count = q.data?.count ?? keys.length;
  const memory = q.data?.memory ?? "";
  const demo = q.data?.keys == null;

  const delMut = useMutation({
    mutationFn: async (key: string) => (await api.delete("/admin/sys/cache/key", { data: { key } })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-sys-cache-keys"] }),
    onError: (e: any, key?: string) => {
      // 演示模式：后端未实现时本地删除
      if (e?.response?.status === 404 && key) {
        setLocalKeys(prev => prev.filter(k => k !== key));
        toast.success("缓存键已删除（演示）");
      } else {
        toast.error(e?.response?.data?.message || e.message);
      }
    },
  });

  const flushMut = useMutation({
    mutationFn: async () => (await api.post("/admin/sys/cache/flush")).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-sys-cache-keys"] }),
    onError: (e: any) => {
      // 演示模式：后端未实现时本地清理
      if (e?.response?.status === 404) {
        setLocalKeys(prev => prev.filter(k => !k.startsWith("billing:")));
        toast.success("业务缓存已清理（演示）");
      } else {
        toast.error(e?.response?.data?.message || e.message);
      }
    },
  });

  return (
    <div>
      <h2>
        缓存管理
        <HelpIcon text="缓存管理控制台 — 查看 Redis 缓存键列表、按模式搜索、删除指定缓存键、一键清理业务缓存（billing:*）。" level="page" />
        {demo && <span style={{ fontSize: 11, color: "#f59e0b" }}>⚠️ 演示数据（后端 /admin/sys/cache 待接入）</span>}
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="缓存键模式 (如 billing:*)" style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid var(--color-border)`, width: 240 }} />
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>共 {count} 个键</span>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{memory}</span>
        <button onClick={() => flushMut.mutate()} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid var(--color-danger-text)`, background: "var(--color-panel)", color: "var(--color-danger-text)", cursor: "pointer", marginLeft: "auto" }}>
          清理业务缓存
        </button>
      </div>

      <div style={{ background: "var(--color-panel)", border: `1px solid var(--color-border)`, borderRadius: 8 }}>
        {keys.length > 0 ? keys.map((key: string) => (
          <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px", borderBottom: `1px solid var(--color-border)`, fontSize: 13, fontFamily: "monospace" }}>
            <span>{key}</span>
            <button onClick={() => delMut.mutate(key)} style={{ padding: "2px 8px", borderRadius: 4, border: `1px solid var(--color-danger-text)`, background: "var(--color-panel)", color: "var(--color-danger-text)", fontSize: 11, cursor: "pointer" }}>
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
