import { useParams } from "react-router-dom";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  HelpIcon,
  StatusBadge,
  Table,
  Pagination,
  SkeletonGroup,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

/**
 * 销售 — 客户详情页
 * 对齐原型: agent-customers.html detail 视图 + agent-consumption.html
 * - 基本信息卡片（邮箱/绑定时间/余额）
 * - 消费总览卡片（累计消费/本月消费/当前余额）
 * - 消费明细表格（时间/供应商/模型/Token/金额）
 * - 充值记录表格
 * - 联系记录 + 标签管理 + 状态变更
 */

const CARD: React.CSSProperties = {
  background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
  border: "1px solid var(--color-border)", padding: 16,
};
const BTN_BASE: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 6, border: "none",
  cursor: "pointer", fontWeight: 600, fontSize: 13,
};

export default function SalesCustomerDetailPage() {
  const { userId } = useParams();
  const uid = Number(userId);
  const { toast } = useToast();

  /* ===== 数据 ===== */
  const q = useQuery({
    queryKey: ["me-customer", uid],
    queryFn: async () => (await api.get(`/me/customers/${uid}`)).data.data,
    enabled: !!uid,
  });

  const qc = useQueryClient();

  /* ===== 联系记录 ===== */
  const [contactData, setContactData] = useState({ method: "phone", summary: "", nextFollowUp: "" });
  const contactMut = useMutation({
    mutationFn: async (d: typeof contactData) =>
      (await api.post(`/me/customers/${uid}/contacts`, {
        method: d.method, summary: d.summary,
        next_follow_up: d.nextFollowUp || undefined,
      })).data,
    onSuccess: () => {
      toast.success("联系记录已添加");
      qc.invalidateQueries({ queryKey: ["me-customer", uid] });
      setContactData({ method: "phone", summary: "", nextFollowUp: "" });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  /* ===== 状态变更 ===== */
  const [statusData, setStatusData] = useState({ status: "", reason: "" });
  const statusMut = useMutation({
    mutationFn: async (d: typeof statusData) =>
      (await api.put(`/me/customers/${uid}/status`, { status: d.status, reason: d.reason })).data,
    onSuccess: () => {
      toast.success("状态已更新");
      qc.invalidateQueries({ queryKey: ["me-customer", uid] });
      setStatusData({ status: "", reason: "" });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  /* ===== 标签 ===== */
  const [tags, setTags] = useState<number[]>([]);
  const tagMut = useMutation({
    mutationFn: async (ids: number[]) =>
      (await api.put(`/me/customers/${uid}/tags`, { tag_ids: ids })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me-customer", uid] }),
    onError: (e) => toast.error(extractError(e)),
  });
  const tagsQ = useQuery({
    queryKey: ["me-customer-tags"],
    queryFn: async () => (await api.get("/me/customer-tags")).data.data,
  });

  /* ===== 消费明细时间筛选 ===== */
  const [consumptionTimeFilter, setConsumptionTimeFilter] = useState("30d");
  const [consumptionPage, setConsumptionPage] = useState(1);
  const consumptionQ = useQuery({
    queryKey: ["me-customer-consumption", uid, consumptionTimeFilter, consumptionPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        time_range: consumptionTimeFilter, page: String(consumptionPage), page_size: "10",
      });
      return (await api.get(`/me/customers/${uid}/consumption?${params}`)).data.data;
    },
    enabled: !!uid,
  });

  /* ===== 充值记录 ===== */
  const rechargeQ = useQuery({
    queryKey: ["me-customer-recharges", uid],
    queryFn: async () => (await api.get(`/me/customers/${uid}/recharges?page_size=10`)).data.data,
    enabled: !!uid,
  });

  const customer = q.data?.customer;
  if (!customer) return <SkeletonGroup lines={8} style={{ maxWidth: 1000, margin: "0 auto", padding: 32 }} />;

  const currentTags = q.data?.tags?.map((t: any) => t.id) || tags;
  const consumptionData = consumptionQ.data;
  const rechargeData = rechargeQ.data;

  const getCustomerStatus = (s: string) => {
    switch (s) {
      case "lead": return <StatusBadge status="warning">线索</StatusBadge>;
      case "trial": return <StatusBadge status="info">试用</StatusBadge>;
      case "active": return <StatusBadge status="success">活跃</StatusBadge>;
      case "silent": return <StatusBadge status="default">沉默</StatusBadge>;
      case "churned": return <StatusBadge status="danger">流失</StatusBadge>;
      default: return <StatusBadge status="default">{s || "未知"}</StatusBadge>;
    }
  };

  const consumptionColumns: ColumnDef<any>[] = [
    {
      key: "time", title: "时间",
      render: (_, record) => (
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          {record.time?.slice(0, 16) || record.created_at?.slice(0, 16) || "-"}
        </span>
      ),
    },
    {
      key: "provider", title: "供应商",
      render: (_, record) => <span style={{ fontSize: 13 }}>{record.provider || record.vendor_name || "-"}</span>,
    },
    {
      key: "model", title: "模型",
      render: (_, record) => <span style={{ fontSize: 13, color: "var(--color-text)" }}>{record.model || record.model_name || "-"}</span>,
    },
    {
      key: "input_tokens", title: "输入 Token",
      render: (_, record) => <span style={{ fontFamily: "monospace", fontSize: 13 }}>
        {Number(record.input_tokens ?? record.prompt_tokens ?? 0).toLocaleString()}
      </span>,
    },
    {
      key: "output_tokens", title: "输出 Token",
      render: (_, record) => <span style={{ fontFamily: "monospace", fontSize: 13 }}>
        {Number(record.output_tokens ?? record.completion_tokens ?? 0).toLocaleString()}
      </span>,
    },
    {
      key: "amount", title: "消费金额",
      render: (_, record) => (
        <span style={{ fontFamily: "monospace", fontWeight: 600 }}>
          ¥{Number(record.amount ?? record.cost ?? 0).toFixed(4)}
        </span>
      ),
    },
  ];

  const rechargeColumns: ColumnDef<any>[] = [
    {
      key: "time", title: "时间",
      render: (_, record) => (
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          {record.time?.slice(0, 16) || record.created_at?.slice(0, 16) || "-"}
        </span>
      ),
    },
    {
      key: "amount", title: "金额",
      render: (_, record) => (
        <span style={{ fontWeight: 600 }}>¥{Number(record.amount ?? 0).toFixed(2)}</span>
      ),
    },
    {
      key: "method", title: "支付方式",
      render: (_, record) => <span style={{ fontSize: 13 }}>{record.method || record.payment_method || "-"}</span>,
    },
  ];

  const contactColumns: ColumnDef<any>[] = [
    {
      key: "created_at", title: "时间",
      render: (_, record) => <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{record.created_at?.slice(0, 16)}</span>,
    },
    { key: "method", title: "方式", dataIndex: "method" },
    { key: "summary", title: "摘要", dataIndex: "summary", render: (v) => <span style={{ color: "var(--color-text)" }}>{v as string}</span> },
    {
      key: "next_follow_up", title: "下次跟进",
      render: (_, record) => record.next_follow_up?.slice(0, 10) || "-",
    },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      {/* 返回按钮 — 对齐原型 back-link */}
      <div
        onClick={() => window.history.back()}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13,
          color: "#6a8aff", cursor: "pointer", marginBottom: 16, padding: "6px 12px",
          borderRadius: 6, transition: ".15s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#eef1ff"; (e.currentTarget as HTMLElement).style.color = "#4f6ef7"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#6a8aff"; }}
      >
        ← 返回客户列表
      </div>

      <h2 style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
        客户详情 — {customer.username || customer.email}
        <HelpIcon text="客户详情页面 — 查看客户基本信息、消费明细、充值记录、联系记录和标签管理。支持状态变更。" level="page" />
      </h2>

      {/* 基本信息 + 消费总览 — 对齐 agent-customers.html detail-cards */}
      <div style={{ ...CARD, marginBottom: 16 }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 6 }}>
          📋 基本信息
        </h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 32px" }}>
          <InfoItem label="客户邮箱" value={customer.email} />
          <InfoItem label="绑定时间" value={customer.created_at?.slice(0, 10) || customer.user_created_at?.slice(0, 10) || "-"} />
          <InfoItem label="状态" value={getCustomerStatus(customer.status)} node />
          <InfoItem label="实名" value={customer.real_name_status || "未认证"} />
        </div>
      </div>

      {/* 消费总览 + 状态变更 + 标签 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
        {/* 消费总览 */}
        <div style={{ ...CARD }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>消费总览</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <MiniStat label="累计消费" value={`¥${Number(customer.total_consumption ?? customer.balance ?? 0).toLocaleString()}`} />
            <MiniStat label="本月消费" value={`¥${Number(customer.month_consumption ?? 0).toFixed(2)}`} />
            <MiniStat label="当前余额" value={`¥${Number(customer.balance ?? 0).toFixed(2)}`} />
          </div>
        </div>

        {/* 状态变更 */}
        <div style={{ ...CARD }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>状态变更</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <select value={statusData.status} onChange={e => setStatusData(s => ({ ...s, status: e.target.value }))}
              style={{ padding: "6px", borderRadius: 4, border: "1px solid var(--color-border)", fontSize: 13, width: "100%" }}>
              <option value="">选择新状态</option>
              <option value="lead">线索</option>
              <option value="trial">试用</option>
              <option value="active">活跃</option>
              <option value="silent">沉默</option>
              <option value="churned">流失</option>
            </select>
            <input placeholder="变更原因（可选）" value={statusData.reason}
              onChange={e => setStatusData(s => ({ ...s, reason: e.target.value }))}
              style={{ padding: "6px", borderRadius: 4, border: "1px solid var(--color-border)", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
            <button onClick={() => statusData.status && statusMut.mutate(statusData)} disabled={!statusData.status}
              style={{ ...BTN_BASE, background: "var(--color-primary)", color: "#fff", opacity: !statusData.status ? 0.6 : 1 }}>
              更新状态
            </button>
          </div>
        </div>

        {/* 标签 */}
        <div style={{ ...CARD }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>
            标签 ({currentTags?.length || 0}/5)
          </h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {tagsQ.data?.list?.map((t: any) => {
              const active = currentTags?.includes(t.id);
              return (
                <button key={t.id} onClick={() => {
                  const next = active ? currentTags.filter((id: number) => id !== t.id) : [...(currentTags || []), t.id];
                  setTags(next);
                  tagMut.mutate(next);
                }}
                  style={{
                    padding: "4px 10px", borderRadius: 12, fontSize: 12,
                    border: active ? `2px solid ${t.color}` : "1px solid var(--color-border)",
                    background: active ? t.color + "22" : "transparent",
                    color: active ? t.color : "var(--color-text-secondary)",
                    cursor: "pointer", transition: ".15s",
                  }}>
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 消费明细 — 对齐 agent-customers.html consumption detail */}
      <div style={{ ...CARD, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 6 }}>
            💰 消费明细
            <HelpIcon text="查看该客户所有模型的 Token 消费记录" level="button" />
          </h4>
          <select value={consumptionTimeFilter} onChange={e => { setConsumptionTimeFilter(e.target.value); setConsumptionPage(1); }}
            style={{ height: 32, padding: "0 8px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: 12, background: "#fff" }}>
            <option value="7d">近 7 天</option>
            <option value="30d">本月</option>
            <option value="90d">近 3 个月</option>
            <option value="all">全部</option>
          </select>
        </div>
        <Table columns={consumptionColumns}
          dataSource={consumptionData?.list || consumptionData?.rows || consumptionQ.data?.list || []}
          loading={consumptionQ.isLoading}
          emptyText="暂无消费记录" />
        {consumptionData?.pagination && (
          <div style={{ marginTop: 12 }}>
            <Pagination current={consumptionData.pagination.page} total={consumptionData.pagination.total}
              pageSize={10} onChange={setConsumptionPage} />
          </div>
        )}
      </div>

      {/* 充值记录 — 对齐 agent-customers.html recharge table */}
      <div style={{ ...CARD, marginBottom: 16 }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 6 }}>
          💳 充值记录
          <HelpIcon text="查看该客户的充值历史" level="button" />
        </h4>
        <Table columns={rechargeColumns}
          dataSource={rechargeData?.list || rechargeData?.rows || rechargeQ.data?.list || []}
          loading={rechargeQ.isLoading}
          emptyText="暂无充值记录" />
      </div>

      {/* 联系记录 — 保留原有功能 */}
      <div style={{ ...CARD }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>联系记录</h4>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <select value={contactData.method} onChange={e => setContactData(d => ({ ...d, method: e.target.value }))}
            style={{ padding: "6px", borderRadius: 4, border: "1px solid var(--color-border)", fontSize: 13 }}>
            <option value="phone">电话</option>
            <option value="wechat">微信</option>
            <option value="email">邮件</option>
            <option value="meeting">面谈</option>
            <option value="other">其他</option>
          </select>
          <input placeholder="沟通摘要" value={contactData.summary}
            onChange={e => setContactData(d => ({ ...d, summary: e.target.value }))}
            style={{ flex: 1, padding: "6px", borderRadius: 4, border: "1px solid var(--color-border)", fontSize: 13, minWidth: 200 }} />
          <input type="date" value={contactData.nextFollowUp}
            onChange={e => setContactData(d => ({ ...d, nextFollowUp: e.target.value }))}
            style={{ padding: "6px", borderRadius: 4, border: "1px solid var(--color-border)", fontSize: 13 }} />
          <button onClick={() => contactMut.mutate(contactData)} disabled={!contactData.summary}
            style={{ ...BTN_BASE, background: "var(--color-success-text)", color: "#fff", opacity: !contactData.summary ? 0.6 : 1 }}>
            添加
          </button>
        </div>
        <Table columns={contactColumns}
          dataSource={q.data?.contacts ?? []}
          loading={false}
          emptyText="暂无联系记录" />
      </div>
    </div>
  );
}

/* ===== 子组件 ===== */
function InfoItem({ label, value, node }: { label: string; value: React.ReactNode; node?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
      <span style={{ color: "var(--color-text-secondary)", minWidth: 80 }}>{label}</span>
      <span style={{ color: "var(--color-text)" }}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--color-bg)", borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-text)", marginTop: 2 }}>{value}</div>
    </div>
  );
}
