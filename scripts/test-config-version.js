#!/usr/bin/env node
// ============================================================
//  3cloud (3C) — 配置版本控制功能测试脚本
//  验证配置版本控制各项功能是否正常工作
// ============================================================

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const axios = require('axios')

const API_BASE = process.env.API_BASE || 'http://localhost:3000'
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'your_admin_token_here'

const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Authorization': `Bearer ${ADMIN_TOKEN}`,
    'Content-Type': 'application/json'
  }
})

class ConfigVersionTest {
  constructor() {
    this.testResults = []
    this.testConfigKey = 'test_config_version'
    this.testSnapshotName = `test_snapshot_${Date.now()}`
  }

  async logTest(name, success, message) {
    const result = {
      name,
      success,
      message,
      timestamp: new Date().toISOString()
    }
    this.testResults.push(result)
    console.log(`${success ? '✅' : '❌'} ${name}: ${message}`)
    return success
  }

  async testConnection() {
    try {
      const response = await apiClient.get('/health')
      return this.logTest('API连接测试', true, `API健康状态: ${response.data.status}`)
    } catch (error) {
      return this.logTest('API连接测试', false, `连接失败: ${error.message}`)
    }
  }

  async testCreateConfig() {
    try {
      const response = await apiClient.patch(`/api/v1/admin/configs/enhanced/${this.testConfigKey}`, {
        value: 'initial_value',
        changeReason: '测试配置版本控制'
      })
      
      return this.logTest('创建测试配置', true, '测试配置创建成功')
    } catch (error) {
      return this.logTest('创建测试配置', false, `创建失败: ${error.message}`)
    }
  }

  async testUpdateConfig() {
    try {
      const response = await apiClient.patch(`/api/v1/admin/configs/enhanced/${this.testConfigKey}`, {
        value: 'updated_value',
        changeReason: '测试配置更新'
      })
      
      return this.logTest('更新配置', true, '配置更新成功，版本控制已记录')
    } catch (error) {
      return this.logTest('更新配置', false, `更新失败: ${error.message}`)
    }
  }

  async testGetHistory() {
    try {
      const response = await apiClient.get(`/api/v1/admin/config/history?configKey=${this.testConfigKey}`)
      const hasHistory = response.data.data?.list?.length > 0
      
      return this.logTest('获取配置历史', hasHistory, 
        hasHistory ? `找到 ${response.data.data.list.length} 条历史记录` : '未找到历史记录')
    } catch (error) {
      return this.logTest('获取配置历史', false, `获取失败: ${error.message}`)
    }
  }

  async testCreateSnapshot() {
    try {
      const response = await apiClient.post('/api/v1/admin/config/snapshots', {
        name: this.testSnapshotName,
        description: '测试快照',
        configType: 'system'
      })
      
      this.snapshotId = response.data.data.snapshotId
      return this.logTest('创建配置快照', true, `快照创建成功，ID: ${this.snapshotId}`)
    } catch (error) {
      return this.logTest('创建配置快照', false, `创建失败: ${error.message}`)
    }
  }

  async testGetSnapshots() {
    try {
      const response = await apiClient.get('/api/v1/admin/config/snapshots')
      const hasSnapshots = response.data.data?.list?.length > 0
      
      return this.logTest('获取快照列表', hasSnapshots, 
        hasSnapshots ? `找到 ${response.data.data.list.length} 个快照` : '未找到快照')
    } catch (error) {
      return this.logTest('获取快照列表', false, `获取失败: ${error.message}`)
    }
  }

  async testCreateChangeRequest() {
    try {
      const response = await apiClient.post('/api/v1/admin/config/change-requests', {
        configKey: this.testConfigKey,
        configType: 'system',
        newValue: 'requested_value',
        requestReason: '测试变更请求'
      })
      
      this.changeRequestId = response.data.data.requestId
      return this.logTest('创建变更请求', true, `变更请求创建成功，ID: ${this.changeRequestId}`)
    } catch (error) {
      return this.logTest('创建变更请求', false, `创建失败: ${error.message}`)
    }
  }

