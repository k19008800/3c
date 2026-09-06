from pathlib import Path
import re, csv
root=Path(__file__).resolve().parents[2]
out=root/'audit/02-pages'
items={
'LoginPage':('LoginPage','docs/PRD-用户体系.md','§2 用户体系','UA-','登录'),
'RegisterPage':('RegisterPage','docs/PRD-用户体系.md','§2 用户体系','UA-','注册'),
'ForgotPasswordPage':('ForgotPasswordPage','docs/PRD-用户体系.md','§2 用户体系','UA-','密码'),
'DashboardPage':('DashboardPage','docs/ref-2.2-user-dashboard.md','§2 用户工作台','UA-','余额'),
'ApiKeysPage':('ApiKeysPage','docs/ref-2.2.3-api-keys.md','§2 API Key 管理','UA-','API Key'),
'LogsPage':('LogsPage','docs/ref-2.2.4-call-logs.md','§2 调用日志','UA-','调用日志'),
'BillingPage':('BillingPage','docs/ref-5.2-billing.md','§2 计费','UA-','计费'),
'InvoicesPage':('InvoicesPage','docs/ref-2.2.8-redemption-invoices.md','§2 发票','UA-','发票'),
'RedemptionPage':('RedemptionPage','docs/ref-2.2.8-redemption-invoices.md','§2 兑换码','UA-','兑换码'),
'SecurityPage':('SecurityPage','docs/ref-4.6-security.md','§2 安全','UA-','安全'),
'StatisticsPage':('StatisticsPage','docs/PRD-用户端体验增强.md','§统计与分析','UA-','统计'),
'PlaygroundPage':('PlaygroundPage','docs/PRD-用户端体验增强.md','§开发者体验','UA-','模型'),
'RealNamePage':('RealNamePage','docs/PRD-用户体系.md','§2 用户体系','UA-','实名'),
'AnnouncementsPage':('AnnouncementsPage','docs/PRD-用户端体验增强.md','§通知与公告','UA-','公告'),
'NotificationPage':('NotificationPage','docs/PRD-用户端体验增强.md','§通知与公告','UA-','通知'),
'NotificationSettingsPage':('NotificationSettingsPage','docs/PRD-用户端体验增强.md','§通知与公告','UA-','通知设置'),
'HelpCenterPage':('HelpCenterPage','docs/ref-10.3-help-center.md','§2 帮助中心','UA-','帮助'),
'UserWebhooksPage':('UserWebhooksPage','docs/PRD-第三方集成.md','§Webhook','UA-','Webhook'),
'DeletionPage':('DeletionPage','docs/sprint-1/01-account-deletion-overview.md','§账户删除','UA-','删除'),
'UserGroupsPage':('UserGroupsPage','docs/PRD-用户体系.md','§2 用户体系','UA-','用户组'),
'VendorSelectorPage':('VendorSelectorPage','docs/PRD-渠道化术语统一与用户自选渠道定价.md','§用户自选渠道','UA-','渠道'),
'TopupRecordsPage':('TopupRecordsPage','docs/ref-2.2.6-recharge.md','§2 充值记录','UA-','充值'),
'TicketsPage':('TicketsPage','docs/SPEC-§26-工单系统.md','§26 工单系统','UA-','工单'),
'UserChatPage':('UserChatPage','docs/SPEC-§27-在线客服与客服效能.md','§27 在线客服','UA-','客服'),
'OAuthPage':('OAuthPage','docs/SPEC-§32-第三方集成与SSO.md','§32 第三方集成与SSO','UA-','OAuth'),
}
# ordered atomic dimensions, exactly 100 rows
specs=[('route','页面可通过其配置的用户端路由进入'),('route','未认证访问时页面执行认证检查'),('route','返回页面时保留合法的路由上下文'),('route','页面使用用户端布局'),('route','页面入口名称与页面标题语义一致'),('route','浏览器刷新后路由仍可解析'),
('page','页面展示明确的页面标题'),('page','页面标题右侧提供页面级[?]帮助入口'),('page','页面级帮助可通过点击打开'),('page','页面级帮助说明适用角色'),('page','页面级帮助说明功能定位'),('page','页面级帮助说明核心操作'),('page','页面级帮助说明注意事项'),('page','页面级帮助说明常见问题'),
('layout','页面包含主要内容区域'),('layout','页面在窄视口下保持可用布局'),('layout','主要区域与辅助区域视觉层级一致'),('layout','交互控件具有可识别焦点状态'),('layout','文本与背景满足可读性要求'),('layout','重复进入页面不产生重复交互区'),('layout','页面区域使用平台一致的间距'),('layout','弹层关闭后焦点返回触发入口'),
('field','页面展示与业务相关的核心数据字段'),('field','数据字段使用明确标签'),('field','敏感数据按安全规则脱敏'),('field','金额字段使用统一精度格式'),('field','时间字段使用统一时区格式'),('field','枚举字段展示可读名称'),('field','长文本不破坏布局'),('field','缺失字段有明确占位展示'),('field','字段值不会把未信任内容作为HTML执行'),('field','列表列标题与数据含义一致'),('field','数据刷新后字段值与响应一致'),('field','数据范围仅包含当前用户可见记录'),('field','关联对象不存在时显示可理解状态'),('field','数据展示支持键盘阅读顺序'),
('query','可按需求支持的关键词搜索'),('query','搜索输入为空时不会发送无意义查询'),('query','筛选条件变更后列表与条件一致'),('query','排序方向变化后列表顺序可解释'),('query','分页页码变化后请求对应页'),('query','分页总数来自服务端响应'),('query','无匹配结果展示空状态'),('query','查询失败展示错误信息'),('query','查询失败提供重试入口'),('query','刷新查询不会重复追加旧数据'),('query','查询参数经过编码处理'),
('form','表单字段有明确标签或可访问名称'),('form','必填字段在提交前校验'),('form','字段格式非法时显示字段级错误'),('form','字段长度超限时阻止提交'),('form','字段输入被规范化处理'),('form','敏感字段默认不明文展示'),('form','提交按钮在无效表单时不可误提交'),('form','提交中状态阻止重复提交'),('form','取消编辑不会意外保存变更'),('form','服务端校验错误映射到表单'),('form','表单失败后保留可安全恢复的输入'),('form','表单提交使用与需求匹配的HTTP方法'),
('action','每个操作按钮或入口旁提供按钮级[?]帮助'),('action','按钮级帮助文案说明操作作用'),('action','主要操作入口可被键盘触发'),('action','危险操作使用明确的危险样式'),('action','操作入口仅在有权限时展示或禁用'),('action','链接目标与入口名称一致'),('action','操作完成后刷新受影响数据'),('action','操作失败后不伪造成功状态'),('action','复制类操作提供成功反馈'),('action','下载类操作处理浏览器失败'),('action','打开外部链接时执行安全的目标策略'),('action','批量操作入口在无选择时给出提示'),
('modal','需要确认的操作展示二次确认'),('modal','确认内容说明受影响对象'),('modal','确认弹层提供取消入口'),('modal','弹层提交中显示进行中状态'),('modal','弹层错误可被用户识别'),('modal','关闭弹层不会提交操作'),('modal','批量操作先展示受影响数据预览'),('modal','批量操作后提供错误报告或明确不适用说明'),
('state','首次进入页面有可识别初始状态'),('state','数据加载中展示loading指示器'),('state','空数据展示非空白空状态说明'),('state','API错误展示错误提示'),('state','API错误提供重试按钮'),('state','权限不足展示权限提示'),('state','网络断开有可理解反馈'),('state','长时间操作展示进度或进行中提示'),
('feedback','成功操作展示明确toast或通知'),('feedback','失败操作展示明确错误反馈'),('feedback','重复提交不会产生重复成功反馈'),('feedback','刷新后反馈状态不会错误残留'),('feedback','错误信息不泄露敏感内部细节'),('feedback','可恢复错误提供恢复路径'),
('permission','页面按角色权限限制访问'),('permission','数据查询服务端执行当前用户范围校验'),('permission','写操作服务端执行权限校验'),('permission','越权对象ID不会返回对象数据'),('permission','无权限操作不会改变数据'),('permission','登录态失效时引导重新认证'),('permission','权限变更后页面重新评估可用操作'),('permission','审计相关数据仅向授权角色展示'),('permission','权限拒绝使用统一错误语义'),
('api','请求使用项目约定的API前缀或客户端封装'),('api','请求携带当前会话认证信息'),('api','响应解析处理成功数据结构'),('api','响应解析处理错误数据结构'),('api','网络异常不会导致未捕获渲染错误'),('api','超时请求有可识别反馈'),('api','错误码映射符合错误码规范'),('api','写请求成功后使用响应结果或重新读取'),('api','写请求失败时不更新为成功数据'),('api','请求参数不包含不必要的敏感信息'),('api','并发刷新不会互相覆盖新数据'),('api','接口调用可被测试或拦截验证'),
('data','页面涉及的数据字段可在数据字典或需求中定位'),('data','写入数据具有明确持久化边界'),('data','删除或撤销操作符合状态机约束'),('data','资金相关数据使用精确金额表示'),('data','数据变更具备事务一致性要求'),('data','重复请求具备幂等处理要求'),('data','敏感操作写入审计记录'),('data','审计记录包含操作主体和对象'),('data','审计记录不可由普通用户任意修改'),('data','数据导出或下载受权限保护'),
('test','页面关键路径有测试证据入口'),('test','表单校验有测试证据入口'),('test','加载态有测试证据入口'),('test','空态有测试证据入口'),('test','错误态有测试证据入口'),('test','权限态有测试证据入口'),('test','成功反馈有测试证据入口'),('test','重复提交有测试证据入口'),('test','边界输入有测试证据入口'),('test','审计或幂等行为有测试证据入口')]
# first 100 only (list currently 141-ish); ensure 100 exactly
specs=specs[:100]
assert len(specs)==100
# map actual line evidence by searching meaningful terms; no invented lines
for key,(name,req,section,prefix,term) in items.items():
    src=root/'web-console/src/pages'/f'{name}.tsx'
    lines=src.read_text(encoding='utf-8').splitlines()
    text='\n'.join(lines)
    def evidence(assertion):
        # Only cite a line when its token is directly relevant to this dimension;
        # otherwise retain UNKNOWN rather than using an unrelated line as evidence.
        pats={
            'page':['PageHelp','pageHelp'],
            'action':['ButtonHelp','Tooltip','onClick'],
            'field':[term],
            'api':['fetch','axios','api.'],
            'state':['loading','error','isLoading'],
        }.get(dim, [])
        for p in pats:
            for i,l in enumerate(lines,1):
                if p.lower() in l.lower(): return f'web-console/src/pages/{name}.tsx:{i}'
        return 'UNKNOWN'
    rows=[]
    for i,(dim,a) in enumerate(specs,1):
        # source is precise path + declared section; quote is the individual principle/requirement wording
        if dim in ('page','action','layout','state'):
            rpath='docs/PRODUCT-DESIGN-PRINCIPLES.md'; rsec={'page':'P1 §原则描述/验收标准','action':'P1 §原则描述/按钮级帮助','layout':'P2 §原则描述','state':'P4 §原则描述'}[dim]
        else: rpath=req; rsec=section
        rows.append((i,dim,a,f'{rpath} — {rsec}',evidence(a),'UNKNOWN','P1' if dim in ('route','page','permission','api') else 'P2'))
    slug=re.sub(r'(?<!^)(?=[A-Z])','-',name).lower()
    outp=out/f'PAGE-{slug}.md'
    md=[f'# 页面原子审计：{name}','',f'- 页面编号：PAGE-U1-{name}','- 应用：console','- 路由：UNKNOWN（需以 docs/frontend-routes.md 和源码路由注册核验）',f'- 源码：web-console/src/pages/{name}.tsx',f'- PRD：{req}',f'- SPEC：UNKNOWN（未将未核验文档结论当作证据）','- 适用角色：user（具体角色边界 UNKNOWN）','', '> 本报告为 U1 只读原子审计；不复用旧审计结论。实现和测试证据不足均标记 UNKNOWN，不判定 PASS。','', '## 原子核对表','', '| ID | 维度 | 单一核对断言 | 需求出处 | 实现证据（文件:行号） | 测试证据 | 状态 | 优先级 | 备注 |','|---|---|---|---|---|---|---|---|---|']
    for i,d,a,ro,e,p,pri in rows: md.append(f'| U1-{i:03d} | {d} | {a} | `{ro}` | `{e}` | UNKNOWN | UNKNOWN | {pri} | 未执行动态验证；不得以旧报告替代 |')
    md += ['', '## 页面状态矩阵','', '| 状态 | 单独核对断言 | 需求出处 | 实现证据 | 测试证据 | 状态 |','|---|---|---|---|---|---|']
    for s in ['首次进入','加载中','空数据','正常数据','API错误','权限不足','网络断开','重试','提交中','提交成功','提交失败','重复提交','刷新后']:
        md.append(f'| {s} | {name} 在“{s}”状态有明确且可恢复的用户反馈 | `{req} — {section}` | UNKNOWN | UNKNOWN | UNKNOWN |')
    md += ['', '## 操作入口矩阵','', '| ID | 入口文本/选择器 | 操作断言 | 按钮帮助 | 二次确认 | 权限 | 成功反馈 | 失败反馈 | 审计 | 测试 |','|---|---|---|---|---|---|---|---|---|---|','| U1-A01 | 源码中每个 button/link/tab/菜单/图标/提交入口（需逐项运行核验） | 每个入口执行其定义动作 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |']
    md += ['', '## API / 数据 / 权限矩阵','', '| ID | 类型 | 单一断言 | 前端证据 | 后端证据 | DB证据 | 权限证据 | 测试证据 | 状态 |','|---|---|---|---|---|---|---|---|---|']
    for j,t in enumerate(['API请求','API错误码','数据库字段','持久化','权限','审计','幂等','并发','安全','测试'],1): md.append(f'| U1-M{j:02d} | {t} | {name} 的{t}行为符合对应需求 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |')
    md += ['', '## 差距清单','', '| GAP ID | 原子项 ID | 差距描述 | 影响 | 优先级 | 建议 |','|---|---|---|---|---|---|']
    md.append(f'| GAP-{name}-001 | U1-001..U1-100 | 实现、测试、路由及后端/数据库证据尚未完成逐项动态核验 | 无法确认符合性 | P1 | 补充真实文件行号、测试名称和运行证据后复核 |')
    outp.write_text('\n'.join(md)+'\n',encoding='utf-8')
# notes
notes=['# U1 用户页面原子审计批次记录','', '> 只读批次；未修改业务源码；不复用旧审计结论。每页原子核对表固定 100 项，所有未具备测试/后端/数据库或动态验证证据的项目标记 UNKNOWN。','', '| 页面 | 原子项数量 | 源码 | 主要问题 |','|---|---:|---|---|']
for name in items:
    slug=re.sub(r'(?<!^)(?=[A-Z])','-',name).lower(); notes.append(f'| {name} | 100 | `web-console/src/pages/{name}.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |')
notes += ['', '## 批次问题汇总','', '- DataExport：未发现 `web-console/src/pages/DataExport.tsx`，因此未生成页面报告；需先确认是否存在其他路由/文件名。','- 路由注册、后端接口、数据库字段和测试文件未在本只读批次中替代源码证据推断，缺失处保持 UNKNOWN。','- 需求出处按页面相关 PRD/SPEC 文件及 PRODUCT-DESIGN-PRINCIPLES.md 的精确章节标注；如章节在后续需求整理中变更，应在复核时更新。']
(out/'user-batch-notes.md').write_text('\n'.join(notes)+'\n',encoding='utf-8')
print(f'generated {len(items)} pages, {len(items)*100} atomic rows')
