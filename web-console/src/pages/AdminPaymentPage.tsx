import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, useToast } from "@3cloud/shared-ui";

/**
 * 支付通道设置（产品裁决 2026-08-15）
 * 支持微信支付 / 支付宝 / QQ 钱包参数配置 + 证书文件上传 + 对公转账账户。
 */

interface ChannelConfig {
  enabled: boolean;
  app_id: string;
  mch_id: string;
  api_v3_key: string;
  private_key: string;
  alipay_public_key: string;
  key: string;
  notify_url: string;
  cert_file: string | null;
}
interface BankConfig { account_name: string; account_number: string; bank_name: string; branch_name: string; }
interface PaymentConfig {
  wechat: ChannelConfig;
  alipay: ChannelConfig;
  qq: ChannelConfig;
  bank: BankConfig;
}
interface CertItem { name: string; size: number; modified_at: string | null; }

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 16 };
const fieldRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "140px 1fr", gap: 10, alignItems: "center", marginBottom: 10 };
const label: React.CSSProperties = { fontSize: 13, color: "var(--color-text-secondary)" };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box", fontFamily: "inherit" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const CHANNEL_META: { key: "wechat" | "alipay" | "qq"; title: string; icon: string; fields: { k: string; label: string; placeholder?: string }[] }[] = [
  {
    key: "wechat", title: "微信支付", icon: "💚",
    fields: [
      { k: "app_id", label: "AppID" },
      { k: "mch_id", label: "商户号" },
      { k: "api_v3_key", label: "APIv3 密钥", placeholder: "留空保持不变" },
      { k: "notify_url", label: "支付回调地址" },
    ],
  },
  {
    key: "alipay", title: "支付宝", icon: "💙",
    fields: [
      { k: "app_id", label: "AppID" },
      { k: "private_key", label: "应用私钥", placeholder: "留空保持不变" },
      { k: "alipay_public_key", label: "支付宝公钥", placeholder: "留空保持不变" },
      { k: "notify_url", label: "支付回调地址" },
    ],
  },
  {
    key: "qq", title: "QQ 钱包", icon: "🐧",
    fields: [
      { k: "app_id", label: "AppID" },
      { k: "mch_id", label: "商户号" },
      { k: "key", label: "API 密钥", placeholder: "留空保持不变" },
      { k: "notify_url", label: "支付回调地址" },
    ],
  },
];

