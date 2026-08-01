import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * §12.7/12.8 系统版本与变更历史
 * [?] 系统版本信息与数据库 Migration 执行记录。查看当前版本、运行环境、Migration 历史。
 */
export default function AdminSysVersionPage() {
  const verQ = useQuery({
    queryKey: ["admin-sys-version"],
    queryFn: async () => (await api.get("/admin/sys/version")).data.data,
  });

  const migQ = useQuery({
    queryKey: ["admin-sys-migrations"],
    queryFn: async () => (await api.get("/admin/sys/migrations")).data.data,
  });

  return (
    <div>
      <h2>
        系统版本与变更
        <span title="系统版本信息与 Migration 变更记录 — 查看当前运行版本、Node.js 环境、平台信息、数据库 Migration 执行历史。"
          style={{ cursor: "help", fontSize: 14, color: "#94a3b8", marginLeft: 6 }}>[?]</span>
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* 版本信息 */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 14, color: "#334155" }}>版本信息</h4>
          {verQ.data ? (
            <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
              <div><span style={{ color: "#64748b", width: 140, display: "inline-block" }}>应用版本</span>{verQ.data.version}</div>
              <div><span style={{ color: "#64748b", width: 140, display: "inline-block" }}>Node.js</span>{verQ.data.node}</div>
              <div><span style={{ color: "#64748b", width: 140, display: "inline-block" }}>运行平台</span>{verQ.data.platform}</div>
              <div><span style={{ color: "#64748b", width: 140, display: "inline-block" }}>Migration 数</span>{verQ.data.migrationCount}</div>
              <div><span style={{ color: "#64748b", width: 140, display: "inline-block" }}>运行时长</span>{(verQ.data.uptime / 3600).toFixed(1)}h</div>
            </div>
          ) : <div style={{ color: "#94a3b8" }}>加载中...</div>}
        </div>

        {/* Migration 历史 */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 14, color: "#334155" }}>Migration 变更记录</h4>
          <div style={{ maxHeight: 400, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  <th style={thS}>编号</th><th style={thS}>Tag</th><th style={thS}>哈希</th>
                </tr>
              </thead>
              <tbody>
                {migQ.data?.list?.map((m: any) => (
                  <tr key={m.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={tdS}>{m.id}</td>
                    <td style={tdS}>{m.tag || "-"}</td>
                    <td style={tdS}><code style={{ fontSize: 11 }}>{m.hash?.substring(0, 12) || "-"}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const thS: React.CSSProperties = { padding: "6px 10px", textAlign: "left", fontWeight: 600, color: "#475569" };
const tdS: React.CSSProperties = { padding: "6px 10px", color: "#334155" };
