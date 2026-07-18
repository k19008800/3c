/**
 * ProfilePanel — 供应商信息显示与编辑
 */

import { useState, useCallback } from 'react'
import { Users, Key, Save, Loader2, RefreshCw } from 'lucide-react'
import api from '@/lib/api'
import type { VendorInfo } from './types'
import { StatusBadge } from './types'

interface Props {
  info: VendorInfo
  vendorKey: string
  onInfoUpdated: () => void
  onOpenKeyModal: () => void
}

export default function ProfilePanel({ info, vendorKey, onInfoUpdated, onOpenKeyModal }: Props) {
  const [editProfile, setEditProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({
    contactName: info.contactName || '',
    contactPhone: info.contactPhone || '',
    contactEmail: info.contactEmail || '',
    description: info.description || '',
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [error, setError] = useState('')

  // Sync form when info changes externally
  const canEdit = !savingProfile

  const handleSave = useCallback(async () => {
    setSavingProfile(true)
    setError('')
    try {
      const res = await api.put('/api/vendor/me', profileForm, {
        headers: { 'X-Vendor-Key': vendorKey },
      })
      if (res.data.code !== 0) throw new Error(res.data.message || '保存失败')
      setEditProfile(false)
      onInfoUpdated()
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || '保存失败')
    } finally {
      setSavingProfile(false)
    }
  }, [profileForm, vendorKey, onInfoUpdated])

  const handleCancel = useCallback(() => {
    setEditProfile(false)
    setProfileForm({
      contactName: info.contactName || '',
      contactPhone: info.contactPhone || '',
      contactEmail: info.contactEmail || '',
      description: info.description || '',
    })
    setError('')
  }, [info])

  const handleChange = useCallback((field: string, value: string) => {
    setProfileForm(prev => ({ ...prev, [field]: value }))
  }, [])

  return (
    <>
      {/* 信息卡片 */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{info.name}</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {info.companyName || '-'} · {info.contactName || '-'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">
              Key: <code className="text-blue-600">{info.vendorKeyPrefix}****</code>
            </span>
            <StatusBadge status={info.status} />
            <button
              onClick={onOpenKeyModal}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition"
            >
              <RefreshCw size={12} />轮换 Key
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 text-red-600 bg-red-50 p-2 rounded text-sm">{error}</div>
        )}

        {editProfile ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">联系人</label>
              <input
                value={profileForm.contactName}
                onChange={e => handleChange('contactName', e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">电话</label>
              <input
                value={profileForm.contactPhone}
                onChange={e => handleChange('contactPhone', e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">邮箱</label>
              <input
                value={profileForm.contactEmail}
                onChange={e => handleChange('contactEmail', e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm"
                disabled={!canEdit}
              />
            </div>
            <div className="col-span-2 md:col-span-1 flex items-end gap-2">
              <button
                onClick={handleSave}
                disabled={savingProfile}
                className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
              >
                {savingProfile ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                保存
              </button>
              <button onClick={handleCancel} className="px-3 py-1.5 text-slate-500 text-sm">
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
            <div>
              <span className="text-slate-400">接口地址</span>
              <p className="text-slate-700 font-mono text-xs mt-0.5">{info.baseUrl}</p>
            </div>
            <div>
              <span className="text-slate-400">联系人</span>
              <p className="text-slate-700">{info.contactName || '-'}</p>
            </div>
            <div>
              <span className="text-slate-400">电话</span>
              <p className="text-slate-700">{info.contactPhone || '-'}</p>
            </div>
            <div>
              <span className="text-slate-400">邮箱</span>
              <p className="text-slate-700">{info.contactEmail || '-'}</p>
              <button
                onClick={() => {
                  setProfileForm({
                    contactName: info.contactName || '',
                    contactPhone: info.contactPhone || '',
                    contactEmail: info.contactEmail || '',
                    description: info.description || '',
                  })
                  setEditProfile(true)
                }}
                className="text-xs text-blue-500 hover:text-blue-700 mt-1"
              >
                编辑资料
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 基本信息 & API 配置双栏 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Users size={16} />供应商资料
          </h3>
          <dl className="space-y-3 text-sm">
            {[
              ['名称', info.name],
              ['公司', info.companyName || '-'],
              ['状态', <StatusBadge key="s" status={info.status} />],
              ['描述', info.description || '-'],
              ['注册时间', new Date(info.createdAt).toLocaleString('zh-CN')],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">{k}</span>
                <span className="text-slate-700 font-medium">{v as any}</span>
              </div>
            ))}
          </dl>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Key size={16} />API 配置
          </h3>
          <dl className="space-y-3 text-sm">
            {[
              ['接口地址', info.baseUrl],
              ['Key 前缀', `${info.vendorKeyPrefix}****`],
              [
                'Key 状态',
                info.vendorKeyActive
                  ? <span key="k" className="text-green-600">已激活</span>
                  : <span key="k" className="text-red-600">未激活</span>,
              ],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">{k}</span>
                <span className="text-slate-700 font-medium">{v as any}</span>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex gap-2">
            <button
              onClick={onOpenKeyModal}
              className="flex items-center gap-1 text-xs px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition"
            >
              <RefreshCw size={12} />轮换 Key
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
