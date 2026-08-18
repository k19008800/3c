import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, useToast, CopyButton, Pagination } from "@3cloud/shared-ui";

/**
 * 智能客服辅助 + 客服效能 对齐 SPEC-§28/§27
 * Tab1 客服效能(KPI) / Tab2 工单列表 / Tab3 意图识别 / Tab4 自动诊断 / Tab5 测试Key / Tab6 操作审计
 * 数据全部来自真实后端：/admin/support/kpi、/admin/support/tickets。
 */
const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: `1px solid var(--color-border)`, width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };
const HELP: Record<string, string> = {
  kpi: "客服效能指标：工单总量/已解决/进行中、平均响应时长、平均解决时长、满意度（数据来自 tickets 与 chat_messages）。",
  tickets: "客服工单列表：按状态筛选、分页浏览用户工单（编号/用户/标题/状态/优先级/创建时间）。",
  intent: "输入用户问题，系统基于关键词规则识别意图(充值/鉴权/退款等)并推荐回复与动作。命中即转人工。",
  diagnose: "输入用户ID自动诊断：最近调用记录、错误分析(限流/鉴权/上游)、Key状态、余额预警。",
  testkey: "生成24小时有效的临时测试Key(不计费/配额受限)，用于排查用户问题，可撤销。",
  audit: "客服敏感操作审计留痕（余额调整/Key操作/模拟调用等），可追溯。",
};

/* ───────── 状态文案映射 ───────── */
const TICKET_STATUS_LABEL: Record<string, string> = {
  open: "待处理",
  in_progress: "处理中",
  waiting_customer: "等待客户",
  resolved: "已解决",
  closed: "已关闭",
};
const ticketStatusColor = (s: string): "success" | "warning" | "danger" | "info" | "default" => {
  if (s === "resolved" || s === "closed") return "success";
  if (s === "in_progress") return "info";
  if (s === "waiting_customer") return "warning";
  return "danger";
};

