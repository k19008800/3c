import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { HelpIcon } from "@3cloud/shared-ui";

/**
 * §12.2 数据库管理面板
 * [?] 数据库管理面板 — 只读SQL查询，仅支持 SELECT 语句。浏览数据库表结构。仅超级管理员可执行查询。
 */

/* ───────── 演示数据（后端 /admin/sys/db 待接入） ─────────
 * 注意：后端未接入时本页仅展示占位表结构，查询功能保持禁用——
 * 绝不能用固定 MOCK_RESULT 冒充真实查询结果（管理员会误以为 SELECT 真跑过线上库）。 */
const MOCK_SCHEMA = {
  tables: [{ table_name: "users" }, { table_name: "api_keys" }, { table_name: "recharge_orders" }, { table_name: "call_logs" }],
  columns: [
    { table_name: "users", column_name: "id", data_type: "bigint", is_nullable: "NO" },
    { table_name: "users", column_name: "email", data_type: "varchar", is_nullable: "NO" },
    { table_name: "users", column_name: "balance", data_type: "numeric", is_nullable: "NO" },
    { table_name: "api_keys", column_name: "id", data_type: "bigint", is_nullable: "NO" },
    { table_name: "api_keys", column_name: "key", data_type: "varchar", is_nullable: "NO" },
    { table_name: "recharge_orders", column_name: "id", data_type: "bigint", is_nullable: "NO" },
    { table_name: "recharge_orders", column_name: "amount", data_type: "numeric", is_nullable: "NO" },
    { table_name: "call_logs", column_name: "id", data_type: "bigint", is_nullable: "NO" },
    { table_name: "call_logs", column_name: "model_name", data_type: "varchar", is_nullable: "NO" },
  ],
};

export default function AdminSysDbPage() {
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState("");

  const schemaQ = useQuery({
    queryKey: ["admin-sys-db-schema"],
    queryFn: async () => (await api.get("/admin/sys/db/schema")).data.data,
    // 后端未实现时立即回退演示数据，避免 404 反复重试导致页面卡加载
    retry: 0,
  });

  // 后端未实现时回退到演示数据（未来接入真实端点后此兜底自动失效）
  const tables = schemaQ.data?.tables ?? MOCK_SCHEMA.tables;
  const columns = schemaQ.data?.columns ?? MOCK_SCHEMA.columns;
  const demo = schemaQ.data?.tables == null;

  const runQuery = async () => {
    setErr("");
    setResult(null);
    try {
      const r = await api.post("/admin/sys/db/query", { sql });
      setResult(r.data.data);
    } catch (e: any) {
      // 后端未接入：拒绝执行，绝不返回模拟结果
      if (e?.response?.status === 404) {
        setErr("数据库查询后端未接入（/admin/sys/db 待实现）。为避免误把演示结果当作真实线上查询，查询功能已禁用。");
      } else {
        setErr(e?.response?.data?.message || e.message);
      }
    }
  };

  return (
    <div>
      <h2>
        数据库管理
        <HelpIcon text="数据库管理面板 — 执行只读 SQL 查询（仅 SELECT），浏览数据库表结构和列定义。所有操作记录审计日志。" level="page" />
        {demo && <span style={{ fontSize: 11, color: "#f59e0b" }}>⚠️ 后端未接入（/admin/sys/db），查询功能禁用</span>}
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* 表结构 */}
        <div style={{ background: "var(--color-panel)", border: `1px solid var(--color-border)`, borderRadius: 8, padding: 16 }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "var(--color-text)" }}>表结构</h4>
          <div style={{ maxHeight: 400, overflow: "auto" }}>
            {tables.map((t: any) => (
              <div key={t.table_name} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--color-primary)" }}>{t.table_name}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginLeft: 8 }}>
                  {columns?.filter((c: any) => c.table_name === t.table_name)?.map((c: any) => (
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
        <div style={{ background: "var(--color-panel)", border: `1px solid var(--color-border)`, borderRadius: 8, padding: 16 }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "var(--color-text)" }}>SQL 查询</h4>
          <textarea value={sql} onChange={(e) => setSql(e.target.value)} placeholder="SELECT * FROM users LIMIT 10" rows={4} disabled={demo}
            style={{ width: "100%", padding: "8px", borderRadius: 4, border: `1px solid var(--color-border)`, fontFamily: "monospace", fontSize: 12, boxSizing: "border-box", marginBottom: 8, background: demo ? "var(--color-bg)" : undefined }} />
          <button onClick={runQuery} disabled={!sql.trim() || demo} style={{ padding: "6px 16px", borderRadius: 4, border: "none", background: demo ? "#94a3b8" : "var(--color-primary)", color: "#fff", cursor: demo ? "not-allowed" : "pointer", opacity: !sql.trim() || demo ? 0.6 : 1 }}>
            {demo ? "查询已禁用" : "执行"}
          </button>
          {demo && <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 4, background: "#fefce8", border: "1px solid #fde68a", fontSize: 12, color: "#854d0e" }}>
            ⚠️ 数据库查询后端未接入，为避免把演示结果误当作真实线上查询，本功能暂禁用。接入 /admin/sys/db 后自动生效。
          </div>}

          {err && <div style={{ marginTop: 8, padding: "8px", background: "var(--color-danger-bg)", borderRadius: 4, fontSize: 12, color: "var(--color-danger-text)" }}>{err}</div>}

          {result && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>返回 {result.rowCount} 行 ({result.duration}ms)</div>
              <div style={{ maxHeight: 300, overflow: "auto", fontSize: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: "var(--color-bg)" }}>
                      {result.fields?.map((f: any) => <th key={f.name} style={thS}>{f.name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows?.map((row: any, i: number) => (
                      <tr key={i} style={{ borderBottom: `1px solid var(--color-border)` }}>
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
const tdS: React.CSSProperties = { padding: "4px 6px", color: "var(--color-text)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
