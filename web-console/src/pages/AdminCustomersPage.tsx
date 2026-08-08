import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { HelpIcon, StatusBadge, Table, Pagination, EmptyState, SkeletonGroup, SearchBar } from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

const statusMap: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  lead: "warning",
  trial: "info",
  active: "success",
  silent: "default",
  churned: "danger",
};

const statusLabel: Record<string, string> = {
  lead: "线索",
  trial: "试用",
  active: "活跃",
  silent: "沉默",
  churned: "流失",
};

export default function AdminCustomersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const spQ = useQuery({
    queryKey: ["admin-sales-persons"],
    queryFn: async () => (await api.get("/admin/sales-persons")).data.data,
  });

  const q = useQuery({
    queryKey: ["admin-customers", status, search, salespersonId, page],
    queryFn: async () => (await api.get(`/admin/customers?status=${status}&search=${search}&salesperson_id=${salespersonId}&page=${page}&page_size=${pageSize}`)).data.data,
  });

  const columns: ColumnDef[] = [
    { key: "user_id", title: "ID", dataIndex: "user_id" },
    { key: "username", title: "用户名", dataIndex: "username" },
    { key: "email", title: "邮箱", dataIndex: "email" },
    {
      key: "status",
      title: "状态",
      dataIndex: "status",
      render: (v) => <StatusBadge status={statusMap[String(v)] ?? "default"}>{statusLabel[String(v)] ?? String(v)}</StatusBadge>,
    },
    { key: "salesperson_name", title: "销售员", dataIndex: "salesperson_name", render: (v: any) => <>{v || "-"}</> },
    {
      key: "tags",
      title: "标签数",
      render: (_, r) => Array.isArray((r as any).tags) ? (r as any).tags.length : 0,
    },
    { key: "updated_at", title: "更新时间", dataIndex: "updated_at", render: (v) => String(v).slice(0, 10) },
  ];

  const total = q.data?.pagination?.total ?? 0;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
        客户管理（管理端）
        <HelpIcon text="管理端客户管理 — 查看平台所有客户及其销售归属。支持按状态、销售员、关键词筛选，支持分页浏览。" level="page" />
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <SearchBar
          placeholder="搜索客户..."
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          style={{ padding: "6px 12px", borderRadius: "6px", border: `1px solid var(--color-border)`, fontFamily: "inherit" }}
        >
          <option value="">全部状态</option>
          <option value="lead">线索</option>
          <option value="trial">试用</option>
          <option value="active">活跃</option>
          <option value="silent">沉默</option>
          <option value="churned">流失</option>
        </select>
        <select
          value={salespersonId}
          onChange={(e) => { setSalespersonId(e.target.value); setPage(1); }}
          style={{ padding: "6px 12px", borderRadius: "6px", border: `1px solid var(--color-border)`, fontFamily: "inherit" }}
        >
          <option value="">全部销售员</option>
          {spQ.data?.list?.map((sp: any) => <option key={sp.id} value={sp.id}>{sp.username || sp.email}</option>)}
        </select>
      </div>

      {q.isLoading ? (
        <SkeletonGroup lines={6} />
      ) : (q.data?.list?.length ?? 0) === 0 ? (
        <EmptyState title="暂无客户" description="还没有客户记录" />
      ) : (
        <>
          <Table
            columns={columns}
            dataSource={q.data?.list ?? []}
            rowKey="id"
          />
          <div style={{ marginTop: 16 }}>
            <Pagination
              current={page}
              total={total}
              pageSize={pageSize}
              onChange={(p) => setPage(p)}
            />
          </div>
        </>
      )}
    </div>
  );
}
