// API 并行请求性能测试脚本
// 模拟优化前后的性能差异

const apiCallTimes = {
  '/api/v1/logs/summary': 200,
  '/api/v1/auth/security/login-history?limit=5': 136,
  '/api/v1/me/quota': 180,
  '/api/v1/api-keys': 150,
  '/api/v1/api-keys/{id}/stats': 120,
  '/api/v1/me/stats/usage': 100,
  '/api/v1/me/stats/daily': 110,
  '/api/v1/me/stats/by-model': 130
}

// 模拟串行执行
function simulateSerial(calls) {
  let totalTime = 0
  calls.forEach(call => {
    totalTime += apiCallTimes[call] || 100
  })
  return totalTime
}

// 模拟并行执行
function simulateParallel(calls) {
  const times = calls.map(call => apiCallTimes[call] || 100)
  return Math.max(...times)
}

// Dashboard.tsx 优化前
const dashboardBefore = [
  '/api/v1/logs/summary',
  '/api/v1/auth/security/login-history?limit=5',
  '/api/v1/me/quota'
]

// Dashboard.tsx 优化后（并行）
const dashboardAfter = [
  '/api/v1/auth/security/login-history?limit=5',
  '/api/v1/me/quota'
]
// fetchSummary 单独执行，但可以与上面并行

console.log('=== Dashboard 页面性能分析 ===')
console.log('优化前（串行）:')
console.log(`  /api/v1/logs/summary: ${apiCallTimes['/api/v1/logs/summary']}ms`)
console.log(`  /api/v1/auth/security/login-history?limit=5: ${apiCallTimes['/api/v1/auth/security/login-history?limit=5']}ms`)
console.log(`  /api/v1/me/quota: ${apiCallTimes['/api/v1/me/quota']}ms`)
console.log(`  总时间: ${simulateSerial(dashboardBefore)}ms`)

console.log('\n优化后（并行）:')
console.log(`  fetchSummary 与下面两个请求并行:`)
console.log(`  /api/v1/auth/security/login-history?limit=5: ${apiCallTimes['/api/v1/auth/security/login-history?limit=5']}ms`)
console.log(`  /api/v1/me/quota: ${apiCallTimes['/api/v1/me/quota']}ms`)
const parallelTime = Math.max(
  apiCallTimes['/api/v1/logs/summary'],
  simulateParallel(dashboardAfter)
)
console.log(`  总时间: ${parallelTime}ms`)

const improvement = simulateSerial(dashboardBefore) - parallelTime
const improvementPercent = (improvement / simulateSerial(dashboardBefore)) * 100
console.log(`\n性能提升: ${improvement}ms (${improvementPercent.toFixed(1)}%)`)

// FinanceDashboard.tsx 分析
console.log('\n=== FinanceDashboard 页面分析 ===')
const financeCalls = [
  '/api/v1/admin/stats/dashboard', // fetchDashboard
  '/api/v1/admin/stats/overview',  // fetchOverview
  '/api/v1/admin/stats/trend?days=30',
  '/api/v1/admin/stats/by-model?limit=10',
  '/api/v1/admin/dashboard/top-consumers'
]

// 假设每个调用100ms
console.log(`5个并行请求，每个约100ms`)
console.log(`并行执行时间: ${Math.max(...financeCalls.map(() => 100))}ms`)
console.log(`串行执行时间: ${100 * financeCalls.length}ms`)
console.log(`性能提升: ${(100 * financeCalls.length) - 100}ms (${((500 - 100) / 500 * 100).toFixed(1)}%)`)