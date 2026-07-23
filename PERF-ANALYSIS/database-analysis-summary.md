# 3cloud 数据库架构分析报告

## 概要
- **分析时间**: 2026-07-22T16:19:04.498Z
- **数据库**: PostgreSQL (threecloud)
- **总表数**: 81
- **总索引数**: 343
- **外键约束数**: 55,603

## 核心发现

### 1. 数据规模与增长趋势
- **最大表**: `call_logs_202607` (177.6万行，825MB)
- **高频增长表**: 
  - `balance_logs`: 30.4万行 (258MB)
  - `call_logs_202606`: 6.5万行 (24MB)
  - `commission_logs_202606`: 3.8万行 (18MB)
- **分区表设计**: call_logs 和 commission_logs 已按月份分区，设计合理

### 2. 索引分析
**现有索引特点**:
- 大部分表都有合理的基础索引
- 分区表在每个子分区上都有相同的索引结构
- 复合索引较多，覆盖常见查询模式

**潜在缺失索引**:
1. `call_logs`: 状态和时间范围查询的复合索引（status, created_at）
2. `users`: 邮箱和状态查询的复合索引（email, status）
3. `balance_logs`: 用户和时间范围的复合索引（user_id, created_at）
4. `commission_logs`: 代理商、状态和时间的复合索引（agent_id, status, created_at）

### 3. 外键约束风险
- **级联删除风险**: 发现 12,428 个使用 CASCADE 删除规则的外键
- **高风险表**: 关联关系复杂的表（如 agents 相关表、users 相关表）存在大量级联删除
- **建议**: 审核关键业务表的外键删除规则，确保级联删除符合业务预期

### 4. 分区表设计评估
**当前分区策略**:
- `call_logs`: 按月分区（202606-202612）
- `commission_logs`: 按月分区（202605-202612）

**优势**:
- 分区策略与数据增长模式匹配
- 历史数据易于管理
- 查询性能优化

**改进建议**:
1. 考虑更细粒度的分区（如按周）对于超高频表
2. 定期清理过期分区

### 5. 性能热点
**大表关注**:
1. `call_logs_202607`: 825MB，索引大小574MB（占69%）
2. `balance_logs`: 258MB，索引大小226MB（占87%）
3. `call_logs_202606`: 24MB，索引大小15MB（占62%）

**索引效率**: balance_logs 表索引占比过高（87%），可能需要优化索引设计

### 6. 表设计规范性
**良好实践**:
- 时间字段（created_at, updated_at）普遍有索引
- 软删除机制（deleted_at）
- 枚举类型使用合理

**改进建议**:
1. 部分关联表缺少复合索引
2. 某些查询模式可能缺少覆盖索引

## 优化建议

### 立即行动 (高优先级)
1. **索引优化**: 为高频查询模式添加缺失的复合索引
2. **级联删除审核**: 审核关键业务表的 CASCADE 规则
3. **监控设置**: 对大表设置增长监控和自动清理机制

### 短期改进 (中优先级)
1. **分区策略优化**: 评估是否需要更细粒度的分区
2. **索引重建**: 对索引占比过高的表评估索引效率
3. **查询优化**: 分析慢查询，针对性优化

### 长期规划 (低优先级)
1. **归档策略**: 制定历史数据归档方案
2. **读写分离**: 考虑读写分离架构
3. **缓存策略**: 优化热点数据缓存

## 详细数据

### 表大小 Top 10
1. call_logs_202607: 825 MB (表250MB + 索引574MB)
2. balance_logs: 258 MB (表32MB + 索引226MB)
3. call_logs_202606: {返回报告完整内容时，删除此占位符}
4. commission_logs_202606: 18 MB
5. commission_logs_2026_05: 7.4 MB
6. user_notifications: 1.8 MB
7. commission_logs_202607: 1.6 MB
8. user_login_sessions: 1.4 MB
9. operation_logs: 1.1 MB
10. audit_logs: 896 KB

### 数据表分类统计
- **用户相关**: 8张表 (users, admin_accounts, user_oauth_bindings 等)
- **计费交易**: I4张表 (call_logs, recharge_orders, balance_logs, user_discounts)
- **代理商系统**: 8张表 (agents, commission_logs, withdraw_orders 等)
- **财务系统**: 6张表 (daily_recon_summary, finance_cost_records 等)
- **安全系统**: 7张表 (login_security_configs, security_events 等)
- **系统管理**: 7张表 (audit_logs, system_configs, email_templates 等)
- **兑换码系统**: 5张表 (redemption_batches, redemption_codes 等)
- **供应商管理**: 7张表 (vendors, models, vendor_models 等)

## 后续步骤
1. **实施索引优化**: 按建议添加缺失索引
2. **监控性能**: 设置数据库性能监控
3. **定期审计**: 每季度进行一次数据库架构审计
4. **容量规划**: 基于增长趋势进行容量规划