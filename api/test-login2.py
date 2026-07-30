import json, subprocess

r = subprocess.check_output(['curl.exe', '-s', '-X', 'POST', 'http://localhost:3000/api/v1/auth/login',
    '-H', 'Content-Type: application/json',
    '-d', '{"email":"test@3cloud.ai","password":"***"}'])
d = json.loads(r)
print(json.dumps(d, indent=2, ensure_ascii=False)[:1000])
