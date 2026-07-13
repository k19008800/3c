import sys
sys.stdout.reconfigure(encoding='utf-8')

INPUT = r'C:/Users/ZH/.openclaw/workspace/3cloud/web/src/pages/admin/Stats.tsx'
with open(INPUT, 'r', encoding='utf-8') as f:
    lines = f.read().split('\n')

moji_chars = '鎴愬姛澶辫触鎬昏皟鐢ㄦ鎺掕閰嶇疆鍒楄〃璁＄畻鏈嶅姟宸ヨ繘搴﹀彉鎴忓叧寮傚寲鏁扮粺璁℃帓鏃堕棿涓㈠け鍖哄煙瑙ｆ瀽闃熷垪瀹㈡埛鐐圭綉鏉冮檺璁垮彉鍖栨按CN鍗忚甯冩櫘閫氱敤鎴峰拰瀵嗙爜瀹夊叏瓒呯骇绠＄悊绉佹湇鏁伴噺鑷姪鍗曚綅鎸夌収鏈爣璇嗗彲淇＄敤璇佷功'
moji_set = set(moji_chars)

remaining = []
for i, line in enumerate(lines, 1):
    for ch in line:
        if ch in moji_set:
            remaining.append(i)
            break

print(f'Remaining corrupted lines: {len(remaining)}')
for ln in remaining:
    text = lines[ln-1][:160].rstrip()
    has_good = any('\u4e00' <= ch <= '\u9fff' for ch in lines[ln-1])
    tag = 'MIXED' if has_good else 'CORRUPT'
    print(f'  L{ln} [{tag}]: {text}')
