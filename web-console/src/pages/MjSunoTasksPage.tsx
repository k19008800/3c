/**
 * MJ / Suno 任务中心 — 用户端任务型模型（Midjourney / Suno）对接页
 *
 * 职责：
 * - 提交 MJ（imagine/describe/blend/change/simple-change/action/modal/video/edits/shorten）
 *   与 Suno（MUSIC/LYRICS）任务，展示返回的任务 ID 并加入任务列表
 * - 每 3 秒自动轮询进行中任务（submitted/queueing/processing）的状态并刷新表格，
 *   组件卸载时清理定时器
 * - 成功任务展示结果：MJ imageUrl 缩略图、Suno audio/video 链接
 *
 * 鉴权说明：/v1/mj/* 与 /v1/suno/* 走 API Key 鉴权（apiKeyAuth，非登录 JWT），
 * 与后端 task-relay.ts 契约一致。页面沿用 Playground 的完整 Key 模式：
 * 自动从 localStorage（3cloud_last_raw_key）预填最近创建的 Key，支持手动粘贴。
 *
 * 接口契约（对齐 api/src/routes/task-relay.ts，经 vite proxy /api/ → :3000 转发，
 * 前端路径为 /api/v1 + /v1/... 拼接）：
 *   POST /v1/mj/submit/:action   → { code, result: taskId, status }；错误 { code, description }
 *   GET  /v1/mj/task/:id/fetch   → 直接返回任务 DTO；未找到 { code: 4, description: "task_no_found" }
 *   POST /v1/suno/submit/:action → { code: "success", data: taskId }
 *   GET  /v1/suno/fetch/:id      → { code: "success", data: TaskDto | null }
 *
 * @see api/src/routes/task-relay.ts（后端任务 API 契约）
 * @see docs/PRODUCT-DESIGN-PRINCIPLES.md（[?] 帮助说明原则）
 * @module pages/MJSTasksPage
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  PageHeader,
  Panel,
  Tag,
  Table,
  SkeletonGroup,
  EmptyState,
  HelpIcon,
  CopyButton,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef, TagType } from "@3cloud/shared-ui";

/** 任务类型：midjourney | suno */
type TaskType = "mj" | "suno";

/** MJ 动作（对齐后端 MJ_ACTION_MODEL 计费映射） */
const MJ_ACTIONS = [
  "imagine",
  "describe",
  "blend",
  "change",
  "simple-change",
  "action",
  "modal",
  "video",
  "edits",
  "shorten",
] as const;

/** Suno 动作（对齐后端 SUNO_ACTION_MODEL） */
const SUNO_ACTIONS = ["MUSIC", "LYRICS"] as const;

/** 任务依赖动作：需要引用原任务 taskId（对齐后端 TASK_DEPENDENT_ACTIONS） */
const DEPENDENT_ACTIONS = new Set(["change", "simple-change", "action", "modal", "video", "edits"]);

/** 轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 3000;

/** 进行中的状态集合（需要持续轮询） */
const IN_PROGRESS_STATUS = new Set(["submitted", "queueing", "processing", "unknown"]);

/** MJ 动作 → 下拉展示文案 */
const MJ_ACTION_LABELS: Record<string, string> = {
  imagine: "imagine（文生图）",
  describe: "describe（图生文）",
  blend: "blend（图融合）",
  change: "change（放大/变换，需 taskId）",
  "simple-change": "simple-change（简单变换，需 taskId）",
  action: "action（动作，需 taskId）",
  modal: "modal（局部重绘，需 taskId）",
  video: "video（视频，需 taskId）",
  edits: "edits（编辑，需 taskId）",
  shorten: "shorten（精简 prompt）",
};

/** Suno 动作 → 下拉展示文案 */
const SUNO_ACTION_LABELS: Record<string, string> = {
  MUSIC: "MUSIC（生成音乐）",
  LYRICS: "LYRICS（生成歌词）",
};

/** 任务列表行数据（客户端本地维护，提交/轮询增量更新） */
interface TaskItem {
  id: string;
  type: TaskType;
  action: string;
  prompt: string;
  status: string;
  progress?: string;
  failReason?: string;
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
  mock?: boolean;
  createdAt: number;
}

