import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  HelpIcon,
  Table,
  StatusBadge,
  useToast,
  SkeletonGroup,
  Modal,
  CopyButton,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

/* ============ 类型 ============ */
interface ApiKey {
  id: number;
  name: string;
  keyPrefix: string;
  fullKey?: string; // only on create
  status: string;
  mode?: "vendor" | "group" | "unlimited";
  expiresAt: string | null;
  lastUsedAt: string | null;
  todayCalls?: number;
  createdAt: string;
}

/* ============ 常量 ============ */
const PERM_MODE_LABEL: Record<string, string> = {
  vendor: "绑定供应商",
  group: "绑定分组",
  unlimited: "无限制",
};

const MOCK_GROUPS = ["基础模型组（8 个模型）", "高级模型组（5 个模型）", "图像模型组（3 个模型）"];

const btnBase: React.CSSProperties = {
  padding: "4px 12px",
  borderRadius: 6,
  border: "1px solid #d9d9d9",
  background: "#fff",
  fontSize: 12,
  cursor: "pointer",
};

export default function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("新 Key");
  const [newMode, setNewMode] = useState<"vendor" | "group" | "unlimited">("group");
  const [newGroup, setNewGroup] = useState(MOCK_GROUPS[0]);
  const [newExpiry, setNewExpiry] = useState("");
  const [newIpWhitelist, setNewIpWhitelist] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ list: ApiKey[] }>({
    queryKey: ["api-keys"],
    queryFn: async () => (await api.get("/me/api-keys")).data,
  });

  // 对外接入地址（后台 系统设置 → API 服务 配置的 api_domain 派生）
  const { data: apiConfig } = useQuery<{
    openaiBaseUrl: string;
    anthropicBaseUrl: string;
    openaiChatUrl: string;
    anthropicMessagesUrl: string;
  }>({
    queryKey: ["api-config"],
    queryFn: async () => (await api.get("/public/api-config")).data,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: any = { name: newName, mode: newMode };
      if (newMode === "group") body.group = newGroup;
      if (newExpiry) body.expires_at = newExpiry;
      if (newIpWhitelist.trim()) body.ip_whitelist = newIpWhitelist.split("\n").filter(Boolean);
      return (await api.post("/me/api-keys", body)).data;
    },
    onSuccess: (d) => {
      // 完整 Key 仅此一次返回；存入 localStorage 供 Playground 预填（本地试用便利）
      if (typeof d?.key === "string") {
        try { localStorage.setItem("3cloud_last_raw_key", d.key); } catch { /* ignore */ }
      }
      setCreatedSecret(d.key);
      toast.success("API Key 创建成功");
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => await api.delete(`/me/api-keys/${id}`),
    onSuccess: () => {
      toast.success("API Key 已删除");
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) =>
      await api.patch(`/me/api-keys/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const handleCopy = (key: string) => {
    navigator.clipboard.writeText(key).then(() => toast.success("已复制到剪贴板"));
  };

  const keys = data?.list ?? [];
  const filtered = searchQuery
    ? keys.filter((k) => k.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : keys;

  const columns: ColumnDef<ApiKey>[] = [
    {
      key: "name",
      title: "名称",
      dataIndex: "name",
    },
    {
      key: "key",
      title: "Key",
      render: (_, record) => (
        <span style={{ fontFamily: "SF Mono, Fira Code, monospace", color: "#888", fontSize: 12 }}>
          {record.keyPrefix}...
        </span>
      ),
    },
    {
      key: "mode",
      title: "权限模式",
      dataIndex: "mode",
      render: (v) => {
        const mode = (v as string) ?? "unlimited";
        return <span style={{ fontSize: 12, color: "#666" }}>{PERM_MODE_LABEL[mode] ?? "无限制"}</span>;
      },
    },
    {
      key: "lastUsedAt",
      title: "最后调用",
      dataIndex: "lastUsedAt",
      render: (v) => (
        <span style={{ fontSize: 12, color: "#888" }}>
          {v ? new Date(v as string).toLocaleString() : "—"}
        </span>
      ),
    },
    {
      key: "todayCalls",
      title: "今日调用",
      dataIndex: "todayCalls",
      render: (v) => <span style={{ fontSize: 13 }}>{(v as number)?.toLocaleString() ?? "—"}</span>,
    },
    {
      key: "status",
      title: "状态",
      dataIndex: "status",
      render: (v) => {
        const s = v as string;
        if (s === "active") return <StatusBadge status="success">启用</StatusBadge>;
        if (s === "disabled") return <StatusBadge status="danger">已禁用</StatusBadge>;
        if (s === "expiring") return <StatusBadge status="warning">即将过期</StatusBadge>;
        return <StatusBadge status="default">{s}</StatusBadge>;
      },
    },
    {
      key: "action",
      title: "操作",
      render: (_, record) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button
            style={btnBase}
            onClick={(e) => {
              e.stopPropagation();
              handleCopy(`sk-${record.keyPrefix}...`);
            }}
          >
            复制
          </button>
          <button
            style={btnBase}
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("确定要删除该 API Key 吗？")) {
                deleteMutation.mutate(record.id);
              }
            }}
          >
            删除
          </button>
          {record.status === "disabled" ? (
            <button
              style={{ ...btnBase, color: "#22c55e", borderColor: "#22c55e" }}
              onClick={(e) => {
                e.stopPropagation();
                toggleMutation.mutate({ id: record.id, status: "active" });
              }}
            >
              启用
            </button>
          ) : record.status === "active" ? (
            <button
              style={{ ...btnBase, color: "#e53935", borderColor: "#e53935" }}
              onClick={(e) => {
                e.stopPropagation();
                toggleMutation.mutate({ id: record.id, status: "disabled" });
              }}
            >
              禁用
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  const handleCreateSubmit = () => {
    setShowCreate(false);
    createMutation.mutate();
  };

  return (
    <div>
      {/* 标题行 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 600 }}>
          🔑 API Key 管理
          <HelpIcon text="管理 API 调用密钥。支持 3 种权限模式和 IP 白名单" level="page" />
        </h2>
      </div>

      {/* 接入地址（OpenAI / Anthropic 双 base_url，来自后台配置） */}
      {apiConfig && (
        <div style={{ background: "#1e293b", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontFamily: "monospace", fontSize: 12, color: "#e2e8f0", lineHeight: 1.9 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", color: "#94a3b8", fontFamily: "system-ui, sans-serif", marginBottom: 4 }}>
            <span>🔌 接入地址</span>
            <span style={{ fontSize: 11 }}>（后台 系统设置 → API 服务 可配置）</span>
          </div>
          <div>
            <span style={{ color: "#94a3b8" }}>OpenAI base_url&nbsp;&nbsp;: </span>
            <span style={{ color: "#34d399" }}>{apiConfig.openaiBaseUrl}</span>{" "}
            <CopyButton text={apiConfig.openaiBaseUrl} />
          </div>
          <div>
            <span style={{ color: "#94a3b8" }}>Anthropic base_url: </span>
            <span style={{ color: "#34d399" }}>{apiConfig.anthropicBaseUrl}</span>{" "}
            <CopyButton text={apiConfig.anthropicBaseUrl} />
          </div>
          <div style={{ color: "#64748b" }}>
            聊天端点：{apiConfig.openaiChatUrl} ｜ {apiConfig.anthropicMessagesUrl}
          </div>
        </div>
      )}

      {/* 工具栏 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => {
              setNewName("新 Key");
              setNewMode("group");
              setNewGroup(MOCK_GROUPS[0]);
              setNewExpiry("");
              setNewIpWhitelist("");
              setCreatedSecret(null);
              setShowCreate(true);
            }}
            style={{
              background: "#4f6ef7",
              color: "#fff",
              border: "none",
              padding: "10px 20px",
              borderRadius: 8,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            + 创建 Key
            <HelpIcon text="创建新的 API 调用密钥，可指定权限模式和过期时间" />
          </button>
        </div>
        <div>
          <input
            type="text"
            placeholder="搜索 Key 名称…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: 240,
              height: 40,
              border: "1px solid #d9d9d9",
              borderRadius: 8,
              padding: "0 12px",
              fontSize: 14,
            }}
          />
        </div>
      </div>

      {/* 创建成功提示 */}
      {createdSecret && (
        <div style={{ background: "#e8f5e9", border: "1px solid #c8e6c9", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>✅ API Key 创建成功 — 仅展示一次，请立即复制</div>
          <code style={{ background: "#fff", padding: "8px 12px", borderRadius: 6, display: "block", wordBreak: "break-all", fontFamily: "monospace", fontSize: 14 }}>
            {createdSecret}
          </code>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button onClick={() => handleCopy(createdSecret)} style={{ ...btnBase, color: "#22c55e", borderColor: "#22c55e" }}>
              复制 Key
            </button>
            <button onClick={() => setCreatedSecret(null)} style={btnBase}>
              返回列表
            </button>
          </div>
        </div>
      )}

      {/* 表格 */}
      {isLoading ? (
        <SkeletonGroup lines={5} />
      ) : (
        <Table
          columns={columns}
          dataSource={filtered}
          loading={isLoading}
          emptyText="暂无 API Key，点击上方「创建 Key」开始"
        />
      )}

      {/* ===== 创建 Key 弹窗（原型：modal with form fields） ===== */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="创建 API Key">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Key 名称 */}
          <div>
            <label style={{ display: "block", fontSize: 13, color: "#333", marginBottom: 6 }}>
              名称 <span style={{ color: "#e53935" }}>*</span>
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例如：生产环境"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d9d9d9",
                borderRadius: 8,
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* 权限模式 */}
          <div>
            <label style={{ display: "block", fontSize: 13, color: "#333", marginBottom: 6 }}>
              权限模式 <span style={{ color: "#e53935" }}>*</span>
              <HelpIcon text="A: 绑定供应商+模型 / B: 绑定模型分组 / C: 无限制" />
            </label>
            <select
              value={newMode}
              onChange={(e) => setNewMode(e.target.value as any)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d9d9d9",
                borderRadius: 8,
                fontSize: 14,
                background: "#fff",
                boxSizing: "border-box",
              }}
            >
              <option value="vendor">A - 绑定供应商+模型</option>
              <option value="group">B - 绑定模型分组</option>
              <option value="unlimited">C - 无限制</option>
            </select>
          </div>

          {/* 选择分组（仅 group 模式显示） */}
          {newMode === "group" && (
            <div>
              <label style={{ display: "block", fontSize: 13, color: "#333", marginBottom: 6 }}>选择分组</label>
              <select
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #d9d9d9",
                  borderRadius: 8,
                  fontSize: 14,
                  background: "#fff",
                  boxSizing: "border-box",
                }}
              >
                {MOCK_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 过期时间 */}
          <div>
            <label style={{ display: "block", fontSize: 13, color: "#333", marginBottom: 6 }}>
              过期时间 <span style={{ color: "#888", fontWeight: 400 }}>（可选）</span>
            </label>
            <input
              type="date"
              value={newExpiry}
              onChange={(e) => setNewExpiry(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d9d9d9",
                borderRadius: 8,
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* IP 白名单 */}
          <div>
            <label style={{ display: "block", fontSize: 13, color: "#333", marginBottom: 6 }}>
              IP 白名单 <span style={{ color: "#888", fontWeight: 400 }}>（可选，一行一个）</span>
            </label>
            <textarea
              value={newIpWhitelist}
              onChange={(e) => setNewIpWhitelist(e.target.value)}
              placeholder={"192.168.1.1\n10.0.0.0/24"}
              rows={3}
              style={{
                width: "100%",
                border: "1px solid #d9d9d9",
                borderRadius: 8,
                padding: 8,
                fontSize: 13,
                resize: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* 操作按钮 */}
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
            <button
              onClick={() => setShowCreate(false)}
              style={{ ...btnBase, padding: "10px 24px", fontSize: 14 }}
            >
              取消
            </button>
            <button
              onClick={handleCreateSubmit}
              disabled={!newName.trim() || createMutation.isPending}
              style={{
                padding: "10px 24px",
                border: "none",
                borderRadius: 8,
                background: !newName.trim() ? "#a0b4f9" : "#4f6ef7",
                color: "#fff",
                cursor: !newName.trim() ? "not-allowed" : "pointer",
                fontSize: 14,
              }}
            >
              {createMutation.isPending ? "创建中..." : "确认创建"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
