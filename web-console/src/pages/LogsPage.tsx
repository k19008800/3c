import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface CallLog {
  id: number;
  provider: string | null;
  upstream_model: string | null;
  request_tokens: number;
  response_tokens: number;
  total_tokens: number;
  cost: string | number;
  status: string;
  error_code: string | null;
  latency_ms: number | null;
  created_at: string;
}

export default function LogsPage() {
  const [model, setModel] = useState("");
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [detail, setDetail] = useState<CallLog | null>(null);

  // 当前筛选（点击搜索后更新）
  const [filters, setFilters] = useState<{ model?: string; status?: string; provider?: string }>({});

  const { data, isLoading } = useQuery<{ list: CallLog[] }>({
    queryKey: ["me-logs", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (filters.model) params.set("model", filters.model);
      if (filters.status) params.set("status", filters.status);
      if (filters.provider) params.set("provider", filters.provider);
      return (await api.get(`/me/logs?${params.toString()}`)).data;
    },
    refetchInterval: 15000,
  });

  const search = () => setFilters({ model: model.trim() || undefined, status: status || undefined, provider: provider.trim() || undefined });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>调用日志</h2>
        <span style={{ color: "#64748b", fontSize: 14, marginLeft: 12 }}>共 {data?.list.length ?? 0} 条</span>
      </div>

      {/* 筛选 */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <input value={model} onChange={(e) => setModel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="模型名" style={ipt} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={ipt}>
          <option value="">全部状态</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
        </select>
        <input value={provider} onChange={(e) => setProvider(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="供应商" style={ipt} />
        <button onClick={search} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>搜索</button>
        {(filters.model || filters.status || filters.provider) && (
          <button onClick={() => { setModel(""); setStatus(""); setProvider(""); setFilters({}); }} style={{ ...btn, background: "#fee2e2", color: "#991b1b" }}>清除筛选</button>
        )}
      </div>

      {isLoading ? (
        <div>加载中...</div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 10, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                <th style={{ padding: 12 }}>时间</th><th style={{ padding: 12 }}>供应商</th><th style={{ padding: 12 }}>模型</th>
                <th style={{ padding: 12 }}>Tokens</th><th style={{ padding: 12 }}>费用</th><th style={{ padding: 12 }}>延迟</th>
                <th style={{ padding: 12 }}>状态</th><th style={{ padding: 12 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {data?.list.map((log) => (
                <tr key={log.id} style={{ borderBottom: "1px solid #e2e8f0", cursor: "pointer" }} onClick={() => setDetail(log)}>
                  <td style={{ padding: 12, fontSize: 13, color: "#475569" }}>{new Date(log.created_at).toLocaleString()}</td>
                  <td style={{ padding: 12 }}>{log.provider ?? "-"}</td>
                  <td style={{ padding: 12, fontFamily: "monospace", fontSize: 13 }}>{log.upstream_model ?? "-"}</td>
                  <td style={{ padding: 12 }}>{log.total_tokens}</td>
                  <td style={{ padding: 12 }}>¥{Number(log.cost ?? 0).toFixed(4)}</td>
                  <td style={{ padding: 12 }}>{log.latency_ms != null ? `${log.latency_ms}ms` : "-"}</td>
                  <td style={{ padding: 12 }}>
                    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 12, background: log.status === "success" ? "#dcfce7" : "#fee2e2", color: log.status === "success" ? "#166534" : "#991b1b" }}>
                      {log.status}{log.error_code ? ` (${log.error_code})` : ""}
                    </span>
                  </td>
                  <td style={{ padding: 12 }}><button style={{ ...btn, background: "#f1f5f9", color: "#334155", padding: "4px 10px" }}>详情</button></td>
                </tr>
              ))}
              {data?.list.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>暂无调用记录</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 详情抽屉 */}
      {detail && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", justifyContent: "flex-end", zIndex: 1000 }}>
          <div style={{ width: 420, background: "#fff", height: "100%", padding: 24, overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>调用详情 #{detail.id}</h3>
              <button onClick={() => setDetail(null)} style={{ ...btn, background: "#f1f5f9" }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14 }}>
              {[
                ["时间", new Date(detail.created_at).toLocaleString()],
                ["供应商", detail.provider ?? "-"],
                ["模型", detail.upstream_model ?? "-"],
                ["请求 Tokens", String(detail.request_tokens)],
                ["响应 Tokens", String(detail.response_tokens)],
                ["总 Tokens", String(detail.total_tokens)],
                ["费用", `¥${Number(detail.cost ?? 0).toFixed(4)}`],
                ["状态", detail.status + (detail.error_code ? ` (${detail.error_code})` : "")],
                ["延迟", detail.latency_ms != null ? `${detail.latency_ms}ms` : "-"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", borderBottom: "1px solid #f1f5f9", paddingBottom: 8 }}>
                  <span style={{ width: 110, color: "#64748b" }}>{k}</span>
                  <span style={{ fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ipt: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: 150, fontSize: 13 };
const btn: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
