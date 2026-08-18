import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  api,
  extractError,
} from "../lib/api";
import {
  PageHeader,
  Panel,
  Tag,
  Table,
  Pagination,
  SkeletonGroup,
  EmptyState,
  TimeRangeFilter,
  resolveTimeRange,
  Modal,
  HelpIcon,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef, TimeRangeKey } from "@3cloud/shared-ui";

/** 余额阈值（元）：可用余额低于 ¥10,000 视为「余额不足」（对齐原型 mock 数据分布） */
const BALANCE_LOW_THRESHOLD = 10_000;

interface CustomerRow {
  id: number;
  email: string;
  name: string;
  status: string;
  realNameVerified: boolean;
  createdAt: string;
  availableBalance: number;
  frozenBalance: number;
  totalBalance: number;
  totalConsumption: number;
  boundAgent: string | null;
}

/** 客户展示状态 → 原型 tag 类型 + 文案 */
function displayStatus(r: CustomerRow): { type: "green" | "red" | "orange"; label: string } {
  if (r.status === "disabled") return { type: "red", label: "已禁用" };
  if (r.availableBalance < BALANCE_LOW_THRESHOLD) return { type: "orange", label: "余额不足" };
  return { type: "green", label: "正常" };
}

/** 元 → ¥ 金额（原型 rank-amount 格式，最多 2 位小数） */
function fmtBalance(yuan: number): string {
  return `¥${yuan.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

/** 导出当前筛选结果为 CSV（对齐原型 pExport 列：邮箱/名称/状态/余额/累计消费/注册时间/绑定代理商） */
function exportCsv(rows: CustomerRow[]) {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = ["邮箱", "名称", "状态", "余额", "累计消费", "注册时间", "绑定代理商"];
  const lines = rows.map((r) =>
    [
      r.email,
      r.name,
      displayStatus(r).label,
      fmtBalance(r.availableBalance),
      fmtBalance(r.totalConsumption),
      String(r.createdAt).slice(0, 10),
      r.boundAgent ?? "未绑定",
    ]
      .map(esc)
      .join(","),
  );
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "customers.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminCustomersPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [range, setRange] = useState<TimeRangeKey>("today");
  const [customRange, setCustomRange] = useState<{ start?: string; end?: string }>({});
  const [fStatus, setFStatus] = useState("");          // 全部 / active / disabled
  const [fMin, setFMin] = useState("");                // 累计消费最低（¥）
  const [fMax, setFMax] = useState("");                // 累计消费最高（¥）
  const [fBound, setFBound] = useState("");            // 全部 / 1=已绑定 / 0=未绑定
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  /** 当前时间范围解析出的具体起止（本地时区），用于展示与传参 */
  const resolved = resolveTimeRange(range, customRange);

  const q = useQuery({
    queryKey: ["admin-customers", keyword, range, customRange, fStatus, fMin, fMax, fBound, page, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (keyword) params.set("search", keyword);
      // 时间范围 → 注册时间（created_at）过滤；date_to 含当天 23:59:59
      params.set("date_from", resolved.start);
      params.set("date_to", resolved.end);
      if (fStatus) params.set("status", fStatus);
      if (fMin) params.set("consumption_min", fMin);
      if (fMax) params.set("consumption_max", fMax);
      if (fBound) params.set("bound", fBound);
      const res = await api.get(`/admin/customers?${params.toString()}`);
      return res.data as { data: CustomerRow[]; pagination: { total: number; page: number; totalPages: number } };
    },
  });

  const rows = q.data?.data ?? [];
  const total = q.data?.pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const applySearch = () => {
    setKeyword(searchInput.trim());
    setPage(1);
  };

  /** 切页/改筛选时清空勾选 */
  const resetSelection = () => setSelected(new Set());

  /** 全选当前页 */
  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = rows.length > 0 && rows.every((r) => next.has(r.id));
      rows.forEach((r) => (allSelected ? next.delete(r.id) : next.add(r.id)));
      return next;
    });
  };

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedIds = [...selected];
  const selectedRows = rows.filter((r) => selected.has(r.id));

  const toggleMutation = useMutation({
    mutationFn: async (row: CustomerRow) => {
      const next = row.status === "disabled" ? "active" : "disabled";
      await api.patch(`/admin/customers/${row.id}/status`, { status: next });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-customers"] });
      toast.success("操作成功");
    },
    onError: (err) => toast.error(extractError(err)),
  });

  // 新增客户
  const [createOpen, setCreateOpen] = useState(false);
  const [cEmail, setCEmail] = useState("");
  const [cName, setCName] = useState("");
  const [cType, setCType] = useState<"enterprise" | "personal">("personal");
  const [cPassword, setCPassword] = useState("");

  const createMut = useMutation({
    mutationFn: async (body: { email: string; name: string; customer_type: string; password?: string }) =>
      (await api.post("/admin/customers", body)).data as { data?: { defaultPassword?: string } },
    onSuccess: (d) => {
      const pw = d.data?.defaultPassword;
      toast.success(`客户创建成功${pw ? `，默认密码 ${pw}` : ""}`);
      setCreateOpen(false);
      setCEmail(""); setCName(""); setCType("personal"); setCPassword("");
      qc.invalidateQueries({ queryKey: ["admin-customers"] });
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const submitCreate = () => {
    const email = cEmail.trim();
    const name = cName.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("请输入正确的邮箱地址"); return; }
    if (!name) { toast.error("客户名称不能为空"); return; }
    createMut.mutate({ email, name, customer_type: cType, password: cPassword.trim() || undefined });
  };

  // 编辑客户基本信息（列表行内「编辑」→ 弹窗，详情页头部按钮同逻辑）
  const [editTarget, setEditTarget] = useState<CustomerRow | null>(null);
  const [eEmail, setEEmail] = useState("");
  const [eName, setEName] = useState("");
  const [eStatus, setEStatus] = useState<"active" | "disabled">("active");

  const openEdit = (r: CustomerRow) => {
    setEditTarget(r);
    setEEmail(r.email);
    setEName(r.name);
    setEStatus(r.status === "disabled" ? "disabled" : "active");
  };

  const editMut = useMutation({
    mutationFn: async (body: { email: string; name: string; status: string }) =>
      (await api.put(`/admin/customers/${editTarget?.id}`, body)).data,
    onSuccess: () => {
      toast.success("客户信息已更新");
      setEditTarget(null);
      qc.invalidateQueries({ queryKey: ["admin-customers"] });
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const submitEdit = () => {
    if (!editTarget) return;
    const email = eEmail.trim();
    const name = eName.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("请输入正确的邮箱地址"); return; }
    if (!name) { toast.error("客户名称不能为空"); return; }
    editMut.mutate({ email, name, status: eStatus });
  };

  /* ── 批量操作 ── */

  // 批量冻结/解冻
  const batchStatusMut = useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: "active" | "disabled" }) =>
      (await api.post("/admin/customers/batch/status", { ids, status })).data,
    onSuccess: (_d, v) => {
      toast.success(v.status === "disabled" ? `已冻结 ${v.ids.length} 个客户` : `已解冻 ${v.ids.length} 个客户`);
      resetSelection();
      qc.invalidateQueries({ queryKey: ["admin-customers"] });
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const doBatchStatus = (status: "active" | "disabled") => {
    if (selectedIds.length === 0) { toast.error("请先勾选客户"); return; }
    batchStatusMut.mutate({ ids: selectedIds, status });
  };

  // 批量重置密码（自动生成，弹窗展示结果）
  const [resetResult, setResetResult] = useState<{ email: string; newPassword: string }[] | null>(null);
  const batchResetMut = useMutation({
    mutationFn: async (ids: number[]) =>
      (await api.post("/admin/customers/batch/reset-password", { ids })).data as { data?: { list?: { email: string; newPassword: string }[] } },
    onSuccess: (d) => {
      const list = d.data?.list ?? [];
      setResetResult(list);
      resetSelection();
      qc.invalidateQueries({ queryKey: ["admin-customers"] });
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const doBatchReset = () => {
    if (selectedIds.length === 0) { toast.error("请先勾选客户"); return; }
    batchResetMut.mutate(selectedIds);
  };

  // 批量绑定代理商
  const agentsQ = useQuery({
    queryKey: ["admin-agents-options"],
    queryFn: async () => {
      const res = await api.get("/admin/agents?page_size=200");
      return (res.data as { data: { id: number; name: string; email: string }[] }).data;
    },
    enabled: false,
  });
  const [bindOpen, setBindOpen] = useState(false);
  const [bindAgentId, setBindAgentId] = useState<number | "">("");
  const batchBindMut = useMutation({
    mutationFn: async ({ ids, agentId }: { ids: number[]; agentId: number }) =>
      (await api.post("/admin/customers/batch/bind-agent", { ids, agentId })).data,
    onSuccess: (_d, v) => {
      toast.success(`已为 ${v.ids.length} 个客户绑定代理商`);
      setBindOpen(false);
      setBindAgentId("");
      resetSelection();
      qc.invalidateQueries({ queryKey: ["admin-customers"] });
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const openBind = () => {
    if (selectedIds.length === 0) { toast.error("请先勾选客户"); return; }
    agentsQ.refetch();
    setBindAgentId("");
    setBindOpen(true);
  };

  const submitBind = () => {
    if (bindAgentId === "") { toast.error("请选择代理商"); return; }
    batchBindMut.mutate({ ids: selectedIds, agentId: bindAgentId });
  };

  // 批量强制认证
  const batchVerifyMut = useMutation({
    mutationFn: async (ids: number[]) =>
      (await api.post("/admin/customers/batch/verify", { ids })).data,
    onSuccess: (_d, v) => {
      toast.success(`已强制认证 ${v.length} 个客户`);
      resetSelection();
      qc.invalidateQueries({ queryKey: ["admin-customers"] });
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const doBatchVerify = () => {
    if (selectedIds.length === 0) { toast.error("请先勾选客户"); return; }
    batchVerifyMut.mutate(selectedIds);
  };

  const columns: ColumnDef<CustomerRow>[] = [
    {
      key: "select",
      title: "",
      width: "40px",
      render: (_, r) => (
        <input
          type="checkbox"
          checked={selected.has(r.id)}
          onChange={(e) => { e.stopPropagation(); toggleOne(r.id); }}
          onClick={(e) => e.stopPropagation()}
          aria-label={`选择 ${r.email}`}
        />
      ),
    },
    {
      key: "email",
      title: "邮箱",
      render: (_, r) => (
        <span>
          {r.email}
          {!r.realNameVerified && (
            <Tag type="gray" className="c3-tag--inline">未认证</Tag>
          )}
        </span>
      ),
    },
    { key: "name", title: "名称", dataIndex: "name" },
    {
      key: "status",
      title: "状态",
      render: (_, r) => {
        const s = displayStatus(r);
        return <Tag type={s.type}>{s.label}</Tag>;
      },
    },
    {
      key: "balance",
      title: "余额",
      render: (_, r) => (
        <span>
          <span className="c3-rank-amount">{fmtBalance(r.availableBalance)}</span>
          {r.availableBalance < BALANCE_LOW_THRESHOLD && r.status !== "disabled" && (
            <Tag type="orange" className="c3-tag--inline">余额不足</Tag>
          )}
        </span>
      ),
    },
    {
      key: "consumption",
      title: "累计消费",
      render: (_, r) => <span className="c3-rank-amount">{fmtBalance(r.totalConsumption)}</span>,
    },
    {
      key: "createdAt",
      title: "注册时间",
      dataIndex: "createdAt",
      render: (v) => String(v).slice(0, 10),
    },
    {
      key: "boundAgent",
      title: "绑定代理商",
      dataIndex: "boundAgent",
      render: (v) => (v ? <span>{String(v)}</span> : <span style={{ color: "#bbb" }}>未绑定</span>),
    },
    {
      key: "actions",
      title: "操作",
      render: (_, r) => {
        // 原型 op：详情 / 冻结(解冻) / 充值 / 绑定代理商；另保留「编辑」（客户管理刚需）
        const s = displayStatus(r);
        return (
          <div className="c3-btn-group">
            <button type="button" className="c3-btn c3-btn--text" onClick={(e) => { e.stopPropagation(); navigate(`/admin/customers/${r.id}`); }}>
              查看
            </button>
            <button type="button" className="c3-btn c3-btn--text" onClick={(e) => { e.stopPropagation(); openEdit(r); }}>
              编辑
            </button>
            {s.label === "正常" && (
              <button type="button" className="c3-btn c3-btn--text c3-danger" onClick={(e) => { e.stopPropagation(); toggleMutation.mutate(r); }}>
                冻结
              </button>
            )}
            {s.label === "余额不足" && (
              <button type="button" className="c3-btn c3-btn--text" onClick={(e) => { e.stopPropagation(); navigate(`/admin/customers/quotas?customer=${r.id}`); }}>
                充值
              </button>
            )}
            {s.label === "已禁用" && (
              <button type="button" className="c3-btn c3-btn--text" onClick={(e) => { e.stopPropagation(); toggleMutation.mutate(r); }}>
                解冻
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader title="客户列表" help="管理所有客户账户，支持时间范围/状态/累计消费/绑定代理商筛选、搜索导出、批量操作（冻结/解冻、重置密码、绑定代理商、强制认证）。" />

      {/* 筛选栏 — 原型 filter-bar：时间范围 + 状态 + 累计消费 + 绑定代理商 + 搜索 + 导出 */}
      <div className="c3-filter-bar">
        <TimeRangeFilter
          value={range}
          onChange={(k, r) => {
            setRange(k);
            if (r) setCustomRange(r);
            setPage(1);
          }}
        />
        <span className="c3-filter-range-hint" title="时间范围按客户注册时间（created_at）过滤，解析结果如下">
          注册时间：{resolved.start} ~ {resolved.end}
          <HelpIcon text="时间范围按客户「注册时间」过滤：今日=今天 00:00~23:59；昨日=昨天全天；本周=本周一 00:00~今天 23:59；本月=本月 1 日 00:00~今天 23:59；自定义=所选起止日期全天。此处展示的是当前选中的具体起止时间。" />
        </span>

        <div className="c3-filter-group">
          <span className="c3-filter-label">状态</span>
          <select
            className="c3-filter-input"
            value={fStatus}
            onChange={(e) => { setFStatus(e.target.value); setPage(1); }}
          >
            <option value="">全部</option>
            <option value="active">正常</option>
            <option value="disabled">冻结</option>
          </select>
        </div>

        <div className="c3-filter-group">
          <span className="c3-filter-label">累计消费</span>
          <input
            type="number"
            className="c3-filter-input c3-filter-input--w100"
            placeholder="最低（¥）"
            value={fMin}
            onChange={(e) => { setFMin(e.target.value); setPage(1); }}
          />
          <span style={{ color: "#999" }}>—</span>
          <input
            type="number"
            className="c3-filter-input c3-filter-input--w100"
            placeholder="最高（¥）"
            value={fMax}
            onChange={(e) => { setFMax(e.target.value); setPage(1); }}
          />
        </div>

        <div className="c3-filter-group">
          <span className="c3-filter-label">绑定代理商</span>
          <select
            className="c3-filter-input"
            value={fBound}
            onChange={(e) => { setFBound(e.target.value); setPage(1); }}
          >
            <option value="">全部</option>
            <option value="1">已绑定</option>
            <option value="0">未绑定</option>
          </select>
        </div>

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
          <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => exportCsv(rows)}>
            📥 导出
          </button>
        </div>
      </div>

      {/* 批量操作栏 — 原型 batch-bar */}
      <div className="c3-batch-bar">
        <label className="c3-batch-bar__label">
          <input type="checkbox" checked={rows.length > 0 && rows.every((r) => selected.has(r.id))} onChange={toggleSelectAll} />
          全选
        </label>
        <span style={{ color: "#999", fontSize: 12 }}>|</span>
        <span style={{ fontSize: 12, color: "#666" }}>已选 {selectedIds.length} 项</span>
        <div className="c3-btn-group">
          <button type="button" className="c3-btn c3-btn--default c3-btn--sm" disabled={batchStatusMut.isPending} onClick={() => doBatchStatus("disabled")}>
            ⛔ 批量冻结
          </button>
          <button type="button" className="c3-btn c3-btn--default c3-btn--sm" disabled={batchStatusMut.isPending} onClick={() => doBatchStatus("active")}>
            ✅ 批量解冻
          </button>
          <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={openBind}>
            🤝 批量绑定代理商
          </button>
          <button type="button" className="c3-btn c3-btn--default c3-btn--sm" disabled={batchResetMut.isPending} onClick={doBatchReset}>
            🔑 批量重置密码
          </button>
          <button type="button" className="c3-btn c3-btn--default c3-btn--sm" disabled={batchVerifyMut.isPending} onClick={doBatchVerify}>
            🪪 批量强制认证
          </button>
        </div>
      </div>

      {/* 面板 — 原型 panel：标题 + 新增按钮 + 表格 + 分页 */}
      <Panel
        title="👥 客户列表"
        help="点击客户行查看详情（消费记录、充值记录、API Key、工单、操作日志）；可勾选后批量冻结/解冻、重置密码、绑定代理商、强制认证。"
        extra={
          <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => setCreateOpen(true)}>
            ＋ 新增客户
          </button>
        }
      >
        {q.isLoading ? (
          <SkeletonGroup lines={6} />
        ) : rows.length === 0 ? (
          <EmptyState title="暂无客户" description="还没有客户记录" />
        ) : (
          <>
            <Table columns={columns} dataSource={rows} rowKey="id" onRowClick={(r) => navigate(`/admin/customers/${r.id}`)} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#888" }}>
                共 {total} 条，{page}/{totalPages} 页
              </span>
              <Pagination
                current={page}
                total={total}
                pageSize={pageSize}
                onChange={(p, s) => { setPage(p); setPageSize(s); resetSelection(); }}
              />
            </div>
          </>
        )}
      </Panel>

      {/* 新增客户弹窗 */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="＋ 新增客户" width={480}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="c3-form-group" style={{ marginBottom: 0 }}>
            <label>邮箱 <span style={{ color: "#e53935" }}>*</span></label>
            <input type="text" placeholder="customer@example.com" value={cEmail} onChange={(e) => setCEmail(e.target.value)} />
          </div>
          <div className="c3-form-group" style={{ marginBottom: 0 }}>
            <label>客户名称 <span style={{ color: "#e53935" }}>*</span></label>
            <input type="text" placeholder="如：星辰科技有限公司 / 张三" value={cName} onChange={(e) => setCName(e.target.value)} />
          </div>
          <div className="c3-form-group" style={{ marginBottom: 0 }}>
            <label>客户类型</label>
            <select value={cType} onChange={(e) => setCType(e.target.value as "enterprise" | "personal")}>
              <option value="personal">个人</option>
              <option value="enterprise">企业</option>
            </select>
          </div>
          <div className="c3-form-group" style={{ marginBottom: 0 }}>
            <label>初始密码 <span style={{ color: "#999", fontWeight: 400 }}>（选填，不填则生成随机密码）</span></label>
            <input type="password" placeholder="至少 8 位，留空自动生成" value={cPassword} onChange={(e) => setCPassword(e.target.value)} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 6 }}>
            <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => setCreateOpen(false)}>取消</button>
            <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" disabled={createMut.isPending} onClick={submitCreate}>
              {createMut.isPending ? "创建中…" : "确认创建"}
            </button>
          </div>
        </div>
      </Modal>

      {/* 编辑客户基本信息弹窗（列表「编辑」→ 打开；详情页同表单逻辑） */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`✏️ 编辑客户 — ${editTarget?.name ?? ""}`} width={440}>
        {editTarget && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="c3-form-group" style={{ marginBottom: 0 }}>
              <label>邮箱 <span style={{ color: "#e53935" }}>*</span></label>
              <input type="text" value={eEmail} onChange={(e) => setEEmail(e.target.value)} />
            </div>
            <div className="c3-form-group" style={{ marginBottom: 0 }}>
              <label>客户名称 <span style={{ color: "#e53935" }}>*</span></label>
              <input type="text" value={eName} onChange={(e) => setEName(e.target.value)} />
            </div>
            <div className="c3-form-group" style={{ marginBottom: 0 }}>
              <label>状态</label>
              <select value={eStatus} onChange={(e) => setEStatus(e.target.value as "active" | "disabled")}>
                <option value="active">正常</option>
                <option value="disabled">已禁用</option>
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 6 }}>
              <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => setEditTarget(null)}>取消</button>
              <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" disabled={editMut.isPending} onClick={submitEdit}>
                {editMut.isPending ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* 批量绑定代理商弹窗 */}
      <Modal open={bindOpen} onClose={() => setBindOpen(false)} title="🤝 批量绑定代理商" width={400}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
            为选中的 {selectedIds.length} 个客户绑定代理商（绑定后该客户归属所选代理商，消费佣金计入该代理商）。
          </p>
          <div className="c3-form-group" style={{ marginBottom: 0 }}>
            <label>代理商</label>
            <select value={bindAgentId} onChange={(e) => setBindAgentId(Number(e.target.value))}>
              <option value="">请选择</option>
              {(agentsQ.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.name}（{a.email}）</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 6 }}>
            <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => setBindOpen(false)}>取消</button>
            <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" disabled={batchBindMut.isPending} onClick={submitBind}>
              {batchBindMut.isPending ? "绑定中…" : "确认绑定"}
            </button>
          </div>
        </div>
      </Modal>

      {/* 批量重置密码结果弹窗 — 一次性明文展示 */}
      <Modal open={!!resetResult} onClose={() => setResetResult(null)} title="🔑 批量重置密码完成" width={520}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
            以下为各客户的新密码（自动生成），<b>仅本次可见</b>，关闭后无法再次查看，请及时保存并安全告知客户。
          </p>
          <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, maxHeight: 320, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "#666", textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ padding: "8px" }}>邮箱</th>
                  <th style={{ padding: "8px" }}>新密码</th>
                </tr>
              </thead>
              <tbody>
                {(resetResult ?? []).map((r) => (
                  <tr key={r.email} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "8px" }}>{r.email}</td>
                    <td style={{ padding: "8px" }}><code style={{ userSelect: "all" }}>{r.newPassword}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 6 }}>
            <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => setResetResult(null)}>完成</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
