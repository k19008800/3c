/**
 * Playground 模型编码输入框 — 文本输入 + /me/models 模型编码联想（datalist）
 *
 * 模型编码化改造（M-S-02/04）：datalist option 的 value 为 `model_code`（请求体
 * `model` 权威值），下拉标签显示 `display_name`（模型名（供应商名））。用户也可直接
 * 输入任意编码；不在列表中的自定义编码按编码原样透传，不做名称→编码映射（M-C-04）。
 *
 * @see docs/SPEC-模型编码化改造与去除用户供应商选择.md §5.3
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

/** datalist id：同一时刻只有一个编码选择区渲染，常量 id 安全 */
const MODEL_LIST_ID = "playground-model-datalist";

/**
 * 过滤出带 `model_code` 的编码行。
 *
 * DB 空回退 `DEFAULT_MODELS` 为旧结构（无 model_code），过滤后下拉为空 → 占位态，
 * 不崩溃（M-S-06）。
 */
export function filterModelCodeRows(rows?: ModelRow[]): ModelRow[] {
  return (rows ?? []).filter((m): m is ModelRow => Boolean(m && m.model_code));
}

export function ModelInput(props: {
  value: string;
  onChange: (v: string) => void;
  models?: ModelRow[];
  help?: string;
  placeholder?: string;
}) {
  const { value, onChange, models, help, placeholder } = props;
  const codeRows = filterModelCodeRows(models);
  return (
    <div style={{ flex: 1, minWidth: 200 }}>
      <label style={labelStyle}>
        模型编码
        <HelpIcon
          text={
            help ??
            "模型编码 = 「厂商+模型」生成的唯一编码（如 va-deepseek-v4-flash），传参即锁定对应供应商；同一模型多供应商对应多条编码。编码规则后台可配置，默认「厂商+模型」。"
          }
          level="button"
        />
      </label>
      <input
        list={MODEL_LIST_ID}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "输入模型编码（如 va-deepseek-v4-flash）"}
        style={inputStyle}
      />
      <datalist id={MODEL_LIST_ID}>
        {codeRows.map((m) => (
          <option key={m.model_code} value={m.model_code}>
            {m.display_name}
          </option>
        ))}
      </datalist>
    </div>
  );
}
