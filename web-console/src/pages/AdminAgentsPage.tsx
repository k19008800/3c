import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  PageHeader,
  Panel,
  Tag,
  Table,
  SkeletonGroup,
  Modal,
  TimeRangeFilter,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef, TimeRangeKey } from "@3cloud/shared-ui";

/* ============ 类型 ============ */
interface AgentRow {
  id: number;
  userId: number;
  email: string;
  name: string | null;
  level: string;
  levelLabel: string;
  commissionRate: number;
  totalEarnings: number;
  availableBalance: number;
  status: string;
  inviteCode: string | null;
  createdAt: string;
  customerCount: number;
  totalCommission: number;
  monthCommission: number;
}

interface AgentSummary {
  total: number;
  totalCustomers: number;
  monthCommission: number;
  pendingWithdrawal: number;
  pendingWithdrawalCount: number;
}

interface AgentListResponse {
  data: AgentRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: AgentSummary;
}

/* ============ 展示辅助 ============ */
function fmtAmount(n: number): string {
  return `¥${n.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

/** 代理等级 → Tag 类型 */
function levelTag(level: string): "green" | "orange" | "purple" | "gray" {
  switch (level) {
    case "partner": return "purple";
    case "senior": return "orange";
    case "junior": return "green";
    default: return "gray";
  }
}

export default function AdminAgentsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [range, setRange] = useState<TimeRangeKey>("today");
  const [search, setSearch] = useState("");

  /* ---- 编辑佣金 Modal ---- */
  const [editTarget, setEditTarget] = useState<AgentRow | null>(null);
  const [editRate, setEditRate] = useState("");

  const listQ = useQuery({
    queryKey: ["admin-agents", search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", page_size: "100" });
      if (search.trim()) params.set("search", search.trim());
      return (await api.get<AgentListResponse>(`/admin/agents?${params}`)).data;
    },
  });

  /* ---- 编辑佣金（真实操作）---- */
  const rateMut = useMutation({
    mutationFn: async ({ id, commissionRate }: { id: number; commissionRate: number }) =>
      (await api.put(`/admin/agents/${id}`, { commissionRate })).data,
    onSuccess: () => {
      toast.success("佣金比例已更新");
      setEditTarget(null);
      qc.invalidateQueries({ queryKey: ["admin-agents"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  /* ---- 禁用/启用（真实操作）---- */
  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "active" | "disabled" }) =>
      (await api.put(`/admin/agents/${id}`, { status })).data,
    onSuccess: (_d, v) => {
      toast.success(v.status === "disabled" ? "已禁用该代理商" : "已启用该代理商");
      qc.invalidateQueries({ queryKey: ["admin-agents"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const agents = listQ.data?.data ?? [];
  const summary = listQ.data?.summary;
  const loading = listQ.isLoading;

  const avgCustomers = summary && summary.total > 0
    ? Math.round(summary.totalCustomers / summary.total)
    : 0;
  const enabledCount = agents.filter((a) => a.status === "active").length;
  const disabledCount = agents.filter((a) => a.status === "disabled").length;

  const columns: ColumnDef<AgentRow>[] = [
    {
      key: "name",
      title: "名称",
      dataIndex: "name",
      render: (v, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.name ?? r.email}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{r.inviteCode ? `邀请码 ${r.inviteCode}` : ""}</div>
        </div>
      ),
    },
    { key: "email", title: "邮箱", dataIndex: "email" },
    { key: "customerCount", title: "客户数", dataIndex: "customerCount" },
    {
      key: "totalCommission",
      title: "累计佣金",
      dataIndex: "totalCommission",
      render: (v) => <span className="c3-rank-amount">{fmtAmount(Number(v))}</span>,
    },
    {
      key: "monthCommission",
      title: "本月佣金",
      dataIndex: "monthCommission",
      render: (v) => <span className="c3-rank-amount">{fmtAmount(Number(v))}</span>,
    },
    {
      key: "commissionRate",
      title: "佣金比例",
      dataIndex: "commissionRate",
      render: (v, r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Tag type={levelTag(r.level)}>{r.levelLabel}</Tag>
          <span className="c3-rank-amount">{Number(v)}%</span>
        </span>
      ),
    },
    {
      key: "actions",
      title: "操作",
      render: (_, r) => (
        <div className="c3-btn-group">
          <button
            type="button"
            className="c3-btn c3-btn--text"
            onClick={() => { setEditTarget(r); setEditRate(String(r.commissionRate)); }}
          >
            编辑佣金
          </button>
          <button
            type="button"
            className={`c3-btn c3-btn--text ${r.status === "active" ? "c3-danger" : ""}`}
            disabled={statusMut.isPending}
            onClick={() => statusMut.mutate({ id: r.id, status: r.status === "active" ? "disabled" : "active" })}
          >
            {r.status === "active" ? "禁用" : "启用"}
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="代理商列表" help="管理代理商：基本信息、客户绑定、佣金配置、提现记录。" />

      {/* 筛选栏 — 原型 filter-bar */}
      <div className="c3-filter-bar">
        <TimeRangeFilter value={range} onChange={setRange} />
        <div className="c3-filter-spacer" />
        <div className="c3-filter-group">
          <span className="c3-filter-label">搜索</span>
          <input
            className="c3-filter-input c3-filter-input--w200"
            type="text"
            placeholder="搜索名称或邮箱"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => qc.invalidateQueries({ queryKey: ["admin-agents"] })}>
            搜索
          </button>
          <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => toast.info("导出功能开发中")}>
            导出
          </button>
        </div>
      </div>

      {/* 统计概览 — 原型 stat-grid */}
      <div className="c3-stat-grid">
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon">🤝</span>
          <div className="c3-stat-card__label">代理商总数</div>
          <div className="c3-stat-card__value">{loading ? "—" : summary?.total ?? 0}</div>
          <div className="c3-stat-card__sub">启用 {enabledCount} · 禁用 {disabledCount}</div>
        </div>
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon">👥</span>
          <div className="c3-stat-card__label">名下客户合计</div>
          <div className="c3-stat-card__value">{loading ? "—" : summary?.totalCustomers ?? 0}</div>
          <div className="c3-stat-card__sub">平均 {avgCustomers} 户/代理商</div>
        </div>
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon">💰</span>
          <div className="c3-stat-card__label">本月佣金总额</div>
          <div className="c3-stat-card__value">{loading ? "—" : fmtAmount(summary?.monthCommission ?? 0)}</div>
          <div className="c3-stat-card__trend c3-stat-card__trend--up">↑ 本月累计</div>
        </div>
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon">💳</span>
          <div className="c3-stat-card__label">待提现金额</div>
          <div className="c3-stat-card__value">{loading ? "—" : fmtAmount(summary?.pendingWithdrawal ?? 0)}</div>
          <div className="c3-stat-card__sub">{summary?.pendingWithdrawalCount ?? 0} 笔待处理</div>
        </div>
      </div>

      {/* 列表 — 原型 panel + table */}
      <Panel
        title="🤝 代理商列表"
        help="点击「编辑佣金」调整比例，禁用后代理商无法继续推广。"
        extra={
          <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => toast.info("新增代理商功能开发中")}>
            ＋ 新增代理商
          </button>
        }
      >
        {loading ? (
          <SkeletonGroup lines={6} />
        ) : (
          <Table
            columns={columns}
            dataSource={agents}
            rowKey="id"
            emptyText="暂无代理商"
          />
        )}
      </Panel>

      {/* 编辑佣金 Modal（真实操作） */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`编辑佣金比例 — ${editTarget?.name ?? editTarget?.email ?? ""}`}>
        <div className="c3-form-group">
          <label>佣金比例（%）</label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={editRate}
            onChange={(e) => setEditRate(e.target.value)}
            placeholder="0-100"
          />
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 6 }}>
            当前等级：{editTarget?.levelLabel ?? ""} · 保存后立即生效
          </div>
        </div>
        <div className="c3-btn-group" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="c3-btn c3-btn--default" onClick={() => setEditTarget(null)}>
            取消
          </button>
          <button
            type="button"
            className="c3-btn c3-btn--primary"
            disabled={rateMut.isPending || editTarget === null}
            onClick={() => {
              const rate = Number(editRate);
              if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
                toast.error("请输入 0-100 的佣金比例");
                return;
              }
              rateMut.mutate({ id: editTarget!.id, commissionRate: rate });
            }}
          >
            {rateMut.isPending ? "保存中..." : "保存"}
          </button>
        </div>
      </Modal>
    </>
  );
}
