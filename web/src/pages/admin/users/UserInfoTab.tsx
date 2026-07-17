// ──────────────────────────────────────────────
//  UserInfoTab — 用户基本信息标签页
//  包含：基本信息展示、编辑表单、密码重置、
//        邮箱验证、实名管理
// ──────────────────────────────────────────────

import { useState } from 'react'
import { patch, post } from '@/lib/api'
import type { AdminUser } from '@/types'
import { roleLabel, roleColor, realNameLabel, fmt, fmtDate } from './_shared'
import { RechargeForm } from './UserBalancePanel'

interface InfoTabProps {
  user: AdminUser
  onMsg: (s: string) => void
}

export default function InfoTab({ user, onMsg }: InfoTabProps) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    nickname: user.nickname || '',
    phone: user.phone || '',
    avatarUrl: user.avatarUrl || '',
    status: user.status,
    userType: user.userType,
    discountRate: user.discountRate?.toString() || '',
    rpmOverride: user.rpmOverride?.toString() || '',
    tpmOverride: user.tpmOverride?.toString() || '',
    disabledReason: user.disabledReason || '',
    disabledUntil: user.disabledUntil || '',
  })
  const [newPwd, setNewPwd] = useState('')

  const handleUpdate = async () => {
    try {
      const body: any = {}
      if (form.nickname !== (user.nickname || '')) body.nickname = form.nickname
      if (form.phone !== (user.phone || '')) body.phone = form.phone
      if (form.avatarUrl !== (user.avatarUrl || '')) body.avatarUrl = form.avatarUrl
      if (form.status !== user.status) body.status = form.status
      if (form.userType !== user.userType) body.userType = form.userType
      if (form.discountRate) body.discountRate = parseFloat(form.discountRate)
      if (form.rpmOverride) body.rpmOverride = parseInt(form.rpmOverride)
      if (form.tpmOverride) body.tpmOverride = parseInt(form.tpmOverride)
      if (form.disabledReason !== (user.disabledReason || ''))
        body.disabledReason = form.disabledReason
      if (form.disabledUntil !== (user.disabledUntil || ''))
        body.disabledUntil = form.disabledUntil
      await patch(`/api/v1/admin/users/${user.id}`, body)
      onMsg('用户信息已更新')
      setEditing(false)
    } catch (err: any) {
      onMsg('❌ ' + (err.message || ''))
    }
  }

  const handleResetPwd = async () => {
    if (!newPwd || newPwd.length < 6) { onMsg('密码至少6位'); return }
    try {
      await post(`/api/v1/admin/users/${user.id}/reset-pwd`, { newPassword: newPwd })
      onMsg('✅ 密码已重置')
      setNewPwd('')
    } catch (err: any) {
      onMsg('❌ ' + (err.message || ''))
    }
  }

  return (
    <div className="space-y-6">
      {/* Basic info grid */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div><span className="text-slate-500">ID：</span>{user.id}</div>
        <div><span className="text-slate-500">邮箱：</span>{user.email}</div>
        <div><span className="text-slate-500">昵称：</span>{fmt(user.nickname)}</div>
        <div><span className="text-slate-500">手机：</span>{fmt(user.phone)}</div>
        <div><span className="text-slate-500">类型：</span>{user.userType === 'enterprise' ? '企业' : '个人'}</div>
        <div><span className="text-slate-500">角色：</span>{roleLabel[user.role] || user.role}</div>
        <div><span className="text-slate-500">余额：</span>¥{Number(user.balance || 0).toFixed(6)}</div>
        <div><span className="text-slate-500">折扣率：</span>{user.discountRate ? `${(Number(user.discountRate) * 100).toFixed(2)}%` : '无'}</div>
        <div><span className="text-slate-500">实名：</span>{realNameLabel[user.realNameStatus || 'unverified']}{user.realName ? ` (${user.realName})` : ''}</div>
        <div><span className="text-slate-500">企业：</span>{fmt(user.companyName)}</div>
        <div><span className="text-slate-500">邮箱验证：</span>{user.emailVerifiedAt ? fmtDate(user.emailVerifiedAt) : <span className="text-amber-600 cursor-help" title="如确认用户身份可点击下方「手动验证邮箱」按钮跳过邮件验证">未验证 ⚠️</span>}</div>
        <div><span className="text-slate-500">最后登录：</span>{fmtDate(user.lastLoginAt)}</div>
        {user.stats && (
          <>
            <div><span className="text-slate-500">API Key数：</span>{user.stats.apiKeyCount}</div>
            <div><span className="text-slate-500">充值总额：</span>¥{Number(user.stats.totalRecharge || 0).toFixed(4)}</div>
            <div><span className="text-slate-500">充值单数：</span>{user.stats.orderCount}</div>
          </>
        )}
      </div>

      {/* Edit form */}
      {editing ? (
        <div className="border-t pt-4 space-y-3">
          <h3 className="text-sm font-medium text-slate-700">编辑用户信息</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '昵称', key: 'nickname', type: 'text' },
              { label: '手机', key: 'phone', type: 'text' },
              { label: '头像URL', key: 'avatarUrl', type: 'text' },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-xs text-slate-500 mb-1">{f.label}</label>
                <input type={f.type} value={(form as any)[f.key]}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm" />
              </div>
            ))}
            <div>
              <label className="block text-xs text-slate-500 mb-1">状态</label>
              <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm">
                <option value="active">正常</option><option value="disabled">禁用</option><option value="pending">待验证</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">类型</label>
              <select value={form.userType} onChange={(e) => setForm((p) => ({ ...p, userType: e.target.value }))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm">
                <option value="personal">个人</option><option value="enterprise">企业</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">折扣率 (0-1)</label>
              <input type="number" step="0.01" min="0" max="1" value={form.discountRate}
                onChange={(e) => setForm((p) => ({ ...p, discountRate: e.target.value }))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">RPM上限</label>
              <input type="number" value={form.rpmOverride}
                onChange={(e) => setForm((p) => ({ ...p, rpmOverride: e.target.value }))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">TPM上限</label>
              <input type="number" value={form.tpmOverride}
                onChange={(e) => setForm((p) => ({ ...p, tpmOverride: e.target.value }))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">禁用原因</label>
              <input type="text" value={form.disabledReason}
                onChange={(e) => setForm((p) => ({ ...p, disabledReason: e.target.value }))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">禁用至</label>
              <input type="datetime-local" value={form.disabledUntil ? form.disabledUntil.substring(0, 16) : ''}
                onChange={(e) => setForm((p) => ({ ...p, disabledUntil: e.target.value ? new Date(e.target.value).toISOString() : '' }))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-slate-600">取消</button>
            <button onClick={handleUpdate} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">保存</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => setEditing(true)} className="text-sm text-blue-600 hover:text-blue-800">编辑用户信息</button>
        </div>
      )}

      {/* Recharge */}
      <RechargeForm userId={user.id} onMsg={onMsg} />

      {/* Reset password */}
      <div className="border-t pt-4 space-y-3">
        <h3 className="text-sm font-medium text-slate-700">重置密码</h3>
        <div className="flex gap-2">
          <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="新密码（至少6位）"
            className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm" />
          <button onClick={handleResetPwd} disabled={!newPwd}
            className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50">重置</button>
        </div>
      </div>

      <EmailVerificationSection user={user} onMsg={onMsg} />
      <RealNameAdminSection user={user} onMsg={onMsg} />
    </div>
  )
}

// ── Email Verification Section ────────────────

function EmailVerificationSection({ user, onMsg: notify }: { user: AdminUser; onMsg: (s: string) => void }) {
  const [submitting, setSubmitting] = useState(false)

  if (user.emailVerifiedAt) {
    return (
      <div className="border-t pt-4 space-y-3">
        <h3 className="text-sm font-medium text-slate-700">邮箱验证</h3>
        <div className="flex items-center gap-2">
          <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">✅ 已验证</span>
          <span className="text-sm text-slate-500">验证时间: {fmtDate(user.emailVerifiedAt)}</span>
        </div>
        <button onClick={async () => {
          setSubmitting(true)
          try { await patch(`/api/v1/admin/users/${user.id}`, { status: 'pending' }); notify('✅ 邮箱验证已撤销'); setTimeout(() => window.location.reload(), 1200) }
          catch (e: any) { notify('❌ ' + (e.message || '')) } finally { setSubmitting(false) }
        }} disabled={submitting}
          className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition disabled:opacity-50">
          {submitting ? '处理中...' : '撤销验证（变更为待验证）'}
        </button>
      </div>
    )
  }

  return (
    <div className="border-t pt-4 space-y-3">
      <h3 className="text-sm font-medium text-slate-700">邮箱验证</h3>
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">⚠️ 未验证</span>
        <span className="text-xs text-amber-600">用户注册后未点击验证邮件中的链接，当前账户状态为「待验证」</span>
      </div>
      <button onClick={async () => {
        setSubmitting(true)
        try { await patch(`/api/v1/admin/users/${user.id}`, { status: 'active' }); notify('✅ 邮箱已手动验证'); setTimeout(() => window.location.reload(), 1200) }
        catch (e: any) { notify('❌ ' + (e.message || '')) } finally { setSubmitting(false) }
      }} disabled={submitting}
        className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50">
        {submitting ? '处理中...' : '✅ 手动验证邮箱（变更为正常）'}
      </button>
    </div>
  )
}

// ── Real Name Admin Section ───────────────────

function RealNameAdminSection({ user, onMsg: notify }: { user: AdminUser; onMsg: (s: string) => void }) {
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  const [realName, setRealName] = useState(user.realName || '')
  const [idNumber, setIdNumber] = useState(user.idNumber || '')
  const [companyName, setCompanyName] = useState(user.companyName || '')
  const [rejectReason, setRejectReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const s = user.realNameStatus ?? 'unverified'
  const isApproved = s === 'approved'
  const isRejected = s === 'rejected'

  const statusStyle: Record<string, string> = {
    approved: 'bg-green-100 text-green-700', pending_review: 'bg-yellow-100 text-yellow-700',
    rejected: 'bg-red-100 text-red-700', unverified: 'bg-slate-100 text-slate-500',
  }

  const handleSubmit = async () => {
    if (action === 'approve' && !realName.trim()) { notify('请填写真实姓名'); return }
    if (action === 'reject' && !rejectReason.trim()) { notify('请填写拒绝原因'); return }
    setSubmitting(true)
    try {
      const body: Record<string, any> = { action }
      if (action === 'approve') { body.realName = realName.trim(); if (idNumber.trim()) body.idNumber = idNumber.trim(); if (companyName.trim()) body.companyName = companyName.trim() }
      else { body.rejectReason = rejectReason.trim() }
      await post(`/api/v1/admin/users/${user.id}/manual-real-name`, body)
      notify(action === 'approve' ? '✅ 实名已手动通过' : '✅ 实名已拒绝')
      window.location.reload()
    } catch (err: any) { notify('❌ ' + (err.message || '')) }
    finally { setSubmitting(false); setAction(null) }
  }

  const renderApproveForm = () => (
    <div className="space-y-3 border border-green-200 bg-green-50 rounded-lg p-4">
      <p className="text-xs text-green-700">手动确认实名认证，通过后该用户即可使用 API 调度</p>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs text-green-700 mb-1">真实姓名 *</label><input type="text" value={realName} onChange={e => setRealName(e.target.value)} className="w-full px-3 py-1.5 border border-green-300 rounded text-sm" /></div>
        <div><label className="block text-xs text-green-700 mb-1">身份证号</label><input type="text" value={idNumber} onChange={e => setIdNumber(e.target.value)} className="w-full px-3 py-1.5 border border-green-300 rounded text-sm" /></div>
        <div className="col-span-2"><label className="block text-xs text-green-700 mb-1">企业名称</label><input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full px-3 py-1.5 border border-green-300 rounded text-sm" /></div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={() => setAction(null)} className="px-3 py-1.5 text-sm text-slate-600">取消</button>
        <button onClick={handleSubmit} disabled={submitting || !realName.trim()} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg disabled:opacity-50">{submitting ? '提交中...' : '确认通过'}</button>
      </div>
    </div>
  )

  const renderRejectForm = () => (
    <div className="space-y-2 border border-red-200 bg-red-50 rounded-lg p-3">
      <label className="block text-xs text-red-600 font-medium">原因</label>
      <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={2} className="w-full px-3 py-1.5 border border-red-300 rounded text-sm" />
      <div className="flex gap-2">
        <button onClick={() => setAction(null)} className="px-3 py-1.5 text-sm text-slate-600">取消</button>
        <button onClick={handleSubmit} disabled={submitting || !rejectReason.trim()} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg disabled:opacity-50">{submitting ? '提交中...' : '确认'}</button>
      </div>
    </div>
  )

  if (isApproved) {
    return (
      <div className="border-t pt-4 space-y-3">
        <h3 className="text-sm font-medium text-slate-700">实名管理</h3>
        <div className="flex items-center gap-2">
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle.approved}`}>✅ 已认证</span>
          {user.realName && <span className="text-sm text-slate-600">姓名: {user.realName}</span>}
          {user.companyName && <span className="text-sm text-slate-600">企业: {user.companyName}</span>}
        </div>
        <button onClick={() => { setAction('reject'); setRejectReason('') }} className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition">撤销认证</button>
        {action === 'reject' && renderRejectForm()}
      </div>
    )
  }

  if (s === 'unverified' || isRejected || s === 'pending_review') {
    return (
      <div className="border-t pt-4 space-y-3">
        <h3 className="text-sm font-medium text-slate-700">实名管理</h3>
        <div className="flex items-center gap-2 mb-2">
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[s]}`}>{realNameLabel[s]}</span>
          {isRejected && user.rejectReason && <span className="text-xs text-red-500">拒绝原因: {user.rejectReason}</span>}
        </div>
          <button onClick={() => setAction('approve')} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">✅ 手动通过实名</button>
          {s === 'pending_review' && <button onClick={() => setAction('reject')} className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg">❌ 拒绝</button>}
        {action === 'approve' && renderApproveForm()}
        {action === 'reject' && renderRejectForm()}
      </div>
    )
  }

  return null
}
