import { useEffect, useState } from 'react'
import { get } from '@/lib/api'
import type { ModelItem } from '@/types'
import { Loader2, AlertCircle, Cpu, BookOpen, DollarSign, Link as LinkIcon, Code, ChevronRight } from 'lucide-react'

interface DocSection {
  id: string
  label: string
  icon: typeof Cpu
}

const sections: DocSection[] = [
  { id: 'models', label: '模型列表', icon: Cpu },
  { id: 'access', label: '接入方式', icon: LinkIcon },
  { id: 'pricing', label: '定价收费', icon: DollarSign },
  { id: 'usage', label: '使用指南', icon: BookOpen },
  { id: 'codes', label: '代码示例', icon: Code },
]

export default function Docs() {
  const [models, setModels] = useState<ModelItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState('models')

  useEffect(() => {
    get<{ list: ModelItem[]; total: number }>('/api/v1/models')
      .then((res) => setModels(res.list))
      .catch((err) => setError(err.message || '获取模型列表失败'))
      .finally(() => setLoading(false))
  }, [])

  const baseUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}` : 'https://api.3cloud.ai'

  const renderContent = () => {
    switch (activeSection) {
      case 'models':
        return renderModelsSection()
      case 'access':
        return renderAccessSection()
      case 'pricing':
        return renderPricingSection()
      case 'usage':
        return renderUsageSection()
      case 'codes':
        return renderCodeSection()
      default:
        return null
    }
  }

  const renderModelsSection = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-900">支持的模型</h2>
      <p className="text-slate-600">
        3Cloud 聚合了多家优质 API 厂商，提供统一的模型接入体验。以下为当前可用的模型列表。
      </p>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
          <AlertCircle size={18} />
          {error}
        </div>
      ) : (
        <div className="grid gap-3">
          {models.map((model) => (
            <div key={model.id} className="bg-white rounded-lg border border-slate-200 p-4 hover:border-blue-200 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu size={18} className="text-blue-500" />
                  <span className="font-medium text-slate-900">{model.name}</span>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{model.type}</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(model.vendors || []).map((v) => (
                  <span key={v.vendorId} className="text-xs text-slate-500 bg-slate-50 px-2 py-0.5 rounded">
                    {v.vendorName}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderAccessSection = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-900">接入方式</h2>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold text-slate-800">API Base URL</h3>
        <div className="bg-slate-900 text-green-400 font-mono text-sm px-4 py-3 rounded-lg overflow-x-auto">
          {baseUrl}/v1
        </div>
        <p className="text-sm text-slate-600">
          3Cloud 提供完全兼容 OpenAI API 格式的接口，您可以使用任何 OpenAI 客户端 SDK 直接接入。
        </p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold text-slate-800">认证方式</h3>
        <p className="text-sm text-slate-600">
          在 HTTP Header 中传入您的 API Key：
        </p>
        <div className="bg-slate-900 text-green-400 font-mono text-sm px-4 py-3 rounded-lg overflow-x-auto">
          Authorization: Bearer sk-xxxxxxxxxxxx
        </div>
        <p className="text-sm text-slate-600">
          您可以在 <strong>API 密钥</strong> 页面创建和管理您的 API Key。
        </p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold text-slate-800">请求格式</h3>
        <p className="text-sm text-slate-600">
          支持标准的 OpenAI Chat Completions 格式：
        </p>
        <pre className="bg-slate-900 text-green-400 text-sm px-4 py-3 rounded-lg overflow-x-auto">
{`POST /v1/chat/completions
{
  "model": "gpt-4o",
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "temperature": 0.7,
  "max_tokens": 1024
}`}
        </pre>
      </div>
    </div>
  )

  const renderPricingSection = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-900">定价收费</h2>
      <p className="text-slate-600">
        以下为各模型的售价，按 Token 计费。输入（Input）和输出（Output）价格分开计算。
      </p>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
          <AlertCircle size={18} />
          {error}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">模型</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">供应商</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">输入价格（/1K tokens）</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">输出价格（/1K tokens）</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {models.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-slate-400">暂无数据</td>
                  </tr>
                ) : (
                  models.flatMap((model) =>
                    (model.vendors || []).map((v) => (
                      <tr key={`${model.id}-${v.vendorId}`} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{model.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{v.vendorName}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          ¥{Number(v.inputPrice || 0).toFixed(6)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          ¥{Number(v.outputPrice || 0).toFixed(6)}
                        </td>
                      </tr>
                    ))
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-700">
          <strong>计费说明：</strong> 按实际消耗的 Token 数量计费，精确到小数点后 6 位。
          充值后自动到账，可随时查看调用日志中的费用明细。
        </p>
      </div>
    </div>
  )

  const renderUsageSection = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-900">使用指南</h2>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold text-slate-800">1. 注册账号</h3>
        <p className="text-sm text-slate-600">在 3Cloud 平台注册账号，并通过邮箱验证。</p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold text-slate-800">2. 创建 API Key</h3>
        <p className="text-sm text-slate-600">
          登录后在「API 密钥」页面创建您的密钥。请安全保管，不要泄露给他人。
        </p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold text-slate-800">3. 充值</h3>
        <p className="text-sm text-slate-600">
          在「充值」页面为您的账户充值。支持微信支付、支付宝、对公转账等多种方式。
        </p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold text-slate-800">4. 开始调用</h3>
        <p className="text-sm text-slate-600">
          使用 OpenAI 兼容 SDK 或直接调用 REST API，即可开始使用。
        </p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold text-slate-800">5. 查看日志</h3>
        <p className="text-sm text-slate-600">
          在「调用日志」页面查看每次请求的详细信息，包括 Token 消耗和费用明细。
        </p>
      </div>
    </div>
  )

  const renderCodeSection = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-900">代码示例</h2>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
        <h3 className="font-semibold text-slate-800">Python (使用 OpenAI SDK)</h3>
        <pre className="bg-slate-900 text-green-400 text-sm px-4 py-3 rounded-lg overflow-x-auto">
{`from openai import OpenAI

client = OpenAI(
    api_key="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    base_url="${baseUrl}/v1"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)

print(response.choices[0].message.content)`}
        </pre>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
        <h3 className="font-semibold text-slate-800">JavaScript / TypeScript</h3>
        <pre className="bg-slate-900 text-green-400 text-sm px-4 py-3 rounded-lg overflow-x-auto">
{`import OpenAI from "openai"

const client = new OpenAI({
  apiKey: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  baseURL: "${baseUrl}/v1",
})

const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
})

console.log(response.choices[0].message.content)`}
        </pre>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
        <h3 className="font-semibold text-slate-800">cURL</h3>
        <pre className="bg-slate-900 text-green-400 text-sm px-4 py-3 rounded-lg overflow-x-auto">
{`curl ${baseUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`}
        </pre>
      </div>
    </div>
  )

  return (
    <div className="flex gap-6">
      {/* Left sidebar - Table of Contents */}
      <div className="hidden lg:block w-56 shrink-0">
        <div className="sticky top-6 space-y-1">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">文档目录</h3>
          {sections.map((sec) => (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                activeSection === sec.id
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <sec.icon size={16} />
              {sec.label}
              {activeSection === sec.id && <ChevronRight size={14} className="ml-auto" />}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile section tabs */}
      <div className="lg:hidden flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {sections.map((sec) => (
          <button
            key={sec.id}
            onClick={() => setActiveSection(sec.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
              activeSection === sec.id
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <sec.icon size={14} />
            {sec.label}
          </button>
        ))}
      </div>

      {/* Right content area */}
      <div className="flex-1 min-w-0">
        {renderContent()}
      </div>
    </div>
  )
}
