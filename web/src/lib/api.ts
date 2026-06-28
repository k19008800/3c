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

// Response interceptor: unwrap data, handle 401
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

    if (error.response?.status === 401 && !originalRequest._retry && !skipAuthReset) {
      originalRequest._retry = true
      const refreshToken = localStorage.getItem('refreshToken')

      if (refreshToken) {
        try {
          const res = await axios.post('/api/v1/auth/refresh', {
            refreshToken,
          })
          const data = res.data as ApiResponse<{ accessToken: string; expiresIn: number }>
          if (data.code === 0 && data.data) {
            localStorage.setItem('accessToken', data.data.accessToken)
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`
            }
            return api(originalRequest)
          }
        } catch {
          // refresh failed, redirect to login
        }
      }

      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
      window.location.href = '/login'
      return Promise.reject(error)
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
