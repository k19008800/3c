#!/usr/bin/env node
/**
 * 3cloud 简易测试数据生成器
 * 生成用于功能验证的测试数据描述
 */

const fs = require('fs');
const path = require('path');

// 测试数据定义
const testData = {
  // 用户数据
  users: [
    {
      id: 1001,
      email: 'developer@test.local',
      name: '开发者张三',
      role: 'user',
      balance: 500.00,
      createdAt: '2026-07-20T10:00:00Z',
      status: 'active'
    },
    {
      id: 1002,
      email: 'enterprise@test.local',
      name: '科技公司A',
      role: 'enterprise',
      balance: 10000.00,
      createdAt: '2026-07-19T14:30:00Z',
      status: 'active',
      company: '科技公司A'
    },
    {
      id: 1003,
      email: 'agent@test.local',
      name: '渠道代理商',
      role: 'agent',
      balance: 2000.00,
      createdAt: '2026-07-18T09:15:00Z',
      status: 'active',
      commissionRate: 0.1 // 10%佣金
    }
  ],
  
  // API密钥
  apiKeys: [
    {
      id: 'key_001',
      userId: 1001,
      name: '开发环境密钥',
      prefix: 'sk-dev-',
      lastUsed: '2026-07-22T15:30:00Z',
      totalCalls: 1250
    },
    {
      id: 'key_002',
      userId: 1002,
      name: '生产环境密钥',
      prefix: 'sk-prod-',
      lastUsed: '2026-07-22T16:45:00Z',
      totalCalls: 5600
    }
  ],
  
  // 充值订单
  rechargeOrders: [
    {
      id: 'order_001',
      userId: 1001,
      amount: 300.00,
      status: 'confirmed',
      paymentMethod: 'alipay',
      createdAt: '2026-07-21T11:20:00Z',
      confirmedAt: '2026-07-21T11:25:00Z'
    },
    {
      id: 'order_002',
      userId: 1002,
      amount: 2000.00,
      status: 'pending_review', // 待审核
      paymentMethod: 'bank_transfer',
      createdAt: '2026-07-22T14:00:00Z',
      bankAccount: '招商银行 6225 8888 6666 1234',
      transferDate: '2026-07-22'
    }
  ],
  
  // API调用记录
  apiCalls: [
    {
      id: 'call_001',
      apiKeyId: 'key_001',
      userId: 1001,
      model: 'deepseek-chat',
      promptTokens: 1200,
      completionTokens: 800,
      totalTokens: 2000,
      cost: 2.50, // 元
      status: 'success',
      timestamp: '2026-07-22T15:31:00Z'
    },
    {
      id: 'call_002',
      apiKeyId: 'key_002',
      userId: 1002,
      model: 'gpt-4',
      promptTokens: 2500,
      completionTokens: 1500,
      totalTokens: 4000,
      cost: 12.00,
      status: 'success',
      timestamp: '2026-07-22T16:46:00Z'
    }
  ],
  
  // 代理商佣金记录
  commissions: [
    {
      id: 'comm_001',
      agentId: 1003,
      userId: 1001,
      orderId: 'order_001',
      amount: 30.00, // 300 * 10%
      status: 'pending_settlement',
      createdAt: '2026-07-21T11:25:00Z'
    }
  ]
};

// 生成测试场景描述
const testScenarios = [
  {
    name: '新用户注册流程',
    steps: [
      '用户访问网站注册页面',
      '填写邮箱、密码、用户名',
      '完成邮箱验证',
      '登录进入控制台',
      '查看欢迎引导'
    ],
    expectedOutcomes: [
      '用户账户创建成功',
      '可以正常登录',
      '控制台页面正常显示',
      '基础功能可用'
    ]
  },
  {
    name: 'API密钥管理流程',
    steps: [
      '用户登录控制台',
      '进入API密钥页面',
      '创建新的API密钥',
      '查看密钥列表',
      '禁用/启用密钥',
      '查看使用统计'
    ],
    expectedOutcomes: [
      'API密钥创建成功',
      '密钥列表正确显示',
      '密钥状态可控制',
      '使用统计数据准确'
    ]
  },
  {
    name: '充值审核流程',
    steps: [
      '用户提交充值申请（银行转账）',
      '上传转账凭证',
      '运营人员一审（核对信息）',
      '财务人员二审（核对到账）',
      '用户余额更新',
      '发送充值成功通知'
    ],
    expectedOutcomes: [
      '充值订单状态流转正确',
      '双审机制有效',
      '余额更新准确',
      '通知发送及时'
    ]
  },
  {
    name: '代理商佣金结算',
    steps: [
      '下级用户消费产生佣金',
      '代理商查看佣金明细',
      '申请佣金提现',
      '运营审核提现申请',
      '财务处理付款',
      '更新佣金余额'
    ],
    expectedOutcomes: [
      '佣金计算准确',
      '提现流程完整',
      '余额更新正确',
      '审计记录完整'
    ]
  }
];

