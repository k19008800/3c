import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  HelpIcon,
  Table,
  StatusBadge,
  Modal,
  SkeletonGroup,
  EmptyState,
  SearchBar,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

interface CallLog {
  id: number;
  provider: string | null;
  upstream_model: string | null;
  request_tokens: number;
  response_tokens: number;
  total_tokens: number;
  cost: string | number;
  status: string;
  error_code: string | null;
  latency_ms: number | null;
  created_at: string;
}

export default function LogsPage() {
  const [model, setModel] = useState("");
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [detail, setDetail] = useState<CallLog | null>(null);

  // 当前筛选（点击搜索后更新）
  const [filters, setFilters] = useState<{ model?: string; status?: string; provider?: string }>({});

  const { data, isLoading } = useQuery<{ list: CallLog[] }>({
    queryKey: ["me-logs", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (filters.model) params.set("model", filters.model);
      if (filters.status) params.set("status", filters.status);
      if (filters.provider) params.set("provider", filters.provider);
      return (await api.get(`/me/logs?${params.toString()}`)).data;
    },
    refetchInterval: 15000,
  });

  const search = () =>
    setFilters({
      model: model.trim() || undefined,
      status: status || undefined,
      provider: provider.trim() || undefined,
    });

  const columns: ColumnDef<CallLog>[] = [
    {
      key: "created_at",
      title: "时间",
      dataIndex: "created_at",
      render: (v) => (
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          {new Date(v as string).toLocaleString()}
        </span>
      ),
    },
    { key: "provider", title: "供应商", dataIndex: "provider", render: (v) => (v as string) ?? "-" },
    {
      key: "upstream_model",
      title: "模型",
      dataIndex: "upstream_model",
      render: (v) => (
        <span style={{ fontFamily: "monospace", fontSize: 13 }}>{(v as string) ?? "-"}</span>
      ),
    },
    { key: "total_tokens", title: "Tokens", dataIndex: "total_tokens" },
    {
      key: "cost",
      title: "费用",
      dataIndex: "cost",
      render: (v) => `¥${Number(v ?? 0).toFixed(4)}`,
    },
    {
      key: "latency_ms",
      title: "延迟",
      dataIndex: "latency_ms",
      render: (v) => (v != null ? `${v}ms` : "-"),
    },
    {
      key: "status",
      title: "状态",
      dataIndex: "status",
      render: (v, record) => (
        <StatusBadge
          status={(v as string) === "success" ? "success" : "danger"}
        >
          {v as string}
          {record.error_code ? ` (${record.error_code})` : ""}
        </StatusBadge>
      ),
    },
    {
      key: "action",
      title: "操作",
      render: (_, record) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDetail(record);
          }}
          style={{
            padding: "4px 10px",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            background: "var(--color-bg)",
            color: "var(--color-text)",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          详情
        </button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>
          调用日志
          <HelpIcon text="查看您的 API 调用日志，可按模型、状态和供应商筛选，支持查看单条调用的详细信息和 Token 用量。" level="page" />
        </h2>
        <span style={{ color: "var(--color-text-secondary)", fontSize: 14, marginLeft: 12 }}>
          共 {data?.list.length ?? 0} 条
        </span>
      </div>

      {/* 筛选 */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="模型名"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            width: 150,
            fontSize: 13,
          }}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            width: 150,
            fontSize: 13,
          }}
        >
          <option value="">全部状态</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
        </select>
        <input
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="供应商"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            width: 150,
            fontSize: 13,
          }}
        />
        <button
          onClick={search}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
            background: "var(--color-bg)",
            color: "var(--color-text)",
          }}
        >
          搜索
        </button>
        {(filters.model || filters.status || filters.provider) && (
          <button
            onClick={() => {
              setModel("");
              setStatus("");
              setProvider("");
              setFilters({});
            }}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 13,
              background: "var(--color-danger-bg)",
              color: "var(--color-danger-text)",
            }}
          >
            清除筛选
          </button>
        )}
      </div>

      {isLoading && !data ? (
        <SkeletonGroup lines={8} />
      ) : data?.list.length === 0 ? (
        <EmptyState icon="📊" title="暂无调用记录" description="当前没有调用日志" />
      ) : (
        <Table
          columns={columns}
          dataSource={data?.list ?? []}
          loading={isLoading}
          emptyText="暂无调用记录"
          onRowClick={(record) => setDetail(record as CallLog)}
        />
      )}

      {/* 详情抽屉（用 Modal 替代） */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={`调用详情 #${detail?.id}`} width={480}>
        {detail && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14 }}>
            {[
              ["时间", new Date(detail.created_at).toLocaleString()],
              ["供应商", detail.provider ?? "-"],
              ["模型", detail.upstream_model ?? "-"],
              ["请求 Tokens", String(detail.request_tokens)],
              ["响应 Tokens", String(detail.response_tokens)],
              ["总 Tokens", String(detail.total_tokens)],
              ["费用", `¥${Number(detail.cost ?? 0).toFixed(4)}`],
              ["状态", detail.status + (detail.error_code ? ` (${detail.error_code})` : "")],
              ["延迟", detail.latency_ms != null ? `${detail.latency_ms}ms` : "-"],
            ].map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  borderBottom: "1px solid var(--color-border)",
                  paddingBottom: 8,
                }}
              >
                <span style={{ width: 110, color: "var(--color-text-secondary)" }}>{k}</span>
                <span style={{ fontWeight: 500, color: "var(--color-text)" }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
