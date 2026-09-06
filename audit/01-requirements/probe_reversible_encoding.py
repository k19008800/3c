import csv
from pathlib import Path

root = Path(__file__).parents[2]
req_files = [
    root / "audit/01-requirements/core-finance-atomic-v2.csv",
    root / "audit/01-requirements/admin-portal-atomic-v2.csv",
    root / "audit/01-requirements/user-agent-atomic-v2.csv",
]
target_source = "docs/PRD-用户体系.md"
source = root / target_source
markers = ("鈥", "锛", "鐨", "绯荤", "馃", "�")

def score(text):
    return sum(text.count(x) for x in markers)

def candidates(text):
    values = [("original", text)]
    current = text
    for i in range(1, 4):
        try:
            candidate = current.encode("gb18030").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            break
        if candidate == current:
            break
        current = candidate
        values.append((f"gb18030->utf8 x{i}", current))
    return values

source_lines = source.read_text(encoding="utf-8-sig", errors="replace").splitlines()
source_candidates = []
for no, line in enumerate(source_lines, 1):
    for method, value in candidates(line):
        if method != "original" and "�" not in value and score(value) < score(line):
            source_candidates.append((no, method, line, value, score(line), score(value)))

rows = []
for req in req_files:
    with req.open(encoding="utf-8-sig", newline="") as fh:
      for row in csv.DictReader(fh):
        if row["source_path"] != target_source:
            continue
        bad_fields = [f for f in ("source_section", "source_quote", "atomic_assertion") if any(m in row[f] for m in markers)]
        if not bad_fields:
            continue
        exact = []
        for no, method, original, recovered, before, after in source_candidates:
            recovered_quote = next(
                (value for name, value in candidates(row["source_quote"].strip()) if name == method),
                "",
            )
            if recovered_quote and recovered_quote in recovered:
                exact.append(f"{no}:{method}")
        rows.append({
            "req_id": row["req_id"],
            "source_section": row["source_section"],
            "bad_fields": ";".join(bad_fields),
            "reversible_source_lines": ";".join(exact),
            "status": "CANDIDATE" if exact else "MANUAL_REVIEW",
        })

out = root / "audit/01-requirements/user-system-encoding-probe.csv"
fieldnames = ["req_id", "source_section", "bad_fields", "reversible_source_lines", "status"]
with out.open("w", encoding="utf-8-sig", newline="") as fh:
    writer = csv.DictWriter(fh, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

notes = root / "audit/01-requirements/user-system-encoding-probe.md"
notes.write_text(
    "# 用户体系需求编码可逆恢复探测\n\n"
    f"- 源文档：`{source.relative_to(root)}`\n"
    f"- 受影响需求：{len(rows)} 条\n"
    f"- 发现可逆候选源行：{len(source_candidates)} 条\n"
    f"- 进入候选需求：{sum(row['status'] == 'CANDIDATE' for row in rows)} 条\n"
    "\n结论：本探测只生成候选，不修改源文档或 canonical CSV。候选仍需人工确认语义和章节边界后才能写回。\n",
    encoding="utf-8",
)
print("affected_requirements=", len(rows))
print("reversible_source_lines=", len(source_candidates))
print("candidate_requirements=", sum(row["status"] == "CANDIDATE" for row in rows))
