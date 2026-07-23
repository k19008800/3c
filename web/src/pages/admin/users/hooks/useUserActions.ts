import { useState, useCallback } from 'react'
import { get, post, patch, del } from '@/lib/api'
import type { AdminUser, LoginHistoryRecord, UserNote, UserIpWhitelistEntry } from '@/types'

export interface UseUserActionsReturn {
  // User actions
  disableUser: (userId: number) => Promise<boolean>
  enableUser: (userId: number) => Promise<boolean>
  impersonateUser: (userId: number) => Promise<boolean>
  resetPassword: (userId: number) => Promise<boolean>
  
  // Notes
  fetchNotes: (userId: number) => Promise<UserNote[]>
  addNote: (userId: number, content: string) => Promise<boolean>
  deleteNote: (userId: number, noteId: number) => Promise<boolean>
  
  // Login history
  fetchLoginHistory: (userId: number) => Promise<LoginHistoryRecord[]>
  
  // IP whitelist
  fetchIpWhitelist: (userId: number) => Promise<UserIpWhitelistEntry[]>
  addIpWhitelist: (userId: number, ip: string, description?: string) => Promise<boolean>
  removeIpWhitelist: (userId: number, ipId: number) => Promise<boolean>
  
  // Loading states
  loading: boolean
  error: string
  successMessage: string
}

export function useUserActions(): UseUserActionsReturn {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const clearMessages = useCallback(() => {
    setError('')
    setSuccessMessage('')
  }, [])

  const disableUser = useCallback(async (userId: number): Promise<boolean> => {
    clearMessages()
    setLoading(true)
    try {
      await post(`/api/v1/admin/users/${userId}/disable`)
      setSuccessMessage('用户已禁用')
      return true
    } catch (err: any) {
      setError(err.message || '禁用用户失败')
      return false
    } finally {
      setLoading(false)
    }
  }, [clearMessages])

  const enableUser = useCallback(async (userId: number): Promise<boolean> => {
    clearMessages()
    setLoading(true)
    try {
      await post(`/api/v1/admin/users/${userId}/enable`)
      setSuccessMessage('用户已启用')
      return true
    } catch (err: any) {
      setError(err.message || '启用用户失败')
      return false
    } finally {
      setLoading(false)
    }
  }, [clearMessages])

  const impersonateUser = useCallback(async (userId: number): Promise<boolean> => {
    clearMessages()
    setLoading(true)
    try {
      const result = await post<{ redirectUrl: string }>(`/api/v1/admin/users/${userId}/impersonate`)
      // Redirect to impersonation URL
      window.location.href = result.redirectUrl
      return true
    } catch (err: any) {
      setError(err.message || '切换身份失败')
      return false
    } finally {
      setLoading(false)
    }
  }, [clearMessages])

  const resetPassword = useCallback(async (userId: number): Promise<boolean> => {
    clearMessages()
    setLoading(true)
    try {
      const result = await post<{ newPassword: string }>(`/api/v1/admin/users/${userId}/reset-password`)
      setSuccessMessage(`密码已重置: ${result.newPassword}`)
      return true
    } catch (err: any) {
      setError(err.message || '重置密码失败')
      return false
    } finally {
      setLoading(false)
    }
  }, [clearMessages])

  const fetchNotes = useCallback(async (userId: number): Promise<UserNote[]> => {
    try {
      const data = await get<{ list: UserNote[] }>(`/api/v1/admin/users/${userId}/notes`)
      return data.list
    } catch {
      return []
    }
  }, [])

  const addNote = useCallback(async (userId: number, content: string): Promise<boolean> => {
    clearMessages()
    setLoading(true)
    try {
      await post(`/api/v1/admin/users/${userId}/notes`, { content })
      setSuccessMessage('笔记已添加')
      return true
    } catch (err: any) {
      setError(err.message || '添加笔记失败')
      return false
    } finally {
      setLoading(false)
    }
  }, [clearMessages])

  const deleteNote = useCallback(async (userId: number, noteId: number): Promise<boolean> => {
    clearMessages()
    setLoading(true)
    try {
      await del(`/api/v1/admin/users/${userId}/notes/${noteId}`)
      setSuccessMessage('笔记已删除')
      return true
    } catch (err: any) {
      setError(err.message || '删除笔记失败')
      return false
    } finally {
      setLoading(false)
    }
  }, [clearMessages])

  const fetchLoginHistory = useCallback(async (userId: number): Promise<LoginHistoryRecord[]> => {
    try {
      const data = await get<{ list: LoginHistoryRecord[] }>(`/api/v1/admin/users/${userId}/login-history`)
      return data.list
    } catch {
      return []
    }
  }, [])

  const fetchIpWhitelist = useCallback(async (userId: number): Promise<UserIpWhitelistEntry[]> => {
    try {
      const data = await get<{ list: UserIpWhitelistEntry[] }>(`/api/v1/admin/users/${userId}/ip-whitelist`)
      return data.list
    } catch {
      return []
    }
  }, [])

  const addIpWhitelist = useCallback(async (userId: number, ip: string, description?: string): Promise<boolean> => {
    clearMessages()
    setLoading(true)
    try {
      await post(`/api/v1/admin/users/${userId}/ip-whitelist`, { ip, description })
      setSuccessMessage('IP白名单已添加')
      return true
    } catch (err: any) {
      setError(err.message || '添加IP白名单失败')
      return false
    } finally {
      setLoading(false)
    }
  }, [clearMessages])

  const removeIpWhitelist = useCallback(async (userId: number, ipId: number): Promise<boolean> => {
    clearMessages()
    setLoading(true)
    try {
      await del(`/api/v1/admin/users/${userId}/ip-whitelist/${ipId}`)
      setSuccessMessage('IP白名单已移除')
      return true
    } catch (err: any) {
      setError(err.message || '移除IP白名单失败')
      return false
    } finally {
      setLoading(false)
    }
  }, [clearMessages])

  return {
    disableUser,
    enableUser,
    impersonateUser,
    resetPassword,
    fetchNotes,
    addNote,
    deleteNote,
    fetchLoginHistory,
    fetchIpWhitelist,
    addIpWhitelist,
    removeIpWhitelist,
    loading,
    error,
    successMessage
  }
}