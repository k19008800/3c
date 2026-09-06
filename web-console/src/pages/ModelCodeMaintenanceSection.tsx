/**
 * 「模型编码」维护区 — T5 后台编码列表 / 启停 / 重新生成。
 *
 * 职责：
 * - 拉取并渲染后台模型编码列表（一个 模型×供应商 = 一条全局唯一 model_code）；
 * - 按状态启用/停用编码（PUT /admin/model-codes/:id/status，停用不删除防复用）；
 * - 单条「重新生成编码」（POST /admin/model-codes/:id/regenerate），二次确认弹窗
 *   提示「存量调用旧编码将 404」风险（R-ADM-06 / M-C-07）；
 * - 同逻辑模型多编码时，展示名 = 模型名（供应商名），并给出去重提示（M-C-05）。
 *
 * 说明：
 * - 数据经 ../lib/adminModelCodes 调用层，严格对齐任务书 §3 契约；
 *   后端接口未就绪时走空态/错误态，不注入伪造数据。
 * - [?] 帮助：区块标题页面级 + 启停/重新生成按钮级（AGENTS.md 硬要求）。
 *
 * @see docs/开发任务书-阶段B-前端模型编码化改造.md（T5）
 * @see docs/SPEC-模型编码化改造与去除用户供应商选择.md（§九 admin-model-code）
 * @module pages/ModelCodeMaintenanceSection
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { extractError } from "../lib/api";
import {
  fetchModelCodeList,
  updateModelCodeStatus,
  regenerateModelCode,
  type ModelCodeRow,
  type ModelCodeStatus,
} from "../lib/adminModelCodes";
import { HelpIcon, StatusBadge, Modal, EmptyState, SkeletonGroup, useToast } from "@3cloud/shared-ui";

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

/** 区块标题旁页面级 [?] 帮助文案 */
const SECTION_HELP =
  "模型编码维护：编码由平台按规则生成，默认「厂商+模型」={supplier_code}-{model_name}，规则后台可配置、仅对未生成编码的映射生效。一个（模型×供应商）= 一条全局唯一编码，用户调用即锁定对应供应商。编码不可复用、改码需走迁移；停用后该编码不可调用但不删除（防复用）。";

/** 启用/停用按钮级 [?] 帮助 */
const TOGGLE_HELP = "停用后该编码不可调用；编码不删除（防复用）。重新启用即可恢复。";
/** 重新生成按钮级 [?] 帮助 */
const REGEN_HELP =
  "按当前模板重新生成该条编码；已使用旧编码的调用方将 404，操作前请确认已通知所有调用方。";

/** 编码状态 → 展示文案与徽章色（对齐后端枚举 active/inactive/deprecated/beta） */
const STATUS_VIEW: Record<string, { label: string; badge: "success" | "info" | "danger" | "warning" }> = {
  active: { label: "启用", badge: "success" },
  beta: { label: "公测", badge: "info" },
  inactive: { label: "停用", badge: "danger" },
  deprecated: { label: "已弃用", badge: "warning" },
};
/** 可调用状态（其余为不可调用）；启停按钮据此切换 启用→停用 / 停用→启用 */
const CALLABLE: ReadonlySet<string> = new Set(["active", "beta"]);

/**
 * 模型编码维护区组件。
 * @returns 编码列表卡片（含启停 / 重新生成确认弹窗）
 */
export default function ModelCodeMaintenanceSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  /** 待重新生成的编码行（非空 = 确认弹窗打开） */
  const [regenerating, setRegenerating] = useState<ModelCodeRow | null>(null);

  const listQ = useQuery({
    queryKey: ["admin-model-codes"],
    queryFn: async () => (await fetchModelCodeList({ page_size: 100 })),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: ModelCodeStatus }) =>
      updateModelCodeStatus(id, status),
    onSuccess: () => {
      toast.success("编码状态已更新");
      qc.invalidateQueries({ queryKey: ["admin-model-codes"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const regenerateMut = useMutation({
    mutationFn: async (id: number) => regenerateModelCode(id),
    onSuccess: (d) => {
      toast.success(`编码已重新生成：${d.old_code} → ${d.new_code}`);
      setRegenerating(null);
      qc.invalidateQueries({ queryKey: ["admin-model-codes"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  /** 按逻辑模型名分组，用于「同模型多编码」去重提示 */
  const groupDup = useMemo(() => {
    const rows = listQ.data?.list ?? [];
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.model_name, (map.get(r.model_name) ?? 0) + 1);
    return map;
  }, [listQ.data]);

  const rows = listQ.data?.list ?? [];

  return (
    <div style={{ ...card, marginTop: 24 }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 12px" }}>
        模型编码维护
        <HelpIcon text={SECTION_HELP} level="page" />
      </h3>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 12px" }}>
        一个（模型 × 供应商）= 一条全局唯一模型编码；同一逻辑模型多供应商时，展示名 =
        模型名（供应商名）。
      </p>

      {listQ.isLoading ? (
        <SkeletonGroup lines={5} />
      ) : rows.length === 0 ? (
        <EmptyState title="暂无模型编码" />
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
              <th style={{ padding: "8px" }}>模型编码</th>
              <th style={{ padding: "8px" }}>模型名</th>
              <th style={{ padding: "8px" }}>显示名</th>
              <th style={{ padding: "8px" }}>供应商</th>
              <th style={{ padding: "8px" }}>状态</th>
              <th style={{ padding: "8px" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const callable = CALLABLE.has(String(r.status));
              const view = STATUS_VIEW[String(r.status)] ?? { label: String(r.status), badge: "default" as const };
              const dup = (groupDup.get(r.model_name) ?? 1) > 1;
              return (
                <tr key={r.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "8px", fontWeight: 600, fontFamily: "monospace", fontSize: 13 }}>
                    {r.model_code}
                  </td>
                  <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>
                    {r.model_name}
                    {dup && (
                      <span style={{ fontSize: 12, color: "#b45309", marginLeft: 6 }} title="同模型多编码，展示名已按 模型名（供应商名） 去重">
                        （多编码）
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "8px" }}>{r.display_name || `${r.model_name}（${r.supplier_name}）`}</td>
                  <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>{r.supplier_name}</td>
                  <td style={{ padding: "8px" }}>
                    <StatusBadge status={view.badge}>{view.label}</StatusBadge>
                  </td>
                  <td style={{ padding: "8px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <button
                        onClick={() =>
                          toggleMut.mutate({ id: r.id, status: callable ? "inactive" : "active" })
                        }
                        disabled={toggleMut.isPending}
                        style={{
                          ...btnBase,
                          padding: "4px 10px",
                          background: callable ? "var(--color-danger-bg)" : "var(--color-success-bg)",
                          color: callable ? "var(--color-danger-text)" : "var(--color-success-text)",
                        }}
                      >
                        {callable ? "停用" : "启用"}
                      </button>
                      <HelpIcon text={TOGGLE_HELP} level="button" />
                      <button
                        onClick={() => setRegenerating(r)}
                        disabled={regenerateMut.isPending}
                        style={{ ...btnBase, padding: "4px 10px", marginLeft: 6, background: "var(--color-bg)", color: "var(--color-text)" }}
                      >
                        重新生成编码
                      </button>
                      <HelpIcon text={REGEN_HELP} level="button" />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* 重新生成确认弹窗：提示存量调用 404 风险（R-ADM-06） */}
      <Modal
        open={!!regenerating}
        onClose={() => setRegenerating(null)}
        title="重新生成模型编码"
        width={460}
      >
        {regenerating && (
          <div>
            <p style={{ fontSize: 14, lineHeight: 1.8, marginTop: 0 }}>
              将按当前模板把编码 <strong style={{ fontFamily: "monospace" }}>{regenerating.model_code}</strong> 重新生成。
            </p>
            <p style={{ fontSize: 14, color: "#b45309", lineHeight: 1.8 }}>
              风险：已在使用旧编码的调用方在重新生成后将收到 <strong>404（MODEL_CODE_NOT_FOUND）</strong>，请确认已通知所有调用方更新为新编码。
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setRegenerating(null)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}>
                取消
              </button>
              <button
                onClick={() => regenerateMut.mutate(regenerating.id)}
                disabled={regenerateMut.isPending}
                style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}
              >
                {regenerateMut.isPending ? "生成中..." : "确认重新生成"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
