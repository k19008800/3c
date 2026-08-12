import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader, Panel, Tag, Modal, HelpIcon, useToast } from "@3cloud/shared-ui";
import { api, extractError } from "../lib/api";

/**
 * 额度管理（限流配额例外）— 对齐原型 admin-credit.html + PRD §3
 *
 * 定位：在全局 RPM/TPM 统一规则下，为被选定的特殊客户按「客户 × 模型」开通限流例外。
 * 页面不展示全量用户，先搜索定位客户再逐模型配置。不含货币授信/消费风控金额字段。
 *
 * 生效值解析（三级，逐级收紧）：
 *   生效值 = min( ③该客户在此模型的例外值 ?? ②该客户企业/个人默认,
 *                ①该模型的全局硬顶 )
 *
 * 数据源：/admin/credit/meta（默认值 + 模型硬顶）、/admin/credit/customers（搜索）、
 *        /admin/credit/rules（例外规则，含历史）；限流默认值来自 /admin/settings/rate-limit。
 */

/* ───────── 类型 ───────── */
type CustType = "enterprise" | "personal";
interface Model {
  name: string; vendor: string | null;
  capRpm: number | null; capTpm: number | null;
  baseRpm: number | null; baseTpm: number | null;
}
interface Customer { id: number; email: string; name: string; type: CustType; activeRuleCount?: number; }
interface Defaults { enterprise: { rpm: number; tpm: number }; personal: { rpm: number; tpm: number }; }
type RulePeriod = "forever" | "range";
type RuleStatus = "active" | "stopped";
interface Rule {
  id: number; customerId: number; model: string;
  rpm: number | null; tpm: number | null;
  period: RulePeriod; start: string | null; end: string | null;
  status: RuleStatus; reason: string; updatedAt: string;
  history?: HistEntry[];
}
type HistOp = "开通" | "编辑" | "停用" | "启用";
interface HistEntry { t: string; op: HistOp; who: string; note: string; }

const EMPTY_DEFAULTS: Defaults = { enterprise: { rpm: 0, tpm: 0 }, personal: { rpm: 0, tpm: 0 } };

/* ───────── 格式化工具 ───────── */
function fmtRPM(n: number | null | undefined): string { return n == null ? "—" : n.toLocaleString("zh-CN"); }
function fmtTPM(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000 && n % 1_000_000 === 0) return `${n / 1_000_000}M`;
  if (n >= 1_000 && n % 1_000 === 0) return `${n / 1_000}K`;
  return n.toLocaleString("zh-CN");
}
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* 生效值解析：客户例外 ?? 默认 → 模型硬顶 */
interface Effective {
  rpm: number; tpm: number | null; src: string; rule: Rule | null;
  baseRpm: number; baseTpm: number | null; rawRpm: number; rawTpm: number | null; trunc: boolean;
}
function ruleStatus(r: Rule): "active" | "stopped" | "expired" {
  if (r.period === "range" && r.end && r.end < todayStr()) return "expired";
  return r.status;
}
function effective(cust: Customer, mName: string, rules: Rule[], models: Model[], defaults: Defaults): Effective {
  const m = models.find((x) => x.name === mName)!;
  const baseRpm = m.baseRpm != null ? m.baseRpm : defaults[cust.type].rpm;
  // 部分模型按次计费（如 midjourney-v6），无 TPM 维度
  const tpmApplies = m.capTpm != null || m.baseTpm != null;
  const baseTpm: number | null = tpmApplies ? (m.baseTpm != null ? m.baseTpm : defaults[cust.type].tpm) : null;
  // 保留该客户在此模型上的规则（含已停用/已过期），便于行内显示启停入口
  const rule = rules.find((r) => r.customerId === cust.id && r.model === mName) ?? null;
  const isActive = rule ? ruleStatus(rule) === "active" : false;
  const rawRpm = isActive && rule!.rpm != null ? rule!.rpm : baseRpm;
  const rawTpm = isActive && rule!.tpm != null ? rule!.tpm : baseTpm;
  const rpm = m.capRpm ? Math.min(rawRpm, m.capRpm) : rawRpm;
  const tpm = tpmApplies && m.capTpm && rawTpm != null ? Math.min(rawTpm, m.capTpm) : tpmApplies ? rawTpm : null;
  const src = isActive ? "例外" : m.baseRpm != null ? "默认(多模态)" : "默认";
  const trunc = isActive && (rawRpm > rpm || (rawTpm != null && tpm != null && rawTpm > tpm));
  return { rpm, tpm, src, rule, baseRpm, baseTpm, rawRpm, rawTpm, trunc };
}

