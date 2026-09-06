/**
 * 管理端数据导出授权管理页 — AdminDataExportGrantPage
 *
 * 对应 PRD-数据导出授权管理 §5/§6/§7/§9。与「数据调取请求管理」
 * （AdminDataRequestPage，/admin/audit/data-request）严格区分，互不混用。
 *
 * 后端契约（backend-agent 实现，前端按此对接，字段名以实际返回为准并做容错）：
 *   GET    /api/v1/admin/data-export-grants?page=&pageSize=&status=enabled|disabled|all&search=
 *          → { list:[{userId,email,name,isEnabled,grantedBy,grantedByName,grantedAt,disabledAt,remark,...}], total, page, pageSize }
 *   POST   /api/v1/admin/data-export-grants  body {userId, enabled?, remark?} → 201（重复 409 / 用户不存在 404）
 *   PUT    /api/v1/admin/data-export-grants/:userId  body {enabled, remark?} → 200（不存在 404）
 *   DELETE /api/v1/admin/data-export-grants/:userId → 204
 *
 * 功能点（§5.3）：
 * - 列表全部已授权用户（默认 enabled=true；可切换「全部含停用」）
 * - 按用户启/停（二次确认，停用提示「已生成文件仍可下载」）
 * - 新建授权：搜索用户（email/name，复用 GET /admin/customers）→ 提交 → 重复授权提示
 * - 搜索（email/name）、状态筛选（启用/停用/全部）、分页、空态
 * - 列表列：email、姓名、授权状态、授权人、授权时间、停用时间、备注、操作
 *
 * 权限点（§9 / 验收 F1-F3）：
 * - 查看列表/本页：dataExportGrant.view（菜单由 ConsoleLayout 用 usePerm 过滤）
 * - 新建/启停/删除：dataExportGrant.edit（按钮 usePerm 控制显隐）
 *
 * [?] 帮助体系（§7 / PRODUCT-DESIGN-PRINCIPLES P1）：
 * - 页面级：PageHeader help（level="page" 弹窗，含适用角色/功能定位/核心操作/注意事项/常见问题）
 * - 按钮级：新建/启用/停用/搜索/状态筛选/分页/刷新 各配 HelpIcon 悬停 Tooltip
 *
 * @module pages/AdminDataExportGrantPage
 * @see 3cloud/docs/PRD-数据导出授权管理.md
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  PageHeader,
  Panel,
  Table,
  Pagination,
  SkeletonGroup,
  EmptyState,
  Modal,
  ConfirmPopover,
  HelpIcon,
  StatusBadge,
  SearchBar,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";
import { usePerm } from "../lib/permissions";

/* ============ 类型 ============ */

