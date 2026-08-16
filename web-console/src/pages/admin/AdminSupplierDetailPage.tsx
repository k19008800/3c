import { useParams } from "react-router-dom";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import {
  PageHeader,
  Panel,
  Tag,
  Table,
  SkeletonGroup,
  EmptyState,
  HelpIcon,
  ConfirmPopover,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";
import type { ModelSyncResult } from "../../components/SyncResultModal";

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
  const qc = useQueryClient();
  const supplierId = Number(id);

  /** 批量禁用/启用的勾选集合（按模型名，对齐 batch-status API） */
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["admin-supplier-detail", id],
    queryFn: async () => {
      const res = await api.get(`/admin/suppliers/${id}`);
      return res.data as { supplier: SupplierDetail; models: SupplierModel[]; keys: SupplierKey[] };
    },
    enabled: !!id,
  });

  const { supplier, models, keys } = q.data ?? {};

  /** 模型广场同步 — POST /admin/suppliers/:id/sync-models（从上游拉取模型自动填充） */
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/admin/suppliers/${supplierId}/sync-models`);
      return res.data as { data: ModelSyncResult };
    },
    onSuccess: (res) => {
      const r = res.data;
      toast.success(`模型同步完成：新增 ${r.created}，更新 ${r.updated}，失败 ${r.failed}`);
      qc.invalidateQueries({ queryKey: ["admin-supplier-detail", id] });
      qc.invalidateQueries({ queryKey: ["admin-suppliers"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  /** 单个模型 启用/禁用 — PATCH /admin/models/:id/status */
  const statusMut = useMutation({
    mutationFn: async ({ modelId, status }: { modelId: number; status: "active" | "inactive" }) =>
      (await api.patch(`/admin/models/${modelId}/status`, { status })).data,
    onSuccess: () => {
      toast.success("模型状态已更新");
      qc.invalidateQueries({ queryKey: ["admin-supplier-detail", id] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  /** 批量 启用/禁用 — POST /admin/suppliers/:id/models/batch-status */
  const batchMut = useMutation({
    mutationFn: async ({ modelNames, status }: { modelNames: string[]; status: "active" | "inactive" }) =>
      (await api.post(`/admin/suppliers/${supplierId}/models/batch-status`, { modelNames, status })).data as {
        updated: number;
      },
    onSuccess: (res) => {
      toast.success(`已批量更新 ${res.updated} 个模型`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["admin-supplier-detail", id] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const toggleSelect = (modelName: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(modelName);
      else next.delete(modelName);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelected(checked ? new Set((models ?? []).map((m) => m.modelName)) : new Set());
  };

  const modelColumns: ColumnDef<SupplierModel>[] = [
    {
      key: "sel",
      title: "",
      width: "36px",
      render: (_, r) => (
        <input
          type="checkbox"
          checked={selected.has(r.modelName)}
          onChange={(e) => toggleSelect(r.modelName, e.target.checked)}
        />
      ),
    },
    { key: "modelName", title: "模型名称", dataIndex: "modelName" },
    { key: "platformModel", title: "上游模型", dataIndex: "platformModel" },
    {
      key: "inputPrice",
      title: "成本价/1K",
      dataIndex: "inputPrice",
      render: (v) => <span className="c3-rank-amount">¥{(v ?? "0") as string}</span>,
    },
    {
      key: "outputPrice",
      title: "输出价/1K",
      dataIndex: "outputPrice",
      render: (v) => <span className="c3-rank-amount">¥{(v ?? "0") as string}</span>,
    },
    {
      key: "status",
      title: "状态",
      dataIndex: "status",
      render: (v) => (
        <Tag type={(v as string) === "active" ? "green" : "gray"}>
          {(v as string) === "active" ? "启用" : "禁用"}
        </Tag>
      ),
    },
    {
      key: "actions",
      title: "操作",
      render: (_, r) => (
        <ConfirmPopover
          title={r.status === "active" ? "禁用该模型？" : "启用该模型？"}
          description={
            r.status === "active"
              ? "禁用后该模型将不再通过此供应商参与路由调度（模型广场同步会恢复为启用）"
              : "启用后该模型恢复参与此供应商的路由调度"
          }
          onConfirm={() =>
            statusMut.mutate({ modelId: r.id, status: r.status === "active" ? "inactive" : "active" })
          }
        >
          <button
            type="button"
            className={`c3-btn c3-btn--text c3-btn--sm${r.status === "active" ? " c3-danger" : ""}`}
          >
            {r.status === "active" ? "禁用" : "启用"}
          </button>
        </ConfirmPopover>
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
      render: (v) => (v ? <span className="c3-rank-amount">¥{v as string}</span> : "—"),
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

      {/* 模型管理 — 同步 + 禁用开关 + 批量操作 */}
      <Panel
        title="🤖 模型管理"
        help="供应商已同步模型及成本价。点击「同步模型」从上游 /v1/models 一键拉取；行内「禁用/启用」控制该模型是否参与此供应商路由（模型广场调度）；支持勾选批量操作。"
        extra={
          <div className="c3-btn-group">
            <button
              type="button"
              className="c3-btn c3-btn--primary c3-btn--sm"
              disabled={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              {syncMutation.isPending ? "同步中…" : "🔄 同步模型"}
            </button>
            <HelpIcon text="从该供应商上游 /v1/models 拉取模型并自动填充模型库：已存在的模型自动对齐并恢复启用，新建模型自动补一条 draft 定价占位（改价即可上架）。" />
          </div>
        }
      >
        {models && models.length > 0 ? (
          <>
            {/* 批量操作栏 */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={(models?.length ?? 0) > 0 && selected.size === (models?.length ?? 0)}
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                />
                全选
              </label>
              <span style={{ fontSize: 12, color: "#888" }}>已选 {selected.size} 个模型</span>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                className="c3-btn c3-btn--default c3-btn--sm"
                disabled={selected.size === 0 || batchMut.isPending}
                onClick={() => batchMut.mutate({ modelNames: [...selected], status: "active" })}
              >
                批量启用
              </button>
              <button
                type="button"
                className="c3-btn c3-btn--default c3-btn--sm"
                disabled={selected.size === 0 || batchMut.isPending}
                onClick={() => batchMut.mutate({ modelNames: [...selected], status: "inactive" })}
              >
                批量禁用
              </button>
              <HelpIcon text="勾选多个模型后批量启用/禁用（按模型名更新同一供应商的模型状态）；禁用后不再参与该供应商路由。" />
            </div>
            <Table columns={modelColumns} dataSource={models} rowKey="id" />
          </>
        ) : (
          <EmptyState title="暂无模型" description="该供应商还没有同步模型，点击「同步模型」从上游拉取" />
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
