/**
 * Playground — Completions 调试 Tab（POST /v1/completions，OpenAI 兼容）
 *
 * 文本补全端点（老 SDK）：{ model, prompt, max_tokens?, temperature? }。
 * 链路：鉴权 → token 估算 → 余额预检 → 渠道选择 → 上游转发 → 计费。
 *
 * @see api/src/routes/openai-compat.ts（后端契约）
 * @see newapi-gap-analysis.md Batch 1 任务 1.4
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

export function CompletionsTab(props: PlaygroundTabProps) {
  const { fullKey, models } = props;
  const { toast } = useToast();

  const [model, setModel] = useState("deepseek-chat");
  const [prompt, setPrompt] = useState("请写一句 3cloud 的欢迎语");
  const [maxTokens, setMaxTokens] = useState(64);
  const [temperature, setTemperature] = useState(0.7);
  const [result, setResult] = useState<ProxyResult | null>(null);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!fullKey.trim()) {
      toast.error("请先粘贴完整 API Key");
      return;
    }
    if (!model.trim() || !prompt.trim()) {
      toast.error("model 与 prompt 为必填");
      return;
    }

    setSending(true);
    setResult(null);
    try {
      const res = await sendDebugRequest({
        path: "/api/v1/v1/completions",
        apiKey: fullKey,
        body: {
          model: model.trim(),
          prompt,
          max_tokens: maxTokens > 0 ? maxTokens : undefined,
          temperature: temperature >= 0 ? temperature : undefined,
        },
      });
      setResult(res);
      if (res.ok) toast.success("补全完成");
      else toast.error("请求失败：" + (res.error ?? `HTTP ${res.status}`));
    } finally {
      setSending(false);
    }
  };

  const completionsTextExtractor = (json: unknown): string | null => {
    if (!json || typeof json !== "object") return null;
    const j = json as Record<string, unknown>;
    const choice = Array.isArray(j.choices) ? (j.choices[0] as Record<string, unknown> | undefined) : undefined;
    return typeof choice?.text === "string" ? choice.text : null;
  };

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {/* 左侧：参数配置 */}
      <div style={{ flex: 1, minWidth: 320 }}>
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>参数</h3>
            <HelpIcon text="文本补全端点（老 SDK 格式，prompt 字段）：适合测试上游对 completions 协议的支持。OpenAI 兼容格式。" level="button" />
          </div>

          <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
            <ModelInput
              value={model}
              onChange={setModel}
              models={models}
              help="要调用的补全模型名，网关按名路由到可用供应商。"
              placeholder="例如 deepseek-chat"
            />
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={fieldLabelStyle}>
                max_tokens
                <HelpIcon text="最大生成 token 数。" level="button" />
              </label>
              <input
                type="number"
                min={1}
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 0)}
                style={controlStyle}
              />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={fieldLabelStyle}>
                temperature
                <HelpIcon text="采样温度（0~2），越高越随机。" level="button" />
              </label>
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
                style={controlStyle}
              />
            </div>
          </div>

          <div>
            <label style={fieldLabelStyle}>
              prompt（提示词）
              <HelpIcon text="补全的起始文本，模型在此基础上续写。" level="button" />
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
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
            {sending ? "补全中..." : "🚀 发送 Completions 请求"}
          </button>
          <HelpIcon text="调用 /v1/completions：鉴权 → token 估算 → 余额预检 → 渠道选择 → 上游转发 → 计费。无可用供应商时返回 mock 占位补全（同样计费）。" level="button" />
        </div>
      </div>

      {/* 右侧：响应 */}
      <div style={{ flex: 1, minWidth: 320 }}>
        <ResponseViewer result={result} loading={sending} textExtractor={completionsTextExtractor} />
      </div>
    </div>
  );
}
