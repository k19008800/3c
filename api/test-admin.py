import json, subprocess

with open(r'C:\Users\ZH\.openclaw\workspace\3cloud\api\_token.txt') as f:
    token = f.read().strip()

# Test admin users list
r = subprocess.check_output(['curl.exe', '-s', 'http://localhost:3000/api/v1/admin/users?pageSize=5', '-H', 'Authorization: Bearer ' + token])
data = json.loads(r)
users = data['data']['list']
for u in users:
    print(f"  {u['id']}: {u['email']} ({u['role']}/{u['status']})")
print(f'Total: {data["data"]["total"]}')