/** /me/keys 返回的 Key 行（仅前缀，无完整 Key） */
interface ApiKeyRow {
  id: number;
  name: string;
  keyPrefix: string;
  status: string;
}

/** 表单控件统一样式（对齐 Playground 页内联样式风格） */
const controlStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  fontSize: 13,
  boxSizing: "border-box",
  background: "#fff",
};

/**
 * 解析 fetch 响应体为 JSON；空/非法响应返回 {}（调用方按无结果处理）
 *
 * @param res - fetch Response
 * @returns 解析后的响应体（可能为 {}）
 */
async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const data = (await res.json()) as unknown;
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * MJ 状态归一化（对齐后端 MJ_STATUS_MAP 的大写语义与 DB 枚举）
 *
 * SUCCESS/FAILURE/IN_PROGRESS（novicezk 语义）与 submitted/queueing/processing/
 * success/failed/expired（DB 枚举）统一归一为小写 DB 枚举。
 *
 * @param status - 原始状态（可能为 undefined）
 * @returns 归一化后的状态
 */
function normalizeMjStatus(status: string | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "SUCCESS": return "success";
    case "FAILURE":
    case "FAILED": return "failed";
    case "IN_PROGRESS":
    case "PROCESSING": return "processing";
    case "QUEUEING": return "queueing";
    case "SUBMITTED": return "submitted";
    case "EXPIRED": return "expired";
    default: return (status ?? "unknown").toLowerCase();
  }
}

/**
 * 状态 → 徽章样式（spec 约定：submitted 蓝 / processing 黄 / success 绿 / failed 红）
 *
 * @param status - 归一化后的任务状态
 * @returns Tag 类型与中文文案
 */
function statusMeta(status: string): { type: TagType; label: string } {
  switch (status) {
    case "submitted": return { type: "blue", label: "已提交" };
    case "queueing": return { type: "blue", label: "排队中" };
    case "processing": return { type: "orange", label: "处理中" };
    case "success": return { type: "green", label: "成功" };
    case "failed": return { type: "red", label: "失败" };
    case "expired": return { type: "red", label: "超时" };
    default: return { type: "gray", label: status || "未知" };
  }
}

/** 判断任务是否处于进行中（需要轮询） */
function isInProgress(status: string): boolean {
  return IN_PROGRESS_STATUS.has(status);
}

/**
 * 归一化 fetch 响应 → 任务字段增量
 *
 * 兼容两种形态：
 * - 任务描述契约 { code: 0, result: {...} }（MJ）
 * - 后端实际实现：MJ 直接返回 DTO；Suno 返回 { code: "success", data: TaskDto | null }
 *
 * 任务不存在（MJ code:4 / Suno data:null）也返回失败增量，调用方无需区分。
 *
 * @param type - 任务类型
 * @param raw - fetch 响应体
 * @returns 需要合并进任务行的字段增量；完全无法识别时返回 null
 */
function normalizeFetched(type: TaskType, raw: Record<string, unknown>): Partial<TaskItem> | null {
  if (type === "mj") {
    // MJ 未找到（New API 语义）：{ code: 4, description: "task_no_found" }（HTTP 200）
    if (raw.code === 4) {
      return { status: "failed", failReason: "任务不存在（task_no_found）" };
    }
    // 契约形态 { code: 0, result: {...} }；后端实际直接返回 DTO，两种都兼容
    const d = raw.result && typeof raw.result === "object"
      ? (raw.result as Record<string, unknown>)
      : raw;
    if (d.code === 4) {
      return { status: "failed", failReason: "任务不存在（task_no_found）" };
    }
    const status = normalizeMjStatus(typeof d.status === "string" ? d.status : undefined);
    const image = typeof d.imageUrl === "string"
      ? d.imageUrl
      : typeof d.image_url === "string"
        ? d.image_url
        : undefined;
    return {
      status,
      progress: typeof d.progress === "string" ? d.progress : undefined,
      failReason: typeof d.failReason === "string"
        ? d.failReason
        : typeof d.description === "string"
          ? d.description
          : undefined,
      imageUrl: image,
    };
  }

  // Suno：{ code: "success", data: TaskDto | null }
  const data = raw.data;
  if (!data || typeof data !== "object") {
    return { status: "failed", failReason: "任务不存在或已过期" };
  }
  const rec = data as Record<string, unknown>;
  const audio = typeof rec.audio_url === "string" ? rec.audio_url : typeof rec.audioUrl === "string" ? rec.audioUrl : undefined;
  const video = typeof rec.video_url === "string" ? rec.video_url : typeof rec.videoUrl === "string" ? rec.videoUrl : undefined;
  const image = typeof rec.image_url === "string" ? rec.image_url : typeof rec.imageUrl === "string" ? rec.imageUrl : undefined;
  return {
    status: normalizeMjStatus(typeof rec.status === "string" ? rec.status : undefined),
    failReason: typeof rec.fail_reason === "string"
      ? rec.fail_reason
      : typeof rec.failReason === "string"
        ? rec.failReason
        : undefined,
    audioUrl: audio,
    videoUrl: video,
    imageUrl: image,
  };
}

