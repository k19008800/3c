#!/usr/bin/env node
/**
 * 3cloud 批量浏览器测试脚本
 * 快速验证所有管理页面的可访问性
 */

const testPages = [
  // 模块1：总览看板 (已测试5个)
  // { url: '/console/admin', name: '管理仪表盘', status: 'tested' },
  // { url: '/console/admin/enterprise-analysis', name: '企业数据分析', status: 'tested' },
  // { url: '/console/admin/stats', name: '聚合统计', status: 'tested' },
  // { url: '/console/admin/circuit-breakers', name: '熔断看板', status: 'tested' },
  // { url: '/console/admin/system-health', name: '系统健康', status: 'tested' },
  { url: '/console/admin/trends', name: '趋势洞察', module: '模块1' },

  // 模块2：用户运营 (已测试1个)
  // { url: '/console/admin/users', name: '用户管理', status: 'tested' },
  { url: '/console/admin/real-name-review', name: '实名审核', module: '模块2' },
  { url: '/console/admin/quotas', name: '额度管理', module: '模块2' },
  { url: '/console/admin/admin-api-keys', name: '管理 API Key', module: '模块2' },
  { url: '/console/admin/roles', name: '角色权限', module: '模块2' },

  // 模块3：资源管理
  { url: '/console/admin/models', name: '模型管理', module: '模块3' },
  // { url: '/console/admin/vendors', name: '供应商管理', status: 'tested' },
  { url: '/console/admin/vendor-key-groups', name: 'Key 分组', module: '模块3' },
  { url: '/console/admin/vendor-models', name: '模型映射', module: '模块3' },
  { url: '/console/admin/vendor-self', name: '供应商自助', module: '模块3' },
  { url: '/console/admin/agents', name: '代理商管理', module: '模块3' },

  // 模块4：财务结算 (已测试2个)
  // { url: '/console/admin/finance/dashboard', name: '财务工作台', status: 'tested' },
  { url: '/console/admin/finance/commissions', name: '佣金流水', module: '模块4' },
  { url: '/console/admin/finance/reconciliation', name: '对账报表', module: '模块4' },
  { url: '/console/admin/finance/code-cost', name: '成本看板', module: '模块4' },
  { url: '/console/admin/finance/agent-cost', name: 'Agent成本', module: '模块4' },
  { url: '/console/admin/finance/admin-cost', name: 'Admin成本', module: '模块4' },
  { url: '/console/admin/finance/settlement', name: '结算对账', module: '模块4' },
  { url: '/console/admin/finance/profit-analysis', name: '利润分析', module: '模块4' },
  { url: '/console/admin/finance/prices', name: '价格管理', module: '模块4' },
  { url: '/console/admin/finance/invoices', name: '发票审核', module: '模块4' },
  { url: '/console/admin/finance/refunds', name: '退款审核', module: '模块4' },
  { url: '/console/admin/withdraws', name: '提现管理', module: '模块4' },
  // { url: '/console/admin/recharge-orders', name: '充值订单', status: 'tested' },
  { url: '/console/admin/redemption-codes', name: '兑换码管理', module: '模块4' },

  // 模块5：安全风控 (已测试1个)
  { url: '/console/admin/security', name: '安全总览', module: '模块5' },
  // { url: '/console/admin/security/events', name: '安全事件', status: 'tested' },
  { url: '/console/admin/security/config', name: '安全配置', module: '模块5' },
  { url: '/console/admin/security/bans', name: '封禁管理', module: '模块5' },
  { url: '/console/admin/security/alerts', name: '告警通知', module: '模块5' },
  { url: '/console/admin/security/auto-rules', name: '自动规则', module: '模块5' },

  // 模块6：运维配置
  { url: '/console/admin/configs', name: '系统配置', module: '模块6' },
  { url: '/console/admin/site-settings', name: '站点设置', module: '模块6' },
  { url: '/console/admin/rate-limits', name: '限流管理', module: '模块6' },
  { url: '/console/admin/email-templates', name: '邮件模板', module: '模块6' },
  { url: '/console/admin/page-contents', name: '内容管理', module: '模块6' },

  // 模块7：审计合规 (已测试1个)
  // { url: '/console/admin/audit-logs', name: '审计日志', status: 'tested' },
  { url: '/console/admin/operation-logs', name: '操作日志', module: '模块7' },
  { url: '/console/admin/logs', name: '调用日志', module: '模块7' },
  { url: '/console/admin/prompt-audit', name: '提示词审计', module: '模块7' },
  { url: '/console/admin/sensitive-words', name: '敏感词库', module: '模块7' },
  { url: '/console/admin/announcements', name: '全站公告', module: '模块7' },
  { url: '/console/admin/campaigns', name: '营销活动', module: '模块7' }
];

// 生成测试报告
const report = {
  generatedAt: new Date().toISOString(),
  total: testPages.length,
  byModule: {},
  pages: testPages
};

// 按模块统计
testPages.forEach(page => {
  const module = page.module;
  if (!report.byModule[module]) {
    report.byModule[module] = 0;
  }
  report.byModule[module]++;
});

// 生成Markdown测试清单
const markdown = `# 3cloud 批量浏览器测试清单

## 测试概览
- **生成时间**: ${new Date().toLocaleString('zh-CN')}
- **待测试页面**: ${testPages.length}个
- **已测试页面**: 8个（管理仪表盘、企业数据分析、聚合统计、熔断看板、系统健康、用户管理、充值订单、供应商管理、财务工作台、安全事件、审计日志）

## 按模块统计

${Object.entries(report.byModule).map(([module, count]) => `- **${module}**: ${count}个页面`).join('\n')}

## 测试清单

${testPages.map((page, index) => `
### ${index + 1}. ${page.name}
- **URL**: \`${page.url}\`
- **模块**: ${page.module}
- **状态**: ⏳ 待测试
- **验证要点**:
  - [ ] 页面正常加载（HTTP 200）
  - [ ] 页面标题正确显示
  - [ ] 主要数据区域正常渲染
  - [ ] 无JavaScript错误
`).join('\n')}

## 快速测试命令

\`\`\`bash
# 逐个访问测试（在浏览器控制台执行）
const pages = ${JSON.stringify(testPages.map(p => p.url))};
let index = 0;
function testNext() {
  if (index < pages.length) {
    window.location.href = 'http://localhost:5175' + pages[index++];
    setTimeout(testNext, 3000);
  }
}
testNext();
\`\`\`

## 批量验证脚本

\`\`\`javascript
// 在浏览器控制台执行此脚本
const testPages = ${JSON.stringify(testPages)};

async function testPage(page) {
  try {
    const response = await fetch('http://localhost:3000/api/v1' + page.url.replace('/console/admin', '/admin'));
    return {
      name: page.name,
      url: page.url,
      status: response.ok ? '✅' : '❌',
      code: response.status
    };
  } catch (error) {
    return {
      name: page.name,
      url: page.url,
      status: '❌',
      error: error.message
    };
  }
}

// 批量测试
Promise.all(testPages.map(testPage)).then(results => {
  console.table(results);
  console.log('测试完成:', results.filter(r => r.status === '✅').length, '/', results.length);
});
\`\`\`

## 预期测试时间
- 单页面测试时间: 1-2分钟
- 总测试时间: 约${testPages.length * 1.5}-${testPages.length * 2}分钟
- 建议分批执行，每批10个页面

---
*此清单用于指导剩余页面的浏览器测试*
`;

console.log(markdown);
console.log('\n\n// JSON数据');
console.log(JSON.stringify(report, null, 2));

module.exports = { testPages, report };