import { Link2, Copy, CheckCheck, Loader2 } from 'lucide-react'
import { type ClientStatsCardsProps } from './types'

/**
 * 客户统计 — 邀请推广链接卡片 + 客户总数
 *
 * 【状态覆盖】
 *  - linkLoading: 生成中 spinner
 *  - copied: 已复制反馈
 *  - 有 referralLink: 显示说明文案
 *  - 无 referralLink: 显示 "生成链接" 按钮
 */
export default function ClientStatsCards({
  total,
  referralLink,
  linkLoading,
  copied,
  onGenerateLink,
}: ClientStatsCardsProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 size={18} className="text-blue-600" />
          <span className="text-sm font-semibold text-slate-700">
            邀请推广链接（共 {total} 位客户）
          </span>
        </div>
        <button
          onClick={onGenerateLink}
          disabled={linkLoading}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {linkLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : copied ? (
            <CheckCheck size={14} />
          ) : (
            <Copy size={14} />
          )}
          {copied ? '已复制' : referralLink ? '复制链接' : '生成链接'}
        </button>
      </div>
      {referralLink && (
        <p className="mt-2 text-xs text-slate-400">
          将此链接分享给客户，客户注册后自动绑定到您名下（不在页面显示任何推荐信息）
        </p>
      )}
    </div>
  )
}
