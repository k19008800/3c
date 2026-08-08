import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  HelpIcon,
  Table,
  StatusBadge,
  Modal,
  SkeletonGroup,
  EmptyState,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

/**
 * 销售 — 跟进提醒
 * 对齐原型: agent-customers.html + 通用 CRM 提醒模式
 * - 提醒列表（客户/类型/时间/状态）
 * - 按状态筛选
 * - 标记完成 / 忽略
 * - 新增提醒 Modal 表单
 */

const BTN_BASE: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 6, border: "none",
  cursor: "pointer", fontWeight: 600, fontSize: 13,
};

export default function SalesRemindersPage() {
  const [status, setStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ user_id: "", title: "", description: "", due_at: "", type: "follow_up" });
  const { toast } = useToast();

  const q = useQuery({
    queryKey: ["me-follow-reminders", status],
    queryFn: async () => (await api.get(`/me/follow-reminders?status=${status}`)).data.data,
  });

  const qc = useQueryClient();

  const completeMut = useMutation({
    mutationFn: async (id: number) => (await api.post(`/me/follow-reminders/${id}/complete`)).data,
    onSuccess: () => {
      toast.success("已标记完成");
      qc.invalidateQueries({ queryKey: ["me-follow-reminders"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const ignoreMut = useMutation({
    mutationFn: async (id: number) => (await api.post(`/me/follow-reminders/${id}/ignore`)).data,
    onSuccess: () => {
      toast.success("已忽略");
      qc.invalidateQueries({ queryKey: ["me-follow-reminders"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const createMut = useMutation({
    mutationFn: async (d: typeof form) =>
      (await api.post("/me/follow-reminders", {
        user_id: Number(d.user_id), title: d.title,
        description: d.description, due_at: d.due_at,
        type: d.type,
      })).data,
    onSuccess: () => {
      toast.success("提醒已创建");
      qc.invalidateQueries({ queryKey: ["me-follow-reminders"] });
      setShowForm(false);
      setForm({ user_id: "", title: "", description: "", due_at: "", type: "follow_up" });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const now = new Date().toISOString().slice(0, 10);

  const columns: ColumnDef<any>[] = [
    {
      key: "title", title: "标题",
      render: (_, record) => (
        <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {record.type === "call" ? "📞" : record.type === "meeting" ? "🤝" : "📋"}
          {record.title}
        </strong>
      ),
    },
    {
      key: "user_id", title: "客户",
      render: (_, record) => (
        <span style={{ color: "var(--color-primary)", cursor: "pointer", fontSize: 13 }}
          onClick={() => window.location.href = `/sales/customers/${record.user_id}`}>
          {record.user_email || record.username || `用户${record.user_id}`}
        </span>
      ),
    },
    {
      key: "type", title: "类型",
      render: (_, record) => {
        const typeLabel: Record<string, string> = {
          call: "电话", meeting: "面谈", follow_up: "跟进", reminder: "提醒", other: "其他",
        };
        return <span style={{ fontSize: 13 }}>{typeLabel[record.type] || record.type || "跟进"}</span>;
      },
    },
    {
      key: "due_at", title: "到期日",
      render: (_, record) => {
        const overdue = record.status === "pending" && record.due_at?.slice(0, 10) < now;
        const isToday = record.due_at?.slice(0, 10) === now;
        return (
          <span style={{
            color: overdue ? "var(--color-danger-text)" : isToday ? "var(--color-warning-text)" : "var(--color-text)",
            fontWeight: overdue || isToday ? 600 : 400,
            fontSize: 13,
          }}>
            {record.due_at?.slice(0, 10) || "-"}
          </span>
        );
      },
    },
    {
      key: "description", title: "描述",
      render: (_, record) => (
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          {record.description || "-"}
        </span>
      ),
    },
    {
      key: "status", title: "状态",
      render: (_, record) => {
        const overdue = record.status === "pending" && record.due_at?.slice(0, 10) < now;
        if (record.status === "pending") {
          return overdue
            ? <StatusBadge status="danger">⚠️ 逾期</StatusBadge>
            : <StatusBadge status="warning">待办</StatusBadge>;
        }
        if (record.status === "ignored") {
          return <StatusBadge status="default">已忽略</StatusBadge>;
        }
        return <StatusBadge status="success">已完成</StatusBadge>;
      },
    },
    {
      key: "action", title: "操作",
      render: (_, record) => {
        if (record.status !== "pending") return null;
        return (
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => completeMut.mutate(record.id)}
              disabled={completeMut.isPending}
              style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid var(--color-success-text)", background: "#fff", color: "var(--color-success-text)", fontSize: 12, cursor: "pointer" }}>
              完成
            </button>
            <button
              onClick={() => ignoreMut.mutate(record.id)}
              disabled={ignoreMut.isPending}
              style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid var(--color-border)", background: "#fff", color: "var(--color-text-secondary)", fontSize: 12, cursor: "pointer" }}>
              忽略
            </button>
          </div>
        );
      },
    },
  ];

  const reminders = q.data?.list ?? [];
  const pendingCount = reminders.filter((r: any) => r.status === "pending").length;
  const overdueCount = reminders.filter((r: any) => r.status === "pending" && r.due_at?.slice(0, 10) < now).length;

  return (
    <div>
      <h2 style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        跟进提醒
        <HelpIcon text="跟进提醒 — 管理和创建客户跟进任务。按状态筛选，查看待办跟进，标记完成或忽略。逾期提醒会高亮显示。" level="page" />
      </h2>

      {/* 统计卡片 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 8, marginBottom: 16 }}>
        <StatCard label="全部提醒" value={reminders.length} color="var(--color-text)" />
        <StatCard label="待办" value={pendingCount} color="var(--color-warning-text)" />
        <StatCard label="逾期" value={overdueCount} color="var(--color-danger-text)" />
        <StatCard label="已完成" value={reminders.filter((r: any) => r.status === "completed").length} color="var(--color-success-text)" />
      </div>

      {/* 筛选 + 操作栏 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>筛选：</span>
        <select value={status} onChange={e => setStatus(e.target.value)}
          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: 13, background: "#fff" }}>
          <option value="">全部</option>
          <option value="pending">待办</option>
          <option value="completed">已完成</option>
          <option value="ignored">已忽略</option>
        </select>
        <button onClick={() => setShowForm(!showForm)}
          style={{ ...BTN_BASE, background: "var(--color-primary)", color: "#fff" }}>
          + 新增提醒
        </button>
      </div>

      {/* 新增提醒表单 */}
      {showForm && (
        <div style={{
          background: "var(--color-panel)", border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-xl)", padding: 20, marginBottom: 16,
          maxWidth: 520,
        }}>
          <h4 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>
            📋 新增跟进提醒
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input placeholder="客户ID" value={form.user_id}
              onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 14, width: "100%", boxSizing: "border-box" }} />
            <input placeholder="标题" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 14, width: "100%", boxSizing: "border-box" }} />
            <select value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 14, width: "100%", boxSizing: "border-box", background: "#fff" }}>
              <option value="follow_up">跟进</option>
              <option value="call">电话</option>
              <option value="meeting">面谈</option>
              <option value="reminder">提醒</option>
              <option value="other">其他</option>
            </select>
            <textarea placeholder="描述（可选）" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 14, width: "100%", boxSizing: "border-box", minHeight: 60, resize: "vertical" }} />
            <input type="date" value={form.due_at}
              onChange={e => setForm(f => ({ ...f, due_at: e.target.value }))}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 14, width: "100%", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowForm(false)}
                style={{ ...BTN_BASE, background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>
                取消
              </button>
              <button onClick={() => createMut.mutate(form)} disabled={!form.title || !form.user_id || !form.due_at}
                style={{ ...BTN_BASE, background: "var(--color-primary)", color: "#fff", opacity: !form.title || !form.user_id || !form.due_at ? 0.6 : 1 }}>
                创建提醒
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 提醒表格 */}
      {q.isLoading ? <SkeletonGroup lines={5} /> : reminders.length === 0 ? (
        <EmptyState icon="🔔" title="暂无提醒" description="当前没有跟进提醒，点击「新增提醒」创建" />
      ) : (
        <Table
          columns={columns}
          dataSource={reminders}
          loading={q.isLoading}
          emptyText="暂无提醒"
        />
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{
      background: "var(--color-panel)", borderRadius: "var(--radius-lg)",
      padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,.06)",
    }}>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: color || "var(--color-text)" }}>{value}</div>
    </div>
  );
}
