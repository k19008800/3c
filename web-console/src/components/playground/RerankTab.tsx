/**
 * Playground — Rerank 调试 Tab（POST /v1/rerank，Cohere 兼容）
 *
 * RAG 检索增强的事实标准端点（Cohere / Jina 同构）：
 * 请求体 { model, query, documents, top_n?, return_documents? }，
 * documents 元素支持 string 或 { text } 对象（本页用 string 形式）。
 *
 * 链路：API Key 鉴权 → 校验 → 输入 token 估算 → 余额预检 → 渠道选择 →
 * 上游转发（无流式）→ 计费；无可用供应商时 mock 回退（同样计费）。
 *
 * @see api/src/routes/rerank.ts（后端契约）
 * @see newapi-gap-analysis.md Batch 4 任务 4.1（Rerank 先行）
 * @module components/playground
 */

import { useState } from "react";
import { HelpIcon, useToast } from "@3cloud/shared-ui";
import { sendDebugRequest } from "./request";
import { ModelInput } from "./ModelInput";
import { ResponseViewer, controlStyle, primaryBtnStyle } from "./ResponseViewer";
import type { PlaygroundTabProps, ProxyResult } from "./types";

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 10,
  padding: 20,
  boxShadow: "0 1px 4px rgba(0,0,0,.06)",
  marginBottom: 16,
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "var(--color-text)",
  display: "block",
  marginBottom: 4,
};

/** 默认示例：3 段欧洲首都文档 + 一个问题 */
const DEFAULT_DOCUMENTS = [
  "Paris is the capital of France and its largest city.",
  "Berlin is the capital of Germany, known for its history.",
  "Madrid is the capital of Spain, located in the center of the Iberian Peninsula.",
];

interface RerankResultItem {
  index: number;
  relevance_score: number;
  document?: { text: string };
}

