/**
 * Playground 模型输入框 — 文本输入 + /me/models 联想下拉（datalist）
 *
 * 兼容端点（rerank/embeddings/messages 等）的模型名不在 /me/models 聊天列表里，
 * 因此用自由文本输入 + 联想，而不是硬编码下拉。
 *
 * @module components/playground
 */

import { HelpIcon } from "@3cloud/shared-ui";
import type { ModelRow } from "./types";

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "var(--color-text)",
  display: "block",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  fontSize: 13,
  boxSizing: "border-box",
  background: "#fff",
  color: "var(--color-text)",
  fontFamily: "monospace",
};

/** datalist id：同一时刻只有一个 Tab 渲染，常量 id 安全 */
const MODEL_LIST_ID = "playground-model-datalist";

export function ModelInput(props: {
  value: string;
  onChange: (v: string) => void;
  models?: ModelRow[];
  help?: string;
  placeholder?: string;
}) {
  const { value, onChange, models, help, placeholder } = props;
  return (
    <div style={{ flex: 1, minWidth: 200 }}>
      <label style={labelStyle}>
        模型
        <HelpIcon text={help ?? "模型名将透传给网关按名路由；不在下拉列表中的自定义模型名也可直接输入。"} level="button" />
      </label>
      <input
        list={MODEL_LIST_ID}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "输入模型名（如 deepseek-chat）"}
        style={inputStyle}
      />
      <datalist id={MODEL_LIST_ID}>
        {models?.map((m) => (
          <option key={m.id} value={m.name} />
        ))}
      </datalist>
    </div>
  );
}
