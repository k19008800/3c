import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { HelpIcon, Modal, SkeletonGroup, EmptyState } from "@3cloud/shared-ui";
import { api, extractError } from "../lib/api";
import {
  availableChannels,
  getChannelStatusLabel,
  isChannelSelectable,
  sortChannels,
  type ChannelPricingRow,
  type ModelChannelsResponse,
} from "../lib/channelization";

const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", background: "#f8f9fa", color: "#666", fontWeight: 600, borderBottom: "1px solid var(--color-border)" };
const td: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #f0f0f0", verticalAlign: "middle" };
const btnBase: React.CSSProperties = { padding: "6px 12px", borderRadius: 8, border: "1px solid var(--color-border)", cursor: "pointer", fontWeight: 600, fontSize: 12, background: "#fff" };

function unwrapChannelsResponse(data: ModelChannelsResponse | { data?: ModelChannelsResponse }): ModelChannelsResponse {
  return "channels" in data ? data : data.data ?? { model: "", channels: [] };
}

function fmtPrice(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return `¥${value}`;
}

function statusColor(channel: ChannelPricingRow): React.CSSProperties {
  if (!isChannelSelectable(channel)) return { color: "#c62828", background: "#ffebee" };
  return { color: "#2e7d32", background: "#e8f5e9" };
}

export function ChannelPriceMatrixModal(props: {
  open: boolean;
  model: string;
  selectedChannelCode?: string | null;
  onSelect?: (channel: ChannelPricingRow) => void;
  onClose: () => void;
}) {
  const { open, model, selectedChannelCode, onSelect, onClose } = props;

  const q = useQuery({
    queryKey: ["model-channels", model],
    enabled: open && !!model,
    queryFn: async () => unwrapChannelsResponse((await api.get<ModelChannelsResponse>(`/models/${encodeURIComponent(model)}/channels`)).data),
    retry: 1,
  });

  const channels = useMemo(() => sortChannels(q.data?.channels ?? []), [q.data]);
  const selectableCount = availableChannels(channels).length;

  return (
    <Modal open={open} onClose={onClose} title={`渠道价目矩阵 · ${model}`} width={920}>
      <div style={{ marginBottom: 12, color: "var(--color-text-secondary)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
        行为渠道，列为输入/输出/缓存价格、健康分、延迟与状态；价格来自 GET /models/:name/channels 的当前用户生效价。
        <HelpIcon text="渠道价目矩阵只读取渠道级 channels[] 生效价，不使用 /me/models 平铺最低价字段作为权威价。" level="page" />
      </div>

      {q.isLoading ? (
        <SkeletonGroup lines={6} />
      ) : q.isError ? (
        <div style={{ padding: 20, borderRadius: 10, background: "#fff3f0", color: "#c62828" }}>
          渠道价目加载失败：{extractError(q.error)}
          <button type="button" style={{ ...btnBase, marginLeft: 12 }} onClick={() => q.refetch()}>
            重试 <HelpIcon text="重新请求当前模型的渠道价目矩阵。" level="button" />
          </button>
        </div>
      ) : channels.length === 0 ? (
        <EmptyState title="模型无可用渠道" description="后端返回 channels[] 为空，请稍后重试或联系管理员配置渠道价目。" />
      ) : (
        <>
          {selectableCount === 0 && (
            <div style={{ padding: 12, borderRadius: 8, background: "#fff8e1", color: "#8a5a00", marginBottom: 12, fontSize: 13 }}>
              当前模型所有渠道均处于维护/下线状态，矩阵仅供查看，暂不可手动选择。
            </div>
          )}
          <div style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780, fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>渠道</th>
                  <th style={th}>输入价</th>
                  <th style={th}>输出价</th>
                  <th style={th}>缓存读/写</th>
                  <th style={th}>健康</th>
                  <th style={th}>延迟</th>
                  <th style={th}>状态</th>
                  {onSelect && <th style={th}>操作</th>}
                </tr>
              </thead>
              <tbody>
                {channels.map((channel) => {
                  const selectable = isChannelSelectable(channel);
                  const selected = selectedChannelCode === channel.channel_code;
                  return (
                    <tr key={channel.channel_code} style={{ background: selected ? "#eef1ff" : undefined }}>
                      <td style={td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <strong>{channel.channel_name}</strong>
                          <code style={{ color: "#888" }}>{channel.channel_code}</code>
                          {channel.recommended && <span title="推荐理由：综合健康、延迟、价格与信用评级后优先推荐">⭐推荐</span>}
                          {channel.maintenance && <span>🔧维护中</span>}
                        </div>
                        <div style={{ color: "#888", fontSize: 12 }}>信用评级 {channel.credit ?? "—"} · 价格组 {channel.pricing_group ?? "—"}</div>
                      </td>
                      <td style={td}>{fmtPrice(channel.input_price)}</td>
                      <td style={td}>{fmtPrice(channel.output_price)}</td>
                      <td style={td}>{fmtPrice(channel.cache_read_input_price)} / {fmtPrice(channel.cache_write_input_price)}</td>
                      <td style={td}>{channel.health ?? "—"}</td>
                      <td style={td}>{channel.latency_ms != null ? `${channel.latency_ms}ms` : "—"}</td>
                      <td style={td}><span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 12, ...statusColor(channel) }}>{getChannelStatusLabel(channel)}</span></td>
                      {onSelect && (
                        <td style={td}>
                          <button type="button" disabled={!selectable} style={{ ...btnBase, opacity: selectable ? 1 : 0.5 }} onClick={() => onSelect(channel)}>
                            {selected ? "已选择" : "选择"} <HelpIcon text="选择该渠道后可用 model@channelCode 发起显式渠道锁定调用。" level="button" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
