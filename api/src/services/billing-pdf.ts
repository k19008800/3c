// ============================================================
//  3cloud (3C) — 账单 PDF 生成服务
//  依赖: pdfkit (npm install pdfkit)
// ============================================================

import PDFDocument from "pdfkit";

interface BillingSummary {
  userName: string
  userId: number
  periodStart: string
  periodEnd: string
  generatedAt: string
  totalSpend: number
  totalCalls: number
  totalTokens: number
  modelSummary: { model: string; amount: number; pct: string }[]
  dailySummary: { date: string; amount: number }[]
}

export function generateInvoicePdf(data: BillingSummary): Buffer {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    // 字体设置（中文环境需指定中文字体，这里用内嵌字体）
    // 生产环境建议: doc.registerFont('NotoSansSC', 'path/to/NotoSansSC-Regular.ttf')
    
    // ── 页眉 ──
    doc.fontSize(24).font("Helvetica-Bold").text("3Cloud", { align: "center" })
    doc.fontSize(10).font("Helvetica").text("AI API 聚合平台 · 账单", { align: "center" })
    doc.moveDown(1.5)

    // 分隔线
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#cccccc")
    doc.moveDown(1)

    // ── 账单信息 ──
    doc.fontSize(14).font("Helvetica-Bold").text("账单信息")
    doc.moveDown(0.5)

    const infoItems = [
      ["用户", data.userName],
      ["用户 ID", `#${data.userId}`],
      ["账单周期", `${data.periodStart} ~ ${data.periodEnd}`],
      ["生成时间", data.generatedAt],
    ]
    infoItems.forEach(([label, value]) => {
      doc.fontSize(10).font("Helvetica-Bold").text(`${label}: `, { continued: true })
        .font("Helvetica").text(value)
    })

    doc.moveDown(1.5)

    // ── 汇总 ──
    doc.fontSize(14).font("Helvetica-Bold").text("消费汇总")
    doc.moveDown(0.5)

    const totalItems = [
      ["总消费", `¥${data.totalSpend.toFixed(2)}`],
      ["总调用", `${data.totalCalls.toLocaleString()} 次`],
      ["总 Token", `${data.totalTokens.toLocaleString()}`],
    ]
    const startX = 50
    let colX = startX
    const colW = 165
    totalItems.forEach(([label, value]) => {
      doc.rect(colX, doc.y, colW - 5, 45).fill("#f3f4f6")
      doc.fillColor("#333").fontSize(9).font("Helvetica")
        .text(label, colX + 8, doc.y + 6, { width: colW - 16, align: "center" })
      doc.fontSize(14).font("Helvetica-Bold")
        .text(value, colX + 8, doc.y + 18, { width: colW - 16, align: "center" })
      doc.fillColor("#000")
      colX += colW
    })
    doc.moveDown(4)

    // ── 模型汇总表 ──
    doc.fontSize(14).font("Helvetica-Bold").text("按模型汇总")
    doc.moveDown(0.5)

    // 表头
    const tableTop = doc.y
    const colWidths = [280, 100, 100]
    const headers = ["模型", "消费金额", "占比"]
    let cx = 50
    headers.forEach((h, i) => {
      doc.rect(cx, tableTop, colWidths[i], 20).fill("#1e40af")
      doc.fillColor("#fff").fontSize(9).font("Helvetica-Bold")
        .text(h, cx + 5, tableTop + 4, { width: colWidths[i] - 10, align: i === 0 ? "left" : "right" })
      doc.fillColor("#000")
      cx += colWidths[i]
    })
    doc.moveDown(2)

    // 行
    data.modelSummary.forEach((row, idx) => {
      const y = doc.y
      cx = 50
      const bgColor = idx % 2 === 0 ? "#ffffff" : "#f9fafb"
      headers.forEach((_, i) => {
        doc.rect(cx, y, colWidths[i], 18).fill(bgColor)
        cx += colWidths[i]
      })
      doc.fontSize(9).font("Helvetica")
      doc.text(row.model, 55, y + 3, { width: colWidths[0] - 10 })
      doc.text(`¥${row.amount.toFixed(2)}`, 330, y + 3, { width: colWidths[1] - 10, align: "right" })
      doc.text(row.pct, 430, y + 3, { width: colWidths[2] - 10, align: "right" })
      doc.moveDown(1.3)
    })

    doc.moveDown(1)

    // ── 脚注 ──
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#cccccc")
    doc.moveDown(0.5)
    doc.fontSize(8).font("Helvetica").fillColor("#999")
      .text("本账单由 3Cloud 系统自动生成", 50, doc.y, { align: "center" })
      .text("如有疑问请联系 support@unmisa.com", { align: "center" })

    doc.end()
  })
}
