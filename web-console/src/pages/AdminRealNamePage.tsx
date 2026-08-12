import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader, Panel, Modal, Tag, Pagination, useToast, HelpIcon, EmptyState, SkeletonGroup } from "@3cloud/shared-ui";
import { api, extractError } from "../lib/api";
import "./AdminRealNamePage.css";

/**
 * 实名认证审核 — 对齐原型 admin-verification.html
 *
 * 状态机：unverified → pending_review → approved / rejected
 * 数据源：
 *   GET  /admin/real-name/stats             — 5 统计卡 + 审核人下拉
 *   GET  /admin/real-name?status=&type=&reviewer=&acct=&kw=&from=&to=&page=&page_size= — 列表（4 Tab）
 *   GET  /admin/real-name/:id               — 抽屉详情
 *   POST /admin/real-name/:id/review        — 单条通过/驳回
 *   POST /admin/real-name/review            — 批量通过/驳回
 *   POST /admin/real-name/direct            — 代审通过（未认证 → approved）
 *   POST /admin/real-name/invite            — 发送实名认证邀请
 */

/* ───────── 类型 ───────── */
type TabKey = "pending_review" | "unverified" | "approved" | "rejected";
type TimeKey = "today" | "yesterday" | "week" | "month" | "custom";

interface RnRow {
  id: number;
  userId: number;
  recordId: number | null;
  status: string;
  type: string;
  typeLabel: string;
  name: string;
  nameMasked?: string;
  idNo?: string | null;
  idNoMasked: string;
  email?: string | null;
  submittedAt?: string | null;
  overdue?: boolean;
  risk?: string[];
  sim?: number | null;
  approvedVia?: string | null;
  directNote?: string | null;
  rejectReason?: string | null;
  reviewer?: string | null;
  reviewerId?: number | null;
  reviewedAt?: string | null;
  registeredAt?: string | null;
  lastLogin?: string | null;
  invites?: number;
  isContract?: boolean;
  hasKey?: boolean;
  hasUsage?: boolean;
  acctStatus?: string;
}

interface RnStats {
  pending: { count: number; overdue: number };
  unverified: { count: number; blocked: number };
  todayApproved: number;
  todayRejected: number;
  rejectRate: number;
  avgTimeMin: number;
  reviewers: { id: number; email: string }[];
}

interface RecordImage { id: string; type: string; url: string; masked?: boolean }
interface RecordDetail {
  kind: "record";
  id: number; userId: number; type: string; typeLabel: string;
  realName: string; realNameMasked: string;
  idNumber: string; idNumberMasked: string;
  phone: string | null; legalPerson: string | null; companyAddress: string | null;
  status: string; statusLabel: string;
  approvedVia: string | null; directNote: string | null; rejectReason: string | null;
  reviewer: string | null; reviewedAt: string | null; createdAt: string;
  simScore: number | null;
  risk: string[] | null;
  ocrFields: Record<string, string> | null;
  images: RecordImage[] | null;
  account: {
    email: string; name: string; customerType: string; isContract: boolean;
    createdAt: string; lastLoginAt: string | null;
  } | null;
}
interface AccountDetail {
  kind: "account";
  id: number; userId: number; status: string; statusLabel: string;
  email: string; name: string; type: string; typeLabel: string;
  isContract: boolean;
  registeredAt: string; lastLogin: string | null;
  hasKey: boolean; keys: { name: string; status: string; lastUsedAt: string | null }[];
  hasUsage: boolean; recentUsage: { model: string; cost: string; createdAt: string }[];
  invites: number;
}
type DetailData = RecordDetail | AccountDetail;

/* ───────── 常量 ───────── */
const TABS: { key: TabKey; icon: string; label: string }[] = [
  { key: "pending_review", icon: "⏳", label: "待审核" },
  { key: "unverified", icon: "⚪", label: "未认证" },
  { key: "approved", icon: "✅", label: "已通过" },
  { key: "rejected", icon: "❌", label: "已驳回" },
];

const TIME_PRESETS: { key: TimeKey; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "yesterday", label: "昨日" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
  { key: "custom", label: "自定义" },
];

const REASONS = [
  { v: "证件照片不清晰", d: "无法辨认关键信息" },
  { v: "人证不符", d: "本人与证件照片不一致" },
  { v: "证件已过期", d: "有效期已截止" },
  { v: "证件信息与填写不一致", d: "OCR 与提交信息不符" },
  { v: "疑似伪造 / P图", d: "证件有修改痕迹" },
  { v: "其他", d: "自定义说明" },
];

const CHANNELS = [
  { v: "system", label: "站内信 + 邮件" },
  { v: "email", label: "仅邮件" },
  { v: "sms", label: "短信 + 邮件" },
];

