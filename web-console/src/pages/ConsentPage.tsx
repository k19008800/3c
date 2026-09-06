import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  HelpIcon,
  Table,
  StatusBadge,
  SkeletonGroup,
  EmptyState,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

/**
 * 我的数据导出（SPEC-§33.3 GDPR 数据可携带权）
 * 用户可申请导出自己的全部数据，管理员审核后生成 ZIP 下载
 */

interface ExportRequest {
  id: number;
  requested_at: string;
  status: string;
  file_size_bytes: number | null;
  file_count: number | null;
  reject_reason: string | null;
  error_message: string | null;
  processed_at: string | null;
  deadline: string | null;
}

const card: React.CSSProperties = {
  background: "#fff",
  padding: 20,
  borderRadius: 10,
  boxShadow: "0 1px 4px rgba(0,0,0,.06)",
  marginBottom: 16,
};
const btnBase: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 14,
};

const dumpTypes = [
  { key: "personal", label: "个人资料" },
  { key: "api_keys", label: "API Key 列表" },
  { key: "call_logs", label: "调用日志" },
  { key: "recharge", label: "充值记录" },
  { key: "transactions", label: "交易记录" },
  { key: "invoices", label: "发票记录" },
  { key: "balance", label: "余额变动" },
  { key: "agent", label: "代理信息" },
  { key: "devices", label: "设备/登录历史" },
  { key: "notification", label: "通知偏好" },
  { key: "consent", label: "协议同意历史" },
];

function getExportStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <StatusBadge status="warning">待处理</StatusBadge>;
    case "processing":
      return <StatusBadge status="info">处理中</StatusBadge>;
    case "completed":
      return <StatusBadge status="success">已完成</StatusBadge>;
    case "failed":
    case "overdue":
      return <StatusBadge status="danger">失败</StatusBadge>;
    case "rejected":
      return <StatusBadge status="default">已拒绝</StatusBadge>;
    default:
      return <StatusBadge status="default">{status}</StatusBadge>;
  }
}

