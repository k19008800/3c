// ============================================================
//  3cloud (3C) — 配置变更影响评估 & 依赖关系
// ============================================================

import type { ConfigType } from "./types.js";

// ── 获取配置变更影响评估 ──
export function evaluateConfigChangeImpact(params: {
  configKey: string;
  configType: ConfigType;
  oldValue: any;
  newValue: any;
}): {
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
  affectedAreas: string[];
  risks: string[];
  recommendations: string[];
} {
  const result = {
    impactLevel: 'low' as 'low' | 'medium' | 'high' | 'critical',
    affectedAreas: [] as string[],
    risks: [] as string[],
    recommendations: [] as string[]
  };

  if (params.configKey.includes('rate_limit') || params.configKey.includes('throttle')) {
    result.impactLevel = 'medium';
    result.affectedAreas.push('API访问', '用户体验');
    result.risks.push('可能导致API访问异常', '可能影响正常业务使用');
    result.recommendations.push('建议在非高峰时段变更', '变更后密切监控API调用量');
  }

  if (params.configKey.includes('security') || params.configKey.includes('auth')) {
    result.impactLevel = 'high';
    result.affectedAreas.push('系统安全', '用户认证');
    result.risks.push('可能导致安全漏洞', '可能影响用户登录');
    result.recommendations.push('建议进行安全测试', '变更后立即通知相关人员');
  }

  if (params.configKey.includes('commission') || params.configKey.includes('price')) {
    result.impactLevel = 'high';
    result.affectedAreas.push('财务结算', '价格体系');
    result.risks.push('可能导致财务数据错误', '可能影响代理商收入');
    result.recommendations.push('建议在结算周期结束后变更', '变更前进行财务复核');
  }

  if (params.configType === 'login_security') {
    result.impactLevel = 'critical';
    result.affectedAreas.push('登录安全', '账户保护');
    result.risks.push('可能导致账户被攻击', '可能影响用户账户安全');
    result.recommendations.push('必须进行安全评估', '变更后立即验证登录功能');
  }

  return result;
}

// ── 获取配置依赖关系 ──
export function getConfigDependencies(configKey: string, configType: ConfigType): {
  dependentConfigs: string[];
  dependentFeatures: string[];
} {
  const dependencies = {
    dependentConfigs: [] as string[],
    dependentFeatures: [] as string[]
  };

  const dependencyMap: Record<string, { configs: string[]; features: string[] }> = {
    'rate_limit_user': {
      configs: ['rate_limit_agent', 'rate_limit_api'],
      features: ['用户API调用', '配额管理']
    },
    'commission_rate': {
      configs: ['commission_settle_mode', 'commission_min_amount'],
      features: ['代理商结算', '财务系统']
    },
    'login_security_mfa_required': {
      configs: ['login_security_ip_whitelist', 'login_security_device_limit'],
      features: ['用户登录', '账户安全']
    }
  };

  const key = dependencyMap[configKey];
  if (key) {
    dependencies.dependentConfigs = key.configs;
    dependencies.dependentFeatures = key.features;
  }

  return dependencies;
}
