"""Final scenarios: correct paths"""
import json, urllib.request

BASE = 'http://localhost:3000'
def api(m, p, b=None, t=None):
    h = {'Content-Type': 'application/json'}
    if t: h['Authorization'] = 'Bearer ' + t
    d = json.dumps(b).encode() if b else None
    req = urllib.request.Request(BASE + p, data=d, headers=h, method=m)
    try:
        return json.loads(urllib.request.urlopen(req).read())
    except urllib.request.HTTPError as e:
        body = e.read().decode()
        return {'_error': True, '_status': e.code, **json.loads(body)}

admin_t = open(r'C:\Users\ZH\AppData\Local\Temp\admin_token.txt').read().strip()

# 1. 余额流水 (balance_logs endpoint)
print('=== 余额流水 ===')
bl = api('GET', '/api/v1/balance-logs?page=1&pageSize=3', t=admin_t)
if bl.get('code') == 0:
    items = bl.get('data', {}).get('list', [])
    for item in items[:3]:
        t = item.get('type', '')
        a = item.get('amount', '')
        ba = item.get('balanceAfter', '')
        d = item.get('description', '')[:60]
        print(f'  {t}: {a} (remain: {ba}) desc: {d}')
else:
    print(f'  {json.dumps(bl, ensure_ascii=False)[:200]}')

# 2. Create team
print()
print('=== 创建团队 ===')
edu = api('POST', '/api/v1/auth/login', {'email': 'client-edu-tech@3c.local', 'password': 'SimEduTest2026'})
if edu.get('code') == 0:
    et = edu['data']['accessToken']
    tm = api('POST', '/api/v1/team', {'name': 'AI研发部'}, t=et)
    print(f'  create: {json.dumps(tm, ensure_ascii=False)[:200]}')
    # View team
    tv = api('GET', '/api/v1/team', t=et)
    print(f'  view: {json.dumps(tv, ensure_ascii=False)[:300]}')
else:
    print(f'  edu login fail')

# 3. Admin Dashboard
print()
print('=== Admin Dashboard ===')
dash = api('GET', '/api/v1/admin/dashboard', t=admin_t)
print(f'  {json.dumps(dash, ensure_ascii=False)[:400]}')

# 4. 查看系统配置 (确认数据留存)
print()
print('=== 关键系统配置 ===')
configs = api('GET', '/api/v1/admin/configs', t=admin_t)
if configs.get('code') == 0:
    keys_of_interest = ['pricing_multiplier', 'commission_settle_mode', 'rate_limit_personal_rpm',
                        'rate_limit_personal_tpm', 'trial_token_quota', 'enterprise_discount_rate']
    for c in configs['data']['list']:
        if c['key'] in keys_of_interest:
            print(f'  {c["key"]} = {c["value"]}')

# 5. 通知查看
print()
print('=== 通知 ===')
notif = api('GET', '/api/v1/notifications?page=1&pageSize=3', t=admin_t)
print(f'  {json.dumps(notif, ensure_ascii=False)[:200]}')

# 6. 偏好设置
print()
print('=== 偏好设置 ===')
user_t = open(r'C:\Users\ZH\AppData\Local\Temp\sim_user_token.txt').read().strip()
pref = api('POST', '/api/v1/preferences', {
    'preferredModels': ['gpt-4o', 'deepseek-chat'],
    'notifyOnBalance': True,
    'balanceThreshold': '10.00'
}, t=user_t)
print(f'  {json.dumps(pref, ensure_ascii=False)[:200]}')

# 7. 安全审计
print()
print('=== 审计日志 (近5条) ===')
audit = api('GET', '/api/v1/admin/audit-logs?page=1&pageSize=5', t=admin_t)
if audit.get('code') == 0:
    for item in audit['data']['list']:
        a = item.get('action', '')
        tt = item.get('targetType', '')
        ti = item.get('targetId', '')
        desc = item.get('description', '')[:60]
        print(f'  [{a}] {tt}:{ti} - {desc}')

# 8. Agent 提现申请
print()
print('=== 代理商提现 ===')
agent = api('POST', '/api/v1/auth/login', {'email': '13819008800@163.com', 'password': 'SimAgentTest2026'})
if agent.get('code') == 0:
    at = agent['data']['accessToken']
    wd = api('POST', '/api/v1/agent/withdraw', {
        'amount': '50.00',
        'bankCardNo': '62222456745679900111',
        'bankName': '中国建设银行',
        'accountName': '张三'
    }, t=at)
    print(f'  提现申请: {json.dumps(wd, ensure_ascii=False)[:300]}')

    # 查看提现记录
    wds = api('GET', '/api/v1/agent/withdraws', t=at)
    print(f'  提现记录: {json.dumps(wds, ensure_ascii=False)[:300]}')
else:
    print(f'  agent login fail')

print()
print('=== 仿真测试完成 ===')
print(f'时间: 2026-06-29 08:00 ~ 17:00 (模拟)')
print(f'共执行 14+ 个业务场景')
