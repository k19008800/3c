export interface BanStats {
  ipCount: number
  userCount: number
  total: number
}

export interface BanFormSubmitData {
  ip?: string
  userId?: number
  duration: number
  reason?: string
}
