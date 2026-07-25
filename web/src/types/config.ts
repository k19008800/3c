// ── 配置版本控制相关类型 ──

export type ConfigType = 'system' | 'security' | 'login_security'

export interface ConfigVersion {
  id: number
  configKey: string
  configType: ConfigType
  oldValue: any
  newValue: any
  changedBy: number | null
  changedByUsername: string | null
  changeReason: string | null
  ip: string | null
  createdAt: string
}

export interface ConfigSnapshot {
  id: number
  name: string
  description: string | null
  configType: ConfigType
  configData: Record<string, any>
  createdBy: number | null
  createdByUsername: string | null
  isActive: boolean
  createdAt: string
}

export interface ConfigChangeRequest {
  id: number
  configKey: string
  configType: ConfigType
  oldValue: any
  newValue: any
  requestedBy: number
  requestedByUsername: string | null
  requestReason: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  reviewedBy: number | null
  reviewedByUsername: string | null
  reviewNotes: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ConfigDiffResult {
  oldValue: any
  newValue: any
  diff: {
    added: string[]
    removed: string[]
    changed: Array<{
      key: string
      old: any
      new: any
    }>
    unchanged: string[]
  }
}

export interface ConfigImpactAssessment {
  impactLevel: 'low' | 'medium' | 'high' | 'critical'
  affectedAreas: string[]
  risks: string[]
  recommendations: string[]
}

export interface ConfigDependencies {
  dependentConfigs: string[]
  dependentFeatures: string[]
}

export interface EnhancedConfigItem extends AdminConfig {
  version: number
  lastVersionId: number | null
  updatedBy: number | null
  updatedByUsername: string | null
}

export interface BatchUpdateResult {
  key: string
  success: boolean
  versionId?: number
  newVersion?: number
  error?: string
}

export interface BatchUpdateResponse {
  results: BatchUpdateResult[]
  total: number
  success: number
  failed: number
  errors?: string[]
}

export interface ConfigStats {
  configCount: number
  versionCount: number
  recentChanges: number
  frequentlyChanged: Array<{
    configKey: string
    changeCount: number
  }>
  recentOperators: Array<{
    changedBy: number
    changedByUsername: string | null
    changeCount: number
  }>
}