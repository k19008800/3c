import type { AgentClient, ReferralLink } from '@/types'

// ── re-export shared types ──

export type { AgentClient, ReferralLink }

// ── 订单类型（本地，非共享 types）─

export interface ClientOrder {
  id: number
  orderNo: string
  modelName: string | null
  totalTokens: number
  cost: string
  status: string
  createdAt: string
}

// ── props types ──

export interface ClientStatsCardsProps {
  total: number
  referralLink: ReferralLink | null
  linkLoading: boolean
  copied: boolean
  onGenerateLink: () => void
}

export interface ClientListProps {
  clients: AgentClient[]
  total: number
  loading: boolean
  page: number
  pageSize: number
  totalPages: number
  expandedCustomerId: number | null
  onToggleExpand: (customerUserId: number) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onRefresh: () => void
  onExport: (clientUserId: number, email: string) => void
  onUnbind: (clientUserId: number, email: string) => void
}

export interface ClientDetailProps {
  customerUserId: number
}
