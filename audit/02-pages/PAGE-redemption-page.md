# 页面原子审计：RedemptionPage

- 页面编号：PAGE-U1-RedemptionPage
- 应用：console
- 路由：UNKNOWN（需以 docs/frontend-routes.md 和源码路由注册核验）
- 源码：web-console/src/pages/RedemptionPage.tsx
- PRD：docs/ref-2.2.8-redemption-invoices.md
- SPEC：UNKNOWN（未将未核验文档结论当作证据）
- 适用角色：user（具体角色边界 UNKNOWN）

> 本报告为 U1 只读原子审计；不复用旧审计结论。实现和测试证据不足均标记 UNKNOWN，不判定 PASS。

## 原子核对表

| ID | 维度 | 单一核对断言 | 需求出处 | 实现证据（文件:行号） | 测试证据 | 状态 | 优先级 | 备注 |
|---|---|---|---|---|---|---|---|---|
| U1-001 | route | 页面可通过其配置的用户端路由进入 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |
| U1-002 | route | 未认证访问时页面执行认证检查 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |
| U1-003 | route | 返回页面时保留合法的路由上下文 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |
| U1-004 | route | 页面使用用户端布局 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |
| U1-005 | route | 页面入口名称与页面标题语义一致 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |
| U1-006 | route | 浏览器刷新后路由仍可解析 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |
| U1-007 | page | 页面展示明确的页面标题 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P1 §原则描述/验收标准` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |
| U1-008 | page | 页面标题右侧提供页面级[?]帮助入口 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P1 §原则描述/验收标准` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |
| U1-009 | page | 页面级帮助可通过点击打开 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P1 §原则描述/验收标准` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |
| U1-010 | page | 页面级帮助说明适用角色 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P1 §原则描述/验收标准` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |
| U1-011 | page | 页面级帮助说明功能定位 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P1 §原则描述/验收标准` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |
| U1-012 | page | 页面级帮助说明核心操作 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P1 §原则描述/验收标准` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |
| U1-013 | page | 页面级帮助说明注意事项 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P1 §原则描述/验收标准` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |
| U1-014 | page | 页面级帮助说明常见问题 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P1 §原则描述/验收标准` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |
| U1-015 | layout | 页面包含主要内容区域 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P2 §原则描述` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-016 | layout | 页面在窄视口下保持可用布局 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P2 §原则描述` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-017 | layout | 主要区域与辅助区域视觉层级一致 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P2 §原则描述` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-018 | layout | 交互控件具有可识别焦点状态 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P2 §原则描述` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-019 | layout | 文本与背景满足可读性要求 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P2 §原则描述` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-020 | layout | 重复进入页面不产生重复交互区 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P2 §原则描述` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-021 | layout | 页面区域使用平台一致的间距 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P2 §原则描述` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-022 | layout | 弹层关闭后焦点返回触发入口 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P2 §原则描述` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-023 | field | 页面展示与业务相关的核心数据字段 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `web-console/src/pages/RedemptionPage.tsx:57` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-024 | field | 数据字段使用明确标签 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `web-console/src/pages/RedemptionPage.tsx:57` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-025 | field | 敏感数据按安全规则脱敏 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `web-console/src/pages/RedemptionPage.tsx:57` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-026 | field | 金额字段使用统一精度格式 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `web-console/src/pages/RedemptionPage.tsx:57` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-027 | field | 时间字段使用统一时区格式 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `web-console/src/pages/RedemptionPage.tsx:57` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-028 | field | 枚举字段展示可读名称 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `web-console/src/pages/RedemptionPage.tsx:57` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-029 | field | 长文本不破坏布局 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `web-console/src/pages/RedemptionPage.tsx:57` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-030 | field | 缺失字段有明确占位展示 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `web-console/src/pages/RedemptionPage.tsx:57` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-031 | field | 字段值不会把未信任内容作为HTML执行 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `web-console/src/pages/RedemptionPage.tsx:57` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-032 | field | 列表列标题与数据含义一致 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `web-console/src/pages/RedemptionPage.tsx:57` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-033 | field | 数据刷新后字段值与响应一致 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `web-console/src/pages/RedemptionPage.tsx:57` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-034 | field | 数据范围仅包含当前用户可见记录 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `web-console/src/pages/RedemptionPage.tsx:57` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-035 | field | 关联对象不存在时显示可理解状态 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `web-console/src/pages/RedemptionPage.tsx:57` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-036 | field | 数据展示支持键盘阅读顺序 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `web-console/src/pages/RedemptionPage.tsx:57` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-037 | query | 可按需求支持的关键词搜索 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-038 | query | 搜索输入为空时不会发送无意义查询 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-039 | query | 筛选条件变更后列表与条件一致 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-040 | query | 排序方向变化后列表顺序可解释 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-041 | query | 分页页码变化后请求对应页 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-042 | query | 分页总数来自服务端响应 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-043 | query | 无匹配结果展示空状态 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-044 | query | 查询失败展示错误信息 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-045 | query | 查询失败提供重试入口 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-046 | query | 刷新查询不会重复追加旧数据 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-047 | query | 查询参数经过编码处理 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-048 | form | 表单字段有明确标签或可访问名称 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-049 | form | 必填字段在提交前校验 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-050 | form | 字段格式非法时显示字段级错误 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-051 | form | 字段长度超限时阻止提交 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-052 | form | 字段输入被规范化处理 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-053 | form | 敏感字段默认不明文展示 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-054 | form | 提交按钮在无效表单时不可误提交 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-055 | form | 提交中状态阻止重复提交 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-056 | form | 取消编辑不会意外保存变更 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-057 | form | 服务端校验错误映射到表单 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-058 | form | 表单失败后保留可安全恢复的输入 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-059 | form | 表单提交使用与需求匹配的HTTP方法 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-060 | action | 每个操作按钮或入口旁提供按钮级[?]帮助 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P1 §原则描述/按钮级帮助` | `web-console/src/pages/RedemptionPage.tsx:112` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-061 | action | 按钮级帮助文案说明操作作用 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P1 §原则描述/按钮级帮助` | `web-console/src/pages/RedemptionPage.tsx:112` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-062 | action | 主要操作入口可被键盘触发 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P1 §原则描述/按钮级帮助` | `web-console/src/pages/RedemptionPage.tsx:112` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-063 | action | 危险操作使用明确的危险样式 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P1 §原则描述/按钮级帮助` | `web-console/src/pages/RedemptionPage.tsx:112` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-064 | action | 操作入口仅在有权限时展示或禁用 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P1 §原则描述/按钮级帮助` | `web-console/src/pages/RedemptionPage.tsx:112` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-065 | action | 链接目标与入口名称一致 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P1 §原则描述/按钮级帮助` | `web-console/src/pages/RedemptionPage.tsx:112` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-066 | action | 操作完成后刷新受影响数据 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P1 §原则描述/按钮级帮助` | `web-console/src/pages/RedemptionPage.tsx:112` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-067 | action | 操作失败后不伪造成功状态 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P1 §原则描述/按钮级帮助` | `web-console/src/pages/RedemptionPage.tsx:112` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-068 | action | 复制类操作提供成功反馈 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P1 §原则描述/按钮级帮助` | `web-console/src/pages/RedemptionPage.tsx:112` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-069 | action | 下载类操作处理浏览器失败 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P1 §原则描述/按钮级帮助` | `web-console/src/pages/RedemptionPage.tsx:112` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-070 | action | 打开外部链接时执行安全的目标策略 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P1 §原则描述/按钮级帮助` | `web-console/src/pages/RedemptionPage.tsx:112` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-071 | action | 批量操作入口在无选择时给出提示 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P1 §原则描述/按钮级帮助` | `web-console/src/pages/RedemptionPage.tsx:112` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-072 | modal | 需要确认的操作展示二次确认 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-073 | modal | 确认内容说明受影响对象 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-074 | modal | 确认弹层提供取消入口 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-075 | modal | 弹层提交中显示进行中状态 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-076 | modal | 弹层错误可被用户识别 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-077 | modal | 关闭弹层不会提交操作 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-078 | modal | 批量操作先展示受影响数据预览 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-079 | modal | 批量操作后提供错误报告或明确不适用说明 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-080 | state | 首次进入页面有可识别初始状态 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P4 §原则描述` | `web-console/src/pages/RedemptionPage.tsx:130` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-081 | state | 数据加载中展示loading指示器 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P4 §原则描述` | `web-console/src/pages/RedemptionPage.tsx:130` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-082 | state | 空数据展示非空白空状态说明 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P4 §原则描述` | `web-console/src/pages/RedemptionPage.tsx:130` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-083 | state | API错误展示错误提示 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P4 §原则描述` | `web-console/src/pages/RedemptionPage.tsx:130` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-084 | state | API错误提供重试按钮 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P4 §原则描述` | `web-console/src/pages/RedemptionPage.tsx:130` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-085 | state | 权限不足展示权限提示 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P4 §原则描述` | `web-console/src/pages/RedemptionPage.tsx:130` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-086 | state | 网络断开有可理解反馈 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P4 §原则描述` | `web-console/src/pages/RedemptionPage.tsx:130` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-087 | state | 长时间操作展示进度或进行中提示 | `docs/PRODUCT-DESIGN-PRINCIPLES.md — P4 §原则描述` | `web-console/src/pages/RedemptionPage.tsx:130` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-088 | feedback | 成功操作展示明确toast或通知 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-089 | feedback | 失败操作展示明确错误反馈 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-090 | feedback | 重复提交不会产生重复成功反馈 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-091 | feedback | 刷新后反馈状态不会错误残留 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-092 | feedback | 错误信息不泄露敏感内部细节 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-093 | feedback | 可恢复错误提供恢复路径 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 未执行动态验证；不得以旧报告替代 |
| U1-094 | permission | 页面按角色权限限制访问 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |
| U1-095 | permission | 数据查询服务端执行当前用户范围校验 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |
| U1-096 | permission | 写操作服务端执行权限校验 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |
| U1-097 | permission | 越权对象ID不会返回对象数据 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |
| U1-098 | permission | 无权限操作不会改变数据 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |
| U1-099 | permission | 登录态失效时引导重新认证 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |
| U1-100 | permission | 权限变更后页面重新评估可用操作 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 未执行动态验证；不得以旧报告替代 |

## 页面状态矩阵

| 状态 | 单独核对断言 | 需求出处 | 实现证据 | 测试证据 | 状态 |
|---|---|---|---|---|---|
| 首次进入 | RedemptionPage 在“首次进入”状态有明确且可恢复的用户反馈 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | UNKNOWN | UNKNOWN | UNKNOWN |
| 加载中 | RedemptionPage 在“加载中”状态有明确且可恢复的用户反馈 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | UNKNOWN | UNKNOWN | UNKNOWN |
| 空数据 | RedemptionPage 在“空数据”状态有明确且可恢复的用户反馈 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | UNKNOWN | UNKNOWN | UNKNOWN |
| 正常数据 | RedemptionPage 在“正常数据”状态有明确且可恢复的用户反馈 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | UNKNOWN | UNKNOWN | UNKNOWN |
| API错误 | RedemptionPage 在“API错误”状态有明确且可恢复的用户反馈 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | UNKNOWN | UNKNOWN | UNKNOWN |
| 权限不足 | RedemptionPage 在“权限不足”状态有明确且可恢复的用户反馈 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | UNKNOWN | UNKNOWN | UNKNOWN |
| 网络断开 | RedemptionPage 在“网络断开”状态有明确且可恢复的用户反馈 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | UNKNOWN | UNKNOWN | UNKNOWN |
| 重试 | RedemptionPage 在“重试”状态有明确且可恢复的用户反馈 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | UNKNOWN | UNKNOWN | UNKNOWN |
| 提交中 | RedemptionPage 在“提交中”状态有明确且可恢复的用户反馈 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | UNKNOWN | UNKNOWN | UNKNOWN |
| 提交成功 | RedemptionPage 在“提交成功”状态有明确且可恢复的用户反馈 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | UNKNOWN | UNKNOWN | UNKNOWN |
| 提交失败 | RedemptionPage 在“提交失败”状态有明确且可恢复的用户反馈 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | UNKNOWN | UNKNOWN | UNKNOWN |
| 重复提交 | RedemptionPage 在“重复提交”状态有明确且可恢复的用户反馈 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | UNKNOWN | UNKNOWN | UNKNOWN |
| 刷新后 | RedemptionPage 在“刷新后”状态有明确且可恢复的用户反馈 | `docs/ref-2.2.8-redemption-invoices.md — §2 兑换码` | UNKNOWN | UNKNOWN | UNKNOWN |

## 操作入口矩阵

| ID | 入口文本/选择器 | 操作断言 | 按钮帮助 | 二次确认 | 权限 | 成功反馈 | 失败反馈 | 审计 | 测试 |
|---|---|---|---|---|---|---|---|---|---|
| U1-A01 | 源码中每个 button/link/tab/菜单/图标/提交入口（需逐项运行核验） | 每个入口执行其定义动作 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

## API / 数据 / 权限矩阵

| ID | 类型 | 单一断言 | 前端证据 | 后端证据 | DB证据 | 权限证据 | 测试证据 | 状态 |
|---|---|---|---|---|---|---|---|---|
| U1-M01 | API请求 | RedemptionPage 的API请求行为符合对应需求 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| U1-M02 | API错误码 | RedemptionPage 的API错误码行为符合对应需求 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| U1-M03 | 数据库字段 | RedemptionPage 的数据库字段行为符合对应需求 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| U1-M04 | 持久化 | RedemptionPage 的持久化行为符合对应需求 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| U1-M05 | 权限 | RedemptionPage 的权限行为符合对应需求 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| U1-M06 | 审计 | RedemptionPage 的审计行为符合对应需求 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| U1-M07 | 幂等 | RedemptionPage 的幂等行为符合对应需求 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| U1-M08 | 并发 | RedemptionPage 的并发行为符合对应需求 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| U1-M09 | 安全 | RedemptionPage 的安全行为符合对应需求 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| U1-M10 | 测试 | RedemptionPage 的测试行为符合对应需求 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

## 差距清单

| GAP ID | 原子项 ID | 差距描述 | 影响 | 优先级 | 建议 |
|---|---|---|---|---|---|
| GAP-RedemptionPage-001 | U1-001..U1-100 | 实现、测试、路由及后端/数据库证据尚未完成逐项动态核验 | 无法确认符合性 | P1 | 补充真实文件行号、测试名称和运行证据后复核 |
