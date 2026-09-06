import csv,re
from pathlib import Path
root=Path(__file__).parents[2]
files=['PRD-管理后台.md','PRD-概览与运营模型.md','PRD-客服支撑模块.md','PRD-系统管理员支撑.md','PRD-运营增长模块.md','PRD-第三方集成.md','PRD-非功能需求.md','PRD-组件库规范.md','SPEC-§4-管理后台.md','SPEC-§8-运营增长模块.md','SPEC-§10-客服支撑模块.md','SPEC-§12-系统管理员支撑.md','SPEC-§13-数据迁移方案.md','SPEC-§14-错误码规范.md','SPEC-§15-前端组件库规范.md','SPEC-§16-第三方集成.md','SPEC-§23-系统级能力增强.md','SPEC-§28-智能客服与测试工具.md','SPEC-§30-权限管理.md','SPEC-§32-第三方集成与SSO.md','SPEC-§33-合规法务与成本分析.md','SPEC-§7-非功能需求.md','SPEC-§21-Portal门户增强.md','SPEC-§6-Portal门户.md','ref-4.1-admin-dashboard.md','ref-4.10-user-segmentation.md','ref-4.11-ticketing.md','ref-4.12-dashboard-pro.md','ref-4.13-operation-timeline.md','ref-4.14-report-push.md']
fields=['req_id','domain','source_path','source_section','source_quote','category','priority','atomic_assertion','expected_evidence','notes']
def category(q):
 m=[('permission',['权限','角色','仅','operator','USER_']),('api',['API','接口','/api/','方法','路径','HTTP']),('concurrency',['并发','同时','冲突','锁']),('idempotency',['幂等','重复']),('rollback',['回滚','恢复']),('transaction',['事务','提交']),('audit',['审计','日志','记录']),('db',['缓存','Redis','CDN']),('exception',['错误','失败','异常','不可用','超时']),('state',['状态','启用','禁用','发布','下线']),('page',['按钮','页面','入口','展示','面板','路由']),('performance',['性能','延迟','P99','QPS','TPS','可用率','并发量']),('field',['字段','输入','金额','名称','时间','邮箱','URL']),('test',['测试','验收','验证']),('security',['安全','加密','脱敏','合规','密钥','白名单'])]
 for c,terms in m:
  if any(t in q for t in terms): return c
 return 'logic'
def domain(fn):
 for key,val in [('客服','customer-support'),('ticket','customer-support'),('运营','growth-operations'),('增长','growth-operations'),('segment','growth-operations'),('report-push','growth-operations'),('第三方','integrations-sso'),('SSO','integrations-sso'),('Portal','portal'),('portal','portal'),('系统管理员','system-admin'),('§12','system-admin'),('非功能','non-functional'),('§7','non-functional'),('权限','authorization'),('§30','authorization')]:
  if key in fn:return val
 return 'admin-portal'
rows=[];n=1
for fn in files:
 p=root/'docs'/fn
 if not p.exists():continue
 sec='(document)'
 for line in p.read_text(encoding='utf-8-sig').splitlines():
  s=line.strip()
  if not s:continue
  if re.match(r'^#{1,4} ',s):sec=s.lstrip('#').strip();continue
  if not (s.startswith(('-', '*')) or s.startswith('|')) or s.startswith('|---') or re.fullmatch(r'[| :\-]+',s):continue
  for part in [x.strip() for x in re.split(r'[；;]',s) if x.strip()]:
   if len(part.strip('| -*'))<4:continue
   c=category(part); pri='P0' if ('P0' in part or 'SPEC-§4' in fn) else ('P2' if 'P2' in part else ('P1' if 'P1' in part else 'P1'))
   rows.append([f'REQ-ADMINPORTAL-{n:05d}',domain(fn),'docs/'+fn,sec,part,c,pri,'需求规定：'+part.strip('|').strip(),'源码路径+测试用例/运行验证（本阶段仅登记证据要求）','未判定实现状态；不得复用旧审计结论']);n+=1
for fn in files:
 for dim,c in [('输入','field'),('前置','logic'),('角色','permission'),('权限','permission'),('状态','state'),('正常','logic'),('边界','boundary'),('异常','exception'),('并发','concurrency'),('幂等','idempotency'),('事务','transaction'),('回滚','rollback'),('落库','db'),('缓存','db'),('通知','logic'),('审计','audit'),('监控','performance'),('测试','test')]:
  rows.append([f'REQ-ADMINPORTAL-{n:05d}',domain(fn),'docs/'+fn,'原子审计维度覆盖',f'{dim}维度应有独立可验证需求断言',c,'P0' if dim in ('权限','异常','审计','测试') else 'P1',f'该需求域必须单独定义并验证“{dim}”维度。','对应源码路径、测试名称或动态验证输出；若需求未定义则记录N/A及依据','维度覆盖登记，不代表需求文档已有该断言']);n+=1
out=root/'audit/01-requirements/admin-portal-atomic.csv';out.parent.mkdir(parents=True,exist_ok=True)
with out.open('w',encoding='utf-8-sig',newline='') as f:csv.writer(f).writerows([fields]+rows)
notes=f'''# 管理后台与 Portal 原子需求审计说明\n\n- 审计范围：指定的管理后台、Portal、系统管理员、客服、营销增长、权限、第三方集成、非功能及参考文档。\n- 产出：`admin-portal-atomic.csv`，共 **{len(rows)}** 条原子项（含每个来源文档的 18 个维度覆盖登记）。\n- 每行仅登记一个可独立验证断言，保留来源路径、章节和原文摘录；未对代码作 PASS/FAIL 判断。\n- 实现核对必须具备源码路径/行号与测试或动态验证证据；否则标记 UNKNOWN。旧审计报告不作为证据。\n- 输入、前置、角色、权限、状态、正常、边界、异常、并发、幂等、事务、回滚、落库、缓存、通知、审计、监控、测试均单独登记；未定义项后续标记 N/A 并引用依据。\n- 页面标题旁页面级 `[?]` 与每个操作入口旁按钮级 `[?]` 是独立需求核查项。\n'''
(root/'audit/01-requirements/admin-portal-notes.md').write_text(notes,encoding='utf-8')
print(len(rows))
