import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, StatusBadge, Modal, SkeletonGroup, useToast, ConfirmPopover } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

/* ───────── 演示数据（对齐原型 admin-multimodal-models.html 分布） ───────── */

interface ModModel { id: number; model_name: string; display_name: string; type: string; vendor_name: string; capabilities: string[]; sell_input_price: number; is_enabled: boolean; }
interface ModData { list: ModModel[]; demo?: boolean; }

const MOCK: ModData = {
  list: [
    { id: 1, model_name: "gpt-4o", display_name: "GPT-4o", type: "vision", vendor_name: "OpenAI", capabilities: ["图片理解", "OCR"], sell_input_price: 0.005, is_enabled: true },
    { id: 2, model_name: "dall-e-3", display_name: "DALL·E 3", type: "image_gen", vendor_name: "OpenAI", capabilities: ["文生图", "高清"], sell_input_price: 0.02, is_enabled: true },
    { id: 3, model_name: "whisper-1", display_name: "Whisper", type: "audio", vendor_name: "OpenAI", capabilities: ["语音转文字"], sell_input_price: 0.006, is_enabled: false },
    { id: 4, model_name: "claude-3.5-sonnet", display_name: "Claude 3.5 Sonnet", type: "multimodal", vendor_name: "Anthropic", capabilities: ["图片理解", "长文本"], sell_input_price: 0.003, is_enabled: true },
    { id: 5, model_name: "gemini-1.5-pro", display_name: "Gemini 1.5 Pro", type: "vision", vendor_name: "Google", capabilities: ["视频理解", "图片理解"], sell_input_price: 0.004, is_enabled: false },
    { id: 6, model_name: "runway-gen3", display_name: "Runway Gen-3", type: "video_gen", vendor_name: "Runway", capabilities: ["文生视频"], sell_input_price: 0.05, is_enabled: true },
  ],
  demo: true,
};

export default function AdminMultimodalModelsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [type, setType] = useState("");
  // 演示兜底：本地可变列表（写操作在演示模式下直接改它）
  const [localList, setLocalList] = useState<ModModel[]>(MOCK.list);

  const listQ = useQuery({
    queryKey: ["admin-multimodal", keyword, type],
    queryFn: async () => (await api.get(`/admin/multimodal-models?keyword=${keyword}&type=${type}`)).data.data,
    // 后端未实现时立即回退演示数据，避免 404 反复重试导致页面卡加载
    retry: 0,
  });

  // 后端未实现时回退到演示数据（未来接入真实端点后此兜底自动失效）
  const list = listQ.data?.list != null ? listQ.data.list : localList;
  const demo = listQ.data?.list == null;

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) =>
      (await api.put(`/admin/multimodal-models/${id}`, { is_enabled: enabled })).data,
    onSuccess: () => { toast.success("已更新"); qc.invalidateQueries({ queryKey: ["admin-multimodal"] }); },
    onError: (e: any, vars?: { id: number; enabled: boolean }) => {
      // 演示模式：后端未实现时本地生效
      if (e?.response?.status === 404 && vars) {
        setLocalList(prev => prev.map(m => m.id === vars.id ? { ...m, is_enabled: vars.enabled } : m));
        toast.success(`已${vars.enabled ? "启用" : "禁用"}（演示）`);
      } else {
        toast.error(extractError(e));
      }
    },
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>多模态模型管理</h2>
        <HelpIcon text="multimodal" />
        {demo && <span style={{ fontSize: 11, color: "#f59e0b" }}>⚠️ 演示数据（后端 /admin/multimodal-models 待接入）</span>}
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
        {listQ.isLoading ? <SkeletonGroup lines={5} /> : (
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
              {(list ?? []).map((m: ModModel) => (
                <tr key={m.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{m.display_name ?? m.model_name}</td>
                  <td style={{ padding: "10px 12px" }}>{({ vision: "👁️ 视觉", image_gen: "🎨 图片生成", audio: "🔊 音频", video: "🎬 视频", video_gen: "🎥 视频生成", multimodal: "🌈 多模态" } as Record<string, string>)[m.type] ?? m.type}</td>
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
              {(list ?? []).length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无模型</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
