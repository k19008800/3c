import { Component, type ReactNode, type ErrorInfo } from 'react'
import { RefreshCw, AlertTriangle, Home, Copy } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  handleCopyError = () => {
    if (this.state.error) {
      navigator.clipboard.writeText(
        `${this.state.error.name}: ${this.state.error.message}\n\n${this.state.error.stack}`
      )
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      const error = this.state.error!
      const isChunkError = error.name === 'ChunkLoadError' || 
        (error.message && error.message.includes('Loading chunk'))

      if (isChunkError) {
        return (
          <div className="flex flex-col items-center justify-center p-12 min-h-[300px]">
            <RefreshCw className="w-12 h-12 text-slate-400 mb-4" />
            <h2 className="text-lg font-semibold text-slate-800">页面加载失败</h2>
            <p className="text-sm text-slate-500 mt-2 text-center max-w-md">
              可能是新版本已发布，当前缓存的页面代码已过期。
            </p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
              >
                刷新页面
              </button>
            </div>
          </div>
        )
      }

      return (
        <div className="flex flex-col items-center justify-center p-12 min-h-[300px]">
          <AlertTriangle className="w-12 h-12 text-orange-400 mb-4" />
          <h2 className="text-lg font-semibold text-slate-800">页面渲染异常</h2>
          <p className="text-sm text-slate-500 mt-2 text-center max-w-md">
            发生了意料之外的错误，但这不影响其他页面的正常使用。
          </p>
          {(import.meta as any).env?.DEV && (
            <pre className="mt-4 p-3 bg-slate-100 rounded-lg text-xs text-red-600 max-w-lg overflow-auto max-h-32">
              {error.name}: {error.message}
            </pre>
          )}
          <div className="flex flex-wrap gap-3 mt-6 justify-center">
            <button
              onClick={this.handleReset}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition"
            >
              <RefreshCw size={14} />
              重试
            </button>
            <button
              onClick={() => window.location.href = '/admin'}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition"
            >
              <Home size={14} />
              返回首页
            </button>
            <button
              onClick={this.handleCopyError}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-500 hover:bg-slate-50 transition"
            >
              <Copy size={14} />
              复制错误信息
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
