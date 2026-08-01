import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

/**
 * 协议确认横幅（SPEC-§33.1/33.2）
 * 登录后检测隐私政策/服务条款是否有新版待确认，若有则显示横幅引导用户确认
 * 嵌入 ConsoleLayout main 顶部
 */

interface ConsentStatus {
  status: string; // none / privacy_pending / tos_pending / both_pending
  privacy_policy: { id: number; version: string; title: string | null; summary: string | null; published_at: string } | null;
  terms_of_service: { id: number; version: string; title: string | null; summary: string | null; published_at: string } | null;
}

const btn: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

export default function ConsentBanner() {
  const qc = useQueryClient();
  const [showDetail, setShowDetail] = useState(false);

  const statusQ = useQuery({
    queryKey: ["me-consent-status"],
    queryFn: async () => (await api.get<{ data: ConsentStatus }>("/me/consent/status")).data.data,
    refetchOnWindowFocus: false,
  });

  const status = statusQ.data?.status;
  const needConsent = status === "privacy_pending" || status === "tos_pending" || status === "both_pending";
  const hasPrivacy = !!statusQ.data?.privacy_policy;
  const hasTos = !!statusQ.data?.terms_of_service;

  const consentPrivacy = useMutation({
    mutationFn: async () => (await api.post("/me/consent/privacy", {})).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["me-consent-status"] }); },
    onError: (e: any) => { /* 静默 */ console.error(extractError(e)); },
  });
  const consentTos = useMutation({
    mutationFn: async () => (await api.post("/me/consent/terms", {})).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["me-consent-status"] }); },
    onError: (e: any) => console.error(extractError(e)),
  });

  if (!needConsent || statusQ.isLoading) return null;

  const items: string[] = [];
  if (status === "privacy_pending" || status === "both_pending") items.push(`隐私政策 ${statusQ.data?.privacy_policy?.version ?? ""}`);
  if (status === "tos_pending" || status === "both_pending") items.push(`服务条款 ${statusQ.data?.terms_of_service?.version ?? ""}`);

  return (
    <div
      style={{
        background: "#fef3c7",
        border: "1px solid #fcd34d",
        color: "#78350f",
        padding: "14px 20px",
        borderRadius: 10,
        marginBottom: 16,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ fontSize: 14 }}>
        <strong>协议已更新，请重新确认：</strong>
        <span style={{ marginLeft: 6 }}>{items.join("、" )}</span>
        {showDetail && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#92400e", lineHeight: 1.6 }}>
            {hasPrivacy && statusQ.data?.privacy_policy?.summary && <div>· 隐私政策更新摘要：{statusQ.data.privacy_policy.summary}</div>}
            {hasTos && statusQ.data?.terms_of_service?.summary && <div>· 服务条款更新摘要：{statusQ.data.terms_of_service.summary}</div>}
            <div>· 确认后即可正常使用平台全部功能；未确认不影响已创建 API Key 的调用，但将逐步限制新操作。</div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => setShowDetail(!showDetail)} style={{ ...btn, background: "transparent", color: "#78350f", textDecoration: "underline" }}>
          {showDetail ? "收起" : "查看变更"}
        </button>
        {(status === "privacy_pending" || status === "both_pending") && (
          <button onClick={() => consentPrivacy.mutate()} disabled={consentPrivacy.isPending} style={{ ...btn, background: "#b45309", color: "#fff" }}>
            {consentPrivacy.isPending ? "..." : "同意隐私政策"}
          </button>
        )}
        {(status === "tos_pending" || status === "both_pending") && (
          <button onClick={() => consentTos.mutate()} disabled={consentTos.isPending} style={{ ...btn, background: "#2563eb", color: "#fff" }}>
            {consentTos.isPending ? "..." : "同意服务条款"}
          </button>
        )}
        <span style={{ fontSize: 11, color: "#92400e", cursor: "help" }} title="协议更新后需重新确认（合规要求）。同意后腾讯状态实时更新。">[?]</span>
      </div>
    </div>
  );
}
