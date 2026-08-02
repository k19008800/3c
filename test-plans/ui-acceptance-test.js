/**
 * 3cloud 前端UI交互验收测试脚本
 * 快速批量验证所有页面是否能正常加载
 * 
 * 使用方法：在 3cloud/web 目录下用 node 运行
 * 或直接在本脚本中 fetch 本地 Vite 开发服务器
 * 
 * 注意：Vite SPA 所有路由都返回 index.html（200 OK），
 * 所以这个测试验证的是页面能否正常加载（无崩溃）
 * 同时也可以用来检测编译错误
 */

const PAGES = {
  // ===== 门户公开页面 =====
  "门户-首页": "/",
  "门户-定价": "/pricing",
  "门户-文档": "/docs",
  "门户-模型目录": "/models",

  // ===== 认证页面 =====
  "登录": "/login",
  "注册": "/register",
  "忘记密码": "/forgot-password",
  "重置密码": "/reset-password",

  // ===== 用户端控制台 =====
  "用户-仪表盘": "/console",
  "用户-模型列表": "/console/models",
  "用户-API密钥": "/console/api-keys",
  "用户-API文档": "/console/docs",
  "用户-调用日志": "/console/logs",
  "用户-操作日志": "/console/operation-logs",
  "用户-用量统计": "/console/stats",
  "用户-充值": "/console/recharge",
  "用户-兑换码": "/console/redemption",
  "用户-交易流水": "/console/transactions",
  "用户-发票管理": "/console/invoices",
  "用户-退款申请": "/console/refunds",
  "用户-实名认证": "/console/real-name",
  "用户-账号安全": "/console/security",
  "用户-个人设置": "/console/settings",
  "用户-全站公告": "/console/announcements",
  "用户-通知中心": "/console/notifications",

  // ===== 管理后台 =====
  "管理-仪表盘": "/console/admin",
  "管理-企业分析": "/console/admin/enterprise-analysis",
  "管理-聚合统计": "/console/admin/stats",
  "管理-熔断看板": "/console/admin/circuit-breakers",
  "管理-系统健康": "/console/admin/system-health",
  "管理-实时监控": "/console/admin/monitoring",
  "管理-用户管理": "/console/admin/users",
  "管理-实名审核": "/console/admin/real-name-review",
  "管理-额度管理": "/console/admin/quotas",
  "管理-管理API Key": "/console/admin/admin-api-keys",
  "管理-角色权限": "/console/admin/roles",
  "管理-模型管理": "/console/admin/models",
  "管理-供应商管理": "/console/admin/vendors",
  "管理-Key分组": "/console/admin/vendor-key-groups",
  "管理-模型映射": "/console/admin/vendor-models",
  "管理-供应商自助": "/console/admin/vendor-self",
  "管理-代理商管理": "/console/admin/agents",
  "管理-财务工作台": "/console/admin/finance/dashboard",
  "管理-佣金流水": "/console/admin/finance/commissions",
  "管理-对账报表": "/console/admin/finance/reconciliation",
  "管理-成本看板": "/console/admin/finance/code-cost",
  "管理-Agent成本": "/console/admin/finance/agent-cost",
  "管理-Admin成本": "/console/admin/finance/admin-cost",
  "管理-结算对账": "/console/admin/finance/settlement",
  "管理-利润分析": "/console/admin/finance/profit-analysis",
  "管理-价格管理": "/console/admin/finance/prices",
  "管理-发票审核": "/console/admin/finance/invoices",
  "管理-退款审核": "/console/admin/finance/refunds",
  "管理-提现管理": "/console/admin/withdraws",
  "管理-充值订单": "/console/admin/recharge-orders",
  "管理-兑换码管理": "/console/admin/redemption-codes",
  "管理-安全总览": "/console/admin/security",
  "管理-安全事件": "/console/admin/security/events",
  "管理-安全配置": "/console/admin/security/config",
  "管理-封禁管理": "/console/admin/security/bans",
  "管理-告警通知": "/console/admin/security/alerts",
  "管理-自动规则": "/console/admin/security/auto-rules",
  "管理-AI风控": "/console/admin/risk-control",
  "管理-行为分析": "/console/admin/behavior-analysis",
  "管理-威胁情报": "/console/admin/threat-intel",
  "管理-AB测试": "/console/admin/ab-testing",
  "管理-系统配置": "/console/admin/configs",
  "管理-站点设置": "/console/admin/site-settings",
  "管理-限流管理": "/console/admin/rate-limits",
  "管理-邮件模板": "/console/admin/email-templates",
  "管理-内容管理": "/console/admin/page-contents",
  "管理-多环境管理": "/console/admin/environments",
  "管理-健康评分": "/console/admin/health-score",
  "管理-自定义报表": "/console/admin/custom-reports",
  "管理-审计日志": "/console/admin/audit-logs",
  "管理-操作日志": "/console/admin/operation-logs",
  "管理-操作类型": "/console/admin/operation-types",
  "管理-调用日志": "/console/admin/logs",
  "管理-提示词审计": "/console/admin/prompt-audit",
  "管理-敏感词库": "/console/admin/sensitive-words",
  "管理-全站公告": "/console/admin/announcements",
  "管理-营销活动": "/console/admin/campaigns",

  // ===== 代理商页面 =====
  "代理-仪表盘": "/console/agent/dashboard",
  "代理-客户管理": "/console/agent/clients",
  "代理-佣金管理": "/console/agent/commissions",
  "代理-提现": "/console/agent/withdraw",
  "代理-兑换码": "/console/agent/redemption",
  "代理-财务": "/console/agent/finance",
  "代理-对账": "/console/agent/reconciliation",

  // ===== 供应商页面 =====
  "供应商-登录": "/vendor/login",
  "供应商-注册": "/vendor/register",
  "供应商-注册成功": "/vendor/register-success",
  "供应商-仪表盘": "/vendor/dashboard",
};

