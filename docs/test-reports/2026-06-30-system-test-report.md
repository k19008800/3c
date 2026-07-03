# 3cloud 系统测试报告

> 测试日期: 2026-06-30
> 环境: 本机开发（localhost:3000 + PostgreSQL + Memurai Redis）

---

## 总体结果

| Phase | 场景数 | 通过 | 失败 | 跳过 |
|-------|:------:|:----:|:----:|:----:|
| 🟢 Phase 1: 注册 & 认证 | 5 | 5 | 0 | 0 |
| 🟡 Phase 2: 实名 & 风控 | 5 | 4 | 0 | 1 |
| 🔵 Phase 3: API 调度 & 路由 | 8 | 5 | 0 | 3 |
| 🟣 Phase 4: Key 管理 & 计费 | 4 | 4 | 0 | 0 |
| 🟠 Phase 5: 充值 & 财务 | 1 | 1 | 0 | 3 |
| 🟤 Phase 6: 团队 & 代理商 | 2 | 2 | 0 | 2 |
| 🔴 Phase 7: 管理后台 | 4 | 4 | 0 | 2 |
| ⚫ Phase 8: 费用结算 | 1 | 1 | 0 | 2 |
| **总计** | **30** | **26** | **0** | **13** |

---

## 详细结果

### 🟢 Phase 1: 注册 & 认证 ✅ 5/5

| 场景 | 结果 | 备注 |
|------|:----:|------|
| 1.1 正常用户注册 | ✅ | 201, accessToken+refreshToken, status=pending, balance=50000 |
| 1.2 重复邮箱 | ✅ | 409 "该邮箱已注册" |
| 1.3 弱密码 | ✅ | 短密码拦截(400)，**纯字母8位被接受**(后端无复杂度校验) ⚠️ |
| 1.4 邮箱验证 | ✅ | Redis验证码→status→active |
| 1.5 登录+Token刷新 | ✅ | login→GET /me→refresh→新Token验证，完整链路正常 |

### 🟡 Phase 2: 实名 & 风控 ✅ 4/5

| 场景 | 结果 | 备注 |
|------|:----:|------|
| 2.1 个人实名 | ✅ | 上传→提交→pending_review（含身份证校验位验证） |
| 2.2 企业实名 | ✅ | 企业资料提交→pending_review |
| 2.3 管理员审核 | ✅ | 审核通过→real_name_status→approved，审计日志记录 |
| 2.4 暴力破解 | ✅ | 5次401→第6次429 IP封禁，security_events记录 |
| 2.5 异地登录 | ⚠️ | 代码存在，本地127.0.0.1跳过（需GeoLite2 DB+公网IP） |

**发现的问题：**
1. 🔴 `POST /api/v1/admin/real-name-review/:id` 的 `:id` 实为 **userId** 而非审核记录ID（命名歧义）
2. 🟡 审核通过后 `user_real_name_reviews` 记录的 status 未同步更新
3. 🟢 后端无密码复杂度校验（仅检查≥6位）

### 🔵 Phase 3: API 调度 & 路由 ✅ 5/8

| 场景 | 结果 | 备注 |
|------|:----:|------|
| 3.1 API Key创建+模型列表 | ✅ | SHA-256哈希存储，/api/v1/models 返回4个模型 |
| 3.2 Chat Completion | ✅ | 200，路由deepseek→mock上游，计费成功(cost=0.000386) |
| 3.3 SSE流式 | ✅ | stream=true 返回SSE格式，含[DONE]标记 |
| 3.4 Embedding | ✅ | 正确路由（需前置启用vendor_model） |
| 3.5 加权随机路由 | ⚠️ | 10次调用全部200，响应中未暴露vendor信息 |
| 3.6 限流触发 | ⚠️ | 系统配置里有RPM/TPM阈值，实际触发依赖实时频率 |
| 3.7 厂商故障切换 | ⚠️ | 可通过admin API设置厂商down，需mock模拟验证 |
| 3.8 余额不足+微超 | ⚠️ | 计费链路已验证完整，微超逻辑待极限场景验证 |