export default function MJSTasksPage() {
  const { toast } = useToast();

  // ── 提交表单状态 ──
  const [taskType, setTaskType] = useState<TaskType>("mj");
  const [action, setAction] = useState<string>("imagine");
  const [prompt, setPrompt] = useState("");
  const [taskId, setTaskId] = useState("");
  const [fullKey, setFullKey] = useState<string>(() => {
    // 完整 Key 仅在创建时返回一次，Playground 同款预填（本地试用便利）
    try { return localStorage.getItem("3cloud_last_raw_key") ?? ""; } catch { return ""; }
  });
  const [submitting, setSubmitting] = useState(false);

  // ── 任务列表状态（客户端本地维护）──
  const [tasks, setTasks] = useState<TaskItem[]>([]);

  // ── 轮询 refs（避免定时器闭包读取过期状态）──
  const tasksRef = useRef<TaskItem[]>([]);
  const fullKeyRef = useRef<string>(fullKey);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollBusyRef = useRef(false);

  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { fullKeyRef.current = fullKey; }, [fullKey]);

  /** 可用 Key 列表（仅前缀，用于提示当前生效 Key） */
  const { data: keys, isLoading: keysLoading } = useQuery<ApiKeyRow[]>({
    queryKey: ["me-keys"],
    queryFn: async () => (await api.get<ApiKeyRow[]>("/me/keys")).data,
  });

  const actionOptions = taskType === "mj" ? MJ_ACTIONS : SUNO_ACTIONS;
  const actionLabels = taskType === "mj" ? MJ_ACTION_LABELS : SUNO_ACTION_LABELS;
  const isDependent = DEPENDENT_ACTIONS.has(action);
  /** 当前进行中的任务数（mock 占位任务不可轮询，不计入） */
  const inFlightCount = tasks.filter((t) => !t.mock && isInProgress(t.status)).length;

  const switchType = (next: TaskType) => {
    setTaskType(next);
    setAction(next === "mj" ? "imagine" : "MUSIC");
  };

  /**
   * 提交任务：POST /v1/mj/submit/:action 或 /v1/suno/submit/:action
   *
   * 成功（拿到任务 ID）→ 加入任务列表并自动进入轮询；失败 → toast 展示错误。
   * 任务依赖动作（change/simple-change/...）需携带 body.taskId 引用原任务。
   */
  const handleSubmit = async () => {
    const key = fullKey.trim();
    if (!key) {
      toast.error("请先填写完整 API Key——在「API Key 管理」创建后复制，最近创建的一条已自动预填");
      return;
    }
    if (!isDependent && !prompt.trim()) {
      toast.error("请输入 prompt");
      return;
    }
    if (isDependent && !taskId.trim()) {
      toast.error(`动作 ${action} 需要引用原任务，请填写 taskId`);
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { prompt: prompt.trim() };
      if (isDependent) body.taskId = taskId.trim();
      const url = `/api/v1/v1/${taskType}/submit/${action}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
      const data = await parseJson(res);

      // MJ：result 字段；Suno：data 字段（mock 回退同样返回占位 id）
      const taskIdFromResp = taskType === "mj" ? data.result : data.data;
      if (typeof taskIdFromResp === "string" && taskIdFromResp) {
        const item: TaskItem = {
          id: taskIdFromResp,
          type: taskType,
          action,
          prompt: prompt.trim(),
          status: "submitted",
          mock: data.mock === true,
          createdAt: Date.now(),
        };
        setTasks((prev) => [item, ...prev]);
        toast.success(`任务已提交，ID：${taskIdFromResp}`);
        if (isDependent) setTaskId("");
        else setPrompt("");
      } else {
        const msg = typeof data.description === "string"
          ? data.description
          : data.error && typeof data.error === "object"
            ? String((data.error as Record<string, unknown>).message ?? "")
            : `提交失败（HTTP ${res.status}）`;
        toast.error(msg || `提交失败（HTTP ${res.status}）`);
      }
    } catch (err) {
      toast.error(`网络错误：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * 单轮轮询：对全部进行中任务并发 fetch 最新状态并合并
   *
   * - 前一秒轮询未完成则跳过本轮（pollBusyRef 防重入）
   * - 网络异常保持原状态（下轮重试）；HTTP 错误/任务不存在 → 标记失败
   */
  const pollOnce = useCallback(async () => {
    if (pollBusyRef.current) return;
    const inFlight = tasksRef.current.filter((t) => !t.mock && isInProgress(t.status));
    if (inFlight.length === 0) return;
    const key = fullKeyRef.current.trim();
    if (!key) return;
    pollBusyRef.current = true;
    try {
      const results = await Promise.all(inFlight.map(async (t) => {
        const url = t.type === "mj"
          ? `/api/v1/v1/mj/task/${encodeURIComponent(t.id)}/fetch`
          : `/api/v1/v1/suno/fetch/${encodeURIComponent(t.id)}`;
        try {
          const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
          if (!res.ok) {
            return { id: t.id, patch: { status: "failed", failReason: `查询失败（HTTP ${res.status}）` } as Partial<TaskItem> };
          }
          const patch = normalizeFetched(t.type, await parseJson(res));
          if (!patch) {
            return { id: t.id, patch: { status: "failed", failReason: "任务不存在或已过期" } as Partial<TaskItem> };
          }
          return { id: t.id, patch };
        } catch {
          // 瞬时网络异常：保留进行中状态，下一轮自动重试
          return { id: t.id, patch: null };
        }
      }));
      setTasks((prev) => prev.map((t) => {
        const r = results.find((x) => x.id === t.id);
        if (!r || !r.patch) return t;
        return { ...t, ...r.patch };
      }));
    } finally {
      pollBusyRef.current = false;
    }
  }, []);

  // 自动轮询：每 3 秒执行一轮；组件卸载时清理定时器
  useEffect(() => {
    pollTimerRef.current = setInterval(() => { void pollOnce(); }, POLL_INTERVAL_MS);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    };
  }, [pollOnce]);

  const handleClear = () => {
    setTasks([]);
    toast.info("任务列表已清空（仅清本地展示，不影响后端任务记录）");
  };

  const columns: ColumnDef<TaskItem>[] = [
    {
      key: "id",
      title: "任务 ID",
      width: "240px",
      render: (_, r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-family-mono)", fontSize: 12 }}>
          <span title={r.id}>{r.id.length > 26 ? `${r.id.slice(0, 26)}…` : r.id}</span>
          <CopyButton text={r.id} />
        </span>
      ),
    },
    {
      key: "type",
      title: "类型",
      width: "80px",
      render: (_, r) => <Tag type={r.type === "mj" ? "purple" : "blue"}>{r.type === "mj" ? "MJ" : "Suno"}</Tag>,
    },
    { key: "action", title: "动作", width: "120px", dataIndex: "action" },
    {
      key: "prompt",
      title: "Prompt",
      render: (_, r) => (
        <span
          title={r.prompt}
          style={{ maxWidth: 240, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}
        >
          {r.prompt || "—"}
        </span>
      ),
    },
    {
      key: "status",
      title: "状态",
      width: "110px",
      render: (_, r) => {
        const m = statusMeta(r.status);
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Tag type={m.type}>{m.label}</Tag>
            {r.mock && <Tag type="gray">模拟</Tag>}
          </span>
        );
      },
    },
    {
      key: "progress",
      title: "进度",
      width: "80px",
      render: (_, r) => (r.progress ? <span>{r.progress}</span> : <span style={{ color: "#999" }}>—</span>),
    },
    {
      key: "failReason",
      title: "失败原因",
      render: (_, r) => (
        <span
          title={r.failReason ?? ""}
          style={{ color: "var(--color-danger-text)", fontSize: 12, maxWidth: 200, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}
        >
          {r.failReason ?? "—"}
        </span>
      ),
    },
    {
      key: "result",
      title: "结果",
      width: "170px",
      render: (_, r) => {
        if (r.imageUrl) {
          return (
            <a href={r.imageUrl} target="_blank" rel="noreferrer" title={r.imageUrl}>
              <img
                src={r.imageUrl}
                alt="任务结果"
                style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, border: "1px solid #eee", display: "block" }}
              />
            </a>
          );
        }
        if (r.audioUrl) {
          return <audio src={r.audioUrl} controls preload="none" style={{ maxWidth: 160, height: 32 }} />;
        }
        if (r.videoUrl) {
          return <a href={r.videoUrl} target="_blank" rel="noreferrer">查看视频 ↗</a>;
        }
        return <span style={{ color: "#999" }}>—</span>;
      },
    },
    {
      key: "createdAt",
      title: "提交时间",
      width: "150px",
      render: (_, r) => (
        <span style={{ fontSize: 12, color: "#666" }}>
          {new Date(r.createdAt).toLocaleString("zh-CN", { hour12: false })}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="MJ / Suno 任务中心"
        help="提交 Midjourney / Suno 任务型模型请求并实时跟踪状态：选择任务类型与动作、填写 prompt 提交，页面每 3 秒自动轮询进行中任务。适用角色：所有登录用户。核心操作：1) 填写完整 API Key（任务接口按 API Key 鉴权）；2) 选择类型与动作提交任务（提交即按任务单价计费）；3) 在任务列表查看状态/进度/失败原因，成功任务可直接查看图片或试听音频。注意事项：change/simple-change 等动作需先引用原任务 ID；任务失败或超时由平台自动退款；模拟任务（无可用供应商时返回的 mock-task- 开头占位 ID）不可轮询。"
      />

      {/* 提交面板 */}
      <Panel
        title="🎨 提交任务"
        help="选择任务类型与动作并填写 prompt 提交：MJ 支持 imagine/describe/blend/change/simple-change/action/modal/video/edits/shorten；Suno 支持 MUSIC/LYRICS。任务依赖动作（change/simple-change/action/modal/video/edits）需填写引用的原任务 ID。"
      >
        {/* API Key（/v1/mj、/v1/suno 走 API Key 鉴权，非登录 JWT） */}
        <div className="c3-form-group">
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            完整 API Key
            <HelpIcon text="任务型接口（/v1/mj、/v1/suno）使用 API Key（Authorization: Bearer sk-...）鉴权，而非登录 JWT。最近创建的一条已自动预填（localStorage），可手动粘贴替换；无 Key 请到「API Key 管理」创建。" />
          </label>
          <input
            type="text"
            value={fullKey}
            onChange={(e) => setFullKey(e.target.value)}
            placeholder="粘贴完整 API Key（3c_...）— 列表仅展示前缀，最近创建的一条已自动填入"
            style={{ ...controlStyle, maxWidth: 520, fontFamily: "var(--font-family-mono)" }}
            autoComplete="off"
            spellCheck={false}
          />
          {keysLoading ? (
            <div style={{ marginTop: 6 }}><SkeletonGroup lines={1} /></div>
          ) : keys && keys.length > 0 ? (
            <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>
              可用 Key：{keys.map((k) => `${k.name}（${k.keyPrefix}…）`).join("、")}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#e53935", marginTop: 6 }}>
              暂无可用 API Key，请先到「API Key 管理」创建
            </div>
          )}
        </div>

        {/* 类型 / 动作 / taskId */}
        <div style={{ display: "grid", gridTemplateColumns: "180px 260px 1fr", gap: 12, marginBottom: 12 }}>
          <div className="c3-form-group">
            <label>任务类型</label>
            <select value={taskType} onChange={(e) => switchType(e.target.value as TaskType)} style={controlStyle}>
              <option value="mj">Midjourney（绘图）</option>
              <option value="suno">Suno（音乐/歌词）</option>
            </select>
          </div>
          <div className="c3-form-group">
            <label>
              动作
              <HelpIcon text="提交到 /v1/mj/submit/:action 或 /v1/suno/submit/:action 的动作参数；带「需 taskId」的动作会显示引用任务 ID 输入框。" />
            </label>
            <select value={action} onChange={(e) => setAction(e.target.value)} style={controlStyle}>
              {actionOptions.map((a) => (
                <option key={a} value={a}>{actionLabels[a] ?? a}</option>
              ))}
            </select>
          </div>
          {isDependent && (
            <div className="c3-form-group">
              <label>
                引用任务 ID（taskId）*
                <HelpIcon text="change/simple-change/action/modal/video/edits 等动作作用于已存在的任务，需填写该原任务的 ID（从下方任务列表复制）；后端会锁定到原渠道执行。" />
              </label>
              <input
                type="text"
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                placeholder="粘贴原任务 ID"
                style={{ ...controlStyle, fontFamily: "var(--font-family-mono)" }}
              />
            </div>
          )}
        </div>

        {/* Prompt（始终展示；change 类动作可选） */}
        <div className="c3-form-group" style={{ marginBottom: 12 }}>
          <label>
            Prompt {isDependent ? "（可选）" : "*"}
            <HelpIcon text="任务提示词：MJ imagine 为绘图描述；describe/blend 可附带图片 base64（body.base64）；Suno MUSIC/LYRICS 为音乐/歌词描述。change 类动作可不填。" />
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="输入 prompt（如：a cute cat, watercolor style）"
            rows={3}
            style={{ ...controlStyle, resize: "vertical" }}
          />
        </div>

        <div className="c3-btn-group">
          <button
            type="button"
            className="c3-btn c3-btn--primary"
            disabled={submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? "提交中…" : "🚀 提交任务"}
          </button>
          <HelpIcon text="提交任务：提交成功即按任务单价计费并返回任务 ID，加入下方任务列表自动轮询；失败/超时自动退款。" />
        </div>
      </Panel>

      {/* 任务列表 */}
      <Panel
        title="📋 任务列表"
        help="展示本页提交的任务（客户端本地记录，刷新页面后清空）：每 3 秒自动轮询进行中任务的状态；成功任务展示图片/音频结果；失败任务展示失败原因。任务状态：已提交（蓝）/ 处理中（黄）/ 成功（绿）/ 失败（红）。"
        extra={
          <div className="c3-btn-group">
            <span
              style={{
                fontSize: 12,
                color: inFlightCount > 0 ? "#16a34a" : "#999",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: inFlightCount > 0 ? "#16a34a" : "#ccc",
                  display: "inline-block",
                }}
              />
              {inFlightCount > 0 ? `自动轮询中（${inFlightCount} 个任务，每 3 秒）` : "轮询空闲"}
            </span>
            <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => void pollOnce()}>
              立即刷新
            </button>
            <HelpIcon text="立即查询所有进行中任务的最新状态；页面也会每 3 秒自动轮询。" />
            <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={handleClear}>
              清空列表
            </button>
            <HelpIcon text="清空当前页面的任务列表（仅清本地展示，不影响后端任务记录）。" />
          </div>
        }
      >
        {tasks.length === 0 ? (
          <EmptyState icon="🎨" title="暂无任务" description="在上方表单提交 MJ / Suno 任务后，任务列表与实时状态将展示在这里" />
        ) : (
          <Table columns={columns} dataSource={tasks} rowKey="id" />
        )}
      </Panel>
    </>
  );
}
