/**
 * OnboardingGuide — 新用户空状态引导组件
 *
 * 当用户无 API Key 或无调用记录时显示，引导用户完成：
 * 1. 创建 API Key
 * 2. 复制示例代码
 * 3. 完成首次调用
 *
 * 功能：
 * - 分步引导，进度追踪
 * - 支持跳过
 * - 动画效果
 * - 移动端适配
 */

import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useOnboarding, type OnboardingStep } from '@/hooks/useOnboarding'
import { useAuth } from '@/hooks/use-auth'
import CodeBlock from '@/components/portal/CodeBlock'
import {
  Key, Copy, CheckCircle2, Terminal, X, ChevronRight, ChevronLeft,
  Loader2, Sparkles, Rocket, Zap, ArrowRight, Circle, CheckCircle,
} from 'lucide-react'
import { post } from '@/lib/api'

interface OnboardingGuideProps {
  /** 是否有 API Key */
  hasApiKey: boolean
  /** 是否有调用记录 */
  hasCallHistory: boolean
  /** API Key 列表（用于示例代码） */
  apiKeys?: Array<{ id: number; name: string; key?: string; keyPrefix?: string }>
  /** 基础 URL */
  baseUrl?: string
  /** 默认模型 */
  defaultModel?: string
}

const STEP_CONFIG: Record<OnboardingStep, {
  title: string
  description: string
  icon: typeof Key
  shortLabel: string
}> = {
  'create-key': {
    title: '创建 API 密钥',
    description: 'API 密钥是调用服务的身份凭证，请先创建一个密钥',
    icon: Key,
    shortLabel: '创建密钥',
  },
  'copy-example': {
    title: '复制示例代码',
    description: '选择您的编程语言，复制示例代码到您的项目中',
    icon: Copy,
    shortLabel: '复制示例',
  },
  'first-call': {
    title: '完成首次调用',
    description: '运行代码，完成您的第一次 API 调用',
    icon: Rocket,
    shortLabel: '首次调用',
  },
}

type SnippetLang = 'curl' | 'python' | 'javascript' | 'go'

const LANG_OPTIONS: { key: SnippetLang; label: string }[] = [
  { key: 'curl', label: 'cURL' },
  { key: 'python', label: 'Python' },
  { key: 'javascript', label: 'JavaScript' },
  { key: 'go', label: 'Go' },
]

function generateSnippet(baseUrl: string, apiKey: string, model: string, lang: SnippetLang): string {
  const safeKey = apiKey || 'sk-***'

  switch (lang) {
    case 'curl':
      return `curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer ${safeKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${model}","messages":[{"role":"user","content":"你好"}]}'`

    case 'python':
      return `import requests

response = requests.post(
    "${baseUrl}/v1/chat/completions",
    headers={
        "Authorization": "Bearer ${safeKey}",
        "Content-Type": "application/json"
    },
    json={
        "model": "${model}",
        "messages": [{"role": "user", "content": "你好"}]
    }
)
print(response.json())`

    case 'javascript':
      return `const response = await fetch("${baseUrl}/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${safeKey}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "${model}",
    messages: [{ role: "user", content: "你好" }]
  })
})
const data = await response.json()
console.log(data)`

    case 'go':
      return `package main

import (
  "bytes"
  "encoding/json"
  "net/http"
)

func main() {
  body := map[string]any{
    "model": "${model}",
    "messages": []any{map[string]string{"role": "user", "content": "你好"}},
  }
  b, _ := json.Marshal(body)
  req, _ := http.NewRequest("POST", "${baseUrl}/v1/chat/completions", bytes.NewReader(b))
  req.Header.Set("Authorization", "Bearer ${safeKey}")
  req.Header.Set("Content-Type", "application/json")
  resp, _ := http.DefaultClient.Do(req)
  defer resp.Body.Close()
}`
  }
}

