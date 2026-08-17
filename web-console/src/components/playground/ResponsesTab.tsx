/**
 * Playground — Responses 调试 Tab（POST /v1/responses，OpenAI Responses API 兼容）
 *
 * GPT-5 / Codex 等新一代客户端默认走 Responses API。网关在入口做
 * responses → chat 格式转换，出口把 chat 响应映射回 Responses 格式。
 *
 * 本页支持：
 * - input 字符串 / JSON items 数组两种模式
 * - instructions（等价 system）与 max_output_tokens
 * - stream:true 时实时渲染 SSE 事件序列（response.created →
 *   output_item.added → output_text.delta × N → output_text.done → response.completed），
 *   并累积 output_text.delta 为最终文本
 *
 * @see api/src/routes/responses.ts + services/upstream/responses-stream.ts（后端契约）
 * @see newapi-gap-analysis.md Batch 4 任务 4.4（/v1/responses 兼容）
 * @module components/playground
 */

import { useState } from "react";
import { HelpIcon, useToast } from "@3cloud/shared-ui";
import { sendDebugRequest } from "./request";
import { ModelInput } from "./ModelInput";
import { ResponseViewer, controlStyle, primaryBtnStyle } from "./ResponseViewer";
import type { PlaygroundTabProps, ProxyResult, StreamEvent } from "./types";

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

/** 流式事件中提取增量文本：response.output_text.delta → data.delta */
function responsesStreamDelta(ev: StreamEvent): string | null {
  if (ev.event !== "response.output_text.delta") return null;
  try {
    const data = JSON.parse(ev.data) as Record<string, unknown>;
    return typeof data.delta === "string" ? data.delta : null;
  } catch {
    return null;
  }
}

/** 非流式响应提取文本：output[] 中 type=message 的 content[].text 拼接 */
function responsesJsonText(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  const output = Array.isArray(j.output) ? (j.output as Array<Record<string, unknown>>) : null;
  if (!output) return null;
  const texts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object" || item.type !== "message") continue;
    const content = Array.isArray(item.content) ? (item.content as Array<Record<string, unknown>>) : [];
    for (const part of content) {
      if (part && typeof part.text === "string") texts.push(part.text);
    }
  }
  return texts.length ? texts.join("\n") : null;
}

export function ResponsesTab(props: PlaygroundTabProps) {
  const { fullKey, models } = props;
  const { toast } = useToast();

  const [model, setModel] = useState("deepseek-chat");
  const [inputMode, setInputMode] = useState<"string" | "items">("string");
  const [inputText, setInputText] = useState("你好，请用一句话介绍什么是 3cloud。");
  const [instructions, setInstructions] = useState("");
  const [maxOutputTokens, setMaxOutputTokens] = useState("");
  const [stream, setStream] = useState(false);
  const [result, setResult] = useState<ProxyResult | null>(null);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!fullKey.trim()) {
      toast.error("请先粘贴完整 API Key");
      return;
    }
    if (!model.trim()) {
      toast.error("请填写模型名");
      return;
    }

    // input 构造：字符串模式直接透传；items 模式要求合法 JSON 数组
    let input: string | unknown[];
    if (inputMode === "string") {
      if (!inputText.trim()) {
        toast.error("input 不能为空");
        return;
      }
      input = inputText;
    } else {
      try {
        const parsed = JSON.parse(inputText);
        if (!Array.isArray(parsed)) throw new Error("not array");
        if (parsed.length === 0) throw new Error("empty");
        input = parsed;
      } catch {
        toast.error("JSON items 模式需要合法的非空 JSON 数组，例如 [{\"role\":\"user\",\"content\":\"hi\"}]");
        return;
      }
    }

    const body: Record<string, unknown> = { model: model.trim(), input, stream };
    if (instructions.trim()) body.instructions = instructions;
    if (maxOutputTokens) {
      const n = parseInt(maxOutputTokens);
      if (!isNaN(n) && n > 0) body.max_output_tokens = n;
    }

    setSending(true);
    setResult(null);
    try {
      const res = await sendDebugRequest({
        path: "/api/v1/v1/responses",
        apiKey: fullKey,
        body,
      });
      setResult(res);
      if (res.ok) toast.success(stream ? "流式响应完成" : "请求完成");
      else toast.error("请求失败：" + (res.error ?? `HTTP ${res.status}`));
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {/* 左侧：参数配置 */}
      <div style={{ flex: 1, minWidth: 320 }}>
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>参数</h3>
            <HelpIcon text="Responses API 是 OpenAI 新一代接口（GPT-5 / Codex SDK 默认）。网关将 Responses 请求转换为 Chat Completions 转发上游，再把响应映射回 Responses 格式。" level="button" />
          </div>

          <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
            <ModelInput
              value={model}
              onChange={setModel}
              models={models}
              help="Responses 请求的模型名，网关按名路由到可用供应商。"
              placeholder="例如 deepseek-chat / gpt-5"
            />
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={fieldLabelStyle}>
                max_output_tokens
                <HelpIcon text="最大输出 token 数（可选）。" level="button" />
              </label>
              <input
                type="number"
                min={1}
                value={maxOutputTokens}
                onChange={(e) => setMaxOutputTokens(e.target.value)}
                placeholder="可选"
                style={controlStyle}
              />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 8, minWidth: 140 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={stream} onChange={(e) => setStream(e.target.checked)} />
                流式 (stream)
                <HelpIcon text="stream=true 时返回 SSE 事件序列（response.created → output_text.delta × N → response.completed），可验证 Responses 流式协议。" level="button" />
              </label>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={fieldLabelStyle}>
              instructions（系统指令，可选）
              <HelpIcon text="等价 Chat API 的 system 消息，转换时并入 messages 开头。" level="button" />
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="You are a helpful assistant."
              style={{ ...controlStyle, minHeight: 52, fontFamily: "monospace", resize: "vertical" }}
            />
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <label style={{ ...fieldLabelStyle, marginBottom: 0 }}>
                input（输入）
                <HelpIcon text={'字符串模式直接发送文本；JSON items 模式发送 [{"role":"user","content":"..."}] 数组（支持多轮/多模态 content 块）。'} level="button" />
              </label>
              <div style={{ display: "flex", gap: 4 }}>
                {(["string", "items"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setInputMode(mode)}
                    style={{
                      padding: "3px 10px",
                      fontSize: 12,
                      borderRadius: 6,
                      border: "1px solid var(--color-border)",
                      cursor: "pointer",
                      background: inputMode === mode ? "var(--color-primary)" : "#fff",
                      color: inputMode === mode ? "#fff" : "var(--color-text)",
                    }}
                  >
                    {mode === "string" ? "字符串" : "JSON items 数组"}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={inputMode === "string" ? "输入文本…" : '[{"role":"user","content":"hi"}]'}
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
            {sending ? "请求中..." : "🚀 发送 Responses 请求"}
          </button>
          <HelpIcon text="调用 /v1/responses：Responses→Chat 转换 → 鉴权 → 余额预检 → 渠道选择 → 上游转发（OpenAI 格式）→ 响应映射回 Responses 格式 → 计费。" level="button" />
        </div>
      </div>

      {/* 右侧：响应 */}
      <div style={{ flex: 1, minWidth: 320 }}>
        <ResponseViewer
          result={result}
          loading={sending}
          textExtractor={responsesJsonText}
          streamTextExtractor={stream ? responsesStreamDelta : undefined}
        />
      </div>
    </div>
  );
}
