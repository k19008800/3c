from pathlib import Path
import csv, re, json, hashlib
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
WORKSPACE = ROOT.parent
OUT = ROOT / 'audit' / '00-baseline'
OUT.mkdir(parents=True, exist_ok=True)
EXCLUDE = {'node_modules', '.git', '.claude', 'dist', '.next', 'coverage', 'test-results', 'playwright-report'}

def files(root, suffixes=None):
    if not root.exists(): return []
    result=[]
    for p in root.rglob('*'):
        if not p.is_file() or any(part in EXCLUDE for part in p.parts): continue
        if suffixes and p.suffix.lower() not in suffixes: continue
        result.append(p)
    return sorted(result)

def rel(p):
    try: return p.relative_to(ROOT).as_posix()
    except ValueError: return p.relative_to(WORKSPACE).as_posix()
def write_csv(name, headers, rows):
    with (OUT/name).open('w', newline='', encoding='utf-8-sig') as f:
        w=csv.writer(f); w.writerow(headers); w.writerows(rows)

def line_no(text, pos): return text.count('\n',0,pos)+1

# Requirements documents: docs are source inventory only; no interpretation here.
req_roots=[ROOT/'docs', WORKSPACE/'kb'/'3cloud']
req=[]
for base in req_roots:
    for p in files(base, {'.md','.mdx'}):
        text=p.read_text(encoding='utf-8', errors='replace')
        req.append([f'REQDOC-{len(req)+1:04d}', rel(p), len(text.splitlines()), hashlib.sha256(text.encode()).hexdigest()[:12]])
write_csv('requirements-inventory.csv',['doc_id','path','line_count','sha256_12'],req)

# Prototype HTML inventory.
protos=[]
for base in [WORKSPACE/'kb'/'3cloud'/'prototypes', ROOT/'prototypes']:
    for p in files(base, {'.html'}):
        text=p.read_text(encoding='utf-8', errors='replace')
        title=(re.search(r'<title[^>]*>(.*?)</title>',text,re.I|re.S) or [None,''])[1]
        protos.append([f'PROTO-{len(protos)+1:04d}',rel(p),re.sub(r'\s+',' ',title or '').strip(),len(re.findall(r'<button\b|<a\b|<input\b|<select\b|<form\b',text,re.I)),len(text.splitlines())])
write_csv('prototype-inventory.csv',['prototype_id','path','title','interactive_markup_count','line_count'],protos)

# Console and portal pages.
pages=[]
for base, kind, pattern in [(ROOT/'web-console'/'src'/'pages','console','*.tsx'),(ROOT/'web-portal'/'src'/'app','portal','page.tsx')]:
    for p in files(base,{'.tsx'}):
        if kind=='portal' and p.name!='page.tsx': continue
        text=p.read_text(encoding='utf-8', errors='replace')
        buttons=len(re.findall(r'<(?:button|a|input|select|textarea|form)\b',text))
        api_calls=len(re.findall(r'\bapi\.(?:get|post|put|patch|delete)\s*<',text))+len(re.findall(r'\bapi\.(?:get|post|put|patch|delete)\s*\(',text))
        helps=len(re.findall(r'HelpIcon|PageHelp|ButtonHelp|Tooltip',text))
        queries=len(re.findall(r'useQuery|useMutation',text))
        pages.append([f'PAGE-{len(pages)+1:04d}',kind,rel(p),len(text.splitlines()),buttons,api_calls,helps,queries])
write_csv('page-inventory.csv',['page_id','app','path','line_count','interactive_markup_count','api_call_count','help_marker_count','query_mutation_count'],pages)

# Route inventory: React routes and Next app routes.
routes=[]
app=ROOT/'web-console'/'src'/'App.tsx'
if app.exists():
    text=app.read_text(encoding='utf-8',errors='replace')
    for m in re.finditer(r'<Route\s+([^>]+)',text):
        chunk=m.group(1)
        path_m=re.search(r'path=["\']([^"\']+)',chunk)
        elem_m=re.search(r'(?:element|Component)=["\']?([^\s>]+)',chunk)
        routes.append([f'ROUTE-{len(routes)+1:04d}','react',rel(app),line_no(text,m.start()),path_m.group(1) if path_m else '',elem_m.group(1) if elem_m else '',chunk[:240]])
for p in files(ROOT/'web-portal'/'src'/'app',{'.tsx'}):
    if p.name!='page.tsx': continue
    parts=p.relative_to(ROOT/'web-portal'/'src'/'app').parts[:-1]
    path='/' + '/'.join(x for x in parts if not (x.startswith('(') and x.endswith(')')))
    routes.append([f'ROUTE-{len(routes)+1:04d}','next',rel(p),1,path or '/', 'page.tsx',''])
write_csv('route-inventory.csv',['route_id','router','source','line','route','target','raw'],routes)

