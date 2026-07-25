/**
 * 敏感词测试 API 单元测试
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { build } from '../app'
import type { FastifyInstance } from 'fastify'

describe('敏感词测试 API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('应该返回 400 当文本为空', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/sensitive-words/test',
      headers: {
        authorization: 'Bearer test-token',
      },
      payload: {
        text: '',
      },
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.message).toBe('测试文本不能为空')
  })

  it('应该返回未匹配结果 当文本不含敏感词', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/sensitive-words/test',
      headers: {
        authorization: 'Bearer test-token',
      },
      payload: {
        text: '这是一段正常的测试文本',
      },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.code).toBe(0)
    expect(body.data.matched).toBe(false)
    expect(body.data.matches).toEqual([])
    expect(body.data.totalMatches).toBe(0)
    expect(body.data.uniqueWords).toBe(0)
  })

  it('应该返回匹配结果 当文本包含敏感词', async () => {
    // 先创建一个敏感词
    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/sensitive-words',
      headers: {
        authorization: 'Bearer test-token',
      },
      payload: {
        word: '测试敏感词',
        category: 'general',
        severity: 'medium',
      },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/sensitive-words/test',
      headers: {
        authorization: 'Bearer test-token',
      },
      payload: {
        text: '这是一段包含测试敏感词的文本',
      },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.code).toBe(0)
    expect(body.data.matched).toBe(true)
    expect(body.data.matches.length).toBeGreaterThan(0)
    expect(body.data.totalMatches).toBeGreaterThan(0)
    expect(body.data.uniqueWords).toBeGreaterThan(0)

    // 验证匹配结果结构
    const match = body.data.matches[0]
    expect(match).toHaveProperty('word')
    expect(match).toHaveProperty('position')
    expect(match).toHaveProperty('category')
    expect(match).toHaveProperty('severity')
  })

  it('应该支持分类筛选', async () => {
    // 创建不同分类的敏感词
    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/sensitive-words',
      headers: {
        authorization: 'Bearer test-token',
      },
      payload: {
        word: '政治词汇',
        category: 'political',
        severity: 'high',
      },
    })

    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/sensitive-words',
      headers: {
        authorization: 'Bearer test-token',
      },
      payload: {
        word: '通用词汇',
        category: 'general',
        severity: 'low',
      },
    })

    // 测试只筛选 political 分类
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/sensitive-words/test',
      headers: {
        authorization: 'Bearer test-token',
      },
      payload: {
        text: '这是政治词汇和通用词汇的测试',
        category: 'political',
      },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.code).toBe(0)
    // 应该只匹配 political 分类的词
    expect(body.data.matches.every((m: any) => m.category === 'political')).toBe(true)
  })

  it('应该大小写不敏感匹配', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/sensitive-words',
      headers: {
        authorization: 'Bearer test-token',
      },
      payload: {
        word: 'BADWORD',
        category: 'general',
        severity: 'medium',
      },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/sensitive-words/test',
      headers: {
        authorization: 'Bearer test-token',
      },
      payload: {
        text: '这是 badword 的小写形式',
      },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.data.matched).toBe(true)
    expect(body.data.matches[0].word).toBe('BADWORD')
  })

  it('应该返回所有匹配位置', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/sensitive-words',
      headers: {
        authorization: 'Bearer test-token',
      },
      payload: {
        word: '测试',
        category: 'general',
        severity: 'low',
      },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/sensitive-words/test',
      headers: {
        authorization: 'Bearer test-token',
      },
      payload: {
        text: '测试一次，测试两次，测试三次',
      },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.data.matched).toBe(true)
    expect(body.data.totalMatches).toBe(3) // 应该匹配3次
    expect(body.data.uniqueWords).toBe(1) // 但只有1个不同的词
  })
})
