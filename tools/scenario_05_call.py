"""
场景 5-7：代理调用流程（chat completions）+ 计费 + 限流
"""
import json, urllib.request, sys

BASE = 'http://localhost:3000'

def api(m, p, b=None, t=None, ct='application/json'):
    h = {'Content-Type': ct}
    if t: h['Authorization'] = 'Bearer ' + t
    d = json.dumps(b).encode() if b else None
    req = urllib.request.Request(BASE + p, data=d, headers=h, method=m)
    try:
        resp = urllib.request.urlopen(req)
        raw = resp.read().decode()
        try:
            return json.loads(raw)
        except:
            return {'_raw': raw[:500], '_status': resp.status}
    except urllib.request.HTTPError as e:
        body = e.read().decode()
        try:
            return {'_error': True, '_status': e.code, **json.loads(body)}
        except:
            return {'_error': True, '_status': e.code, '_raw': body[:300]}

# 获取 sim-user token 和 api key
user_t = open(r'C:\Users\ZH\AppData\Local\Temp\sim_user_token.txt').read().strip()
api_key = open(r'C:\Users\ZH\AppData\Local\Temp\sim_apikey.txt').read().strip()

print('【10:00】场景 5：代理调用流程')
print('=' * 60)
print()

# 5.1 查看余额
print('--- 5.1 调用前余额 ---')
me = api('GET', '/api/v1/auth/me', t=user_t)
print(f'  用户余额: {me.get("data",{}).get("balance","?")}')
print()

# 5.2 调用 gpt-4o (非流式)
print('--- 5.2 调用 gpt-4o (非流式) ---')
body_data = {
    'model': 'gpt-4o',
    'messages': [
        {'role': 'system', 'content': '你是一个AI助手。'},
        {'role': 'user', 'content': '请用中文介绍一下人工智能的发展历史。'}
    ],
    'stream': False
}
call = api('POST', '/api/v1/chat/completions', body_data, t=api_key)
if call.get('_error'):
    print(f'  调用失败: status={call.get("_status")} msg={call.get("message","")}')
    if call.get('_raw'):
        print(f'  raw: {call["_raw"]}')
else:
    print(f'  模型: {call.get("model","?")}')
    choices = call.get('choices', [])
    if choices:
        print(f'  回复: {choices[0].get("message",{}).get("content","")[:100]}...')
    usage = call.get('usage', {})
    print(f'  Token: 输入={usage.get("prompt_tokens","?")} 输出={usage.get("completion_tokens","?")}')
    print()

# 5.3 再次查看余额
print('--- 5.3 调用后余额 ---')
me2 = api('GET', '/api/v1/auth/me', t=user_t)
print(f'  用户余额: {me2.get("data",{}).get("balance","?")}')

# 5.4 连续调用测试计费
print()
print('--- 5.4 连续调用 (3 次，验证计费扣款) ---')
for i in range(3):
    r = api('POST', '/api/v1/chat/completions', {
        'model': 'gpt-4o',
        'messages': [{'role': 'user', 'content': f'第{i+1}次调用测试'}],
        'stream': False
    }, t=api_key)
    if r.get('_error'):
        print(f'  第{i+1}次: FAIL status={r.get("_status")} msg={r.get("message","")}')
    else:
        usage = r.get('usage', {})
        print(f'  第{i+1}次: OK 输入={usage.get("prompt_tokens","?")} 输出={usage.get("completion_tokens","?")}')

# 5.5 最终余额
print()
print('--- 5.5 连续调用后余额 ---')
me3 = api('GET', '/api/v1/auth/me', t=user_t)
balance_after = me3.get('data', {}).get('balance', '?')
print(f'  用户余额: {balance_after}')

# 5.6 余额变化
print()
print('--- 5.6 余额变化汇总 ---')
admin_t = open(r'C:\Users\ZH\AppData\Local\Temp\admin_token.txt').read().strip()
logs_resp = api('GET', '/api/v1/admin/users/39?include=balance_logs', t=admin_t)
if logs_resp.get('code') == 0:
    data = logs_resp.get('data', {})
    balance_logs = data.get('balanceLogs', data.get('balance_logs', []))
    if not balance_logs:
        # 尝试查看用户详情
        detail = api('GET', '/api/v1/admin/users/39/balance-logs?page=1&pageSize=5', t=admin_t)
        print(f'  balance logs: {json.dumps(detail, ensure_ascii=False)[:400]}')
    else:
        for log in balance_logs[:5]:
            print(f'  {log}')
else:
    print(f'  detail: {json.dumps(logs_resp, ensure_ascii=False)[:300]}')
