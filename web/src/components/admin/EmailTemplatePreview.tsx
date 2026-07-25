import { useState, useEffect, useCallback, useMemo } from 'react'
import { post } from '@/lib/api'
import {
  Eye,
  Send,
  Monitor,
  Smartphone,
  Variable,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Mail,
} from 'lucide-react'

// 模板变量定义（与后端同步）
const TEMPLATE_VARIABLES: Record<string, { label: string; example: string }> = {
  username: { label: '用户名', example: '张三' },
  email: { label: '邮箱地址', example: 'zhangsan@example.com' },
  nickname: { label: '昵称', example: '小张' },
  realName: { label: '真实姓名', example: '张三' },
  amount: { label: '金额', example: '100.00' },
  date: { label: '日期', example: '2025-01-15' },
  time: { label: '时间', example: '2025-01-15 14:30:00' },
  ip: { label: 'IP 地址', example: '192.168.1.100' },
  city: { label: '城市', example: '北京' },
  country: { label: '国家', example: '中国' },
  device: { label: '设备', example: 'Chrome / Windows' },
  reason: { label: '原因', example: '违规操作' },
  duration: { label: '时长', example: '7 天' },
  unbanAt: { label: '解封时间', example: '2025-01-22 14:30:00' },
  status: { label: '状态', example: '已通过' },
  rejectReason: { label: '拒绝原因', example: '信息不完整' },
  userType: { label: '用户类型', example: '个人用户' },
  extraInfo: { label: '额外信息', example: '您现在可以正常使用全部 API 功能。' },
  verifyLink: { label: '验证链接', example: 'https://example.com/verify?token=xxx' },
  resetLink: { label: '重置链接', example: 'https://example.com/reset?token=xxx' },
  orderId: { label: '订单号', example: 'ORD202501150001' },
  productName: { label: '产品名称', example: 'API 基础版' },
}

interface EmailTemplatePreviewProps {
  templateName?: string
  subjectZh?: string
  subjectEn?: string
  bodyHtmlZh?: string
  bodyHtmlEn?: string
  onContentChange?: (field: string, value: string) => void
}

