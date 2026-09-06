/**
 * 「编码规则配置」区 — T5 后台模型编码生成模板自定义（R-ADM-05）。
 *
 * 职责：
 * - 变量面板：{supplier_code}/{supplier_name}/{model_name}/{model_short}/{platform_model}/{seq}，点击插入光标处；
 * - 模板输入框 +「恢复默认模板」按钮（回填 {supplier_code}-{model_name}）；
 * - 实时预览：模板合法时防抖调 POST /admin/model-code-rules/preview，展示真实映射渲染示例；
 * - 保存校验：前端先按白名单预校验（未知变量/非法字符/含 @ → 内联错误），通过后 PUT，
 *   服务端 400 错误也 toast 透出；成功提示「仅对未生成编码的映射生效」（M-C-07）。
 *
 * 说明：
 * - 默认模板「厂商+模型」={supplier_code}-{model_name}；空模板 = 用默认。
 * - [?] 帮助：区块标题页面级 + 编码规则配置/恢复默认模板按钮级（AGENTS.md 硬要求）。
 *
 * @see docs/PRD-模型编码化改造与去除用户供应商选择-补充1-编码规则自定义.md（§2 / R-ADM-05）
 * @see docs/开发任务书-阶段B-前端模型编码化改造.md（T5.3）
 * @module pages/ModelCodeRuleConfig
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { extractError } from "../lib/api";
import {
  getModelCodeRules,
  saveModelCodeRules,
  previewModelCodeRules,
  validateModelCodeTemplate,
  MODEL_CODE_ALLOWED_VARS,
  MODEL_CODE_DEFAULT_TEMPLATE,
} from "../lib/adminModelCodes";
import { HelpIcon, useToast } from "@3cloud/shared-ui";

const card: React.CSSProperties = {
  background: "var(--color-panel)",
  padding: 20,
  borderRadius: 10,
  boxShadow: "0 1px 4px rgba(0,0,0,.06)",
};
const btnBase: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};
const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "monospace",
  fontSize: 14,
};

/** 变量 → 说明（供面板 tooltip） */
const VAR_HINT: Record<string, string> = {
  supplier_code: "供应商 code，如 vb",
  supplier_name: "供应商名称",
  model_name: "逻辑模型名，如 deepseek-v4-flash",
  model_short: "模型名缩写（字母数字连字符清洗）",
  platform_model: "上游真实模型名",
  seq: "序号（唯一冲突兜底）",
};

/** 区块标题页面级 [?] 帮助 */
const SECTION_HELP =
  "编码规则配置：设置模型编码生成模板，默认「厂商+模型」={supplier_code}-{model_name}。模板属后台系统配置，变更只对尚未生成编码的映射生效，已生成的存量编码不自动重写（避免调用侧 404）。";
/** 编码规则配置按钮级 [?] 帮助 */
const CONFIG_HELP = "设置模型编码生成模板，默认「厂商+模型」；仅对未生成编码的映射生效。";
/** 恢复默认模板按钮级 [?] 帮助 */
const RESET_HELP = "将全局模板恢复为 {supplier_code}-{model_name}；不重写已生成编码。";

/**
 * 编码规则配置区组件。
 * @returns 规则模板配置卡片（变量面板 + 模板输入 + 实时预览 + 保存）
 */
