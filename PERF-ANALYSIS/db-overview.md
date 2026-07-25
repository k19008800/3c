# 3cloud 数据库架构分析报告

**分析时间**: 2026-07-24  
**数据库**: PostgreSQL 17  
**数据库名**: threecloud  
**连接**: localhost:5432

---

## 1. 总体概览

### 数据库规模
- **表数量**: 81 张表
- **索引数量**: 365 个索引
- **平均索引/表**: 4.5 个索引每表

### 数据分布特征
1. **分区表策略**: 大量按月分区的表（call_logs_YYYYMM, commission_logs_YYYYMM）
2. **日志表为主**: 最大的表均为日志表
3. **高外键关联**: 系统设计为高度关联的关系型结构

---

## 2. 表清单与字段分析

### 核心业务表（按重要性排序）

#### A. 用户与权限 (10+ 张表)
1. **users** - 用户主表
   - 字段数: ~40个
   - 核心字段: id, email, password_hash, status, balance, user_type, role
   - 索引: email(唯一), status, real_name_status

2. **user_login_sessions** - 登录会话
3. **user_login_history** - 登录历史
4. **user_notifications** - 用户通知
5. **user_role_assignments** - 角色分配
6. **user_role_history** - 角色历史

#### B. 代理商系统 (5+ 张表)
1. **agents** - 代理商主表
2. **agent_clients** - 代理商客户
3. **agent_balance_ledger** - 代理商余额台账
4. **agent_customer_consumption** - 客户消费记录

#### C. 调用日志系统 (12+ 张表)
1. **call_logs** - 当前月调用日志
2. **call_logs_YYYYMM** - 历史分区表
   - 最大表: call_logs_202607 (1,776,217 行，899 MB)
   - 分区策略: 按月自动分区

#### D. 财务系统 (8+ 张表)
1. **recharge_orders** - 充值订单 (420 行)
2. **withdraw_orders** - 提现订单 (62 行)
3. **balance_logs** - 余额变更日志
4. **finance_cost_records** - 成本记录
5. **finance_profit_records** - 利润记录

#### E. 兑换码系统 (6+ 张表)
1. **redemption_codes** - 兑换码主表 (270 行)
2. **redemption_logs** - 兑换记录
3. **redemption_batches** - 批次管理
4. **redemption_fraud_events** - 欺诈事件
5. **redemption_gift_logs** - 赠送记录

#### F. API密钥管理 (3+ 张表)
1. **api_keys** - API密钥表 (795 行)
2. **vendor_api_keys** - 厂商API密钥
3. **key_quotas** - 密钥额度限制

#### G. 厂商与模型 (6+ 张表)
1. **vendors** - 厂商表
2. **vendor_models** - 厂商模型关联
3. **models** - 模型定义表
4. **vendor_key_groups** - 密钥分组
5. **vendor_key_group_items** - 分组项
6. **vendor_key_group_model_prices** - 模型定价

#### H. 系统配置 (5+ 张表)
1. **system_configs** - 系统配置
2. **email_templates** - 邮件模板
3. **page_contents** - 页面内容
4. **login_security_configs** - 登录安全配置
5. **sensitive_words** - 敏感词库

#### I. 审计与监控 (6+ 张表)
1. **operation_logs** - 操作日志
2. **audit_logs** - 审计日志
3. **prompt_audit_logs** - 提示词审计
4. **security_events** - 安全事件
5. **price_change_history** - 价格变更历史

---

## 3. 索引分析

### 索引覆盖情况

#### A. 索引充足的表 ✓
- **users**: email(唯一), status, real_name_status
- **api_keys**: 多字段复合索引
- **recharge_orders**: order_no(唯一), user_id, status, created_at 等多索引
- **redemption_codes**: code(唯一), batch_no, status, valid_from 等多索引
- **vendor_models**: vendor_id+model_id(唯一), circuit_state 等

#### B. 索引策略分析
1. **复合索引策略**: 大量 (user_id, status, created_at DESC) 模式
2. **条件索引**: WHERE client_call_log_id IS NOT NULL 等条件索引
3. **唯一性约束**: 大部分业务键都有唯一索引
4. **排序优化**: 大量 created_at DESC 索引支持时间倒序查询

### 索引问题识别

#### 问题1: 外键字段缺少索引 (严重⚠️)
**发现 60+ 个外键字段缺少索引**，包括：
- call_logs.api_key_id → api_keys.id
- call_logs.model_id → models.id  
- call_logs.user_id → users.id
- call_logs.vendor_model_id → vendor_models.id
- 所有分区表的相同外键都缺少索引

**影响**: JOIN查询性能差，更新/删除锁竞争

#### 问题2: 大表重要字段缺少索引
**call_logs_202607 (177万行) 缺少索引字段**:
- model_name (模型名称查询)
- duration_ms (耗时分析)
- error_message (错误分析)
- ip (IP分析)
- user_agent (客户端分析)
- prompt_tokens/completion_tokens (token统计)

**影响**: 分析查询全表扫描，性能低下

---

## 4. 关系图分析

### 核心关系链

```
用户体系:
users ←─┬─ user_login_sessions
        ├─ user_login_history
        ├─ user_notifications
        ├─ user_role_assignments
        ├─ api_keys
        ├─ recharge_orders
        ├─ withdraw_orders
        └─ balance_logs

代理商体系:
agents ←─┬─ agent_clients
         ├─ agent_balance_ledger
         ├─ agent_customer_consumption
         └─ commission_logs

调用体系:
call_logs ←─ api_keys
           ←─ users
           ←─ models
           ←─ vendor_models

财务体系:
recharge_orders ←─ balance_logs
                ←─ invoice_requests
                ←─ refund_requests

兑换码体系:
redemption_codes ←─ redemption_logs
                 ←─ redemption_fraud_events
                 ←─ redemption_gift_logs
                 ←─ agent_balance_ledger
```