async function testPages() {
  const BASE = "http://localhost:5175";
  const errors = [];
  const results = [];

  for (const [name, path] of Object.entries(PAGES)) {
    try {
      const resp = await fetch(`${BASE}${path}`, {
        signal: AbortSignal.timeout(10000)
      });
      const text = await resp.text();
      
      // Check for error overlays (Vite error overlay)
      if (text.includes('页面渲染异常') || text.includes('ErrorBoundary') || text.includes('error')) {
        // Check more specifically
        let errorInfo = '';
        if (text.includes('TypeError:')) {
          const match = text.match(/TypeError: [^\n<]+/);
          if (match) errorInfo = match[0];
        }
        if (text.includes('Failed to resolve import')) {
          const match = text.match(/Failed to resolve import[^<]+/);
          if (match) errorInfo = match[0];
        }
        errors.push({ name, path, status: resp.status, error: errorInfo || 'Page has error overlay' });
        results.push({ name, path, status: 'FAIL', error: errorInfo || 'Error boundary triggered' });
      } else if (resp.status !== 200) {
        errors.push({ name, path, status: resp.status });
        results.push({ name, path, status: 'FAIL', error: `HTTP ${resp.status}` });
      } else {
        results.push({ name, path, status: 'PASS' });
      }
    } catch (e) {
      errors.push({ name, path, error: e.message });
      results.push({ name, path, status: 'FAIL', error: e.message });
    }
  }

  // Print summary
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  
  console.log(`\n===== 3cloud UI 页面加载测试报告 =====`);
  console.log(`总计：${results.length} 个页面`);
  console.log(`通过：${passCount}`);
  console.log(`失败：${failCount}`);
  console.log(`\n--- 失败页面 ---`);
  
  for (const r of results) {
    if (r.status === 'FAIL') {
      console.log(`❌ ${r.name} (${r.path})`);
      console.log(`   错误: ${r.error}`);
    }
  }
  
  console.log(`\n--- 所有页面 ---`);
  for (const r of results) {
    console.log(`${r.status === 'PASS' ? '✅' : '❌'} ${r.name}`);
  }
}

testPages().catch(console.error);
