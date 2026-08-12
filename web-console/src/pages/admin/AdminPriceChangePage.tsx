import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, StatusBadge, Modal, SkeletonGroup, EmptyState, useToast } from "@3cloud/shared-ui";

/**
 * 供应商管理 → 价格变更通知
 *
 * 三个 Tab：
 * - 变更列表：以「销售价」为准（vendor_pricing 变更触发），状态 待分发 / 已分发，
 *   支持影响分析（Top10 用户 + 替代模型）与手动重新分发
 * - 分发日志：每次分发的执行记录（A/B/C 各级数量）
 * - 可替代性系数：影响评分公式中的系数，支持人工覆盖（0.3~2.0）
 */

/* ---------- types ---------- */

interface PriceChangeLog {
  id: number;
  // 后端返回 drizzle 行（camelCase）+ 路由追加的 snake_case 派生字段
  oldInputPrice: string | null;
  newInputPrice: string | null;
  oldOutputPrice: string | null;
  newOutputPrice: string | null;
  oldSalePrice: string | null;
  newSalePrice: string | null;
  effectiveAt: string;
  reason: string | null;
  dispatched: boolean;
  createdAt: string;
  model_name: string;
  vendor_name: string;
  change_type: "cost" | "sale" | "both";
  change_rate: number;
  change_pct: number;
  direction: "up" | "down";
}

interface ImpactResult {
  model: { modelId: number; modelName: string; supplierId: number; supplierName: string };
  old_sale_price: number;
  new_sale_price: number;
  change_rate: number;
  effective_at: string;
  auto_coefficient: number;
  effective_coefficient: number;
  coefficient_basis: string;
  tier_distribution: { A: number; B: number; C: number };
  total_users_evaluated: number;
  top_users: { user_id: number; email: string; share: number; coefficient: number; score: number; tier: string; channel: string; status: string }[];
  alternatives: { model_name: string; min_price: number | null }[];
}

interface SubItem {
  model_id: number;
  model_name: string;
  status: string;
  auto_coefficient: number;
  manual_coefficient: number | null;
  effective_coefficient: number;
  peer_count: number;
  coefficient_basis: string;
}

/* ---------- styles ---------- */

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const statCard: React.CSSProperties = { flex: 1, background: "var(--color-panel)", borderRadius: 10, padding: "16px 18px", boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "7px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" };
const btnGhost: React.CSSProperties = { ...btnBase, background: "#fff", color: "#4f6ef7", border: "1px solid #4f6ef7" };
const btnPrimary: React.CSSProperties = { ...btnBase, background: "#4f6ef7", color: "#fff" };
const inputBase: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 13 };
const tabBtn: React.CSSProperties = { padding: "9px 24px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, background: "transparent", color: "#666" };
const tabBtnActive: React.CSSProperties = { ...tabBtn, background: "#eef1ff", color: "#4f6ef7", fontWeight: 600 };
const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontWeight: 600, fontSize: 12, color: "#666", background: "#f8f9fa" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, borderTop: "1px solid #f0f0f0", verticalAlign: "middle" };

