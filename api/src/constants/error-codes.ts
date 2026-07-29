// ============================================================
//  3cloud (3C) — 错误码定义
//  统一错误码规范，提供用户友好的错误信息
// ============================================================

export interface ErrorCodeDefinition {
  code: string;
  message: string;
  messageEn: string;
  category: string;
  categoryLabel: string;
  severity: 'error' | 'warning' | 'info';
  solution: string;
  solutionEn: string;
  docUrl?: string;
  relatedCodes?: string[];
}

export const ERROR_CODES: Record<string, ErrorCodeDefinition> = {
  // ── 余额相关 (E001-E010) ──
  'E001': {
    code: 'E001',
    message: '余额不足',
    messageEn: 'Insufficient balance',
    category: 'balance',
    categoryLabel: '余额',
    severity: 'error',
    solution: '请充值后重试。您可以在"充值"页面选择合适的充值方式进行充值。',
    solutionEn: 'Please recharge and try again. You can choose a suitable recharge method on the "Recharge" page.',
    docUrl: '/docs/balance',
  },
  'E002': {
    code: 'E002',
    message: '余额冻结',
    messageEn: 'Balance frozen',
    category: 'balance',
    categoryLabel: '余额',
    severity: 'error',
    solution: '您的账户余额已被冻结，请联系管理员了解详情并解冻。',
    solutionEn: 'Your account balance is frozen. Please contact the administrator for details.',
  },
  'E003': {
    code: 'E003',
    message: '充值金额无效',
    messageEn: 'Invalid recharge amount',
    category: 'balance',
    categoryLabel: '余额',
    severity: 'error',
    solution: '充值金额必须大于 0 且不超过单次充值上限。请检查输入金额后重试。',
    solutionEn: 'Recharge amount must be greater than 0 and not exceed the limit.',
  },

  // ── 认证相关 (E011-E020) ──
  'E011': {
    code: 'E011',
    message: 'API Key 已禁用',
    messageEn: 'API Key disabled',
    category: 'auth',
    categoryLabel: '认证',
    severity: 'error',
    solution: '该 API Key 已被禁用。请联系管理员启用或创建新的 API Key。',
    solutionEn: 'This API Key has been disabled. Please contact the administrator or create a new one.',
    docUrl: '/docs/api-keys',
  },
  'E012': {
    code: 'E012',
    message: 'API Key 不存在',
    messageEn: 'API Key not found',
    category: 'auth',
    categoryLabel: '认证',
    severity: 'error',
    solution: '提供的 API Key 无效或不存在。请检查 Key 是否正确，或创建新的 API Key。',
    solutionEn: 'The provided API Key is invalid or does not exist. Please check or create a new one.',
  },
  'E013': {
    code: 'E013',
    message: 'API Key 已过期',
    messageEn: 'API Key expired',
    category: 'auth',
    categoryLabel: '认证',
    severity: 'error',
    solution: '该 API Key 已超过有效期。请创建新的 API Key 或联系管理员续期。',
    solutionEn: 'This API Key has expired. Please create a new one or contact the administrator.',
  },
  'E014': {
    code: 'E014',
    message: '用户账户已禁用',
    messageEn: 'User account disabled',
    category: 'auth',
    categoryLabel: '认证',
    severity: 'error',
    solution: '您的账户已被禁用。请联系管理员了解详情。',
    solutionEn: 'Your account has been disabled. Please contact the administrator.',
  },
  'E015': {
    code: 'E015',
    message: '登录凭证无效',
    messageEn: 'Invalid credentials',
    category: 'auth',
    categoryLabel: '认证',
    severity: 'error',
    solution: '邮箱或密码错误。请检查输入后重试，或使用"忘记密码"功能重置密码。',
    solutionEn: 'Invalid email or password. Please check your input or use "Forgot Password".',
  },
  'E016': {
    code: 'E016',
    message: '登录凭证已过期',
    messageEn: 'Credentials expired',
    category: 'auth',
    categoryLabel: '认证',
    severity: 'warning',
    solution: '登录已过期，请重新登录。',
    solutionEn: 'Your session has expired. Please log in again.',
  },
  'E017': {
    code: 'E017',
    message: '权限不足',
    messageEn: 'Permission denied',
    category: 'auth',
    categoryLabel: '认证',
    severity: 'error',
    solution: '您没有执行此操作的权限。如需访问，请联系管理员授予相应权限。',
    solutionEn: 'You do not have permission to perform this action. Contact the administrator.',
  },
  'E018': {
    code: 'E018',
    message: 'Token 无效',
    messageEn: 'Invalid token',
    category: 'auth',
    categoryLabel: '认证',
    severity: 'error',
    solution: '提供的 Token 无效或格式错误。请检查 Token 后重试。',
    solutionEn: 'The provided token is invalid or malformed. Please check and try again.',
  },

  // ── 模型相关 (E021-E030) ──
  'E021': {
    code: 'E021',
    message: '模型不存在',
    messageEn: 'Model not found',
    category: 'model',
    categoryLabel: '模型',
    severity: 'error',
    solution: '请求的模型不存在或已下线。请查看可用模型列表并选择正确的模型。',
    solutionEn: 'The requested model does not exist or is offline. Please check available models.',
    docUrl: '/docs/models',
  },
  'E022': {
    code: 'E022',
    message: '模型已禁用',
    messageEn: 'Model disabled',
    category: 'model',
    categoryLabel: '模型',
    severity: 'error',
    solution: '该模型已被禁用。请联系管理员或选择其他可用模型。',
    solutionEn: 'This model has been disabled. Please contact the administrator or choose another model.',
  },
  'E023': {
    code: 'E023',
    message: '模型维护中',
    messageEn: 'Model under maintenance',
    category: 'model',
    categoryLabel: '模型',
    severity: 'warning',
    solution: '该模型正在维护中，暂时不可用。请稍后重试或选择其他模型。',
    solutionEn: 'This model is under maintenance. Please try again later or choose another model.',
  },
  'E024': {
    code: 'E024',
    message: '模型不支持该功能',
    messageEn: 'Model does not support this feature',
    category: 'model',
    categoryLabel: '模型',
    severity: 'error',
    solution: '当前模型不支持请求的功能（如流式输出、函数调用等）。请选择支持该功能的模型。',
    solutionEn: 'This model does not support the requested feature. Please choose a compatible model.',
  },

  // ── 限流相关 (E031-E040) ──
  'E031': {
    code: 'E031',
    message: '请求频率超限',
    messageEn: 'Rate limit exceeded',
    category: 'rate-limit',
    categoryLabel: '限流',
    severity: 'warning',
    solution: '请求过于频繁，已触发限流。请等待一段时间后重试，或联系管理员提升配额。',
    solutionEn: 'Too many requests. Please wait and retry, or contact the administrator.',
    docUrl: '/docs/rate-limits',
  },
  'E032': {
    code: 'E032',
    message: '并发数超限',
    messageEn: 'Concurrency limit exceeded',
    category: 'rate-limit',
    categoryLabel: '限流',
    severity: 'warning',
    solution: '当前并发请求数已达上限。请等待现有请求完成后再发起新请求。',
    solutionEn: 'Concurrent requests limit reached. Please wait for existing requests to complete.',
  },
  'E033': {
    code: 'E033',
    message: 'TPM 限额超限',
    messageEn: 'TPM limit exceeded',
    category: 'rate-limit',
    categoryLabel: '限流',
    severity: 'warning',
    solution: '每分钟 Token 数（TPM）已达上限。请稍后重试。',
    solutionEn: 'Tokens per minute limit reached. Please retry later.',
  },
  'E034': {
    code: 'E034',
    message: 'RPM 限额超限',
    messageEn: 'RPM limit exceeded',
    category: 'rate-limit',
    categoryLabel: '限流',
    severity: 'warning',
    solution: '每分钟请求数（RPM）已达上限。请稍后重试。',
    solutionEn: 'Requests per minute limit reached. Please retry later.',
  },
  'E036': {
    code: 'E036',
    message: '预算已用尽',
    messageEn: 'Budget quota exhausted',
    category: 'quota',
    categoryLabel: '配额',
    severity: 'warning',
    solution: '账户预算已用尽。如需继续使用，请充值或联系管理员调整预算限额。',
    solutionEn: 'Budget quota exhausted. Please recharge or contact admin to adjust budget limit.',
    relatedCodes: ['E035'],
  },

  'E037': {
    code: 'E037',
    message: '超出用户预算限额',
    messageEn: 'QUOTA_EXCEEDED',
    category: 'quota',
    categoryLabel: '配额',
    severity: 'error',
    solution: 'API 调用消耗已超出预算熔断线。请在预算设置页面调整预算限额，或等待下一个账单周期重置。',
    solutionEn: 'API consumption exceeded budget fuse limit. Adjust budget limit or wait for next billing cycle reset.',
    relatedCodes: ['E036'],
  },

  'E035': {
    code: 'E035',
    message: '日配额已用尽',
    messageEn: 'Daily quota exhausted',
    category: 'rate-limit',
    categoryLabel: '限流',
    severity: 'warning',
    solution: '今日配额已用尽，将于明日 00:00 重置。如需提升配额，请联系管理员。',
    solutionEn: 'Daily quota exhausted. It will reset at midnight. Contact admin for more quota.',
  },

  // ── 请求相关 (E041-E050) ──
  'E041': {
    code: 'E041',
    message: '请求参数错误',
    messageEn: 'Invalid request parameters',
    category: 'request',
    categoryLabel: '请求',
    severity: 'error',
    solution: '请求参数格式错误或缺少必填参数。请检查 API 文档后修正请求。',
    solutionEn: 'Invalid or missing request parameters. Please check the API documentation.',
  },
  'E042': {
    code: 'E042',
    message: '请求体过大',
    messageEn: 'Request body too large',
    category: 'request',
    categoryLabel: '请求',
    severity: 'error',
    solution: '请求体超过最大限制。请减少请求内容大小或分批处理。',
    solutionEn: 'Request body exceeds the maximum limit. Please reduce content size.',
  },
  'E043': {
    code: 'E043',
    message: '请求超时',
    messageEn: 'Request timeout',
    category: 'request',
    categoryLabel: '请求',
    severity: 'warning',
    solution: '请求处理超时。可能是网络问题或服务繁忙，请稍后重试。',
    solutionEn: 'Request timed out. Please retry later.',
  },
  'E044': {
    code: 'E044',
    message: '内容审核不通过',
    messageEn: 'Content moderation failed',
    category: 'request',
    categoryLabel: '请求',
    severity: 'error',
    solution: '请求内容包含敏感信息，被内容审核系统拦截。请修改内容后重试。',
    solutionEn: 'Content contains sensitive information. Please modify and retry.',
  },
  'E045': {
    code: 'E045',
    message: '提示词违规',
    messageEn: 'Prompt violation',
    category: 'request',
    categoryLabel: '请求',
    severity: 'error',
    solution: '提示词包含违规内容。请修改提示词后重试。',
    solutionEn: 'Prompt contains prohibited content. Please modify and retry.',
  },

  // ── 服务相关 (E051-E060) ──
  'E051': {
    code: 'E051',
    message: '上游服务不可用',
    messageEn: 'Upstream service unavailable',
    category: 'service',
    categoryLabel: '服务',
    severity: 'error',
    solution: '上游 AI 服务暂时不可用。系统将自动重试，或请稍后再试。',
    solutionEn: 'Upstream AI service is temporarily unavailable. Please retry later.',
  },
  'E052': {
    code: 'E052',
    message: '上游服务超时',
    messageEn: 'Upstream service timeout',
    category: 'service',
    categoryLabel: '服务',
    severity: 'warning',
    solution: '上游 AI 服务响应超时。请稍后重试，或选择其他模型。',
    solutionEn: 'Upstream AI service timed out. Please retry or choose another model.',
  },
  'E053': {
    code: 'E053',
    message: '上游服务错误',
    messageEn: 'Upstream service error',
    category: 'service',
    categoryLabel: '服务',
    severity: 'error',
    solution: '上游 AI 服务返回错误。请联系管理员或稍后重试。',
    solutionEn: 'Upstream AI service returned an error. Please contact admin or retry later.',
  },
  'E054': {
    code: 'E054',
    message: '熔断器已开启',
    messageEn: 'Circuit breaker open',
    category: 'service',
    categoryLabel: '服务',
    severity: 'warning',
    solution: '该服务因错误率过高已触发熔断保护。请等待熔断恢复后重试。',
    solutionEn: 'Service is circuit-broken due to high error rate. Please wait and retry.',
    relatedCodes: ['E051', 'E052', 'E053'],
  },
  'E055': {
    code: 'E055',
    message: '服务维护中',
    messageEn: 'Service under maintenance',
    category: 'service',
    categoryLabel: '服务',
    severity: 'info',
    solution: '系统正在维护升级中，预计很快恢复。请稍后重试。',
    solutionEn: 'System is under maintenance. Please retry later.',
  },

  // ── 兑换码相关 (E061-E070) ──
  'E061': {
    code: 'E061',
    message: '兑换码无效',
    messageEn: 'Invalid redemption code',
    category: 'redemption',
    categoryLabel: '兑换码',
    severity: 'error',
    solution: '兑换码不存在或格式错误。请检查输入后重试。',
    solutionEn: 'Redemption code does not exist or is invalid. Please check and retry.',
  },
  'E062': {
    code: 'E062',
    message: '兑换码已使用',
    messageEn: 'Redemption code already used',
    category: 'redemption',
    categoryLabel: '兑换码',
    severity: 'error',
    solution: '该兑换码已被使用。每个兑换码只能使用一次。',
    solutionEn: 'This redemption code has already been used.',
  },
  'E063': {
    code: 'E063',
    message: '兑换码已过期',
    messageEn: 'Redemption code expired',
    category: 'redemption',
    categoryLabel: '兑换码',
    severity: 'error',
    solution: '该兑换码已超过有效期，无法使用。',
    solutionEn: 'This redemption code has expired.',
  },
  'E064': {
    code: 'E064',
    message: '兑换码已禁用',
    messageEn: 'Redemption code disabled',
    category: 'redemption',
    categoryLabel: '兑换码',
    severity: 'error',
    solution: '该兑换码已被禁用。请联系发放方了解详情。',
    solutionEn: 'This redemption code has been disabled.',
  },
  'E065': {
    code: 'E065',
    message: '兑换码未激活',
    messageEn: 'Redemption code not activated',
    category: 'redemption',
    categoryLabel: '兑换码',
    severity: 'warning',
    solution: '该兑换码尚未激活。请等待激活后再使用，或联系发放方。',
    solutionEn: 'This redemption code is not yet activated. Please wait or contact the issuer.',
  },

  // ── 实名认证相关 (E071-E080) ──
  'E071': {
    code: 'E071',
    message: '实名认证未完成',
    messageEn: 'Real-name verification incomplete',
    category: 'verification',
    categoryLabel: '实名认证',
    severity: 'warning',
    solution: '使用此功能需要完成实名认证。请前往"实名认证"页面提交认证信息。',
    solutionEn: 'Real-name verification required. Please submit verification in the verification page.',
  },
  'E072': {
    code: 'E072',
    message: '实名认证审核中',
    messageEn: 'Real-name verification pending',
    category: 'verification',
    categoryLabel: '实名认证',
    severity: 'info',
    solution: '您的实名认证正在审核中，请耐心等待审核结果。',
    solutionEn: 'Your real-name verification is under review. Please wait.',
  },
  'E073': {
    code: 'E073',
    message: '实名认证已拒绝',
    messageEn: 'Real-name verification rejected',
    category: 'verification',
    categoryLabel: '实名认证',
    severity: 'error',
    solution: '实名认证未通过审核。请查看拒绝原因并重新提交正确的认证信息。',
    solutionEn: 'Real-name verification rejected. Please check the reason and resubmit.',
  },

  // ── 发票相关 (E081-E090) ──
  'E081': {
    code: 'E081',
    message: '发票信息不完整',
    messageEn: 'Invoice information incomplete',
    category: 'invoice',
    categoryLabel: '发票',
    severity: 'error',
    solution: '请完善发票抬头、税号等必填信息后重新申请。',
    solutionEn: 'Please complete invoice information before applying.',
  },
  'E082': {
    code: 'E082',
    message: '发票申请金额不足',
    messageEn: 'Invoice amount insufficient',
    category: 'invoice',
    categoryLabel: '发票',
    severity: 'error',
    solution: '可开票金额不足最低开票限额。请累计更多消费后申请。',
    solutionEn: 'Available invoice amount is below the minimum limit.',
  },
  'E083': {
    code: 'E083',
    message: '发票已开具',
    messageEn: 'Invoice already issued',
    category: 'invoice',
    categoryLabel: '发票',
    severity: 'error',
    solution: '该订单已开具发票，不能重复申请。',
    solutionEn: 'Invoice has already been issued for this order.',
  },

  // ── 退款相关 (E091-E100) ──
  'E091': {
    code: 'E091',
    message: '退款申请无效',
    messageEn: 'Invalid refund request',
    category: 'refund',
    categoryLabel: '退款',
    severity: 'error',
    solution: '该订单不满足退款条件。请检查退款规则后重试。',
    solutionEn: 'This order does not meet refund conditions.',
  },
  'E092': {
    code: 'E092',
    message: '退款已处理',
    messageEn: 'Refund already processed',
    category: 'refund',
    categoryLabel: '退款',
    severity: 'error',
    solution: '该订单退款申请已处理，不能重复申请。',
    solutionEn: 'Refund has already been processed for this order.',
  },
  'E093': {
    code: 'E093',
    message: '退款期限已过',
    messageEn: 'Refund period expired',
    category: 'refund',
    categoryLabel: '退款',
    severity: 'error',
    solution: '订单已超过退款期限，无法申请退款。',
    solutionEn: 'Order is beyond the refund period.',
  },

  // ── 代理相关 (E101-E110) ──
  'E101': {
    code: 'E101',
    message: '代理账户未激活',
    messageEn: 'Agent account not activated',
    category: 'agent',
    categoryLabel: '代理',
    severity: 'warning',
    solution: '您的代理账户尚未激活。请完成相关设置后联系管理员激活。',
    solutionEn: 'Your agent account is not activated. Please complete setup and contact admin.',
  },
  'E102': {
    code: 'E102',
    message: '代理佣金不足',
    messageEn: 'Insufficient agent commission',
    category: 'agent',
    categoryLabel: '代理',
    severity: 'error',
    solution: '可提现佣金不足。请等待更多佣金结算后再申请提现。',
    solutionEn: 'Insufficient commission balance for withdrawal.',
  },
  'E103': {
    code: 'E103',
    message: '代理提现处理中',
    messageEn: 'Agent withdrawal in progress',
    category: 'agent',
    categoryLabel: '代理',
    severity: 'warning',
    solution: '已有提现申请正在处理中，请等待完成后再申请新的提现。',
    solutionEn: 'A withdrawal request is already in progress.',
  },

  // ── 系统相关 (E901-E910) ──
  'E901': {
    code: 'E901',
    message: '系统内部错误',
    messageEn: 'Internal system error',
    category: 'system',
    categoryLabel: '系统',
    severity: 'error',
    solution: '系统发生内部错误。请联系管理员并提供错误信息以便排查。',
    solutionEn: 'An internal error occurred. Please contact the administrator.',
  },
  'E902': {
    code: 'E902',
    message: '数据库错误',
    messageEn: 'Database error',
    category: 'system',
    categoryLabel: '系统',
    severity: 'error',
    solution: '数据库操作失败。请稍后重试，如问题持续请联系管理员。',
    solutionEn: 'Database operation failed. Please retry later.',
  },
  'E903': {
    code: 'E903',
    message: '缓存服务错误',
    messageEn: 'Cache service error',
    category: 'system',
    categoryLabel: '系统',
    severity: 'warning',
    solution: '缓存服务暂时不可用，系统将降级运行。部分功能可能受影响。',
    solutionEn: 'Cache service unavailable. System is running in degraded mode.',
  },
  'E904': {
    code: 'E904',
    message: '配置错误',
    messageEn: 'Configuration error',
    category: 'system',
    categoryLabel: '系统',
    severity: 'error',
    solution: '系统配置有误。请联系管理员检查配置。',
    solutionEn: 'System configuration error. Please contact the administrator.',
  },
};

