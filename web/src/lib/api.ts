import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import type { ApiResponse } from '@/types'

const api = axios.create({
  baseURL: '',
  timeout: 30000,
})

// Request interceptor: attach JWT (supports impersonation)
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const isImpersonating = localStorage.getItem('isImpersonating') === 'true'
    const impersonateToken = localStorage.getItem('impersonateToken')

    if (isImpersonating && impersonateToken && config.headers) {
      config.headers.Authorization = `Bearer ${impersonateToken}`
    } else {
      const token = localStorage.getItem('accessToken')
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ── Token 刷新互斥锁 ──
// 防止多个并发 401 请求同时触发 refresh
let isRefreshing = false
let refreshQueue: Array<{
  resolve: (token: string) => void
  reject: (err: any) => void
}> = []

function processQueue(token: string | null, err: any = null) {
  refreshQueue.forEach((item) => {
    if (err) {
      item.reject(err)
    } else {
      item.resolve(token!)
    }
  })
  refreshQueue = []
}

// Response interceptor: unwrap data, handle 401 with refresh
api.interceptors.response.use(
  (response) => {
    const res = response.data as ApiResponse
    if (res.code !== 0) {
      const error = new Error(res.message || '请求失败')
      ;(error as any).code = res.code
      return Promise.reject(error)
    }
    return response
  },
  async (error: AxiosError<ApiResponse>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // 登录/注册接口的 401 直接透传，不做 token 刷新和页面跳转
    const skipAuthReset = originalRequest.url?.includes('/api/v1/auth/login') ||
      originalRequest.url?.includes('/api/v1/auth/register')

    if (error.response?.status === 401 && !skipAuthReset) {
      // 已有 refresh 在进行中 → 进入等待队列
      if (isRefreshing && !originalRequest._retry) {
        return new Promise<string>((resolve, reject) => {
          refreshQueue.push({ resolve, reject })
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`
          }
          return api(originalRequest)
        })
      }

      if (!originalRequest._retry) {
        originalRequest._retry = true
        isRefreshing = true

        const refreshToken = localStorage.getItem('refreshToken')
        if (refreshToken) {
          try {
            const res = await axios.post('/api/v1/auth/refresh', {
              refreshToken,
            })
            const data = res.data as ApiResponse<{ accessToken: string; expiresIn: number }>
            if (data.code === 0 && data.data) {
              const newToken = data.data.accessToken
              localStorage.setItem('accessToken', newToken)
              // 唤醒队列中的等待请求
              processQueue(newToken)
              isRefreshing = false

              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${newToken}`
              }
              return api(originalRequest)
            }
          } catch {
            // refresh 接口自身失败
          }
        }

        // refresh 失败 → 拒绝队列 + 跳转登录
        isRefreshing = false
        processQueue(null, new Error('Refresh failed'))
      }

      // 清除凭证跳转登录（用 setTimeout 确保返回空 Promise 后再跳）
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
      setTimeout(() => {
        window.location.href = '/login'
      }, 0)
      return new Promise(() => {})
    }

    // 提取服务端错误 message
    const serverMsg = error.response?.data?.message
    const err = new Error(serverMsg || error.message || '请求失败')
    return Promise.reject(err)
  }
)

export default api

// Helper: POST with unwrapped data
export async function post<T = any>(url: string, body?: any): Promise<T> {
  const res = await api.post<ApiResponse<T>>(url, body)
  return res.data.data as T
}

// Helper: GET with unwrapped data
export async function get<T = any>(url: string, params?: any): Promise<T> {
  const res = await api.get<ApiResponse<T>>(url, { params })
  return res.data.data as T
}

// Helper: PATCH with unwrapped data
export async function patch<T = any>(url: string, body?: any): Promise<T> {
  const res = await api.patch<ApiResponse<T>>(url, body)
  return res.data.data as T
}

// Helper: PUT with unwrapped data
export async function put<T = any>(url: string, body?: any): Promise<T> {
  const res = await api.put<ApiResponse<T>>(url, body)
  return res.data.data as T
}

// Helper: DELETE with unwrapped data
export async function del<T = any>(url: string): Promise<T> {
  const res = await api.delete<ApiResponse<T>>(url)
  return res.data.data as T
}

// Helper: Download file from server (e.g. CSV)
export function downloadUrl(url: string, filename: string) {
  const token = localStorage.getItem('accessToken')
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  return api.get(url, { responseType: 'blob', headers })
    .then((res) => {
      const blob = new Blob([res.data], { type: (res.headers['content-type'] as string) || 'text/csv' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = filename
      link.click()
      URL.revokeObjectURL(link.href)
    })
}
