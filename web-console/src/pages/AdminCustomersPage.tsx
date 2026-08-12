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
  Modal,
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
  createdAt: string;
  availableBalance: number;
  frozenBalance: number;
  totalBalance: number;
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

/** 导出当前筛选结果为 CSV */
function exportCsv(rows: CustomerRow[]) {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = ["邮箱", "名称", "余额", "状态", "注册时间"];
  const lines = rows.map((r) =>
    [r.email, r.name, fmtBalance(r.availableBalance), displayStatus(r).label, String(r.createdAt).slice(0, 10)]
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
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const q = useQuery({
    queryKey: ["admin-customers", keyword, range, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (keyword) params.set("search", keyword);
      const res = await api.get(`/admin/customers?${params.toString()}`);
      return res.data as { data: CustomerRow[]; pagination: { total: number; page: number; totalPages: number } };
    },
  });

  const rows = q.data?.data ?? [];
  const total = q.data?.pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

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

  const columns: ColumnDef<CustomerRow>[] = [
    { key: "email", title: "邮箱", dataIndex: "email" },
    { key: "name", title: "名称", dataIndex: "name" },
    {
      key: "balance",
      title: "余额",
      render: (_, r) => <span className="c3-rank-amount">{fmtBalance(r.availableBalance)}</span>,
    },
    {
      key: "status",
      title: "状态",
      render: (_, r) => {
        const s = displayStatus(r);
        return <Tag type={s.type}>{s.label}</Tag>;
      },
    },
    {
      key: "createdAt",
      title: "注册时间",
      dataIndex: "createdAt",
      render: (v) => String(v).slice(0, 10),
    },
    {
      key: "actions",
      title: "操作",
      render: (_, r) => {
        // 原型 op2：正常 → 禁用(danger)；余额不足 → 充值；已禁用 → 启用（互斥显示）
        const s = displayStatus(r);
        return (
          <div className="c3-btn-group">
            <button type="button" className="c3-btn c3-btn--text" onClick={() => navigate(`/admin/customers/${r.id}`)}>
              编辑
            </button>
            {s.label === "正常" && (
              <button type="button" className="c3-btn c3-btn--text c3-danger" onClick={() => toggleMutation.mutate(r)}>
                禁用
              </button>
            )}
            {s.label === "余额不足" && (
              <button type="button" className="c3-btn c3-btn--text" onClick={() => navigate(`/admin/customers/quotas?customer=${r.id}`)}>
                充值
              </button>
            )}
            {s.label === "已禁用" && (
              <button type="button" className="c3-btn c3-btn--text" onClick={() => toggleMutation.mutate(r)}>
                启用
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const applySearch = () => {
    setKeyword(searchInput.trim());
    setPage(1);
  };

  return (
    <>
      <PageHeader title="客户列表" help="管理所有客户账户，支持搜索筛选、状态管理、额度操作、实名认证审核。" />

      {/* 筛选栏 — 原型 filter-bar：时间范围 + 搜索 + 导出 */}
      <div className="c3-filter-bar">
        <TimeRangeFilter value={range} onChange={(k) => { setRange(k); setPage(1); }} />
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
            导出
          </button>
        </div>
      </div>

      {/* 面板 — 原型 panel：标题 + 新增按钮 + 表格 + 分页 */}
      <Panel
        title="👥 客户列表"
        help="点击客户行查看详情（消费记录、API Key 列表、工单记录）；余额不足客户可一键筛选。"
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
              <Pagination current={page} total={total} pageSize={pageSize} onChange={(p) => setPage(p)} />
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
    </>
  );
}
