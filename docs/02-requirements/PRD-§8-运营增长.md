# PRD §8 运营增长（营销 / 活动 / 召回 / 推荐）

> 品牌：**浩寅云**　|　代码基线：2026-10-03 工作区（含 Step 4 补全）
> 状态图例：✅已实现（前后端闭环）｜🟡部分实现｜❌未实现（规划中）
> 路径权威：以 `api/src/routes/*.ts` 实际注册为准，不复用旧 SPEC 偏差路径。

---

## 一、功能清单

| 编号 | 功能点 | 实际端点 / 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 8.1 | 营销活动 CRUD（满赠/折扣/推广） | `admin-marketing-missing.ts`：`GET/POST/PUT/DELETE /api/v1/admin/campaigns[/:id]` | ✅ | 活动主数据增删改查闭环 |
| 8.1b | 活动启停 / 发放结算 | `POST /api/v1/admin/campaigns/:id/status`、`POST /api/v1/admin/campaigns/:id/grant` | ✅ | 活动状态切换 + 命中用户权益发放 |
| 8.1c | 活动参与人查询 | `GET /api/v1/admin/campaigns/:id/participants` | ✅ | 投放/转化复盘 |
| 8.2 | 充值发起与促销展示 | `recharge.ts`：`POST /api/v1/me/recharge`、`GET /api/v1/me/promotions` | 🟡 | 充值下单/订单链路完整；`/me/promotions` 当前返回空列表，满赠规则与 campaign 命中匹配未串接 |
| 8.3 | 兑换码批次管理（管理端） | `admin-finance-missing.ts`：`GET/POST /api/v1/admin/redemption/batches`、`POST .../:id/toggle` | ✅ | 批次创建/启停/详情 |
| 8.3b | 兑换码核销（用户端） | `recharge.ts`：`POST /api/v1/me/redemption/redeem`、`GET /api/v1/me/redemption/history` | ✅ | 用户核销 + 历史 |
| 8.4 | 优惠券生成 | `admin-affiliate-coupons.ts`：`GET/POST /api/v1/admin/coupons`、`POST .../generate` | ✅ | 券码生成 |
| 8.5 | 代理配置 / 记录 / 兑换码配额 | `admin-affiliate-coupons.ts`：`GET/PUT /api/v1/admin/affiliate/config`、`GET /api/v1/admin/affiliate/records` | ✅ | 归属规则为「报备划拨制」（已随 me-agent 对齐） |
| 8.6 | 公告投放（站内触达） | `admin-announcements.ts` CRUD + `me-gap.ts` `/me/announcements*` | ✅ | 登录用户公告中心（列表/未读数/单读/全读）完整；访客无独立公开公告入口（内嵌 `/public/status` top10） |
| 8.7 | 同意书政策触达 | `admin-marketing-missing.ts`：`GET/PUT /api/v1/admin/consent/policies[/:id]`、`GET /api/v1/admin/consent/logs` | 🟡 | 政策与同意记录有后端；与营销触达未联动 |
| 8.8 | 用户分组推送 / 定向投放 | 分组主数据 `admin-groups.ts`；推送侧复用 campaigns + announcements | 🟡 | 用户组 CRUD 完备，但「按分组筛选→站内+邮件一键推送」无独立聚合端点，需手工组合活动与公告 |
| 8.9 | 自动化流失召回（定时唤醒沉默用户） | — | ❌ | 无召回路由、无沉默用户定时圈选、无召回任务模板 |
| 8.10 | 推荐码 / 邀请奖励营销 | — | ❌ | 无 referral/推荐码路由与奖励结算；现有 growth 手段仅限兑换码与活动 |

---

## 二、关键架构

- **活动域收口在 `admin-marketing-missing.ts`**：campaigns、disputes、consent 三类运营数据同文件承载（历史补缺命名，重写 PRD 时按「营销活动 / 客诉争议 / 合规同意」三域理解，勿按文件名 `missing` 组织）。
- **资金类营销动作（发放 grant、兑换核销）全部走资金主链路**：发放经 `services/billing/balance.ts` 统一入账，带权限点 + 操作 2FA + 入账通知（详见 §9）。
- **触达双通道**：站内信（announcements / notifyUser）为必发；邮件按用户偏好，经 `admin-email.ts` 模板与 SMTP 配置发送。
- **公开侧无营销入口**：Portal（web-portal）仅 7 个静态/半静态页，无 `/demo`、免费 Key 引导条、客户案例页（见 §6/§21，非本章范围）。

---

## 三、未实现 / 规划中（❌）

1. **8.9 自动化流失召回**：沉默用户圈选 → 定时任务 → 多渠道召回，整条链路为零。
2. **8.10 推荐码 / 邀请奖励**：无 referral 体系，老带新增长手段缺失。
3. **8.8 分组一键推送**：缺「用户组 → 站内信 + 邮件」聚合投放端点。
4. **8.2 充值满赠自动匹配**：`/me/promotions` 为空，campaigns 与充值订单的满赠命中规则未串接。

> 前端：营销活动/公告/优惠券/兑换码均有对应 Console 页面（AdminCampaignsPage / AdminAnnouncementsPage / AdminCouponPage / AdminRedemptionPage），页面须遵守 `[?]` 帮助红线。
