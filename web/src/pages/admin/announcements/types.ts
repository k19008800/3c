// ============================================================
//  Announcements — Types
// ============================================================

export interface Announcement {
  id: number
  title: string
  content: string
  type: string
  status: boolean
  priority: number
  scheduledAt: string | null
  isPublished: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface AnnouncementForm {
  title: string
  content: string
  type: string
  priority: number
  scheduledAt: string | null
}

export const emptyForm: AnnouncementForm = {
  title: '',
  content: '',
  type: 'system_announcement',
  priority: 0,
  scheduledAt: null,
}
