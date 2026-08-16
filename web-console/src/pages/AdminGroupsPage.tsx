/**
 * 管理端用户分组管理页 — AdminGroupsPage
 *
 * 对应后端 Batch 2 分组功能（api/src/routes/admin-groups.ts）：
 *   GET/POST    /api/v1/admin/groups               — 分组列表（含成员数）/ 创建
 *   PUT/DELETE  /api/v1/admin/groups/:id           — 更新 / 删除（默认组或有成员的分组删除返回 400）
 *   GET         /api/v1/admin/groups/:id/members   — 组成员分页列表
 *   PUT         /api/v1/admin/users/:userId/group  — 设置用户分组（一人一组，upsert）
 *
 * 职责：
 * - 分组列表：名称 / 描述 / 定价分组 / 限流(QPS·TPM) / 日额度 / 模型白名单标签 / 成员数 / 默认组徽章 / 状态
 * - 新建 / 编辑分组（Modal 表单，modelWhitelist 用逗号分隔 textarea 输入）
 * - 删除分组（ConfirmPopover 二次确认）
 * - 查看成员（分页 Modal）+ 为成员「改分组」（下拉选择 + 二次确认，走 /admin/users/:userId/group）
 *
 * 设计原则（PRODUCT-DESIGN-PRINCIPLES.md P1）：页面标题旁 [?] 页面级帮助；
 * 每个操作按钮旁 [?] 按钮级帮助（HelpIcon 悬停）。
 *
 * @module pages/AdminGroupsPage
 * @see api/src/routes/admin-groups.ts
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  PageHeader,
  Panel,
  Tag,
  Table,
  Pagination,
  SkeletonGroup,
  EmptyState,
  Modal,
  ConfirmPopover,
  HelpIcon,
  StatusBadge,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";
import type { CSSProperties } from "react";

/* ============ 类型 ============ */

/** 后端分组 DTO（对齐 admin-groups.ts 的 groupDTO + memberCount） */
interface AdminGroup {
  id: number;
  name: string;
  description: string | null;
  pricingGroup: string | null;
  rateLimitQps: number | null;
  rateLimitTpm: number | null;
  dailyQuota: number | null;
  modelWhitelist: string[];
  isDefault: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
}

/** 组成员 DTO（GET /admin/groups/:id/members） */
interface GroupMember {
  id: number;
  userId: number;
  email: string;
  name: string | null;
  joinedAt: string;
}

/* ============ 常量 / 展示工具 ============ */

const MEMBER_PAGE_SIZE = 20;

/** 模型白名单标签样式 */
const MODEL_TAG_STYLE: CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 4,
  background: "#f0f2ff",
  color: "#4f6ef7",
  fontSize: 11,
  border: "1px solid rgba(79,110,247,0.12)",
  margin: "1px 2px",
};

/** 白名单溢出 "+N" 样式 */
const MODEL_MORE_STYLE: CSSProperties = {
  padding: "2px 8px",
  borderRadius: 4,
  background: "#f5f5f5",
  color: "#888",
  fontSize: 11,
  margin: "1px 2px",
};

/**
 * 渲染模型白名单标签（最多展示 3 个，超出折叠为 +N）。
 * 空数组表示「全部模型可用」。
 */
function renderModels(models: string[]) {
  if (models.length === 0) {
    return <span style={{ color: "#bbb", fontSize: 12 }}>全部模型</span>;
  }
  const shown = models.slice(0, 3);
  return (
    <span>
      {shown.map((m) => (
        <span key={m} style={MODEL_TAG_STYLE}>{m}</span>
      ))}
      {models.length > 3 && <span style={MODEL_MORE_STYLE}>+{models.length - 3}</span>}
    </span>
  );
}

/* ============ 表单（新建 / 编辑共用） ============ */

interface GroupFormState {
  name: string;
  description: string;
  pricingGroup: string;
  rateLimitQps: string;
  rateLimitTpm: string;
  dailyQuota: string;
  modelWhitelistText: string;
  isDefault: boolean;
}

/** 空表单（新建用） */
function emptyForm(): GroupFormState {
  return {
    name: "",
    description: "",
    pricingGroup: "",
    rateLimitQps: "",
    rateLimitTpm: "",
    dailyQuota: "",
    modelWhitelistText: "",
    isDefault: false,
  };
}