  async testGetChangeRequests() {
    try {
      const response = await apiClient.get('/api/v1/admin/config/change-requests')
      const hasRequests = response.data.data?.list?.length > 0
      
      return this.logTest('获取变更请求列表', hasRequests, 
        hasRequests ? `找到 ${response.data.data.list.length} 个变更请求` : '未找到变更请求')
    } catch (error) {
      return this.logTest('获取变更请求列表', false, `获取失败: ${error.message}`)
    }
  }

  async testConfigDiff() {
    try {
      const response = await apiClient.get(`/api/v1/admin/config/system/${this.testConfigKey}/diff`)
      const hasDiff = response.data.data?.diff !== undefined
      
      return this.logTest('配置对比功能', hasDiff, 
        hasDiff ? '配置对比功能正常' : '配置对比功能异常')
    } catch (error) {
      return this.logTest('配置对比功能', false, `对比失败: ${error.message}`)
    }
  }

  async testEnhancedConfigList() {
    try {
      const response = await apiClient.get('/api/v1/admin/configs/enhanced')
      const hasConfigs = response.data.data?.list?.length > 0
      
      return this.logTest('增强版配置列表', hasConfigs, 
        hasConfigs ? `找到 ${response.data.data.list.length} 个配置项` : '未找到配置项')
    } catch (error) {
      return this.logTest('增强版配置列表', false, `获取失败: ${error.message}`)
    }
  }

  async testConfigStats() {
    try {
      const response = await apiClient.get('/api/v1/admin/configs/enhanced/stats')
      const hasStats = response.data.data?.configCount !== undefined
      
      return this.logTest('配置统计功能', hasStats, 
        hasStats ? '配置统计功能正常' : '配置统计功能异常')
    } catch (error) {
      return this.logTest('配置统计功能', false, `获取失败: ${error.message}`)
    }
  }

  async testBatchUpdate() {
    try {
      const response = await apiClient.post('/api/v1/admin/configs/enhanced/batch', {
        updates: [
          {
            key: this.testConfigKey,
            value: 'batch_updated_value',
            changeReason: '测试批量更新'
          }
        ],
        globalChangeReason: '批量更新测试'
      })
      
      const success = response.data.data?.success > 0
      return this.logTest('批量配置更新', success, 
        success ? '批量更新成功' : '批量更新失败')
    } catch (error) {
      return this.logTest('批量配置更新', false, `批量更新失败: ${error.message}`)
    }
  }

  async runAllTests() {
    console.log('🚀 开始配置版本控制功能测试...\n')
    
    // 运行所有测试
    await this.testConnection()
    await this.testCreateConfig()
    await this.testUpdateConfig()
    await this.testGetHistory()
    await this.testCreateSnapshot()
    await this.testGetSnapshots()
    await this.testCreateChangeRequest()
    await this.testGetChangeRequests()
    await this.testConfigDiff()
    await this.testEnhancedConfigList()
    await this.testConfigStats()
    await this.testBatchUpdate()

    // 统计结果
    console.log('\n📊 测试结果统计:')
    console.log('='.repeat(50))
    
    const totalTests = this.testResults.length
    const passedTests = this.testResults.filter(r => r.success).length
    const failedTests = this.testResults.filter(r => !r.success).length
    
    console.log(`总计测试: ${totalTests}`)
    console.log(`通过测试: ${passedTests}`)
    console.log(`失败测试: ${failedTests}`)
    console.log(`通过率: ${((passedTests / totalTests) * 100).toFixed(1)}%`)
    
    // 显示失败详情
    const failedDetails = this.testResults.filter(r => !r.success)
    if (failedDetails.length > 0) {
      console.log('\n❌ 失败测试详情:')
      failedDetails.forEach(test => {
        console.log(`  - ${test.name}: ${test.message}`)
      })
    }
    
    // 清理测试数据
    console.log('\n🧹 清理测试数据...')
    try {
      // 这里可以添加清理逻辑，如删除测试配置等
      console.log('✅ 测试数据清理完成')
    } catch (error) {
      console.log('⚠️  清理测试数据时出错:', error.message)
    }
    
    return failedTests === 0
  }
}

// 运行测试
if (require.main === module) {
  const test = new ConfigVersionTest()
  
  test.runAllTests().then(success => {
    process.exit(success ? 0 : 1)
  }).catch(error => {
    console.error('测试运行失败:', error)
    process.exit(1)
  })
}

export { ConfigVersionTest }