export function RerankTab(props: PlaygroundTabProps) {
  const { fullKey, models } = props;
  const { toast } = useToast();

  const [model, setModel] = useState("");
  const [query, setQuery] = useState("Which city is the capital of France?");
  const [documents, setDocuments] = useState<string[]>(DEFAULT_DOCUMENTS);
  const [topN, setTopN] = useState(3);
  const [returnDocuments, setReturnDocuments] = useState(true);
  const [result, setResult] = useState<ProxyResult | null>(null);
  const [sending, setSending] = useState(false);

  const updateDoc = (index: number, content: string) => {
    setDocuments((prev) => prev.map((d, i) => (i === index ? content : d)));
  };

  const removeDoc = (index: number) => {
    if (documents.length <= 1) return;
    setDocuments((prev) => prev.filter((_, i) => i !== index));
  };

  const addDoc = () => {
    setDocuments((prev) => [...prev, ""]);
  };

  const handleSend = async () => {
    if (!fullKey.trim()) {
      toast.error("请先粘贴完整 API Key");
      return;
    }
    if (!model.trim()) {
      toast.error("请填写模型名（如 rerank-multilingual-v3 / rerank-english-v3.0）");
      return;
    }
    const nonEmpty = documents.filter((d) => d.trim());
    if (!query.trim() || nonEmpty.length === 0) {
      toast.error("query 与至少一个 document 为必填");
      return;
    }

    setSending(true);
    setResult(null);
    try {
      const res = await sendDebugRequest({
        path: "/api/v1/v1/rerank",
        apiKey: fullKey,
        body: {
          model: model.trim(),
          query,
          documents: nonEmpty,
          top_n: topN > 0 ? topN : undefined,
          return_documents: returnDocuments,
        },
      });
      setResult(res);
      if (res.ok) toast.success("重排序完成");
      else toast.error("请求失败：" + (res.error ?? `HTTP ${res.status}`));
    } finally {
      setSending(false);
    }
  };

  /** 重排序结果摘要：按 relevance_score 降序展示 topN */
  const renderSummary = () => {
    if (!result?.json || typeof result.json !== "object") return null;
    const j = result.json as Record<string, unknown>;
    const items = Array.isArray(j.results) ? (j.results as RerankResultItem[]) : null;
    if (!items || items.length === 0) return null;
    const sorted = [...items].sort((a, b) => b.relevance_score - a.relevance_score);
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>重排序结果（按分数降序）</div>
        <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, overflow: "hidden" }}>
          {sorted.map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 12px",
                background: i % 2 ? "var(--color-bg)" : "#fff",
                borderBottom: i < sorted.length - 1 ? "1px solid var(--color-border)" : "none",
                fontSize: 13,
              }}
            >
              <span style={{ width: 40, color: "var(--color-text-secondary)" }}>#{item.index}</span>
              <span style={{ width: 90, fontWeight: 600 }}>{item.relevance_score.toFixed(4)}</span>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    height: 8,
                    width: `${Math.max(2, Math.round(item.relevance_score * 100))}%`,
                    maxWidth: 160,
                    background: "var(--color-primary)",
                    borderRadius: 4,
                  }}
                />
                <span style={{ color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.document?.text ?? `文档 ${item.index}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {/* 左侧：参数配置 */}
      <div style={{ flex: 1, minWidth: 320 }}>
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>参数</h3>
            <HelpIcon text="Rerank 重排序：给 query 与 documents 的相关性打分排序，用于 RAG 检索后精排。Cohere / Jina 兼容格式。" level="button" />
          </div>

          <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
            <ModelInput
              value={model}
              onChange={setModel}
              models={models}
              help="Rerank 专用模型，如 rerank-multilingual-v3（多语言）/ rerank-english-v3.0。可在 /me/models 联想，也可直接输入。"
              placeholder="例如 rerank-multilingual-v3"
            />
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={fieldLabelStyle}>
                top_n
                <HelpIcon text="返回的 top 结果条数（可选，默认全部）。" level="button" />
              </label>
              <input
                type="number"
                min={1}
                value={topN}
                onChange={(e) => setTopN(parseInt(e.target.value) || 0)}
                style={controlStyle}
              />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 8, minWidth: 160 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={returnDocuments}
                  onChange={(e) => setReturnDocuments(e.target.checked)}
                />
                返回文档原文
                <HelpIcon text="return_documents=true 时结果内嵌 document.text 原文，便于前端直接展示。" level="button" />
              </label>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={fieldLabelStyle}>
              query（检索问题）
              <HelpIcon text="与 documents 计算相关性的查询文本。" level="button" />
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ ...controlStyle, minHeight: 60, fontFamily: "monospace", resize: "vertical" }}
            />
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <label style={{ ...fieldLabelStyle, marginBottom: 0 }}>
                documents（候选文档列表）
                <HelpIcon text="至少一个候选文档。发送时自动过滤空行；元素以字符串形式发送（Cohere 兼容）。" level="button" />
              </label>
              <button onClick={addDoc} style={{ padding: "4px 10px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
                + 添加文档
              </button>
            </div>
            {documents.map((doc, i) => (
              <div key={i} style={{ marginBottom: 8, padding: 8, background: "var(--color-bg)", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>文档 #{i + 1}</span>
                  <button
                    onClick={() => removeDoc(i)}
                    disabled={documents.length <= 1}
                    style={{ background: "none", border: "none", color: "var(--color-danger-text)", cursor: "pointer", fontSize: 12 }}
                  >
                    删除
                  </button>
                </div>
                <textarea
                  value={doc}
                  onChange={(e) => updateDoc(i, e.target.value)}
                  style={{ ...controlStyle, minHeight: 52, fontFamily: "monospace", resize: "vertical" }}
                />
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            onClick={handleSend}
            disabled={sending}
            style={{ ...primaryBtnStyle, flex: 1, opacity: sending ? 0.6 : 1 }}
          >
            {sending ? "重排序中..." : "🚀 发送 Rerank 请求"}
          </button>
          <HelpIcon text="调用 /v1/rerank：鉴权 → 校验 → token 估算 → 余额预检 → 渠道选择 → 上游转发 → 计费。无可用供应商时返回 mock 占位结果（同样计费）。" level="button" />
        </div>
      </div>

      {/* 右侧：响应 */}
      <div style={{ flex: 1, minWidth: 320 }}>
        <ResponseViewer result={result} loading={sending}>
          {renderSummary()}
        </ResponseViewer>
      </div>
    </div>
  );
}
