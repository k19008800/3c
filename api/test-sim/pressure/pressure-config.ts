// ============================================================
//  3cloud (3C) — 8小时压力测试配置（v2 — 负荷模式增强）
// ============================================================

export const PRESSURE_CONFIG = {
  apiBase: process.env.API_BASE || "http://localhost:3000",

  testDurationMs: 8 * 60 * 60 * 1000, // 8小时

  admin: {
    email: process.env.ADMIN_EMAIL || "admin@3cloud.dev",
    password: process.env.ADMIN_PASSWORD || "admin123",
  },

  // ── 负荷模式 ──
  // 定义 8 小时内的调用强度曲线（时间轴为分钟）
  // value: 0.0~1.0 相对强度系数
  loadCurve: [
    { startMin: 0,   durationMin: 45,  intensity: 0.15 }, // 设置阶段 — 低负载
    { startMin: 45,  durationMin: 30,  intensity: 0.30 }, // 充值阶段 — 中低
    { startMin: 75,  durationMin: 45,  intensity: 0.25 }, // 过渡 — 低
    { startMin: 120, durationMin: 90,  intensity: 0.60 }, // 爬坡 — 中
    { startMin: 210, durationMin: 120, intensity: 0.95 }, // 高峰 — 高负载
    { startMin: 330, durationMin: 90,  intensity: 0.70 }, // 回落 — 中高
    { startMin: 420, durationMin: 60,  intensity: 0.40 }, // 降载 — 中低
  ],

  // 基础并发（每个用户在其窗口内每 N 秒调用一次）
  baseCallIntervalMs: 8000,

  // 最大同时窗口内用户数
  maxConcurrentUserWindows: 20,

  // 同时调用的并发限制
  maxConcurrency: 8,

  // ── 用户规模 ──
  userCount: 30,       // 压力测试独立注册的用户数

  // ── 充值配置 ──
  recharge: {
    minAmount: 1,
    maxAmount: 300,
    bankTransferRatio: 0.25,
  },

  // ── Token 调用配置 ──
  tokenCalls: {
    model: "deepseek-chat",
    messages: [
      { role: "user", content: "用中文回答：请简要介绍人工智能的发展历史" },
      { role: "user", content: "写一首七言绝句描写夏天的夜晚" },
      { role: "user", content: "解释什么是机器学习中的监督学习和无监督学习" },
      { role: "user", content: "请列出云计算三种服务模式及其特点" },
      { role: "user", content: "用Python写一个快速排序算法的代码示例" },
      { role: "user", content: "翻译以下句子：The quick brown fox jumps over the lazy dog" },
      { role: "user", content: "总结一下区块链技术的主要应用场景" },
    ],
  },

  // ── 日志 ──
  logIntervalSec: 60,
  stateSaveIntervalMs: 5 * 60 * 1000, // 每 5 分钟保存一次状态
};

export function formatElapsed(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
}

export function getLoadIntensity(elapsedMs: number): number {
  const elapsedMin = elapsedMs / 60000;
  for (const seg of PRESSURE_CONFIG.loadCurve) {
    if (elapsedMin >= seg.startMin && elapsedMin < seg.startMin + seg.durationMin) {
      return seg.intensity;
    }
  }
  return 0.1; // 超出范围返回最低
}
