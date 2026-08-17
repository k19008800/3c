import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import {
  PageHeader,
  Panel,
  Tag,
  Table,
  SkeletonGroup,
  EmptyState,
  TimeRangeFilter,
  Modal,
  HelpIcon,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef, TimeRangeKey } from "@3cloud/shared-ui";
import { SyncResultModal, type ModelSyncResult, type SyncAllResult } from "../../components/SyncResultModal";

/** 供应商状态 → 原型 tag 类型 + 文案 */
function displayStatus(status: string): { type: "green" | "red" | "orange" | "blue" | "gray"; label: string } {
  switch (status) {
    case "active": return { type: "green", label: "启用" };
    case "maintenance": return { type: "orange", label: "维护中" };
    case "offline": return { type: "red", label: "离线" };
    case "pending": return { type: "blue", label: "待审" };
    default: return { type: "gray", label: status ?? "未知" };
  }
}

/** 健康状态 → 圆点颜色 + 文案 */
function displayHealth(health: string | null): { color: string; label: string } {
  switch (health) {
    case "ok": return { color: "#22c55e", label: "正常" };
    case "error":
    case "failed":
    case "fail": return { color: "#e53935", label: "异常" };
    default: return { color: "#999", label: "未检测" };
  }
}

interface SupplierRow {
  id: number;
  name: string;
  code: string;
  baseUrl: string | null;
  apiType: string | null;
  status: string;
  healthStatus: string | null;
  healthLastCheck: string | null;
  createdAt: string;
  modelCount: number;
}

