import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Table, EmptyState, SkeletonGroup, useToast } from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";
import "./console-misc.css";

/**
 * 销售 — 报价单管理（CRM §11.4）
 * - 报价单列表（版本/商机/合计/有效期/状态）
 * - 按商机筛选（?opportunity_id= 从商机看板带参进入）
 * - 新建报价（行项动态增删，后端按单价×数量重算合计）
 * - 状态流转：草稿 → 已发送 → 客户接受 / 拒绝
 */

const BTN_BASE: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 6, border: "none",
  cursor: "pointer", fontWeight: 600, fontSize: 13,
};

const QUOTE_STATUS_META: Record<string, { label: string; badge: any }> = {
  draft: { label: "草稿", badge: "default" },
  sent: { label: "已发送", badge: "info" },
  accepted: { label: "已接受", badge: "success" },
  rejected: { label: "已拒绝", badge: "danger" },
};

interface QuoteLine { name: string; unitPriceCents: string; quantity: string; }

export default function SalesQuotesPage() {
  // 从商机看板带 ?opportunity_id= 进入时预选商机
  const params = new URLSearchParams(window.location.search);
  const [opportunityId, setOpportunityId] = useState(params.get("opportunity_id") ?? "");
  const [status, setStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [oppInput, setOppInput] = useState(params.get("opportunity_id") ?? "");
  const [lines, setLines] = useState<QuoteLine[]>([{ name: "", unitPriceCents: "", quantity: "1" }]);
  const [validUntil, setValidUntil] = useState("");
  const { toast } = useToast();

  const q = useQuery({
    queryKey: ["me-crm-quotes", opportunityId, status],
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (opportunityId) sp.set("opportunity_id", opportunityId);
      if (status) sp.set("status", status);
      return (await api.get(`/me/crm/quotes?${sp}`)).data.data;
    },
  });

  const qc = useQueryClient();

  const createMut = useMutation({
    mutationFn: async () => {
      const items = lines
        .filter(l => l.name.trim() && Number(l.unitPriceCents) >= 0)
        .map(l => ({
          name: l.name.trim(),
          unitPriceCents: Math.round(Number(l.unitPriceCents || 0) * 100),
          quantity: Number(l.quantity || 1),
        }));
      return (await api.post("/me/crm/quotes", {
        opportunity_id: Number(oppInput),
        items,
        valid_until: validUntil || undefined,
      })).data;
    },
    onSuccess: () => {
      toast.success("报价单已生成");
      qc.invalidateQueries({ queryKey: ["me-crm-quotes"] });
      setShowForm(false);
      setLines([{ name: "", unitPriceCents: "", quantity: "1" }]);
      setValidUntil("");
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) =>
      (await api.put(`/me/crm/quotes/${id}`, { status })).data,
    onSuccess: () => {
      toast.success("报价状态已更新");
      qc.invalidateQueries({ queryKey: ["me-crm-quotes"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/me/crm/quotes/${id}`)).data,
    onSuccess: () => {
      toast.success("报价单已删除");
      qc.invalidateQueries({ queryKey: ["me-crm-quotes"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const columns: ColumnDef<any>[] = [
    {
      key: "version", title: "版本",
      render: (_, r) => <span style={{ fontFamily: "monospace", fontWeight: 600 }}>V{r.version}</span>,
    },
    {
      key: "opportunity_id", title: "商机",
      render: (_, r) => (
        <span style={{ color: "var(--color-primary)", cursor: "pointer", fontSize: 13 }}
          onClick={() => window.location.href = `/sales/quotes?opportunity_id=${r.opportunity_id}`}>
          商机 #{r.opportunity_id}
        </span>
      ),
    },
    {
      key: "items", title: "行项",
      render: (_, r) => (
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          {Array.isArray(r.items) ? `${r.items.length} 项` : "-"}
        </span>
      ),
    },
    {
      key: "total_cents", title: "合计",
      render: (_, r) => (
        <span style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--color-primary)" }}>
          ¥{(Number(r.total_cents ?? 0) / 100).toFixed(2)}
        </span>
      ),
    },
    {
      key: "valid_until", title: "有效期至",
      render: (_, r) => <span style={{ fontSize: 13 }}>{r.valid_until?.slice(0, 10) || "-"}</span>,
    },
    {
      key: "status", title: "状态",
      render: (_, r) => {
        const meta = QUOTE_STATUS_META[r.status] ?? { label: r.status, badge: "default" };
        return <StatusBadge status={meta.badge}>{meta.label}</StatusBadge>;
      },
    },
    {
      key: "created_at", title: "创建时间",
      render: (_, r) => <span style={{ fontSize: 13 }}>{r.created_at?.slice(0, 10) || "-"}</span>,
    },
    {
      key: "action", title: "操作",
      render: (_, r) => (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <select value={r.status} onChange={e => statusMut.mutate({ id: r.id, status: e.target.value })}
            style={{ height: 28, fontSize: 12, border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-panel)" }}>
            {Object.entries(QUOTE_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={() => { if (confirm("确认删除该报价单？")) deleteMut.mutate(r.id); }}
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", color: "var(--color-danger-text)", fontSize: 12, cursor: "pointer" }}>
            删除
          </button>
        </div>
      ),
    },
  ];

  const quotes = q.data?.list ?? [];

  return (
    <div>
      <h2 style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        报价单
        <HelpIcon text="报价单管理 — 基于商机生成对外报价。行项按单价×数量自动合计（后端重算防篡改），版本号自增。状态：草稿→已发送→客户接受/拒绝。有效期可自定义。" level="page" />
      </h2>

      {/* 筛选 + 操作栏 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, marginTop: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>商机ID</span>
        <input placeholder="商机ID" value={opportunityId}
          onChange={e => setOpportunityId(e.target.value)}
          style={{ width: 110, height: 36, border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "0 10px", fontSize: 13 }} />
        <select value={status} onChange={e => setStatus(e.target.value)}
          style={{ height: 36, border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "0 8px", fontSize: 13, background: "var(--color-panel)" }}>
          <option value="">全部状态</option>
          <option value="draft">草稿</option>
          <option value="sent">已发送</option>
          <option value="accepted">已接受</option>
          <option value="rejected">已拒绝</option>
        </select>
        <button onClick={() => setShowForm(!showForm)}
          style={{ ...BTN_BASE, background: "var(--color-primary)", color: "#fff" }}>
          + 新建报价
        </button>
      </div>

      {/* 新建报价表单 */}
      {showForm && (
        <div style={{ background: "var(--color-panel)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-xl)", padding: 20, marginBottom: 16 }}>
          <h4 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>新建报价单</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <label style={{ fontSize: 13, width: 80 }}>商机ID *</label>
              <input type="number" value={oppInput} onChange={e => setOppInput(e.target.value)} style={{ ...inputStyle, width: 160 }} />
              <label style={{ fontSize: 13, width: 80 }}>有效期至</label>
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} style={{ ...inputStyle, width: 180 }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>行项（单价单位：元）</div>
            {lines.map((l, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input placeholder="行项名称（如 A100 算力月租）" value={l.name}
                  onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  style={{ ...inputStyle, flex: 2 }} />
                <input placeholder="单价(元)" type="number" value={l.unitPriceCents}
                  onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, unitPriceCents: e.target.value } : x))}
                  style={{ ...inputStyle, width: 120 }} />
                <input placeholder="数量" type="number" value={l.quantity}
                  onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))}
                  style={{ ...inputStyle, width: 90 }} />
                <button onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}
                  style={{ ...BTN_BASE, padding: "6px 10px", background: "var(--color-bg)", color: "var(--color-danger-text)", border: "1px solid var(--color-border)" }}>×</button>
              </div>
            ))}
            <button onClick={() => setLines(ls => [...ls, { name: "", unitPriceCents: "", quantity: "1" }])}
              style={{ ...BTN_BASE, alignSelf: "flex-start", background: "var(--color-bg)", color: "var(--color-primary)", border: "1px solid var(--color-primary)" }}>
              + 添加行项
            </button>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowForm(false)} style={{ ...BTN_BASE, background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>取消</button>
              <button onClick={() => createMut.mutate()} disabled={!oppInput || lines.every(l => !l.name.trim())}
                style={{ ...BTN_BASE, background: "var(--color-primary)", color: "#fff", opacity: !oppInput || lines.every(l => !l.name.trim()) ? 0.6 : 1 }}>生成报价</button>
            </div>
          </div>
        </div>
      )}

      {/* 表格 */}
      {q.isLoading ? <SkeletonGroup lines={5} /> : quotes.length === 0 ? (
        <EmptyState title="暂无报价单" description="从商机「报价」入口或点击「新建报价」生成" />
      ) : (
        <Table columns={columns} dataSource={quotes} loading={q.isLoading} emptyText="暂无报价单" />
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)",
  fontSize: 14, boxSizing: "border-box",
};
