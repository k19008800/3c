"""场景 3：管理员审核实名 + 审计日志"""
import json, urllib.request

BASE = 'http://localhost:3000'

def api(m, p, b=None, t=None):
    h = {'Content-Type': 'application/json'}
    if t: h['Authorization'] = f'Bearer {t}'
    d = json.dumps(b).encode() if b else None
    req = urllib.request.Request(f'{BASE}{p}', data=d, headers=h, method=m)
    try:
        return json.loads(urllib.request.urlopen(req).read())
    except urllib.request.HTTPError as e:
        body = e.read().decode()
        return {'_error': True, '_status': e.code, **json.loads(body)}

# 刷新 admin token
login = api('POST', '/api/v1/auth/login', {'email': 'admin@3cloud.dev', 'password': 'admin123'})
admin_t = login['data']['accessToken']
with open(r'C:\Users\ZH\AppData\Local\Temp\admin_token.txt', 'w') as f:
    f.write(admin_t)

print('【09:00】场景 3：管理员操作')
print('=' * 50)

# 3.1 查找待审核用户
print('\n3.1 待审核用户列表:')
users = api('GET', '/api/v1/admin/users?page=1&pageSize=50', t=admin_t)
for u in users['data']['list']:
    if u.get('realNameStatus') in ('pending_review', 'pending'):
        uid = u['id']
        email = u['email']
        st = u['status']
        rn = u.get('realName', '')
        rns = u['realNameStatus']
        print(f'  ID={uid}  email={email}  status={st}  realName={rn}  realNameStatus={rns}')

# 3.2 审核通过 sim-user-0800 的实名
# 先确认审核端点的路由名
print('\n3.2 尝试审核实名 ---')

# 尝试几个可能的审核端点
endpoints = [
    ('POST', '/api/v1/auth/real-name/review'),
    ('PATCH', '/api/v1/admin/users/39/real-name'),
    ('PATCH', '/api/v1/admin/users/real-name/39'),
]

for method, endpoint in endpoints:
    result = api(method, endpoint, {'action': 'approve'}, t=admin_t)
    if result.get('code') == 0:
        print(f'  OK {method} {endpoint} -> 成功: {json.dumps(result, ensure_ascii=False)}')
        break
    elif '_error' in result:
        print(f'  FAIL {method} {endpoint} -> {result.get("_status")}: {result.get("message")}')
    else:
        print(f'  ??? {method} {endpoint} -> {json.dumps(result, ensure_ascii=False)}')

print('\n======== 审计日志尝试 ========')
# 尝试审计日志端点
log_endpoints = [
    ('GET', '/api/v1/admin/audit-logs?page=1&pageSize=5'),
    ('GET', '/api/v1/admin/logs?page=1&pageSize=5'),
    ('GET', '/api/v1/logs?page=1&pageSize=5'),
]
for method, endpoint in log_endpoints:
    result = api(method, endpoint, t=admin_t)
    if result.get('code') == 0:
        print(f'  OK {endpoint} -> 成功')
        data = result.get('data', {})
        items = data.get('list', data.get('data', []))
        if items:
            for item in items[:5]:
                print(f'    {json.dumps(item, ensure_ascii=False)}')
        else:
            print(f'    (empty) {json.dumps(data, ensure_ascii=False, indent=2)[:300]}')
        break
    else:
        print(f'  FAIL {endpoint} -> {result.get("_status", "")}: {result.get("message", "")}')
