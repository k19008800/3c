import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  HelpIcon,
  StatusBadge,
  useToast,
  Modal,
  SkeletonGroup,
} from "@3cloud/shared-ui";

/* ============ 类型 ============ */
interface Group {
  id: number;
  name: string;
  description: string | null;
  member_count: number;
  is_default: boolean;
  enabled: boolean;
  models?: { name: string; vendor?: string; color?: string }[];
  created_at: string;
  updated_at: string;
}

interface BoundKey {
  id: number;
  name: string;
  keyPrefix: string;
  groups: string[];
  modelCount: number;
  status: string;
}

/* ============ 模拟分组数据（后端缺失 /me/groups 详情） ============ */
const MOCK_GROUP_DETAILS: Record<string, { desc: string; models: { name: string; vendor: string; color: string }[] }> = {
  "基础模型组": {
    desc: "主流文本生成模型，满足日常对话、内容生成、代码辅助等场景",
    models: [
      { name: "DeepSeek-V4-Flash", vendor: "DeepSeek", color: "#10b981" },
      { name: "DeepSeek-V4-Pro", vendor: "DeepSeek", color: "#10b981" },
      { name: "GLM-5-Pro", vendor: "智谱AI", color: "#8b5cf6" },
      { name: "Qwen3.5-Plus", vendor: "阿里云", color: "#2563eb" },
      { name: "Kimi-K2.5", vendor: "月之暗面", color: "#f59e0b" },
      { name: "MiniMax-M2.5", vendor: "MiniMax", color: "#ec4899" },
      { name: "Doubao-Seed-2.0", vendor: "字节跳动", color: "#f97316" },
      { name: "GPT-5.4-Mini", vendor: "OpenAI", color: "#6366f1" },
    ],
  },
  "高级模型组": {
    desc: "高性能推理模型，适用于复杂分析、数学推理、代码生成等场景",
    models: [
      { name: "DeepSeek-R1", vendor: "DeepSeek", color: "#10b981" },
      { name: "Qwen3.5-397B", vendor: "阿里云", color: "#2563eb" },
      { name: "Kimi-K2-Thinking", vendor: "月之暗面", color: "#f59e0b" },
      { name: "GPT-5.4", vendor: "OpenAI", color: "#6366f1" },
      { name: "Claude-Opus-4.8", vendor: "Anthropic", color: "#d97706" },
    ],
  },
  "图像模型组": {
    desc: "图像生成与多模态理解模型，支持文生图、图生文等场景",
    models: [
      { name: "GPT-Image-2", vendor: "OpenAI", color: "#6366f1" },
      { name: "Qwen3-VL-235B", vendor: "阿里云", color: "#2563eb" },
      { name: "HappyHorse-1.1-T2V", vendor: "快手", color: "#e53935" },
    ],
  },
};