/** 分组 → 表单初值（编辑用） */
function toForm(g: AdminGroup): GroupFormState {
  return {
    name: g.name,
    description: g.description ?? "",
    pricingGroup: g.pricingGroup ?? "",
    rateLimitQps: g.rateLimitQps != null ? String(g.rateLimitQps) : "",
    rateLimitTpm: g.rateLimitTpm != null ? String(g.rateLimitTpm) : "",
    dailyQuota: g.dailyQuota != null ? String(g.dailyQuota) : "",
    modelWhitelistText: g.modelWhitelist.join(", "),
    isDefault: g.isDefault,
  };
}

/** 逗号分隔文本 → 模型白名单数组（支持中英文逗号/换行，逐项 trim 去空） */
function parseWhitelistText(raw: string): string[] {
  return raw
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 表单校验：返回错误文案，null 表示通过（约束对齐后端 parseGroupInput） */
function validateForm(f: GroupFormState): string | null {
  if (!f.name.trim()) return "分组名称不能为空";
  if (f.name.trim().length > 50) return "分组名称不能超过 50 个字符";
  if (f.description.length > 255) return "分组描述不能超过 255 个字符";
  if (f.pricingGroup.trim().length > 50) return "定价分组不能超过 50 个字符";
  if (f.rateLimitQps.trim() && !/^\d+$/.test(f.rateLimitQps.trim())) return "限流 QPS 必须为正整数";
  if (f.rateLimitTpm.trim() && !/^\d+$/.test(f.rateLimitTpm.trim())) return "限流 TPM 必须为正整数";
  if (f.dailyQuota.trim()) {
    const n = Number(f.dailyQuota.trim());
    if (!Number.isFinite(n) || n <= 0) return "日消费额度必须为正数";
  }
  return null;
}

/** 表单 → 提交 body（留空字段转 null，对齐后端语义：NULL = 不限） */
function buildGroupBody(f: GroupFormState): Record<string, unknown> {
  return {
    name: f.name.trim(),
    description: f.description.trim() || null,
    pricingGroup: f.pricingGroup.trim() || null,
    rateLimitQps: f.rateLimitQps.trim() ? Number(f.rateLimitQps.trim()) : null,
    rateLimitTpm: f.rateLimitTpm.trim() ? Number(f.rateLimitTpm.trim()) : null,
    dailyQuota: f.dailyQuota.trim() ? Number(f.dailyQuota.trim()) : null,
    modelWhitelist: parseWhitelistText(f.modelWhitelistText),
    isDefault: f.isDefault,
  };
}

/** 新建 / 编辑分组弹窗（同一表单，编辑时预填） */
function GroupFormModal({
  open,
  initial,
  submitting,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: AdminGroup | null;
  submitting: boolean;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState<GroupFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  // 打开时按 initial 初始化（新建为空表单，编辑预填当前值）
  useEffect(() => {
    if (open) {
      setForm(initial ? toForm(initial) : emptyForm());
      setError(null);
    }
  }, [open, initial]);

  const set = (patch: Partial<GroupFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const submit = () => {
    const err = validateForm(form);
    if (err) {
      setError(err);
      return;
    }
    onSave(buildGroupBody(form));
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? `✏️ 编辑分组 · ${initial.name}` : "＋ 新建分组"} width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="c3-form-group" style={{ marginBottom: 0 }}>
          <label>
            分组名称 <span style={{ color: "#e53935" }}>*</span>
            <HelpIcon text="分组的唯一名称，用于成员归属展示与权限识别，最多 50 个字符" />
          </label>
          <input type="text" placeholder="如：基础模型组" value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </div>

        <div className="c3-form-group" style={{ marginBottom: 0 }}>
          <label>
            描述
            <HelpIcon text="分组用途说明，最多 255 个字符" />
          </label>
          <textarea rows={2} placeholder="该分组的用途说明（选填）" value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </div>

        <div className="c3-form-group" style={{ marginBottom: 0 }}>
          <label>
            定价分组
            <HelpIcon text="关联 abilities 的 pricing_group（如 default / vip / internal）；留空使用默认定价组，最多 50 个字符" />
          </label>
          <input type="text" placeholder="如：default / vip / internal" value={form.pricingGroup} onChange={(e) => set({ pricingGroup: e.target.value })} />
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <div className="c3-form-group" style={{ marginBottom: 0, flex: 1 }}>
            <label>
              限流 QPS
              <HelpIcon text="分组级每秒请求数上限；留空表示不限制" />
            </label>
            <input type="number" min={1} placeholder="正整数，留空不限" value={form.rateLimitQps} onChange={(e) => set({ rateLimitQps: e.target.value })} />
          </div>
          <div className="c3-form-group" style={{ marginBottom: 0, flex: 1 }}>
            <label>
              限流 TPM
              <HelpIcon text="分组级每分钟 Token 数上限；留空表示不限制" />
            </label>
            <input type="number" min={1} placeholder="正整数，留空不限" value={form.rateLimitTpm} onChange={(e) => set({ rateLimitTpm: e.target.value })} />
          </div>
        </div>

        <div className="c3-form-group" style={{ marginBottom: 0 }}>
          <label>
            日消费额度（元）
            <HelpIcon text="分组级每日消费金额上限（元）；留空表示不限制" />
          </label>
          <input type="number" min={0} step={0.01} placeholder="如 100；留空表示不限制" value={form.dailyQuota} onChange={(e) => set({ dailyQuota: e.target.value })} />
        </div>

        <div className="c3-form-group" style={{ marginBottom: 0 }}>
          <label>
            模型白名单
            <HelpIcon text="逗号分隔的平台模型名（如 deepseek-chat, gpt-4o）；留空表示全部模型可用" />
          </label>
          <textarea
            rows={3}
            placeholder="逗号分隔，如 deepseek-chat, gpt-4o；留空 = 全部模型可用"
            value={form.modelWhitelistText}
            onChange={(e) => set({ modelWhitelistText: e.target.value })}
          />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#333", cursor: "pointer" }}>
          <input type="checkbox" checked={form.isDefault} onChange={(e) => set({ isDefault: e.target.checked })} />
          设为默认组（新注册用户自动归属，同一时刻仅一个默认组）
          <HelpIcon text="默认组仅允许一个：设为默认后其他默认组会自动复位；默认组不可删除" />
        </label>

        {error && <div style={{ color: "#e53935", fontSize: 13 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 6, alignItems: "center" }}>
          <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={onClose}>取消</button>
          <HelpIcon text="关闭弹窗，放弃本次修改" />
          <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" disabled={submitting} onClick={submit}>
            {submitting ? "保存中…" : "保存"}
          </button>
          <HelpIcon text="提交分组配置：限流与日额度留空表示不限制，白名单留空表示全部模型可用" />
        </div>
      </div>
    </Modal>
  );
}

/* ============ 页面 ============ */

export default function AdminGroupsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminGroup | null>(null);
  const [membersGroup, setMembersGroup] = useState<AdminGroup | null>(null);
  const [memberPage, setMemberPage] = useState(1);
  /** 成员弹窗内「改分组」待选值：userId → groupId */
  const [pendingGroup, setPendingGroup] = useState<Record<number, number>>({});

  /* 分组列表（后端一次返回全量 + pagination 汇总） */
  const groupsQ = useQuery({
    queryKey: ["admin-groups"],
    queryFn: async () => {
      const r = await api.get<{
        data: AdminGroup[];
        pagination: { page: number; pageSize: number; total: number; totalPages: number };
      }>("/admin/groups");
      return r.data.data;
    },
  });

  /* 成员分页列表（打开成员弹窗时启用） */
  const membersQ = useQuery({
    queryKey: ["admin-group-members", membersGroup?.id, memberPage],
    enabled: membersGroup != null,
    queryFn: async () => {
      const r = await api.get<{ data: { list: GroupMember[]; total: number; page: number; pageSize: number } }>(
        `/admin/groups/${membersGroup!.id}/members?page=${memberPage}&pageSize=${MEMBER_PAGE_SIZE}`,
      );
      return r.data.data;
    },
  });

  /* 创建分组 */
  const createMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await api.post("/admin/groups", body)).data,
    onSuccess: () => {
      toast.success("分组创建成功");
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-groups"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  /* 更新分组 */
  const updateMut = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      (await api.put(`/admin/groups/${id}`, body)).data,
    onSuccess: () => {
      toast.success("分组已更新");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-groups"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  /* 删除分组（默认组 / 有成员 → 后端返回 400） */
  const deleteMut = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/groups/${id}`)).data,
    onSuccess: () => {
      toast.success("分组已删除");
      qc.invalidateQueries({ queryKey: ["admin-groups"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  /* 设置用户分组（PUT /admin/users/:userId/group） */
  const setUserGroupMut = useMutation({
    mutationFn: async ({ userId, groupId }: { userId: number; groupId: number }) =>
      (await api.put(`/admin/users/${userId}/group`, { groupId })).data,
    onSuccess: () => {
      toast.success("用户分组已更新");
      setPendingGroup({});
      qc.invalidateQueries({ queryKey: ["admin-groups"] });
      qc.invalidateQueries({ queryKey: ["admin-group-members"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const groups = groupsQ.data ?? [];

  // 切换查看的分组时，重置改分组待选值与页码
  useEffect(() => {
    setPendingGroup({});
    setMemberPage(1);
  }, [membersGroup?.id]);

  /* ── 列表列定义 ── */
  const columns: ColumnDef<AdminGroup>[] = [
    {
      key: "name",
      title: "分组名称",
      dataIndex: "name",
      render: (_, r) => (
        <span style={{ fontWeight: 600, color: "#333" }}>
          {r.name}
          {r.isDefault && (
            <span style={{ marginLeft: 6 }}>
              <Tag type="purple">默认组</Tag>
            </span>
          )}
        </span>
      ),
    },
    {
      key: "description",
      title: "描述",
      dataIndex: "description",
      render: (v) => (v ? <span style={{ color: "#888" }}>{String(v)}</span> : <span style={{ color: "#bbb" }}>-</span>),
    },
    {
      key: "pricingGroup",
      title: "定价分组",
      dataIndex: "pricingGroup",
      render: (v) => (v ? <Tag type="blue">{String(v)}</Tag> : <span style={{ color: "#bbb" }}>默认</span>),
    },
    {
      key: "rateLimitQps",
      title: "QPS 上限",
      dataIndex: "rateLimitQps",
      render: (v) => (v != null ? String(v) : <span style={{ color: "#bbb" }}>不限</span>),
    },
    {
      key: "rateLimitTpm",
      title: "TPM 上限",
      dataIndex: "rateLimitTpm",
      render: (v) => (v != null ? String(v) : <span style={{ color: "#bbb" }}>不限</span>),
    },
    {
      key: "dailyQuota",
      title: "日额度(元)",
      dataIndex: "dailyQuota",
      render: (v) => (v != null ? `¥${v}` : <span style={{ color: "#bbb" }}>不限</span>),
    },
    {
      key: "modelWhitelist",
      title: "模型白名单",
      dataIndex: "modelWhitelist",
      render: (v) => renderModels(Array.isArray(v) ? (v as string[]) : []),
    },
    { key: "memberCount", title: "成员数", dataIndex: "memberCount" },
    {
      key: "isDefault",
      title: "默认组",
      dataIndex: "isDefault",
      render: (v) =>
        v ? <Tag type="purple">默认</Tag> : <span style={{ color: "#bbb" }}>—</span>,
    },
    {
      key: "status",
      title: "状态",
      dataIndex: "status",
      render: (v) => (
        <StatusBadge status={v === "active" ? "success" : "danger"}>{v === "active" ? "启用" : "停用"}</StatusBadge>
      ),
    },
    {
      key: "actions",
      title: "操作",
      render: (_, r) => (
        <div className="c3-btn-group" style={{ alignItems: "center" }}>
          <button
            type="button"
            className="c3-btn c3-btn--text"
            onClick={() => {
              setMembersGroup(r);
              setMemberPage(1);
            }}
          >
            查看成员
          </button>
          <HelpIcon text="查看该分组下的用户成员列表，并可为成员调整所属分组" />
          <button type="button" className="c3-btn c3-btn--text" onClick={() => setEditing(r)}>
            编辑
          </button>
          <HelpIcon text="修改分组名称、描述、限流、额度与模型白名单配置" />
          <ConfirmPopover
            title={`确定删除分组「${r.name}」吗？`}
            description="默认分组或仍有成员的分组无法删除；删除后该分组配置不可恢复"
            onConfirm={() => deleteMut.mutate(r.id)}
          >
            <button type="button" className="c3-btn c3-btn--text c3-danger">删除</button>
          </ConfirmPopover>
          <HelpIcon text="删除该分组（有成员或为默认组时会被后端拒绝）" />
        </div>
      ),
    },
  ];

  /* ── 成员列定义 ── */
  const memberColumns: ColumnDef<GroupMember>[] = [
    { key: "email", title: "邮箱", dataIndex: "email", render: (v) => <span style={{ color: "#333" }}>{String(v)}</span> },
    {
      key: "name",
      title: "名称",
      dataIndex: "name",
      render: (v) => (v ? String(v) : <span style={{ color: "#bbb" }}>-</span>),
    },
    { key: "joinedAt", title: "加入时间", dataIndex: "joinedAt", render: (v) => String(v).slice(0, 10) },
    {
      key: "action",
      title: "改分组",
      render: (_, m) => (
        <div className="c3-btn-group" style={{ alignItems: "center" }}>
          <select
            value={pendingGroup[m.userId] ?? membersGroup?.id ?? ""}
            onChange={(e) => setPendingGroup((prev) => ({ ...prev, [m.userId]: Number(e.target.value) }))}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d9d9d9", fontSize: 12, background: "#fff", color: "#333" }}
          >
            {(groupsQ.data ?? []).map((g) => (
              <option key={g.id} value={g.id} disabled={g.status !== "active"}>
                {g.name}
                {g.status !== "active" ? "（停用）" : ""}
              </option>
            ))}
          </select>
          <ConfirmPopover
            title="确认将该用户移入此分组？"
            description="一人同一时刻仅属于一个分组；移入后该用户可用的模型、限流与日额度立即按新分组生效"
            onConfirm={() => {
              const gid = pendingGroup[m.userId];
              if (gid != null) setUserGroupMut.mutate({ userId: m.userId, groupId: gid });
            }}
          >
            <button
              type="button"
              className="c3-btn c3-btn--text"
              disabled={pendingGroup[m.userId] == null || pendingGroup[m.userId] === membersGroup?.id}
            >
              改分组
            </button>
          </ConfirmPopover>
          <HelpIcon text="将成员移入其他分组（仅可选启用中的分组），确认后立即生效" />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="用户分组管理"
        help="管理平台用户分组：创建/编辑分组并配置可用模型白名单、限流（QPS/TPM）与日消费额度；查看分组成员并调整用户归属。一个用户同一时刻只属于一个分组，新注册用户自动归属默认组。"
      />

      <Panel
        title="👥 用户分组"
        help="分组决定成员的可用模型与配额：模型白名单为空 = 全部模型可用；QPS/TPM/日额度为空 = 不限制；默认组仅一个，新注册用户自动归属，且不可删除。"
        extra={
          <>
            <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => setCreateOpen(true)}>
              ＋ 新增分组
            </button>
            <HelpIcon text="创建新的用户分组，配置可用模型、限流与日额度后即可将用户移入" />
          </>
        }
      >
        {groupsQ.isLoading ? (
          <SkeletonGroup lines={6} />
        ) : groups.length === 0 ? (
          <EmptyState title="暂无分组" description="点击右上角「＋ 新增分组」创建第一个用户分组" />
        ) : (
          <>
            <Table columns={columns} dataSource={groups} rowKey="id" />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
              <span style={{ fontSize: 12, color: "#888" }}>共 {groups.length} 个分组</span>
            </div>
          </>
        )}
      </Panel>

      {/* 新建 / 编辑分组弹窗 */}
      <GroupFormModal
        open={createOpen || !!editing}
        initial={editing}
        submitting={createMut.isPending || updateMut.isPending}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onSave={(body) => {
          if (editing) updateMut.mutate({ id: editing.id, body });
          else createMut.mutate(body);
        }}
      />

      {/* 查看成员弹窗（分页） */}
      <Modal
        open={!!membersGroup}
        onClose={() => setMembersGroup(null)}
        title={`👥 成员列表 · ${membersGroup?.name ?? ""}`}
        width={760}
      >
        {membersGroup &&
          (membersQ.isLoading ? (
            <SkeletonGroup lines={5} />
          ) : (membersQ.data?.list?.length ?? 0) === 0 ? (
            <EmptyState title="暂无成员" description="该分组下还没有用户，可在其他分组的成员列表中将用户移入本组" />
          ) : (
            <>
              <Table columns={memberColumns} dataSource={membersQ.data?.list ?? []} rowKey="id" />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#888" }}>共 {membersQ.data?.total ?? 0} 名成员</span>
                <Pagination
                  current={memberPage}
                  total={membersQ.data?.total ?? 0}
                  pageSize={MEMBER_PAGE_SIZE}
                  pageSizeOptions={[MEMBER_PAGE_SIZE]}
                  onChange={(p) => setMemberPage(p)}
                />
              </div>
            </>
          ))}
      </Modal>
    </>
  );
}
