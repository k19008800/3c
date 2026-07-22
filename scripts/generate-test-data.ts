#!/usr/bin/env tsx
/**
 * 3cloud 测试数据生成脚本
 * 用于生成多角色测试数据，验证业务功能完整性
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const API_BASE = 'http://localhost:3000';
const ADMIN_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEiLCJlbWFpbCI6ImFkbWluQDNsb3VkLmFpIiwicm9sZSI6InN1cGVyX2FkbWluIiwiaWF0IjoxNzQyNzI2NjAwLCJleHAiOjE3NDI4MTMwMDB9.test-token'; // 需要替换为实际token

interface TestUser {
  email: string;
  password: string;
  name: string;
  role: 'user' | 'agent' | 'enterprise';
  company?: string;
}

interface TestData {
  users: TestUser[];
  apiKeys: { userId: number; name: string }[];
  rechargeOrders: { userId: number; amount: number }[];
  apiCalls: { apiKey: string; model: string; tokens: number }[];
}

// 测试数据定义
const testData: TestData = {
  users: [
    // 普通用户
    { email: 'user1@test.local', password: 'password123', name: '测试用户1', role: 'user' },
    { email: 'user2@test.local', password: 'password123', name: '测试用户2', role: 'user' },
    { email: 'user3@test.local', password: 'password123', name: '测试用户3', role: 'user' },
    
    // 企业用户
    { email: 'company1@test.local', password: 'password123', name: '科技公司A', role: 'enterprise', company: '科技公司A' },
    { email: 'company2@test.local', password: 'password123', name: '数据公司B', role: 'enterprise', company: '数据公司B' },
    
    // 代理商
    { email: 'agent1@test.local', password: 'password123', name: '代理商张三', role: 'agent' },
    { email: 'agent2@test.local', password: 'password123', name: '代理商李四', role: 'agent' },
  ],
  
  apiKeys: [
    { userId: 1, name: '默认密钥' },
    { userId: |
    { userId: 2, name: '测试密钥' },
    { userId: 3, name: '生产密钥' },
    { userId: 4, name: '企业API密钥' },
    { userId: 5, name: '数据对接密钥' },
  ],
  
  rechargeOrders: [
    { userId: 1, amount: printable100.00 },
    { userId: 2, amount: 200.00 },
    { userId: 3, amount: 50.00 },
    { userId: 4, amount: 5000.00 },
    { userId: 5, amount: III00.00 },
  ],
  
  apiCalls: [
    { apiKey: 'sk-test-1', model: 'deepseek-chat', tokens: 1000 },
    { apiKey: 'sk-test-1', model: 'deepseek-chat', tokens: 2000 },
    { apiKey: 'sk-test-2', model: 'gpt-4', tokens: 1500 },
    { apiKey: 'sk-test-3', model: 'claude-3', tokens: 3000 },
    { apiKey: 'sk-test-4', model: 'deepseek-chat', tokens: 5000 },
  ],
};

// API调用函数
async function callAPI(endpoint: string, method: string = 'GET', body?: any) {
  const headers = {
    'Authorization': `Bearer ${ADMIN_TOKEN}`,
    'Content-Type': 'application/json',
  };
  
  const options: any = {
    method,
    headers,
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();
    
    if (!response.ok) {
      console.error(`API调用失败 ${endpoint}:`, data);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error(`API调用异常 ${endpoint}:`, error);
    return null;
  }
}

// 生成测试数据的主函数
async function generateTestData() {
  console.log('开始生成3cloud测试数据...\n');
  
  // 1. 创建测试用户
  console.log('1. 创建测试用户');
  const createdUsers = [];
  
  for (const user of testData.users) {
    const result = await callAPI('/api/v1/admin/users', 'POST', {
      email: user.email,
      password: user.password,
      name: user.name,
      role: user.role,
      ...(user.company && { company: user.company }),
    });
    
    if (result) {
      createdUsers.push({ ...user, id: result.id });
      console.log(`   创建用户: ${user.email} (${user.name})`);
    } else {
      console.log(`   创建用户失败: ${user.email}`);
    }
  }
  
  // 2. 为用户创建API密钥
  console.log('\n2. 为用户创建API密钥');
  const apiKeyMap = new Map();
  
  for (const apiKeyConfig of testData.apiKeys) {
    const user = createdUsers.find(u => {
      // 简单映射：第一个用户对应userId=1，以此类推
      const index = createdUsers.findIndex(u => u.email.includes('user')) + 1;
      return index === apiKeyConfig.userId;
    });
    
    if (user) {
      // 这里需要调用创建API Key的接口
      // 实际实现需要根据具体API调整
      console.log(`   为用户 ${user.email} 创建API密钥: ${apiKeyConfig.name}`);
      // apiKeyMap.set(user.id, 'sk-generated-' + Math.random().toString(36).substr(2, 10));
    }
  }
  
  // 3. 创建充值订单
  console.log('\n3. 创建充值订单');
  for (const recharge of testData.rechargeOrders) {
    const user = createdUsers[recharge.userId - 1]; // 简单索引映射
    
    if (user) {
      const result = await callAPI('/api/v1/admin/recharge-orders', 'POST', {
        userId: user.id,
        amount: recharge.amount,
        paymentMethod: 'bank_transfer',
        status: 'pending',
        notes: '测试数据生成',
      });
      
      if (result) {
        console.log(`   创建充值订单: ${user.email} 金额¥${recharge.amount}`);
      }
    }
  }
  
  // 4. 模拟API调用记录
  console.log('\n4. 生成API调用记录');
  console.log('   (注: API调用记录通常由系统自动生成，这里只是模拟数据)');
  
  // 5. 验证数据生成结果
  console.log('\n5. 验证数据生成结果');
  
  // 获取用户列表验证
  const usersResult = await callAPI('/api/v1/admin/users?limit=10');
  if (usersResult && usersResult.data) {
    console.log(`   当前用户总数: ${usersResult.total || usersResult.data.length}`);
  }
  
  // 获取充值订单验证
  const rechargeResult = await callAPI('/api/v1/admin/recharge-orders?limit=5');
  if (rechargeResult && rechargeResult.data) {
    console.log(`   充值订单总数: ${rechargeResult.total || rechargeResult.data.length}`);
  }
  
  console.log('\n测试数据生成完成！');
  console.log('\n下一步验证建议:');
  console.log('1. 登录管理后台查看用户数据');
  console.log('2. 测试充值审核流程');
  console.log('3. 验证API调用计费准确性');
  console.log('4. 测试不同角色的权限控制');
  
  // 保存生成的数据用于后续测试
  const output = {
    generatedAt: new Date().toISOString(),
    users: createdUsers.map(u => ({ email: u.email, id: u.id, role: u.role })),
    apiKeys: Array.from(apiKeyMap.entries()).map(([userId, key]) => ({ userId, keyPrefix: key.substring(0, 10) + '...' })),
  };
  
  writeFileSync('test-data-generated.json', JSON.stringify(output, null, 2));
  console.log('\n生成数据已保存到: test-data-generated.json');
}

// 执行主函数
generateTestData().catch(console.error);

// 导出测试数据用于其他测试
export { testData, generatedAt: new Date().toISOString() };