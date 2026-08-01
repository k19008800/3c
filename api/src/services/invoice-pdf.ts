import PDFDocument from "pdfkit";
import fs from "node:fs";

/**
 * 发票 PDF 生成
 * 使用 pdfkit，注册中文字体（simhei），生成 A4 发票
 * 字体路径探测：环境变量 INVOICE_FONT_PATH > 常见系统路径 > 未注册（英文数字可读）
 */

const FONT_CANDIDATES = process.env.INVOICE_FONT_PATH
  ? [process.env.INVOICE_FONT_PATH]
  : ["C:\\Windows\\Fonts\\simhei.ttf", "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"];

let resolvedFont: string | null = null;
export function resolveFont(): string | null {
  if (resolvedFont) return resolvedFont;
  for (const p of FONT_CANDIDATES) {
    try { if (fs.existsSync(p)) { resolvedFont = p; return p; } } catch { /* ignore */ }
  }
  return null;
}

export interface InvoicePdfData {
  invoiceNo: string;
  title: string;          // 抬头
  taxNo?: string | null;
  type: string;           // special/ordinary
  amount: string;         // 金额(元)
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
  email?: string | null;
  createdAt: string;
  userName?: string;
}

/** 生成发票 PDF，返回 Buffer */
export function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolvePromise(Buffer.concat(chunks)));
      doc.on("error", reject);

      const font = resolveFont();
      const hasCJK = !!font;
      const base = hasCJK ? "CJK" : "Helvetica";
      if (hasCJK) doc.registerFont("CJK", font!);

      // 页头
      doc.font(base).fontSize(22).text("3Cloud 电子发票", { align: "center" });
      doc.moveDown();
      doc.fontSize(11).text(`发票编号：${data.invoiceNo}`, { align: "center" });
      doc.moveDown(1.5);

      // 主体（表格）
      doc.fontSize(10);
      const labelW = 110, valW = 230;
      const line = (label: string, value: string, y: number) => {
        doc.font(base).fontSize(10).text(label, 50, y, { width: labelW });
        doc.text(value || "-", 50 + labelW, y, { width: valW - 30 });
      };
      let y = doc.y + 10;
      line("购买方抬头", data.title, y); y += 20;
      if (data.taxNo) { line("纳税人识别号", data.taxNo ?? "", y); y += 20; }
      line("发票类型", data.type === "special" ? "增值税专用发票" : "增值税普通发票", y); y += 20;
      line("金额(不含税)", `¥${data.amount}`, y); y += 20;
      line(`税率(${data.taxRate}%)`, data.taxAmount ? `¥${data.taxAmount}` : "", y); y += 20;
      line("价税合计(含税)", `¥${data.totalAmount}`, y,); y += 20;
      if (data.email) { line("接收邮箱", data.email, y); y += 20; }
      line("开票日期", data.createdAt, y); y += 20;

      // 页脚
      (doc as any).rect(50, 700, 495, 1).fill("#94a3b8");
      doc.fontSize(8).fillColor("#64748b").text("本发票由 3Cloud 平台生成，仅供参考。", 50, 715, { width: 500 });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
