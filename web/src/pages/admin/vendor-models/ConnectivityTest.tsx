import { useState, useCallback, useRef } from 'react'
import { post } from '@/lib/api'
import { Loader2, CheckCircle2, AlertCircle, Cable } from 'lucide-react'

type TestState = 'idle' | 'testing' | 'ok' | 'fail'

interface ConnectivityTestProps {
  vendorModelId: number
}

export default function ConnectivityTest({
  vendorModelId,
}: ConnectivityTestProps) {
  const [state, setState] = useState<TestState>('idle')
  const [latency, setLatency] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetSoon = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setState('idle')
      setLatency(null)
    }, 3000)
  }, [])

  const handleTest = useCallback(async () => {
    setState('testing')
    setLatency(null)
    const start = Date.now()
    try {
      await post('/api/v1/admin/vendor-models/test', { vendorModelId })
      setLatency(Date.now() - start)
      setState('ok')
    } catch {
      setLatency(Date.now() - start)
      setState('fail')
    }
    resetSoon()
  }, [vendorModelId, resetSoon])

  if (state === 'testing') {
    return <Loader2 size={14} className="animate-spin text-slate-400" />
  }

  if (state === 'ok') {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-xs text-green-600"
        title={`延迟 ${latency}ms`}
      >
        <CheckCircle2 size={14} />
        {latency}ms
      </span>
    )
  }

  if (state === 'fail') {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-xs text-red-500"
        title={`${latency}ms 超时/失败`}
      >
        <AlertCircle size={14} />
        失败
      </span>
    )
  }

  return (
    <button
      onClick={handleTest}
      className="p-1 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition"
      title="测试连通性"
    >
      <Cable size={14} />
    </button>
  )
}