/* ───────── 工具 ───────── */
function fmtDT(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDay(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function rangeFor(key: TimeKey): { from: string; to: string } {
  const now = new Date();
  const to = isoDay(now);
  if (key === "today") return { from: to, to };
  if (key === "yesterday") {
    const d = new Date(now);
    d.setDate(now.getDate() - 1);
    const s = isoDay(d);
    return { from: s, to: s };
  }
  if (key === "week") {
    const dow = now.getDay() || 7;
    const d = new Date(now);
    d.setDate(now.getDate() - (dow - 1));
    return { from: isoDay(d), to };
  }
  if (key === "month") {
    return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, to };
  }
  return { from: to, to };
}
function norm(s: string): string { return (s ?? "").trim().toLowerCase(); }

function typeTag(t: string) {
  return t === "enterprise" ? <Tag type="purple">企业</Tag> : <Tag type="blue">个人</Tag>;
}

/* 未认证用户账号状态标签组合 */
function acctTags(r: RnRow) {
  const tags: React.ReactNode[] = [];
  if (r.isContract) tags.push(<Tag key="c" type="purple">🏢 合同客户</Tag>);
  if (r.hasKey) tags.push(<Tag key="k" type="orange">🔑 有KEY</Tag>);
  if (r.hasUsage) tags.push(<Tag key="u" type="red">📡 曾调用被拦截</Tag>);
  if (!r.isContract && !r.hasKey && !r.hasUsage) tags.push(<Tag key="i" type="gray">⚪ 仅注册</Tag>);
  return <span className="rn-acct-tags">{tags}</span>;
}

/* 导出当前筛选结果为 CSV */
function exportCsv(rows: RnRow[], tab: TabKey) {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  let headers: string[] = [];
  let line: (r: RnRow) => string = () => "";
  if (tab === "pending_review") {
    headers = ["申请时间", "用户", "类型", "姓名/企业名", "证件号", "风险"];
    line = (r) => [fmtDT(r.submittedAt), r.email ?? "", r.typeLabel, r.name, r.idNoMasked, (r.risk ?? []).join("；")].map(esc).join(",");
  } else if (tab === "unverified") {
    headers = ["注册时间", "用户", "类型", "姓名/企业名", "账号状态", "最后活跃", "邀请"];
    line = (r) => [fmtDT(r.registeredAt), r.email ?? "", r.typeLabel, r.name, r.acctStatus ?? "", fmtDT(r.lastLogin), r.invites ?? 0].map(esc).join(",");
  } else if (tab === "approved") {
    headers = ["申请时间", "用户", "类型", "姓名/企业名", "证件号", "认证方式", "审核人", "审核时间"];
    line = (r) => [fmtDT(r.submittedAt), r.email ?? "", r.typeLabel, r.name, r.idNoMasked, r.approvedVia === "admin" ? "代审" : "用户提交", r.reviewer ?? "", fmtDT(r.reviewedAt)].map(esc).join(",");
  } else {
    headers = ["申请时间", "用户", "类型", "姓名/企业名", "证件号", "驳回原因", "审核人", "审核时间"];
    line = (r) => [fmtDT(r.submittedAt), r.email ?? "", r.typeLabel, r.name, r.idNoMasked, r.rejectReason ?? "", r.reviewer ?? "", fmtDT(r.reviewedAt)].map(esc).join(",");
  }
  const csv = [headers.join(","), ...rows.map(line)].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `real-name-${tab}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ───────── 主组件 ───────── */
export default function AdminRealNamePage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState<TabKey>("pending_review");
  const [timeKey, setTimeKey] = useState<TimeKey>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [type, setType] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [acct, setAcct] = useState("");
  const [kwInput, setKwInput] = useState("");
  const [kw, setKw] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<number[]>([]);

  // 审核抽屉
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 驳回弹窗
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectIds, setRejectIds] = useState<number[]>([]);
  const [rejectTitle, setRejectTitle] = useState("驳回实名认证");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNote, setRejectNote] = useState("");

  // 代审弹窗
  const [directOpen, setDirectOpen] = useState(false);
  const [directIds, setDirectIds] = useState<number[]>([]);
  const [directNote, setDirectNote] = useState("");

  // 邀请弹窗
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteIds, setInviteIds] = useState<number[]>([]);
  const [inviteChannel, setInviteChannel] = useState("system");

  // lightbox 放大
  const [lbImages, setLbImages] = useState<RecordImage[]>([]);
  const [lbIdx, setLbIdx] = useState(0);

  const range = useMemo(() => (timeKey === "custom" ? { from: customFrom, to: customTo } : rangeFor(timeKey)), [timeKey, customFrom, customTo]);

  /* ── 数据：统计卡 ── */
  const statsQ = useQuery({
    queryKey: ["admin-real-name-stats"],
    queryFn: async () => (await api.get<{ data: RnStats }>("/admin/real-name/stats")).data.data,
  });
  const stats = statsQ.data;

  /* ── 数据：列表 ── */
  const listQ = useQuery({
    queryKey: ["admin-real-name", tab, type, reviewer, acct, kw, range.from, range.to, page, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams({ status: tab, page: String(page), page_size: String(pageSize) });
      if (type) params.set("type", type);
      if (reviewer) params.set("reviewer", reviewer);
      if (acct) params.set("acct", acct);
      if (kw) params.set("kw", kw);
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);
      const res = await api.get<{ data: { list: RnRow[]; pagination: { page: number; pageSize: number; total: number; totalPages: number; filtered: number } } }>(`/admin/real-name?${params.toString()}`);
      return res.data.data;
    },
  });
  const rows: RnRow[] = listQ.data?.list ?? [];
  const pagination = listQ.data?.pagination;

  /* ── 数据：抽屉详情 ── */
  const detailQ = useQuery({
    queryKey: ["admin-real-name-detail", drawerId],
    queryFn: async () => (await api.get<{ data: DetailData }>(`/admin/real-name/${drawerId}`)).data.data,
    enabled: !!drawerId && drawerOpen,
  });
  const detail = detailQ.data;

  /* 抽屉内待审核队列（用于「第 N/M 单」） */
  const queueQ = useQuery({
    queryKey: ["admin-real-name-queue"],
    queryFn: async () => {
      const res = await api.get<{ data: { list: RnRow[]; pagination: { total: number } } }>("/admin/real-name?status=pending_review&page_size=100");
      return res.data.data;
    },
    enabled: drawerOpen && detail?.kind === "record" && detail.status === "pending_review",
  });
  const queueIdx = queueQ.data ? queueQ.data.list.findIndex((r) => r.id === drawerId) : -1;
  const queueTotal = queueQ.data?.pagination.total ?? 0;

  /* ── Mutations ── */
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-real-name"] });
    qc.invalidateQueries({ queryKey: ["admin-real-name-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-real-name-detail"] });
    qc.invalidateQueries({ queryKey: ["admin-real-name-queue"] });
  };

  const reviewMut = useMutation({
    mutationFn: async ({ ids, action, reason }: { ids: number[]; action: "approve" | "reject"; reason?: string }) => {
      if (ids.length === 1) {
        return (await api.post(`/admin/real-name/${ids[0]}/review`, { action, reason })).data;
      }
      return (await api.post("/admin/real-name/review", { action, ids, reason })).data;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.action === "approve" ? `已通过 ${vars.ids.length} 条实名认证` : `已驳回 ${vars.ids.length} 条实名认证`);
      setDrawerOpen(false);
      setDrawerId(null);
      setRejectOpen(false);
      refresh();
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const directMut = useMutation({
    mutationFn: async ({ ids, note }: { ids: number[]; note?: string }) => (await api.post("/admin/real-name/direct", { ids, note })).data,
    onSuccess: (_d, vars) => {
      toast.success(`已代审通过 ${vars.ids.length} 个用户，认证已生效`);
      setDrawerOpen(false);
      setDrawerId(null);
      setDirectOpen(false);
      refresh();
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const inviteMut = useMutation({
    mutationFn: async ({ ids, channel }: { ids: number[]; channel: string }) => (await api.post("/admin/real-name/invite", { ids, channel })).data,
    onSuccess: (_d, vars) => {
      toast.success(`已发送认证邀请 ${vars.ids.length} 人`);
      setInviteOpen(false);
      refresh();
    },
    onError: (e) => toast.error(extractError(e)),
  });

  /* ── 交互 helpers ── */
  const switchTab = (t: TabKey) => {
    setTab(t);
    setPage(1);
    setSelected([]);
  };

  const toggleSel = (id: number) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  const toggleAllPage = () => {
    const pageIds = rows.map((r) => r.id);
    const allSel = pageIds.every((id) => selected.includes(id));
    setSelected(allSel ? selected.filter((id) => !pageIds.includes(id)) : [...new Set([...selected, ...pageIds])]);
  };

  const openDrawer = (id: number) => {
    setDrawerId(id);
    setDrawerOpen(true);
  };

  const quickApprove = (id: number) => reviewMut.mutate({ ids: [id], action: "approve" });

  const openReject = (ids: number[]) => {
    setRejectIds(ids);
    setRejectTitle(ids.length > 1 ? `批量驳回（${ids.length} 条）` : "驳回实名认证");
    setRejectReason("");
    setRejectNote("");
    setRejectOpen(true);
  };
  const confirmReject = () => {
    if (!rejectReason) return;
    const reason = rejectReason + (rejectNote.trim() ? `：${rejectNote.trim()}` : "");
    setRejectOpen(false);
    reviewMut.mutate({ ids: rejectIds, action: "reject", reason });
  };

  const openDirect = (ids: number[]) => {
    setDirectIds(ids);
    setDirectNote("");
    setDirectOpen(true);
  };

  const openInvite = (ids: number[]) => {
    setInviteIds(ids);
    setInviteChannel("system");
    setInviteOpen(true);
  };

  const openLightbox = (images: RecordImage[], idx: number) => {
    setLbImages(images);
    setLbIdx(idx);
  };
  const lbStep = (d: number) => setLbIdx((i) => (i + d + lbImages.length) % lbImages.length);

  /* 表格行操作 */
  const rowActions = (r: RnRow) => {
    if (tab === "pending_review") {
      return (
        <>
          <button type="button" className="c3-btn c3-btn--text" onClick={() => openDrawer(r.id)}>查看详情</button>{" "}
          <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => quickApprove(r.id)}>通过</button>{" "}
          <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => openReject([r.id])}>驳回</button>
        </>
      );
    }
    if (tab === "unverified") {
      return (
        <>
          <button type="button" className="c3-btn c3-btn--text" onClick={() => openDrawer(r.id)}>查看</button>{" "}
          <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => openDirect([r.id])}>⚡ 直接通过</button>{" "}
          <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => openInvite([r.id])}>📨 邀请认证</button>
        </>
      );
    }
    return (
      <button type="button" className="c3-btn c3-btn--text" onClick={() => openDrawer(r.id)}>查看详情</button>
    );
  };

  const showCheckbox = tab === "pending_review" || tab === "unverified";

  /* 批量操作按钮（随 Tab 变化） */
  const batchActions = () => {
    if (tab === "pending_review") {
      return (
        <>
          <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => reviewMut.mutate({ ids: selected, action: "approve" })}>✅ 批量通过</button>
          <button type="button" className="c3-btn c3-btn--sm rn-btn-danger" onClick={() => openReject(selected)}>❌ 批量驳回</button>
        </>
      );
    }
    if (tab === "unverified") {
      return (
        <>
          <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => openDirect(selected)}>⚡ 批量代审通过</button>
          <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => openInvite(selected)}>📨 批量邀请认证</button>
        </>
      );
    }
    return null;
  };

  /* ── 抽屉渲染 ── */
  const renderDrawer = () => {
    if (!detail) return null;
    const isUnv = detail.kind === "account";
    const isPending = !isUnv && detail.status === "pending_review";
    const userEmail = detail.kind === "account" ? detail.email : detail.account?.email ?? "";
    const userName = detail.kind === "account" ? detail.name : detail.realName;
    const watermark = detail.kind === "record"
      ? `${detail.reviewer ?? "3Cloud 审核"} · ${fmtDay(detail.reviewedAt) || "审核中"} · 3Cloud 内部审核`
      : "3Cloud 内部审核";

    return (
      <>
        {/* 头部摘要条 */}
        <div className="rn-drawer-summary">
          <span className="ds-user">{userEmail}</span>
          {typeTag(detail.type)}
          <span style={{ fontWeight: 600 }}>{userName}</span>
          <span className="ds-meta">
            {isUnv
              ? `注册时间 ${fmtDT(detail.registeredAt)} · 未提交认证材料`
              : `申请时间 ${fmtDT(detail.createdAt)} · 证件号 ${detail.idNumberMasked}`}
          </span>
          {isPending && (
            <span className="ds-queue">
              {queueIdx >= 0 ? `第 ${queueIdx + 1} / ${queueTotal} 单` : queueTotal ? `— / ${queueTotal} 单` : ""}
            </span>
          )}
        </div>

        <div className="rn-verify-body">
          {/* 左：证件影像 */}
          <div className="rn-img-column">
            <div className="rn-section-title">
              📷 证件影像
              {!isUnv && detail.images?.length ? (
                <span style={{ fontWeight: 400, color: "#999", fontSize: 12 }}>（点击放大 · 已加水印防外泄）</span>
              ) : null}
            </div>
            {isUnv ? (
              <div className="rn-no-imgs"><div className="ni-icon">📤</div>该用户尚未提交认证材料<br />暂无证件影像</div>
            ) : !detail.images?.length ? (
              <div className="rn-no-imgs"><div className="ni-icon">⚡</div>该用户由管理员代审通过<br />基于合同 / 服务关系，无证件影像记录</div>
            ) : (
              <div className="rn-img-grid">
                {detail.images.map((img, i) => (
                  <div
                    key={img.id || i}
                    className={`rn-id-img-wrap${detail.images!.length === 3 && i === 2 ? " full" : ""}`}
                    onClick={() => openLightbox(detail.images!, i)}
                  >
                    <span className="img-tag">{img.type}</span>
                    {img.masked && (
                      <div className="rn-watermark"><span>{watermark}</span></div>
                    )}
                    {img.url ? (
                      <img src={img.url} alt={img.type} />
                    ) : (
                      <div className="rn-img-empty">影像待补充<br />（演示数据未上传原图）</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 右：信息 */}
          <div className="rn-info-column">
            {/* 风险 / 处理建议 */}
            {isUnv ? (
              (() => {
                const warns: string[] = [];
                if (detail.hasUsage) warns.push("该用户曾尝试调用 API，因未认证被拦截（错误码 not_verified），建议优先处理");
                if (detail.hasKey) warns.push("该用户已创建 API KEY，认证通过后即可启用调度");
                if (detail.isContract) warns.push("该用户为企业合同客户，建议直接代审通过");
                return warns.length ? (
                  <div className="rn-risk-card rn-risk-card--info">
                    <h4>💡 处理建议</h4>
                    <ul>{warns.map((w, i) => <li key={i}>{w}</li>)}</ul>
                  </div>
                ) : null;
              })()
            ) : detail.risk?.length ? (
              <div className="rn-risk-card">
                <h4>⚠️ 风险提示</h4>
                <ul>{detail.risk.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            ) : null}

            {/* 人证比对 */}
            {!isUnv && detail.simScore != null && (
              (() => {
                const sim = Math.round(detail.simScore * 100);
                const low = sim < 75;
                const lvl = sim >= 80 ? "✔ 一致" : sim >= 70 ? "⚠ 需人工确认" : "✘ 疑似不一致";
                const label = detail.type === "enterprise" ? "法人比对" : "人脸相似度";
                const lvlText = detail.type === "enterprise" ? (sim >= 80 ? "✔ 法人信息一致" : "⚠ 需人工确认") : lvl;
                const sub = detail.type === "enterprise" ? "营业执照与法人身份比对结果" : "系统人脸比对结果，仅供参考";
                return (
                  <div className={`rn-face-match${low ? " rn-face-match--low" : ""}`}>
                    <div><div className="fm-score">{sim}%</div><div className="fm-label">{label}</div></div>
                    <div style={{ flex: 1 }}>
                      <div className="fm-lvl">{lvlText}</div>
                      <div className="fm-label">{sub}</div>
                    </div>
                  </div>
                );
              })()
            )}

            {/* 提交 vs OCR */}
            <div className="rn-section-title">🔍 提交信息 vs OCR 识别</div>
            {isUnv ? (
              <div style={{ textAlign: "center", color: "#999", padding: 16, fontSize: 13 }}>未提交认证材料，无 OCR 数据</div>
            ) : (
              <table className="rn-compare-table">
                <thead><tr><th>字段</th><th>用户提交</th><th>OCR 识别</th><th></th></tr></thead>
                <tbody>
                  {(() => {
                    const ocr = detail.ocrFields ?? {};
                    const keys = Object.keys(ocr);
                    if (!keys.length) {
                      return <tr><td colSpan={4} style={{ textAlign: "center", color: "#999", padding: 16 }}>无 OCR 对照数据</td></tr>;
                    }
                    const lookup: Record<string, string> = {
                      name: detail.realName, real_name: detail.realName,
                      id_number: detail.idNumber, id_no: detail.idNumber,
                      company_name: detail.realName, credit_code: detail.idNumber,
                      legal_person: detail.legalPerson ?? "", company_address: detail.companyAddress ?? "",
                    };
                    return keys.map((k) => {
                      const ocrVal = String(ocr[k] ?? "");
                      const sub = lookup[norm(k)] ?? "";
                      const ok = !!sub && norm(sub) === norm(ocrVal);
                      return (
                        <tr key={k}>
                          <td>{k}</td>
                          <td>{sub || "—"}</td>
                          <td className={ok ? undefined : "mismatch"}>{ocrVal}</td>
                          <td className="ok">{ok ? "✔" : "✘"}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            )}

            {/* 账户信息 */}
            <div className="rn-section-title">📋 账户信息</div>
            {isUnv ? (
              <table className="rn-compare-table">
                <tbody>
                  <tr><td style={{ width: 110, color: "#888" }}>注册时间</td><td>{fmtDT(detail.registeredAt)}</td></tr>
                  <tr><td style={{ color: "#888" }}>最后活跃</td><td>{fmtDT(detail.lastLogin)}</td></tr>
                  <tr><td style={{ color: "#888" }}>账号状态</td><td><span className="rn-acct-tags">
                    {detail.isContract ? <Tag type="purple">🏢 合同客户</Tag> : null}
                    {detail.hasKey ? <Tag type="orange">🔑 有KEY</Tag> : null}
                    {detail.hasUsage ? <Tag type="red">📡 曾调用被拦截</Tag> : null}
                  </span></td></tr>
                  <tr><td style={{ color: "#888" }}>KEY 状态</td><td>
                    {detail.hasKey
                      ? <span className="c3-tag c3-tag--orange">已创建 · 待认证启用</span>
                      : <span className="c3-tag c3-tag--gray">未创建</span>}
                  </td></tr>
                  {detail.isContract ? (
                    <tr><td style={{ color: "#888" }}>合同关系</td><td><Tag type="purple">🏢 合同客户</Tag> · 建议代审通过</td></tr>
                  ) : null}
                  <tr><td style={{ color: "#888" }}>认证邀请</td><td>{detail.invites ? `已发送 ${detail.invites} 次` : "未邀请"}</td></tr>
                  <tr><td style={{ color: "#888" }}>调用限制</td><td><span className="c3-tag c3-tag--red">🔒 未认证 · API 不可用</span></td></tr>
                  {detail.keys.length > 0 ? (
                    <tr><td style={{ color: "#888" }}>已建 KEY</td><td>
                      {detail.keys.map((k) => (
                        <div key={k.name} style={{ fontSize: 12 }}>· {k.name} <span className="c3-tag c3-tag--gray">{k.status}</span>{k.lastUsedAt ? ` · 最近 ${fmtDT(k.lastUsedAt)}` : ""}</div>
                      ))}
                    </td></tr>
                  ) : null}
                </tbody>
              </table>
            ) : (
              <table className="rn-compare-table">
                <tbody>
                  <tr><td style={{ width: 110, color: "#888" }}>注册时间</td><td>{detail.account ? fmtDT(detail.account.createdAt) : "—"}</td></tr>
                  <tr><td style={{ color: "#888" }}>认证状态</td><td>
                    <span className="c3-tag c3-tag--blue">{detail.typeLabel}认证 · {detail.statusLabel}</span>
                  </td></tr>
                  {detail.phone ? <tr><td style={{ color: "#888" }}>手机号</td><td>{detail.phone}</td></tr> : null}
                  {detail.legalPerson ? <tr><td style={{ color: "#888" }}>法定代表人</td><td>{detail.legalPerson}</td></tr> : null}
                  {detail.companyAddress ? <tr><td style={{ color: "#888" }}>注册地址</td><td>{detail.companyAddress}</td></tr> : null}
                  <tr><td style={{ color: "#888" }}>历史提交</td><td>{detail.status === "pending_review" ? "首次提交 · 全部留痕可审计" : "已处理 · 全部留痕可审计"}</td></tr>
                  {detail.reviewer ? (
                    <tr><td style={{ color: "#888" }}>审核信息</td><td>
                      {detail.reviewer} 于 {fmtDT(detail.reviewedAt)}
                      {detail.status === "approved" && detail.approvedVia === "admin" ? `（⚡ 管理员代审${detail.directNote ? ` · ${detail.directNote}` : ""}）` : ""}
                      {detail.status === "rejected" ? ` · 原因：${detail.rejectReason}` : ""}
                    </td></tr>
                  ) : null}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 底部操作 */}
        <div className="rn-verify-footer">
          <span className="hint">
            {isUnv
              ? "该用户未提交认证材料。基于合同可代审通过，或发送邀请引导其自行认证"
              : isPending
                ? "核对证件影像与 OCR 信息后决策，操作将全程留痕"
                : detail.status === "approved"
                  ? `✅ ${detail.reviewer ?? "管理员"} 于 ${fmtDT(detail.reviewedAt)} 审核通过${detail.approvedVia === "admin" ? `（⚡ 管理员代审${detail.directNote ? ` · ${detail.directNote}` : ""}）` : ""}`
                  : `❌ 于 ${fmtDT(detail.reviewedAt)} 驳回 · 原因：${detail.rejectReason}`}
          </span>
          <span className="spacer" />
          {isUnv ? (
            <>
              <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => openInvite([detail.id])}>📨 邀请认证</button>
              <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => openDirect([detail.id])}>⚡ 直接通过（代审）</button>
            </>
          ) : isPending ? (
            <>
              <button type="button" className="c3-btn c3-btn--sm rn-btn-danger" onClick={() => openReject([detail.id])}>驳回</button>
              <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => reviewMut.mutate({ ids: [detail.id], action: "approve" })}>✅ 审核通过</button>
            </>
          ) : (
            <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => { setDrawerOpen(false); setDrawerId(null); }}>返回列表</button>
          )}
        </div>
      </>
    );
  };

  /* ── 列表列头 ── */
  const head = (() => {
    if (tab === "pending_review")
      return ["申请时间", "用户", "类型", "姓名 / 企业名", "证件号", "风险", "操作"];
    if (tab === "unverified")
      return ["注册时间", "用户", "类型", "姓名 / 企业名", "账号状态", "最后活跃", "邀请", "操作"];
    if (tab === "approved")
      return ["申请时间", "用户", "类型", "姓名 / 企业名", "证件号", "认证方式", "审核人", "操作"];
    return ["申请时间", "用户", "类型", "姓名 / 企业名", "证件号", "驳回原因", "审核人", "操作"];
  })();

  /* 未认证说明横幅（仅未认证 Tab） */
  const noticeBanner = tab === "unverified" && (
    <div className="rn-notice-banner">
      <span className="nb-icon">💡</span>
      <div>
        <b>实名认证前置策略：</b>注册用户需完成实名认证后方可使用 API KEY 调度 Token。以下用户<u>已注册但未提交</u>认证材料，其 KEY 当前处于<b>禁用</b>状态。可根据账号状态处理：<br />
        <span className="nb-tags">
          <span className="c3-tag c3-tag--purple">🏢 合同客户</span><span>已签合同 → 一键代审通过</span>
          <span className="c3-tag c3-tag--orange">🔑 有KEY</span><span>想用但被拦截 → 邀请认证或代审</span>
          <span className="c3-tag c3-tag--red">📡 曾调用</span><span>调用被拦截 → 优先处理</span>
          <span className="c3-tag c3-tag--gray">⚪ 仅注册</span><span>无计划使用 → 可忽略</span>
        </span>
      </div>
    </div>
  );

  return (
    <div className="rn-page">
      <PageHeader title="实名认证审核" help="管理用户实名认证申请。审核用户提交的身份信息，通过或驳回认证请求。未认证用户可基于合同代审通过，或发送邀请引导其自行提交材料。" />

      {/* 统计卡片 */}
      <div className="c3-stat-grid c3-stat-grid--cols5">
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon">⏳</span>
          <div className="c3-stat-card__label">待审核 <span style={{ color: "#bbb", fontWeight: 400 }}>已提交</span></div>
          <div className="c3-stat-card__value">{stats?.pending.count ?? 0}</div>
          <div className={`c3-stat-card__trend${(stats?.pending.overdue ?? 0) > 0 ? " c3-stat-card__trend--down" : ""}`}>
            {(stats?.pending.overdue ?? 0) > 0 ? `⚠ ${stats!.pending.overdue} 单超 72h` : "·"}
          </div>
        </div>
        <div className="c3-stat-card" style={{ cursor: "pointer" }} onClick={() => switchTab("unverified")} title="点击查看未认证用户">
          <span className="c3-stat-card__icon">⚪</span>
          <div className="c3-stat-card__label">未认证 <span style={{ color: "#bbb", fontWeight: 400 }}>未提交</span></div>
          <div className="c3-stat-card__value">{stats?.unverified.count ?? 0}</div>
          <div className={`c3-stat-card__trend${(stats?.unverified.blocked ?? 0) > 0 ? " c3-stat-card__trend--down" : ""}`}>
            {(stats?.unverified.blocked ?? 0) > 0 ? `⚠ ${stats!.unverified.blocked} 人想用被拦截` : "·"}
          </div>
        </div>
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon">✅</span>
          <div className="c3-stat-card__label">今日通过</div>
          <div className="c3-stat-card__value">{stats?.todayApproved ?? 0}</div>
          <div className="c3-stat-card__trend c3-stat-card__trend--up">↑ 当日审核量</div>
        </div>
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon">❌</span>
          <div className="c3-stat-card__label">今日驳回</div>
          <div className="c3-stat-card__value">{stats?.todayRejected ?? 0}</div>
          <div className="c3-stat-card__trend">{(stats?.rejectRate ?? 0) > 0 ? `驳回率 ${stats!.rejectRate}%` : "·"}</div>
        </div>
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon">⏱</span>
          <div className="c3-stat-card__label">平均审核时长</div>
          <div className="c3-stat-card__value">{stats?.avgTimeMin ?? 0}<span style={{ fontSize: 13, fontWeight: 400 }}>分</span></div>
          <div className="c3-stat-card__trend">待审核记录自动统计</div>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="c3-filter-bar">
        <div className="c3-filter-group">
          <span className="c3-filter-label">时间范围</span>
          {TIME_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`c3-time-btn${timeKey === p.key ? " c3-time-btn--active" : ""}`}
              onClick={() => { setTimeKey(p.key); setPage(1); }}
            >
              {p.label}
            </button>
          ))}
          {timeKey === "custom" && (
            <span className="c3-custom-date c3-custom-date--show">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <span>至</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              <button type="button" className="c3-apply-btn" onClick={() => setPage(1)}>确定</button>
            </span>
          )}
        </div>

        <div className="c3-filter-group">
          <span className="c3-filter-label">认证类型</span>
          <select className="c3-filter-select" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">全部类型</option>
            <option value="individual">个人</option>
            <option value="enterprise">企业</option>
          </select>
        </div>

        {tab !== "unverified" && (
          <div className="c3-filter-group">
            <span className="c3-filter-label">审核人</span>
            <select className="c3-filter-select" value={reviewer} onChange={(e) => { setReviewer(e.target.value); setPage(1); }}>
              <option value="">全部</option>
              {(stats?.reviewers ?? []).map((rv) => (
                <option key={rv.id} value={rv.id}>{rv.email}</option>
              ))}
            </select>
          </div>
        )}

        {tab === "unverified" && (
          <div className="c3-filter-group">
            <span className="c3-filter-label">账号状态</span>
            <select className="c3-filter-select" value={acct} onChange={(e) => { setAcct(e.target.value); setPage(1); }}>
              <option value="">全部</option>
              <option value="contract">🏢 合同客户</option>
              <option value="active">🔑 有KEY / 曾调用</option>
              <option value="idle">⚪ 仅注册</option>
            </select>
          </div>
        )}

        <div className="c3-filter-spacer" />

        <div className="c3-filter-group">
          <span className="c3-filter-label">搜索</span>
          <input
            className="c3-filter-input c3-filter-input--w200"
            type="text"
            placeholder="邮箱 / 姓名 / 企业名"
            value={kwInput}
            onChange={(e) => setKwInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setKw(kwInput.trim()); setPage(1); } }}
          />
          <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => { setKw(kwInput.trim()); setPage(1); }}>搜索</button>
          <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => exportCsv(rows, tab)}>导出</button>
        </div>
      </div>

      {/* 批量操作条 */}
      {selected.length > 0 && (
        <div className="rn-batch-bar rn-batch-bar--show">
          <span>已选 <b className="bb-count">{selected.length}</b> 项</span>
          <span className="bb-actions">{batchActions()}</span>
          <button type="button" className="c3-btn c3-btn--text" onClick={() => setSelected([])}>取消选择</button>
        </div>
      )}

      {/* Tabs */}
      <div className="c3-sub-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`c3-sub-tab${tab === t.key ? " c3-sub-tab--active" : ""}`} onClick={() => switchTab(t.key)}>
            <span>{t.icon}</span>{t.label}
            {t.key === "pending_review" && (stats?.pending.count ?? 0) > 0 && (
              <span className="c3-sub-tab__badge">{stats!.pending.count}</span>
            )}
            {t.key === "unverified" && (stats?.unverified.count ?? 0) > 0 && (
              <span className="c3-sub-tab__badge">{stats!.unverified.count}</span>
            )}
          </button>
        ))}
      </div>

      {noticeBanner}

      {/* 列表 */}
      <Panel>
        {listQ.isLoading ? (
          <SkeletonGroup lines={8} />
        ) : rows.length === 0 ? (
          <EmptyState title="暂无数据" description="当前筛选条件下没有记录" />
        ) : (
          <>
            <div className="rn-table-scroll">
              <table>
                <thead>
                  <tr>
                    {showCheckbox && (
                      <th style={{ width: 34 }}><input type="checkbox" checked={rows.every((r) => selected.includes(r.id))} onChange={toggleAllPage} /></th>
                    )}
                    {head.map((h) => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    if (tab === "pending_review") {
                      const overdue = r.overdue;
                      const riskTxt = overdue
                        ? <span className="rn-risk-cell rn-risk-cell--overdue">⏱ 超72h</span>
                        : (r.risk?.length
                          ? <span className="rn-risk-cell" title={(r.risk ?? []).join("；")}>⚠️ {(r.risk![0] ?? "").split("，")[0]}</span>
                          : <span style={{ color: "#bbb" }}>—</span>);
                      return (
                        <tr key={r.id}>
                          <td><input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggleSel(r.id)} /></td>
                          <td className={overdue ? "rn-time-overdue" : undefined}>{fmtDT(r.submittedAt)}</td>
                          <td>{r.email}</td>
                          <td>{typeTag(r.type)}</td>
                          <td>{r.name}</td>
                          <td>{r.idNoMasked}</td>
                          <td>{riskTxt}</td>
                          <td>{rowActions(r)}</td>
                        </tr>
                      );
                    }
                    if (tab === "unverified") {
                      return (
                        <tr key={r.id}>
                          <td><input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggleSel(r.id)} /></td>
                          <td>{fmtDT(r.registeredAt)}</td>
                          <td>{r.email}</td>
                          <td>{typeTag(r.type)}</td>
                          <td>{r.name}</td>
                          <td>{acctTags(r)}{r.hasUsage ? <span className="rn-risk-cell">🔴 想用被拦截</span> : null}</td>
                          <td>{fmtDT(r.lastLogin)}</td>
                          <td>{r.invites ? `${r.invites} 次` : <span style={{ color: "#bbb" }}>—</span>}</td>
                          <td>{rowActions(r)}</td>
                        </tr>
                      );
                    }
                    if (tab === "approved") {
                      const src = r.approvedVia === "admin"
                        ? <span className="rn-src-tag rn-src-admin">⚡ 代审{r.directNote ? `·${r.directNote}` : ""}</span>
                        : <span className="rn-src-tag rn-src-submit">✔ 用户提交</span>;
                      return (
                        <tr key={r.id}>
                          <td>{fmtDT(r.submittedAt)}</td>
                          <td>{r.email}</td>
                          <td>{typeTag(r.type)}</td>
                          <td>{r.name}</td>
                          <td>{r.idNoMasked}</td>
                          <td>{src}</td>
                          <td>{r.reviewer}<span className="rn-audit-sub">{fmtDT(r.reviewedAt)}</span></td>
                          <td>{rowActions(r)}</td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={r.id}>
                        <td>{fmtDT(r.submittedAt)}</td>
                        <td>{r.email}</td>
                        <td>{typeTag(r.type)}</td>
                        <td>{r.name}</td>
                        <td>{r.idNoMasked}</td>
                        <td><span className="c3-tag c3-tag--red">{r.rejectReason}</span></td>
                        <td>{r.reviewer}<span className="rn-audit-sub">{fmtDT(r.reviewedAt)}</span></td>
                        <td>{rowActions(r)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "12px 20px" }}>
              <Pagination
                current={page}
                total={pagination?.total ?? 0}
                pageSize={pageSize}
                onChange={(p, ps) => { setPage(p); setPageSize(ps); }}
              />
            </div>
          </>
        )}
      </Panel>

      {/* ===== 审核抽屉 ===== */}
      <Modal
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerId(null); }}
        width={960}
        className="rn-verify-modal"
      >
        {detailQ.isLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#999" }}>加载审核详情…</div>
        ) : renderDrawer()}
      </Modal>

      {/* ===== 驳回原因弹窗 ===== */}
      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title={rejectTitle} width={460}>
        <div className="rn-reject-form">
          <div className="rn-section-title">驳回原因（必选）</div>
          <div className="rn-reason-list">
            {REASONS.map((x) => (
              <div
                key={x.v}
                className={`rn-reason-item${rejectReason === x.v ? " rn-reason-item--selected" : ""}`}
                onClick={() => setRejectReason(x.v)}
              >
                <input type="radio" name="reason" checked={rejectReason === x.v} readOnly />
                <span>{x.v}</span>
                <span className="ri-desc">{x.d}</span>
              </div>
            ))}
          </div>
          <div className="rn-section-title" style={{ marginTop: 14 }}>{rejectReason === "其他" ? "补充说明（必填）" : "补充说明"}</div>
          <textarea placeholder="建议填写具体说明，便于用户修正后重新提交" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
        </div>
        <div className="rn-modal-footer">
          <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => setRejectOpen(false)}>取消</button>
          <button type="button" className="c3-btn c3-btn--sm rn-btn-danger" disabled={!rejectReason || (rejectReason === "其他" && !rejectNote.trim())} onClick={confirmReject}>确认驳回</button>
        </div>
      </Modal>

      {/* ===== 代审通过弹窗 ===== */}
      <Modal open={directOpen} onClose={() => setDirectOpen(false)} title="⚡ 管理员代审通过" width={480}>
        <p className="rn-direct-desc">
          基于<b>合同 / 服务关系</b>，管理员将直接为该用户完成实名认证。认证通过后该用户即可正常使用 API KEY 调度 Token。代审操作全程留痕（操作人 + 时间 + 备注）。
        </p>
        <div className="rn-direct-list">
          {(() => {
            const names = rows.filter((r) => directIds.includes(r.id));
            return names.length <= 3
              ? names.map((r) => <div key={r.id}>· {r.name}（{r.email}）</div>)
              : <div>共 {directIds.length} 人，将全部代审通过</div>;
          })()}
        </div>
        <div className="c3-form-group">
          <label>代审备注（可选，建议填合同号）</label>
          <input type="text" placeholder="如：合同 3CL-2026-0388" value={directNote} onChange={(e) => setDirectNote(e.target.value)} />
        </div>
        <div className="rn-modal-footer">
          <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => setDirectOpen(false)}>取消</button>
          <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => directMut.mutate({ ids: directIds, note: directNote.trim() })}>确认代审通过</button>
        </div>
      </Modal>

      {/* ===== 邀请认证弹窗 ===== */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="📨 邀请实名认证" width={440}>
        <p className="rn-direct-desc">
          将向 <b>{inviteIds.length}</b> 个未认证用户发送实名认证邀请，引导其提交认证材料。
        </p>
        <div className="c3-form-group" style={{ marginTop: 10 }}>
          <label>邀请渠道</label>
          <select value={inviteChannel} onChange={(e) => setInviteChannel(e.target.value)}>
            {CHANNELS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
          </select>
        </div>
        <p className="rn-invite-note">发送后该用户会收到认证引导，提交材料后进入「待审核」队列。</p>
        <div className="rn-modal-footer">
          <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => setInviteOpen(false)}>取消</button>
          <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => inviteMut.mutate({ ids: inviteIds, channel: inviteChannel })}>发送邀请</button>
        </div>
      </Modal>

      {/* ===== lightbox 放大 ===== */}
      {lbImages.length > 0 && (
        <div className="rn-lightbox" onClick={(e) => { if (e.target === e.currentTarget) setLbImages([]); }}>
          <button className="lb-close" onClick={() => setLbImages([])}>&times;</button>
          {lbImages.length > 1 && <button className="lb-prev" onClick={() => lbStep(-1)}>‹</button>}
          <div className="lb-stage">
            {(() => {
              const img = lbImages[lbIdx];
              if (!img) return null;
              return img.url ? (
                <img src={img.url} alt={img.type} />
              ) : (
                <div className="lb-empty">{img.type} · 影像待补充</div>
              );
            })()}
            <div className="lb-tag">{lbImages[lbIdx]?.type ?? ""} · {lbIdx + 1} / {lbImages.length}</div>
          </div>
          {lbImages.length > 1 && <button className="lb-next" onClick={() => lbStep(1)}>›</button>}
        </div>
      )}
    </div>
  );
}
