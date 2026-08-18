import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, StatusBadge, SkeletonGroup, useToast, ConfirmPopover, EmptyState } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

/** 后端多模态模型 DTO（api/src/routes/admin-misc-missing.ts GET /admin/multimodal-models） */
interface ModModel {
  id: number;
  model_name: string;
  display_name: string;
  type: string | null;
  vendor_name: string;
  capabilities: string[];
  input_price: number;
  output_price: number;
  price_unit: string;
  max_tokens: number | null;
  status: string;
  is_enabled: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  vision: "👁️ 视觉",
  image_gen: "🎨 图片生成",
  audio: "🔊 音频",
  video: "🎬 视频",
  video_gen: "🎥 视频生成",
  multimodal: "🌈 多模态",
};

export default function AdminMultimodalModelsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [type, setType] = useState("");

  const listQ = useQuery({
    queryKey: ["admin-multimodal", keyword, type],
    queryFn: async () => (await api.get(`/admin/multimodal-models?keyword=${encodeURIComponent(keyword)}&type=${type}`)).data.data,
    retry: 0,
  });

  const list: ModModel[] = listQ.data?.list ?? [];

  const toggleMut = useMutation<any, unknown, { id: number; enabled: boolean }>({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) =>
      (await api.put(`/admin/multimodal-models/${id}`, { is_enabled: enabled })).data,
    onSuccess: () => { toast.success("已更新"); qc.invalidateQueries({ queryKey: ["admin-multimodal"] }); },
    onError: (e: any) => { toast.error(extractError(e)); },
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>多模态模型管理</h2>
        <HelpIcon text="multimodal" />
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <input style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", flex: 1 }}
          placeholder="搜索模型..." value={keyword} onChange={e => setKeyword(e.target.value)} />
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={type} onChange={e => setType(e.target.value)}>
          <option value="">全部类型</option>
          <option value="vision">视觉 (图片理解)</option>
          <option value="image_gen">图片生成</option>
          <option value="audio">音频 (TTS/STT)</option>
          <option value="video">视频理解</option>
          <option value="video_gen">视频生成</option>
          <option value="multimodal">多模态</option>
        </select>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>🎛️ 多模态模型列表 <HelpIcon text="multimodal" /></div>
        {listQ.isLoading ? <SkeletonGroup lines={5} /> : listQ.isError ? (
          <EmptyState title="加载失败" description="无法获取多模态模型列表，请检查后端服务或稍后重试" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>模型名</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>类型</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>供应商</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>支持能力</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>价格</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>状态</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
            </tr></thead>
            <tbody>
              {list.map((m: ModModel) => (
                <tr key={m.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{m.display_name ?? m.model_name}</td>
                  <td style={{ padding: "10px 12px" }}>{TYPE_LABEL[m.type ?? ""] ?? m.type ?? "-"}</td>
                  <td style={{ padding: "10px 12px", color: "#888" }}>{m.vendor_name}</td>
                  <td style={{ padding: "10px 12px", fontSize: 11 }}>
                    {(m.capabilities ?? []).map((c: string) => (
                      <span key={c} style={{ padding: "2px 6px", background: "#e8f4fd", borderRadius: 4, marginRight: 4, color: "#1976d2" }}>{c}</span>
                    ))}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    ¥{m.input_price ?? 0}
                    <span style={{ color: "#94a3b8", fontSize: 11 }}>
                      {m.price_unit === "per_1K_tokens" ? "/1K tokens" : "/1M tokens"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <StatusBadge status={m.is_enabled ? "success" : "default"}>{m.is_enabled ? "启用" : "禁用"}</StatusBadge>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <ConfirmPopover title={m.is_enabled ? "禁用该模型？" : "启用该模型？"}
                      onConfirm={() => toggleMut.mutate({ id: m.id, enabled: !m.is_enabled })}>
                      <button style={{ ...btnBase, background: m.is_enabled ? "#f0f0f0" : "#4f6ef7", color: m.is_enabled ? "#333" : "#fff", fontSize: 12 }}>
                        {m.is_enabled ? "禁用" : "启用"}
                      </button>
                    </ConfirmPopover>
                  </td>
                </tr>
              ))}
              {list.length === 0 && !listQ.isLoading && <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无模型</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