// 价格格式化：数字、去尾零（如 ¥0.2 / ¥0.000125）
const fmt = (v: string | number | null | undefined) => {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return "¥" + (Number.isInteger(n) ? n.toFixed(0) : String(parseFloat(n.toFixed(6))));
};
const fmtDt = (d?: string | null) => {
  if (!d) return "—";
  const t = new Date(d).getTime();
  if (isNaN(t)) return "—";
  return new Date(t).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const CHANGE_TYPE_LABEL: Record<string, string> = { cost: "成本价", sale: "销售价", both: "成本+销售价" };

function tierBadge(tier: string) {
  const map: Record<string, { color: string; label: string }> = {
    A: { color: "#e53935", label: "A 紧急" },
    B: { color: "#fb8c00", label: "B 周报" },
    C: { color: "#9e9e9e", label: "C 静默" },
  };
  const m = map[tier] ?? { color: "#9e9e9e", label: tier };
  return <span style={{ color: m.color, fontWeight: 600, fontSize: 12 }}>{m.label}</span>;
}

/* ---------- page ---------- */

export default function AdminPriceChangePage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<"list" | "dispatch" | "sub">("list");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "true" | "false">("all");
  const [impactItem, setImpactItem] = useState<PriceChangeLog | null>(null);
  const [subEdit, setSubEdit] = useState<SubItem | null>(null);

  /* ---------- queries ---------- */

  const statsQ = useQuery({
    queryKey: ["admin-price-changes-stats"],
    queryFn: async () => (await api.get("/admin/price-changes/stats")).data.data,
  });

  const listQ = useQuery({
    queryKey: ["admin-price-changes", keyword, statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = { page_size: "100", keyword };
      if (statusFilter !== "all") params.dispatched = statusFilter;
      return (await api.get("/admin/price-changes", { params })).data.data;
    },
  });

  const dispatchQ = useQuery({
    queryKey: ["admin-price-dispatch-logs"],
    queryFn: async () => (await api.get("/admin/price-changes/dispatch-logs", { params: { page_size: "100" } })).data.data,
  });

  const subQ = useQuery({
    queryKey: ["admin-substitutability"],
    queryFn: async () => (await api.get("/admin/substitutability")).data.data,
  });

  const impactQ = useQuery({
    queryKey: ["admin-price-impact", impactItem?.id],
    queryFn: async () => (await api.get(`/admin/price-changes/${impactItem!.id}/impact`)).data.data,
    enabled: impactItem != null,
  });

  /* ---------- mutations ---------- */

  const notifyMut = useMutation({
    mutationFn: async (id: number) => (await api.post(`/admin/price-changes/${id}/notify`, {})).data,
    onSuccess: () => {
      toast.success("已重新触发分发");
      qc.invalidateQueries({ queryKey: ["admin-price-changes"] });
      qc.invalidateQueries({ queryKey: ["admin-price-changes-stats"] });
      qc.invalidateQueries({ queryKey: ["admin-price-dispatch-logs"] });
    },
    onError: (e: any) => toast.error(extractError(e)),
  });

  const overrideMut = useMutation({
    mutationFn: async ({ modelId, manualCoefficient, reason }: { modelId: number; manualCoefficient: string; reason: string }) =>
      (await api.patch("/admin/substitutability", { modelId, manual_coefficient: manualCoefficient || null, reason })).data,
    onSuccess: () => {
      toast.success("系数已保存");
      setSubEdit(null);
      qc.invalidateQueries({ queryKey: ["admin-substitutability"] });
    },
    onError: (e: any) => toast.error(extractError(e)),
  });

  /* ---------- derived ---------- */

  const stats = statsQ.data ?? { today_changes: 0, pending_changes: 0, month_impacted_users: 0, month_urgent: 0 };
  const list = listQ.data?.list ?? [];

  /* ---------- render ---------- */

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>价格变更通知</h2>
        <HelpIcon text="以供应商销售价（vendor_pricing）为准，价格变更自动记录并按影响评分分三级通知用户：A 紧急（站内信+邮件）、B 周报汇总、C 静默。每小时自动分发一次。" level="page" />
      </div>

      {/* stat cards */}
      <div style={{ display: "flex", gap: 14, marginBottom: 20 }}>
        <div style={statCard}>
          <div style={{ fontSize: 12, color: "#888" }}>今日变更</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#4f6ef7", marginTop: 6 }}>{stats.today_changes}</div>
        </div>
        <div style={statCard}>
          <div style={{ fontSize: 12, color: "#888" }}>待分发</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: stats.pending_changes > 0 ? "#fb8c00" : "#22c55e", marginTop: 6 }}>{stats.pending_changes}</div>
        </div>
        <div style={statCard}>
          <div style={{ fontSize: 12, color: "#888" }}>本月影响用户</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#333", marginTop: 6 }}>{stats.month_impacted_users}</div>
        </div>
        <div style={statCard}>
          <div style={{ fontSize: 12, color: "#888" }}>本月紧急通知</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: stats.month_urgent > 0 ? "#e53935" : "#333", marginTop: 6 }}>{stats.month_urgent}</div>
        </div>
      </div>

      {/* tabs */}
      <div style={{ display: "flex", gap: 4, background: "#f5f5f5", borderRadius: 10, padding: 4, marginBottom: 16, width: "fit-content" }}>
        <button style={tab === "list" ? tabBtnActive : tabBtn} onClick={() => setTab("list")}>变更列表</button>
        <button style={tab === "dispatch" ? tabBtnActive : tabBtn} onClick={() => setTab("dispatch")}>分发日志</button>
        <button style={tab === "sub" ? tabBtnActive : tabBtn} onClick={() => setTab("sub")}>可替代性系数</button>
      </div>

      {/* ── TAB 1: 变更列表 ── */}
      {tab === "list" && (
        <div style={card}>
          {/* filter bar */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
            <input style={{ ...inputBase, flex: 1 }} placeholder="搜索模型 / 供应商..." value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <select style={inputBase} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
              <option value="all">全部状态</option>
              <option value="false">待分发</option>
              <option value="true">已分发</option>
            </select>
            <HelpIcon text="变更以销售价为准：供应商在「供应商定价」页保存调价后，此处自动记录一条变更。系统每小时整点后自动分发一次；也可手动重新分发。" level="button" />
          </div>

          {listQ.isLoading ? <SkeletonGroup lines={6} /> : list.length === 0 ? (
            <EmptyState icon="📉" title="暂无价格变更" description="供应商调价后会自动记录到此处" />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={th}>模型</th>
                <th style={th}>供应商</th>
                <th style={th}>类型</th>
                <th style={th}>销售价 原 → 新</th>
                <th style={th}>幅度</th>
                <th style={th}>生效时间</th>
                <th style={th}>状态</th>
                <th style={th}>操作</th>
              </tr></thead>
              <tbody>
                {list.map((pc: PriceChangeLog) => (
                  <tr key={pc.id} style={{ background: pc.dispatched ? undefined : "#fffaf0" }}>
                    <td style={td}><span style={{ fontWeight: 500 }}>{pc.model_name}</span></td>
                    <td style={{ ...td, color: "#888" }}>{pc.vendor_name}</td>
                    <td style={td}><StatusBadge status={pc.change_type === "both" ? "info" : "default"}>{CHANGE_TYPE_LABEL[pc.change_type]}</StatusBadge></td>
                    <td style={td}>
                      <span style={{ color: "#888" }}>{fmt(pc.oldSalePrice ?? pc.oldOutputPrice)}</span>
                      <span style={{ color: "#999", margin: "0 6px" }}>→</span>
                      <span style={{ color: pc.direction === "up" ? "#e53935" : "#22c55e", fontWeight: 600 }}>{fmt(pc.newSalePrice ?? pc.newOutputPrice)}</span>
                    </td>
                    <td style={{ ...td, color: pc.direction === "up" ? "#e53935" : "#22c55e", fontWeight: 600 }}>
                      {pc.direction === "up" ? "▲" : "▼"} {pc.change_pct}%
                    </td>
                    <td style={{ ...td, color: "#888", fontSize: 12 }}>{fmtDt(pc.effectiveAt)}</td>
                    <td style={td}>
                      {pc.dispatched
                        ? <StatusBadge status="success">已分发</StatusBadge>
                        : <StatusBadge status="warning">待分发</StatusBadge>}
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={btnGhost} onClick={() => setImpactItem(pc)}>影响分析</button>
                        <button style={btnPrimary} onClick={() => notifyMut.mutate(pc.id)}>重新分发</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── TAB 2: 分发日志 ── */}
      {tab === "dispatch" && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>📋 分发执行日志 <HelpIcon text="每次自动或手动分发都会记录一条：评估用户总数、A 紧急 / B 周报 / C 静默各级数量。失败会记录错误原因。" level="button" /></div>
          {dispatchQ.isLoading ? <SkeletonGroup lines={5} /> : (dispatchQ.data?.list ?? []).length === 0 ? (
            <EmptyState icon="📭" title="暂无分发记录" description="价格变更分发后会自动记录" />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={th}>模型</th>
                <th style={th}>评估用户</th>
                <th style={th}>A 紧急</th>
                <th style={th}>B 周报</th>
                <th style={th}>C 静默</th>
                <th style={th}>分发时间</th>
                <th style={th}>结果</th>
              </tr></thead>
              <tbody>
                {(dispatchQ.data?.list ?? []).map((d: any) => (
                  <tr key={d.id}>
                    <td style={td}>{d.model_name || "—"}</td>
                    <td style={td}>{d.total_users_evaluated}</td>
                    <td style={{ ...td, color: "#e53935", fontWeight: 600 }}>{d.tier_a_count ?? d.tierACount ?? 0}</td>
                    <td style={{ ...td, color: "#fb8c00", fontWeight: 600 }}>{d.tier_b_count ?? d.tierBCount ?? 0}</td>
                    <td style={{ ...td, color: "#888" }}>{d.tier_c_count ?? d.tierCCount ?? 0}</td>
                    <td style={{ ...td, color: "#888", fontSize: 12 }}>{fmtDt(d.dispatched_at ?? d.dispatchedAt)}</td>
                    <td style={td}>
                      {d.error_message ?? d.errorMessage
                        ? <span title={d.error_message ?? d.errorMessage}><StatusBadge status="danger">失败</StatusBadge></span>
                        : <StatusBadge status="success">成功</StatusBadge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── TAB 3: 可替代性系数 ── */}
      {tab === "sub" && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>
            🔄 可替代性系数 <HelpIcon text="影响评分 = |变动率| × 用户消费占比 × 可替代性系数。基础值按同类活跃模型数自动计算（≥8→1.5，5-7→1.2，2-4→1.0，仅1→0.5），可在 0.3~2.0 内人工覆盖。" level="button" />
          </div>
          {subQ.isLoading ? <SkeletonGroup lines={6} /> : (subQ.data?.list ?? []).length === 0 ? (
            <EmptyState icon="🔄" title="暂无模型" description="模型上线后可在此查看可替代性系数" />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={th}>模型</th>
                <th style={th}>状态</th>
                <th style={th}>同类活跃</th>
                <th style={th}>自动系数</th>
                <th style={th}>人工覆盖</th>
                <th style={th}>生效系数</th>
                <th style={th}>依据</th>
                <th style={th}>操作</th>
              </tr></thead>
              <tbody>
                {(subQ.data?.list ?? []).map((s: SubItem) => (
                  <tr key={s.model_id}>
                    <td style={{ ...td, fontWeight: 500 }}>{s.model_name}</td>
                    <td style={td}><StatusBadge status={s.status === "active" ? "success" : "default"}>{s.status === "active" ? "启用" : "停用"}</StatusBadge></td>
                    <td style={td}>{s.peer_count}</td>
                    <td style={td}>{s.auto_coefficient}</td>
                    <td style={td}>{s.manual_coefficient != null ? <StatusBadge status="info">{s.manual_coefficient}</StatusBadge> : <span style={{ color: "#bbb" }}>—</span>}</td>
                    <td style={{ ...td, fontWeight: 700, color: "#4f6ef7" }}>{s.effective_coefficient}</td>
                    <td style={{ ...td, color: "#888", fontSize: 12, maxWidth: 240 }}>{s.coefficient_basis}</td>
                    <td style={td}><button style={btnGhost} onClick={() => setSubEdit(s)}>覆盖系数</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── 影响分析 Modal ── */}
      <Modal open={impactItem != null} onClose={() => setImpactItem(null)} title={`影响分析 · ${impactItem?.model_name ?? ""}`} width={820}>
        {impactQ.isLoading || !impactQ.data ? <SkeletonGroup lines={6} /> : (() => {
          const imp: ImpactResult = impactQ.data;
          return (
            <div>
              {/* price summary */}
              <div style={{ background: "#f7f9fc", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
                  <span style={{ color: "#666" }}>供应商：</span><b>{imp.model.supplierName}</b>
                  <span style={{ color: "#ddd" }}>|</span>
                  <span style={{ color: "#666" }}>销售价：</span>
                  <b>{fmt(imp.old_sale_price)}</b>
                  <span style={{ color: "#999" }}>→</span>
                  <b style={{ color: imp.change_rate >= 0 ? "#e53935" : "#22c55e" }}>{fmt(imp.new_sale_price)}</b>
                  <span style={{ color: imp.change_rate >= 0 ? "#e53935" : "#22c55e", fontWeight: 700 }}>
                    {imp.change_rate >= 0 ? "▲" : "▼"} {Math.abs(imp.change_rate)}%
                  </span>
                  <span style={{ color: "#bbb" }}>|</span>
                  <span style={{ color: "#666" }}>生效：</span><span>{fmtDt(imp.effective_at)}</span>
                </div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
                  可替代性系数：<b style={{ color: "#4f6ef7" }}>{imp.effective_coefficient}</b>
                  <span style={{ color: "#bbb" }}>（{imp.coefficient_basis}）</span>
                </div>
              </div>

              {/* tier distribution */}
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                {([
                  { k: "A", label: "A 紧急（站内+邮件）", color: "#e53935", v: imp.tier_distribution.A },
                  { k: "B", label: "B 周报汇总", color: "#fb8c00", v: imp.tier_distribution.B },
                  { k: "C", label: "C 静默", color: "#9e9e9e", v: imp.tier_distribution.C },
                ] as const).map((t) => (
                  <div key={t.k} style={{ flex: 1, background: `${t.color}12`, borderRadius: 10, padding: "10px 14px", textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: t.color }}>{t.v}</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{t.label}</div>
                  </div>
                ))}
              </div>

              {/* top users */}
              <div style={{ fontWeight: 600, fontSize: 14, margin: "16px 0 8px" }}>👤 受影响用户 Top10（共 {imp.total_users_evaluated} 个近30天活跃客户参与评估）</div>
              {imp.top_users.length === 0 ? (
                <EmptyState icon="👤" title="无受影响用户" description="近 30 天无人消费该模型" />
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={th}>#</th>
                    <th style={th}>用户</th>
                    <th style={th}>消费占比</th>
                    <th style={th}>系数</th>
                    <th style={th}>影响评分</th>
                    <th style={th}>级别</th>
                    <th style={th}>触达</th>
                  </tr></thead>
                  <tbody>
                    {imp.top_users.map((u, i) => (
                      <tr key={u.user_id}>
                        <td style={td}>{i + 1}</td>
                        <td style={td}>{u.email}</td>
                        <td style={td}>{(u.share * 100).toFixed(1)}%</td>
                        <td style={td}>{u.coefficient}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{u.score}</td>
                        <td style={td}>{tierBadge(u.tier)}</td>
                        <td style={{ ...td, color: "#888" }}>{u.channel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* alternatives */}
              {imp.alternatives.length > 0 && (
                <>
                  <div style={{ fontWeight: 600, fontSize: 14, margin: "16px 0 8px" }}>💡 可替代模型建议（发给 A 级用户）</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {imp.alternatives.map((a) => (
                      <div key={a.model_name} style={{ background: "#f0f7ff", borderRadius: 8, padding: "8px 14px", fontSize: 13 }}>
                        <b>{a.model_name}</b>
                        <span style={{ color: "#888", marginLeft: 8 }}>{fmt(a.min_price)}/1M</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* actions */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
                <button style={btnGhost} onClick={() => setImpactItem(null)}>关闭</button>
                <button style={btnPrimary} onClick={() => { notifyMut.mutate(impactItem!.id); }}>重新分发通知</button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── 覆盖系数 Modal ── */}
      <Modal open={subEdit != null} onClose={() => setSubEdit(null)} title={`覆盖系数 · ${subEdit?.model_name ?? ""}`}>
        {subEdit && (
          <div>
            <p style={{ fontSize: 13, color: "#666", margin: "0 0 14px", lineHeight: 1.6 }}>
              当前自动系数：<b>{subEdit.auto_coefficient}</b>（同类活跃模型 {subEdit.peer_count} 个）
              <br />
              生效系数：<b style={{ color: "#4f6ef7" }}>{subEdit.effective_coefficient}</b>
              <br />
              <span style={{ color: "#999", fontSize: 12 }}>清空系数并填写理由 = 恢复自动计算</span>
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                overrideMut.mutate({
                  modelId: subEdit.model_id,
                  manualCoefficient: String(fd.get("coef") || "").trim(),
                  reason: String(fd.get("reason") || "").trim(),
                });
              }}
            >
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, color: "#333", display: "block", marginBottom: 6 }}>手动系数（0.3 ~ 2.0，留空=恢复自动）</label>
                <input name="coef" type="number" step="0.05" min="0.3" max="2.0" defaultValue={subEdit.manual_coefficient ?? ""} style={{ ...inputBase, width: "100%" }} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, color: "#333", display: "block", marginBottom: 6 }}>覆盖理由（必填）</label>
                <textarea name="reason" rows={3} placeholder="例如：该模型为独家供货，无实际替代" style={{ ...inputBase, width: "100%", resize: "vertical" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button type="button" style={btnGhost} onClick={() => setSubEdit(null)}>取消</button>
                <button type="submit" style={btnPrimary} disabled={overrideMut.isPending}>{overrideMut.isPending ? "保存中..." : "保存"}</button>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </div>
  );
}
