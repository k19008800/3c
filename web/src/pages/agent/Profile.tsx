// ═══════════════════════════════════════════════════
//  AgentProfile — 代理个人信息与等级 (PRD 3.1)
//  展示等级、审核状态、发起晋升申请
// ═══════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import { Loader2, AlertCircle, CheckCircle2, Shield, ChevronUp, Info } from 'lucide-react'

interface AgentProfileData {
  id: number
  userId: number
  level: 'preparatory' | 'primary' | 'advanced' | 'sub'
  auditStatus: 'pending' | 'approved' | 'rejected'
  auditRemark: string | null
  status: boolean
  totalCommission: string
  settledCommission: string
  availableBalance: string
  pendingWithdraw: string
  frozenAmount: string
  minWithdrawAmount: string
  withdrawCooldownHours: number
  withdrawFreezeDays: number
  parentAgentId: number | null
  teamDepth: number
  accountManager: string | null
  prioritySupport: boolean
  createdAt: string
}

const LEVEL_CONFIG: Record<string, { label: string; desc: string; benefits: string[] }> = {
  preparatory: {
    label: '预备代理',
    desc: '注册即自动成为预备代理，可查看佣金规则但不能提现',
    benefits: ['查看佣金规则', '管理名下客户'],
  },
  primary: {
    label: '一级代理',
    desc: '通过资质审核后成为一级代理，享受全功能代理面板',
    benefits: ['自定义佣金规则', '佣金提现', '子代理管理', '专属推广链接'],
  },
  advanced: {
    label: '高级代理',
    desc: '月调用量超过100万Token的高级代理，享受专属服务',
    benefits: ['专属客户经理', '优先技术支持', '阶梯佣金(12-18%)', '优先结算'],
  },
  sub: {
    label: '子代理',
    desc: '由上级代理创建，隶属于上级代理团队',
    benefits: ['管理名下用户', '获得上级配置的佣金'],
  },
}

export default function AgentProfile() {
  const [profile, setProfile] = useState<AgentProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchProfile = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<AgentProfileData>('/api/v1/agent/profile')
      setProfile(data)
    } catch (err: any) {
      setError(err.message || '获取代理信息失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProfile() }, [fetchProfile])

  const handleUpgrade = useCallback(async () => {
    setSubmitting(true)
    setError('')
    setMsg('')
    try {
      await post('/api/v1/agent/upgrade-request', {})
      setMsg('晋升申请已提交，请等待管理员审核')
      fetchProfile()
    } catch (err: any) {
      setError(err.message || '提交申请失败')
    } finally {
      setSubmitting(false)
    }
  }, [fetchProfile])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  if (error && !profile) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
        <AlertCircle size={16} /> {error}
      </div>
    )
  }

  if (!profile) return null

  const levelConf = LEVEL_CONFIG[profile.level] || LEVEL_CONFIG.preparatory
  const canUpgrade = profile.level === 'preparatory' || profile.level === 'primary'

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">代理信息</h1>

      {/* 等级卡片 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-full ${profile.level === 'advanced' ? 'bg-purple-50' : profile.level === 'primary' ? 'bg-blue-50' : 'bg-slate-50'}`}>
            <Shield size={28} className={profile.level === 'advanced' ? 'text-purple-600' : profile.level === 'primary' ? 'text-blue-600' : 'text-slate-500'} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-slate-900">{levelConf.label}</h2>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                profile.auditStatus === 'approved' ? 'bg-green-50 text-green-600' :
                profile.auditStatus === 'pending' ? 'bg-amber-50 text-amber-600' :
                'bg-red-50 text-red-600'
              }`}>
                {profile.auditStatus === 'approved' ? '审核通过' :
                 profile.auditStatus === 'pending' ? '待审核' : '已拒绝'}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">{levelConf.desc}</p>

            {/* 权益列表 */}
            <div className="mt-3 space-y-1">
              {levelConf.benefits.map((b, i) => (
                <p key={i} className="text-sm text-slate-600 flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                  {b}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 晋升申请 */}
      {canUpgrade && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2 mb-3">
            <ChevronUp size={18} className="text-blue-600" />
            等级晋升
          </h3>

          <p className="text-sm text-slate-600 mb-4">
            {profile.level === 'preparatory'
              ? '预备代理可申请晋升为一级代理，享受佣金提现等完整功能。'
              : '一级代理满足条件后可申请晋升为高级代理，享受专属客户经理和更高佣金比例。'}
          </p>

          {profile.auditStatus === 'pending' ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700 flex items-center gap-2">
              <Info size={16} />
              已有待审核的晋升申请，请等待管理员审核
            </div>
          ) : (
            <button
              onClick={handleUpgrade}
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <ChevronUp size={16} />}
              申请晋升
            </button>
          )}

          {error && (
            <div className="mt-3 flex items-center gap-2 text-red-600 bg-red-50 p-2.5 rounded-lg text-sm">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          {msg && (
            <div className="mt-3 flex items-center gap-2 text-green-600 bg-green-50 p-2.5 rounded-lg text-sm">
              <CheckCircle2 size={14} /> {msg}
            </div>
          )}
        </div>
      )}

      {/* 只读信息 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900 mb-3">账户信息</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-500">代理编号</span>
            <p className="text-slate-900 font-medium mt-0.5">#{profile.id}</p>
          </div>
          <div>
            <span className="text-slate-500">创建时间</span>
            <p className="text-slate-900 font-medium mt-0.5">{new Date(profile.createdAt).toLocaleDateString('zh-CN')}</p>
          </div>
          {profile.parentAgentId && (
            <div>
              <span className="text-slate-500">上级代理ID</span>
              <p className="text-slate-900 font-medium mt-0.5">#{profile.parentAgentId}</p>
            </div>
          )}
          <div>
            <span className="text-slate-500">提现冷却时长</span>
            <p className="text-slate-900 font-medium mt-0.5">{profile.withdrawCooldownHours}小时</p>
          </div>
          <div>
            <span className="text-slate-500">佣金冻结天数</span>
            <p className="text-slate-900 font-medium mt-0.5">{profile.withdrawFreezeDays}天</p>
          </div>
          {profile.accountManager && (
            <div>
              <span className="text-slate-500">专属客户经理</span>
              <p className="text-slate-900 font-medium mt-0.5">{profile.accountManager}</p>
            </div>
          )}
          <div>
            <span className="text-slate-500">优先技术支持</span>
            <p className={`font-medium mt-0.5 ${profile.prioritySupport ? 'text-green-600' : 'text-slate-400'}`}>
              {profile.prioritySupport ? '已开通 ✅' : '未开通'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
