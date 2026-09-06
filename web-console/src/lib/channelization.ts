export interface ChannelPricingRow {
  channel_code: string;
  channel_name: string;
  input_price: string | number;
  output_price: string | number;
  cache_read_input_price?: string | number | null;
  cache_write_input_price?: string | number | null;
  pricing_group?: string | null;
  status?: string | null;
  health?: number | null;
  latency_ms?: number | null;
  recommended?: boolean | null;
  credit?: string | null;
  maintenance?: boolean | null;
}

export interface ModelChannelsResponse {
  model: string;
  channels: ChannelPricingRow[];
}

export interface MeModelRow {
  id?: number | string;
  model?: string;
  name?: string;
  provider?: string;
  context?: number;
  inputPrice?: number | string;
  outputPrice?: number | string;
  channels?: ChannelPricingRow[];
}

export interface ModelOption {
  model: string;
  label: string;
}

export interface ChannelSelectionPreview {
  model: string;
  channelCode: string | null;
  value: string;
  inputPrice: string;
  outputPrice: string;
}

const CREDIT_ORDER: Record<string, number> = { AAA: 3, AA: 2, A: 1 };

export function parseModelChannel(input: string): { model: string; channelCode: string | null } {
  const raw = input.trim();
  if (!raw) return { model: "", channelCode: null };
  const atIndex = raw.indexOf("@");
  if (atIndex < 0) return { model: raw, channelCode: null };
  const model = raw.slice(0, atIndex).trim();
  const channelCode = raw.slice(atIndex + 1).trim();
  return { model, channelCode: channelCode || null };
}

export function formatModelChannel(model: string, channelCode: string | null): string {
  const cleanModel = model.trim();
  if (!cleanModel) return "";
  return channelCode ? `${cleanModel}@${channelCode}` : `${cleanModel}@auto`;
}

export function toNumberPrice(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function getChannelLowestPrice(channel: Pick<ChannelPricingRow, "input_price" | "output_price">): number | null {
  const input = toNumberPrice(channel.input_price);
  const output = toNumberPrice(channel.output_price);
  const values = [input, output].filter((v): v is number => typeof v === "number");
  if (values.length === 0) return null;
  return Math.min(...values);
}

export function getChannelStatusLabel(channel: Pick<ChannelPricingRow, "status" | "maintenance">): string {
  if (channel.maintenance) return "维护中";
  switch (channel.status) {
    case "available":
    case "active":
      return "可用";
    case "maintenance":
      return "维护中";
    case "offline":
      return "已下线";
    default:
      return channel.status ?? "未知";
  }
}

export function isChannelSelectable(channel: Pick<ChannelPricingRow, "status" | "maintenance">): boolean {
  return !channel.maintenance && channel.status !== "maintenance" && channel.status !== "offline";
}

export function sortChannels(channels: ChannelPricingRow[]): ChannelPricingRow[] {
  return [...channels].sort((a, b) => {
    const aMaintenance = !isChannelSelectable(a);
    const bMaintenance = !isChannelSelectable(b);
    if (aMaintenance !== bMaintenance) return aMaintenance ? 1 : -1;
    if (Boolean(a.recommended) !== Boolean(b.recommended)) return a.recommended ? -1 : 1;

    const priceA = getChannelLowestPrice(a);
    const priceB = getChannelLowestPrice(b);
    if (priceA != null && priceB != null && priceA !== priceB) return priceA - priceB;
    if (priceA != null && priceB == null) return -1;
    if (priceA == null && priceB != null) return 1;

    const creditA = CREDIT_ORDER[a.credit ?? ""] ?? 0;
    const creditB = CREDIT_ORDER[b.credit ?? ""] ?? 0;
    if (creditA !== creditB) return creditB - creditA;

    const healthA = a.health ?? -1;
    const healthB = b.health ?? -1;
    if (healthA !== healthB) return healthB - healthA;

    const latencyA = a.latency_ms ?? Number.POSITIVE_INFINITY;
    const latencyB = b.latency_ms ?? Number.POSITIVE_INFINITY;
    if (latencyA !== latencyB) return latencyA - latencyB;

    return a.channel_code.localeCompare(b.channel_code);
  });
}

export function availableChannels(channels: ChannelPricingRow[]): ChannelPricingRow[] {
  return channels.filter((channel) => isChannelSelectable(channel));
}

export function dedupeModelOptions(rows: MeModelRow[] | undefined): ModelOption[] {
  const seen = new Set<string>();
  const options: ModelOption[] = [];

  for (const row of rows ?? []) {
    const model = (row.model ?? row.name ?? "").trim();
    if (!model || seen.has(model)) continue;
    seen.add(model);
    options.push({
      model,
      label: model,
    });
  }

  return options;
}

export function getModelChannels(rows: MeModelRow[] | undefined, model: string): ChannelPricingRow[] {
  const target = model.trim();
  if (!target) return [];
  const row = (rows ?? []).find((item) => (item.model ?? item.name ?? "").trim() === target);
  return row?.channels ?? [];
}

export function buildSelectionPreview(model: string, channelCode: string | null, channel?: ChannelPricingRow | null): ChannelSelectionPreview {
  return {
    model,
    channelCode,
    value: formatModelChannel(model, channelCode),
    inputPrice: channel ? String(channel.input_price) : "—",
    outputPrice: channel ? String(channel.output_price) : "—",
  };
}
