// ── 调度 ──

export interface SchedulingRealtime {
  minutes: number
  series: SchedulingRealtimeMinute[]
  currentDistribution: SchedulingDistribution[]
  lastUpdated: string
  summary: {
    totalRpm: number
    totalTpm: number
    avgLatencyMs: number
    peakRpm: number
    peakTpm: number
    avgLatencyRecent: number
    vendorCount: number
    modelCount: number
  }
}

export interface SchedulingRealtimeMinute {
  time: string
  rpm: number
  tpm: number
  avgLatencyMs: number
  models: Array<{ modelName: string; rpm: number; tpm: number }>
  vendors: Array<{ vendorName: string; rpm: number; tpm: number }>
}

export interface SchedulingDistribution {
  vendorName: string
  rpm: number
  percentage: number
  avgLatencyMs: number
  topModels: Array<{ modelName: string; rpm: number; tpm: number }>
}