export default function OnboardingGuide({
  hasApiKey,
  hasCallHistory,
  apiKeys = [],
  baseUrl = window.location.origin,
  defaultModel = 'deepseek-chat',
}: OnboardingGuideProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const onboarding = useOnboarding()
  const [lang, setLang] = useState<SnippetLang>('curl')
  const [copied, setCopied] = useState(false)
  const [testingCall, setTestingCall] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // 如果用户已有 Key 且有调用记录，不显示引导
  const shouldShow = !hasApiKey || !hasCallHistory

  // 自动检测步骤完成
  useEffect(() => {
    if (hasApiKey && !onboarding.isStepCompleted('create-key')) {
      onboarding.completeStep('create-key')
    }
  }, [hasApiKey])

  useEffect(() => {
    if (hasCallHistory && !onboarding.isStepCompleted('first-call')) {
      onboarding.completeStep('first-call')
    }
  }, [hasCallHistory])

  // 步骤切换动画
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.classList.remove('animate-fade-in')
      void contentRef.current.offsetWidth // 触发重绘
      contentRef.current.classList.add('animate-fade-in')
    }
  }, [onboarding.currentStep])

  // 3 步全部完成 → 显示完成横幅（5 秒后隐藏）
  const [showBanner, setShowBanner] = useState(false)
  useEffect(() => {
    if (onboarding.completedAt && onboarding.skipped === false) {
      setShowBanner(true)
      const timer = setTimeout(() => setShowBanner(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [onboarding.completedAt, onboarding.skipped])

  if (showBanner) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 animate-slideDown">
        <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-6 py-4 shadow-lg text-center">
          <p className="text-lg font-bold">🎉 恭喜！您已完成快速接入</p>
          <p className="text-sm opacity-90 mt-1">现在可以开始使用 API 了</p>
        </div>
      </div>
    )
  }

  // 如果已跳过或已完成，不显示
  if (onboarding.skipped || !onboarding.visible || !shouldShow) {
    return null
  }

  const currentConfig = STEP_CONFIG[onboarding.currentStep]
  const CurrentIcon = currentConfig.icon
  const activeKey = apiKeys.find(k => k.key) || apiKeys[0]
  const apiKeyForSnippet = activeKey?.key || 'sk-***'

  const handleCopyCode = async () => {
    const code = generateSnippet(baseUrl, apiKeyForSnippet, defaultModel, lang)
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      // 自动标记完成
      if (!onboarding.isStepCompleted('copy-example')) {
        setTimeout(() => onboarding.completeStep('copy-example'), 500)
      }
    } catch {}
  }

  const handleTestCall = async () => {
    setTestingCall(true)
    setTestResult(null)
    try {
      const res = await post('/api/v1/user/debug-token', { minutes: 60 })
      if (res.data?.playgroundUrl) {
        window.open(res.data.playgroundUrl, '_blank')
        // 用户打开调试页面，标记完成
        setTimeout(() => {
          onboarding.completeStep('first-call')
        }, 1000)
      }
    } catch {
      setTestResult('error')
    } finally {
      setTestingCall(false)
    }
  }

  const handleNext = () => {
    onboarding.completeStep(onboarding.currentStep)
  }

  const handlePrev = () => {
    const prevIdx = onboarding.stepIndex - 1
    if (prevIdx >= 0) {
      onboarding.goToStep(onboarding.stepOrder[prevIdx])
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="relative px-6 py-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-2xl transform -translate-x-1/2 translate-y-1/2" />
          </div>

          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <Sparkles size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold">欢迎使用 3Cloud</h2>
                <p className="text-sm opacity-90">让我们帮您快速上手</p>
              </div>
            </div>
            <button
              onClick={onboarding.skip}
              className="p-2 hover:bg-white/20 rounded-lg transition"
              title="跳过引导"
            >
              <X size={20} />
            </button>
          </div>

          {/* Progress bar */}
          <div className="relative mt-4 flex items-center gap-2">
            {onboarding.stepOrder.map((step, idx) => {
              const isCompleted = onboarding.isStepCompleted(step)
              const isCurrent = onboarding.isCurrentStep(step)
              const config = STEP_CONFIG[step]
              return (
                <div key={step} className="flex-1 flex items-center gap-2">
                  <div
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                      isCompleted
                        ? 'bg-white/30 text-white'
                        : isCurrent
                        ? 'bg-white text-blue-600'
                        : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle size={14} />
                    ) : (
                      <Circle size={14} />
                    )}
                    <span className="hidden sm:inline">{config.shortLabel}</span>
                  </div>
                  {idx < onboarding.stepOrder.length - 1 && (
                    <div className={`flex-1 h-0.5 rounded-full transition-all ${
                      isCompleted ? 'bg-white/50' : 'bg-white/20'
                    }`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Content */}
        <div ref={contentRef} className="p-6 animate-fade-in">
          {/* Step 1: 创建 API Key */}
          {onboarding.currentStep === 'create-key' && (
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-100 rounded-xl text-blue-600">
                  <Key size={28} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-800">{currentConfig.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{currentConfig.description}</p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={16} className="text-amber-500" />
                  <span className="text-sm font-medium text-slate-700">快速创建</span>
                </div>
                <p className="text-sm text-slate-600 mb-4">
                  API 密钥用于身份验证，请妥善保管。创建后可随时在「API 密钥」页面管理。
                </p>
                <button
                  onClick={() => {
                    navigate('/api-keys')
                    handleNext()
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  <Key size={18} />
                  前往创建 API 密钥
                  <ArrowRight size={16} />
                </button>
              </div>

              {hasApiKey && (
                <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-4 py-2 rounded-lg">
                  <CheckCircle2 size={16} />
                  已检测到 API 密钥，点击下一步继续
                </div>
              )}
            </div>
          )}

          {/* Step 2: 复制示例代码 */}
          {onboarding.currentStep === 'copy-example' && (
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-purple-100 rounded-xl text-purple-600">
                  <Copy size={28} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-800">{currentConfig.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{currentConfig.description}</p>
                </div>
              </div>

              {/* Language selector */}
              <div className="flex flex-wrap gap-2">
                {LANG_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setLang(opt.key)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${
                      lang === opt.key
                        ? 'border-purple-400 bg-purple-50 text-purple-700 font-medium'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Code block */}
              <div className="relative">
                <CodeBlock
                  code={generateSnippet(baseUrl, apiKeyForSnippet, defaultModel, lang)}
                  language={LANG_OPTIONS.find(l => l.key === lang)?.label}
                  label={`模型: ${defaultModel}`}
                />
                <button
                  onClick={handleCopyCode}
                  className={`absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all ${
                    copied
                      ? 'border-green-400 bg-green-50 text-green-600'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                  {copied ? '已复制' : '复制代码'}
                </button>
              </div>

              {activeKey && (
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  <Key size={12} />
                  使用密钥：<span className="font-mono">{activeKey.name}</span>
                  {activeKey.keyPrefix && (
                    <span className="font-mono text-slate-400">({activeKey.keyPrefix}...)</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3: 首次调用 */}
          {onboarding.currentStep === 'first-call' && (
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-green-100 rounded-xl text-green-600">
                  <Rocket size={28} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-800">{currentConfig.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{currentConfig.description}</p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
                <div className="flex items-center gap-2 mb-3">
                  <Terminal size={16} className="text-green-600" />
                  <span className="text-sm font-medium text-slate-700">在线调试工具</span>
                </div>
                <p className="text-sm text-slate-600 mb-4">
                  我们提供在线调试工具，无需本地环境即可测试 API 调用。
                </p>
                <button
                  onClick={handleTestCall}
                  disabled={testingCall}
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50"
                >
                  {testingCall ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      正在打开...
                    </>
                  ) : (
                    <>
                      <Terminal size={18} />
                      打开在线调试
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
                {testResult === 'error' && (
                  <p className="mt-2 text-xs text-red-600">打开失败，请稍后重试</p>
                )}
              </div>

              <div className="text-center">
                <p className="text-xs text-slate-500">
                  或在您的项目中运行刚才复制的代码
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onboarding.skip}
            className="text-sm text-slate-500 hover:text-slate-700 transition"
          >
            跳过引导
          </button>

          <div className="flex items-center gap-2">
            {onboarding.stepIndex > 0 && (
              <button
                onClick={handlePrev}
                className="flex items-center gap-1 px-3 py-2 text-sm text-slate-600 hover:text-slate-800 transition"
              >
                <ChevronLeft size={16} />
                上一步
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
            >
              {onboarding.stepIndex === onboarding.totalSteps - 1 ? '完成' : '下一步'}
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Inline styles for animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes slideDown {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-out;
        }
        .animate-scale-in {
          animation: scaleIn 0.3s ease-out;
        }
        .animate-slideDown {
          animation: slideDown 0.4s ease-out, fadeOut 0.5s ease-in 4.5s forwards;
        }
      `}</style>
    </div>
  )
}
