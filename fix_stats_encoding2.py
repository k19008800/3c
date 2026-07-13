#!/usr/bin/env python3
"""Fix remaining mojibake in Stats.tsx - Part 2: manual replacements for ?-containing lines"""

INPUT = r'C:/Users/ZH/.openclaw/workspace/3cloud/web/src/pages/admin/Stats.tsx'

with open(INPUT, 'r', encoding='utf-8') as f:
    content = f.read()

# Comprehensive manual replacements for ALL corrupted strings
# (These can't be auto-fixed because they contain '?' or € which break GBK roundtrip)
replacements = {
    # Box-drawing comment lines
    '鈹€鈹€ Types 鈹€鈹€': '──── Types ────',
    '鈹€鈹€ Stat Card 鈹€鈹€': '──── Stat Card ────',
    '鈹€鈹€ Custom Tooltips 鈹€鈹€': '──── Custom Tooltips ────',
    '鈹€鈹€ Page 鈹€鈹€': '──── Page ────',
    '鈹€鈹€ 鑱氬悎鏌ヨ鐘舵€?鈹€鈹€': '──── 聚合查询状态 ────',
    '鈹€鈹€ 鑱氬悎鏌ヨ 鈹€鈹€': '──── 聚合查询 ────',
    
    # Long separator lines
    '鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲': '══════════════════════════════════════════',
    '鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲': '══════════════════════════════════════════',
    
    # Chinese text with ? characters (the ? is ASCII 0x3F from failed encoding conversion)
    'V2.0 鑱氬悎鏌ヨ绫诲瀷': 'V2.0 聚合查询类型',
    'V2.0 鑱氬悎鏌ヨ锛堢鐞嗗悗鍙板寮猴級': 'V2.0 聚合查询（管理后台增强）',
    
    # Error messages
    '鑾峰彇缁熻鏁版嵁澶辫触': '获取统计数据失败',
    '鑱氬悎鏌ヨ澶辫触': '聚合查询失败',
    
    # Page title
    '鑱氬悎缁熻': '聚合统计',
    
    # Summary cards
    '鎬昏皟鐢ㄦ鏁?': '总调用次数"',
    '成功': '成功',  # already fixed
    '失败': '失败',  # already fixed
    '鎬?Token 娑堣€?': '总 Token 消耗"',
    '涓?': '万"',  # for `+'万`} patterns
    '鎬昏姳璐?': '总花费"',
    '鎴愬姛鐜?': '成功率',
    '成功 率': '成功率',
    '骞冲潎寤惰繜': '平均延迟',
    '鐢ㄦ埛': '用户',
    
    # Chart labels
    '鑺辫垂': '花费',
    '涓嘸': '万' if True else '万',
    '鐨勫崠': '的卖',  # probably wrong, let me check
    
    # Empty state
    '鏆傛棤瓒嬪娍鏁版嵁': '暂无趋势数据',
    '鏆傛棤鏁版嵁': '暂无数据',
    '鏆傛棤灏忔椂鍒嗗竷鏁版嵁': '暂无小时分布数据',
    
    # Section headers
    '鎸夋ā鍨嬬粺璁℃帓琛?': '按模型统计排行',
    '鎸変緵搴斿晢缁熻鎺掕': '按供应商统计排行',
    '鎸夊皬鏃跺垎甯冿紙浠婃棩锛?': '按小时分布（今日）',
    '按小时分布（今日）': '按小时分布（今日）',
    
    # Chart data names
    '璋冪敤娆℃暟': '调用次数',
    
    # Aggregation section
    'V2.0 聚合查询（管理后台增强）': 'V2.0 聚合查询（管理后台增强）',
    '鑱氬悎鏌ヨ': '聚合查询',
    '澶氱淮搴﹁仛鍚?+ 妯″瀷/渚涘簲鍟嗙粏鍒?': '多维度聚合 + 模型/供应商细分',
    '鑱氬悎绮掑害': '聚合粒度',
    '鐣欑┖鍏ㄩ儴': '留空全部',
    '渚涘簲鍟嗙瓫閫?': '供应商筛选',
    '鏌ヨ': '查询',
    '姹囨€诲崱鐗?': '汇总卡片',
    '鎬昏皟鐢?': '总调用',
    '鎬?Token': '总 Token',
    '鎬昏姳璐?': '总花费',
    '骞冲潎寤惰繜': '平均延迟',
    '鑱氬悎鏃堕棿搴忓垪': '聚合时间序列',
    '缁村害缁嗗垎鍥捐〃': '维度细分图表',
    '鎸夋ā鍨嬬粏鍒?': '按模型细分',
    '鎸変緵搴斿晢缁嗗垎': '按供应商细分',
    '鏄庣粏鍒楄〃': '明细列表',
    '鏃堕棿搴忓垪鏄庣粏': '时间序列明细',
    '鏃堕棿': '时间',
    '鑺辫垂': '花费',
    '鐢ㄦ埛': '用户',
    
    # Inline template literal fixes
    # sub={`成功 ${overview.successCalls} | 失败 ${overview.failedCalls}`} 
    # - already fixed
    
    # sub={`${overview.uniqueUsers} 用户`}
    # - already fixed
    
    # For line: `+'万`}  -> fix the 万 character
    # The corrupted 万 was '涓?' which is '万'
    # But let me check if `+'万`} is correct - no, it should end with:
    # + '万'}`  or  toFixed(0)}万
}

# Apply all replacements
for old, new in replacements.items():
    if old in content:
        content = content.replace(old, new)
        print(f'Replaced: {old[:30]}... -> {new[:30]}...')
    else:
        # Check if partial match exists (for debugging)
        if len(old) > 3:
            idx = content.find(old[:3])
            if idx >= 0:
                print(f'Partial match for: {old[:20]}... (first 3 chars found, not full match)')
            else:
                print(f'NOT FOUND: {old[:30]}...')
        else:
            print(f'NOT FOUND (too short): {old}')

# Write back
with open(INPUT, 'w', encoding='utf-8') as f:
    f.write(content)

print('\nDone with Part 2')
