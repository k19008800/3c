"""
场景 11-16：日志查看 + 充值 + 团队 + 代理商 + 安全 + 偏好
"""
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
        try:
            return {'_error': True, '_status': e.code, **json.loads(body)}
        except:
            return {'_error': True, '_status': e.code, '_raw': body[:200]}

admin_t = open(r'C:\Users\ZH\AppData\Local\Temp\admin_token.txt').read().strip()
user_t = open(r'C:\Users\ZH\AppData\Local\Temp\sim_user_token.txt').read().strip()
api_key = open(r'C:\Users\ZH\AppData\Local\Temp\sim_apikey.txt').read().strip()

print('【11:00】场景 7：查看调用日志')
print('=' * 50)
logs = api('GET', '/api/v1/logs?page=1&pageSize=3', t=user_t)
if logs.get('code') == 0:
    items = logs.get('data', {}).get('list', [])
    print(f'  共 {logs["data"].get("total",0)} 条调用记录')
    for i, item in enumerate(items):
        print(f'  #{i+1}: model={item.get("modelName","")} vendor={item.get("vendorName","")}')
        print(f'        input={item.get("inputTokens","")} output={item.get("outputTokens","")}')
        print(f'        cost={item.get("costAmount","")} spend={item.get("sellAmount","")}')
        print(f'        duration={item.get("durationMs","")}ms')
else:
    print(f'  FAIL: {json.dumps(logs, ensure_ascii=False)[:200]}')

print()
print('【11:30】场景 8：余额流水')
print('=' * 50)
bal = api('GET', '/api/v1/logs/balance?page=1&pageSize=5', t=user_t)
if bal.get('code') == 0:
    items = bal.get('data', {}).get('list', [])
    print(f'  共 {bal["data"].get("total",0)} 条流水')
    for item in items:
        print(f'  {item.get("type","")}: {item.get("amount","")} (余额: {item.get("balanceAfter","")}) desc: {item.get("description","")}')
else:
    # 尝试其他路径
    print(f'  direct: {json.dumps(bal, ensure_ascii=False)[:200]}')

print()
print('【12:00】场景 9：在线充值下单')
print('=' * 50)
# 登录学思教育进行充值
edu_login = api('POST', '/api/v1/auth/login', {'email': 'client-edu-tech@3c.local', 'password': 'SimEduTest2026'})
if edu_login.get('code') == 0:
    edu_t = edu_login['data']['accessToken']
    print('  学思教育登录成功')
    # 下单充值
    recharge = api('POST', '/api/v1/recharge', {
        'amount': '100.00',
        'channel': 'wechat_scan',
        'description': '测试充值'
    }, t=edu_t)
    print(f'  充值下单: {json.dumps(recharge, ensure_ascii=False)[:300]}')
    
    if recharge.get('code') == 0:
        order_no = recharge['data'].get('orderNo', recharge['data'].get('order', {}).get('orderNo', ''))
        print(f'  订单号: {order_no}')
        
        # 模拟支付回调
        notify = api('POST', '/api/v1/recharge/notify', {
            'orderNo': order_no,
            'channelOrderNo': 'mock_' + order_no,
            'amount': '100.00'
        }, t=edu_t)
        print(f'  回调通知: {json.dumps(notify, ensure_ascii=False)[:200]}')
        
        # 查看余额变化
        me = api('GET', '/api/v1/auth/me', t=edu_t)
        print(f'  充值后余额: {me.get("data",{}).get("balance","?")}')
else:
    print(f'  学思教育登录失败: {json.dumps(edu_login, ensure_ascii=False)[:200]}')

print()
print('【13:00】场景 10：对公转账 + 审核')
print('=' * 50)
# 康健医疗提交对公转账
med_login = api('POST', '/api/v1/auth/login', {'email': 'client-med-consult@3c.local', 'password': 'SimMedTest2026'})
if med_login.get('code') == 0:
    med_t = med_login['data']['accessToken']
    print('  康健医疗登录成功')
    bt = api('POST', '/api/v1/recharge/bank-transfer', {
        'amount': '500.00',
        'payerBankName': '中国工商银行',
        'payerAccountNumber': '6222021234567890123',
        'payerName': '康健医疗采购部',
        'transferDate': '2026-06-29',
        'description': 'AI 服务预充值'
    }, t=med_t)
    print(f'  对公转账: {json.dumps(bt, ensure_ascii=False)[:300]}')
    
    if bt.get('code') == 0:
        bt_order_no = bt['data'].get('orderNo', bt['data'].get('order', {}).get('orderNo', ''))
        
        # 管理员审核
        print(f'\n  管理员审核对公转账:')
        confirm = api('POST', '/api/v1/admin/recharge/confirm', {
            'orderNo': bt_order_no,
            'status': 'approved'
        }, t=admin_t)
        print(f'  审核结果: {json.dumps(confirm, ensure_ascii=False)[:200]}')
