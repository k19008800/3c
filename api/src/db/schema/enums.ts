// ============================================================
//  3cloud (3C) — Drizzle ORM Enums (PostgreSQL)
//  All pgEnum definitions in one place
// ============================================================

import { pgEnum } from "drizzle-orm/pg-core";

// ── 用户相关 ──

export const userTypeEnum = pgEnum("user_type", ["personal", "enterprise"]);
export const oauthProviderEnum = pgEnum("oauth_provider", [
  "wechat",
  "google",
  "apple",
  "github",
]);
export const userStatusEnum = pgEnum("user_status", [
  "pending",        // 未验证邮箱
  "active",         // 已验证邮箱
  "disabled",       // 已禁用（可登录看余额，不可请求）
  "deleted",        // 已注销（软删除，不可登录不可重新注册）
]);
export const realNameStatusEnum = pgEnum("real_name_status", [
  "unverified",
  "pending_review",
  "approved",
  "rejected",
]);
export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "admin",
  "finance_ops",
  "ops",
  "support",
  "auditor",
  "agent",
  "user",
]);

// ── 模型 & 厂商 ──

export const modelTypeEnum = pgEnum("model_type", [
  "chat",
  "embedding",
  "image",
  "audio",
  "rerank",     // 重排序
  "video",      // 视频生成
  "moderation", // 内容审核
  "realtime",   // 实时语音
]);
export const vendorStatusEnum = pgEnum("vendor_status", [
  "pending",  // 注册待审核
  "active",
  "down",    // 宕机（被动检测）
  "degraded",// 降级
  "disabled",
  "rejected", // 审核未通过
]);
export const callStatusEnum = pgEnum("call_status", ["success", "failed", "timeout", "cancelled", "rate_limited"]);

// 熔断器状态枚举
// closed → open → half_open → (closed or dead)
export const circuitStateEnum = pgEnum("circuit_state_type", [
  "closed",
  "half_open",
  "open",
  "dead",
]);

// ── 订单 & 支付 ──

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "paid",
  "cancelled",
  "confirmed",   // 对公转账已确认
  "refunded",
]);
export const payChannelEnum = pgEnum("pay_channel", [
  "wechat_scan",
  "wechat_jsapi",
  "alipay_scan",
  "alipay_jsapi",
  "bank_transfer",
]);

// ── 代理商 ──

export const withdrawStatusEnum = pgEnum("withdraw_status", [
  "pending_first_review",
  "pending_second_review",
  "approved",
  "rejected",
  "paid",
]);
export const commissionStatusEnum = pgEnum("commission_status", [
  "pending",
  "settled",
  "cancelled",
]);

// ── 计费 ──

export const balanceLogTypeEnum = pgEnum("balance_log_type", [
  "recharge",
  "consumption",
  "refund",
  "trial_grant",
  "admin_adjust",
  "negative_repay",
  "redemption_prepay",
  "redemption_refund",
]);

// ── 审计 & 安全 ──

export const operationCategoryEnum = pgEnum("operation_category", [
  "auth",
  "api_key",
  "finance",
  "profile",
  "agent",
  "system",
]);

export const auditActionEnum = pgEnum("audit_action", [
  "user_create",
  "user_disable",
  "user_enable",
  "user_password_reset",
  "balance_adjust",
  "role_change",
  "real_name_approve",
  "real_name_reject",
  "withdraw_approve",
  "withdraw_reject",
  "withdraw_first_approve",
  "withdraw_second_approve",
  "withdraw_paid",
  "agent_create",
  "agent_update",
  "config_update",
  "vendor_create",
  "vendor_update",
  "vendor_approve",
  "vendor_reject",
  "vendor_key_generate",
  "vendor_model_approve",
  "vendor_model_reject",
  "model_create",
  "model_update",
  "user_update",
  "user_impersonate",
  "order_cancel",
  "recharge_confirm",
  "recharge_first_confirm",
  "recharge_second_confirm",
  "system_maintenance",
  "announcement_create",
  "announcement_update",
  "announcement_delete",
  "quota_create",
  "quota_update",
  "quota_delete",
  "fraud_ban_ip",
  "fraud_unban_ip",
  "fraud_config_update",
  "page_content_create",
  "page_content_update",
  "page_content_delete",
  "email_template_create",
  "email_template_update",
  "email_template_delete",
  "content_filter_create",
  "content_filter_update",
  "content_filter_delete",
]);

// ── 通知 ──

export const notificationTypeEnum = pgEnum("notification_type", [
  "real_name_approved",
  "real_name_rejected",
  "system",
  "login_alert",
  "account_banned",
  "balance_low",
  "quota_warning",
  "quota_exceeded",
  "withdraw_result",
  "commission_settled",
  "agent_client_event",
  "new_model",
  "system_announcement",
  "redemption_success",
  "redemption_used",
  "redemption_expiring",
  "redemption_fraud",
  "redemption_revoked",
  "api_key_event",
]);

// ── 安全风控 ──

export const riskLevelEnum = pgEnum("risk_level", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const securityEventTypeEnum = pgEnum("security_event_type", [
  "brute_force",
  "unusual_location",
  "new_device",
  "ip_banned",
  "user_banned",
  "user_captcha",
  "circuit_trip",
  "circuit_recovery",
  "vendor_failure",
  "test_alert",
]);

// ── 兑换码 ──

export const redemptionBatchStatusEnum = pgEnum("redemption_batch_status", [
  "active",
  "expired",
  "disabled",
]);

export const redemptionCodeStatusEnum = pgEnum("redemption_code_status", [
  "unused",
  "used",
  "expired",
  "revoked",
]);

// ── 营销活动 ──

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "active",
  "ended",
  "archived",
]);

// ── 管理后台 ──

export const adminApiKeyStatusEnum = pgEnum("admin_api_key_status", [
  "active",
  "disabled",
  "expired",
]);

// ── 配额 ──

export const quotaTypeEnum = pgEnum("quota_type", ["monthly", "total", "per_key"]);
export const setByRoleEnum = pgEnum("set_by_role", ["agent", "admin"]);

// ── 提示词审计 ──

export const auditStatusEnum = pgEnum("audit_status", [
  "pending",    // 待审核
  "reviewed",   // 已审核正常
  "flagged",    // 已标记异常
  "ignored",    // 已忽略
]);
export const responseStatusEnum = pgEnum("response_status", [
  "success",
  "error",
  "filtered",
  "timeout",
]);