/** 秒 → 可读时长 */
function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s <= 0) return "—";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`;
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
}

const PERIOD_OPTIONS = [
  ["today", "今日"],
  ["week", "本周"],
  ["month", "本月"],
  ["year", "今年"],
  ["all", "全部"],
] as const;

export default function AdminSupportPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"kpi" | "tickets" | "intent" | "diagnose" | "testkey" | "audit">("kpi");

  // —— 客服效能指标 ——
  const [period, setPeriod] = useState("month");
  const kpiQ = useQuery({
    queryKey: ["support-kpi", period],
    queryFn: async () => (await api.get<{ data: { kpi: any } }>("/admin/support/kpi", { params: { period } })).data.data.kpi,
    retry: 0,
  });

  // —— 工单列表 ——
  const [ticketStatus, setTicketStatus] = useState("");
  const [ticketPage, setTicketPage] = useState(1);
  const [ticketPageSize, setTicketPageSize] = useState(20);
  const ticketsQ = useQuery({
    queryKey: ["support-tickets", ticketStatus, ticketPage, ticketPageSize],
    queryFn: async () => (await api.get<{ data: { list: any[]; total: number; page: number; pageSize: number } }>("/admin/support/tickets", {
      params: { status: ticketStatus || undefined, page: ticketPage, pageSize: ticketPageSize },
    })).data.data,
    retry: 0,
  });
  const tickets = ticketsQ.data?.list ?? [];

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

  const keysQ = useQuery({ queryKey: ["support-test-keys"], queryFn: async () => (await api.get<{ data: { list: any[] } }>("/admin/support/test-keys")).data.data, retry: 0 });
  const auditQ = useQuery({ queryKey: ["support-audit"], queryFn: async () => (await api.get<{ data: { list: any[] } }>("/admin/support/audit-logs")).data.data, retry: 0 });

  const keys = keysQ.data?.list ?? [];
  const audit = auditQ.data?.list ?? [];

  const intentMut = useMutation({
    mutationFn: async () => (await api.post("/admin/support/assist/intent", { text: intentText })).data,
    onSuccess: (d: any) => setIntentResult(d.data),
    onError: (e: any) => toast.error(extractError(e)),
  });
  const diagMut = useMutation({
    mutationFn: async () => (await api.get(`/admin/support/assist/diagnose/${Number(uid)}`)).data,
    onSuccess: (d: any) => setDiagResult(d.data),
    onError: (e: any) => toast.error(extractError(e)),
  });
  const keyGenMut = useMutation({
    mutationFn: async () => (await api.post("/admin/support/test-key", { associated_user_id: testUserId ? Number(testUserId) : undefined, name: testName })).data,
    onSuccess: (d: any) => { setGenKey(d.data); qc.invalidateQueries({ queryKey: ["support-test-keys"] }); },
    onError: (e: any) => toast.error(extractError(e)),
  });
  const keyRevokeMut = useMutation<any, unknown, number>({
    mutationFn: async (id: number) => (await api.post(`/admin/support/test-key/${id}/revoke`, {})).data,
    onSuccess: () => { toast.success("测试 Key 已撤销"); qc.invalidateQueries({ queryKey: ["support-test-keys"] }); },
    onError: (e: any) => toast.error(extractError(e)),
  });

  const TABS = [
    ["kpi", "客服效能"],
    ["tickets", "工单列表"],
    ["intent", "意图识别"],
    ["diagnose", "自动诊断"],
    ["testkey", "测试Key"],
    ["audit", "操作审计"],
  ] as const;

  const activeHelp = HELP[tab] ?? "";

  const kpi = kpiQ.data;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>
        客服效能
        <HelpIcon text={activeHelp} level="page" />
      </h2>
      <p style={{ color: "#94a3b8", marginTop: 0, fontSize: 13 }}>智能客服辅助与客服效能统计 · SPEC-§28</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...btnBase, background: tab === k ? "var(--color-primary)" : "var(--color-panel)", color: tab === k ? "#fff" : "#475569", border: `1px solid var(--color-border)` }}>{l}</button>
        ))}
      </div>

      {/* 客服效能 KPI */}
      {tab === "kpi" && (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <h4 style={{ margin: 0 }}>客服效能指标</h4>
            {PERIOD_OPTIONS.map(([v, l]) => (
              <button key={v} onClick={() => setPeriod(v)} style={{ ...btnBase, background: period === v ? "var(--color-primary)" : "var(--color-bg)", color: period === v ? "#fff" : "#475569", padding: "4px 12px", fontSize: 12 }}>{l}</button>
            ))}
          </div>
          {kpiQ.isLoading ? <div style={{ color: "#94a3b8" }}>加载中...</div> : kpiQ.isError ? <div style={{ color: "var(--color-danger-text)" }}>加载失败：{extractError(kpiQ.error)}</div> : kpi && (
            <>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                {[
                  ["工单总量", String(kpi.ticket_count ?? 0)],
                  ["已解决", String(kpi.resolved_count ?? 0)],
                  ["进行中", String(kpi.open_count ?? 0)],
                  ["平均响应", fmtDuration(kpi.avg_response)],
                  ["平均解决", fmtDuration(kpi.avg_resolve)],
                  ["满意度", kpi.satisfaction ? `${Number(kpi.satisfaction).toFixed(1)}/5` : "—"],
                  ["在线会话", `${kpi.open_chat_count ?? 0}/${kpi.chat_count ?? 0}`],
                ].map(([l, v]) => (
                  <div key={l as string} style={{ padding: "12px 18px", background: "var(--color-bg)", borderRadius: 8, minWidth: 120 }}>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{l}</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                平均响应 = 用户消息到客服首次回复的间隔均值（chat_messages）；平均解决 = 工单创建到解决时长均值；满意度 = 工单 metadata.satisfaction（0-5）。
              </div>
            </>
          )}
        </div>
      )}

      {/* 工单列表 */}
      {tab === "tickets" && (
        <div style={card}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <h4 style={{ margin: 0 }}>客服工单</h4>
            <select value={ticketStatus} onChange={(e) => { setTicketStatus(e.target.value); setTicketPage(1); }} style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid var(--color-border)`, fontSize: 13 }}>
              <option value="">全部状态</option>
              {Object.entries(TICKET_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          {ticketsQ.isLoading ? <div style={{ color: "#94a3b8" }}>加载中...</div> : ticketsQ.isError ? <div style={{ color: "var(--color-danger-text)" }}>加载失败：{extractError(ticketsQ.error)}</div> : tickets.length === 0 ? (
            <div style={{ color: "#94a3b8" }}>暂无工单</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>ID</th><th style={{ padding: "8px" }}>用户</th><th style={{ padding: "8px" }}>标题</th><th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>优先级</th><th style={{ padding: "8px" }}>创建时间</th>
              </tr></thead>
              <tbody>
                {tickets.map((t: any) => (
                  <tr key={t.id} style={{ borderTop: `1px solid var(--color-border)` }}>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>#{t.id}</td>
                    <td style={{ padding: "8px" }}>{t.user?.name ?? t.user?.email ?? `用户 #${t.user_id}`}</td>
                    <td style={{ padding: "8px", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</td>
                    <td style={{ padding: "8px" }}><StatusBadge status={ticketStatusColor(t.status)}>{TICKET_STATUS_LABEL[t.status] ?? t.status}</StatusBadge></td>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>{t.priority ?? "normal"}</td>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>{t.created_at ? new Date(t.created_at).toLocaleString("zh-CN") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {ticketsQ.data && (
            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
              <Pagination
                current={ticketPage}
                total={ticketsQ.data.total}
                pageSize={ticketPageSize}
                onChange={(p, size) => { setTicketPage(p); setTicketPageSize(size); }}
              />
            </div>
          )}
        </div>
      )}

      {/* Intent */}
      {tab === "intent" && (
        <div style={card}>
          <h4 style={{ margin: "0 0 12px" }}>用户意图识别</h4>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={intentText} onChange={(e) => setIntentText(e.target.value)} placeholder="输入用户问题文本..." style={inp} />
            <button onClick={() => intentMut.mutate()} disabled={!intentText} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff", alignSelf: "flex-start" }}>识别</button>
          </div>
          {intentResult && (
            <div style={{ marginTop: 16, padding: 12, background: "var(--color-bg)", borderRadius: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                意图: {intentResult.intent ?? "未知"} <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>置信度 {(intentResult.confidence * 100).toFixed(0)}%</span>
              </div>
              {intentResult.matched_keywords?.length > 0 && <div style={{ color: "var(--color-text-secondary)", fontSize: 13, marginTop: 4 }}>命中关键词: {intentResult.matched_keywords.join("、")}</div>}
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
            <button onClick={() => diagMut.mutate()} disabled={!uid} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff", alignSelf: "flex-start" }}>诊断</button>
          </div>
          {diagResult && (
            <div style={{ marginTop: 16 }}>
              {diagResult.user && (
                <div style={{ padding: 12, background: "var(--color-bg)", borderRadius: 8, marginBottom: 12 }}>
                  <strong>{diagResult.user.username} ({diagResult.user.email})</strong>
                  <div style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>余额: ¥{diagResult.user.balance} · 状态: {diagResult.user.status}</div>
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
                    <thead><tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}><th style={{ padding: "4px" }}>模型</th><th style={{ padding: "4px" }}>状态</th><th style={{ padding: "4px" }}>延迟</th><th style={{ padding: "4px" }}>错误</th></tr></thead>
                    <tbody>
                      {diagResult.recent_calls.slice(0, 8).map((c: any, i: number) => (
                        <tr key={i} style={{ borderTop: `1px solid var(--color-border)` }}>
                          <td style={{ padding: "4px" }}>{c.model_name ?? c.upstream_model}</td>
                          <td style={{ padding: "4px" }}>
                            <StatusBadge status={c.status === "success" ? "success" : "danger"}>{c.status}</StatusBadge>
                          </td>
                          <td style={{ padding: "4px" }}>{c.latency_ms ?? "—"}ms</td>
                          <td style={{ padding: "4px", color: "var(--color-text-secondary)" }}>{c.error_code ?? ""}</td>
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
              <button onClick={() => keyGenMut.mutate()} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff", alignSelf: "flex-start" }}>生成</button>
            </div>
            {genKey && (
              <div style={{ marginTop: 12, padding: 12, background: "#1e293b", color: "#e2e8f0", borderRadius: 8, fontFamily: "monospace", wordBreak: "break-all" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{genKey.key}</span>
                  <CopyButton text={genKey.key} label="复制 Key" />
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>有效期至: {genKey.expires_at ? new Date(genKey.expires_at).toLocaleString() : "—"} · 额度: {genKey.token_limit} tokens / ¥{genKey.cost_limit}</div>
              </div>
            )}
          </div>
          <div style={card}>
            <h4 style={{ margin: "0 0 12px" }}>我的测试 Key</h4>
            {keys.length === 0 ? <div style={{ color: "#94a3b8" }}>暂无测试 Key</div> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                  <th style={{ padding: "8px" }}>前缀</th><th style={{ padding: "8px" }}>名称</th><th style={{ padding: "8px" }}>已用</th><th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>过期</th><th style={{ padding: "8px" }}>操作</th>
                </tr></thead>
                <tbody>
                  {keys.map((k: any) => (
                    <tr key={k.id} style={{ borderTop: `1px solid var(--color-border)` }}>
                      <td style={{ padding: "8px", fontFamily: "monospace" }}>{k.key_prefix}...</td>
                      <td style={{ padding: "8px" }}>{k.name}</td>
                      <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>{k.used_tokens}/{k.token_limit} tok</td>
                      <td style={{ padding: "8px" }}>
                        <StatusBadge status={k.status === "active" ? "success" : "danger"}>{k.status}</StatusBadge>
                      </td>
                      <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>{k.expires_at ? new Date(k.expires_at).toLocaleDateString() : "—"}</td>
                      <td style={{ padding: "8px" }}>{k.status === "active" && <button onClick={() => keyRevokeMut.mutate(k.id)} style={{ ...btnBase, background: "var(--color-danger-bg)", color: "var(--color-danger-text)", padding: "4px 10px" }}>撤销</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Audit */}
      {tab === "audit" && (
        <div style={card}>
          <h4 style={{ margin: "0 0 12px" }}>客服操作审计</h4>
          {audit.length === 0 ? <div style={{ color: "#94a3b8" }}>暂无操作记录</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>时间</th><th style={{ padding: "8px" }}>操作者</th><th style={{ padding: "8px" }}>操作类型</th><th style={{ padding: "8px" }}>详情</th>
              </tr></thead>
              <tbody>
                {audit.map((o: any) => (
                  <tr key={o.id} style={{ borderTop: `1px solid var(--color-border)` }}>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>{o.created_at ? new Date(o.created_at).toLocaleString() : "—"}</td>
                    <td style={{ padding: "8px" }}>{o.username ?? o.user_id}</td>
                    <td style={{ padding: "8px", fontWeight: 600 }}>{o.action}</td>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>{o.detail ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
