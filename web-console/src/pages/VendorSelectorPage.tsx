import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, extractError } from "../lib/api";
import { HelpIcon, SkeletonGroup, EmptyState } from "@3cloud/shared-ui";
import { ChannelPriceMatrixModal } from "../components/ChannelPriceMatrixModal";
import {
  availableChannels,
  buildSelectionPreview,
  dedupeModelOptions,
  getChannelStatusLabel,
  getModelChannels,
  isChannelSelectable,
  sortChannels,
  type ChannelPricingRow,
  type MeModelRow,
  type ModelChannelsResponse,
} from "../lib/channelization";

const card: React.CSSProperties = { background: "#fff", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 20 };
const btnBase: React.CSSProperties = { padding: "10px 18px", borderRadius: 8, border: "1px solid var(--color-border)", cursor: "pointer", fontWeight: 600, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 };

function unwrapList<T>(data: T[] | { data?: T[] | { list?: T[] } }): T[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (data.data && !Array.isArray(data.data) && Array.isArray(data.data.list)) return data.data.list;
  return [];
}

function unwrapChannels(data: ModelChannelsResponse | { data?: ModelChannelsResponse }): ModelChannelsResponse {
  return "channels" in data ? data : data.data ?? { model: "", channels: [] };
}

function healthColor(score: number | null | undefined): string {
  if (score == null) return "#999";
  if (score >= 95) return "#22c55e";
  if (score >= 80) return "#f0ad4e";
  return "#e53935";
}

function fmtPrice(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return `¥${value}`;
}

function priceRange(channels: ChannelPricingRow[], field: "input_price" | "output_price"): string {
  const values = channels
    .map((channel) => Number(channel[field]))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (values.length === 0) return "—";
  const min = values[0]!;
  const max = values[values.length - 1]!;
  return min === max ? `¥${min}` : `¥${min} ~ ¥${max}`;
}

function ChannelCard(props: { channel: ChannelPricingRow; selected: boolean; onSelect: () => void }) {
  const { channel, selected, onSelect } = props;
  const selectable = isChannelSelectable(channel);
  return (
    <div
      onClick={() => selectable && onSelect()}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "16px 20px",
        borderBottom: "1px solid #f5f5f5",
        cursor: selectable ? "pointer" : "not-allowed",
        background: selected ? "#eef1ff" : selectable ? "transparent" : "#fafafa",
        opacity: selectable ? 1 : 0.58,
      }}
    >
      <input type="radio" name="channel" checked={selected} disabled={!selectable} onChange={() => {}} style={{ width: 18, height: 18, accentColor: "#4f6ef7" }} />
      <div style={{ width: 48, height: 48, borderRadius: 12, background: "#4f6ef7", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, flexShrink: 0 }}>
        {(channel.channel_name || channel.channel_code).slice(0, 1)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, color: "#333" }}>{channel.channel_name}</span>
          <code style={{ color: "#888", fontSize: 12 }}>{channel.channel_code}</code>
          <span style={{ padding: "2px 8px", borderRadius: 4, background: channel.credit === "AAA" ? "#e8f5e9" : channel.credit === "AA" ? "#e3f2fd" : "#f5f5f5", color: channel.credit === "AAA" ? "#2e7d32" : channel.credit === "AA" ? "#1565c0" : "#888", fontSize: 11, fontWeight: 700 }}>{channel.credit ?? "—"}</span>
          {channel.recommended && <span title="推荐理由：综合价格、健康分、延迟与信用评级后优先推荐" style={{ padding: "2px 8px", borderRadius: 4, background: "#fff8e1", color: "#f57c00", fontSize: 11 }}>⭐ 推荐</span>}
          {channel.maintenance && <span style={{ padding: "2px 8px", borderRadius: 4, background: "#ffebee", color: "#c62828", fontSize: 11 }}>🔧 维护中</span>}
        </div>
        <div style={{ color: "#888", fontSize: 12, marginTop: 4 }}>价格组 {channel.pricing_group ?? "—"} · 状态 {getChannelStatusLabel(channel)}</div>
      </div>
      <div style={{ minWidth: 190, fontSize: 13, color: "#555", lineHeight: 1.7 }}>
        <div>输入 <b style={{ color: "#333" }}>{fmtPrice(channel.input_price)}</b></div>
        <div>输出 <b style={{ color: "#333" }}>{fmtPrice(channel.output_price)}</b></div>
        <div>缓存读/写 <b style={{ color: "#333" }}>{fmtPrice(channel.cache_read_input_price)} / {fmtPrice(channel.cache_write_input_price)}</b></div>
      </div>
      <div style={{ minWidth: 100, textAlign: "right", fontSize: 12, color: "#888", lineHeight: 1.8 }}>
        <div><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: healthColor(channel.health), marginRight: 4 }} />健康 {channel.health ?? "—"}</div>
        <div>延迟 {channel.latency_ms != null ? `${channel.latency_ms}ms` : "—"}</div>
      </div>
    </div>
  );
}

