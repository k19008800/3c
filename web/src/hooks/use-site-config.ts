import { useState, useEffect } from 'react'
import { get } from '@/lib/api'

type SiteConfig = {
  site_name: string
  site_logo_url: string
  site_favicon_url: string
  site_company_name: string
  [key: string]: string
}

const CACHE_KEY = '3cloud_site_config'
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

type CacheEntry = {
  data: SiteConfig
  ts: number
}

function readCache(): SiteConfig | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const entry: CacheEntry = JSON.parse(raw)
    if (Date.now() - entry.ts > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY)
      return null
    }
    return entry.data
  } catch {
    return null
  }
}

function writeCache(data: SiteConfig) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }))
  } catch { /* quota exceeded — ignore */ }
}

export function useSiteConfig() {
  const [config, setConfig] = useState<SiteConfig | null>(readCache)
  const [loading, setLoading] = useState(!config)

  useEffect(() => {
    // 本地缓存命中则跳过请求
    if (config) return

    let cancelled = false
    get<{ settings: SiteConfig }>('/api/v1/site-config/public')
      .then((data) => {
        if (cancelled) return
        const cfg = data.settings
        setConfig(cfg)
        writeCache(cfg)
      })
      .catch(() => {
        if (cancelled) return
        // 静默失败 — 用默认值即可
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  return { config, loading }
}