export default function ConsentPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  /**
   * 授权状态查询（PRD §4.2 / 验收 D4）：
   * 直连 /data-export URL 时，若用户未授权（granted=false 或 enabled=false），
   * 给出友好提示而非白屏/裸 403。
   */
  const grantQ = useQuery({
    queryKey: ["me-data-export-grant-status"],
    queryFn: async () => {
      const r = await api.get<{ data: { granted: boolean; isEnabled?: boolean; enabled?: boolean } }>(
        "/me/data-export/grant-status",
      );
      const d = r.data.data;
      return {
        granted: !!d?.granted,
        // 兼容 isEnabled / enabled 两种后端字段命名
        enabled: !!(d?.isEnabled ?? d?.enabled),
      };
    },
    retry: false,
  });
  /** 是否授权可用：granted && enabled（PRD §4.1）。加载中/查询失败视为未授权（安全默认） */
  const granted = !!grantQ.data?.granted && !!grantQ.data?.enabled;
  /** 授权查询是否出错（如接口未实现/网络异常）：不出错时走「已授权」乐观渲染，出错时保守隐藏操作 */
  const grantCheckFailed = grantQ.isError;
  // 加载中（首次）或查询失败：避免误操作，先显示加载/不可用提示
  const waiting = grantQ.isLoading || grantCheckFailed;

  const requestsQ = useQuery({
    queryKey: ["me-data-export"],
    queryFn: async () =>
      (await api.get<{ data: { list: ExportRequest[] } }>("/me/data-export/requests")).data.data.list,
    // 未授权时无需拉取列表，直接由下方未授权提示接管
    enabled: granted,
  });

  const requestMut = useMutation({
    mutationFn: async () => (await api.post("/me/data-export/request", {})).data,
    onSuccess: (d: any) => {
      if (d.data?.ok) {
        toast.success("导出申请已提交，管理员将在 24 小时内处理");
      } else {
        toast.info(d.data?.message || "已有待处理的导出请求");
      }
      qc.invalidateQueries({ queryKey: ["me-data-export"] });
    },
    onError: (e: any) => toast.error(extractError(e)),
  });

  const exportColumns: ColumnDef<ExportRequest>[] = [
    { key: "id", title: "请求ID", dataIndex: "id", render: (v) => `#${v}` },
    {
      key: "requested_at",
      title: "申请时间",
      dataIndex: "requested_at",
      render: (v) => (
        <span style={{ color: "var(--color-text)" }}>
          {new Date(v as string).toLocaleString()}
        </span>
      ),
    },
    {
      key: "status",
      title: "状态",
      render: (_, record) => getExportStatusBadge((record as ExportRequest).status),
    },
    {
      key: "file",
      title: "文件",
      render: (_, record) => {
        const r = record as ExportRequest;
        if (r.status === "completed" && r.file_size_bytes)
          return `${(r.file_size_bytes / 1024).toFixed(1)} KB / ${r.file_count} 文件`;
        return "—";
      },
    },
    {
      key: "reject_reason",
      title: "拒绝原因",
      dataIndex: "reject_reason",
      render: (v) => (
        <span style={{ color: "var(--color-danger-text)" }}>{(v as string) ?? "—"}</span>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      {waiting ? (
        /* 授权状态加载中/查询失败：保守显示加载态，避免误判已授权 */
        <div style={{ background: "var(--color-panel)", borderRadius: 10, padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>正在校验数据导出授权状态…</div>
        </div>
      ) : !granted ? (
        /* 直连 /data-export 但未授权（PRD §4.2 + 验收 D4）：友好提示，不白屏 */
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 28 }}>🔒</span>
            <h2 style={{ margin: 0 }}>数据导出暂未开放</h2>
          </div>
          <div style={{ fontSize: 14, color: "var(--color-text)", lineHeight: 1.7, marginBottom: 8 }}>
            您暂未被授权使用数据导出功能。如需导出个人数据，请联系平台管理员开通后再访问本页面。
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            提示：数据导出为定向开放能力，仅对被后台管理员授权的用户可见可用。
          </div>
        </div>
      ) : (
        <>
          <h2 style={{ marginBottom: 4 }}>
            我的数据导出
            <HelpIcon
              text="您可申请导出在本平台的全部数据（个人资料/API Key/调用日志/充值/交易/发票等），满足 GDPR 数据可携带权。管理员审核通过后会生成 ZIP 文件供下载，链接 7 天内有效。"
              level="page"
            />
          </h2>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 20 }}>
            申请后管理员将在 24 小时内处理；处理完成会通过邮箱发送下载链接。
          </div>

          {/* 申请导出 */}
          <div style={card}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>
              申请导出
              <HelpIcon text="申请导出您的全部数据，导出后以 ZIP 格式提供下载，链接 7 天有效。" level="button" />
            </h3>
            <div style={{ fontSize: 13, color: "var(--color-text)", marginBottom: 14 }}>
              可导出的数据：
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {dumpTypes.map((t) => (
                  <span
                    key={t.key}
                    style={{
                      background: "var(--color-bg)",
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontSize: 12,
                      color: "var(--color-text)",
                    }}
                  >
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={() => requestMut.mutate()}
              disabled={requestMut.isPending}
              style={{
                ...btnBase,
                background: "var(--color-primary)",
                color: "#fff",
                opacity: requestMut.isPending ? 0.6 : 1,
              }}
            >
              {requestMut.isPending ? "提交中..." : "申请导出"}
            </button>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 10 }}>
              导出后将以 ZIP 格式提供下载，链接 7 天有效；处理期限最长 30 天（GDPR 合规）。
            </div>
          </div>

          {/* 导出记录 */}
          <div style={card}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>
              导出记录
              <HelpIcon text="查看您提交的数据导出请求及处理状态。完成状态可下载 ZIP，失败可重新申请。" level="button" />
            </h3>
            {requestsQ.isLoading ? (
              <SkeletonGroup lines={4} />
            ) : requestsQ.data?.length === 0 ? (
              <EmptyState icon="📦" title="暂无导出记录" description="您还没有提交过数据导出请求" />
            ) : (
              <Table
                columns={exportColumns}
                dataSource={requestsQ.data ?? []}
                loading={requestsQ.isLoading}
                emptyText="暂无导出记录"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