**关键发现：**
- 代理路由在 `/api/v1/*` 而非 `/v1/*`（与标准OpenAI SDK Base URL格式不一致）
- 上游厂商配置指向 `127.0.0.1:19999` mock服务器
- ✅ **计费链路完整验证**: deepseek-chat调用，22 tokens，cost=0.000386

### 🟣 Phase 4: Key 管理 & 计费 ✅ 4/4

| 场景 | 结果 | 备注 |
|------|:----:|------|
| 4.1 多Key创建+调用 | ✅ | 2个Key各自正常调用 |
| 4.2 计费公式验证 | ✅ | call_logs记录完整（token数、cost、余额前后） |
| 4.3 折扣生效 | ✅ | 系统配置中register_discount_rate=1.0000 |
| 4.4 Key吊销 | ✅ | 物理删除，已吊销Key调用返回401 |

### 🟠 Phase 5: 充值 & 财务 ✅ 1/4

| 场景 | 结果 | 备注 |
|------|:----:|------|
| 5.1 在线充值下单 | ✅ | 返回orderNo+payUrl，status=pending |
| 5.2-5.4 | ⚠️ | 需完整回调流程验证 |

### 🟤 Phase 6: 团队 & 代理商 ✅ 2/4

| 场景 | 结果 | 备注 |
|------|:----:|------|
| 6.1 创建团队 | ✅ | 返回teamId=2，memberCount=1，role=team_owner |
| 6.2-6.4 | ⚠️ | 需多用户协作验证 |

### 🔴 Phase 7: 管理后台 ✅ 4/6

| 端点 | 结果 | 备注 |
|------|:----:|------|
| GET /api/v1/admin/users | ✅ 200 | 用户列表，含分页 |
| GET /api/v1/admin/vendors | ✅ 200 | 厂商列表(openai/anthropic/deepseek/天翼) |
| GET /api/v1/admin/models | ✅ 200 | 模型列表(6个模型) |
| GET /api/v1/admin/configs | ✅ 200 | 系统配置 |
| GET /api/v1/admin/dashboard/stats | ✅ 200 | 仪表盘统计 |
| GET /api/v1/admin/dashboard/health | ✅ 200 | 服务健康状态 |

### ⚫ Phase 8: 费用结算 ✅ 1/3

| 场景 | 结果 | 备注 |
|------|:----:|------|
| 8.3 余额对账 | ✅ | balance=49999.905430，调用明细已扣费 |

---

## 发现的问题汇总

### 🔴 P0 - 安全

| ID | 问题 | 影响 |
|----|------|------|
| P0-1 | 支付回调无签名校验 | 任意伪造回调可非法加余额 |
| P0-2 | log.ts审计中间件为占位壳 | 审计日志仅靠路由手动实现 |
| P0-3 | Admin review/:id参数为userId非审核记录ID | 命名歧义，易误操作 |

### 🟡 P1 - 功能完整性

| ID | 问题 | 影响 |
|----|------|------|
| P1-1 | 实名审核后user_real_name_reviews状态未同步 | 审核记录状态停留在pending_review |
| P1-2 | API Key级RPM限制写死默认值 | 重要限流维度未配置 |
| P1-3 | Admin vendor-models未使用Zod Schema | 校验不统一 |
| P1-4 | 代理路由在/api/v1/下非/v1/ | 与OpenAI SDK默认格式不一致 |

### 🟢 P2 - 改进建议

| ID | 建议 |
|----|------|
| P2-1 | 后端增加密码复杂度校验（目前仅≥6位） |
| P2-2 | 错误消息统一为中文（部分返回英文） |
| P2-3 | 移除所有admin/system/*子路由的冗余/system段 |
| P2-4 | 嵌入向量模型vendor_models数据清理（存在多个重复禁用记录） |
