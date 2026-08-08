import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  HelpIcon,
  Table,
  StatusBadge,
  useToast,
  SkeletonGroup,
  ConfirmPopover,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

interface ApiKey {
  id: number;
  name: string;
  keyPrefix: string;
  status: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ list: ApiKey[] }>({
    queryKey: ["api-keys"],
    queryFn: async () => (await api.get("/me/api-keys")).data,
  });

  // 全部模型（用于白名单选择）
  const allModels = useQuery<{ list: { id: string; displayName?: string }[] }>({
    queryKey: ["all-models"],
    queryFn: async () => (await api.get("/public/models")).data,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) =>
      (await api.post("/me/api-keys", { name, model_whitelist: selectedModels.length ? selectedModels : undefined })).data,
    onSuccess: (data) => {
      setCreatedSecret(data.key);
      setNewKeyName("");
      setSelectedModels([]);
      toast.success("API Key 创建成功");
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e: any) => toast.error(extractError(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => await api.delete(`/me/api-keys/${id}`),
    onSuccess: () => {
      toast.success("API Key 已删除");
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) =>
      await api.patch(`/me/api-keys/${id}`, { status }),
    onSuccess: () => {
      toast.success("状态已更新");
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const columns: ColumnDef<ApiKey>[] = [
    { key: "name", title: "名称", dataIndex: "name" },
    {
      key: "key",
      title: "Key",
      render: (_, record) => <span style={{ fontFamily: "monospace", fontSize: 13 }}>{record.keyPrefix}...</span>,
    },
    {
      key: "status",
      title: "状态",
      dataIndex: "status",
      render: (v) => {
        const s = v as string;
        if (s === "active") return <StatusBadge status="success">启用</StatusBadge>;
        if (s === "disabled") return <StatusBadge status="warning">已禁用</StatusBadge>;
        return <StatusBadge status="danger">{s}</StatusBadge>;
      },
    },
    {
      key: "createdAt",
      title: "创建时间",
      dataIndex: "createdAt",
      render: (v) => (
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          {new Date(v as string).toLocaleString()}
        </span>
      ),
    },
    {
      key: "action",
      title: "操作",
      render: (_, record) => (
        <span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleMutation.mutate({
                id: record.id,
                status: record.status === "active" ? "disabled" : "active",
              });
            }}
            style={{
              marginRight: 8,
              padding: "4px 10px",
              cursor: "pointer",
              borderRadius: 6,
              border: "1px solid var(--color-border)",
              background: "var(--color-bg)",
              color: "var(--color-text)",
            }}
          >
            {record.status === "active" ? "禁用" : "启用"}
          </button>
          <ConfirmPopover
            title={`确定要删除 "${record.name}" 吗？`}
            description="此操作不可撤销"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <button
              style={{
                padding: "4px 10px",
                cursor: "pointer",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "var(--color-bg)",
                color: "var(--color-danger-text)",
              }}
            >
              删除
            </button>
          </ConfirmPopover>
        </span>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>
          API Keys
          <HelpIcon text="管理您的 API 密钥，可创建、启用/禁用和删除密钥。模型白名单可限制密钥可访问的模型范围。" level="page" />
        </h2>
      </div>

      {/* 模型白名单选择（可选） */}
      <div style={{ marginBottom: 16, background: "var(--color-bg)", padding: 12, borderRadius: 8 }}>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>
          模型白名单（{selectedModels.length ? `已选 ${selectedModels.length}` : "不限制所有模型"}）
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(allModels.data?.list ?? []).map((m) => {
            const name = typeof m === "string" ? m : (m?.id ?? m?.displayName ?? "");
            const on = selectedModels.includes(name);
            return (
              <button
                key={name}
                onClick={() => {
                  setSelectedModels(on ? selectedModels.filter((x) => x !== name) : [...selectedModels, name]);
                }}
                style={{
                  padding: "5px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: "pointer",
                  border: "1px solid var(--color-border)",
                  background: on ? "var(--color-primary)" : "#fff",
                  color: on ? "#fff" : "var(--color-text)",
                }}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {createdSecret && (
        <div
          style={{
            background: "var(--color-success-bg)",
            border: "1px solid var(--color-success-text)",
            padding: 16,
            borderRadius: 8,
            marginBottom: 20,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>✅ Key 创建成功（仅此一次显示，请妥善保存）</div>
          <code
            style={{
              background: "#fff",
              padding: 8,
              borderRadius: 4,
              display: "block",
              wordBreak: "break-all",
            }}
          >
            {createdSecret}
          </code>
          <button
            onClick={() => setCreatedSecret(null)}
            style={{ marginTop: 8, background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer" }}
          >
            关闭
          </button>
        </div>
      )}

      {isLoading && !data ? (
        <SkeletonGroup lines={5} />
      ) : (
        <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
          <input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key 名称"
            style={{ padding: 8, borderRadius: 6, border: "1px solid var(--color-border)", flex: 1, maxWidth: 260 }}
          />
          <button
            onClick={() => createMutation.mutate(newKeyName)}
            disabled={!newKeyName || createMutation.isPending}
            style={{
              padding: "8px 14px",
              background: "var(--color-primary)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            创建 Key
          </button>
        </div>
      )}

      <Table columns={columns as any} dataSource={data?.list as any ?? []} loading={isLoading} emptyText="暂无 API Key" />
    </div>
  );
}
