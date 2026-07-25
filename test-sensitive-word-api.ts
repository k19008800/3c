// 敏感词测试 API 验证脚本
import { FastifyInstance } from 'fastify'
import fastify from 'fastify'
import { promptAuditRoutes } from './api/src/routes/admin/prompt-audit.js'

async function test() {
  const app = fastify()

  // Mock auth middleware
  app.decorateRequest('user', { id: 1, role: 'admin' })
  app.addHook('preHandler', async (req, reply) => {
    // Skip auth for test
  })

  // Register routes
  await promptAuditRoutes(app)

  // Test the endpoint
  console.log('Testing POST /api/v1/admin/sensitive-words/test')

  // List available routes
  console.log('\nRegistered routes:')
  app.printRoutes()

  await app.close()
}

test().catch(console.error)
