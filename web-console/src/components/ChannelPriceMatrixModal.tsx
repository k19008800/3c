/**
 * 模型编码对比清单弹窗 — 展示某逻辑模型下各供应商编码的价格/健康/状态对比。
 *
 * 模型编码化改造（R-MC-03）：由旧「渠道价目矩阵」迁移而来。数据源不再走
 * `/models/:name/channels`，直接复用 Playground 已加载的 `/me/models` 编码列表，
 * 按 `model_name` 过滤出同一逻辑模型的全部编码并排对比。
 *
 * 字段：display_name / model_code / supplier_name / 输入价 / 输出价 / 缓存读·写 /
 * 健康 / 推荐 / 维护标签。
 *
 * @see docs/SPEC-模型编码化改造与去除用户供应商选择.md §5.1 / §九 [?] 对照
 * @module components
 */

import { useMemo } from "react";
import { HelpIcon, Modal, EmptyState } from "@3cloud/shared-ui";
import type { ModelRow } from "./playground/types";

const th: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  background: "#f8f9fa",
  color: "#666",
  fontWeight: 600,
  borderBottom: "1px solid var(--color-border)",
};
const td: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f0f0f0",
  verticalAlign: "middle",
};

/** 价格格式化：空值显示「—」 */
function fmtPrice(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return `¥${value}`;
}

/** 行状态徽标配色 */
function statusStyle(row: ModelRow): React.CSSProperties {
  if (row.maintenance || row.status === "maintenance" || row.status === "offline") {
    return { color: "#c62828", background: "#ffebee" };
  }
  return { color: "#2e7d32", background: "#e8f5e9" };
}

function statusLabel(row: ModelRow): string {
  if (row.maintenance || row.status === "maintenance") return "维护中";
  if (row.status === "offline") return "已下线";
  return "可用";
}

/**
 * 模型编码对比清单弹窗。
 *
 * @param props.open - 是否打开
 * @param props.modelName - 逻辑模型名（按此过滤编码）
 * @param props.rows - /me/models 全部编码行（组件内部按 model_name 过滤）
 * @param props.onClose - 关闭回调
 */
export function ChannelPriceMatrixModal(props: {
  open: boolean;
  modelName: string;
  rows?: ModelRow[];
  onClose: () => void;
}) {
  const { open, modelName, rows, onClose } = props;

  // 按逻辑模型名过滤出同一模型的全部编码（多条 = 多供应商）
  const codes = useMemo(
    () => (rows ?? []).filter((r) => r && r.model_name === modelName && r.model_code),
    [rows, modelName],
  );

  return (
    <Modal open={open} onClose={onClose} title={`模型编码对比 · ${modelName}`} width={920}>
      <div style={{ marginBottom: 12, color: "var(--color-text-secondary)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
        同一逻辑模型由多个供应商提供时，系统内对应多条模型编码；下表并排对比各编码的生效价、健康与状态。
        <HelpIcon text="展示该逻辑模型下各供应商编码的输入/输出/缓存价、健康度、延迟；选择不同条目即选择不同供应商。" level="page" />
      </div>

      {codes.length === 0 ? (
        <EmptyState title="该模型暂无可用编码" description="未查询到该逻辑模型下的模型编码，请稍后重试或联系管理员。" />
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780, fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th}>模型编码</th>
                <th style={th}>供应商</th>
                <th style={th}>输入价</th>
                <th style={th}>输出价</th>
                <th style={th}>缓存读/写</th>
                <th style={th}>健康</th>
                <th style={th}>状态</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((row) => (
                <tr key={row.model_code}>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <strong>{row.display_name}</strong>
                      <code style={{ color: "#888" }}>{row.model_code}</code>
                      {row.recommended && <span title="综合健康、延迟、价格后优先推荐">⭐推荐</span>}
                      {row.maintenance && <span>🔧维护中</span>}
                    </div>
                    <div style={{ color: "#888", fontSize: 12 }}>价格组 {row.pricing_group || "—"}</div>
                  </td>
                  <td style={td}>{row.supplier_name}</td>
                  <td style={td}>{fmtPrice(row.prices?.input_price)}</td>
                  <td style={td}>{fmtPrice(row.prices?.output_price)}</td>
                  <td style={td}>
                    {fmtPrice(row.prices?.cache_read_input_price)} / {fmtPrice(row.prices?.cache_write_input_price)}
                  </td>
                  <td style={td}>
                    {row.health ?? "—"}
                    {row.latency_ms != null ? ` · ${row.latency_ms}ms` : ""}
                  </td>
                  <td style={td}>
                    <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 12, ...statusStyle(row) }}>
                      {statusLabel(row)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
