/**
 * 统一 API 响应结构
 * 对齐 docs/api-reference.md 与错误码规范
 */

/** 成功响应包装 */
export interface ApiSuccess<T> {
  code: 0;
  data: T;
  message: string;
}

/** 失败响应包装 */
export interface ApiError {
  code: number;
  error: string; // 机器可读错误码，对应 ErrorCodes/BusinessErrorCodes
  message: string; // 人类可读信息
  details?: unknown; // 附加错误详情（校验失败明细等）
  requestId?: string; // 请求追踪 ID
}

/** 分页参数 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/** 分页结果 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 时间范围 */
export interface DateRange {
  start?: string;
  end?: string;
}
