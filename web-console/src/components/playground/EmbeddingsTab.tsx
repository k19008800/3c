/**
 * Playground — Embeddings 调试 Tab（POST /v1/embeddings，OpenAI 兼容）
 *
 * 向量化端点：{ model, input }，input 支持单条字符串或字符串数组。
 * 链路：鉴权 → token 估算 → 余额预检 → 渠道选择 → 上游转发（无流式）→ 计费。
 *
 * @see api/src/routes/openai-compat.ts（后端契约）
 * @see newapi-gap-analysis.md Batch 1 任务 1.3
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

export function EmbeddingsTab(props: PlaygroundTabProps) {
  const { fullKey, models } = props;
  const { toast } = useToast();

  const [model, setModel] = useState("");
  const [multi, setMulti] = useState(false);
  const [inputText, setInputText] = useState("3cloud 是一个 AI 聚合网关");
  const [result, setResult] = useState<ProxyResult | null>(null);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!fullKey.trim()) {
      toast.error("请先粘贴完整 API Key");
      return;
    }
    if (!model.trim()) {
      toast.error("请填写模型名（如 text-embedding-3-small / bge-m3）");
      return;
    }
    // 多条模式：按行切分为字符串数组；单条模式：整段文本作为单条
    const lines = inputText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      toast.error("input 不能为空");
      return;
    }
    const input = multi ? lines : lines.join("\n");

    setSending(true);
    setResult(null);
    try {
      const res = await sendDebugRequest({
        path: "/api/v1/v1/embeddings",
        apiKey: fullKey,
        body: { model: model.trim(), input },
      });
      setResult(res);
      if (res.ok) toast.success("向量化完成");
      else toast.error("请求失败：" + (res.error ?? `HTTP ${res.status}`));
    } finally {
      setSending(false);
    }
  };

  /** 摘要：向量维度 + 条数 */
  const renderSummary = () => {
    if (!result?.json || typeof result.json !== "object") return null;
    const j = result.json as Record<string, unknown>;
    const data = Array.isArray(j.data) ? (j.data as Array<Record<string, unknown>>) : null;
    if (!data || data.length === 0) return null;
    const dims = Array.isArray(data[0]?.embedding) ? (data[0].embedding as unknown[]).length : null;
    return (
      <div
        style={{
          background: "var(--color-bg)",
          padding: "10px 12px",
          borderRadius: 8,
          fontSize: 13,
          marginBottom: 12,
          color: "var(--color-text)",
        }}
      >
        共 <b>{data.length}</b> 条向量
        {dims !== null ? <>，维度 <b>{dims}</b></> : null}
        ，模型 {typeof j.model === "string" ? <code>{j.model}</code> : null}
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
            <HelpIcon text="向量化端点：把文本转换为 embedding 向量，供 RAG 检索 / 语义相似度使用。OpenAI 兼容格式。" level="button" />
          </div>

          <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
            <ModelInput
              value={model}
              onChange={setModel}
              models={models}
              help="Embedding 专用模型，如 text-embedding-3-small / bge-m3。"
              placeholder="例如 text-embedding-3-small"
            />
            <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 8, minWidth: 180 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
                多条（每行一条，发送为数组）
                <HelpIcon text="勾选后按行拆分输入，发送为字符串数组（批量向量化）；不勾选则整段作为单条字符串。" level="button" />
              </label>
            </div>
          </div>

          <div>
            <label style={fieldLabelStyle}>
              input（文本）
              <HelpIcon text="要向量化的文本内容。多条模式下每行一条。" level="button" />
            </label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              style={{ ...controlStyle, minHeight: 120, fontFamily: "monospace", resize: "vertical" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            onClick={handleSend}
            disabled={sending}
            style={{ ...primaryBtnStyle, flex: 1, opacity: sending ? 0.6 : 1 }}
          >
            {sending ? "向量化中..." : "🚀 发送 Embeddings 请求"}
          </button>
          <HelpIcon text="调用 /v1/embeddings：鉴权 → token 估算 → 余额预检 → 渠道选择 → 上游转发 → 计费。无可用供应商时返回 mock 占位向量（同样计费）。" level="button" />
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