export default function VendorSelectorPage() {
  const navigate = useNavigate();
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedChannelCode, setSelectedChannelCode] = useState<string | null>(null);
  const [matrixOpen, setMatrixOpen] = useState(false);

  const modelsQ = useQuery({
    queryKey: ["me-models"],
    queryFn: async () => unwrapList<MeModelRow>((await api.get<MeModelRow[]>("/me/models")).data),
  });

  const modelOptions = useMemo(() => dedupeModelOptions(modelsQ.data), [modelsQ.data]);

  const channelsQ = useQuery({
    queryKey: ["model-channels", selectedModel],
    enabled: !!selectedModel,
    queryFn: async () => unwrapChannels((await api.get<ModelChannelsResponse>(`/models/${encodeURIComponent(selectedModel)}/channels`)).data).channels,
    initialData: () => (selectedModel ? getModelChannels(modelsQ.data, selectedModel) : undefined),
    retry: 1,
  });

  const channels = useMemo(() => sortChannels(channelsQ.data ?? []), [channelsQ.data]);
  const selectableChannels = useMemo(() => availableChannels(channels), [channels]);
  const selectedChannel = selectedChannelCode ? channels.find((channel) => channel.channel_code === selectedChannelCode) ?? null : null;
  const preview = buildSelectionPreview(selectedModel, selectedChannelCode, selectedChannel);

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    setSelectedChannelCode(null);
  };

  const handleCall = () => {
    if (!selectedModel) return;
    const modelParam = selectedChannelCode ? `${selectedModel}@${selectedChannelCode}` : selectedModel;
    navigate(`/playground?model=${encodeURIComponent(modelParam)}`);
  };

  return (
    <div>
      <h2 style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 600 }}>
        🔑 渠道选择
        <HelpIcon text="独立渠道选择页：先从 /me/models 获取模型，再按模型请求 /models/:name/channels 查看当前用户生效的渠道价目；默认自动路由，也可手动锁定具体渠道。" level="page" />
      </h2>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>调用模型 <HelpIcon text="模型列表来自 /me/models，并按模型名去重；不使用平铺价格字段作为权威价。" level="button" /></label>
          {modelsQ.isLoading ? <SkeletonGroup lines={1} /> : modelsQ.isError ? (
            <span style={{ color: "#c62828", fontSize: 13 }}>模型加载失败：{extractError(modelsQ.error)}</span>
          ) : (
            <select value={selectedModel} onChange={(e) => handleModelChange(e.target.value)} style={{ height: 40, minWidth: 280, border: "1px solid #d9d9d9", borderRadius: 8, padding: "0 12px", fontSize: 14, background: "#fff" }}>
              <option value="">— 请选择模型 —</option>
              {modelOptions.map((model) => <option key={model.model} value={model.model}>{model.label}</option>)}
            </select>
          )}
          {modelsQ.isError && <button type="button" style={{ ...btnBase, background: "#fff" }} onClick={() => modelsQ.refetch()}>重试 <HelpIcon text="重新请求 /me/models 获取模型列表。" level="button" /></button>}
          <span style={{ fontSize: 13, color: "#888" }}>{selectedModel ? `当前模型：${selectedModel}` : "选择模型后加载渠道价目"}</span>
        </div>
      </div>

      {selectedModel && (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#333", display: "flex", alignItems: "center", gap: 6 }}>
              渠道选择
              <HelpIcon text="同一模型可由多个渠道提供。自动路由不传渠道编码；手动选择后将形成 model@channelCode 的显式渠道调用值。" level="button" />
            </h3>
            <button type="button" style={{ ...btnBase, padding: "6px 12px", background: "#fff" }} onClick={() => setMatrixOpen(true)}>
              查看渠道价目矩阵 <HelpIcon text="弹出当前模型的渠道价目矩阵，按渠道横向比较价格、健康、延迟与状态。" level="button" />
            </button>
          </div>

          <div onClick={() => setSelectedChannelCode(null)} style={{ padding: "14px 20px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", background: selectedChannelCode === null ? "#f8f9ff" : "transparent" }}>
            <input type="radio" name="channel" checked={selectedChannelCode === null} onChange={() => {}} style={{ width: 18, height: 18, accentColor: "#4f6ef7" }} />
            <span style={{ fontWeight: 700 }}>自动路由</span>
            <span style={{ color: "#888", fontSize: 12 }}>默认选中，不指定渠道，由系统按健康、延迟、价格等策略智能选择。</span>
            <span style={{ marginLeft: "auto" }}><HelpIcon text="自动路由对应调用时传原始模型名；预览显示 model@auto 仅用于说明，不作为真实请求 model 值发送。" level="button" /></span>
          </div>

          {channelsQ.isLoading ? (
            <div style={{ padding: 20 }}><SkeletonGroup lines={5} /></div>
          ) : channelsQ.isError ? (
            <div style={{ padding: 20, color: "#c62828" }}>
              渠道加载失败：{extractError(channelsQ.error)}
              <button type="button" style={{ ...btnBase, marginLeft: 12 }} onClick={() => channelsQ.refetch()}>重试 <HelpIcon text="重新请求 /models/:name/channels 获取渠道价目。" level="button" /></button>
            </div>
          ) : channels.length === 0 ? (
            <div style={{ padding: 20 }}><EmptyState title="模型无可用渠道" description="后端返回 channels[] 为空，无法展示渠道价目；请稍后重试或联系管理员配置。" /></div>
          ) : (
            <>
              {selectableChannels.length === 0 && <div style={{ margin: 16, padding: 12, borderRadius: 8, background: "#fff8e1", color: "#8a5a00", fontSize: 13 }}>当前模型全部渠道维护中或下线，只能保留自动路由等待系统恢复。</div>}
              {channels.map((channel) => <ChannelCard key={channel.channel_code} channel={channel} selected={selectedChannelCode === channel.channel_code} onSelect={() => setSelectedChannelCode(channel.channel_code)} />)}
            </>
          )}
        </div>
      )}

      {selectedModel && !channelsQ.isError && channels.length > 0 && (
        <div style={card}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>调用预览 <HelpIcon text="展示当前选择对应的 model 值和渠道级生效价；自动路由显示价格范围用于参考。" level="button" /></h3>
          <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap", marginBottom: 16 }}>
            <div><div style={{ color: "#888", fontSize: 12 }}>预览 model 值</div><code style={{ background: "#f5f5f5", padding: "4px 10px", borderRadius: 6 }}>{preview.value}</code></div>
            <div><div style={{ color: "#888", fontSize: 12 }}>输入价格</div><strong style={{ color: "#4f6ef7" }}>{selectedChannel ? fmtPrice(selectedChannel.input_price) : priceRange(selectableChannels, "input_price")}</strong></div>
            <div><div style={{ color: "#888", fontSize: 12 }}>输出价格</div><strong style={{ color: "#4f6ef7" }}>{selectedChannel ? fmtPrice(selectedChannel.output_price) : priceRange(selectableChannels, "output_price")}</strong></div>
            <div><div style={{ color: "#888", fontSize: 12 }}>当前态</div><strong>{selectedChannel ? `手动渠道：${selectedChannel.channel_name}` : "自动路由"}</strong></div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button type="button" disabled={!selectedModel} onClick={handleCall} style={{ ...btnBase, background: "#4f6ef7", color: "#fff", borderColor: "#4f6ef7", opacity: selectedModel ? 1 : 0.5 }}>
              ▶ 发起调用 <HelpIcon text="跳转到 /playground，并把当前模型或 model@channelCode 作为 model 参数带入调试页。" level="button" />
            </button>
            <button type="button" disabled style={{ ...btnBase, background: "#f5f5f5", color: "#888", cursor: "not-allowed" }}>
              ⭐ 保存为默认 <HelpIcon text="保存默认渠道偏好属于 P1，本期仅展示为禁用操作，不会提交后端。" level="button" />
            </button>
          </div>
        </div>
      )}

      <ChannelPriceMatrixModal
        open={matrixOpen}
        model={selectedModel}
        selectedChannelCode={selectedChannelCode}
        onClose={() => setMatrixOpen(false)}
        onSelect={(channel) => { setSelectedChannelCode(channel.channel_code); setMatrixOpen(false); }}
      />
    </div>
  );
}