export default function AdminSupplierListPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [range, setRange] = useState<TimeRangeKey>("today");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", baseUrl: "", apiType: "openai" });
  const [syncResult, setSyncResult] = useState<SyncAllResult | null>(null);
  const [syncModalOpen, setSyncModalOpen] = useState(false);

  const q = useQuery({
    queryKey: ["admin-suppliers", keyword],
    queryFn: async () => {
      const params = new URLSearchParams({ page_size: "200" });
      if (keyword) params.set("search", keyword);
      const res = await api.get(`/admin/suppliers?${params.toString()}`);
      return res.data as { data: SupplierRow[] };
    },
  });

  const rows = q.data?.data ?? [];

  /** 统计卡片（由全量数据计算，对应原型 stat-grid） */
  const stats = useMemo(() => {
    const total = rows.length;
    const ok = rows.filter(r => r.healthStatus === "ok").length;
    const modelTotal = rows.reduce((s, r) => s + (r.modelCount || 0), 0);
    const attention = rows.filter(r => r.status === "offline" || ["error", "failed", "fail"].includes(r.healthStatus ?? ""));
    const top = rows.reduce((a, b) => (b.modelCount > (a?.modelCount ?? 0) ? b : a), null as SupplierRow | null);
    return {
      total,
      ok,
      healthRate: total ? Math.round((ok / total) * 100) : 0,
      modelTotal,
      topModel: top ? `${top.name} ${top.modelCount}` : "—",
      attention: attention.length,
      attentionSub: attention[0]?.name ? `${attention[0].name} 连接异常` : "暂无异常",
    };
  }, [rows]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/admin/suppliers", {
        name: form.name.trim(),
        code: form.code.trim(),
        baseUrl: form.baseUrl.trim(),
        apiType: form.apiType,
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-suppliers"] });
      setModalOpen(false);
      setForm({ name: "", code: "", baseUrl: "", apiType: "openai" });
      toast.success("新增供应商成功");
    },
    onError: (err) => toast.error(extractError(err)),
  });

  /** 单个供应商模型同步 — POST /admin/suppliers/:id/sync-models */
  const syncMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.post(`/admin/suppliers/${id}/sync-models`);
      return res.data as { data: ModelSyncResult };
    },
    onSuccess: (res, id) => {
      const r = res.data;
      toast.success(`「${rows.find(x => x.id === id)?.name ?? id}」同步完成：新增 ${r.created}，更新 ${r.updated}，失败 ${r.failed}`);
      qc.invalidateQueries({ queryKey: ["admin-suppliers"] });
      qc.invalidateQueries({ queryKey: ["admin-supplier-detail"] });
    },
    onError: (err) => toast.error(extractError(err)),
  });

  /** 全部供应商一键同步 — POST /admin/suppliers/sync-all（模型广场同步） */
  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/admin/suppliers/sync-all", null, { timeout: 120000 });
      return res.data as { data: SyncAllResult };
    },
    onSuccess: (res) => {
      const r = res.data;
      setSyncResult(r);
      setSyncModalOpen(true);
      if (r.failed === 0) toast.success(`模型广场同步完成：${r.succeeded}/${r.total} 家供应商全部成功`);
      else toast.warning(`模型广场同步完成：${r.succeeded}/${r.total} 成功，${r.failed} 家失败，详见明细`);
      qc.invalidateQueries({ queryKey: ["admin-suppliers"] });
      qc.invalidateQueries({ queryKey: ["admin-supplier-detail"] });
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const columns: ColumnDef<SupplierRow>[] = [
    { key: "name", title: "供应商名称", dataIndex: "name" },
    {
      key: "status",
      title: "状态",
      render: (_, r) => {
        const s = displayStatus(r.status);
        return <Tag type={s.type}>{s.label}</Tag>;
      },
    },
    { key: "modelCount", title: "模型数", dataIndex: "modelCount" },
    {
      key: "createdAt",
      title: "最近同步",
      dataIndex: "createdAt",
      render: (v) => (v ? String(v).slice(0, 10) : "—"),
    },
    {
      key: "health",
      title: "健康状态",
      render: (_, r) => {
        const h = displayHealth(r.healthStatus);
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: h.color }} />
            {h.label}
          </span>
        );
      },
    },
    {
      key: "actions",
      title: "操作",
      render: (_, r) => (
        <div className="c3-btn-group">
          <button
            type="button"
            className="c3-btn c3-btn--text"
            disabled={syncMutation.isPending && syncMutation.variables === r.id}
            onClick={() => syncMutation.mutate(r.id)}
          >
            {syncMutation.isPending && syncMutation.variables === r.id ? "同步中…" : "同步模型"}
          </button>
          <button type="button" className="c3-btn c3-btn--text" onClick={() => toast.info(`连通性测试：${r.name} 待实现`)}>
            测试
          </button>
          <button type="button" className="c3-btn c3-btn--text" onClick={() => toast.info("余额查询功能开发中")}>
            余额
          </button>
        </div>
      ),
    },
  ];

  const applySearch = () => {
    setKeyword(searchInput.trim());
  };

  return (
    <>
      <PageHeader title="供应商列表" help="管理 AI 模型供应商：基本信息、模型广场同步、连通性测试、成本配置、监控。" />

      {/* 筛选栏 — 原型 filter-bar */}
      <div className="c3-filter-bar">
        <TimeRangeFilter value={range} onChange={setRange} disabled disabledHint="供应商列表暂不支持按时间范围筛选" />
        <div className="c3-filter-spacer" />
        <div className="c3-filter-group">
          <span className="c3-filter-label">搜索</span>
          <input
            className="c3-filter-input c3-filter-input--w200"
            type="text"
            placeholder="请输入关键词"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }}
          />
          <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={applySearch}>
            搜索
          </button>
          <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => toast.info("导出功能开发中")}>
            导出
          </button>
        </div>
      </div>

      {/* 统计卡片 — 原型 stat-grid */}
      <div className="c3-stat-grid">
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon">🔌</span>
          <div className="c3-stat-card__label">供应商总数</div>
          <div className="c3-stat-card__value">{q.isLoading ? "—" : stats.total}</div>
          <div className="c3-stat-card__sub">管理上游 AI 厂商</div>
        </div>
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon">✅</span>
          <div className="c3-stat-card__label">正常运行</div>
          <div className="c3-stat-card__value" style={{ color: "#22c55e" }}>{q.isLoading ? "—" : stats.ok}</div>
          <div className="c3-stat-card__sub">健康率 {stats.healthRate}%</div>
        </div>
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon">🤖</span>
          <div className="c3-stat-card__label">同步模型总数</div>
          <div className="c3-stat-card__value">{q.isLoading ? "—" : stats.modelTotal}</div>
          <div className="c3-stat-card__sub">{stats.topModel}</div>
        </div>
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon">⚠️</span>
          <div className="c3-stat-card__label">需要关注</div>
          <div className="c3-stat-card__value" style={{ color: "#e53935" }}>{q.isLoading ? "—" : stats.attention}</div>
          <div className="c3-stat-card__sub">{stats.attentionSub}</div>
        </div>
      </div>

      {/* 面板 — 原型 panel：标题 + 新增按钮 + 表格 */}
      <Panel
        title="🔌 供应商列表"
        help="点击操作列「同步模型」从该供应商上游 /v1/models 一键拉取模型；「全部同步」对所有启用供应商批量执行；连通性测试 / 余额查询见操作列。"
        extra={
          <div className="c3-btn-group">
            <button
              type="button"
              className="c3-btn c3-btn--default c3-btn--sm"
              disabled={syncAllMutation.isPending}
              onClick={() => syncAllMutation.mutate()}
            >
              {syncAllMutation.isPending ? "同步中…" : "🔄 全部同步"}
            </button>
            <HelpIcon text="模型广场同步：从全部启用中供应商的上游 /v1/models 拉取模型并自动填充模型库（新建模型自动补 draft 定价占位），一次执行查看汇总与失败明细。" />
            <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => setModalOpen(true)}>
              ＋ 新增供应商
            </button>
          </div>
        }
      >
        {q.isLoading ? (
          <SkeletonGroup lines={6} />
        ) : rows.length === 0 ? (
          <EmptyState title="暂无供应商" description="还没有供应商记录，点击「新增供应商」创建" />
        ) : (
          <Table columns={columns} dataSource={rows} rowKey="id" />
        )}
      </Panel>

      {/* 全部同步结果弹窗 */}
      <SyncResultModal
        open={syncModalOpen}
        result={syncResult}
        pending={syncAllMutation.isPending}
        onClose={() => setSyncModalOpen(false)}
      />

      {/* 新增供应商弹窗 */}
      <Modal open={modalOpen} title="新增供应商" onClose={() => setModalOpen(false)}>
        <div className="c3-form-group">
          <label>供应商名称 *</label>
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如 DeepSeek" />
        </div>
        <div className="c3-form-group">
          <label>供应商编码 *</label>
          <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="如 deepseek" />
        </div>
        <div className="c3-form-group">
          <label>API 地址</label>
          <input type="text" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.example.com" />
        </div>
        <div className="c3-form-group">
          <label>API 格式</label>
          <select value={form.apiType} onChange={(e) => setForm({ ...form, apiType: e.target.value })}>
            <option value="openai">OpenAI 兼容</option>
            <option value="anthropic">Anthropic</option>
            <option value="custom">自定义</option>
          </select>
        </div>
        <div className="c3-btn-group" style={{ justifyContent: "flex-end", marginTop: 8 }}>
          <button type="button" className="c3-btn c3-btn--default" onClick={() => setModalOpen(false)}>取消</button>
          <button
            type="button"
            className="c3-btn c3-btn--primary"
            disabled={!form.name.trim() || !form.code.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "提交中..." : "创建"}
          </button>
        </div>
      </Modal>
    </>
  );
}
