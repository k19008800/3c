// ============================================================
//  3cloud (3C) — 发票服务 类型定义
// ============================================================

export interface BankInfo {
  bankName?: string;
  bankAccount?: string;
  companyAddress?: string;
  companyPhone?: string;
}

export interface InvoiceExportFilters {
  status?: string;
  startDate?: string;
  endDate?: string;
}
