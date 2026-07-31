// ============================================================
//  3cloud (3C) — 资金报表中心服务（SPEC-§29.5）
//  生成日报/周报/月报资金报表（JSON 数据 + HTML 渲染）
//  定时推送配置存储
// ============================================================

import { eq, and, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  balanceLogs,
  rechargeOrders,
  withdrawOrders,
  refundRequests,
  users,
  agents,
  systemConfigs,
} from "../db/schema.js";
import { AppError } from "./auth-service/index.js";

export type ReportType = "daily" | "weekly" | "monthly";

interface DateRange {
  start: string;
  end: string;
  label: string;
}

export function getReportRange(type: ReportType, date?: string): DateRange {
  const base = date ? new Date(date) : new Date();
  const y = base.getFullYear();
  const m = base.getMonth();
  const d = base.getDate();

  const fmt = (dt: Date) => {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  };

  if (type === "daily") {
    const start = fmt(base);
    return { start, end: start, label: `${start} 资金日报` };
  }
  if (type === "weekly") {
    const day = base.getDay() || 7; // 周一=1, 周日=7
    const monday = new Date(y, m, d - day + 1);
    const sunday = new Date(y, m, d - day + 7);
    return { start: fmt(monday), end: fmt(sunday), label: `${fmt(monday)} ~ ${fmt(sunday)} 资金周报` };
  }
  // monthly
  const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, label: `${y} 年 ${m + 1} 月资金月报` };
}

// ── 聚合区间数据 ──
async function aggregateRange(start: string, end: string) {
  const db = getDb();

  // 收入：充值（confirmed）
  const [recharge] = await db
    .select({ total: sql<string>`coalesce(sum(${rechargeOrders.amount}), 0)` })
    .from(rechargeOrders)
    .where(and(
      eq(rechargeOrders.status, "confirmed"),
      gte(sql`DATE(${rechargeOrders.createdAt})`, start),
      lte(sql`DATE(${rechargeOrders.createdAt})`, end),
    ));

  // 收入：消费（平台收入 = consumption）
  const [consumption] = await db
    .select({ total: sql<string>`coalesce(sum(abs(${balanceLogs.amount})), 0)` })
    .from(balanceLogs)
    .where(and(
      eq(balanceLogs.type, "consumption"),
      gte(sql`DATE(${balanceLogs.createdAt})`, start),
      lte(sql`DATE(${balanceLogs.createdAt})`, end),
    ));

  // 支出：退款
  const [refund] = await db
    .select({ total: sql<string>`coalesce(sum(${refundRequests.amount}), 0)` })
    .from(refundRequests)
    .where(and(
      sql`${refundRequests.status} IN ('pending', 'completed', 'approved')`,
      gte(sql`DATE(${refundRequests.createdAt})`, start),
      lte(sql`DATE(${refundRequests.createdAt})`, end),
    ));

  // 支出：提现
  const [withdraw] = await db
    .select({ total: sql<string>`coalesce(sum(${withdrawOrders.amount}), 0)` })
    .from(withdrawOrders)
    .where(and(
      sql`${withdrawOrders.status} IN ('paid', 'approved', 'pending_second_review')`,
      gte(sql`DATE(${withdrawOrders.createdAt})`, start),
      lte(sql`DATE(${withdrawOrders.createdAt})`, end),
    ));

  return {
    rechargeTotal: parseFloat(String(recharge?.total ?? 0)),
    consumptionTotal: parseFloat(String(consumption?.total ?? 0)),
    refundTotal: parseFloat(String(refund?.total ?? 0)),
    withdrawTotal: parseFloat(String(withdraw?.total ?? 0)),
  };
}

// ── 生成报表 ──
export async function generateFinanceReport(type: ReportType, date?: string) {
  const db = getDb();
  const range = getReportRange(type, date);
  const data = await aggregateRange(range.start, range.end);

  // 供应商结算 & 佣金（尝试，表可能为空）
  let vendorSettlementTotal = 0;
  let agentCommissionTotal = 0;
  try {
    const { vendorSettlements } = await import("../db/schema.js");
    const [vs] = await db
      .select({ total: sql<string>`coalesce(sum(${vendorSettlements.totalAmount}), 0)` })
      .from(vendorSettlements)
      .where(and(
        sql`${vendorSettlements.status} IN ('confirmed', 'settled')`,
        gte(sql`DATE(${vendorSettlements.periodEnd})`, range.start),
        lte(sql`DATE(${vendorSettlements.periodEnd})`, range.end),
      ));
    vendorSettlementTotal = parseFloat(String(vs?.total ?? 0));
  } catch { /* ignore */ }

  try {
    const { agentSettlements } = await import("../db/schema.js");
    const [as] = await db
      .select({ total: sql<string>`coalesce(sum(${agentSettlements.settledAmount}), 0)` })
      .from(agentSettlements)
      .where(and(
        sql`${agentSettlements.status} IN ('settled', 'confirmed', 'auto_confirmed')`,
        gte(sql`DATE(${agentSettlements.createdAt})`, range.start),
        lte(sql`DATE(${agentSettlements.createdAt})`, range.end),
      ));
    agentCommissionTotal = parseFloat(String(as?.total ?? 0));
  } catch { /* ignore */ }

  const incomeTotal = data.rechargeTotal + data.consumptionTotal;
  const expenseTotal = data.refundTotal + data.withdrawTotal + vendorSettlementTotal + agentCommissionTotal;
  const netFlow = incomeTotal - expenseTotal;

  // 平台余额（当前）
  const [balance] = await db
    .select({ total: sql<string>`coalesce(sum(${users.balance}), 0)` })
    .from(users);

  const report = {
    type,
    range,
    generatedAt: new Date().toISOString(),
    income: {
      recharge: data.rechargeTotal.toFixed(2),
      consumption: data.consumptionTotal.toFixed(2),
      creditRepayment: "0.00",
      total: incomeTotal.toFixed(2),
    },
    expense: {
      vendorSettlement: vendorSettlementTotal.toFixed(2),
      agentCommission: agentCommissionTotal.toFixed(2),
      withdraw: data.withdrawTotal.toFixed(2),
      refund: data.refundTotal.toFixed(2),
      total: expenseTotal.toFixed(2),
    },
    netFlow: netFlow.toFixed(2),
    platformBalance: String(balance?.total ?? 0),
    reportUrl: `/reports/${type}-${range.start}.pdf`,
  };

  return report;
}

