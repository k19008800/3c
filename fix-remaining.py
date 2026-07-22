#!/usr/bin/env python3
"""批量修复剩余编码腐烂文件"""
import os

# 需要修复的文件列表（从 check-encoding.js 输出提取）
files_to_fix = [
    r'api\src\routes\admin\campaigns\list.ts',
    r'api\src\routes\admin\finance\codes\handlers\agent-cost.ts',
    r'api\src\routes\admin\finance\codes\handlers\agent-ledger.ts',
    r'api\src\routes\admin\finance\codes\handlers\agent-settlement-detail.ts',
    r'api\src\routes\admin\finance\codes\handlers\code-cost.ts',
    r'api\src\routes\admin\finance\codes\handlers\finalize-settlement.ts',
    r'api\src\routes\auth\reset.ts',
    r'api\src\routes\proxy\logging.ts',
]

# U+FFFD 替换字符 → 根据上下文推断的正确中文
# 这些文件的注释被腐烂，根据路由路径推断
fixes = {
    r'api\src\routes\admin\campaigns\list.ts': [
        ('//  3cloud (3C) �?活动列表 & 汇总统�?', '//  3cloud (3C) 活动列表 & 汇总统计'),
        ('//  GET /api/v1/admin/campaigns �?活动列表（分�?', '//  GET /api/v1/admin/campaigns 活动列表（分页'),
        ('//  GET /api/v1/admin/campaigns/stats �?活动汇总统�?', '//  GET /api/v1/admin/campaigns/stats 活动汇总统计'),
        ('//  必须�?', '//  必须在'),
        ('否�?', '否则'),
    ],
    r'api\src\routes\admin\finance\codes\handlers\agent-cost.ts': [
        ('请使�?', '请使用'),
        ('（�?', '（即'),
        ('为每�?', '为每个'),
        ('数据�?', '数据──'),
        ('记�?', '记录'),
        ('汇�?', '汇总'),
    ],
    r'api\src\routes\admin\finance\codes\handlers\agent-ledger.ts': [
        ('流�?', '流水'),
    ],
    r'api\src\routes\admin\finance\codes\handlers\agent-settlement-detail.ts': [
        ('汇�?', '汇总'),
        ('代理�?', '代理商'),
    ],
    r'api\src\routes\admin\finance\codes\handlers\code-cost.ts': [
        ('�?period', '按 period'),
        ('数据�?', '数据'),
        ('类�?', '类型'),
    ],
    r'api\src\routes\admin\finance\codes\handlers\finalize-settlement.ts': [
        ('结算�?', '结算单'),
        ('汇�?', '汇总'),
    ],
    r'api\src\routes\auth\reset.ts': [
        ('�?密码重置路由', '密码重置路由'),
        ('�?忘记密码', '忘记密码'),
        ('�?重置密码', '重置密码'),
    ],
    r'api\src\routes\proxy\logging.ts': [
        ('�?已知业务错误', '→ 已知业务错误'),
        ('�?请求参数校验失败', '→ 请求参数校验失败'),
        ('�?向上抛出', '→ 向上抛出'),
    ],
}

fixed_count = 0
for rel_path, replacements in fixes.items():
    path = os.path.join('.', rel_path)
    if not os.path.exists(path):
        print(f"[SKIP] {path} not found")
        continue
    
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        for old, new in replacements:
            if old in content:
                content = content.replace(old, new)
                fixed_count += 1
        
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"[OK] {path}")
    except Exception as e:
        print(f"[ERR] {path}: {e}")

print(f"\n修复完成: {fixed_count} 处")
