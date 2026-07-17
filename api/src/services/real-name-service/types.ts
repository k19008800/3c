// ============================================================
//  3cloud (3C) — 实名认证服务 类型定义
// ============================================================

export interface FileUploadResult {
  filePath: string;     // 磁盘绝对路径
  relativePath: string; // 相对路径（存数据库用）
  ext: string;
}

export interface AutoVerifyResult {
  autoVerified: boolean;
  passed: boolean;
  rawResult?: Record<string, any>;
}