# API endpoint registrations and frontend API call sites.
api=[]
method_pat=re.compile(r'\b(?:app|fastify)\.(get|post|put|patch|delete|options|head)\s*\(\s*["\']([^"\']+)')
for p in files(ROOT/'api'/'src'/'routes',{'.ts'}):
    text=p.read_text(encoding='utf-8',errors='replace')
    for m in method_pat.finditer(text): api.append([f'API-{len(api)+1:04d}',m.group(1).upper(),m.group(2),rel(p),line_no(text,m.start())])
write_csv('api-inventory.csv',['api_id','method','path','source','line'],api)

calls=[]
for base in [ROOT/'web-console'/'src',ROOT/'web-portal'/'src']:
    for p in files(base,{'.ts','.tsx'}):
        text=p.read_text(encoding='utf-8',errors='replace')
        for m in re.finditer(r'\bapi\.(get|post|put|patch|delete)\s*(?:<[^;\n]+?>)?\s*\(\s*["\'`]([^"\'`]+)',text):
            calls.append([f'CALL-{len(calls)+1:04d}',m.group(1).upper(),m.group(2),rel(p),line_no(text,m.start())])
        for m in re.finditer(r'fetch\s*\(\s*["\'`]([^"\'`]+)',text):
            calls.append([f'CALL-{len(calls)+1:04d}','FETCH',m.group(1),rel(p),line_no(text,m.start())])
write_csv('frontend-api-call-sites.csv',['call_id','method','path_or_expression','source','line'],calls)

# DB schema tables and migration files.
db=[]
for p in files(ROOT/'api'/'src'/'db'/'schema',{'.ts'}):
    text=p.read_text(encoding='utf-8',errors='replace')
    for m in re.finditer(r'\b(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*["\']([^"\']+)',text): db.append([f'DB-{len(db)+1:04d}','table',m.group(1),rel(p),line_no(text,m.start())])
for p in files(ROOT/'api'/'src'/'db'/'migrations',{'.sql'}):
    text=p.read_text(encoding='utf-8',errors='replace')
    db.append([f'DB-{len(db)+1:04d}','migration',p.name,rel(p),1])
write_csv('db-inventory.csv',['db_id','kind','name','source','line'],db)

# Test files and rough test counts; detailed test mapping is Phase 1+.
tests=[]
for base in [ROOT/'api',ROOT/'web-console',ROOT/'web-portal',ROOT/'e2e']:
    for p in files(base,{'.ts','.tsx','.js','.cjs'}):
        if not re.search(r'(\.test\.|\.spec\.|tests[\\/])',str(p)): continue
        text=p.read_text(encoding='utf-8',errors='replace')
        count=len(re.findall(r'\b(?:it|test)\s*\(',text))
        tests.append([f'TEST-{len(tests)+1:04d}',rel(p),count,len(text.splitlines())])
write_csv('test-inventory.csv',['test_id','path','rough_case_count','line_count'],tests)

# Baseline conflict report, generated from measured data and explicit source notes.
conf=[]
conf.append('# Phase 0 基线冲突与说明\n')
conf.append(f'- 生成时间：{datetime.now(timezone.utc).isoformat()}\n')
conf.append(f'- Console TSX 页面：{sum(1 for x in pages if x[1]=="console")}；Portal page.tsx：{sum(1 for x in pages if x[1]=="portal")}；React/Next 路由记录：{len(routes)}\n')
conf.append(f'- API 注册记录：{len(api)}；前端 API/FETCH 调用点：{len(calls)}；DB 表/迁移记录：{len(db)}；测试文件：{len(tests)}\n')
conf.append('\n## 已确认的基线冲突\n')
conf.append('1. 历史审计文档记录的页面、路由、测试数量与当前源码扫描数量不一致；本目录清单以当前源码扫描为准，历史数字仅作参考。\n')
conf.append('2. 历史审计曾声明“前端调用缺失端点为 0”，但该结论未替代本次原子级逐调用核对；本阶段只建立调用点清单，不提前判 PASS。\n')
conf.append('3. 部署清单/闸门文件的测试基线可能与当前实际测试基线不同；以最近一次命令输出和后续审计证据为准。\n')
conf.append('\n## 本阶段未判定事项\n')
conf.append('- 未判定任何需求是否满足。\n- 未判定任何 API 是否契约一致。\n- 未判定页面是否达到 100 个原子核对项；该项在 Phase 2 逐页生成。\n- 未判定权限、异常、并发、幂等、审计和部署是否合格。\n')
(OUT/'baseline-conflicts.md').write_text(''.join(conf),encoding='utf-8')

summary={'generated_at':datetime.now(timezone.utc).isoformat(),'requirements_docs':len(req),'prototypes':len(protos),'pages':{'console':sum(1 for x in pages if x[1]=='console'),'portal':sum(1 for x in pages if x[1]=='portal'),'total':len(pages)},'routes':len(routes),'api_registered':len(api),'frontend_call_sites':len(calls),'db_records':len(db),'test_files':len(tests)}
(OUT/'baseline-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False))
