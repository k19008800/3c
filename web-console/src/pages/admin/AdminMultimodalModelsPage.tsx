import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, StatusBadge, Modal, SkeletonGroup, useToast, ConfirmPopover } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

export default function AdminMultimodalModelsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [type, setType] = useState("");
  const [editItem, setEditItem] = useState<any>(null);

  const listQ = useQuery({
    queryKey: ["admin-multimodal", keyword, type],
    queryFn: async () => (await api.get(`/admin/multimodal-models?keyword=${keyword}&type=${type}`)).data.data,
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) =>
      (await api.put(`/admin/multimodal-models/${id}`, { is_enabled: enabled })).data,
    onSuccess: () => { toast.success("已更新"); qc.invalidateQueries({ queryKey: ["admin-multimodal"] }); },
    onError: (e: any) => toast.error(extractError(e)),
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>多模态模型管理</h2>
        <HelpIcon helpKey="multimodal" />
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
        <div style={{ fontWeight: 600, marginBottom: 12 }}>🎛️ 多模态模型列表 <HelpIcon helpKey="multimodal" /></div>
        {listQ.isLoading ? <SkeletonGroup count={5} /> : (
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
              {(listQ.data?.list ?? []).map((m: any) => (
                <tr key={m.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{m.display_name ?? m.model_name}</td>
                  <td style={{ padding: "10px 12px" }}>{{ vision: "👁️ 视觉", image_gen: "🎨 图片生成", audio: "🔊 音频", video: "🎬 视频", video_gen: "🎥 视频生成", multimodal: "🌈 多模态" }[m.type] ?? m.type}</td>
                  <td style={{ padding: "10px 12px", color: "#888" }}>{m.vendor_name}</td>
                  <td style={{ padding: "10px 12px", fontSize: 11 }}>
                    {(m.capabilities ?? []).map((c: string) => (
                      <span key={c} style={{ padding: "2px 6px", background: "#e8f4fd", borderRadius: 4, marginRight: 4, color: "#1976d2" }}>{c}</span>
                    ))}
                  </td>
                  <td style={{ padding: "10px 12px" }}>¥{m.sell_input_price}/1K tokens</td>
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
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
