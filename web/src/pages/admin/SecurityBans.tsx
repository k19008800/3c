import { useEffect, useState, useCallback, useMemo } from 'react'
import { get, post } from '@/lib/api'
import type { BanList as BanListType } from '@/types'
import { Loader2, AlertCircle, Lock, Plus, RefreshCw, UserX } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'
import BanStatsCards from './security-bans/BanStatsCards'
import BansList from './security-bans/BanList'
import BanForm from './security-bans/BanForm'
import type { BanFormSubmitData } from './security-bans/types'

export default function AdminSecurityBans() {
  const [banData, setBanData] = useState<BanListType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [banning, setBanning] = useState<string | null>(null)
  const [banFormType, setBanFormType] = useState<'ip' | 'user' | null>(null)

  const fetchBans = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<BanListType>('/api/v1/admin/security/bans')
      setBanData(data)
    } catch (err: any) {
      setError(err.message || '获取封禁列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchBans() }, [fetchBans])

  const handleUnbanIp = useCallback(async (ip: string) => {
    setBanning(`ip:${ip}`)
    try {
      await post('/api/v1/admin/security/unban/ip', { ip })
      await fetchBans()
    } catch (err: any) {
      setError(err.message || '解封失败')
    } finally {
      setBanning(null)
    }
  }, [fetchBans])

  const handleUnbanUser = useCallback(async (userId: number) => {
    setBanning(`user:${userId}`)
    try {
      await post('/api/v1/admin/security/unban/user', { userId })
      await fetchBans()
    } catch (err: any) {
      setError(err.message || '解封失败')
    } finally {
      setBanning(null)
    }
  }, [fetchBans])

  const handleBanSubmit = useCallback(async (data: BanFormSubmitData) => {
    if (data.ip) {
      setBanning('ban-ip')
      try {
        await post('/api/v1/admin/security/bans/ip', { ip: data.ip, durationMinutes: data.duration })
        setBanFormType(null)
        await fetchBans()
      } catch (err: any) {
        setError(err.message || '封禁失败')
      } finally {
        setBanning(null)
      }
    } else if (data.userId) {
      setBanning('ban-user')
      try {
        await post('/api/v1/admin/security/bans/user', {
          userId: data.userId,
          durationMinutes: data.duration,
          reason: data.reason,
        })
        setBanFormType(null)
        await fetchBans()
      } catch (err: any) {
        setError(err.message || '封禁失败')
      } finally {
        setBanning(null)
      }
    }
  }, [fetchBans])

  const isFormLoading = useMemo(
    () => banning !== null && (banning === 'ban-ip' || banning === 'ban-user'),
    [banning]
  )

  if (loading && !banData) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Lock size={24} /> 封禁管理
        </h1>
        <FeatureDescription page="admin/security/bans" className="ml-2" />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBanFormType('ip')}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100 transition"
          >
            <Plus size={14} /> 封禁 IP
          </button>
          <button
            onClick={() => setBanFormType('user')}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition"
          >
            <UserX size={14} /> 封禁用户
          </button>
          <button
            onClick={fetchBans}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition"
          >
            <RefreshCw size={14} /> 刷新
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Stats Cards */}
      <BanStatsCards data={banData} />

      {/* Ban List */}
      <BansList
        data={banData}
        banning={banning}
        onUnbanIp={handleUnbanIp}
        onUnbanUser={handleUnbanUser}
      />

      {/* Ban Form Modal */}
      {banFormType && (
        <BanForm
          type={banFormType}
          loading={isFormLoading}
          onSubmit={handleBanSubmit}
          onClose={() => setBanFormType(null)}
        />
      )}
    </div>
  )
}
