import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * §12.2 数据库管理面板
 * [?] 数据库管理面板 — 只读SQL查询，仅支持 SELECT 语句。浏览数据库表结构。仅超级管理员可执行查询。
 */
export default function AdminSysDbPage() {
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState("");

  const schemaQ = useQuery({
    queryKey: ["admin-sys-db-schema"],
    queryFn: async () => (await api.get("/admin/sys/db/schema")).data.data,
  });

  const runQuery = async () => {
    setErr("");
    setResult(null);
    try {
      const r = await api.post("/admin/sys/db/query", { sql });
      setResult(r.data.data);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e.message);
    }
  };

  return (
    <div>
      <h2>
        数据库管理
        <span title="数据库管理面板 — 执行只读 SQL 查询（仅 SELECT），浏览数据库表结构和列定义。所有操作记录审计日志。"
          style={{ cursor: "help", fontSize: 14, color: "#94a3b8", marginLeft: 6 }}>[?]</span>
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* 表结构 */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16 }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "#334155" }}>表结构</h4>
          <div style={{ maxHeight: 400, overflow: "auto" }}>
            {schemaQ.data?.tables?.map((t: any) => (
              <div key={t.table_name} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#3b82f6" }}>{t.table_name}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>
                  {schemaQ.data?.columns?.filter((c: any) => c.table_name === t.table_name)?.map((c: any) => (
                    <div key={c.column_name} style={{ margin: "2px 0" }}>
                      <code>{c.column_name}</code> <span style={{ color: "#94a3b8" }}>{c.data_type}{c.is_nullable === "YES" ? "" : " NOT NULL"}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SQL 查询 */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16 }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "#334155" }}>SQL 查询</h4>
          <textarea value={sql} onChange={(e) => setSql(e.target.value)} placeholder="SELECT * FROM users LIMIT 10" rows={4}
            style={{ width: "100%", padding: "8px", borderRadius: 4, border: "1px solid #cbd5e1", fontFamily: "monospace", fontSize: 12, boxSizing: "border-box", marginBottom: 8 }} />
          <button onClick={runQuery} disabled={!sql.trim()} style={{ padding: "6px 16px", borderRadius: 4, border: "none", background: "#3b82f6", color: "#fff", cursor: "pointer" }}>
            执行
          </button>

          {err && <div style={{ marginTop: 8, padding: "8px", background: "#fef2f2", borderRadius: 4, fontSize: 12, color: "#ef4444" }}>{err}</div>}

          {result && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>返回 {result.rowCount} 行 ({result.duration}ms)</div>
              <div style={{ maxHeight: 300, overflow: "auto", fontSize: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9" }}>
                      {result.fields?.map((f: any) => <th key={f.name} style={thS}>{f.name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows?.map((row: any, i: number) => (
                      <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
                        {result.fields?.map((f: any) => <td key={f.name} style={tdS}>{String(row[f.name] ?? "").substring(0, 80)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const thS: React.CSSProperties = { padding: "4px 6px", textAlign: "left", fontWeight: 600, color: "#475569", whiteSpace: "nowrap" };
const tdS: React.CSSProperties = { padding: "4px 6px", color: "#334155", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
