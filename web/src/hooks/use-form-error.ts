/**
 * useFormError — API 错误 → 字段级错误映射
 *
 * 将后端返回的错误码转换为可读的字段级错误信息 + 解决方案。
 * 配合 FormField 组件使用。
 *
 * @example
 * const { fieldErrors, globalError } = useFormError(apiError)
 *
 * <FormField label="名称" required
 *   error={fieldErrors.name?.message}
 *   solution={fieldErrors.name?.solution}>
 *   <input ... />
 * </FormField>
 *
 * {globalError && <ErrorMessage>{globalError}</ErrorMessage>}
 */

import { useMemo } from 'react'

/* ──────────────────────────────────────────────
   错误码 → 字段级错误信息映射表
   ────────────────────────────────────────────── */

interface FieldErrorEntry {
  field: string
  message: string
  solution: string
}

type ErrorResolver = (msg: string) => FieldErrorEntry

// 支持动态匹配的正则规则
interface RegexErrorRule {
  regex: RegExp
  resolve: (match: RegExpMatchArray, fullMsg: string) => FieldErrorEntry
}

const STATIC_RULES: Record<string, ErrorResolver> = {
  // 数据库约束错误
  '23505': (msg) => {
    const field = msg.includes('名称') ? 'name' : 'general'
    return {
      field,
      message: '名称已存在',
      solution: '请使用其他名称，或先禁用现有记录后再创建',
    }
  },
  '23503': () => ({
    field: 'vendorId',
    message: '关联的父记录不存在',
    solution: '请先创建关联记录（如厂商/用户），再创建此记录',
  }),
  '23502': (msg) => {
    const field = msg.includes('name') ? 'name' : 'general'
    return { field, message: '必填字段不能为空', solution: '请填写所有必填字段' }
  },
  '42703': () => ({
    field: 'general',
    message: '字段名称错误',
    solution: '请联系管理员检查更新',
  }),

  // 业务错误
  'BALANCE_INSUFFICIENT': () => ({
    field: 'balance',
    message: '余额不足',
    solution: '请前往 <a href="/recharge" class="underline">充值中心</a> 充值后再操作',
  }),
  'RATE_LIMIT_EXCEEDED': () => ({
    field: 'rpm',
    message: '限流值超过上限',
    solution: 'RPM 上限为 10,000，请输入 10,000 以下的值',
  }),
  'MODEL_NOT_FOUND': (msg) => ({
    field: 'model',
    message: msg || '模型不存在或已下架',
    solution: '请检查模型名称拼写，或查看<a href="/models" class="underline">可用模型列表</a>',
  }),
  'INVALID_API_KEY': () => ({
    field: 'apiKey',
    message: 'API Key 无效',
    solution: 'Key 格式应为 sk- 开头，长度 32-128 字符。可在 API Key 页面重新创建',
  }),
  'QUOTA_EXCEEDED': () => ({
    field: 'quota',
    message: '配额已用尽',
    solution: '当前周期配额已用完，请等待下个周期重置，或联系管理员提升配额',
  }),
  'VENDOR_DISABLED': () => ({
    field: 'vendorId',
    message: '所选供应商已禁用',
    solution: '请先启用该供应商，或选择其他可用供应商',
  }),
  'USER_DISABLED': () => ({
    field: 'userId',
    message: '该用户已被禁用',
    solution: '请在用户管理中启用该用户后重试',
  }),

  // 通用
  'NOT_FOUND': (msg) => ({
    field: 'general',
    message: msg || '记录不存在',
    solution: '可能已被删除，请刷新列表后重试',
  }),
  'FORBIDDEN': () => ({
    field: 'general',
    message: '权限不足',
    solution: '你没有执行此操作的权限，请联系超级管理员',
  }),
}

const REGEX_RULES: RegexErrorRule[] = [
  {
    regex: /(.+?) 必填/i,
    resolve: (match) => ({
      field: 'general',
      message: `${match[1]} 不能为空`,
      solution: '请填写此必填字段',
    }),
  },
  {
    regex: /(.+?) 已存在/i,
    resolve: (match) => ({
      field: 'general',
      message: `${match[1]} 已存在`,
      solution: '请使用不同的名称，或先禁用现有记录',
    }),
  },
  {
    regex: /格式不正确|无效的格式|invalid format/i,
    resolve: () => ({
      field: 'general',
      message: '格式不正确',
      solution: '请检查输入格式是否正确',
    }),
  },
]

/* ──────────────────────────────────────────────
   Hook
   ────────────────────────────────────────────── */

export interface ApiError {
  code?: string | number
  message?: string
  statusCode?: number
}

export interface FieldErrors {
  [field: string]: { message: string; solution: string }
}

export function useFormError(apiError: ApiError | string | null): {
  fieldErrors: FieldErrors
  globalError: string | null
} {
  return useMemo(() => {
    if (!apiError) return { fieldErrors: {}, globalError: null }

    const code = typeof apiError === 'string' ? 'UNKNOWN' : (apiError.code ?? apiError.statusCode ?? 'UNKNOWN')
    const message = typeof apiError === 'string' ? apiError : (apiError.message ?? '未知错误')
    const codeStr = String(code)

    // 1. 精确匹配静态规则
    const rule = STATIC_RULES[codeStr]
    if (rule) {
      const fe = rule(message)
      if (fe.field !== 'general') {
        return {
          fieldErrors: { [fe.field]: { message: fe.message, solution: fe.solution } },
          globalError: null,
        }
      }
      return { fieldErrors: {}, globalError: `${fe.message}。${fe.solution}` }
    }

    // 2. 正则匹配
    for (const { regex, resolve } of REGEX_RULES) {
      const match = message.match(regex)
      if (match) {
        const fe = resolve(match, message)
        if (fe.field !== 'general') {
          return {
            fieldErrors: { [fe.field]: { message: fe.message, solution: fe.solution } },
            globalError: null,
          }
        }
        return { fieldErrors: {}, globalError: `${fe.message}。${fe.solution}` }
      }
    }

    // 3. HTTP 状态码兜底
    if (codeStr === '401' || codeStr === '403') {
      return { fieldErrors: {}, globalError: '权限验证失败，请重新登录' }
    }
    if (codeStr === '404') {
      return { fieldErrors: {}, globalError: '请求的资源不存在' }
    }
    if (codeStr === '409') {
      return { fieldErrors: {}, globalError: '数据冲突，请刷新后重试' }
    }
    if (codeStr === '429') {
      return { fieldErrors: {}, globalError: '请求太频繁，请稍后重试' }
    }
    if (codeStr === '500' || codeStr.startsWith('5')) {
      return { fieldErrors: {}, globalError: '服务器内部错误，已记录日志，请稍后重试' }
    }

    // 4. 兜底
    return { fieldErrors: {}, globalError: message }
  }, [apiError])
}
