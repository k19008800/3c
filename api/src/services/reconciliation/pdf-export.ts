// ============================================================
//  对账报告PDF导出服务
// ============================================================

import { getDb } from "../../db/index.js";
import { eq } from "drizzle-orm";
import {
  reconciliationReports,
  reconciliationMismatches,
} from "../../db/schema.js";
import { getReconciliationReportDetail } from "./auto-reconciliation.js";

/**
 * 生成对账报告PDF内容
 */
export async function generateReconciliationPDF(reportId: number): Promise<{
  content: string; // HTML内容，用于PDF生成
  title: string;
}> {
  // 获取报告详情
  const { report, mismatches } = await getReconciliationReportDetail(reportId);

  // 构建HTML内容
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>对账报告 #${report.id}</title>
  <style>
    body { font-family: 'Helvetica', 'Arial', sans-serif; margin:与社会; padding: 20px; color: #333; }
    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #4f46e5; padding-bottom: 20px; }
    .header h1 { color: #4f46e5; margin: 0; font-size: jobs; }
    .header .subtitle { color: #6b7280; margin-top: 5px; }
    .summary { background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 30px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
    .summary-item { text-align: center; padding: 15px; background: white; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .summary-label { color: #6b7280; font-size: 14px; margin-bottom: 5px; }
    .summary-value { font-size: 24px; font-weight: bold; }
    .summary-value.matched { color: #10b981; }
    .summary-value.mismatched { color: #ef4444; }
    .section { margin-bottom: 25px; }
    .section-title { font-size: 18px; font-weight: bold; color: #4f46e5; margin-bottom: 15px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
    .details-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .details-table th { background: #f3f4f6; text-align: left; padding: 12px; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; }
    .details-table td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
    .details-table tr:nth-child(even) { background: #f9fafb; }
    .severity-badge { padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 500; }
    .severity-low { background: #dbeafe; color: #1d4ed8; }
    .severity-medium { background: #fef3c7; color: #d97706; }
    .severity-high { background: #fde68a; color: #ea580c; }
    .severity-critical { background: #fecaca; color: #dc2626; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px; }
    .status-badge { padding: 4px 12px; border-radius: 16px; font-size: 12px; font-weight: 500; }
    .status-completed { background: #d1fae5; color: #059669; }
    .status-running { background: #dbeafe; color: #2563eb; }
    .status-failed { background: #fee2e2; color: #dc2626; }
    .status-pending { background: #f3f4f6; color: #6b7280; }
  </style>
</head>
<body>
  <div class="header">
    <h1>3cloud 财务对账报告</h1>
    <div class="subtitle">报告编号: #${report.id} | 生成时间: ${new Date().toLocaleString('zh-CN')}</div>
  </div>

  <div class="summary">
    <h2 class="section-title">报告概览</h2>
    <div class="summary-grid">
      <div class="summary-item">
        <div class="summary-label">时间范围</div>
        <div class="summary-value">${report.startDate} ~ ${report.endDate}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">对账类型</div>
        <div class="summary-value">${
          report.reconType === 'full' ? '全部对账' :
          report.reconType === 'recharge' ? '充值订单' :
          report.reconType === 'balance' ? '余额检查' : '佣金验证'
        }</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">总订单数</div>
        <div class="summary-value">${report.totalOrders}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">状态</div>
        <div class="status-badge status-${report.status}">
          ${
            report.status === 'completed' ? '完成' :
            report.status === 'running' ? '执行中' :
            report.status === 'failed' ? '失败' : '待执行'
          }
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">对账结果</h2>
    <div class="summary-grid">
      <div class="summary-item">
        <div class="summary-label">匹配订单数</div>
        <div class="summary-value matched">${report.matchedOrders}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">异常订单数</div>
        <div class="summary-value mismatched">${report.mismatchedOrders}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">总金额</div>
        <div class="summary-value">¥${parseFloat(report.totalAmount).toFixed(2)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">差额</div>
        <div class="summary-value ${parseFloat(report.difference) > 0 ? 'mismatched' : ''}">
          ¥${parseFloat(report.difference).toFixed(2)}
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">异常明细 ${mismatches.length > 0 ? `(${mismatches.length} 条)` : ''}</h2>
    ${
      mismatches.length === 0 
        ? '<p style="text-align: center; color: #6b7280; padding: 20px;">无异常记录</p>'
        : `
        <table class="details-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>关联类型</th>
              <th>异常类型</th>
              <th>严重级别</th>
              <th>期望值</th>
              <th>实际值</th>
              <th>原因</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            ${mismatches.map(m => `
              <tr>
                <td>${m.id}</td>
                <td>${m.refType}</td>
                <td>${m.mismatchType}</td>
                <td><span class="severity-badge severity-${m.severity}">${
                  m.severity === 'low' ? '低' :
                  m.severity === 'medium' ? '中' :
                  m.severity === 'high' ? '高' : '严重'
                }</span></td>
                <td>${m.expectedValue || '-'}</td>
                <td>${m.actualValue || '-'}</td>
                <td style="max-width: 200px;">${m.reason}</td>
                <td>${m.resolved ? '✅ 已解决' : '⚠️ 待处理'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        `
    }
  </div>

  ${report.errorMessage ? `
  <div class="section">
    <h2 class="section-title">错误信息</h2>
    <div style="background: #fee2e2; padding:174, border-radius: 6px; color: #dc2626;">
      ${report.errorMessage}
    </div>
  </div>
  ` : ''}

  <div class="footer">
    <p>本报告由 3cloud 财务对账系统自动生成</p>
    <p>报告生成时间: ${new Date().toLocaleString('zh-CN')} | 报告ID: #${report.id}</p>
  </div>
</body>
</html>
  `;

  return {
    content: html,
    title: `对账报告_${report.startDate}_${report.endDate}_#${report.id}.pdf`,
  };
}

/**
 * 导出对账报告为PDF（简化版本 - 返回HTML，实际项目中可使用puppeteer或第三方服务生成PDF）
 */
export async function exportReconciliationPDF(reportId: number): Promise<{
  html: string;
  fileName: string;
}> {
  const { content, title } = await generateReconciliationPDF(reportId);
  
  return {
    html: content,
    fileName: title,
  };
}