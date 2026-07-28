import os

path = r'C:\Users\ZH\.openclaw\workspace\3cloud\docs\SPEC-§2-用户体系.md'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old = '### 安全约束\n\n| 场景 | 行为 |\n|------|------|\n| Key 明文存储 | 不存在数据库中，仅存 bcrypt hash；创建时一次性展示 |\n| Key 泄露 | 用户可在管理端立即禁用/删除，不影响其他 Key |\n| 单个用户 Key 数量上限 | `site_configs.max_keys_per_user`（默认 50 个）|\n| 删除 Key | 硬删除，不可恢复，正在进行的调用立即中断 |'

new = '### Key 权限控制（P1）\n\n支持为每个 Key 设置模型白名单，限制该 Key 只能调用指定模型。\n- 白名单模式：选择允许的模型列表，未选中的模型该 Key 无法调用\n- 黑名单模式：选择禁止的模型列表，其余模型均可调用\n- 默认：无限制（可调用所有可用模型）\n- 权限变更立即生效，不影响正在进行的请求\n\n### Key 过期时间管理（P2）\n\n- 创建 Key 时可选设置过期时间\n- 过期后 Key 自动失效，返回 403 `key_expired`\n- 用户可在管理端续期 Key（延长过期时间）\n- 列表中已过期的 Key 标注\u201c已过期\u201d状态标签\n- 用户可筛选查看即将过期的 Key（近 30 天到期）\n\n### 安全约束\n\n| 场景 | 行为 |\n|------|------|\n| Key 明文存储 | 不存在数据库中，仅存 bcrypt hash；创建时一次性展示 |\n| Key 泄露 | 用户可在管理端立即禁用/删除，不影响其他 Key |\n| 单个用户 Key 数量上限 | `site_configs.max_keys_per_user`（默认 50 个）|\n| 删除 Key | 硬删除，不可恢复，正在进行的调用立即中断 |'

if old in content:
    content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('OK')
else:
    print('NOT FOUND')
    # 显示实际内容的前后文
    idx = content.find('### 安全约束')
    if idx >= 0:
        print(repr(content[idx:idx+600]))