// ── 分类定义 ──
export const ERROR_CATEGORIES = [
  { key: 'balance', label: '余额', labelEn: 'Balance', icon: '💰' },
  { key: 'auth', label: '认证', labelEn: 'Authentication', icon: '🔐' },
  { key: 'model', label: '模型', labelEn: 'Model', icon: '🤖' },
  { key: 'rate-limit', label: '限流', labelEn: 'Rate Limit', icon: '⚡' },
  { key: 'request', label: '请求', labelEn: 'Request', icon: '📤' },
  { key: 'service', label: '服务', labelEn: 'Service', icon: '🔧' },
  { key: 'redemption', label: '兑换码', labelEn: 'Redemption', icon: '🎁' },
  { key: 'verification', label: '实名认证', labelEn: 'Verification', icon: '✅' },
  { key: 'invoice', label: '发票', labelEn: 'Invoice', icon: '📄' },
  { key: 'refund', label: '退款', labelEn: 'Refund', icon: '↩️' },
  { key: 'agent', label: '代理', labelEn: 'Agent', icon: '👥' },
  { key: 'system', label: '系统', labelEn: 'System', icon: '⚙️' },
] as const;

// ── 辅助函数 ──

/**
 * 获取错误码定义
 */
export function getErrorCode(code: string): ErrorCodeDefinition | undefined {
  return ERROR_CODES[code];
}

