// ============================================================
//  3cloud (3C) — 通知服务 类型定义
// ============================================================

export interface CreateNotificationParams {
  userId: number;
  type: string;           // real_name_approved / real_name_rejected / ...
  title: string;
  content: string;
  refType?: string;       // 关联类型，如 "real_name"
  refId?: number;         // 关联 ID
}

export interface RealNameReviewNotifParams {
  userId: number;
  email: string;
  nickname: string | null;
  realName: string;
  status: "approved" | "rejected";
  rejectReason?: string | null;
  reviewVersion?: number;
}
