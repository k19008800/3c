import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { HelpIcon } from "@3cloud/shared-ui";
import { KeyPanel } from "../components/playground/KeyPanel";
import { ChatTab } from "../components/playground/ChatTab";
import { RerankTab } from "../components/playground/RerankTab";
import { ResponsesTab } from "../components/playground/ResponsesTab";
import { EmbeddingsTab } from "../components/playground/EmbeddingsTab";
import { CompletionsTab } from "../components/playground/CompletionsTab";
import { MessagesTab } from "../components/playground/MessagesTab";
import { ModelCodeSelector } from "../components/playground/ModelCodeSelector";
import type { ApiKeyRow, ModelRow, PlaygroundTabProps } from "../components/playground/types";

/**
 * §22.3 用户端 Playground - API 在线调试（多端点）
 *
 * 模型编码化改造（M-S-02/06/08）：
 * - 模型选择统一提升到本页：ModelCodeSelector 选择模型编码（值=model_code），
 *   各 Tab 请求体 `model` 一律取该编码，不做名称→编码映射；
 * - 默认编码偏好（设为默认/清除默认）与价格明细对比清单集中在模型选择区。
 *
 * 多 Tab：Chat / Rerank / Responses / Embeddings / Completions / Messages，
 * 全部经 /api/v1/v1/* 内部别名访问（后端双注册）。
 *
 * @see docs/SPEC-模型编码化改造与去除用户供应商选择.md §5.3
 */

type TabKey = "chat" | "rerank" | "responses" | "embeddings" | "completions" | "messages";

const TABS: Array<{ key: TabKey; label: string; icon: string; help: string }> = [
  { key: "chat", label: "Chat", icon: "💬", help: "OpenAI 兼容对话补全：多消息编辑，验证 /v1/chat/completions 完整计费链路。" },
  { key: "rerank", label: "Rerank", icon: "🔀", help: "Cohere 兼容重排序：query + documents 相关性打分，RAG 检索精排调试（POST /v1/rerank）。" },
  { key: "responses", label: "Responses", icon: "🧠", help: "OpenAI Responses API 兼容测试：input/instructions + 非流式与流式 SSE 事件序列（POST /v1/responses）。" },
  { key: "embeddings", label: "Embeddings", icon: "📐", help: "向量化调试：文本 → embedding 向量，支持单条/批量（POST /v1/embeddings）。" },
  { key: "completions", label: "Completions", icon: "✍️", help: "文本补全调试（老 SDK 格式，prompt 字段）：验证 /v1/completions 上游兼容。" },
  { key: "messages", label: "Messages", icon: "🧩", help: "Anthropic Messages API 兼容调试：Claude 格式请求/响应（POST /v1/messages）。" },
];

export default function PlaygroundPage() {
  const [tab, setTab] = useState<TabKey>("chat");
  const [selectedKeyId, setSelectedKeyId] = useState<number | null>(null);
  // 当前所选模型编码（请求体 model 权威值），提升到本页供全部 Tab 共享
  const [model, setModel] = useState("");
  // 完整 API Key（仅本地存储）：列表接口只返回 keyPrefix，真实调用需要完整 Key。
  // 创建 Key 时后端仅展示一次，已由 ApiKeysPage 写入 localStorage 预填。
  const [fullKey, setFullKey] = useState<string>(() => {
    try { return localStorage.getItem("3cloud_last_raw_key") ?? ""; } catch { return ""; }
  });

  const { data: keys } = useQuery<ApiKeyRow[]>({
    queryKey: ["me-keys"],
    queryFn: async () => (await api.get<ApiKeyRow[]>("/me/keys")).data,
  });

  const { data: models } = useQuery<ModelRow[]>({
    queryKey: ["me-models"],
    queryFn: async () => (await api.get<ModelRow[]>("/me/models")).data,
  });

  const activeTab = TABS.find((t) => t.key === tab) ?? TABS[0]!;

  const tabProps: PlaygroundTabProps = {
    keys,
    selectedKeyId,
    fullKey,
    onSelectedKeyId: setSelectedKeyId,
    onFullKey: setFullKey,
    models,
    model,
    onModelChange: setModel,
  };

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>
        🧪 API Playground
        <HelpIcon
          text="在线调试网关全部兼容端点：Chat / Rerank / Responses / Embeddings / Completions / Messages。模型按「模型编码」选择——同一模型来自不同供应商时显示多个编码条目，选择条目即选择供应商；编码规则后台可配置，默认「厂商+模型」。请求体 model 即所选编码，精确路由到对应供应商。调试请求会真实计费。"
          level="page"
        />
      </h2>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: 20, fontSize: 14 }}>
        在线调试 API，零代码测试模型调用
      </p>

      {/* API Key 选择（全 Tab 共享） */}
      <KeyPanel
        keys={keys}
        selectedKeyId={selectedKeyId}
        onSelectedKeyId={setSelectedKeyId}
        fullKey={fullKey}
        onFullKey={setFullKey}
      />

      {/* 模型编码选择区（全 Tab 共享）：编码下拉 + 设为默认/清除默认 + 价格明细 */}
      <ModelCodeSelector models={models} value={model} onChange={setModel} />

      {/* Tab 切换 */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 16,
          flexWrap: "wrap",
          padding: "6px",
          background: "#e9ecf1",
          borderRadius: 10,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              background: tab === t.key ? "#fff" : "transparent",
              color: tab === t.key ? "var(--color-primary)" : "var(--color-text-secondary)",
              boxShadow: tab === t.key ? "0 1px 3px rgba(0,0,0,.12)" : "none",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>{t.icon}</span>
            {t.label}
            <HelpIcon text={t.help} level="button" />
          </button>
        ))}
      </div>

      {activeTab.key === "chat" && <ChatTab {...tabProps} />}
      {activeTab.key === "rerank" && <RerankTab {...tabProps} />}
      {activeTab.key === "responses" && <ResponsesTab {...tabProps} />}
      {activeTab.key === "embeddings" && <EmbeddingsTab {...tabProps} />}
      {activeTab.key === "completions" && <CompletionsTab {...tabProps} />}
      {activeTab.key === "messages" && <MessagesTab {...tabProps} />}
    </div>
  );
}