// ── 渲染 HTML（PDF 下载用） ──
export function renderReportHtml(report: any): string {
  const money = (v: string) => `¥${parseFloat(v).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>${report.range.label}</title>
<style>
body{font-family:"Microsoft YaHei",sans-serif;max-width:720px;margin:40px auto;color:#333;padding:0 20px}
h1{font-size:22px;border-bottom:2px solid #4a7;padding-bottom:10px}
h2{font-size:16px;color:#4a7;margin-top:28px}
table{width:100%;border-collapse:collapse;margin:10px 0}
td{padding:8px 10px;border-bottom:1px solid #eee}
td:last-child{text-align:right;font-variant-numeric:tabular-nums}
.total{font-weight:bold;background:#f5f8f5}
.net{font-size:18px;color:#c33;font-weight:bold;margin:16px 0}
.meta{color:#888;font-size:13px;margin-bottom:20px}
</style></head>
<body>
<h1>3Cloud 资金报表</h1>
<div class="meta">${report.range.label}<br>生成时间：${new Date(report.generatedAt).toLocaleString("zh-CN")}</div>

<h2>一、收入</h2>
<table>
<tr><td>用户充值</td><td>${money(report.income.recharge)}</td></tr>
<tr><td>用户消费（平台收入）</td><td>${money(report.income.consumption)}</td></tr>
<tr><td>信用还款</td><td>${money(report.income.creditRepayment)}</td></tr>
<tr class="total"><td>收入合计</td><td>${money(report.income.total)}</td></tr>
</table>

<h2>二、支出</h2>
<table>
<tr><td>供应商结算</td><td>${money(report.expense.vendorSettlement)}</td></tr>
<tr><td>代理佣金</td><td>${money(report.expense.agentCommission)}</td></tr>
<tr><td>提现</td><td>${money(report.expense.withdraw)}</td></tr>
<tr><td>退款</td><td>${money(report.expense.refund)}</td></tr>
<tr class="total"><td>支出合计</td><td>${money(report.expense.total)}</td></tr>
</table>

<div class="net">三、净流入：${money(report.netFlow)}</div>
<div>平台余额：${money(report.platformBalance)}</div>
</body></html>`;
}

// ── 定时推送配置（存 system_configs） ──
const SCHEDULE_KEY_PREFIX = "finance_report_schedule_";

export async function getReportSchedules() {
  const db = getDb();
  const types: ReportType[] = ["daily", "weekly", "monthly"];
  const schedules: Record<string, any> = {};

  for (const type of types) {
    const [row] = await db
      .select({ value: systemConfigs.value })
      .from(systemConfigs)
      .where(eq(systemConfigs.key, SCHEDULE_KEY_PREFIX + type))
      .limit(1);
    if (row?.value) {
      try { schedules[type] = JSON.parse(row.value); } catch { schedules[type] = null; }
    } else {
      // 默认配置
      schedules[type] = {
        enabled: false,
        cronExpr: type === "daily" ? "0 9 * * *" : type === "weekly" ? "0 9 * * 1" : "0 10 1 * *",
        recipients: [],
      };
    }
  }
  return schedules;
}

export async function setReportSchedule(type: ReportType, input: {
  enabled: boolean;
  cronExpr?: string;
  recipients?: string[];
}) {
  const db = getDb();
  if (!["daily", "weekly", "monthly"].includes(type)) {
    throw new AppError("INVALID_TYPE", "报表类型必须为 daily/weekly/monthly", 400);
  }
  const current = (await getReportSchedules())[type] || {};
  const schedule = {
    enabled: input.enabled,
    cronExpr: input.cronExpr || current.cronExpr || "0 9 * * *",
    recipients: input.recipients || current.recipients || [],
    updatedAt: new Date().toISOString(),
  };

  const [existing] = await db
    .select({ id: systemConfigs.id })
    .from(systemConfigs)
    .where(eq(systemConfigs.key, SCHEDULE_KEY_PREFIX + type))
    .limit(1);

  if (existing) {
    // 用原始 SQL 更新（兼容实际表结构，避免 schema 与 DB 不同步导致 version 列报错）
    await db.execute(sql`
      UPDATE system_configs
      SET value = ${JSON.stringify(schedule)}, description = ${`资金报表定时推送配置（${type}）`}, updated_at = now()
      WHERE id = ${existing.id}
    `);
  } else {
    await db.execute(sql`
      INSERT INTO system_configs (key, value, description)
      VALUES (${SCHEDULE_KEY_PREFIX + type}, ${JSON.stringify(schedule)}, ${`资金报表定时推送配置（${type}）`})
    `);
  }
  return schedule;
}
