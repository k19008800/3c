import type { AdminModel } from '@/types'

export interface ModelFilters {
  keyword: string
  type: string
  status: string
  page: number
  pageSize: number
  [key: string]: string | number | boolean | undefined | null
}

export type ModelFormMode = 'create' | 'edit'

export interface ModelFormProps {
  model: AdminModel | null
  onClose: () => void
  onSaved: () => void
  saving: boolean
  setSaving: (v: boolean) => void
}

export interface ModelListProps {
  models: AdminModel[]
  loading: boolean
  error: string
  total: number
  page: number
  pageSize: number
  totalPages: number
  onEdit: (model: AdminModel) => void
  onRefresh: () => void
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

export const TYPE_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'chat', label: '对话', color: 'bg-blue-100 text-blue-700' },
  { value: 'embedding', label: '嵌入', color: 'bg-green-100 text-green-700' },
  { value: 'image', label: '图像', color: 'bg-purple-100 text-purple-700' },
  { value: 'audio', label: '音频', color: 'bg-orange-100 text-orange-700' },
] as const

export const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'true', label: '启用' },
  { value: 'false', label: '停用' },
]

export const TYPE_MAP: Record<string, { value: string; label: string; color?: string }> =
  Object.fromEntries(TYPE_OPTIONS.map((t) => [t.value, t]))
