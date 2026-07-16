/**
 * performance — 前端性能监控
 *
 * 自动采集页面加载关键指标（TTFB、FCP、DOM Ready），
 * 通过 reportPerf 上报。
 */

export interface PerfMetrics {
  page: string
  ttfb: number          // Time to First Byte
  fcp: number           // First Contentful Paint
  domReady: number      // DOMContentLoaded
  fullLoad: number      // Full page load
  timestamp: number
}

/**
 * 上报性能指标到后端
 */
export function reportPerf(metrics: Partial<PerfMetrics>) {
  try {
    const payload = {
      ...metrics,
      timestamp: Date.now(),
    }

    // 使用 sendBeacon 异步上报，不阻塞页面
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
      navigator.sendBeacon('/api/v1/perf/report', blob)
    } else {
      fetch('/api/v1/perf/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    // 静默失败
  }
}

/**
 * 在页面加载完成后自动采集并上报性能指标
 *
 * 使用方式：在 main.tsx 或 App.tsx 中调用
 * autoReportPerf()
 */
export function autoReportPerf() {
  if (typeof window === 'undefined' || !window.performance) return

  window.addEventListener('load', () => {
    // 确保所有指标都可用
    setTimeout(() => {
      try {
        const navEntries = performance.getEntriesByType('navigation')
        if (navEntries.length === 0) return

        const nav = navEntries[0] as PerformanceNavigationTiming
        const fcpEntry = performance.getEntriesByName('first-contentful-paint')

        reportPerf({
          page: window.location.pathname,
          ttfb: Math.round(nav.responseStart - nav.requestStart),
          fcp: fcpEntry.length > 0 ? Math.round(fcpEntry[0].startTime) : 0,
          domReady: Math.round(nav.domContentLoadedEventEnd - nav.fetchStart),
          fullLoad: Math.round(nav.loadEventEnd - nav.fetchStart),
        })
      } catch {
        // 静默
      }
    }, 1000)
  })
}