### 外键关系统计
- **总外键数**: 100+ 个
- **users表引用**: 被 40+ 个表引用（中心节点）
- **api_keys表引用**: 被 20+ 个表引用
- **redemption_codes表引用**: 被并使c个表引用

---

## 5. 慢查询候选与性能热点

### 高潜在风险表

#### A. 超大表（性能热点）
1. **call_logs_202607** - 177万行
   - 大小: 899 MB
   - 风险: 查询性能，备份恢复时间长
   - 建议: 考虑进一步分区（按天/按用户）

2. **user_notifications** - 7,919行
   - 大小: 1.8 MB
   - 风险: 高频读写，用户频繁访问

#### B. 高频操作表
1. **api_keys** - 795行
   - 每次API调用都会查询
   - 需要极高查询性能

2. **users** - 用户认证
   - 登录、余额查询高频

#### C. 复杂关联查询表
1. **commission_logs** 系列表
   - 关联: agents + users + redemption_codes
   - 查询复杂，缺少必要索引

### 查询模式分析

#### 高频查询模式识别
1. **时间范围查询**: WHERE created_at BETWEEN ... AND ...
2. **状态过滤**: WHERE status = 'xxx'
3. **用户维度**: WHERE user_id = xxx
4. **复合条件**: WHERE user_id = xxx AND status = 'xxx' AND created_at > ...

#### 当前索引覆盖情况
✅ **良好覆盖**:
- 时间范围: created_at 索引
- 状态过滤: status 索引  
- 用户+状态+时间: 复合索引

❌ **缺失覆盖**:
- 外键关联字段
- 大表的分析字段（model_name, ip等）
- 部分业务字段

---

## 6. 优化建议

### 紧急优化（性能风险高）

#### 1. 添加缺失的外键索引 ⚠️
```sql
-- call_logs 表外键索引
CREATE INDEX idx_call_logs_api_key_id ON call_logs(api_key_id);
CREATE INDEX idx_call_logs_model_id ON call_logs(model_id);
CREATE INDEX idx_call_logs_user_id ON call_logs(user_id);
CREATE INDEX idx_call_logs_vendor_model_id ON call_logs(vendor_model_id);

-- 所有分区表都需要相同索引
-- call_logs_202606, call_logs_202607, ...
```

#### 2. 大表分析字段索引
```sql
-- call_logs_202607 分析字段索引
CREATE INDEX idx_call_logs_model_name ON call_logs_202607(model_name);
CREATE INDEX idx_call_logs_ip ON call_logs_202607(ip);
CREATE INDEX idx_call_logs_duration ON call_logs_202607(duration_ms);
CREATE INDEX idx_call_logs_error ON call_logs_202607(error_message) WHERE error_message IS NOT NULL;
```

### 中期优化（架构改进）

####55+. 监控分区表增长
- 当前分区: 按月自动分区
- 建议: 监控单个分区大小，超过 1000万行考虑更细粒度分区

####56+. 考虑读写分离
- 分析查询（报表、统计）访问 call_logs
- 建议: 从库专门用于分析查询

####57+. 历史数据归档策略
- call_logs 超过6个月的数据访问频率低
- 建议: 冷热数据分离

### 长期优化（架构演进）

#### 1. 分库分表策略
- **用户分片**: 按 user_id 分片
- **时间分片**: 继续按月分区
- **业务分库**: 日志库、业务库分离

#### 2. 缓存策略优化
- API密钥信息缓存
- 用户信息缓存
- 配置信息缓存

#### 3. 查询优化
- 复杂报表预计算
- 物化视图
- 异步统计计算

---

## 7. 风险评估

### 高风险
1. **外键无索引**: 关联查询性能差，可能引发死锁
2. **大表无分析索引**: 报表查询慢，影响管理功能
3. **users表中心化**: 单点故障风险

### 中风险
1. **分区表管理**: 需要自动化分区维护
2. **数据增长**: call_logs 月增 ~200万行
3. **备份恢复**: 数据量大，备份时间长

### 低风险
1. **索引冗余**: 部分索引可能重复
2. **字段设计**: 某些字段长度可能过大

---

## 8. 监控建议

### 需要监控的关键指标
1. **查询性能**
   - 最慢的10个查询
   - 全表扫描查询
   - 索引使用率

2. **表增长**
   - 每月数据增长量
   - 分区表大小监控
   - 索引膨胀监控

3. **锁竞争**
   - 外键更新锁等待
   - 死锁发生频率

### 建议的监控SQL
```sql
-- 查看最慢查询
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements 
ORDER BY mean_time DESC LIMIT 10;

-- 查看缺失索引
SELECT * FROM pg_stat_all_tables 
WHERE seq_scan > 1000 AND idx_scan < seq_scan;

-- 查看锁等待
SELECT * FROM pg_locks WHERE granted = false;
```

---

## 9. 总结

### 优势
1. **索引策略合理**: 复合索引设计良好
2. **分区策略**: 按月分区控制单表大小
3. **关系清晰**: 外键约束完善，数据一致性有保障

### 待改进
1. **外键索引**: 急需补充60+个外键索引
2. **分析查询**: 大表缺少分析字段索引
3. **监控体系**: 需要建立系统化监控

### 优先级
1. **P0 (本周)**: 补充关键外键索引
2. **P1 (本月)**: 添加大表分析字段索引  
3. **P2 (下月)**: 建立监控体系，优化查询
4. **P3 (季度)**: 架构优化，分库分表评估

---

**报告生成**: 数据库梳理专家  
**数据来源**: PostgreSQL 系统表 + 实际 schema 分析  
**建议依据**: 实际表统计 + 查询模式分析 + 业务场景推断