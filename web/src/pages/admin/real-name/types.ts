// ──────────────────────────────────────────────
//  RealNameReview 共享类型、常量、工具函数
// ──────────────────────────────────────────────

import type { RealNameReviewRecord } from '@/types'

export const REJECT_REASONS = [
  '证件不清晰，请重新上传清晰的证件照片',
  '信息不一致，请核对后重新提交',
  '企业资质不全，请补充完整的企业信息',
  '身份证号格式错误，请检查后重提',
  '营业执照不清晰，请重新上传',
  '联系人信息与证件不符',
]

export const STATUS_TABS = [
  { key: 'pending_review', label: '待审核', color: 'bg-yellow-100 text-yellow-700' },
  { key: 'approved', label: '已通过', color: 'bg-green-100 text-green-700' },
  { key: 'rejected', label: '已拒绝', color: 'bg-red-100 text-red-700' },
]

export const STATUS_LABEL: Record<string, string> = {
  pending_review: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
}

export const USER_TYPE_LABEL: Record<string, string> = {
  personal: '个人',
  enterprise: '企业',
}

/** 管理员审查证件图片 URL 构建 */
export function buildAdminFileUrl(userId: number, relativePath: string | null): string | null {
  if (!relativePath) return null
  const filename = relativePath.split('/').pop()
  if (!filename) return null
  return `/api/v1/admin/real-name/file/${userId}/${filename}`
}

export interface ReviewStats {
  pending: number
  approved: number
  rejected: number
}

/** ReviewList 组件 props */
export interface ReviewListProps {
  records: RealNameReviewRecord[]
  loading: boolean
  total: number
  page: number
  pageSize: number
  totalPages: number
  activeTab: string
  batchMode: boolean
  selectedIds: Set<number>
  batchRejectReason: string
  batchReviewing: boolean
  selectAllRef: React.RefObject<HTMLInputElement | null>
  onToggleSelect: (id: number) => void
  onToggleSelectAll: () => void
  onViewDetail: (record: RealNameReviewRecord) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onBatchApprove: () => void
  onBatchReject: () => void
  onBatchRejectReasonChange: (reason: string) => void
}

/** ReviewDetail 组件 props */
export interface ReviewDetailProps {
  record: RealNameReviewRecord | null
  open: boolean
  activeTab: string
  rejectReason: string
  imgErrors: Record<string, boolean>
  onClose: () => void
  onApprove: () => void
  onReject: () => void
  onRejectReasonChange: (reason: string) => void
  onImageError: (key: string) => void
  onPreviewImage: (url: string) => void
}

/** ReviewStatsCards 组件 props */
export interface ReviewStatsCardsProps {
  stats: ReviewStats
  loading: boolean
}
