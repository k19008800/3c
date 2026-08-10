import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import {
  PageHeader,
  Panel,
  Tag,
  Table,
  SkeletonGroup,
  EmptyState,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

interface SupplierDetail {
  id: number;
  name: string;
  code: string;
  baseUrl: string | null;
  apiType: string | null;
  status: string;
  healthStatus: string | null;
  healthLastCheck: string | null;
  description: string | null;
  createdAt: string;
  modelCount: number;
}

interface SupplierModel {
  id: number;
  modelName: string;
  platformModel: string;
  inputPrice: string | null;
  outputPrice: string | null;
  currency: string | null;
  status: string | null;
  maxTokens: number | null;
  createdAt: string;
}

interface SupplierKey {
  id: number;
  name: string | null;
  keyValue: string;
  status: string;
  currentBalance: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

/** 供应商状态 → 原型 tag 类型 + 文案 */
function displayStatus(status: string): { type: "green" | "red" | "orange" | "gray"; label: string } {
  switch (status) {
    case "active": return { type: "green", label: "启用" };
    case "maintenance": return { type: "orange", label: "维护中" };
    case "offline": return { type: "red", label: "离线" };
    default: return { type: "gray", label: status ?? "未知" };
  }
}

function displayHealth(health: string | null): { color: string; label: string } {
  switch (health) {
    case "ok": return { color: "#22c55e", label: "正常" };
    case "error":
    case "failed":
    case "fail": return { color: "#e53935", label: "异常" };
    default: return { color: "#999", label: "未检测" };
  }
}

export default function AdminSupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const q = useQuery({
    queryKey: ["admin-supplier-detail", id],
    queryFn: async () => {
      const res = await api.get(`/admin/suppliers/${id}`);
      return res.data as { supplier: SupplierDetail; models: SupplierModel[]; keys: SupplierKey[] };
    },
    enabled: !!id,
  });

  const { supplier, models, keys } = q.data ?? {};

  const modelColumns: ColumnDef<SupplierModel>[] = [
    { key: "modelName", title: "模型名称", dataIndex: "modelName" },
    { key: "platformModel", title: "上游模型", dataIndex: "platformModel" },
    {
      key: "inputPrice",
      title: "成本价/1K",
      dataIndex: "inputPrice",
      render: (v) => <span className="c3-rank-amount">¥{v ?? "0"}</span>,
    },
    {
      key: "outputPrice",
      title: "输出价/1K",
      dataIndex: "outputPrice",
      render: (v) => <span className="c3-rank-amount">¥{v ?? "0"}</span>,
    },
    {
      key: "status",
      title: "状态",
      dataIndex: "status",
      render: (v) => <Tag type={(v as string) === "active" ? "green" : "gray"}>{String(v ?? "—")}</Tag>,
    },
    {
      key: "actions",
      title: "操作",
      render: () => (
        <button type="button" className="c3-btn c3-btn--text" onClick={() => toast.info("模型编辑功能开发中")}>
          编辑
        </button>
      ),
    },
  ];

  const keyColumns: ColumnDef<SupplierKey>[] = [
    { key: "name", title: "Key 名称", dataIndex: "name" },
    {
      key: "keyValue",
      title: "Key",
      render: (_, r) => <span style={{ fontFamily: "var(--font-family-mono)", fontSize: 12 }}>{`${r.keyValue.slice(0, 8)}…${r.keyValue.slice(-4)}`}</span>,
    },
    {
      key: "status",
      title: "状态",
      dataIndex: "status",
      render: (v) => <Tag type={(v as string) === "active" ? "green" : "red"}>{String(v ?? "—")}</Tag>,
    },
    {
      key: "currentBalance",
      title: "余额",
      dataIndex: "currentBalance",
      render: (v) => (v ? <span className="c3-rank-amount">¥{v}</span> : "—"),
    },
  ];

  if (q.isLoading) {
    return (
      <>
        <PageHeader title="供应商详情" help="查看和管理单个供应商的完整配置和监控数据。" />
        <Panel title="🔍 加载中..." flush>
          <SkeletonGroup lines={8} />
        </Panel>
      </>
    );
  }

  if (!supplier) {
    return (
      <>
        <PageHeader title="供应商详情" help="查看和管理单个供应商的完整配置和监控数据。" />
        <EmptyState title="供应商不存在" description="未找到该供应商，请返回列表重新选择" />
      </>
    );
  }

  const st = displayStatus(supplier.status);
  const h = displayHealth(supplier.healthStatus);

  return (
    <>
      <PageHeader title="供应商详情" help="查看和管理单个供应商的完整配置和监控数据。" />

      {/* 基本信息 — 原型 panel-body grid */}
      <Panel
        title={`🔍 ${supplier.name} 详情`}
        help="基本信息、健康状态、模型与密钥管理。"
        extra={
          <div className="c3-btn-group">
            <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => toast.info("编辑供应商功能开发中")}>
              编辑
            </button>
            <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => toast.info(`连通性测试：${supplier.name} 待实现`)}>
              连通性测试
            </button>
            <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => toast.info("余额查询功能开发中")}>
              查询余额
            </button>
          </div>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13 }}>
          <div><div style={{ fontSize: 12, color: "#888" }}>供应商名称</div><div style={{ fontWeight: 600 }}>{supplier.name}</div></div>
          <div><div style={{ fontSize: 12, color: "#888" }}>状态</div><Tag type={st.type}>{st.label}</Tag></div>
          <div><div style={{ fontSize: 12, color: "#888" }}>Base URL</div><div style={{ wordBreak: "break-all" }}>{supplier.baseUrl ?? "—"}</div></div>
          <div><div style={{ fontSize: 12, color: "#888" }}>API 格式</div><div>{supplier.apiType ?? "—"}</div></div>
          <div>
            <div style={{ fontSize: 12, color: "#888" }}>健康状态</div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: h.color }} />
              {h.label}
            </span>
          </div>
          <div><div style={{ fontSize: 12, color: "#888" }}>最近同步</div><div>{supplier.healthLastCheck ? supplier.healthLastCheck.slice(0, 10) : "—"}</div></div>
          <div><div style={{ fontSize: 12, color: "#888" }}>供应商编码</div><div>{supplier.code}</div></div>
          <div><div style={{ fontSize: 12, color: "#888" }}>创建时间</div><div>{supplier.createdAt?.slice(0, 10)}</div></div>
        </div>
      </Panel>

      {/* 统计概览 — 原型 stat-grid */}
      <div className="c3-stat-grid">
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon">🤖</span>
          <div className="c3-stat-card__label">模型总数</div>
          <div className="c3-stat-card__value">{supplier.modelCount}</div>
          <div className="c3-stat-card__sub">已同步到平台</div>
        </div>
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon">🔑</span>
          <div className="c3-stat-card__label">API Key 数</div>
          <div className="c3-stat-card__value">{keys?.length ?? 0}</div>
          <div className="c3-stat-card__sub">当前生效密钥</div>
        </div>
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon">✅</span>
          <div className="c3-stat-card__label">健康状态</div>
          <div className="c3-stat-card__value" style={{ color: h.color, fontSize: 18 }}>{h.label}</div>
          <div className="c3-stat-card__sub">{supplier.status === "active" ? "在线服务" : "非活跃"}</div>
        </div>
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon">📅</span>
          <div className="c3-stat-card__label">创建时间</div>
          <div className="c3-stat-card__value" style={{ fontSize: 18 }}>{supplier.createdAt?.slice(0, 10)}</div>
          <div className="c3-stat-card__sub">平台接入</div>
        </div>
      </div>

      {/* 模型管理 — 原型模型表格 */}
      <Panel
        title="🤖 模型管理"
        help="供应商已同步模型及成本价。"
        extra={
          <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => toast.info("模型同步功能开发中")}>
            🔄 同步模型
          </button>
        }
      >
        {models && models.length > 0 ? (
          <Table columns={modelColumns} dataSource={models} rowKey="id" />
        ) : (
          <EmptyState title="暂无模型" description="该供应商还没有同步模型" />
        )}
      </Panel>

      {/* API Key — 原型密钥管理 */}
      {keys && keys.length > 0 && (
        <Panel title="🔑 API Key" help="供应商上游 API 密钥。">
          <Table columns={keyColumns} dataSource={keys} rowKey="id" />
        </Panel>
      )}
    </>
  );
}
