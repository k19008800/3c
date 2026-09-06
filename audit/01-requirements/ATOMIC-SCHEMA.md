# 原子需求清单格式（Phase 1）

本目录的需求拆解必须遵守以下规则：一行只允许一个可独立验证的断言。

## CSV 字段

| 字段 | 要求 |
|---|---|
| `req_id` | 唯一编号，例如 `REQ-SPEC-005-0001` |
| `domain` | 业务域 |
| `source_path` | 需求文档相对路径 |
| `source_section` | 精确章节/小节 |
| `source_quote` | 原文摘录，不得只写总结；必须来自可读的 `source_path`，不得含疑似编码损坏或 Unicode replacement character |
| `category` | page / field / state / action / permission / api / db / logic / boundary / exception / concurrency / idempotency / transaction / rollback / audit / security / performance / test |
| `priority` | P0 / P1 / P2 / P3 |
| `atomic_assertion` | 单一断言，不能使用“以及/同时/并且”合并多个验收点 |
| `expected_evidence` | 预期需要的代码、运行或测试证据 |
| `notes` | 冲突、依赖或 N/A 依据；无法恢复源文档时必须说明 `MANUAL_REBUILD` 原因 |

## 源文档完整性门禁

需求 CSV 的结构正确和字符串可匹配，不代表需求内容可用。正式进入需求验收前必须同时满足：

1. `source_path` 文件存在且使用明确编码可读；
2. `source_section` 是源文档中的真实章节或明确行号；
3. `source_quote` 是源文档中的可读原文片段；
4. `source_quote`、`source_section`、`atomic_assertion` 不含疑似乱码标记或 Unicode replacement character；
5. 若源文档无法可靠恢复，条目必须进入 `MANUAL_REBUILD`，保持 `UNKNOWN`，不得仅凭当前乱码文本判定通过；
6. 历史归档、辅助 SPEC 或代码注释只能作为交叉参考，不能未经逐条确认替代当前需求出处。

校验报告：`audit/01-requirements/source-integrity-report.md`。

## 原子化判定

以下表达默认不合格，必须拆行：

- “支持登录、注册和找回密码”
- “校验参数并保存并通知用户”
- “管理员可以查看、编辑、删除”
- “异常时回滚并记录日志”
- “页面有加载、空态和错误态”

合格拆分示例：

1. 登录页存在邮箱输入框。
2. 登录页对空邮箱显示校验错误。
3. 登录页对格式非法邮箱显示校验错误。
4. 登录接口接收邮箱字段。
5. 登录接口验证密码哈希。
6. 登录失败返回指定错误码。
7. 登录成功签发 access token。
8. 登录成功写入会话记录。
9. 登录失败不写入成功会话。
10. 连续失败达到阈值后触发限流。

## PASS 禁止条件

Phase 1 只产出需求原子项，不判定实现通过。后续实现核对中：

- 没有源码路径和行号，不得判 PASS；
- 没有测试文件/测试名称或动态验证证据，不得判 PASS；
- 只有旧审计报告结论，不得判 PASS；
- 证据不足标记 `UNKNOWN`，不能猜测；
- 产品裁决项标记 `DEMO` 或 `DEFERRED`，必须附裁决出处；
- 不适用项标记 `N/A`，必须附需求依据。

## 每页面最低颗粒度

Phase 2 每页面至少 100 条，推荐按以下维度生成 141 条基线：

1. 路由与入口 6
2. 页面标题与页面帮助 8
3. 布局与区域 8
4. 数据展示字段 15
5. 搜索筛选排序分页 10
6. 表单字段与校验 12
7. 操作按钮与按钮帮助 12
8. 弹窗抽屉二次确认 8
9. 加载空态错误态 8
10. 成功失败反馈 6
11. 角色权限数据范围 8
12. API 请求响应错误码 12
13. 数据库字段持久化 8
14. 审计幂等并发安全 10
15. 测试验收证据 10

不适用维度必须逐项写明 `N/A` 与依据，不得省略以降低数量。
