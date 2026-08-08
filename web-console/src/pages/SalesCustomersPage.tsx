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

/**
 * 销售 — 客户列表
 * 对齐原型: agent-customers.html
 * - 搜索框 + 排序下拉 + 时间筛选
 * - 客户表格（邮箱/绑定时间/累计消费/本月消费/余额/最后消费/操作）
 * - 状态标签 StatusBadge
 * - 分页
 * - 点击客户行 → /sales/customers/:userId
 */

export default function SalesCustomersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState("total-desc");
  const [timeRange, setTimeRange] = useState("all");
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  const q = useQuery({
    queryKey: ["me-customers", status, search, sortBy, timeRange, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        status: status || "",
        search: search || "",
        sort: sortBy,
        time_range: timeRange,
        page: String(page),
        page_size: "20",
      });
      return (await api.get(`/me/customers?${params}`)).data.data;
    },
    placeholderData: keepPreviousData,
  });

  const qc = useQueryClient();
  const assignMut = useMutation({
    mutationFn: async (userId: number) => (await api.post(`/me/customers/${userId}/assign`)).data,
    onSuccess: () => {
      toast.success("已认领客户");
      qc.invalidateQueries({ queryKey: ["me-customers"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const getStatus = (s: string) => {
    switch (s) {
      case "lead": return <StatusBadge status="warning">线索</StatusBadge>;
      case "trial": return <StatusBadge status="info">试用</StatusBadge>;
      case "active": return <StatusBadge status="success">活跃</StatusBadge>;
      case "silent": return <StatusBadge status="default">沉默</StatusBadge>;
      case "churned": return <StatusBadge status="danger">流失</StatusBadge>;
      default: return <StatusBadge status="default">{s || "未知"}</StatusBadge>;
    }
  };

  const columns: ColumnDef<any>[] = [
    {
      key: "email", title: "客户邮箱",
      render: (_, record) => (
        <span style={{ color: "var(--color-primary)", cursor: "pointer", fontSize: 13 }}
          onClick={() => window.location.href = `/sales/customers/${record.user_id}`}>
          {record.email || record.username || `用户${record.user_id}`}
        </span>
      ),
    },
    {
      key: "created_at", title: "绑定时间",
      render: (_, record) => <span style={{ fontSize: 13 }}>{record.created_at?.slice(0, 10) || "-"}</span>,
    },
    {
      key: "total_consumption", title: "累计消费",
      render: (_, record) => (
        <span style={{ fontFamily: "monospace", fontWeight: 500 }}>
          ¥{Number(record.total_consumption ?? record.balance ?? 0).toLocaleString()}
        </span>
      ),
    },
    {
      key: "month_consumption", title: "本月消费",
      render: (_, record) => (
        <span style={{ fontFamily: "monospace" }}>
          ¥{Number(record.month_consumption ?? 0).toFixed(2)}
        </span>
      ),
    },
    {
      key: "balance", title: "当前余额",
      render: (_, record) => (
        <span style={{ fontFamily: "monospace" }}>
          ¥{Number(record.balance ?? 0).toFixed(2)}
        </span>
      ),
    },
    {
      key: "last_consumption", title: "最后消费时间",
      render: (_, record) => (
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          {record.last_consumption_at?.slice(0, 16) || record.updated_at?.slice(0, 16) || "-"}
        </span>
      ),
    },
    {
      key: "status", title: "状态",
      render: (_, record) => getStatus(record.status),
    },
    {
      key: "action", title: "操作",
      render: (_, record) => (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            onClick={() => window.location.href = `/sales/customers/${record.user_id}`}
            style={{
              padding: "4px 12px", borderRadius: 6, border: "1px solid var(--color-border)",
              background: "#fff", fontSize: 12, cursor: "pointer", color: "var(--color-text)",
            }}>
            查看详情
          </button>
          {!record.salesperson_id && (
            <button
              onClick={() => assignMut.mutate(record.user_id)}
              disabled={assignMut.isPending}
              style={{
                padding: "4px 12px", borderRadius: 6, border: "1px solid var(--color-primary)",
                background: "#fff", color: "var(--color-primary)", fontSize: 12, cursor: "pointer",
              }}>
              认领
            </button>
          )}
        </div>
      ),
    },
  ];

  const pagination = q.data?.pagination;
  const customers = q.data?.list ?? [];

  return (
    <div>
      <h2 style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        我的客户
        <HelpIcon text="客户管理 — 查看和管理分配给您的客户。可按状态、关键词搜索筛选，支持客户状态变更和联系记录录入。" level="page" />
      </h2>

      {/* 筛选/搜索栏 — 对齐 agent-customers.html toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, marginTop: 8, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input
            placeholder="搜索客户邮箱"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            onKeyDown={e => e.key === "Enter" && q.refetch()}
            style={{ width: 240, height: 40, border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "0 12px", fontSize: 14 }}
          />
          <select value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1); }}
            style={{ height: 40, border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "0 8px", fontSize: 13, background: "#fff" }}>
            <option value="total-desc">累计消费 ↓</option>
            <option value="total-asc">累计消费 ↑</option>
            <option value="month-desc">本月消费 ↓</option>
            <option value="month-asc">本月消费 ↑</option>
            <option value="bind-desc">绑定时间 ↓</option>
            <option value="bind-asc">绑定时间 ↑</option>
          </select>
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>注册时间</span>
          <select value={timeRange} onChange={e => { setTimeRange(e.target.value); setPage(1); }}
            style={{ height: 40, border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "0 8px", fontSize: 13, background: "#fff" }}>
            <option value="all">全部时间</option>
            <option value="7d">近 7 天</option>
            <option value="30d">近 30 天</option>
            <option value="90d">近 90 天</option>
            <option value="365d">近 1 年</option>
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
            style={{ height: 40, border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "0 8px", fontSize: 13, background: "#fff" }}>
            <option value="">全部状态</option>
            <option value="lead">线索</option>
            <option value="trial">试用</option>
            <option value="active">活跃</option>
            <option value="silent">沉默</option>
            <option value="churned">流失</option>
          </select>
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
            共 {pagination?.total ?? customers.length} 位客户
          </span>
        </div>
      </div>

      {/* 表格 */}
      {q.isLoading && !q.data ? (
        <SkeletonGroup lines={5} />
      ) : customers.length === 0 ? (
        <EmptyState icon="👥" title="暂无绑定客户" description="当前没有分配给您的客户" />
      ) : (
        <>
          <Table columns={columns} dataSource={customers} loading={q.isLoading} emptyText="暂无客户" />
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
