/**
 * Playground 模型编码选择器 — 统一模型编码输入 + 默认编码偏好 + 价格明细入口。
 *
 * 模型编码化改造（M-S-02 / M-S-06 / M-S-08）：
 * - 输入框 + datalist：value=model_code，下拉显示 display_name；
 * - 「设为默认」「清除默认」：对接 GET/PUT/DELETE /me/preferences/default-code，
 *   以逻辑模型 model_name 为键保存/读取/清除默认编码；
 * - 「价格明细」：打开该逻辑模型下各编码对比清单（ChannelPriceMatrixModal）；
 * - 默认编码不可用（已下线/维护）→ 提示并展示可选编码清单，不自动回退（M-S-04）。
 *
 * @see docs/SPEC-模型编码化改造与去除用户供应商选择.md §3.6 / §5.3 / §九
 * @module components/playground
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HelpIcon, useToast } from "@3cloud/shared-ui";
import { api } from "../../lib/api";
import { ModelInput, filterModelCodeRows } from "./ModelInput";
import { ChannelPriceMatrixModal } from "../ChannelPriceMatrixModal";
import type { ModelRow } from "./types";

const btnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 12,
  background: "#fff",
  whiteSpace: "nowrap",
};

const primaryBtn: React.CSSProperties = {
  ...btnStyle,
  background: "var(--color-primary)",
  color: "#fff",
  borderColor: "var(--color-primary)",
};

/** 默认编码偏好 GET 响应形状 */
interface DefaultCodePref {
  model_name: string;
  model_code: string | null;
}

