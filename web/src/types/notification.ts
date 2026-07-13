// ── 通知 ──

export interface NotificationItem {
  id: number
  title: string
  content: string
  type: string
  readAt: string | null
  createdAt: string
}
