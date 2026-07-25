/**
 * OnboardingDemo - 引导组件演示页面
 *
 * 用于测试和展示 OnboardingGuide 组件
 * 访问路径：/demo/onboarding
 */

import { useState } from 'react'
import OnboardingGuide from './OnboardingGuide'

export default function OnboardingDemo() {
  const [hasApiKey, setHasApiKey] = useState(false)
  const [hasCallHistory, setHasCallHistory] = useState(false)
  const [showGuide, setShowGuide] = useState(true)

  // 模拟 API Key
  const mockApiKeys = hasApiKey
    ? [{ id: 1, name: 'Test Key', keyPrefix: 'sk-abc12', key: 'sk-abc123xyz' }]
    : []

  const resetOnboarding = () => {
    localStorage.removeItem('onboarding_state')
    setShowGuide(false)
    setTimeout(() => setShowGuide(true), 100)
  }

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-800 mb-4">
            OnboardingGuide 组件演示
          </h1>
          <p className="text-slate-600 mb-6">
            这是一个演示页面，用于测试新用户引导组件的各项功能。
          </p>

          {/* 控制面板 */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasApiKey}
                  onChange={(e) => setHasApiKey(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm text-slate-700">已有 API Key</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasCallHistory}
                  onChange={(e) => setHasCallHistory(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm text-slate-700">已有调用记录</span>
              </label>
            </div>

            <div className="flex gap-2">
              <button
                onClick={resetOnboarding}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
              >
                重置引导状态
              </button>
              <button
                onClick={() => setShowGuide(!showGuide)}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition text-sm font-medium"
              >
                {showGuide ? '隐藏引导' : '显示引导'}
              </button>
            </div>
          </div>

          {/* 状态显示 */}
          <div className="mt-6 p-4 bg-slate-50 rounded-lg">
            <h3 className="text-sm font-medium text-slate-700 mb-2">当前状态</h3>
            <pre className="text-xs text-slate-600 font-mono">
              {JSON.stringify(
                {
                  hasApiKey,
                  hasCallHistory,
                  showGuide,
                  localStorage: localStorage.getItem('onboarding_state')
                    ? JSON.parse(localStorage.getItem('onboarding_state')!)
                    : null,
                },
                null,
                2
              )}
            </pre>
          </div>
        </div>

        {/* 引导组件说明 */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">功能说明</h2>
          <div className="space-y-3 text-sm text-slate-600">
            <div className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">1.</span>
              <span>
                <strong>创建 API 密钥：</strong>引导用户前往 API 密钥管理页面创建第一个密钥
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">2.</span>
              <span>
                <strong>复制示例代码：</strong>提供多语言示例代码（cURL、Python、JavaScript、Go），自动填充 API Key
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">3.</span>
              <span>
                <strong>首次调用：</strong>提供在线调试工具，帮助用户完成第一次 API 调用
              </span>
            </div>
          </div>
        </div>

        {/* 特性列表 */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">特性</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              '分步引导流程',
              '进度追踪',
              'localStorage 持久化',
              '跳过选项',
              '动画效果',
              '移动端适配',
              '自动检测完成',
              '多语言示例代码',
            ].map((feature, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 text-sm text-slate-600"
              >
                <span className="text-green-500">✓</span>
                {feature}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 引导组件 */}
      {showGuide && (
        <OnboardingGuide
          hasApiKey={hasApiKey}
          hasCallHistory={hasCallHistory}
          apiKeys={mockApiKeys}
          baseUrl="https://api.unmisa.com"
          defaultModel="deepseek-chat"
        />
      )}
    </div>
  )
}