/* ───────── 主组件 ───────── */
type View = "empty" | "results" | "cust";

export default function AdminCreditPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [view, setView] = useState<View>("empty");
  const [searchInput, setSearchInput] = useState("");
  const [searchType, setSearchType] = useState("");
  const [keyword, setKeyword] = useState("");
  const [didSearch, setDidSearch] = useState(false);
  const [currentCust, setCurrentCust] = useState<Customer | null>(null);
  const [custMap, setCustMap] = useState<Record<number, Customer>>({});

  // 设置额度弹窗
  const [qmOpen, setQmOpen] = useState(false);
  const [editRuleId, setEditRuleId] = useState<number | null>(null);
  const [qRpm, setQRpm] = useState("");
  const [qTpm, setQTpm] = useState("");
  const [qReason, setQReason] = useState("");
  const [qPeriod, setQPeriod] = useState<RulePeriod>("forever");
  const [qStart, setQStart] = useState("");
  const [qEnd, setQEnd] = useState("");
  const [selModels, setSelModels] = useState<Set<string>>(new Set());

  // 历史记录弹窗
  const [histRuleId, setHistRuleId] = useState<number | null>(null);

  /* ── 数据：meta（默认值 + 模型硬顶） ── */
  const metaQ = useQuery({
    queryKey: ["admin-credit-meta"],
    queryFn: async () => {
      const res = await api.get("/admin/credit/meta");
      return res.data.data as { defaults: Defaults; models: Model[] };
    },
  });
  const defaults = metaQ.data?.defaults ?? EMPTY_DEFAULTS;
  const models: Model[] = metaQ.data?.models ?? [];

  /* ── 数据：客户搜索 ── */
  const customersQ = useQuery({
    queryKey: ["admin-credit-customers", keyword, searchType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (keyword) params.set("kw", keyword);
      if (searchType) params.set("type", searchType);
      const res = await api.get(`/admin/credit/customers?${params.toString()}`);
      return res.data.data as Customer[];
    },
    enabled: didSearch,
  });
  const results: Customer[] = customersQ.data ?? [];

  /* ── 数据：当前客户例外规则 ── */
  const rulesQ = useQuery({
    queryKey: ["admin-credit-rules", currentCust?.id],
    queryFn: async () => {
      const res = await api.get(`/admin/credit/rules?customer_id=${currentCust!.id}`);
      return res.data.data as Rule[];
    },
    enabled: !!currentCust,
  });
  const rules: Rule[] = rulesQ.data ?? [];

  /* 历史按规则 id 聚合（后端已内嵌 history） */
  const hist = useMemo(() => {
    const m: Record<number, HistEntry[]> = {};
    for (const r of rules) m[r.id] = r.history ?? [];
    return m;
  }, [rules]);

  /* 快捷入口：已设例外客户（去重，从规则反查客户缓存） */
  const quickChips = useMemo(() => {
    const ids: number[] = [];
    for (const r of rules) {
      if (ruleStatus(r) !== "active") continue;
      if (!ids.includes(r.customerId)) ids.push(r.customerId);
    }
    return ids.map((id) => custMap[id]).filter(Boolean) as Customer[];
  }, [rules, custMap]);

  /* 规则中的客户未在缓存时，按 id 拉取补全（供快捷入口展示） */
  useEffect(() => {
    const ids = [...new Set(rules.map((r) => r.customerId))].filter((id) => !custMap[id]);
    if (!ids.length) return;
    let cancelled = false;
    Promise.all(
      ids.map((id) => api.get(`/admin/credit/customers/${id}`).then((r) => r.data.data as Customer)),
    )
      .then((list) => {
        if (cancelled) return;
        setCustMap((prev) => {
          const nx = { ...prev };
          for (const c of list) nx[c.id] = c;
          return nx;
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [rules, custMap]);

  /* 从详情页「编辑额度」跳转而来时（?customer=<id>），自动定位到该客户额度视图 */
  useEffect(() => {
    const raw = searchParams.get("customer");
    if (!raw) return;
    const cid = parseInt(raw, 10);
    if (!Number.isInteger(cid)) return;
    api.get(`/admin/credit/customers/${cid}`).then((r) => {
      const c = r.data.data as Customer;
      setCustMap((prev) => ({ ...prev, [c.id]: c }));
      setCurrentCust(c);
      setView("cust");
    }).catch((err) => toast.error(extractError(err)));
  }, [searchParams, toast]);

  const doSearch = () => {
    setKeyword(searchInput.trim());
    setDidSearch(true);
    setView("results");
  };

  const activeRuleCount = (customerId: number) => rules.filter((r) => r.customerId === customerId && ruleStatus(r) === "active").length;

  const selectCust = (c: Customer) => {
    setCurrentCust(c);
    setCustMap((prev) => (prev[c.id] ? prev : { ...prev, [c.id]: c }));
    setView("cust");
  };

  const resetSearch = () => {
    setCurrentCust(null);
    setSearchInput("");
    setKeyword("");
    setDidSearch(false);
    setView("empty");
  };

  /* ── Mutations ── */
  const invalidateRules = () => {
    if (currentCust) qc.invalidateQueries({ queryKey: ["admin-credit-rules", currentCust.id] });
  };

  const saveQuotaMutation = useMutation({
    mutationFn: async (payload: { customerId: number; models: Array<{ model: string; rpm: number | null; tpm: number | null }>; period: RulePeriod; start: string; end: string; reason: string }) => {
      if (editRuleId) {
        await api.patch(`/admin/credit/rules/${editRuleId}`, {
          rpm: payload.models[0]?.rpm ?? null,
          tpm: payload.models[0]?.tpm ?? null,
          period: payload.period,
          start: payload.start,
          end: payload.end,
          reason: payload.reason,
        });
      } else {
        await api.post("/admin/credit/rules", payload);
      }
    },
    onSuccess: () => {
      invalidateRules();
      qc.invalidateQueries({ queryKey: ["admin-credit-customers"] });
      closeQuota();
      if (editRuleId) toast.success("额度已更新");
      else toast.success(`已为 ${selModels.size} 个模型开通例外`);
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async ({ id, target }: { id: number; target: RuleStatus }) => {
      await api.post(`/admin/credit/rules/${id}/toggle`, {});
    },
    onSuccess: (_data, vars) => {
      invalidateRules();
      toast.info(vars.target === "active" ? "已停用，恢复默认限流" : "已重新启用");
    },
    onError: (err) => toast.error(extractError(err)),
  });

  /* ── 设置额度弹窗 ── */
  const openQuota = (ruleId: number | null, modelName?: string) => {
    setEditRuleId(ruleId);
    setQRpm("");
    setQTpm("");
    setQReason("");
    setQPeriod("forever");
    setQStart("");
    setQEnd("");
    let initial: string[] = modelName ? [modelName] : [];
    if (ruleId) {
      const r = rules.find((x) => x.id === ruleId);
      if (r) {
        initial = [r.model];
        setQRpm(r.rpm != null ? String(r.rpm) : "");
        setQTpm(r.tpm != null ? String(r.tpm) : "");
        setQReason(r.reason);
        if (r.period === "range") {
          setQPeriod("range");
          setQStart(r.start ?? "");
          setQEnd(r.end ?? "");
        }
      }
    }
    setSelModels(new Set(initial));
    setQmOpen(true);
  };
  const closeQuota = () => setQmOpen(false);

  const toggleModel = (name: string) => {
    setSelModels((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  /* 截断预警（弹窗内实时） */
  const capNote = useMemo(() => {
    const c = currentCust;
    const lines: ReactNode[] = [];
    if (c) {
      const rpmRaw = qRpm === "" ? null : parseFloat(qRpm);
      const tpmRaw = qTpm === "" ? null : parseFloat(qTpm);
      selModels.forEach((name) => {
        const m = models.find((x) => x.name === name);
        if (!m) return;
        if (m.capRpm && rpmRaw != null && rpmRaw > m.capRpm)
          lines.push(<span key={`${name}-r`}>⚠ RPM {fmtRPM(rpmRaw)} 超过 <b>{name}</b> 全局限流 {fmtRPM(m.capRpm)}，实际生效值将被截断为 {fmtRPM(m.capRpm)}</span>);
        if (m.capTpm && tpmRaw != null && tpmRaw > m.capTpm)
          lines.push(<span key={`${name}-t`}>⚠ TPM {fmtTPM(tpmRaw)} 超过 <b>{name}</b> 全局限流 {fmtTPM(m.capTpm)}，实际生效值将被截断为 {fmtTPM(m.capTpm)}</span>);
      });
    }
    return lines;
  }, [selModels, qRpm, qTpm, currentCust, models]);

  const saveQuota = () => {
    if (!currentCust) { toast.error("请先搜索并选择客户"); return; }
    const modelList = [...selModels];
    const reason = qReason.trim();
    if (modelList.length === 0) { toast.error("请至少选择一个模型"); return; }
    const rpmVal = qRpm === "" ? null : parseInt(qRpm, 10);
    const tpmVal = qTpm === "" ? null : parseInt(qTpm, 10);
    if (rpmVal == null && tpmVal == null) { toast.error("请至少填写 RPM 或 TPM（留空为沿用默认）"); return; }
    if (!reason) { toast.error("请填写原因备注（必填）"); return; }
    if (qPeriod === "range" && (!qStart || !qEnd)) { toast.error("请选择生效起止日期"); return; }
    if (qPeriod === "range" && qStart > qEnd) { toast.error("开始日期不能晚于结束日期"); return; }

    saveQuotaMutation.mutate({
      customerId: currentCust.id,
      models: modelList.map((m) => ({ model: m, rpm: rpmVal, tpm: tpmVal })),
      period: qPeriod,
      start: qPeriod === "range" ? qStart : "",
      end: qPeriod === "range" ? qEnd : "",
      reason,
    });
  };

  /* 停用/启用 */
  const toggleRule = (id: number) => {
    const r = rules.find((x) => x.id === id);
    if (!r) return;
    const target = r.status === "active" ? "stopped" as const : "active" as const;
    if (target === "stopped" && !window.confirm("确定停用该客户的此模型例外吗？停用后立即恢复该客户默认限流。")) return;
    if (target === "active" && !window.confirm("确定重新启用该例外规则吗？")) return;
    toggleRuleMutation.mutate({ id, target });
  };

  const openHist = (id: number) => setHistRuleId(id);
  const closeHist = () => setHistRuleId(null);
  const histRule = histRuleId ? rules.find((r) => r.id === histRuleId) : null;
  const histCust = histRule ? (custMap[histRule.customerId] ?? currentCust) : null;

  const modelOpt = (m: Model) => {
    const sel = selModels.has(m.name);
    const capTxt = m.capTpm ? `顶 RPM ${fmtRPM(m.capRpm)} / TPM ${fmtTPM(m.capTpm)}` : `顶 RPM ${fmtRPM(m.capRpm)}（按次计费）`;
    return (
      <div key={m.name} className={`c3-model-opt${sel ? " c3-sel" : ""}`} onClick={() => toggleModel(m.name)}>
        <input type="checkbox" checked={sel} readOnly />
        <div>
          <div className="c3-mo-name">{m.name}</div>
          <div className="c3-mo-cap">{capTxt}</div>
        </div>
      </div>
    );
  };

  return (
    <>
      <PageHeader title="额度管理" help="在全局 RPM/TPM 统一规则下，为选定的特殊客户按「客户 × 模型」开通限流例外。生效值 = min(客户例外 ?? 企业/个人默认, 模型全局限流)。例外仅作用于选定客户。" />

      {/* 全局默认值摘要（只读） */}
      <Panel>
        <div className="c3-default-strip">
          <span className="c3-ds-title">🌐 全局限流默认值 <HelpIcon text="企业/个人客户的默认 RPM/TPM 基线，未设例外的客户按此生效；最终受模型全局限流硬顶约束。" level="page" /></span>
          <span className="c3-ds-chip"><b>{fmtRPM(defaults.enterprise.rpm)}</b><span>企业 RPM</span></span>
          <span className="c3-ds-chip"><b>{fmtTPM(defaults.enterprise.tpm)}</b><span>企业 TPM</span></span>
          <span className="c3-ds-chip"><b>{fmtRPM(defaults.personal.rpm)}</b><span>个人 RPM</span></span>
          <span className="c3-ds-chip"><b>{fmtTPM(defaults.personal.tpm)}</b><span>个人 TPM</span></span>
          <span className="c3-ds-note">未设例外的客户按此生效 · 最终受模型全局限流约束</span>
          <button type="button" className="c3-btn c3-btn--text c3-ds-link" onClick={() => navigate("/admin/config/rate-limit")}>
            去「限流设置」修改 →
          </button>
        </div>
      </Panel>

      {/* 搜索定位区 */}
      <Panel>
        <div className="c3-search-panel">
          <div className="c3-search-row">
            <input
              className="c3-search-input"
              type="text"
              placeholder="输入客户邮箱搜索，如 techcorp"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
            />
            <button type="button" className="c3-btn c3-btn--primary" onClick={doSearch}>🔍 搜索</button>
            <select className="c3-search-type" value={searchType} onChange={(e) => setSearchType(e.target.value)}>
              <option value="">全部类型</option>
              <option value="enterprise">企业</option>
              <option value="personal">个人</option>
            </select>
            {quickChips.length > 0 && (
              <span className="c3-quick-hint">
                快捷入口：
                {quickChips.map((c) => (
                  <span key={c.id} className="c3-quick-tag" onClick={() => selectCust(c)}>
                    {c.email.split("@")[0]}<b>→</b>
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>
      </Panel>

      {/* 搜索结果（仅搜索时显示） */}
      <div className={`c3-view-section${view === "results" ? " c3-active" : ""}`}>
        <Panel>
          {customersQ.isLoading ? (
            <div className="c3-sr-empty"><span className="c3-sr-ico">⏳</span>搜索中…</div>
          ) : results.length === 0 ? (
            <div className="c3-sr-empty">
              <span className="c3-sr-ico">🔍</span>
              未找到匹配客户「{keyword}」
              <br />
              <span style={{ fontSize: 12, color: "#bbb" }}>请检查邮箱拼写或更换关键词</span>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 10 }}>
                找到 <b style={{ color: "var(--color-primary)" }}>{results.length}</b> 个客户，点击进入额度配置
              </div>
              {results.map((c) => {
                const cnt = c.activeRuleCount ?? activeRuleCount(c.id);
                return (
                  <div key={c.id} className="c3-sr-item" onClick={() => selectCust(c)}>
                    <div className="c3-sr-main">
                      <div className="c3-sr-email">{c.email}</div>
                      <div className="c3-sr-sub">
                        {c.type === "enterprise" ? "企业" : "个人"} · {c.name} · 基线 RPM {fmtRPM(defaults[c.type].rpm)} / TPM {fmtTPM(defaults[c.type].tpm)}
                      </div>
                    </div>
                    <div className="c3-sr-right">
                      {cnt ? <Tag type="purple">已开 {cnt} 条例外</Tag> : <Tag type="gray">未设例外</Tag>}
                      <button type="button" className="c3-btn c3-btn--text" onClick={(e) => { e.stopPropagation(); selectCust(c); }}>
                        进入额度配置 →
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </Panel>
      </div>

      {/* 客户额度视图（选定客户后） */}
      {currentCust && (
        <div className={`c3-view-section${view === "cust" ? " c3-active" : ""}`}>
          <Panel>
            <div className="c3-cust-head">
              <span className="c3-ch-title">🪙 {currentCust.email}</span>
              <span className="c3-ch-meta">
                · {currentCust.type === "enterprise" ? "企业" : "个人"} 客户 · 基线 RPM {fmtRPM(defaults[currentCust.type].rpm)} / TPM {fmtTPM(defaults[currentCust.type].tpm)}
              </span>
              <div className="c3-btn-group" style={{ marginLeft: 8 }}>
                <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => openQuota(null)}>＋ 设置额度</button>
                <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={resetSearch}>更换客户</button>
              </div>
            </div>
            {rulesQ.isLoading ? (
              <div style={{ padding: 24, textAlign: "center", color: "#888", fontSize: 13 }}>额度规则加载中…</div>
            ) : (
              <div className="c3-panel__body" style={{ padding: 0 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: "#666", textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                      <th style={{ padding: "10px 12px" }}>模型</th>
                      <th style={{ padding: "10px 12px" }}>生效 RPM</th>
                      <th style={{ padding: "10px 12px" }}>生效 TPM</th>
                      <th style={{ padding: "10px 12px" }}>来源</th>
                      <th style={{ padding: "10px 12px" }}>有效期</th>
                      <th style={{ padding: "10px 12px" }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((m) => {
                      const eff = effective(currentCust, m.name, rules, models, defaults);
                      const capMark = eff.trunc ? (
                        <span
                          className="c3-cap-mark"
                          title={
                            eff.rawRpm > eff.rpm
                              ? `例外 ${fmtRPM(eff.rawRpm)} 超过模型全局限流 ${fmtRPM(m.capRpm ?? 0)}，实际按 ${fmtRPM(eff.rpm)} 生效`
                              : `例外 ${fmtTPM(eff.rawTpm)} 超过模型全局限流 ${fmtTPM(m.capTpm ?? 0)}，实际按 ${fmtTPM(eff.tpm)} 生效`
                          }
                        >↯</span>
                      ) : null;
                      const srcTag = eff.src === "例外" ? <Tag type="purple">例外</Tag> : <Tag type="gray">{eff.src}</Tag>;
                      const period = eff.rule ? (eff.rule.period === "forever" ? "永久" : `${eff.rule.start} ~ ${eff.rule.end}`) : "—";
                      const st = eff.rule ? ruleStatus(eff.rule) : null;
                      const rawStatus = eff.rule?.status ?? null;
                      const ops = eff.rule ? (
                        <div className="c3-btn-group">
                          <button type="button" className="c3-btn c3-btn--text" onClick={() => openQuota(eff.rule!.id)}>编辑</button>
                          {st === "active" && (
                            <button type="button" className="c3-btn c3-btn--text c3-danger" onClick={() => toggleRule(eff.rule!.id)}>停用</button>
                          )}
                          {rawStatus === "stopped" && (
                            <button type="button" className="c3-btn c3-btn--text" onClick={() => toggleRule(eff.rule!.id)}>启用</button>
                          )}
                          <button type="button" className="c3-btn c3-btn--text" onClick={() => openHist(eff.rule!.id)}>历史</button>
                        </div>
                      ) : (
                        <button type="button" className="c3-btn c3-btn--text" onClick={() => openQuota(null, m.name)}>＋ 设为例外</button>
                      );
                      return (
                        <tr key={m.name} style={{ borderBottom: "1px solid var(--color-border)", opacity: st === "stopped" ? 0.55 : 1 }}>
                          <td style={{ padding: "10px 12px" }}>{m.name}<div className="c3-cell-sub">{m.vendor ?? ""}</div></td>
                          <td style={{ padding: "10px 12px" }}>
                            <div className="c3-qval">{fmtRPM(eff.rpm)}{capMark}</div>
                            {eff.trunc ? <div className="c3-cell-sub">例外 {fmtRPM(eff.rawRpm)} → 模型顶 {fmtRPM(m.capRpm ?? 0)}</div> : <div className="c3-cell-sub">基线 {fmtRPM(eff.baseRpm)}</div>}
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            {m.capTpm || m.baseTpm ? (
                              <>
                                <div className="c3-qval">{fmtTPM(eff.tpm)}</div>
                                {m.capTpm ? <div className="c3-cell-sub">基线 {fmtTPM(eff.baseTpm)}</div> : null}
                              </>
                            ) : (
                              <>
                                <div className="c3-qval">—</div>
                                <div className="c3-cell-sub">按次计费</div>
                              </>
                            )}
                          </td>
                          <td style={{ padding: "10px 12px" }}>{srcTag}</td>
                          <td style={{ padding: "10px 12px" }}>
                            {period}
                            {st === "expired" && <div className="c3-cell-sub" style={{ color: "#fa8c16" }}>已过期</div>}
                          </td>
                          <td style={{ padding: "10px 12px" }}>{ops}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* 空态引导 */}
      {view === "empty" && (
        <Panel>
          <div className="c3-sr-empty">
            <span className="c3-sr-ico">🔍</span>
            输入客户邮箱搜索，定位后即可查看 / 配置该客户额度
            <br />
            <span style={{ fontSize: 12, color: "#bbb" }}>例外额度仅在选定的客户上生效，不作用于全平台用户</span>
          </div>
        </Panel>
      )}

      {/* 设置额度弹窗 */}
      <Modal open={qmOpen} onClose={closeQuota} title={editRuleId ? "编辑额度 — 客户 × 模型限流例外" : "设置额度 — 客户 × 模型限流例外"} width={640}>
        <div className="c3-form-group">
          <label>客户</label>
          <div className="c3-base-line">
            {currentCust ? (
              <>
                <Tag type={currentCust.type === "enterprise" ? "blue" : "green"}>{currentCust.type === "enterprise" ? "企业" : "个人"}</Tag>
                <b>{currentCust.email}</b>
                <span style={{ color: "var(--color-text-muted)" }}>基线 RPM {fmtRPM(defaults[currentCust.type].rpm)} / TPM {fmtTPM(defaults[currentCust.type].tpm)}</span>
              </>
            ) : (
              <span style={{ color: "var(--color-text-muted)" }}>请先搜索并选择客户</span>
            )}
          </div>
        </div>
        <div className="c3-form-group">
          <label>模型 <b style={{ color: "var(--color-danger-text)" }}>*</b>（可多选，同一配额批量下发）</label>
          <div className="c3-model-grid">{models.map(modelOpt)}</div>
        </div>
        <div className="c3-form-row">
          <div className="c3-form-group">
            <label>RPM <span className="c3-hint-inline">每分钟请求数</span></label>
            <input type="number" min={0} value={qRpm} onChange={(e) => setQRpm(e.target.value)} placeholder="留空 = 沿用该客户默认" />
            {currentCust && <div className="c3-hint-inline" style={{ marginLeft: 0, marginTop: 4 }}>基线 {fmtRPM(defaults[currentCust.type].rpm)}</div>}
          </div>
          <div className="c3-form-group">
            <label>TPM <span className="c3-hint-inline">每分钟 Token 数</span></label>
            <input type="number" min={0} step={1000} value={qTpm} onChange={(e) => setQTpm(e.target.value)} placeholder="留空 = 沿用该客户默认" />
            {currentCust && <div className="c3-hint-inline" style={{ marginLeft: 0, marginTop: 4 }}>基线 {fmtTPM(defaults[currentCust.type].tpm)}</div>}
          </div>
        </div>
        {capNote.length > 0 && <div className="c3-cap-note c3-show">{capNote.map((l, i) => <span key={i}>{l}{i < capNote.length - 1 && <br />}</span>)}</div>}
        <div className="c3-form-group">
          <label>有效期</label>
          <div className="c3-radio-line">
            <label><input type="radio" checked={qPeriod === "forever"} onChange={() => setQPeriod("forever")} /> 永久</label>
            <label><input type="radio" checked={qPeriod === "range"} onChange={() => setQPeriod("range")} /> 指定范围</label>
            {qPeriod === "range" && (
              <span className="c3-range-picker c3-show">
                <input type="date" value={qStart} onChange={(e) => setQStart(e.target.value)} />
                <span>至</span>
                <input type="date" value={qEnd} onChange={(e) => setQEnd(e.target.value)} />
              </span>
            )}
          </div>
        </div>
        <div className="c3-form-group">
          <label>原因备注 <b style={{ color: "var(--color-danger-text)" }}>*</b><span className="c3-hint-inline">必填，写入审计日志与客户操作记录</span></label>
          <textarea rows={2} value={qReason} onChange={(e) => setQReason(e.target.value)} placeholder="如：签订年度大客户协议，需高并发批量推理" />
        </div>
        <div className="c3-btn-group" style={{ justifyContent: "flex-end", marginTop: 8 }}>
          <button type="button" className="c3-btn c3-btn--default" onClick={closeQuota}>取消</button>
          <button type="button" className="c3-btn c3-btn--primary" onClick={saveQuota} disabled={saveQuotaMutation.isPending}>确认开通</button>
        </div>
      </Modal>

      {/* 历史记录弹窗 */}
      <Modal open={!!histRule} onClose={closeHist} title={histRule && histCust ? `变更历史 — ${histCust.email} × ${histRule.model}` : "变更历史"} width={560}>
        {histRule && (
          <>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>当前：{histRule.reason}</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "#666", textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ padding: "8px" }}>时间</th>
                  <th style={{ padding: "8px" }}>操作</th>
                  <th style={{ padding: "8px" }}>操作人</th>
                  <th style={{ padding: "8px" }}>原因</th>
                </tr>
              </thead>
              <tbody>
                {(hist[histRule.id] ?? []).map((l, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "8px" }}>{String(l.t).slice(0, 16).replace("T", " ")}</td>
                    <td style={{ padding: "8px" }}>
                      {l.op === "开通" ? <Tag type="green">开通</Tag> : l.op === "停用" ? <Tag type="gray">停用</Tag> : <Tag type="blue">{l.op}</Tag>}
                    </td>
                    <td style={{ padding: "8px" }}>{l.who}</td>
                    <td style={{ padding: "8px" }}>{l.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <div className="c3-btn-group" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className="c3-btn c3-btn--default" onClick={closeHist}>关闭</button>
        </div>
      </Modal>
    </>
  );
}