export function ModelCodeSelector(props: {
  models?: ModelRow[];
  value: string;
  onChange: (v: string) => void;
}) {
  const { models, value, onChange } = props;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [matrixOpen, setMatrixOpen] = useState(false);
  /** 默认编码不可用时，展示可选编码清单 */
  const [unavailableNotice, setUnavailableNotice] = useState<string | null>(null);

  // 仅保留带 model_code 的编码行（DB 空回退旧结构被过滤 → 空态不崩溃）
  const codeRows = useMemo(() => filterModelCodeRows(models), [models]);

  // 当前输入命中的编码行
  const row = useMemo(() => codeRows.find((r) => r.model_code === value) ?? null, [codeRows, value]);

  // 目标逻辑模型：优先当前选中编码的 model_name；未选时取列表第一个（进入页面回填用）
  const targetModelName = row?.model_name ?? codeRows[0]?.model_name ?? "";

  // 该逻辑模型下的全部可用编码（多供应商 = 多条）
  const codesForTarget = useMemo(
    () => codeRows.filter((r) => r.model_name === targetModelName),
    [codeRows, targetModelName],
  );

  // ── 读取默认编码偏好 ──
  const prefQ = useQuery<DefaultCodePref>({
    queryKey: ["me-default-code", targetModelName],
    enabled: !!targetModelName,
    queryFn: async () =>
      (await api.get<DefaultCodePref>(`/me/preferences/default-code?model_name=${encodeURIComponent(targetModelName)}`)).data,
    retry: false,
  });

  const savedCode = prefQ.data?.model_code ?? null;
  const savedAvailable = !!savedCode && codeRows.some((r) => r.model_code === savedCode);

  // 进入页面（value 为空）且存在可用默认编码 → 回填一次；用户已手动选择则不覆盖
  const backfilledRef = useRef(false);
  useEffect(() => {
    if (backfilledRef.current) return;
    if (value) return;
    if (!savedCode || !savedAvailable) return;
    backfilledRef.current = true;
    onChange(savedCode);
  }, [value, savedCode, savedAvailable, onChange]);

  // 默认编码已下线/维护 → 提示并展示可选编码清单（不自动回退）
  const defaultUnavailable = !!savedCode && !savedAvailable && !!targetModelName;

  // ── 保存默认编码 ──
  const saveMut = useMutation({
    mutationFn: async (code: string) =>
      (await api.put<DefaultCodePref>("/me/preferences/default-code", {
        model_name: row!.model_name,
        model_code: code,
      })).data,
    onSuccess: async () => {
      toast.success(`已将「${row!.model_name}」的默认编码设为 ${row!.model_code}`);
      setUnavailableNotice(null);
      await queryClient.invalidateQueries({ queryKey: ["me-default-code", targetModelName] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        ?? (err as { message?: string })?.message
        ?? "保存默认编码失败";
      // 400 MODEL_CODE_UNAVAILABLE：编码已下线/维护 → 提示并展示可选清单
      toast.error(msg);
      setUnavailableNotice(`默认编码不可用：${msg}`);
    },
  });

  // ── 清除默认编码 ──
  const clearMut = useMutation({
    mutationFn: async () =>
      api.delete(`/me/preferences/default-code?model_name=${encodeURIComponent(row!.model_name)}`),
    onSuccess: async () => {
      toast.success(`已清除「${row!.model_name}」的默认编码`);
      setUnavailableNotice(null);
      await queryClient.invalidateQueries({ queryKey: ["me-default-code", targetModelName] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        ?? (err as { message?: string })?.message
        ?? "清除默认编码失败";
      toast.error(msg);
    },
  });

  const canSetDefault = !!row && !saveMut.isPending;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <ModelInput value={value} onChange={onChange} models={models} />

        <button
          type="button"
          disabled={!canSetDefault}
          onClick={() => saveMut.mutate(row!.model_code)}
          style={{ ...primaryBtn, opacity: canSetDefault ? 1 : 0.5 }}
        >
          设为默认
          <HelpIcon text="把当前所选模型编码保存为该逻辑模型的默认编码；之后进入该模型时自动回填此编码。编码必须对您可用，否则返回 MODEL_CODE_UNAVAILABLE。" level="button" />
        </button>

        <button
          type="button"
          disabled={!row || !savedCode || clearMut.isPending}
          onClick={() => clearMut.mutate()}
          style={{ ...btnStyle, opacity: !row || !savedCode ? 0.5 : 1 }}
        >
          清除默认
          <HelpIcon text="清除当前逻辑模型已保存的默认编码偏好；清除后进入页面不再自动回填。" level="button" />
        </button>

        <button
          type="button"
          disabled={!row}
          onClick={() => setMatrixOpen(true)}
          style={{ ...btnStyle, opacity: row ? 1 : 0.5 }}
        >
          价格明细
          <HelpIcon text="展示该逻辑模型下各供应商编码的输入/输出/缓存价、健康度、延迟与推荐/维护标签。" level="button" />
        </button>
      </div>

      {/* 默认编码已下线/维护：提示 + 可选编码清单（不自动回退） */}
      {(defaultUnavailable || unavailableNotice) && (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 8, background: "#fff8e1", color: "#8a5a00", fontSize: 13 }}>
          {defaultUnavailable && savedCode ? (
            <>
              当前保存的默认编码 <code>{savedCode}</code> 已不可用（维护/下线），请从以下「{targetModelName}」的可用编码中选择：
            </>
          ) : (
            <>{unavailableNotice}</>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {codesForTarget.map((c) => (
              <button
                key={c.model_code}
                type="button"
                onClick={() => {
                  onChange(c.model_code);
                  setUnavailableNotice(null);
                }}
                style={{ ...btnStyle, fontFamily: "monospace" }}
              >
                {c.display_name}（{c.model_code}）
              </button>
            ))}
            {codesForTarget.length === 0 && <span style={{ color: "#888" }}>该逻辑模型暂无可用编码。</span>}
          </div>
        </div>
      )}

      {/* 命中编码的供应商提示（编码即供应商，不再有独立供应商选择） */}
      {row && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-text-secondary)" }}>
          当前编码 <code>{row.model_code}</code> → {row.supplier_name}
          {row.maintenance ? "（维护中）" : ""} · 输入 ¥{row.prices?.input_price ?? "—"} / 输出 ¥{row.prices?.output_price ?? "—"}
        </div>
      )}

      <ChannelPriceMatrixModal
        open={matrixOpen}
        modelName={targetModelName}
        rows={codeRows}
        onClose={() => setMatrixOpen(false)}
      />
    </div>
  );
}