export default function EmailTemplatePreview({
  templateName,
  subjectZh = '',
  subjectEn = '',
  bodyHtmlZh = '',
  bodyHtmlEn = '',
  onContentChange,
}: EmailTemplatePreviewProps) {
  const [lang, setLang] = useState<'zh' | 'en'>('zh')
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [showVariables, setShowVariables] = useState(false)
  const [sampleData, setSampleData] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(TEMPLATE_VARIABLES).map(([k, v]) => [k, v.example]))
  )
  const [previewSubject, setPreviewSubject] = useState('')
  const [previewHtml, setPreviewHtml] = useState('')
  const [usedVariables, setUsedVariables] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 测试邮件状态
  const [testEmail, setTestEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sendSuccess, setSendSuccess] = useState(false)
  const [sendError, setSendError] = useState('')

  // 提取模板中使用的变量
  const extractVariables = useCallback((text: string) => {
    const vars = new Set<string>()
    const pattern = /\{\{(\w+)\}\}/g
    let match
    while ((match = pattern.exec(text)) !== null) {
      vars.add(match[1])
    }
    return Array.from(vars)
  }, [])

  // 当前模板内容
  const currentSubject = lang === 'zh' ? subjectZh : subjectEn
  const currentBody = lang === 'zh' ? bodyHtmlZh : bodyHtmlEn

  // 本地渲染预览
  const renderPreview = useCallback(() => {
    let renderedSubject = currentSubject
    let renderedBody = currentBody

    // 替换变量
    for (const [key, value] of Object.entries(sampleData)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
      renderedSubject = renderedSubject.replace(pattern, value)
      renderedBody = renderedBody.replace(pattern, value)
    }

    setPreviewSubject(renderedSubject)
    setPreviewHtml(renderedBody)
    setUsedVariables(extractVariables(currentSubject + currentBody))
  }, [currentSubject, currentBody, sampleData, extractVariables])

  useEffect(() => {
    renderPreview()
  }, [renderPreview])

  // 发送测试邮件
  const handleSendTestEmail = useCallback(async () => {
    if (!testEmail || !testEmail.includes('@')) {
      setSendError('请输入有效的邮箱地址')
      return
    }

    setSending(true)
    setSendError('')
    setSendSuccess(false)

    try {
      await post('/api/v1/admin/email-templates/test-send', {
        to: testEmail,
        templateName,
        subjectZh,
        subjectEn,
        bodyHtmlZh,
        bodyHtmlEn,
        sampleData,
        lang,
      })
      setSendSuccess(true)
      setTimeout(() => setSendSuccess(false), 3000)
    } catch (err: any) {
      setSendError(err.message || '发送失败')
    } finally {
      setSending(false)
    }
  }, [testEmail, templateName, subjectZh, subjectEn, bodyHtmlZh, bodyHtmlEn, sampleData, lang])

  // 重置示例数据
  const resetSampleData = useCallback(() => {
    setSampleData(
      Object.fromEntries(Object.entries(TEMPLATE_VARIABLES).map(([k, v]) => [k, v.example]))
    )
  }, [])

  // 相关变量（模板中使用的）
  const relevantVariables = useMemo(() => {
    return usedVariables.filter((v) => TEMPLATE_VARIABLES[v])
  }, [usedVariables])

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {/* 语言切换 */}
          <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setLang('zh')}
              className={`px-3 py-1.5 text-sm ${
                lang === 'zh'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              中文
            </button>
            <button
              onClick={() => setLang('en')}
              className={`px-3 py-1.5 text-sm ${
                lang === 'en'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              English
            </button>
          </div>

          {/* 预览模式切换 */}
          <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setPreviewMode('desktop')}
              className={`px-2 py-1.5 ${
                previewMode === 'desktop'
                  ? 'bg-slate-100 text-slate-900'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
              title="桌面预览"
            >
              <Monitor size={16} />
            </button>
            <button
              onClick={() => setPreviewMode('mobile')}
              className={`px-2 py-1.5 ${
                previewMode === 'mobile'
                  ? 'bg-slate-100 text-slate-900'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
              title="移动端预览"
            >
              <Smartphone size={16} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 变量提示 */}
          <button
            onClick={() => setShowVariables(!showVariables)}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border transition ${
              showVariables
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Variable size={14} />
            变量
            {relevantVariables.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                {relevantVariables.length}
              </span>
            )}
            {showVariables ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {/* 刷新预览 */}
          <button
            onClick={renderPreview}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition"
            title="刷新预览"
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
      </div>

      {/* 变量面板 */}
      {showVariables && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-700">模板变量</h3>
            <button
              onClick={resetSampleData}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              重置为默认值
            </button>
          </div>

          {/* 使用中的变量 */}
          {relevantVariables.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">当前模板使用的变量：</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {relevantVariables.map((varName) => {
                  const varInfo = TEMPLATE_VARIABLES[varName]
                  return (
                    <div key={varName} className="bg-white border border-slate-200 rounded p-2">
                      <div className="flex items-center justify-between mb-1">
                        <code className="text-xs text-blue-600">{'{{' + varName + '}}'}</code>
                      </div>
                      <p className="text-xs text-slate-500 mb-1">{varInfo.label}</p>
                      <input
                        type="text"
                        value={sampleData[varName] || ''}
                        onChange={(e) =>
                          setSampleData((prev) => ({ ...prev, [varName]: e.target.value }))
                        }
                        className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder={varInfo.example}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 所有变量 */}
          <details className="text-xs">
            <summary className="cursor-pointer text-slate-600 hover:text-slate-900">
              查看所有可用变量（{Object.keys(TEMPLATE_VARIABLES).length} 个）
            </summary>
            <div className="mt-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {Object.entries(TEMPLATE_VARIABLES).map(([varName, varInfo]) => (
                <div
                  key={varName}
                  className={`bg-white border rounded p-2 ${
                    relevantVariables.includes(varName)
                      ? 'border-blue-300'
                      : 'border-slate-200'
                  }`}
                >
                  <code className="text-xs text-blue-600">{'{{' + varName + '}}'}</code>
                  <p className="text-xs text-slate-500 mt-0.5">{varInfo.label}</p>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* 预览区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 左侧：编辑器 */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
            <Mail size={14} />
            {lang === 'zh' ? '中文内容' : 'English Content'}
          </h3>

          {/* 主题 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">主题</label>
            <input
              type="text"
              value={lang === 'zh' ? subjectZh : subjectEn}
              onChange={(e) =>
                onContentChange?.(lang === 'zh' ? 'subjectZh' : 'subjectEn', e.target.value)
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder={lang === 'zh' ? '输入中文主题' : 'Enter English subject'}
            />
          </div>

          {/* 正文 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">HTML 正文</label>
            <textarea
              value={lang === 'zh' ? bodyHtmlZh : bodyHtmlEn}
              onChange={(e) =>
                onContentChange?.(lang === 'zh' ? 'bodyHtmlZh' : 'bodyHtmlEn', e.target.value)
              }
              rows={12}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs resize-y"
              placeholder={
                lang === 'zh'
                  ? '<h1>欢迎注册</h1><p>请点击以下链接验证邮箱...</p>'
                  : '<h1>Welcome</h1><p>Please click the link to verify...</p>'
              }
            />
          </div>
        </div>

        {/* 右侧：预览 */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
            <Eye size={14} />
            预览
          </h3>

          {/* 预览容器 */}
          <div
            className={`border border-slate-200 rounded-lg overflow-hidden bg-white ${
              previewMode === 'mobile' ? 'max-w-[375px] mx-auto' : ''
            }`}
          >
            {/* 模拟邮件头部 */}
            <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">收件人：</span>
                <span className="text-slate-700">user@example.com</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">主题：</span>
                <span className="text-slate-900 font-medium">
                  {previewSubject || '(无主题)'}
                </span>
              </div>
            </div>

            {/* 邮件正文预览 */}
            <div className="p-4 min-h-[300px] overflow-auto">
              {previewHtml ? (
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                  {lang === 'zh' ? '暂无内容' : 'No content'}
                </div>
              )}
            </div>
          </div>

          {/* 测试邮件发送 */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
            <h4 className="text-xs font-medium text-slate-700">发送测试邮件</h4>
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={testEmail}
                onChange={(e) => {
                  setTestEmail(e.target.value)
                  setSendError('')
                }}
                className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="输入测试邮箱地址"
              />
              <button
                onClick={handleSendTestEmail}
                disabled={sending || !testEmail}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {sending ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <Send size={14} />
                )}
                发送
              </button>
            </div>
            {sendSuccess && (
              <div className="flex items-center gap-1 text-green-600 text-xs">
                <CheckCircle2 size={12} />
                测试邮件已发送
              </div>
            )}
            {sendError && (
              <div className="flex items-center gap-1 text-red-600 text-xs">
                <AlertCircle size={12} />
                {sendError}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
    </div>
  )
}