export default function ModelCodeRuleConfig() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [template, setTemplate] = useState("");
  /** 是否已从服务端加载过初始值（避免把空串当用户输入覆盖） */
  const loaded = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const rulesQ = useQuery({
    queryKey: ["admin-model-code-rules"],
    queryFn: async () => getModelCodeRules(),
  });

  // 加载完成后回填当前模板；空模板 = 用默认，输入框展示默认字面量便于编辑与保存
  useEffect(() => {
    if (!loaded.current && rulesQ.data) {
      loaded.current = true;
      const cur = rulesQ.data.template?.trim();
      setTemplate(cur ? rulesQ.data.template : rulesQ.data.default_template || MODEL_CODE_DEFAULT_TEMPLATE);
    }
  }, [rulesQ.data]);

  /** 前端预校验错误（null = 通过） */
  const clientError = useMemo(() => validateModelCodeTemplate(template), [template]);

  // 实时预览：模板合法时防抖调用 preview 接口
  const [previewItems, setPreviewItems] = useState<{ supplier_code: string; model_name: string; rendered_code: string }[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  useEffect(() => {
    if (!template.trim() || clientError) {
      setPreviewItems([]);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const r = await previewModelCodeRules(template);
        if (!cancelled) {
          setPreviewItems(r.preview ?? []);
          setPreviewError(null);
        }
      } catch {
        if (!cancelled) {
          setPreviewItems([]);
          setPreviewError("预览暂不可用，请稍后重试");
        }
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [template, clientError]);

  const saveMut = useMutation({
    mutationFn: async (tpl: string) => saveModelCodeRules(tpl),
    onSuccess: () => {
      toast.success("模板已保存（仅对未生成编码的映射生效，存量编码不变）");
      qc.invalidateQueries({ queryKey: ["admin-model-code-rules"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  /** 点击变量 chip：把 {var} 插入到输入框光标处 */
  const insertVar = (v: string) => {
    const token = `{${v}}`;
    const el = inputRef.current;
    if (!el) {
      setTemplate((t) => t + token);
      return;
    }
    const start = el.selectionStart ?? template.length;
    const end = el.selectionEnd ?? template.length;
    const next = template.slice(0, start) + token + template.slice(end);
    setTemplate(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  /** 恢复默认模板：回填 {supplier_code}-{model_name} */
  const resetDefault = () => setTemplate(MODEL_CODE_DEFAULT_TEMPLATE);

  const defaultTemplate = rulesQ.data?.default_template || MODEL_CODE_DEFAULT_TEMPLATE;

  return (
    <div style={{ ...card, marginTop: 24 }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 12px" }}>
        编码规则配置
        <HelpIcon text={SECTION_HELP} level="page" />
      </h3>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 12px" }}>
        模型编码按模板渲染生成；默认「厂商+模型」= <code>{MODEL_CODE_DEFAULT_TEMPLATE}</code>。变更只对新接入/未生成编码的映射生效。
      </p>

      {/* 变量面板：点击插入 */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>
          模板变量（点击插入）：
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {MODEL_CODE_ALLOWED_VARS.map((v) => (
            <button
              key={v}
              type="button"
              title={VAR_HINT[v]}
              onClick={() => insertVar(v)}
              style={{
                ...btnBase,
                padding: "4px 10px",
                fontSize: 12,
                fontFamily: "monospace",
                background: "var(--color-bg)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
              }}
            >
              {`{${v}}`}
            </button>
          ))}
        </div>
      </div>

      {/* 模板输入框 + 恢复默认 */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <input
          ref={inputRef}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          placeholder={defaultTemplate}
          style={inputStyle}
          aria-label="编码规则模板"
        />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            onClick={resetDefault}
            style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)", whiteSpace: "nowrap" }}
          >
            恢复默认模板
          </button>
          <HelpIcon text={RESET_HELP} level="button" />
        </span>
      </div>

      {/* 保存按钮 + 配置帮助 */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => saveMut.mutate(template)}
          disabled={!!clientError || saveMut.isPending}
          style={{ ...btnBase, background: "var(--color-primary)", color: "#fff", opacity: clientError ? 0.5 : 1 }}
        >
          {saveMut.isPending ? "保存中..." : "保存模板"}
        </button>
        <HelpIcon text={CONFIG_HELP} level="button" />
        {clientError && (
          <span style={{ fontSize: 13, color: "#b91c1c" }} role="alert">{clientError}</span>
        )}
      </div>

      {/* 实时预览 */}
      <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>
          实时预览（取真实映射渲染示例）：
        </div>
        {previewError ? (
          <div style={{ fontSize: 13, color: "#b45309" }}>{previewError}</div>
        ) : previewItems.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            {template.trim() && !clientError ? "加载预览..." : "输入模板后此处展示示例编码"}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "4px 8px" }}>供应商</th>
                <th style={{ padding: "4px 8px" }}>模型名</th>
                <th style={{ padding: "4px 8px" }}>渲染示例编码</th>
              </tr>
            </thead>
            <tbody>
              {previewItems.map((p, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "4px 8px" }}>{p.supplier_code}</td>
                  <td style={{ padding: "4px 8px" }}>{p.model_name}</td>
                  <td style={{ padding: "4px 8px", fontFamily: "monospace", fontWeight: 600, color: "#2563eb" }}>
                    {p.rendered_code}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