else:
    print(f'  康健医疗登录失败: {json.dumps(med_login, ensure_ascii=False)[:200]}')

print()
print('【14:00】场景 11：团队管理')
print('=' * 50)
# 学思教育创建团队
if 'edu_t' in dir() or 'edu_t' in locals():
    team = api('POST', '/api/v1/team/create', {'name': 'AI研发部'}, t=edu_t)
    print(f'  创建团队: {json.dumps(team, ensure_ascii=False)[:200]}')
    
    if team.get('code') == 0:
        # 查看团队
        team_info = api('GET', '/api/v1/team', t=edu_t)
        print(f'  团队信息: {json.dumps(team_info, ensure_ascii=False)[:300]}')

print()
print('【15:00】场景 12：代理商佣金 + 提现')
print('=' * 50)
# 登录代理商
agent_login = api('POST', '/api/v1/auth/login', {'email': '13819008800@163.com', 'password': 'SimAgentTest2026'})
if agent_login.get('code') == 0:
    agent_t = agent_login['data']['accessToken']
    print('  代理商登录成功')
    
    # 查看面板
    dash = api('GET', '/api/v1/agent/dashboard', t=agent_t)
    print(f'  面板: {json.dumps(dash, ensure_ascii=False)[:400]}')
    
    # 查看客户列表
    clients = api('GET', '/api/v1/agent/clients', t=agent_t)
    print(f'  客户: {json.dumps(clients, ensure_ascii=False)[:300]}')
    
    # 查看佣金历史
    comm = api('GET', '/api/v1/agent/commissions', t=agent_t)
    print(f'  佣金: {json.dumps(comm, ensure_ascii=False)[:300]}')
else:
    print(f'  代理商登录失败: {json.dumps(agent_login, ensure_ascii=False)[:200]}')

print()
print('【16:00】场景 14-15：安全场景')
print('=' * 50)
# 模拟多次错误登录（触发风控）
for i in range(6):
    fail = api('POST', '/api/v1/auth/login', {'email': 'sim-user-0800@test.local', 'password': 'wrongpass' + str(i)})
    print(f'  错误登录 #{i+1}: status={fail.get("_status",fail.get("statusCode","?"))} msg={fail.get("message","")[:50]}')

# 查看管理员安全日志
print('\n  查看安全日志:')
sec = api('GET', '/api/v1/admin/security/audit?page=1&pageSize=3', t=admin_t)
print(f'  {json.dumps(sec, ensure_ascii=False)[:400]}')

# 偏好设置
print()
print('【17:00】场景 16：偏好设置 + 通知')
print('=' * 50)
pref = api('POST', '/api/v1/preferences', {
    'preferredModels': ['gpt-4o', 'deepseek-chat'],
    'notifyOnBalance': True,
    'balanceThreshold': '10.00'
}, t=user_t)
print(f'  偏好设置: {json.dumps(pref, ensure_ascii=False)[:300]}')

# 查看通知（如果有）
notif = api('GET', '/api/v1/notifications?page=1&pageSize=3', t=user_t)
print(f'  通知: {json.dumps(notif, ensure_ascii=False)[:300]}')

print()
print('【场景结束】--- 管理员 Dashboard 巡检 ---')
dash = api('GET', '/api/v1/admin/dashboard/overview', t=admin_t)
print(f'  {json.dumps(dash, ensure_ascii=False)[:300]}')

# 提现审核（如果有待审核的）
withdraws = api('GET', '/api/v1/admin/withdraws?status=pending_first_review&page=1&pageSize=5', t=admin_t)
print(f'  待审提现: {json.dumps(withdraws, ensure_ascii=False)[:300]}')
