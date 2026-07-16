// ============================================================
//  3cloud (3C) — WebSocket 限流水位 Hook
//  连接 /ws/rate-limits，自动重连，返回水位数据
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react'

export interface RateLimitWaterLevels {
  global: { rpm: number; tpm: number }
  user: { rpm: number; tpm: number; active: number }
  apiKey: { rpm: number; active: number }
}

export interface RateLimitWsMessage {
  type: 'rate_limits' | 'error'
  ts: number
  data?: RateLimitWaterLevels
  message?: string
}

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/rate-limits`
const RECONNECT_DELAY = 3000
const MAX_RECONNECT_DELAY = 30000

export function useRateLimitWs() {
  const [connected, setConnected] = useState(false)
  const [data, setData] = useState<RateLimitWaterLevels | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const retryCountRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return
    }

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      retryCountRef.current = 0
    }

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: RateLimitWsMessage = JSON.parse(event.data)
        if (msg.type === 'rate_limits' && msg.data) {
          setData(msg.data)
        }
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null

      // Exponential backoff reconnect
      const delay = Math.min(RECONNECT_DELAY * Math.pow(2, retryCountRef.current), MAX_RECONNECT_DELAY)
      retryCountRef.current++
      timerRef.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      // onerror followed by onclose, so reconnect is handled there
    }
  }, [])

  const disconnect = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.onclose = null // prevent reconnect
      wsRef.current.close()
      wsRef.current = null
    }
    setConnected(false)
  }, [])

  useEffect(() => {
    connect()
    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  return { connected, data }
}
