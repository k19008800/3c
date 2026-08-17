/**
 * Playground 响应查看器（各 Tab 共享）
 *
 * 统一渲染：
 * - 加载骨架 / 错误横幅 / 空态
 * - HTTP 状态 + 耗时 + mock 回退标记
 * - 文本输出面板（非流式 textExtractor / 流式 streamTextExtractor 累积）
 * - 流式 SSE 事件日志（event 徽标 + JSON 负载）
 * - JSON 美化展示（含复制按钮）+ usage token 汇总
 *
 * @module components/playground
 */

import { EmptyState, SkeletonGroup, CopyButton } from "@3cloud/shared-ui";
import type { ProxyResult, StreamEvent } from "./types";

/** usage 归一化结果 */
export interface UsageSummary {
  input?: number;
  output?: number;
  total?: number;
}

/**
 * 默认 usage 提取：兼容 chat（prompt_tokens/completion_tokens）、
 * responses/Anthropic（input_tokens/output_tokens）、total_tokens。
 */
export function defaultUsageExtractor(json: unknown): UsageSummary | null {
  if (!json || typeof json !== "object") return null;
  const u = (json as Record<string, unknown>).usage;
  if (!u || typeof u !== "object") return null;
  const usage = u as Record<string, unknown>;
  const input = Number(usage.prompt_tokens ?? usage.input_tokens) || undefined;
  const output = Number(usage.completion_tokens ?? usage.output_tokens) || undefined;
  const total = Number(usage.total_tokens) || undefined;
  if (input === undefined && output === undefined && total === undefined) return null;
  return { input, output, total };
}

/** 从 JSON 负载中提取可读文本（各 Tab 自定义） */
export type JsonTextExtractor = (json: unknown) => string | null;
/** 从流式事件中提取增量文本（各 Tab 自定义，如 responses 的 output_text.delta） */
export type StreamTextExtractor = (ev: StreamEvent) => string | null;

const jsonBlockStyle: React.CSSProperties = {
  background: "#0f172a",
  color: "#e2e8f0",
  padding: 16,
  borderRadius: 8,
  fontSize: 13,
  whiteSpace: "pre-wrap",
  fontFamily: "monospace",
  maxHeight: 420,
  overflow: "auto",
  lineHeight: 1.6,
  wordBreak: "break-word",
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 10,
  padding: 20,
  boxShadow: "0 1px 4px rgba(0,0,0,.06)",
};

export function ResponseViewer(props: {
  result: ProxyResult | null;
  loading: boolean;
  /** 自定义摘要区（如 rerank 结果表 / embeddings 维度），渲染在 JSON 前 */
  children?: React.ReactNode;
  /** 非流式文本提取 */
  textExtractor?: JsonTextExtractor;
  /** 流式文本增量提取（累积到同一个文本面板） */
  streamTextExtractor?: StreamTextExtractor;
  /** usage 提取（默认 defaultUsageExtractor） */
  usageExtractor?: (json: unknown) => UsageSummary | null;
}) {
  const { result, loading, children, textExtractor, streamTextExtractor, usageExtractor } = props;

  // ── 流式文本累积（对全部事件应用提取器）──
  const streamText = result?.streamEvents.length && streamTextExtractor
    ? result.streamEvents.map(streamTextExtractor).filter((t): t is string => t !== null).join("")
    : "";

  // ── 非流式文本 ──
  const jsonText = result?.json && textExtractor ? textExtractor(result.json) : null;

  const shownText = streamText || jsonText || "";
  const usage: UsageSummary | null =
    result?.json !== null && result?.json !== undefined
      ? (usageExtractor ?? defaultUsageExtractor)(result.json)
      : null;

  // mock 标记（无可用供应商时的占位响应）
  const isMock = !!(result?.json && typeof result.json === "object"
    && (result.json as Record<string, unknown>).mock === true);

  if (loading) {
    return (
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>响应</h3>
        <SkeletonGroup lines={4} />
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>响应</h3>
        {result && !result.error && result.json !== null && (
          <CopyButton text={JSON.stringify(result.json, null, 2)} label="复制 JSON" />
        )}
      </div>

      {/* 错误横幅 */}
      {result?.error && (
        <div
          style={{
            background: "var(--color-danger-bg)",
            color: "var(--color-danger-text)",
            padding: 12,
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {result.error}
        </div>
      )}

      {/* 自定义摘要区（rerank 结果表 / embeddings 维度等） */}
      {children}

      {/* 状态行 */}
      {result && (
        <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span>
            HTTP <b style={{ color: result.ok ? "#16a34a" : "var(--color-danger-text)" }}>{result.status || "—"}</b>
          </span>
          <span>耗时 {result.latencyMs}ms</span>
          {result.streamEvents.length > 0 && <span>流式事件 {result.streamEvents.length} 条</span>}
          {isMock && (
            <span style={{ color: "#d97706", background: "#fef3c7", padding: "2px 8px", borderRadius: 4 }}>
              ⚠️ mock 回退（未配置可用供应商，占位响应已计费）
            </span>
          )}
        </div>
      )}

      {/* 文本输出面板 */}
      {shownText && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--color-text)" }}>
            文本输出
            <CopyButton text={shownText} label="复制" />
          </div>
          <div
            style={{
              background: "var(--color-bg)",
              padding: 12,
              borderRadius: 8,
              fontSize: 14,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 320,
              overflow: "auto",
              lineHeight: 1.7,
            }}
          >
            {shownText}
          </div>
        </div>
      )}

      {/* 流式事件日志 */}
      {result?.streamEvents.length ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>SSE 事件序列</div>
          <div style={{ maxHeight: 360, overflow: "auto", background: "#0f172a", borderRadius: 8, padding: 12 }}>
            {result.streamEvents.map((ev, i) => {
              let pretty = ev.data;
              try {
                pretty = JSON.stringify(JSON.parse(ev.data), null, 2);
              } catch { /* 保留原文 */ }
              return (
                <div key={i} style={{ marginBottom: 10, fontFamily: "monospace", fontSize: 12 }}>
                  <div style={{ color: "#38bdf8", marginBottom: 2 }}>
                    <span style={{ color: "#64748b", marginRight: 6 }}>#{i + 1}</span>
                    {ev.event ? <b>[{ev.event}]</b> : <b>[data]</b>}
                  </div>
                  <pre style={{ margin: 0, color: "#cbd5e1", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pretty}</pre>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* JSON 展示 */}
      {result?.json !== null && result?.json !== undefined && (
        <div>
          {usage && (
            <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8, flexWrap: "wrap" }}>
              {usage.input !== undefined && <span>输入: {usage.input} tokens</span>}
              {usage.output !== undefined && <span>输出: {usage.output} tokens</span>}
              {usage.total !== undefined && <span>合计: {usage.total} tokens</span>}
            </div>
          )}
          <div style={jsonBlockStyle}>
            {JSON.stringify(result.json, null, 2)}
          </div>
        </div>
      )}

      {/* 空态 */}
      {!result && !loading && (
        <EmptyState icon="📨" title="等待请求" description="配置好参数后点击发送按钮" />
      )}
    </div>
  );
}

/** 通用表单控件样式（对齐 Playground 页内联风格） */
export const controlStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  fontSize: 13,
  boxSizing: "border-box",
  background: "#fff",
  color: "var(--color-text)",
};

/** 主按钮样式 */
export const primaryBtnStyle: React.CSSProperties = {
  padding: "10px 18px",
  background: "var(--color-primary)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 14,
};
