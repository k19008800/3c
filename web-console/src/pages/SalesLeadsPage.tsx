import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  HelpIcon,
  Table,
  StatusBadge,
  Pagination,
  EmptyState,
  SkeletonGroup,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";
import "./console-misc.css";

/**
 * 销售 — 线索管理（CRM §11.2）
 * - 线索列表（公司/联系人/来源/状态/录入时间）
 * - 按状态筛选 + 关键词搜索
 * - 新增线索（内联表单）
 * - 状态流转（下拉）+ 转商机（内联表单填预估额）+ 删除
 */

const BTN_BASE: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 6, border: "none",
  cursor: "pointer", fontWeight: 600, fontSize: 13,
};

const LEAD_STATUS_META: Record<string, { label: string; badge: any }> = {
  new: { label: "新线索", badge: "info" },
  contacted: { label: "已联系", badge: "warning" },
  qualified: { label: "意向客户", badge: "success" },
  lost: { label: "无效", badge: "default" },
};

export default function SalesLeadsPage() {
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ company: "", contact_name: "", contact_email: "", contact_phone: "", source: "website" });
  const [convertId, setConvertId] = useState<number | null>(null);
  const [convertForm, setConvertForm] = useState({ expected_value_cents: "", expected_close_date: "" });
  const { toast } = useToast();

  const q = useQuery({
    queryKey: ["me-crm-leads", status, keyword, page],
    queryFn: async () => {
      const params = new URLSearchParams({ status, keyword, page: String(page), page_size: "20" });
      return (await api.get(`/me/crm/leads?${params}`)).data.data;
    },
    placeholderData: keepPreviousData,
  });

  const qc = useQueryClient();

  const createMut = useMutation({
    mutationFn: async (d: typeof form) =>
      (await api.post("/me/crm/leads", d)).data,
    onSuccess: () => {
      toast.success("线索已创建");
      qc.invalidateQueries({ queryKey: ["me-crm-leads"] });
      setShowForm(false);
      setForm({ company: "", contact_name: "", contact_email: "", contact_phone: "", source: "website" });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) =>
      (await api.put(`/me/crm/leads/${id}`, { status })).data,
    onSuccess: () => {
      toast.success("状态已更新");
      qc.invalidateQueries({ queryKey: ["me-crm-leads"] });
      qc.invalidateQueries({ queryKey: ["me-crm-opportunities"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const convertMut = useMutation({
    mutationFn: async (id: number) =>
      (await api.post(`/me/crm/leads/${id}/convert`, {
        name: `${convertForm.expected_close_date ? "商机" : "商机"}`,
        expected_value_cents: Number(convertForm.expected_value_cents || 0) * 100,
        expected_close_date: convertForm.expected_close_date || undefined,
      })).data,
    onSuccess: () => {
      toast.success("已转为商机");
      qc.invalidateQueries({ queryKey: ["me-crm-leads"] });
      qc.invalidateQueries({ queryKey: ["me-crm-opportunities"] });
      setConvertId(null);
      setConvertForm({ expected_value_cents: "", expected_close_date: "" });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/me/crm/leads/${id}`)).data,
    onSuccess: () => {
      toast.success("线索已删除");
      qc.invalidateQueries({ queryKey: ["me-crm-leads"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const columns: ColumnDef<any>[] = [
    {
      key: "company", title: "公司",
      render: (_, r) => <strong style={{ fontSize: 13 }}>{r.company}</strong>,
    },
    {
      key: "contact_name", title: "联系人",
      render: (_, r) => (
        <div style={{ fontSize: 13 }}>
          <div>{r.contact_name || "-"}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
            {r.contact_email || ""} {r.contact_phone ? `· ${r.contact_phone}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "source", title: "来源",
      render: (_, r) => <span style={{ fontSize: 13 }}>{sourceLabel(r.source)}</span>,
    },
    {
      key: "status", title: "状态",
      render: (_, r) => {
        const meta = LEAD_STATUS_META[r.status] ?? { label: r.status, badge: "default" };
        return <StatusBadge status={meta.badge}>{meta.label}</StatusBadge>;
      },
    },
    {
      key: "created_at", title: "录入时间",
      render: (_, r) => <span style={{ fontSize: 13 }}>{r.created_at?.slice(0, 10) || "-"}</span>,
    },
    {
      key: "action", title: "操作",
      render: (_, r) => (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={r.status}
            onChange={e => statusMut.mutate({ id: r.id, status: e.target.value })}
            style={{ height: 28, fontSize: 12, border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-panel)" }}>
            {Object.entries(LEAD_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {r.status !== "qualified" && r.status !== "lost" && (
            <button
              onClick={() => { setConvertId(convertId === r.id ? null : r.id); setConvertForm({ expected_value_cents: "", expected_close_date: "" }); }}
              style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--color-primary)", background: "var(--color-panel)", color: "var(--color-primary)", fontSize: 12, cursor: "pointer" }}>
              转商机
            </button>
          )}
          <button
            onClick={() => { if (confirm(`确认删除线索「${r.company}」？`)) deleteMut.mutate(r.id); }}
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", color: "var(--color-danger-text)", fontSize: 12, cursor: "pointer" }}>
            删除
          </button>
        </div>
      ),
    },
  ];

  const leads = q.data?.list ?? [];
  const pagination = q.data?.pagination;

  return (
    <div>
      <h2 style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        线索管理
        <HelpIcon text="线索管理 — 录入和管理潜在客户线索（官网/展会/转介绍）。线索状态：新线索→已联系→意向客户/无效。确认意向后可一键转为商机，进入报价流程。" level="page" />
      </h2>

      {/* 筛选 + 操作栏 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, marginTop: 8, flexWrap: "wrap" }}>
        <input
          placeholder="搜索公司 / 联系人 / 邮箱"
          value={keyword}
          onChange={e => { setKeyword(e.target.value); setPage(1); }}
          style={{ width: 220, height: 36, border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "0 12px", fontSize: 13 }}
        />
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
          style={{ height: 36, border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "0 8px", fontSize: 13, background: "var(--color-panel)" }}>
          <option value="">全部状态</option>
          <option value="new">新线索</option>
          <option value="contacted">已联系</option>
          <option value="qualified">意向客户</option>
          <option value="lost">无效</option>
        </select>
        <button onClick={() => setShowForm(!showForm)}
          style={{ ...BTN_BASE, background: "var(--color-primary)", color: "#fff" }}>
          + 新增线索
        </button>
      </div>

      {/* 新增线索表单 */}
      {showForm && (
        <div style={{ background: "var(--color-panel)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-xl)", padding: 20, marginBottom: 16, maxWidth: 560 }}>
          <h4 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>录入新线索</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input placeholder="公司名称 *" value={form.company}
              onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
              style={inputStyle} />
            <input placeholder="联系人姓名 *" value={form.contact_name}
              onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
              style={inputStyle} />
            <input placeholder="联系邮箱" value={form.contact_email}
              onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
              style={inputStyle} />
            <input placeholder="联系电话" value={form.contact_phone}
              onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
              style={inputStyle} />
            <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} style={{ ...inputStyle, background: "var(--color-panel)" }}>
              <option value="website">官网注册</option>
              <option value="exhibition">展会</option>
              <option value="referral">朋友介绍</option>
              <option value="cold_call">陌拜</option>
              <option value="other">其他</option>
            </select>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowForm(false)} style={{ ...BTN_BASE, background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>取消</button>
              <button onClick={() => createMut.mutate(form)} disabled={!form.company || !form.contact_name}
                style={{ ...BTN_BASE, background: "var(--color-primary)", color: "#fff", opacity: !form.company || !form.contact_name ? 0.6 : 1 }}>保存线索</button>
            </div>
          </div>
        </div>
      )}

      {/* 转商机内联表单 */}
      {convertId != null && (
        <div style={{ background: "var(--color-panel)", border: "1px solid var(--color-primary)", borderRadius: "var(--radius-xl)", padding: 16, marginBottom: 16 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>转商机 — 填写预估合同额</h4>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input placeholder="预估合同额（元）" type="number" value={convertForm.expected_value_cents}
              onChange={e => setConvertForm(f => ({ ...f, expected_value_cents: e.target.value }))}
              style={{ ...inputStyle, width: 180 }} />
            <input type="date" value={convertForm.expected_close_date}
              onChange={e => setConvertForm(f => ({ ...f, expected_close_date: e.target.value }))}
              style={{ ...inputStyle, width: 180 }} />
            <button onClick={() => convertMut.mutate(convertId)} disabled={convertMut.isPending}
              style={{ ...BTN_BASE, background: "var(--color-primary)", color: "#fff" }}>确认转换</button>
            <button onClick={() => setConvertId(null)} style={{ ...BTN_BASE, background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>取消</button>
          </div>
        </div>
      )}

      {/* 表格 */}
      {q.isLoading && !q.data ? <SkeletonGroup lines={5} /> : leads.length === 0 ? (
        <EmptyState title="暂无线索" description="点击「新增线索」录入潜在客户" />
      ) : (
        <>
          <Table columns={columns} dataSource={leads} loading={q.isLoading} emptyText="暂无线索" />
          {pagination && (
            <div style={{ marginTop: 16 }}>
              <Pagination current={pagination.page} total={pagination.total} pageSize={20} onChange={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)",
  fontSize: 14, width: "100%", boxSizing: "border-box",
};

function sourceLabel(s: string): string {
  return ({ website: "官网注册", exhibition: "展会", referral: "朋友介绍", cold_call: "陌拜", other: "其他" } as Record<string, string>)[s] ?? s;
}
