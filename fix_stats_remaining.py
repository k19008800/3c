with open(r'C:/Users/ZH/.openclaw/workspace/3cloud/web/src/pages/admin/Stats.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# Fix remaining corrupted texts in HTML comments and visible text
c = c.replace('{/* 姹囨€诲崱鐗?*/}', '{/* 汇总卡片 */}')
c = c.replace('{/* 鑱氬悎鏃堕棿搴忓垪 */}', '{/* 聚合时间序列 */}')
c = c.replace('{/* 缁村害缁嗗垎鍥捐〃 */}', '{/* 维度细分图表 */}')
c = c.replace('{/* 鏄庣粏鍒楄〃 */}', '{/* 明细列表 */}')
c = c.replace('{/* 绛涢€夊櫒 */}', '{/* 筛选器 */}')

# Fix label texts that still have mojibake
c = c.replace('>鎬昏皟鐢<', '>总调用<')
c = c.replace('>鎬?Token<', '>总 Token<')
c = c.replace('>鎬昏姳璐<', '>总花费<')

# Currency symbol: 楼 -> ¥
c = c.replace("value={'楼'", "value={'¥'")

# Fix the 贵 in "楼{" and "楼$" patterns  
c = c.replace('>楼{', '>¥{')
c = c.replace('`楼$', '`¥$')
c = c.replace(' 楼', ' ¥')

with open(r'C:/Users/ZH/.openclaw/workspace/3cloud/web/src/pages/admin/Stats.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

print('Done with final fixes')