/** 授权记录 DTO（对齐 PRD §8.3 GET /admin/data-export-grants 的 data.list 每项） */
interface DataExportGrant {
  userId: number;
  email: string;
  name: string | null;
  /** 授权开关；后端命名 isEnabled 或 enabled，容错解析 */
  isEnabled: boolean;
  grantedBy: number | null;
  grantedByName: string | null;
  grantedAt: string | null;
  disabledAt: string | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 列表接口响应 data（分页包装） */
interface GrantListData {
  list: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
}

/** 可选用户（新建授权弹窗内搜索，复用 GET /admin/customers） */
interface CandidateUser {
  id: number;
  email: string;
  name: string | null;
}

/** 状态筛选值 */
type StatusFilter = "enabled" | "disabled" | "all";

/* ============ 常量 / 帮助文案（与 PRD §7 定义一致） ============ */

const PAGE_SIZE = 20;

/** 页面级帮助内容（PRD §7.1，pageKey=data-export-grants） */
const PAGE_HELP =
  "【数据导出授权管理】\n" +
  "适用角色：管理员 / 超级管理员\n" +
  "功能定位：定向授权/停用用户的自助数据导出能力，管理与展示全部被开放用户。\n" +
  "核心操作：新建授权、启用/停用、搜索筛选、查看被开放用户名单。\n" +
  "注意事项：本页为授权管理，与「数据调取请求管理」无关；停用不影响已生成文件下载；操作写入审计日志。\n" +
  "常见问题：用户为何看不到数据导出菜单？（未授权）如何批量开放？（按用户逐一启停）停用后还能下载吗？（有效期内已生成文件仍可下载）";

/** 各操作按钮级帮助文案（PRD §7.2，悬停 Tooltip） */
const HELP = {
  create: "搜索并添加一位用户，授予其自助数据导出能力",
  enable: "开启该用户的数据导出能力，用户端将显示「数据导出」菜单",
  disable: "停用该用户的数据导出能力，用户端菜单即隐藏；已生成文件在有效期内仍可下载",
  search: "按用户邮箱或姓名筛选授权记录",
  statusFilter: "按启用/停用/全部筛选授权记录",
  pagination: "浏览更多授权记录",
  refresh: "重新加载最新的授权列表",
  delete: "彻底移除该用户的授权记录（清理误配用）；移除后如需再授权请走「新建授权」",
};

/** 授权记录后端布尔字段名：isEnabled 与 enabled 兼容，解析时容错 */
function normalizeGrant(record: Record<string, unknown>): DataExportGrant {
  const enabled =
    typeof record.isEnabled === "boolean"
      ? record.isEnabled
      : typeof record.enabled === "boolean"
        ? (record.enabled as boolean)
        : true;
  return {
    userId: Number(record.userId ?? record.id ?? 0),
    email: String(record.email ?? ""),
    name: (record.name as string | null) ?? null,
    isEnabled: enabled,
    grantedBy: record.grantedBy != null ? Number(record.grantedBy) : null,
    grantedByName: (record.grantedByName as string | null) ?? null,
    grantedAt: (record.grantedAt as string | null) ?? null,
    disabledAt: (record.disabledAt as string | null) ?? null,
    remark: (record.remark as string | null) ?? null,
    createdAt: (record.createdAt as string) ?? "",
    updatedAt: (record.updatedAt as string) ?? "",
  };
}

/** 时间格式化（无值返回占位符） */
function fmtTime(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

/* ============ 页面 ============ */

export default function AdminDataExportGrantPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  // 权限点（F1/F2）：view 控制本页（菜单已过滤，此处兜底）；edit 控制操作按钮
  const canView = usePerm("dataExportGrant.view");
  const canEdit = usePerm("dataExportGrant.edit");

  /* ── 列表状态：分页 / 状态筛选 / 搜索 ── */
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>("enabled"); // 默认启用视图（§5.3）
  const [search, setSearch] = useState("");
  const [reloadToken, setReloadToken] = useState(0); // 手动刷新触发

  /* ── 新建授权弹窗状态 ── */
  const [createOpen, setCreateOpen] = useState(false);
  const [candSearch, setCandSearch] = useState("");
  const [candPage, setCandPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<CandidateUser | null>(null);
  const [createRemark, setCreateRemark] = useState("");

  /* ── 启用/停用弹窗状态（二次确认，走 Modal 提供更清晰提示） ── */
  const [toggleTarget, setToggleTarget] = useState<DataExportGrant | null>(null);

  /**
   * 授权记录列表查询。
   * status=all 表示包含停用记录；否则仅取启用/停用。
   */
  const listQ = useQuery({
    queryKey: ["admin-data-export-grants", status, search, page, reloadToken],
    enabled: canView,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        status,
      });
      if (search.trim()) params.set("search", search.trim());
      const r = await api.get<{ data: GrantListData }>(`/admin/data-export-grants?${params.toString()}`);
      const data = r.data.data;
      return {
        list: (data?.list ?? []).map(normalizeGrant),
        total: data?.total ?? 0,
        page: data?.page ?? page,
        pageSize: data?.pageSize ?? PAGE_SIZE,
      };
    },
  });

  const grants = listQ.data?.list ?? [];
  const total = listQ.data?.total ?? 0;

  /**
   * 新建授权弹窗内的用户搜索（复用 GET /admin/customers，按 email/name 检索）。
   * 仅候选列表前端过滤排除「已授权」用户（后端 409 兜底）。
   */
  const candidatesQ = useQuery({
    queryKey: ["admin-customers-search", candSearch, candPage],
    enabled: createOpen && canEdit,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(candPage), page_size: String(10) });
      if (candSearch.trim()) params.set("search", candSearch.trim());
      const r = await api.get<{ data: CandidateUser[]; pagination?: { total?: number } }>(
        `/admin/customers?${params.toString()}`,
      );
      return {
        list: r.data.data ?? [],
        total: r.data.pagination?.total ?? r.data.data?.length ?? 0,
      };
    },
  });

  /* ── 新建授权（POST）── */
  const createMut = useMutation({
    mutationFn: async (body: { userId: number; enabled?: boolean; remark?: string }) =>
      (await api.post("/admin/data-export-grants", body)).data,
    onSuccess: () => {
      toast.success("授权创建成功");
      setCreateOpen(false);
      setSelectedUser(null);
      setCreateRemark("");
      qc.invalidateQueries({ queryKey: ["admin-data-export-grants"] });
    },
    onError: (e) => {
      // 重复授权 → 409：友好提示（PRD §8.4 / 验收 D6）
      if ((e as any)?.response?.status === 409) {
        toast.error("该用户已授权，请使用更新接口（在列表中启用/修改）");
      } else if ((e as any)?.response?.status === 404) {
        toast.error("所选用户不存在，请重新搜索选择");
      } else {
        toast.error(extractError(e));
      }
    },
  });

  /* ── 启用/停用（PUT）── */
  const toggleMut = useMutation({
    mutationFn: async ({ userId, enabled, remark }: { userId: number; enabled: boolean; remark?: string }) =>
      (await api.put(`/admin/data-export-grants/${userId}`, { enabled, remark })).data,
    onSuccess: () => {
      toast.success(toggleTarget?.isEnabled ? "已停用该用户的数据导出能力" : "已启用该用户的数据导出能力");
      setToggleTarget(null);
      qc.invalidateQueries({ queryKey: ["admin-data-export-grants"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  /* ── 删除授权记录（DELETE，可选清理误配）── */
  const deleteMut = useMutation({
    mutationFn: async (userId: number) => (await api.delete(`/admin/data-export-grants/${userId}`)).data,
    onSuccess: () => {
      toast.success("授权记录已移除");
      qc.invalidateQueries({ queryKey: ["admin-data-export-grants"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  /** 触发列表手动刷新（刷新按钮） */
  const handleRefresh = useCallback(() => {
    setReloadToken((t) => t + 1);
    toast.info("列表已刷新");
  }, [toast]);

  /* ── 列表列定义（§5.3） ── */
  const columns: ColumnDef<DataExportGrant>[] = useMemo(
    () => [
      {
        key: "email",
        title: "用户邮箱",
        dataIndex: "email",
        render: (v) => <span style={{ color: "#333", fontWeight: 500 }}>{String(v)}</span>,
      },
      {
        key: "name",
        title: "姓名",
        dataIndex: "name",
        render: (v) => (v ? String(v) : <span style={{ color: "#bbb" }}>-</span>),
      },
      {
        key: "isEnabled",
        title: "授权状态",
        dataIndex: "isEnabled",
        render: (v) =>
          v ? (
            <StatusBadge status="success">启用</StatusBadge>
          ) : (
            <StatusBadge status="default">停用</StatusBadge>
          ),
      },
      {
        key: "grantedByName",
        title: "授权人",
        dataIndex: "grantedByName",
        render: (v) => (v ? String(v) : <span style={{ color: "#bbb" }}>-</span>),
      },
      {
        key: "grantedAt",
        title: "授权时间",
        dataIndex: "grantedAt",
        render: (v) => (
          <span style={{ color: "#888", fontSize: 12 }}>{fmtTime(v as string | null)}</span>
        ),
      },
      {
        key: "disabledAt",
        title: "停用时间",
        dataIndex: "disabledAt",
        render: (v) => (
          <span style={{ color: "#888", fontSize: 12 }}>{fmtTime(v as string | null)}</span>
        ),
      },
      {
        key: "remark",
        title: "备注",
        dataIndex: "remark",
        render: (v) => (v ? String(v) : <span style={{ color: "#bbb" }}>-</span>),
      },
      {
        key: "actions",
        title: "操作",
        render: (_, r) => (
          <div className="c3-btn-group" style={{ alignItems: "center" }}>
            {canEdit ? (
              r.isEnabled ? (
                <>
                  <button
                    type="button"
                    className="c3-btn c3-btn--text c3-danger"
                    onClick={() => setToggleTarget(r)}
                  >
                    停用
                  </button>
                  <HelpIcon text={HELP.disable} />
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="c3-btn c3-btn--text"
                    onClick={() => setToggleTarget(r)}
                  >
                    启用
                  </button>
                  <HelpIcon text={HELP.enable} />
                </>
              )
            ) : null}
            {canEdit && (
              <>
                <ConfirmPopover
                  title={`确定移除用户「${r.email}」的授权记录吗？`}
                  description="将彻底删除该条授权记录（非停用）；移除后如需再次授权请走「新建授权」"
                  onConfirm={() => deleteMut.mutate(r.userId)}
                >
                  <button type="button" className="c3-btn c3-btn--text c3-danger">
                    删除
                  </button>
                </ConfirmPopover>
                <HelpIcon text={HELP.delete} />
              </>
            )}
            {!canEdit && <span style={{ color: "#bbb", fontSize: 12 }}>—</span>}
          </div>
        ),
      },
    ],
    [canEdit, toggleMut, deleteMut, toggleTarget],
  );

  /** 空态：是否有激活的筛选/搜索条件 */
  const hasActiveFilter = status !== "all" || search.trim() !== "";

  return (
    <>
      <PageHeader title="数据导出授权管理" help={PAGE_HELP} />

      <Panel
        title="📦 数据导出授权"
        help={PAGE_HELP}
        extra={
          <>
            {canEdit && (
              <>
                <button
                  type="button"
                  className="c3-btn c3-btn--primary c3-btn--sm"
                  onClick={() => {
                    setCreateOpen(true);
                    setCandSearch("");
                    setCandPage(1);
                    setSelectedUser(null);
                    setCreateRemark("");
                  }}
                >
                  ＋ 新建授权
                </button>
                <HelpIcon text={HELP.create} />
              </>
            )}
          </>
        }
      >
        {/* 工具栏：状态筛选 / 搜索 / 刷新（各按钮级帮助） */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#666" }}>授权状态</span>
            <HelpIcon text={HELP.statusFilter} />
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as StatusFilter);
                setPage(1);
              }}
              style={{ padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 13, background: "#fff", color: "#333" }}
              aria-label="授权状态筛选"
            >
              <option value="enabled">仅启用</option>
              <option value="disabled">仅停用</option>
              <option value="all">全部（含停用）</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 240, flex: 1, maxWidth: 320 }}>
            <SearchBar
              placeholder="按邮箱或姓名搜索…"
              value={search}
              onChange={(v) => setSearch(v)}
              onSearch={() => setPage(1)}
            />
            <HelpIcon text={HELP.search} />
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              className="c3-btn c3-btn--default c3-btn--sm"
              onClick={handleRefresh}
            >
              ↻ 刷新
            </button>
            <HelpIcon text={HELP.refresh} />
          </div>
        </div>

        {/* 列表 / 空态 / 加载态 */}
        {listQ.isLoading ? (
          <SkeletonGroup lines={6} />
        ) : grants.length === 0 ? (
          <EmptyState
            icon="📦"
            title={hasActiveFilter ? "无匹配的授权记录" : "暂无授权用户"}
            description={
              hasActiveFilter
                ? "请调整搜索或筛选条件后重试"
                : canEdit
                  ? "点击右上角「＋ 新建授权」为指定用户开放数据导出能力"
                  : "当前没有任何数据导出授权记录"
            }
            action={
              hasActiveFilter ? (
                <button
                  type="button"
                  className="c3-btn c3-btn--default c3-btn--sm"
                  onClick={() => {
                    setSearch("");
                    setStatus("enabled");
                    setPage(1);
                  }}
                >
                  清除筛选
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table columns={columns} dataSource={grants} rowKey="userId" />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#888" }}>
                共 {total} 条授权记录
                <HelpIcon text={HELP.pagination} />
              </span>
              <Pagination
                current={page}
                total={total}
                pageSize={PAGE_SIZE}
                pageSizeOptions={[PAGE_SIZE, 50, 100]}
                onChange={(p) => {
                  setPage(p);
                }}
              />
            </div>
          </>
        )}
      </Panel>

      {/* ── 新建授权弹窗（搜索用户 + 备注 + 提交；重复授权 409 提示） ── */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="＋ 新建数据导出授权"
        width={640}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 6 }}>
              搜索用户（按邮箱或姓名）
              <HelpIcon text={HELP.create} />
            </label>
            <SearchBar
              placeholder="输入邮箱或姓名搜索用户…"
              value={candSearch}
              onChange={(v) => {
                setCandSearch(v);
                setCandPage(1);
                setSelectedUser(null);
              }}
            />
          </div>

          {/* 候选用户列表 */}
          {candidatesQ.isLoading ? (
            <SkeletonGroup lines={3} />
          ) : (candidatesQ.data?.list?.length ?? 0) === 0 ? (
            <EmptyState icon="🔍" title="未找到用户" description="请尝试其他邮箱或姓名关键词" />
          ) : (
            <>
              <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, overflow: "hidden" }}>
                {candidatesQ.data?.list.map((c) => {
                  const isSelected = selectedUser?.id === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedUser(c)}
                      style={{
                        padding: "10px 14px",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        cursor: "pointer",
                        background: isSelected ? "#eef2ff" : "#fff",
                        borderBottom: "1px solid #f5f5f5",
                      }}
                    >
                      <span style={{ width: 16, textAlign: "center", color: "#4f6ef7" }}>
                        {isSelected ? "●" : "○"}
                      </span>
                      <span style={{ flex: 1, fontWeight: isSelected ? 600 : 400, color: "#333" }}>
                        {c.email}
                      </span>
                      <span style={{ color: "#888", fontSize: 13 }}>{c.name ?? "-"}</span>
                    </div>
                  );
                })}
              </div>
              {candidatesQ.data && (candidatesQ.data.total ?? 0) > 10 && (
                <Pagination
                  current={candPage}
                  total={candidatesQ.data.total}
                  pageSize={10}
                  pageSizeOptions={[10]}
                  onChange={(p) => setCandPage(p)}
                />
              )}
            </>
          )}

          {/* 备注 */}
          <div>
            <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 6 }}>
              授权备注（可选，≤500 字）
              <HelpIcon text="填写授权原因或适用场景，便于审计追溯" />
            </label>
            <textarea
              value={createRemark}
              onChange={(e) => setCreateRemark(e.target.value.slice(0, 500))}
              placeholder="如：VIP 客户定向开放数据导出"
              style={{ width: "100%", minHeight: 64, padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 13 }}
            />
          </div>

          {/* 提交区 */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
            <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => setCreateOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="c3-btn c3-btn--primary c3-btn--sm"
              disabled={!selectedUser || createMut.isPending}
              onClick={() => {
                if (!selectedUser) return;
                createMut.mutate({
                  userId: selectedUser.id,
                  enabled: true,
                  remark: createRemark.trim() || undefined,
                });
              }}
            >
              {createMut.isPending ? "提交中…" : "确认授权"}
            </button>
            <HelpIcon text="提交后即为所选用户开通数据导出能力，授权记录写入审计日志" />
          </div>
        </div>
      </Modal>

      {/* ── 启用/停用二次确认弹窗（§5.4） ── */}
      <Modal
        open={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        title={toggleTarget?.isEnabled ? "停用数据导出授权" : "启用数据导出授权"}
        width={520}
      >
        {toggleTarget && (
          <div>
            <div style={{ marginBottom: 12, fontSize: 13, color: "#666" }}>
              <div style={{ marginBottom: 4 }}>
                用户：<span style={{ color: "#333", fontWeight: 500 }}>{toggleTarget.email}</span>
                {toggleTarget.name ? `（${toggleTarget.name}）` : ""}
              </div>
              <div style={{ marginBottom: 4 }}>当前授权状态：{toggleTarget.isEnabled ? "启用" : "停用"}</div>
            </div>
            <div
              style={{
                background: toggleTarget.isEnabled ? "#fff8e1" : "#f0fdf4",
                border: `1px solid ${toggleTarget.isEnabled ? "#ffe082" : "#86efac"}`,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 13,
                color: toggleTarget.isEnabled ? "#7a4f01" : "#166534",
                marginBottom: 16,
              }}
            >
              {toggleTarget.isEnabled
                ? "停用后该用户将无法发起新的数据导出，但已生成文件在有效期内仍可下载。"
                : "启用后该用户端将显示「数据导出」菜单，可自助申请与下载个人数据。"}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
              <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => setToggleTarget(null)}>
                取消
              </button>
              <button
                type="button"
                className={`c3-btn c3-btn--sm ${toggleTarget.isEnabled ? "c3-danger" : "c3-btn--primary"}`}
                disabled={toggleMut.isPending}
                onClick={() => {
                  const target = toggleTarget;
                  toggleMut.mutate({ userId: target.userId, enabled: !target.isEnabled });
                }}
              >
                {toggleMut.isPending
                  ? "处理中…"
                  : toggleTarget.isEnabled
                    ? "确认停用"
                    : "确认启用"}
              </button>
              <HelpIcon text={toggleTarget.isEnabled ? HELP.disable : HELP.enable} />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
