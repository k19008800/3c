import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

/**
 * 智能客服辅助 + 测试工具 对齐 SPEC-§28/§27
 * Tab1 意图识别 / Tab2 自动诊断 / Tab3 测试Key / Tab4 绩效统计 / Tab5 操作审计
 */
const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };
const icon = { cursor: "pointer", color: "#64748b", fontSize: 14, marginLeft: 8 } as const;
const HELP: Record<string, string> = {
  intent: "输入用户问题，系统基于关键词规则识别意图(充值/鉴权/退款等)并推荐回复与动作。命中即转人工。",
  diagnose: "输入用户ID自动诊断：最近调用记录、错误分析(限流/鉴权/上游)、Key状态、余额预警。",
  testkey: "生成24小时有效的临时测试Key(不计费/配额受限)，用于排查用户问题，可撤销。",
  stats: "客服团队绩效量化：工单/会话处理量、满意度、响应时间。",
  audit: "客服敏感操作审计留痕（余额调整/Key操作/模拟调用等），可追溯。",
};

export default function AdminSupportPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"intent" | "diagnose" | "testkey" | "stats" | "audit">("intent");
  const [help, setHelp] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // 意图识别
  const [intentText, setIntentText] = useState("");
  const [intentResult, setIntentResult] = useState<any>(null);
  // 诊断
  const [uid, setUid] = useState("");
  const [diagResult, setDiagResult] = useState<any>(null);
  // 测试Key
  const [testName, setTestName] = useState("");
  const [testUserId, setTestUserId] = useState("");
  const [genKey, setGenKey] = useState<any>(null);

  const keysQ = useQuery({ queryKey: ["support-test-keys"], queryFn: async () => (await api.get<{ data: { list: any[] } }>("/admin/support/test-keys")).data.data });
  const statsQ = useQuery({ queryKey: ["support-stats"], queryFn: async () => (await api.get<{ data: any }>("/admin/support/stats?period=month")).data.data });
  const auditQ = useQuery({ queryKey: ["support-audit"], queryFn: async () => (await api.get<{ data: { list: any[] } }>("/admin/support/audit-logs")).data.data });

  const intentMut = useMutation({
    mutationFn: async () => (await api.post("/admin/support/assist/intent", { text: intentText })).data,
    onSuccess: (d: any) => setIntentResult(d.data),
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const diagMut = useMutation({
    mutationFn: async () => (await api.get(`/admin/support/assist/diagnose/${Number(uid)}`)).data,
    onSuccess: (d: any) => setDiagResult(d.data),
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const keyGenMut = useMutation({
    mutationFn: async () => (await api.post("/admin/support/test-key", { associated_user_id: testUserId ? Number(testUserId) : undefined, name: testName })).data,
    onSuccess: (d: any) => { setGenKey(d.data); qc.invalidateQueries({ queryKey: ["support-test-keys"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const keyRevokeMut = useMutation({
    mutationFn: async (id: number) => (await api.post(`/admin/support/test-key/${id}/revoke`, {})).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-test-keys"] }),
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const TABS = [["intent", "意图识别"], ["diagnose", "自动诊断"], ["testkey", "测试Key"], ["stats", "绩效统计"], ["audit", "操作审计"]] as const;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>客服效能 <span onClick={() => setHelp(HELP[tab] ?? null)} style={icon} title="帮助">[?]</span></h2>
      <p style={{ color: "#94a3b8", marginTop: 0, fontSize: 13 }}>智能客服辅助与测试工具 · SPEC-§28</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...btnBase, background: tab === k ? "#2563eb" : "#fff", color: tab === k ? "#fff" : "#475569", border: "1px solid #cbd5e1" }}>{l}</button>
        ))}
      </div>

      {/* Intent */}
      {tab === "intent" && (
        <div style={card}>
          <h4 style={{ margin: "0 0 12px" }}>用户意图识别</h4>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={intentText} onChange={(e) => setIntentText(e.target.value)} placeholder="输入用户问题文本..." style={inp} />
            <button onClick={() => intentMut.mutate()} disabled={!intentText} style={{ ...btnBase, background: "#2563eb", color: "#fff", alignSelf: "flex-start" }}>识别</button>
          </div>
          {intentResult && (
            <div style={{ marginTop: 16, padding: 12, background: "#f8fafc", borderRadius: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                意图: {intentResult.intent ?? "未知"} <span style={{ color: "#64748b", fontSize: 13 }}>置信度 {(intentResult.confidence * 100).toFixed(0)}%</span>
              </div>
              {intentResult.matched_keywords?.length > 0 && <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>命中关键词: {intentResult.matched_keywords.join("、")}</div>}
              {intentResult.reply && <div style={{ marginTop: 8, padding: 10, background: "#eef2ff", borderRadius: 6, fontSize: 14 }}>💡 推荐回复: {intentResult.reply}</div>}
              {(intentResult.suggested_actions ?? []).map((a: any, i: number) => (
                <div key={i} style={{ marginTop: 6, fontSize: 13, color: "#1e40af" }}>📌 {a.label} <span style={{ color: "#94a3b8" }}>({a.action})</span></div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Diagnose */}
      {tab === "diagnose" && (
        <div style={card}>
          <h4 style={{ margin: "0 0 12px" }}>用户自动诊断</h4>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={uid} onChange={(e) => setUid(e.target.value)} placeholder="用户 ID" type="number" style={inp} />
            <button onClick={() => diagMut.mutate()} disabled={!uid} style={{ ...btnBase, background: "#2563eb", color: "#fff", alignSelf: "flex-start" }}>诊断</button>
          </div>
          {diagResult && (
            <div style={{ marginTop: 16 }}>
              {diagResult.user && (
                <div style={{ padding: 12, background: "#f8fafc", borderRadius: 8, marginBottom: 12 }}>
                  <strong>{diagResult.user.username} ({diagResult.user.email})</strong>
                  <div style={{ color: "#64748b", fontSize: 13 }}>余额: ¥{diagResult.user.balance} · 状态: {diagResult.user.status}</div>
                  {diagResult.balance_warning && <div style={{ color: "#d97706", fontWeight: 600, marginTop: 4 }}>⚠ {diagResult.balance_warning.note}</div>}
                </div>
              )}
              {diagResult.analysis && (
                <div style={{ padding: 12, background: "#eef2ff", borderRadius: 8, marginBottom: 12 }}>
                  <strong>🔍 分析结果</strong>
                  <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>
                    调用 {diagResult.analysis.total_calls} 次 · 成功 {diagResult.analysis.success_count} · 失败 {diagResult.analysis.failed_count} · 成功率 {diagResult.analysis.success_rate}% · 平均延迟 {diagResult.analysis.avg_latency_ms}ms
                  </div>
                  <div style={{ fontSize: 13, color: "#1e40af", marginTop: 4 }}>💡 {diagResult.analysis.suggestion}</div>
                </div>
              )}
              {(diagResult.recent_calls ?? []).length > 0 && (
                <div>
                  <strong style={{ fontSize: 13 }}>最近调用</strong>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 8 }}>
                    <thead><tr style={{ color: "#64748b", textAlign: "left" }}><th style={{ padding: "4px" }}>模型</th><th style={{ padding: "4px" }}>状态</th><th style={{ padding: "4px" }}>延迟</th><th style={{ padding: "4px" }}>错误</th></tr></thead>
                    <tbody>
                      {diagResult.recent_calls.slice(0, 8).map((c: any, i: number) => (
                        <tr key={i} style={{ borderTop: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "4px" }}>{c.model_name ?? c.upstream_model}</td>
                          <td style={{ padding: "4px", color: c.status === "success" ? "#16a34a" : "#dc2626" }}>{c.status}</td>
                          <td style={{ padding: "4px" }}>{c.latency_ms ?? "—"}ms</td>
                          <td style={{ padding: "4px", color: "#64748b" }}>{c.error_code ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TestKey */}
      {tab === "testkey" && (
        <div>
          <div style={{ ...card, marginBottom: 16 }}>
            <h4 style={{ margin: "0 0 12px" }}>生成临时测试 Key（24h 有效，不计费）</h4>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input value={testName} onChange={(e) => setTestName(e.target.value)} placeholder="名称(可选)" style={{ ...inp, width: 200, marginBottom: 0 }} />
              <input value={testUserId} onChange={(e) => setTestUserId(e.target.value)} placeholder="关联用户ID(排查对象)" type="number" style={{ ...inp, width: 180, marginBottom: 0 }} />
              <button onClick={() => keyGenMut.mutate()} style={{ ...btnBase, background: "#2563eb", color: "#fff", alignSelf: "flex-start" }}>生成</button>
            </div>
            {genKey && (
              <div style={{ marginTop: 12, padding: 12, background: "#1e293b", color: "#e2e8f0", borderRadius: 8, fontFamily: "monospace", wordBreak: "break-all" }}>
                <div>{genKey.key}</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>有效期至: {new Date(genKey.expires_at).toLocaleString()} · 额度: {genKey.token_limit} tokens / ¥{genKey.cost_limit}</div>
              </div>
            )}
          </div>
          <div style={card}>
            <h4 style={{ margin: "0 0 12px" }}>我的测试 Key</h4>
            {(keysQ.data?.list ?? []).length === 0 ? <div style={{ color: "#94a3b8" }}>暂无测试 Key</div> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ color: "#64748b", textAlign: "left" }}>
                  <th style={{ padding: "8px" }}>前缀</th><th style={{ padding: "8px" }}>名称</th><th style={{ padding: "8px" }}>已用</th><th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>过期</th><th style={{ padding: "8px" }}>操作</th>
                </tr></thead>
                <tbody>
                  {(keysQ.data?.list ?? []).map((k) => (
                    <tr key={k.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px", fontFamily: "monospace" }}>{k.key_prefix}...</td>
                      <td style={{ padding: "8px" }}>{k.name}</td>
                      <td style={{ padding: "8px", color: "#64748b" }}>{k.used_tokens}/{k.token_limit} tok</td>
                      <td style={{ padding: "8px" }}><span style={{ color: k.status === "active" ? "#16a34a" : "#dc2626" }}>{k.status}</span></td>
                      <td style={{ padding: "8px", color: "#64748b" }}>{k.expires_at ? new Date(k.expires_at).toLocaleDateString() : "—"}</td>
                      <td style={{ padding: "8px" }}>{k.status === "active" && <button onClick={() => keyRevokeMut.mutate(k.id)} style={{ ...btnBase, background: "#fee2e2", color: "#dc2626", padding: "4px 10px" }}>撤销</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      {tab === "stats" && (
        <div style={card}>
          <h4 style={{ margin: "0 0 16px" }}>客服团队绩效</h4>
          {!statsQ.data ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (
            <>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                {[["工单处理", statsQ.data.team_overview.tickets], ["在线会话", statsQ.data.team_overview.chat_sessions], ["平均响应", `${Math.floor(statsQ.data.team_overview.avg_response_seconds / 3600)}h`], ["满意度", `${(statsQ.data.team_overview.satisfaction || 0).toFixed(1)}/5`]].map(([l, v]) => (
                  <div key={l as string} style={{ padding: "12px 18px", background: "#f8fafc", borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{l}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{v}</div>
                  </div>
                ))}
              </div>
              <strong style={{ fontSize: 13 }}>客服排名</strong>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
                <thead><tr style={{ color: "#64748b", textAlign: "left" }}><th style={{ padding: "6px" }}>客服</th><th style={{ padding: "6px" }}>工单</th><th style={{ padding: "6px" }}>会话数</th><th style={{ padding: "6px" }}>满意度</th></tr></thead>
                <tbody>
                  {(statsQ.data.staff_ranking ?? []).map((s: any) => (
                    <tr key={s.username} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "6px", fontWeight: 600 }}>{s.username}</td>
                      <td style={{ padding: "6px" }}>{s.tickets}</td>
                      <td style={{ padding: "6px" }}>{s.chat_messages}</td>
                      <td style={{ padding: "6px" }}>{(s.satisfaction || 0).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* Audit */}
      {tab === "audit" && (
        <div style={card}>
          <h4 style={{ margin: "0 0 12px" }}>客服操作审计</h4>
          {(auditQ.data?.list ?? []).length === 0 ? <div style={{ color: "#94a3b8" }}>暂无操作记录</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>时间</th><th style={{ padding: "8px" }}>操作者</th><th style={{ padding: "8px" }}>操作类型</th><th style={{ padding: "8px" }}>详情</th>
              </tr></thead>
              <tbody>
                {(auditQ.data?.list ?? []).map((o: any) => (
                  <tr key={o.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px", color: "#64748b" }}>{o.created_at ? new Date(o.created_at).toLocaleString() : "—"}</td>
                    <td style={{ padding: "8px" }}>{o.username ?? o.user_id}</td>
                    <td style={{ padding: "8px", fontWeight: 600 }}>{o.action}</td>
                    <td style={{ padding: "8px", color: "#64748b" }}>{o.detail ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {help && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }} onClick={() => setHelp(null)}>
          <div style={{ ...card, width: 460 }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ margin: "0 0 8px" }}>帮助</h4><p style={{ color: "#475569", lineHeight: 1.7, margin: 0 }}>{help}</p>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}><button onClick={() => setHelp(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>关闭</button></div>
          </div>
        </div>
      )}

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 3000, padding: "12px 20px", borderRadius: 8, color: "#fff", background: notice.type === "success" ? "#16a34a" : "#dc2626" }}>
          {notice.msg}<button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}
