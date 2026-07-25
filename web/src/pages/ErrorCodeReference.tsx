// ============================================================
//  3cloud (3C) — 错误码参考文档
//  公开访问，无需登录
// ============================================================

import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Search, AlertCircle, AlertTriangle, Info, ChevronRight, X } from 'lucide-react'

// ── 类型定义 ──

interface ErrorCodeDefinition {
  code: string
  message: string
  messageEn: string
  category: string
  categoryLabel: string
  severity: 'error' | 'warning' | 'info'
  solution: string
  solutionEn: string
  docUrl?: string
  relatedCodes?: string[]
}

interface ErrorCategory {
  key: string
  label: string
  labelEn: string
  icon: string
  count?: number
}

// ── 严重程度图标 ──

const SeverityIcon = ({ severity }: { severity: string }) => {
  switch (severity) {
    case 'error':
      return <AlertCircle className="w-5 h-5 text-red-500" />
    case 'warning':
      return <AlertTriangle className="w-5 h-5 text-yellow-500" />
    case 'info':
      return <Info className="w-5 h-5 text-blue-500" />
    default:
      return null
  }
}

// ── 严重程度标签 ──

const SeverityBadge = ({ severity }: { severity: string }) => {
  const styles = {
    error: 'bg-red-100 text-red-700',
    warning: 'bg-yellow-100 text-yellow-700',
    info: 'bg-blue-100 text-blue-700',
  }
  const labels = {
    error: '错误',
    warning: '警告',
    info: '提示',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[severity as keyof typeof styles]}`}>
      {labels[severity as keyof typeof labels]}
    </span>
  )
}

// ── 错误码卡片 ──

const ErrorCodeCard = ({ code, onClick }: { code: ErrorCodeDefinition; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="w-full text-left p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/50 transition-colors group"
  >
    <div className="flex items-start gap-3">
      <SeverityIcon severity={code.severity} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono font-bold text-blue-600">{code.code}</span>
          <SeverityBadge severity={code.severity} />
        </div>
        <h3 className="font-medium text-gray-900 truncate">{code.message}</h3>
        <p className="text-sm text-gray-500 truncate">{code.messageEn}</p>
      </div>
      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
    </div>
  </button>
)

// ── 错误码详情 ──

const ErrorCodeDetail = ({
  code,
  onClose,
}: {
  code: ErrorCodeDefinition
  onClose: () => void
}) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SeverityIcon severity={code.severity} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-xl text-blue-600">{code.code}</span>
              <SeverityBadge severity={code.severity} />
            </div>
            <span className="text-sm text-gray-500">{code.categoryLabel}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* 错误信息 */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-2">错误信息</h3>
          <p className="text-lg font-medium text-gray-900">{code.message}</p>
          <p className="text-gray-600">{code.messageEn}</p>
        </div>

        {/* 解决方案 */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-green-800 mb-2">✅ 解决方案</h3>
          <p className="text-green-900">{code.solution}</p>
          <p className="text-green-700 text-sm mt-2">{code.solutionEn}</p>
        </div>

        {/* 相关文档 */}
        {code.docUrl && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">相关文档</h3>
            <a
              href={code.docUrl}
              className="text-blue-600 hover:text-blue-700 underline"
            >
              {code.docUrl}
            </a>
          </div>
        )}

        {/* 相关错误码 */}
        {code.relatedCodes && code.relatedCodes.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">相关错误码</h3>
            <div className="flex flex-wrap gap-2">
              {code.relatedCodes.map((relatedCode) => (
                <Link
                  key={relatedCode}
                  to={`/error-codes/${relatedCode}`}
                  className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg font-mono text-sm text-gray-700 transition-colors"
                >
                  {relatedCode}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* API 使用示例 */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">API 错误响应示例</h3>
          <pre className="text-sm font-mono text-gray-900 overflow-x-auto">
            {JSON.stringify(
              {
                error: code.message,
                code: code.code,
                docUrl: `/error-codes/${code.code}`,
              },
              null,
              2
            )}
          </pre>
        </div>
      </div>
    </div>
  </div>
)

// ── 主组件 ──

export default function ErrorCodeReference() {
  const { code: paramCode } = useParams<{ code: string }>()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedSeverity, setSelectedSeverity] = useState<string | null>(null)
  const [selectedCode, setSelectedCode] = useState<ErrorCodeDefinition | null>(null)
  const [categories, setCategories] = useState<ErrorCategory[]>([])
  const [errorCodes, setErrorCodes] = useState<ErrorCodeDefinition[]>([])
  const [loading, setLoading] = useState(true)

  // 加载分类统计
  useEffect(() => {
    fetch('/api/v1/public/error-codes/categories')
      .then((res) => res.json())
      .then((data) => {
        if (data.code === 0) {
          setCategories(data.data.categories)
        }
      })
      .catch(console.error)
  }, [])

  // 加载错误码列表
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (selectedCategory) params.append('category', selectedCategory)
    if (selectedSeverity) params.append('severity', selectedSeverity)
    if (searchQuery) params.append('search', searchQuery)

    fetch(`/api/v1/public/error-codes?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.code === 0) {
          setErrorCodes(data.data.errorCodes)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedCategory, selectedSeverity, searchQuery])

  // URL 参数直接查看详情
  useEffect(() => {
    if (paramCode) {
      fetch(`/api/v1/public/error-codes/${paramCode}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.code === 0) {
            setSelectedCode(data.data)
          }
        })
        .catch(console.error)
    }
  }, [paramCode])

  // 按分类分组
  const groupedCodes = useMemo(() => {
    const groups: Record<string, ErrorCodeDefinition[]> = {}
    for (const code of errorCodes) {
      if (!groups[code.category]) {
        groups[code.category] = []
      }
      groups[code.category].push(code)
    }
    return groups
  }, [errorCodes])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">错误码参考文档</h1>
          <p className="text-gray-600">
            查询 API 错误码的含义、原因和解决方案。当 API 返回错误时，可通过错误码快速定位问题。
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar - 分类筛选 */}
          <div className="lg:w-64 flex-shrink-0">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="font-medium text-gray-900 mb-3">分类筛选</h2>
              <div className="space-y-1">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    !selectedCategory
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  全部
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.key}
                    onClick={() => setSelectedCategory(cat.key)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                      selectedCategory === cat.key
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <span>
                      {cat.icon} {cat.label}
                    </span>
                    <span className="text-xs text-gray-500">{cat.count}</span>
                  </button>
                ))}
              </div>

              {/* 严重程度筛选 */}
              <h2 className="font-medium text-gray-900 mt-6 mb-3">严重程度</h2>
              <div className="space-y-1">
                <button
                  onClick={() => setSelectedSeverity(null)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    !selectedSeverity
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  全部
                </button>
                <button
                  onClick={() => setSelectedSeverity('error')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                    selectedSeverity === 'error'
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  错误
                </button>
                <button
                  onClick={() => setSelectedSeverity('warning')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                    selectedSeverity === 'warning'
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  警告
                </button>
                <button
                  onClick={() => setSelectedSeverity('info')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                    selectedSeverity === 'info'
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <Info className="w-4 h-4 text-blue-500" />
                  提示
                </button>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {/* Search */}
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索错误码、错误信息或解决方案..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                )}
              </div>
            </div>

            {/* Results */}
            {loading ? (
              <div className="text-center py-12 text-gray-500">加载中...</div>
            ) : errorCodes.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                未找到匹配的错误码
              </div>
            ) : (
              <div className="space-y-6">
                {/* 统计 */}
                <div className="text-sm text-gray-500">
                  共 {errorCodes.length} 个错误码
                </div>

                {/* 按分类分组展示 */}
                {Object.entries(groupedCodes).map(([category, codes]) => {
                  const cat = categories.find((c) => c.key === category)
                  return (
                    <div key={category}>
                      {!selectedCategory && (
                        <h2 className="text-lg font-medium text-gray-900 mb-3 flex items-center gap-2">
                          {cat?.icon} {cat?.label || category}
                          <span className="text-sm text-gray-500">({codes.length})</span>
                        </h2>
                      )}
                      <div className="grid gap-3 sm:grid-cols-2">
                        {codes.map((code) => (
                          <ErrorCodeCard
                            key={code.code}
                            code={code}
                            onClick={() => setSelectedCode(code)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedCode && (
        <ErrorCodeDetail
          code={selectedCode}
          onClose={() => {
            setSelectedCode(null)
            // 清除 URL 参数
            if (paramCode) {
              window.history.pushState({}, '', '/error-codes')
            }
          }}
        />
      )}
    </div>
  )
}