/**
 * 获取错误码文档 URL
 */
export function getErrorCodeDocUrl(code: string): string {
  return `/error-codes/${code}`;
}

/**
 * 创建标准错误响应
 */
export function createErrorResponse(
  code: string,
  customMessage?: string,
  details?: Record<string, unknown>
): {
  error: string;
  code: string;
  docUrl: string;
  details?: Record<string, unknown>;
} {
  const definition = getErrorCode(code);
  const message = customMessage || definition?.message || '未知错误';

  return {
    error: message,
    code,
    docUrl: getErrorCodeDocUrl(code),
    ...(details && { details }),
  };
}

/**
 * 按分类获取错误码列表
 */
export function getErrorCodesByCategory(category: string): ErrorCodeDefinition[] {
  return Object.values(ERROR_CODES).filter((def) => def.category === category);
}

/**
 * 搜索错误码
 */
export function searchErrorCodes(query: string): ErrorCodeDefinition[] {
  const lowerQuery = query.toLowerCase();
  return Object.values(ERROR_CODES).filter(
    (def) =>
      def.code.toLowerCase().includes(lowerQuery) ||
      def.message.toLowerCase().includes(lowerQuery) ||
      def.messageEn.toLowerCase().includes(lowerQuery) ||
      def.solution.toLowerCase().includes(lowerQuery) ||
      def.solutionEn.toLowerCase().includes(lowerQuery)
  );
}
