#!/usr/bin/env node
/**
 * Memory Distillation — 记忆蒸馏脚本
 *
 * 按照 AGENTS.md 的记忆维护要求，定期从原始会话日志中提取精华
 * 更新到 MEMORY.md 和 kb/ 知识库
 *
 * 用法：
 *   node kb/scripts/memory-distill.js            # 扫描最近 24h 的日志
 *   node kb/scripts/memory-distill.js --days 7   # 扫描最近 7 天
 *   node kb/scripts/memory-distill.js --report   # 只输出报告，不写文件
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..', '..');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const KB_DIR = path.join(WORKSPACE, 'kb');
const MEMORY_FILE = path.join(WORKSPACE, 'MEMORY.md');
const STATE_FILE = path.join(WORKSPACE, 'memory', '.distill-state.json');

function getArgs() {
  const args = { days: 1, report: false, dryRun: false };
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--days') args.days = parseInt(process.argv[++i]) || 1;
    if (process.argv[i] === '--report') args.report = true;
    if (process.argv[i] === '--dry-run') args.dryRun = true;
  }
  return args;
}

function getRecentFiles(days) {
  if (!fs.existsSync(MEMORY_DIR)) return [];
  const cutoff = Date.now() - days * 86400000;
  const files = fs.readdirSync(MEMORY_DIR)
    .filter(f => f.endsWith('.md') && !f.startsWith('.'))
    .map(f => ({
      name: f,
      path: path.join(MEMORY_DIR, f),
      mtime: fs.statSync(path.join(MEMORY_DIR, f)).mtimeMs
    }))
    .filter(f => f.mtime > cutoff)
    .sort((a, b) => a.mtime - b.mtime);
  return files;
}

function extractSections(content) {
  // Extract decision-like patterns and important info
  const sections = {
    decisions: [],
    important: [],
    projectChanges: [],
    serverOps: []
  };

  // Decision patterns: "选" "决定" "方案" "确认" followed by options or outcomes
  const decisionPattern = /(选[^。]*方案|决定[^。]*|确认[^。]*|选择[^。]*)/g;
  let match;
  while ((match = decisionPattern.exec(content)) !== null) {
    sections.decisions.push(match[1].trim());
  }

  // Project changes: "改" "新增" "删除" "修复" "部署" "重启"
  const changePattern = /(✅|❌|🔄|新增|修改|删除|修复|部署|重启|启动)[^。\n]*/g;
  while ((match = changePattern.exec(content)) !== null) {
    sections.projectChanges.push(match[0].trim());
  }

  // Server ops
  const serverPattern = /(?:SSH|服务器|生产|宝塔|PM2|Nginx|域名|IP)[^。\n]*/g;
  while ((match = serverPattern.exec(content)) !== null) {
    sections.serverOps.push(match[0].trim());
  }

  // Important: "注意" "关键" "重要" "BOSS说" "用户"
  const importantPattern = /(注意[：:][^。]*|关键[：:][^。]*|重要[：:][^。]*|BOSS[：:][^。]*)/g;
  while ((match = importantPattern.exec(content)) !== null) {
    sections.important.push(match[0].trim());
  }

  return sections;
}

function generateReport(files, args) {
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  记忆蒸馏报告');
  console.log(`  扫描范围: 最近 ${args.days} 天`);
  console.log(`  文件数量: ${files.length}`);
  console.log('═══════════════════════════════════════');
  console.log('');

  if (files.length === 0) {
    console.log('  📭 近期无新会话日志');
    console.log('');
    return null;
  }

  let allDecisions = [];
  let allChanges = [];
  let allImportant = [];

  for (const file of files) {
    const content = fs.readFileSync(file.path, 'utf-8');
    const sections = extractSections(content);
    allDecisions.push(...sections.decisions);
    allChanges.push(...sections.projectChanges);
    allImportant.push(...sections.important);

    if (sections.decisions.length > 0 || sections.projectChanges.length > 0 || sections.important.length > 0) {
      console.log(`  📄 ${file.name}`);
      if (sections.decisions.length > 0) {
        console.log(`     决策: ${sections.decisions.join(' | ')}`);
      }
      if (sections.projectChanges.length > 0) {
        console.log(`     变更: ${sections.projectChanges.slice(0, 3).join(' | ')}`);
      }
      if (sections.important.length > 0) {
        console.log(`     重要: ${sections.important.slice(0, 2).join(' | ')}`);
      }
      console.log('');
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    filesScanned: files.length,
    totalDecisions: allDecisions.length,
    totalChanges: allChanges.length,
    decisions: [...new Set(allDecisions)],
    recentChanges: [...new Set(allChanges)].slice(0, 20),
    notes: [...new Set(allImportant)].slice(0, 10)
  };

  return report;
}

function updateState(report) {
  const state = {
    lastDistill: new Date().toISOString(),
    lastFilesScanned: report?.filesScanned || 0,
    lastDecisions: report?.totalDecisions || 0
  };
  if (!fs.existsSync(path.dirname(STATE_FILE))) {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// --- Main ---
const args = getArgs();
const files = getRecentFiles(args.days);
const report = generateReport(files, args);

if (report) {
  if (!args.dryRun) {
    updateState(report);
    console.log('  ✅ 状态已更新');
  } else {
    console.log('  🏃 干运行模式（未写入）');
  }
} else {
  console.log('  ✅ 无需更新');
  updateState(null);
}
console.log('');
