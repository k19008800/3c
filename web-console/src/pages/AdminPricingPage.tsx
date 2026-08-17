import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, EmptyState, SkeletonGroup, useToast } from "@3cloud/shared-ui";

interface PricingItem {
  id: number; model_id: number; model_name: string;
  vendor_id: number | null; vendor_name: string | null;
  input_price_per_1k: number; output_price_per_1k: number;
  cache_discount_rate: number | null;
  currency: string; status: string; status_label: string;
  effective_from: string | null; updated_at: string;
}

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };

const STATUS_MAP: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  active: "success",
  draft: "warning",
  archived: "default",
};

export default function AdminPricingPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [editPricing, setEditPricing] = useState<{ id: number; model_name: string; input: string; output: string; cacheRate: string } | null>(null);

  const q = useQuery({
    queryKey: ["admin-pricing", search],
    queryFn: async () => {
      const params = new URLSearchParams({ page_size: "100" });
      if (search) params.set("search", search);
      return (await api.get<{ data: { list: PricingItem[] } }>(`/admin/pricing?${params}`)).data.data;
    },
  });

  const updateMut = useMutation({
    mutationFn: async () => (await api.put(`/admin/pricing/${editPricing?.id}`, {
      input_price_per_1k: Number(editPricing?.input),
      output_price_per_1k: Number(editPricing?.output),
      // 缓存命中折扣率：留空 → 清空（回退全局 billing.cache_hit_discount）
      cache_discount_rate: editPricing?.cacheRate?.trim() ? Number(editPricing.cacheRate) : null,
    })).data,
    onSuccess: (d: any) => { toast.success(d?.data?.message ?? "价格更新成功"); setEditPricing(null); qc.invalidateQueries({ queryKey: ["admin-pricing"] }); },
    onError: (e) => toast.error(extractError(e)),
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        🏷️ 价格管理
        <HelpIcon
          text="平台定价管理：本页维护每个模型的平台标价（模型覆盖价，¥/1K tokens）与缓存命中折扣率。实际生效价格按六层优先级解析：L5 活动价（进行中活动，模型级覆盖/全局折扣）＞ L4 分组价（用户所属分组对应 pricing_group 的组价）＞ L3 代理价（绑定代理按层级打折）＞ L2 模型覆盖价（本页配置）＞ L1 平台标准价。上层未配置该模型时逐层降级，任一查询失败静默回退，不阻断请求。"
          level="page"
        />
      </h2>

      {/* P2-1 层级定价说明：六层解析规则 + [?] 帮助 */}
      <div style={{ ...card, marginBottom: 16, fontSize: 13, lineHeight: 1.7 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontWeight: 600 }}>
          📊 层级定价说明
          <HelpIcon
            text="生效价格按以下优先级取第一层命中值（上层未配置该模型 → 逐层降级）：L5 活动价：campaigns 中 status=active 且当前时间在 [startAt, endAt] 内，config.pricing.models.<模型> 覆盖价优先于 config.pricing.discount 全局折扣。L4 分组价：用户分组（user_group_memberships → user_groups.pricingGroup）匹配 vendor_pricing.pricing_group 的组价。L3 代理价：用户绑定代理（agent_customers）按层级折扣：junior 95 折 / senior 9 折 / partner 85 折。L2 模型覆盖价：本页 pricing_group=default 的单价。L1 平台标准价：未配置任何价格时的默认单价。"
            level="page"
          />
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, color: "var(--color-text-secondary)" }}>
          <li><b>L5 活动价</b>：进行中活动（status=active 且在活动期内）的模型级覆盖价 / 全局折扣，优先级最高</li>
          <li><b>L4 分组价</b>：用户所属分组（user_groups.pricingGroup）匹配 vendor_pricing.pricing_group 的组价</li>
          <li><b>L3 代理价</b>：绑定代理的用户按层级折扣（junior 95 折 / senior 9 折 / partner 85 折）</li>
          <li><b>L2 模型覆盖价</b>：本页配置的模型单价（pricing_group=default）</li>
          <li><b>L1 平台标准价</b>：未配置时兜底默认价</li>
        </ol>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索模型名称..." style={{ ...inp, width: 200, marginBottom: 0 }} />
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--color-text-secondary)" }}>共 {q.data?.list?.length ?? 0} 个定价</span>
      </div>

      <div style={card}>
        {q.isLoading ? <SkeletonGroup lines={4} /> : (q.data?.list?.length ?? 0) === 0 ? (
          <EmptyState title="暂无定价数据" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>模型</th>
                <th style={{ padding: "8px" }}>供应商</th>
                <th style={{ padding: "8px" }}>输入价格/1K</th>
                <th style={{ padding: "8px" }}>输出价格/1K</th>
                <th style={{ padding: "8px" }}>缓存命中折扣率 <HelpIcon text="缓存命中 token 按「全价 × 此折扣率」计费；「-」表示未配置，跟随全局「系统设置 → 计费策略」默认值（0.1）。" /></th>
                <th style={{ padding: "8px" }}>状态</th>
                <th style={{ padding: "8px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.list ?? []).map((p) => (
                <tr key={p.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{p.model_name}</td>
                  <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>{p.vendor_name ?? "-"}</td>
                  <td style={{ padding: "8px", fontWeight: 600 }}>¥{p.input_price_per_1k.toFixed(4)}</td>
                  <td style={{ padding: "8px", fontWeight: 600 }}>¥{p.output_price_per_1k.toFixed(4)}</td>
                  <td style={{ padding: "8px", color: p.cache_discount_rate != null ? "var(--color-primary)" : "var(--color-text-secondary)" }}>
                    {p.cache_discount_rate != null ? `${(p.cache_discount_rate * 100).toFixed(1)}%` : "—（跟随全局）"}
                  </td>
                  <td style={{ padding: "8px" }}><StatusBadge status={STATUS_MAP[p.status] ?? "success"}>{p.status_label}</StatusBadge></td>
                  <td style={{ padding: "8px" }}>
                    <button
                      onClick={() => setEditPricing({ id: p.id, model_name: p.model_name, input: String(p.input_price_per_1k), output: String(p.output_price_per_1k), cacheRate: p.cache_discount_rate != null ? String(p.cache_discount_rate) : "" })}
                      style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-primary)", padding: "4px 10px" }}
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!editPricing} onClose={() => setEditPricing(null)} title={`编辑定价 — ${editPricing?.model_name ?? ""}`} width={480}>
        {editPricing && (
          <>
            <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>输入价格 / 1K tokens</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <input value={editPricing.input} onChange={(e) => setEditPricing({ ...editPricing, input: e.target.value })} type="number" step="0.0001" min="0" style={{ ...inp, marginBottom: 0, flex: 1, minWidth: 0 }} />
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                ¥/1K tokens（¥/M 会被拒绝）<HelpIcon text="单价按每 1000 tokens 计，若按百万 tokens 录入会被拦截" />
              </span>
            </div>

            <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>输出价格 / 1K tokens</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <input value={editPricing.output} onChange={(e) => setEditPricing({ ...editPricing, output: e.target.value })} type="number" step="0.0001" min="0" style={{ ...inp, marginBottom: 0, flex: 1, minWidth: 0 }} />
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                ¥/1K tokens（¥/M 会被拒绝）<HelpIcon text="单价按每 1000 tokens 计，若按百万 tokens 录入会被拦截" />
              </span>
            </div>

            <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>
              缓存命中折扣率（0-1） <HelpIcon text="缓存命中 token 按「全价 × 此折扣率」计费。留空 = 未配置，跟随全局「系统设置 → 计费策略 → 缓存命中折扣率」（默认 0.1）。示例：0.1 = 命中按 10% 计费，0.5 = 按 50%。" />
            </label>
            <input value={editPricing.cacheRate} onChange={(e) => setEditPricing({ ...editPricing, cacheRate: e.target.value })} type="number" step="0.01" min="0.01" max="1" placeholder="留空跟随全局（默认 0.1）" style={inp} />

            {updateMut.isError && (
              <div style={{ marginBottom: 10, padding: "8px 10px", background: "var(--color-danger-bg)", borderRadius: 6, fontSize: 13, color: "var(--color-danger-text)" }}>
                ⚠️ {extractError(updateMut.error)}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setEditPricing(null)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}>取消</button>
              <button onClick={() => updateMut.mutate()} disabled={!editPricing.input || !editPricing.output || updateMut.isPending} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>
                {updateMut.isPending ? "保存中..." : "保存"}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
