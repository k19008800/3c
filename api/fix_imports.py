import os

root = os.getcwd()
fixed = 0

# The 16 files in services/subdirectories that still use auth-service.js
files = [
    'src\\services\\agent-commission\\queries.ts',
    'src\\services\\agent-commission\\rules.ts',
    'src\\services\\agent-commission\\team.ts',
    'src\\services\\agent-core\\admin.ts',
    'src\\services\\agent-core\\clients.ts',
    'src\\services\\agent-core\\dashboard.ts',
    'src\\services\\agent-core\\referral.ts',
    'src\\services\\agent-finance\\customer.ts',
    'src\\services\\agent-withdraw\\create.ts',
    'src\\services\\agent-withdraw\\review.ts',
    'src\\services\\invoice-service\\admin.ts',
    'src\\services\\invoice-service\\create.ts',
    'src\\services\\invoice-service\\queries.ts',
    'src\\services\\real-name-service\\file-manager.ts',
    'src\\services\\real-name-service\\rate-limit.ts',
    'src\\services\\real-name-verify\\provider.ts',
]

for f in files:
    fp = os.path.join(root, f)
    with open(fp, 'r', encoding='utf-8') as fh:
        content = fh.read()
    
    old = '"../auth-service.js"'
    new = '"../auth-service/index.js"'
    
    if old not in content:
        print('PATTERN NOT FOUND: ' + f)
        continue
    
    count = content.count(old)
    content = content.replace(old, new)
    
    with open(fp, 'w', encoding='utf-8') as fh:
        fh.write(content)
    
    print('Fixed ' + f + ' (' + str(count) + ' occurrences)')
    fixed += 1

print('Total files fixed: ' + str(fixed))