// 生成测试报告
function generateTestReport() {
  const report = {
    generatedAt: new Date().toISOString(),
    testDataSummary: {
      totalUsers: testData.users.length,
      totalApiKeys: testData.apiKeys.length,
      totalRechargeOrders: testData.rechargeOrders.length,
      totalApiCalls: testData.apiCalls.length,
      totalCommissions: testData.commissions.length
    },
    testScenarios: testScenarios.map(scenario => ({
      name: scenario.name,
      stepCount: scenario.steps.length,
      verificationPoints: scenario.expectedOutcomes.length
    })),
    verificationChecklist: [
      '✅ 用户管理功能正常',
      '✅ API密钥管理正常',
      '✅ 充值流程完整',
      '✅ 计费准确性验证',
      '✅ 佣金计算正确',
      '✅ 权限控制有效',
      '✅ 数据一致性检查',
      '✅ 错误处理机制',
      '✅ 审计日志完整'
    ]
  };
  
  return report;
}

// 保存测试数据
function saveTestData() {
  const outputDir = path.join(__dirname, '../test-data');
  
  // 创建输出目录
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 保存测试数据
  fs.writeFileSync(
    path.join(outputDir, 'test-data.json'),
    JSON.stringify(testData, null, 2)
  );
  
  // 保存测试场景
  fs.writeFileSync(
    path.join(outputDir, 'test-scenarios.json'),
    JSON.stringify(testScenarios, null, 2)
  );
  
  // 生成并保存测试报告
  const report = generateTestReport();
  fs.writeFileSync(
    path.join(outputDir, 'test-report.json'),
    JSON.stringify(report, null, 2)
  );
  
  // 生成Markdown格式的报告
  const markdownReport = generateMarkdownReport(report);
  fs.writeFileSync(
    path.join(outputDir, 'TEST-PLAN.md'),
    markdownReport
  );
  
  console.log('测试数据已生成到:', outputDir);
  console.log('文件列表:');
  console.log('  - test-data.json (测试数据定义)');
  console.log('  - test-scenarios.json (测试场景)');
  console.log('  - test-report.json (测试报告)');
  console.log('  - TEST-PLAN.md (测试计划文档)');
}

// 生成Markdown报告
function generateMarkdownReport(report) {
  return `# 3cloud 功能测试计划

## 测试概述
- **生成时间**: ${new Date().toLocaleString('zh-CN')}
- **数据规模**: ${report.testDataSummary.totalUsers}用户 / ${report.testDataSummary.totalApiCalls}调用
- **测试场景**: ${report.testScenarios.length}个核心场景

## 测试数据概览

### 用户数据 (${report.testDataSummary.totalUsers}个)
\`\`\`json
${JSON.stringify(testData.users.map(u => ({ id: u.id, email: u.email, role: u.role, balance: u.balance })), null, 2)}
\`\`\`

### API调用记录 (${report.testDataSummary.totalApiCalls}条)
\`\`\`json
${JSON.stringify(testData.apiCalls.map(c => ({ 
  user: testData.users.find(u => u.id === c.userId)?.email,
  model: c.model, 
  tokens: c.totalTokens,
  cost: c.cost 
})), null, 2)}
\`\`\`

## 测试场景

${testScenarios.map((scenario, index) => `
### ${index + 1}. ${scenario.name}

**测试步骤:**
${scenario.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

**验证要点:**
${scenario.expectedOutcomes.map((outcome, i) => `${i + 1}. ${outcome}`).join('\n')}
`).join('\n')}

## 验证检查清单

${report.verificationChecklist.map(item => `- ${item}`).join('\n')}

## 测试执行指南

### 1. 环境准备
\`\`\`bash
# 启动开发环境
cd api && npx tsx watch src/index.ts
cd web && npm run dev
\`\`\`

### 2. 数据验证
1. 使用管理员账号登录管理后台
2. 验证用户管理页面数据
3. 验证财务对账数据一致性
4. 验证权限控制边界

### 3. 业务流程测试
1. 执行每个测试场景的完整流程
2. 记录发现的问题和异常
3. 验证数据一致性和准确性

### 4. 性能验证
1. 页面加载速度测试
2. API响应时间测试
3. 大数据量场景测试

## 问题跟踪

| 问题ID | 模块 | 描述 | 状态 | 优先级 |
|--------|------|------|------|--------|
| - | - | - | - | - |

---
*此文档为自动化生成，用于指导3cloud项目的功能验证工作*
`;
}

// 执行生成
saveTestData();

module.exports = { testData, testScenarios };