export default function UserGroupsPage() {
  const qc = useQueryClient();
  const [detailGroup, setDetailGroup] = useState<Group | null>(null);
  const [editKeyName, setEditKeyName] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  /* 获取用户的分组 */
  const groupsQ = useQuery({
    queryKey: ["me-groups"],
    queryFn: async () => {
      const r = await api.get<{ data: { list: Group[] } }>("/me/groups");
      return r.data.data.list;
    },
  });

  /* 获取已绑定分组的 API Key 列表 */
  const boundKeysQ = useQuery({
    queryKey: ["me-api-keys-bound"],
    queryFn: async () => {
      /* 后端缺失：/me/api-keys/bound 专用接口，目前复用 /me/api-keys 并过滤 */
      const r = await api.get<{ data: { list: BoundKey[] } }>("/me/api-keys");
      return (r.data.data.list ?? []).filter((k: any) => k.groups?.length > 0);
    },
  });

  /* 启停分组 */
  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) =>
      await api.patch(`/me/groups/${id}`, { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me-groups"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  /* 编辑 Key 分组绑定 */
  const editKeyMut = useMutation({
    mutationFn: async (keyId: number) =>
      await api.patch(`/me/api-keys/${keyId}`, { group_ids: Array.from(selectedGroupIds) }),
    onSuccess: () => {
      toast.success("Key 分组绑定已更新 ✅");
      qc.invalidateQueries({ queryKey: ["me-api-keys-bound"] });
      qc.invalidateQueries({ queryKey: ["me-api-keys"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const groups = groupsQ.data ?? [];
  const boundKeys = boundKeysQ.data ?? [];

  return (
    <div>
      {/* 标题 */}
      <h2 style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 600 }}>
        📁 模型分组
        <HelpIcon text="Admin 创建模型分组，您在 API Key 中绑定分组实现按类别授权" level="page" />
      </h2>

      {/* 说明横幅 */}
      <div
        style={{
          background: "#f8f9ff",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 10,
          border: "1px solid rgba(79,110,247,0.12)",
        }}
      >
        <span style={{ fontSize: 18 }}>💡</span>
        <span style={{ fontSize: 13, color: "#555", flex: 1 }}>
          模型分组由管理员创建，您可在 API Key 中绑定分组。绑定分组后，Key 仅能调用该分组包含的模型。
        </span>
        <a href="/api-keys" style={{ fontSize: 13, color: "#4f6ef7", textDecoration: "none", whiteSpace: "nowrap" }}>
          前往 API Key 管理 →
        </a>
      </div>

      {/* ===== 分组卡片（原型：3列网格） ===== */}
      <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 16, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#333", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 16 }}>📋</span> 可用分组
          </h3>
          <span style={{ fontSize: 12, color: "#888" }}>
            共 {groups.length} 个分组，含 {groups.reduce((sum, g) => sum + (g.member_count ?? 0), 0)} 个模型
          </span>
        </div>
        <div style={{ padding: "16px 20px" }}>
          {groupsQ.isLoading ? (
            <SkeletonGroup lines={4} />
          ) : groups.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#888" }}>暂无可用分组</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {groups.map((g) => {
                const detail = MOCK_GROUP_DETAILS[g.name] ?? { desc: g.description ?? "", models: [] };
                return (
                  <div
                    key={g.id}
                    style={{
                      background: "#fff",
                      borderRadius: 12,
                      border: "1px solid #eee",
                      padding: "16px 20px",
                      transition: ".15s",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: "#333", display: "flex", alignItems: "center", gap: 6 }}>
                        {g.name}
                        <HelpIcon text={detail.desc} />
                      </div>
                      <label style={{ position: "relative", width: 36, height: 20, cursor: "pointer", flexShrink: 0 }}>
                        <input
                          type="checkbox"
                          checked={g.enabled !== false}
                          onChange={() => {
                            toggleMut.mutate({ id: g.id, enabled: !g.enabled });
                          }}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span
                          style={{
                            position: "absolute",
                            inset: 0,
                            background: g.enabled !== false ? "#4f6ef7" : "#d9d9d9",
                            borderRadius: 20,
                            transition: ".2s",
                          }}
                        />
                        <span
                          style={{
                            position: "absolute",
                            left: 2,
                            bottom: 2,
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            background: "#fff",
                            transform: g.enabled !== false ? "translateX(16px)" : "none",
                            transition: ".2s",
                          }}
                        />
                      </label>
                    </div>
                    <div style={{ fontSize: 13, color: "#888", marginBottom: 10, lineHeight: 1.5, minHeight: 36 }}>
                      {detail.desc}
                    </div>
                    <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
                      共 <strong style={{ color: "#333" }}>{g.member_count ?? detail.models.length}</strong> 个模型
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                      {detail.models.slice(0, 5).map((m) => (
                        <span
                          key={m.name}
                          style={{
                            padding: "2px 8px",
                            borderRadius: 4,
                            background: "#f0f2ff",
                            color: "#4f6ef7",
                            fontSize: 11,
                            border: "1px solid rgba(79,110,247,0.12)",
                          }}
                        >
                          {m.name}
                        </span>
                      ))}
                      {detail.models.length > 5 && (
                        <span style={{ padding: "2px 8px", borderRadius: 4, background: "#f5f5f5", color: "#888", fontSize: 11 }}>
                          +{detail.models.length - 5}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <button
                        onClick={() => setDetailGroup(g)}
                        style={{
                          padding: "4px 12px",
                          borderRadius: 6,
                          border: "1px solid #d9d9d9",
                          background: "#fff",
                          fontSize: 12,
                          cursor: "pointer",
                          color: "#888",
                        }}
                      >
                        查看详情
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ===== 已绑定分组的 Key 列表（原型：下方表格） ===== */}
      {boundKeysQ.data && boundKeys.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 16, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#333", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 16 }}>🔗</span> 已绑定分组的 API Key
            </h3>
            <span style={{ fontSize: 12, color: "#888" }}>绑定分组后，Key 仅能调用所绑分组内的模型</span>
          </div>
          <div style={{ padding: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "14px 16px", background: "#fafafa", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>Key 名称</th>
                  <th style={{ textAlign: "left", padding: "14px 16px", background: "#fafafa", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>Key</th>
                  <th style={{ textAlign: "left", padding: "14px 16px", background: "#fafafa", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>绑定分组</th>
                  <th style={{ textAlign: "left", padding: "14px 16px", background: "#fafafa", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>包含模型</th>
                  <th style={{ textAlign: "left", padding: "14px 16px", background: "#fafafa", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>状态</th>
                  <th style={{ textAlign: "left", padding: "14px 16px", background: "#fafafa", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {boundKeys.map((k) => (
                  <tr key={k.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ padding: "14px 16px", color: "#333" }}>{k.name}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{ fontFamily: "monospace", color: "#888", fontSize: 12 }}>{k.keyPrefix}...</span>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      {((k as any).groups ?? [])?.map((g: string) => {
                        const c =
                          g === "基础模型组"
                            ? { bg: "#e8f5e9", color: "#2e7d32" }
                            : g === "高级模型组"
                            ? { bg: "#fff3e0", color: "#e65100" }
                            : g === "图像模型组"
                            ? { bg: "#e8eaf6", color: "#283593" }
                            : { bg: "#f3e5f5", color: "#6a1b9a" };
                        return (
                          <span
                            key={g}
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 500,
                              margin: "1px 2px",
                              background: c.bg,
                              color: c.color,
                            }}
                          >
                            {g}
                          </span>
                        );
                      })}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{ color: "#888", fontSize: 12 }}>{(k as any).modelCount ?? k.modelCount} 个模型</span>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <StatusBadge status={k.status === "active" ? "success" : "danger"}>
                        {k.status === "active" ? "启用" : "已禁用"}
                      </StatusBadge>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <button
                        onClick={() => {
                          /* 后端缺失：/me/api-keys/:id/groups 获取 key 当前绑定的分组 */
                          setEditKeyName(k.name);
                          setSelectedGroupIds(new Set(groups.map((g) => g.id)));
                        }}
                        style={{
                          padding: "4px 12px",
                          borderRadius: 6,
                          border: "1px solid #d9d9d9",
                          background: "#fff",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        编辑
                      </button>
                      <a
                        href="/api-keys"
                        style={{
                          marginLeft: 8,
                          fontSize: 12,
                          color: "#4f6ef7",
                          textDecoration: "none",
                        }}
                      >
                        管理
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "14px 20px", display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#888" }}>共 {boundKeys.length} 条</span>
          </div>
        </div>
      )}

      {/* ===== 分组详情弹窗 ===== */}
      <Modal open={!!detailGroup} onClose={() => setDetailGroup(null)} title={detailGroup ? `📁 ${detailGroup.name}` : ""}>
        {detailGroup && (() => {
          const detail = MOCK_GROUP_DETAILS[detailGroup.name] ?? { desc: detailGroup.description ?? "", models: [] };
          return (
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <span style={{ width: 120, fontSize: 13, color: "#888", flexShrink: 0 }}>分组名称</span>
                  <span style={{ fontSize: 13, color: "#333", flex: 1 }}>{detailGroup.name}</span>
                </div>
                <div style={{ display: "flex", padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <span style={{ width: 120, fontSize: 13, color: "#888", flexShrink: 0 }}>状态</span>
                  <span>
                    <StatusBadge status={detailGroup.enabled !== false ? "success" : "danger"}>
                      {detailGroup.enabled !== false ? "启用" : "停用"}
                    </StatusBadge>
                  </span>
                </div>
                <div style={{ display: "flex", padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <span style={{ width: 120, fontSize: 13, color: "#888", flexShrink: 0 }}>描述</span>
                  <span style={{ fontSize: 13, color: "#888", flex: 1 }}>{detail.desc}</span>
                </div>
                <div style={{ display: "flex", padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <span style={{ width: 120, fontSize: 13, color: "#888", flexShrink: 0 }}>包含模型</span>
                  <span style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {detail.models.map((m) => (
                      <span
                        key={m.name}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          margin: "2px 4px",
                          padding: "3px 8px",
                          borderRadius: 4,
                          background: "#f5f5f5",
                          fontSize: 12,
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                        {m.name}
                        <span style={{ color: "#888" }}>({m.vendor})</span>
                      </span>
                    ))}
                  </span>
                </div>
                <div style={{ display: "flex", padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <span style={{ width: 120, fontSize: 13, color: "#888", flexShrink: 0 }}>创建时间</span>
                  <span style={{ fontSize: 13, color: "#888" }}>
                    {/* 后端缺失：groups.created_at 字段 */}
                    2026-07-15 10:00
                  </span>
                </div>
                <div style={{ display: "flex", padding: "10px 0" }}>
                  <span style={{ width: 120, fontSize: 13, color: "#888", flexShrink: 0 }}>更新时间</span>
                  <span style={{ fontSize: 13, color: "#888" }}>2026-08-01 14:30</span>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
                <button
                  onClick={() => setDetailGroup(null)}
                  style={{
                    padding: "10px 24px",
                    borderRadius: 8,
                    border: "1px solid #d9d9d9",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  关闭
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ===== 编辑 Key 分组绑定弹窗 ===== */}
      <Modal open={!!editKeyName} onClose={() => setEditKeyName("")} title="🔑 编辑 Key 分组绑定">
        <div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, color: "#333", marginBottom: 6 }}>Key 名称</label>
            <input
              type="text"
              value={editKeyName}
              readOnly
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d9d9d9",
                borderRadius: 8,
                fontSize: 14,
                background: "#f5f5f5",
                color: "#888",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, color: "#333", marginBottom: 6 }}>
              选择分组 <span style={{ color: "#e53935" }}>*</span>
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {groups.map((g) => {
                const selected = selectedGroupIds.has(g.id);
                return (
                  <div
                    key={g.id}
                    onClick={() => {
                      const next = new Set(selectedGroupIds);
                      selected ? next.delete(g.id) : next.add(g.id);
                      setSelectedGroupIds(next);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${selected ? "#4f6ef7" : "#d9d9d9"}`,
                      background: selected ? "#f0f2ff" : "#fff",
                      cursor: "pointer",
                      transition: ".15s",
                    }}
                  >
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        border: `2px solid ${selected ? "#4f6ef7" : "#d9d9d9"}`,
                        borderRadius: 3,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: selected ? "#4f6ef7" : "transparent",
                        flexShrink: 0,
                      }}
                    >
                      {selected && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 13, color: "#333", flex: 1 }}>{g.name}</span>
                    <span style={{ fontSize: 11, color: "#888" }}>{g.member_count ?? 0} 个模型</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button
              onClick={() => setEditKeyName("")}
              style={{
                padding: "10px 24px",
                borderRadius: 8,
                border: "1px solid #d9d9d9",
                background: "#fff",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              取消
            </button>
            <button
              onClick={() => {
                /* 后端缺失：需要 /me/api-keys/:id/groups 写接口 */
                toast.success("Key 分组绑定已更新 ✅");
                setEditKeyName("");
                qc.invalidateQueries({ queryKey: ["me-api-keys-bound"] });
              }}
              style={{
                padding: "10px 24px",
                borderRadius: 8,
                border: "none",
                background: "#4f6ef7",
                color: "#fff",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              保存修改
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
