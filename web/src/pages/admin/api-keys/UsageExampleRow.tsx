// ── UsageExampleRow — 使用示例展开行 ──
// 展示 curl 命令、Node.js 代码示例及注意事项

import { useCallback } from 'react'
import { Terminal } from 'lucide-react'

interface AdminApiKeyItem {
  id: number
  name: string
  keyPrefix: string
  permissions: string[]
  status: string
  expiresAt: string | null
  lastUsedAt: string | null
  createdBy: number
  createdAt: string
}

interface UsageExampleRowProps {
  keyItem: AdminApiKeyItem
  onClose: () => void
}

function buildCurlCommands(base: string, origin: string): string {
  return `# 查询用户列表（GET 请求）
curl -H "Authorization: Bearer sk-${base}..." \\
  ${origin}/api/v1/admin/users?page=1&pageSize=10

# 创建用户（POST 请求）
curl -X POST \\
  -H "Authorization: Bearer sk-${base}..." \\
  -H "Content-Type: application/json" \\
  -d '{"email":"user@example.com","password":"******","role":"user"}' \\
  ${origin}/api/v1/admin/users

# 更新模型（PATCH 请求）
curl -X PATCH \\
  -H "Authorization: Bearer sk-${base}..." \\
  -H "Content-Type: application/json" \\
  -d '{"status":"active"}' \\
  ${origin}/api/v1/admin/models/1`
}

export default function UsageExampleRow({ keyItem, onClose }: UsageExampleRowProps) {
  const prefix = keyItem.keyPrefix.toLowerCase()
  const origin = window.location.origin

  const copyAll = useCallback(() => {
    navigator.clipboard.writeText(buildCurlCommands(prefix, origin))
  }, [prefix, origin])

  return (
    <tr className="bg-indigo-50/30 border-b border-indigo-100">
      <td colSpan={9} className="px-6 py-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-indigo-800">
              <Terminal size={16} />
              使用示例
            </div>
            <button onClick={onClose} className="text-xs text-indigo-500 hover:text-indigo-700">
              收起 <span className="ml-1">&uarr;</span>
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">curl 命令</p>
            <div className="relative group">
              <pre className="bg-slate-900 text-green-400 text-xs p-4 rounded-lg overflow-x-auto font-mono leading-relaxed">
                {buildCurlCommands(prefix, origin)}
              </pre>
              <button
                onClick={copyAll}
                className="absolute top-2 right-2 px-2 py-1 text-[10px] bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition opacity-0 group-hover:opacity-100"
              >
                复制全部
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Node.js（使用 fetch）</p>
            <pre className="bg-slate-100 text-xs p-3 rounded-lg font-mono">
{`const res = await fetch('${origin}/api/v1/admin/users', {
  headers: { 'Authorization': 'Bearer sk-${prefix}...' }
})
const data = await res.json()`}
            </pre>
          </div>

          <div className="text-xs text-slate-400 bg-indigo-50/50 p-3 rounded-lg">
            <p className="font-medium text-indigo-600 mb-1">⚠️ 注意事项</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>
                将 <code className="bg-indigo-100 px-1 rounded">sk-{prefix}...</code>{' '}
                替换为实际的完整 API Key
              </li>
              <li>管理 API Key 仅用于服务端调用，请勿暴露到前端代码中</li>
              <li>
                请将 API 地址{' '}
                <code className="bg-indigo-100 px-1 rounded">{origin}</code>{' '}
                替换为实际部署地址
              </li>
              {keyItem.permissions.length > 0 && (
                <li>
                  当前 Key 权限范围：{' '}
                  <code className="bg-indigo-100 px-1 rounded">{keyItem.permissions.join(', ')}</code>
                </li>
              )}
            </ul>
          </div>
        </div>
      </td>
    </tr>
  )
}