export default function AdminPaymentPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [uploading, setUploading] = useState<{ channel: "wechat" | "alipay" | "qq"; name: string } | null>(null);

  const cfgQ = useQuery({
    queryKey: ["admin-payment-config"],
    queryFn: async () => (await api.get<{ data: PaymentConfig }>("/admin/payment/config")).data.data,
  });
  const certsQ = useQuery({
    queryKey: ["admin-payment-certs"],
    queryFn: async () => (await api.get<{ data: { list: CertItem[] } }>("/admin/payment/certs")).data.data.list,
  });

  const [draft, setDraft] = useState<PaymentConfig | null>(null);
  const cfg = draft ?? cfgQ.data;

  const saveMut = useMutation({
    mutationFn: async () => (await api.put("/admin/payment/config", draft)).data,
    onSuccess: (d: { data?: { message?: string } }) => { toast.success(d?.data?.message ?? "支付配置已保存"); setDraft(null); qc.invalidateQueries({ queryKey: ["admin-payment-config"] }); },
    onError: (e) => toast.error(extractError(e)),
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      if (!uploading) throw new Error("缺少通道信息");
      const content = await fileToBase64(file);
      return (await api.post("/admin/payment/cert", { channel: uploading.channel, filename: file.name, content })).data;
    },
    onSuccess: (d: { data?: { message?: string } }) => {
      toast.success(d?.data?.message ?? "证书上传成功");
      setUploading(null);
      qc.invalidateQueries({ queryKey: ["admin-payment-certs"] });
      qc.invalidateQueries({ queryKey: ["admin-payment-config"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const setChannel = (ch: "wechat" | "alipay" | "qq", patch: Partial<ChannelConfig>) => {
    if (!cfg) return;
    setDraft({ ...cfg, [ch]: { ...cfg[ch], ...patch } });
  };
  const setBank = (patch: Partial<BankConfig>) => {
    if (!cfg) return;
    setDraft({ ...cfg, bank: { ...cfg.bank, ...patch } });
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        支付通道设置
        <HelpIcon text="配置微信支付 / 支付宝 / QQ 钱包的参数与证书，以及对公转账收款账户。密钥字段回显时脱敏，留空表示不修改。" level="page" />
      </h2>

      {!cfg ? (
        <div style={{ color: "var(--color-text-secondary)" }}>加载中...</div>
      ) : (
        <>
          {CHANNEL_META.map((meta) => {
            const ch = cfg[meta.key];
            return (
              <div key={meta.key} style={card}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 18 }}>{meta.icon}</span>
                  <h3 style={{ margin: 0 }}>{meta.title}</h3>
                  <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!ch.enabled} onChange={(e) => setChannel(meta.key, { enabled: e.target.checked })} />
                    启用该支付方式
                  </label>
                </div>
                {meta.fields.map((f) => (
                  <div key={f.k} style={fieldRow}>
                    <span style={label}>{f.label}</span>
                    <input
                      style={inp}
                      value={String((ch as any)[f.k] ?? "")}
                      placeholder={f.placeholder ?? ""}
                      onChange={(e) => setChannel(meta.key, { [f.k]: e.target.value } as Partial<ChannelConfig>)}
                    />
                  </div>
                ))}
                <div style={fieldRow}>
                  <span style={label}>商户证书</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, color: ch.cert_file ? "var(--color-success-text)" : "var(--color-text-secondary)" }}>
                      {ch.cert_file ? `已上传：${ch.cert_file}` : "未上传证书"}
                    </span>
                    <label style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-primary)", border: "1px solid var(--color-border)", display: "inline-block", cursor: "pointer" }}>
                      上传证书
                      <input
                        type="file"
                        accept=".pem,.crt,.cer,.key,.pfx"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) { setUploading({ channel: meta.key, name: file.name }); uploadMut.mutate(file); }
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {uploading?.channel === meta.key && <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>上传中 {uploading.name}...</span>}
                  </div>
                </div>
              </div>
            );
          })}

          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 18 }}>🏦</span>
              <h3 style={{ margin: 0 }}>对公转账收款账户</h3>
            </div>
            {([
              ["account_name", "户名"],
              ["account_number", "账号"],
              ["bank_name", "开户行"],
              ["branch_name", "支行"],
            ] as const).map(([k, labelText]) => (
              <div key={k} style={fieldRow}>
                <span style={label}>{labelText}</span>
                <input style={inp} value={String(cfg.bank[k] ?? "")} onChange={(e) => setBank({ [k]: e.target.value } as Partial<BankConfig>)} />
              </div>
            ))}
          </div>

          <div style={card}>
            <h3 style={{ marginBottom: 12 }}>已上传证书</h3>
            {(certsQ.data?.length ?? 0) === 0 ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>暂无证书文件</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                  <th style={{ padding: "6px" }}>文件名</th><th style={{ padding: "6px" }}>大小</th><th style={{ padding: "6px" }}>上传时间</th>
                </tr></thead>
                <tbody>
                  {certsQ.data?.map((c) => (
                    <tr key={c.name} style={{ borderTop: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "6px", fontFamily: "monospace", fontSize: 12 }}>{c.name}</td>
                      <td style={{ padding: "6px" }}>{(c.size / 1024).toFixed(1)} KB</td>
                      <td style={{ padding: "6px", color: "var(--color-text-secondary)" }}>{c.modified_at ? new Date(c.modified_at).toLocaleString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            {draft && (
              <button style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }} onClick={() => setDraft(null)}>取消修改</button>
            )}
            <button
              style={{ ...btnBase, background: "var(--color-primary)", color: "#fff", opacity: draft ? 1 : 0.5, cursor: draft ? "pointer" : "not-allowed" }}
              disabled={!draft || saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? "保存中..." : "保存支付配置"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}
