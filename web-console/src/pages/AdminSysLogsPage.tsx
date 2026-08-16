import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { HelpIcon, EmptyState } from "@3cloud/shared-ui";

/**
 * §12.5 在线日志查看器
 * [?] 在线日志查看器 — 浏览服务器日志文件，支持按关键词搜索和行数控制。
 */
export default function AdminSysLogsPage() {
  const [file, setFile] = useState("");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState("100");

  const filesQ = useQuery({
    queryKey: ["admin-sys-logs"],
    queryFn: async () => (await api.get("/admin/sys/logs")).data.data,
    retry: 0,
  });

  const contentQ = useQuery({
    queryKey: ["admin-sys-logs-read", file, search, lines],
    queryFn: async () => (await api.get(`/admin/sys/logs/read?file=${encodeURIComponent(file)}&search=${encodeURIComponent(search)}&lines=${lines}`)).data.data,
    enabled: !!file,
    retry: 0,
  });

  const backendMissing = filesQ.isError;

  return (
    <div>
      <h2>
        在线日志查看器
        <HelpIcon text="在线日志查看器 — 浏览服务器日志文件、按关键词搜索、控制显示行数。支持查看 PM2 日志和应用日志。" level="page" />
        {backendMissing && <span style={{ fontSize: 11, color: "#f59e0b", marginLeft: 8 }}>⚠️ 后端未接入（/admin/sys/logs 待实现）</span>}
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select value={file} onChange={(e) => setFile(e.target.value)} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid var(--color-border)`, minWidth: 200 }}>
          <option value="">选择日志文件</option>
          {filesQ.data?.files?.map((f: string) => <option key={f} value={f}>{f.replace(/^.*[/\\]/, "")}</option>)}
        </select>
        <input placeholder="搜索关键词" value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid var(--color-border)`, width: 200 }} />
        <select value={lines} onChange={(e) => setLines(e.target.value)} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid var(--color-border)` }}>
          <option value="50">50 行</option><option value="100">100 行</option><option value="200">200 行</option><option value="500">500 行</option>
        </select>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{filesQ.data?.path}</span>
      </div>

      {contentQ.data && (
        <div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8 }}>
            文件: {file} | 匹配 {contentQ.data?.total || 0} 行 | 显示 {contentQ.data?.lines?.length || 0} 行
          </div>
          <pre style={{ background: "#0f172a", color: "#e2e8f0", padding: 16, borderRadius: 8, fontSize: 11, fontFamily: "monospace", maxHeight: 600, overflow: "auto", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {contentQ.data?.lines?.join("\n") || "无匹配内容"}
          </pre>
        </div>
      )}
      {!file && <EmptyState title="请选择日志文件" description="选择左侧日志文件以查看内容" />}
    </div>
  );
}
