// ── Prompt Audit Types ──

export interface PromptAuditItem {
  id: number
  callLogId: number | null
  userId: number | null
  apiKeyId: number | null
  modelName: string | null
  promptHash: string
  promptPreview: string
  responseStatus: string
  isSensitive: boolean
  sensitiveWords: string[] | null
  auditStatus: string
  auditedBy: number | null
  auditedAt: string | null
  flagReason: string | null
  createdAt: string
  userEmail: string | null
  keyName: string | null
}

export interface PromptAuditDetail extends PromptAuditItem {
  prompt: string
  responseSummary: string | null
  callLogCreatedAt: string | null
}

export interface AuditStats {
  total: number
  pending: number
  reviewed: number
  flagged: number
  ignored: number
  sensitive: number
}

export type AuditAction = 'reviewed' | 'flagged' | 'ignored'