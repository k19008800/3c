from pathlib import Path

root = Path(__file__).parents[2]
source = root / "docs/PRD-用户体系.md"
out = root / "docs/_recovered/PRD-用户体系-recovered-draft.md"
markers = ("鈥", "锛", "鐨", "绯荤", "馃", "�")

def score(text):
    return sum(text.count(marker) for marker in markers) + text.count("\ufffd") * 3

def recover(line):
    original_score = score(line)
    try:
        candidate = line.encode("gb18030").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return line, "UNRECOVERABLE"
    if "\ufffd" in candidate or score(candidate) >= original_score:
        return line, "RETAIN_ORIGINAL"
    return candidate, "RECOVERED_CANDIDATE"

source_lines = source.read_text(encoding="utf-8-sig", errors="replace").splitlines()
result = []
stats = {"RECOVERED_CANDIDATE": 0, "RETAIN_ORIGINAL": 0, "UNRECOVERABLE": 0}
for line in source_lines:
    recovered, status = recover(line)
    stats[status] += 1
    if status != "RECOVERED_CANDIDATE" and any(marker in line for marker in markers):
        result.append(f"<!-- [NEEDS-MANUAL-RECOVERY:{status}] {line} -->")
    else:
        result.append(recovered)

out.parent.mkdir(parents=True, exist_ok=True)
out.write_text("\n".join(result) + "\n", encoding="utf-8")
notes = out.with_suffix(".notes.md")
notes.write_text(
    "# 用户体系 PRD 恢复草稿说明\n\n"
    "本文件是只读探测生成的审阅草稿，不是 canonical 需求源，也未覆盖原始 PRD。\n\n"
    f"- 原始行数：{len(source_lines)}\n"
    f"- 严格逆转候选行：{stats['RECOVERED_CANDIDATE']}\n"
    f"- 保留原文行：{stats['RETAIN_ORIGINAL']}\n"
    f"- 无法逆转行：{stats['UNRECOVERABLE']}\n\n"
    "判定标准：GB18030→UTF-8 转换后不得出现 replacement character，且疑似乱码标记数量必须下降。\n"
    "所有无法安全恢复且含疑似乱码的行均以 NEEDS-MANUAL-RECOVERY 注释保留，禁止据此直接生成验收结论。\n",
    encoding="utf-8",
)
print(stats)
print(out)
