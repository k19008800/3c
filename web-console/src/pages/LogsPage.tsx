/**
 * 用户端 — 调用日志
 *
 * 模型编码化改造（M-S-08 / T3）：
 * - 原「模型名」与「供应商」两个独立筛选维度合并为「按模型编码」：输入/选择 model_code，
 *   数据源来自 /me/models 编码列表（可搜索），请求参数 model=<model_code>（后端 ILIKE 过滤）；
 * - 列表按模型编码（upstream_model，新链路即编码）呈现；移除独立「供应商」列；
 * - 旧数据无编码时展示占位「—」，不报错。
 *
 * 后端契约（GET /api/v1/me/logs）：返回 { list }，无 total/分页；行字段
 * { id, provider, upstream_model, request_tokens, response_tokens, total_tokens,
 *   cost(number), status, error_code, latency_ms, created_at }。
 *
 * @module pages
 */

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HelpIcon, EmptyState } from "@3cloud/shared-ui";
import { api } from "../lib/api";
import type { ModelRow } from "../components/playground/types";

/** 调用日志行（对齐后端 /me/logs 响应） */
interface CallLog {
  id: number;
  /** @deprecated 模型编码化后不再作为独立维度展示；保留字段仅为兼容历史响应 */
  provider?: string | null;
  /** 调用模型编码（新链路由 consumption_records.model 锚定；旧数据可能为空） */
  upstream_model?: string | null;
  request_tokens: number;
  response_tokens: number;
  total_tokens: number;
  cost: number;
  status: "success" | "failed" | string;
  error_code?: string | null;
  latency_ms?: number | null;
  created_at: string;
}

const MODEL_DATALIST_ID = "logs-model-code-datalist";

/** 行内时间格式化：YYYY-MM-DD HH:mm */
function fmtTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function LogsPage() {
  // 按模型编码筛选值（model_code），同时支持自由输入编码
  const [modelCode, setModelCode] = useState("");
  // 当前筛选（点击搜索后更新，避免边输入边请求）
  const [applied, setApplied] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // 模型编码列表（/me/models），供筛选下拉搜索
  const { data: modelRows } = useQuery<ModelRow[]>({
    queryKey: ["me-models"],
    queryFn: async () => (await api.get<ModelRow[]>("/me/models")).data,
  });
  const codeOptions = useMemo(
    () => (modelRows ?? []).filter((m) => m && m.model_code),
    [modelRows],
  );

  const { data, isLoading, isError, refetch } = useQuery<{ list: CallLog[] }>({
    queryKey: ["me-logs", applied],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (applied) params.set("model", applied);
      return (await api.get(`/me/logs?${params.toString()}`)).data;
    },
  });

  const list = data?.list ?? [];

  const handleSearch = () => {
    setApplied(modelCode.trim());
    setExpandedId(null);
  };

  const handleClear = () => {
    setModelCode("");
    setApplied("");
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (applied) params.set("model", applied);
      const resp = await api.get(`/me/logs/export?${params.toString()}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(resp.data as Blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `call-logs-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("导出失败");
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>
        📜 调用日志
        <HelpIcon
          text="查看您的全部 API 调用记录。按「模型编码」筛选——输入或选择 model_code（如 va-deepseek-v4-flash）即可精确过滤；编码即供应商，不再单独提供供应商维度。旧日志无编码时展示占位。"
          level="page"
        />
      </h2>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: 20, fontSize: 14 }}>
        追踪每一次 API 调用详情与计费
      </p>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-end",
          marginBottom: 16,
          padding: 16,
          background: "#fff",
          borderRadius: 10,
          boxShadow: "0 1px 3px rgba(0,0,0,.05)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 260 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text)", display: "block", marginBottom: 4 }}>
            按模型编码筛选
            <HelpIcon text="输入或从下拉中选择 model_code 过滤日志；支持模糊搜索。编码即供应商，无需再选供应商。" level="button" />
          </label>
          <input
            list={MODEL_DATALIST_ID}
            value={modelCode}
            onChange={(e) => setModelCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            placeholder="输入模型编码（如 va-deepseek-v4-flash）"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: 13, boxSizing: "border-box", fontFamily: "monospace" }}
          />
          <datalist id={MODEL_DATALIST_ID}>
            {codeOptions.map((m) => (
              <option key={m.model_code} value={m.model_code}>
                {m.display_name}
              </option>
            ))}
          </datalist>
        </div>
        <button
          onClick={handleSearch}
          style={{ padding: "8px 16px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
        >
          搜索
        </button>
        {applied && (
          <button
            onClick={handleClear}
            style={{ padding: "8px 14px", background: "#fff", border: "1px solid var(--color-border)", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
          >
            清除
          </button>
        )}
        <button
          onClick={handleExport}
          style={{ padding: "8px 14px", background: "#fff", border: "1px solid var(--color-border)", borderRadius: 6, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
        >
          导出
          <HelpIcon text="按当前「按模型编码」筛选条件导出日志文件。" level="button" />
        </button>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-secondary)" }}>加载中...</div>
      ) : isError ? (
        <div style={{ padding: 40, textAlign: "center" }}>
          <div style={{ color: "var(--color-danger-text)", marginBottom: 12 }}>加载失败</div>
          <button onClick={() => refetch()} style={{ padding: "8px 16px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>重试</button>
        </div>
      ) : list.length === 0 ? (
        <EmptyState title="暂无调用记录" />
      ) : (
        <div style={{ background: "#fff", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,.05)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--color-bg)" }}>
                <th style={th}>时间</th>
                <th style={th}>模型编码</th>
                <th style={th}>Tokens（入/出）</th>
                <th style={th}>延迟</th>
                <th style={th}>费用</th>
                <th style={th}>状态</th>
              </tr>
            </thead>
            <tbody>
              {list.map((log) => {
                const open = expandedId === log.id;
                return (
                  <Fragment key={log.id}>
                    <tr onClick={() => setExpandedId(open ? null : log.id)} style={{ cursor: "pointer" }}>
                      <td style={td}>{fmtTime(log.created_at)}</td>
                      <td style={td}>
                        <code style={{ fontSize: 12 }}>{log.upstream_model || "—"}</code>
                      </td>
                      <td style={td}>{log.request_tokens} / {log.response_tokens}</td>
                      <td style={td}>{log.latency_ms != null ? `${log.latency_ms}ms` : "—"}</td>
                      <td style={td}>¥{(log.cost / 10000).toFixed(6)}</td>
                      <td style={td}>
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 12,
                          background: log.status === "success" ? "#e6f7ea" : "#ffece6",
                          color: log.status === "success" ? "#16a34a" : "#dc2626",
                        }}>
                          {log.status === "success" ? "成功" : log.status}
                        </span>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={6} style={{ padding: 0, background: "var(--color-bg)" }}>
                          <div style={{ padding: 14, fontSize: 12 }}>
                            <div>模型编码：<code>{log.upstream_model || "—"}</code></div>
                            <div>总 Token：{log.total_tokens}</div>
                            {log.error_code ? <div style={{ color: "#dc2626" }}>错误：{log.error_code}</div> : null}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--color-border)" };
const td: React.CSSProperties = { padding: "12px 16px", borderBottom: "1px solid #f0f0f0" };
