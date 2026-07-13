// ============================================================
//  3cloud 仿真测试 — 验证 & 报告工具
// ============================================================

export interface VerificationPoint {
  name: string;
  passed: boolean;
  detail: string;
}

export class VerificationReport {
  points: VerificationPoint[] = [];
  passed = 0;
  failed = 0;

  add(name: string, passed: boolean, detail: string = "") {
    this.points.push({ name, passed, detail });
    if (passed) this.passed++;
    else this.failed++;
  }

  summary(): string {
    const total = this.passed + this.failed;
    const rate = total > 0 ? ((this.passed / total) * 100).toFixed(1) : "0.0";
    return [
      `\n═══════════════════════════════════════`,
      `验证报告: ${this.passed}/${total} 通过 (${rate}%)`,
      `═══════════════════════════════════════`,
      ...this.points.map((p) => `  ${p.passed ? "✅" : "❌"} ${p.name}${p.detail ? ` — ${p.detail}` : ""}`),
      `═══════════════════════════════════════\n`,
    ].join("\n");
  }

  failedPoints(): VerificationPoint[] {
    return this.points.filter((p) => !p.passed);
  }
}

// ── 进度输出 ──

let phaseStart = Date.now();
let lastProgress = 0;

export function startPhase(name: string) {
  phaseStart = Date.now();
  lastProgress = 0;
  const line = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  console.log(`\n${line}\n  🚀 阶段: ${name}\n${line}`);
}

export function progress(current: number, total: number) {
  const pct = Math.floor((current / total) * 100);
  if (pct >= lastProgress + 5 || pct === 100) {
    lastProgress = pct;
    const elapsed = ((Date.now() - phaseStart) / 1000).toFixed(1);
    process.stdout.write(`\r  进度: ${pct}% (${current}/${total}) [${elapsed}s]`);
  }
}

export function endPhase(name: string): string {
  const elapsed = ((Date.now() - phaseStart) / 1000).toFixed(1);
  console.log(`\n  ✅ ${name} 完成 (${elapsed}s)`);
  return elapsed;
}

// ── CSV 报告输出 ──

export function writeCsvReport(filename: string, rows: Record<string, any>[]) {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const csvLines = [headers.join(",")];

  for (const row of rows) {
    csvLines.push(headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(","));
  }

  console.log(`  📄 CSV 数据已生成: ${filename} (${rows.length} 行)`);
}
