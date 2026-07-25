#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// 日志配置
const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.log(`[WARN] ${msg}`),
  error: (msg: string) => console.log(`[ERROR] ${msg}`),
};

// 统计信息
const stats = {
  filesProcessed: 0,
  catchErrorsFixed: 0,
  totalCatchErrors: 0,
};

// 检测 .catch(() => {}) 模式
function findCatchErrors(content: string): Array<{
  match: string;
  lineNumber: number;
  lines: string[];
}> {
  const lines = content.split('\n');
  const results = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 匹配 .catch(() => {})
    if (line.includes('.catch(() => {})')) {
      // 获取上下文（前2行和后2行）
      const contextStart = Math.max(0, i - suggestedContextLines);
      const contextEnd = Math.min(lines.length, i + suggestedContextLines + 1);
      const contextLines = lines.slice(contextStart, contextEnd);
      
      results.push({
        match: line,
        lineNumber: i + 1,
        lines: contextLines,
      });
    }
    
    // 匹配 .catch(() => { 跨行的情况
    if (line.includes('.catch(() => {') && lines.slice(i, i + 3).join('\n').includes('.catch(() => {}')) {
      // 获取上下文
      const contextStart = Math.max(0, i - suggestedContextLines);
      const contextEnd = Math.min(lines.length, i + suggestedContextLines + 1);
      const contextLines = lines.slice(contextStart, contextEnd);
      
      results.push({
        match: line + '\n' + lines[i + 1] + (lines[i + 2] || ''),
        lineNumber: i + 1,
        lines: contextLines,
      });
    }
  }
  
  return results;
}

// 修复 .catch(() => {}) 为 .catch(err => logger.error(err))
function fixCatchError(content: string): string {
  // 模式1: 单行 .catch(() => {})
  let fixedContent = content.replace(
    /\.catch\(\(\) => \{\}\)/g,
    '.catch(err => { console.error(\"[Async Error]\", err); })'
  );
  
  // 模式2: 跨行 .catch(() => {
  fixedContent = fixedContent.replace(
    /\.catch\(\(\) => \{([^}]*)\}\)/g,
    (match, content) => {
      return `.catch(err => {${content}\n  console.error(\"[Async Error]\", err);\n})`;
    }
  );
  
  return fixedContent;
}

// 处理单个文件
function processFile(filePath: string): void {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const catchErrors = findCatchErrors(content);
    
    if (catchErrors.length > 0) {
      logger.info(`Found ${catchErrors.length} .catch(() => {}) patterns in ${filePath}`);
      
      // 显示找到的问题
      catchErrors.forEach((error, index) => {
        logger.warn(`  Problem ${index + 1} at line ${error.lineNumber}:`);
        error.lines.forEach((line, i) => {
          const lineNum = error.lineNumber - (error.lines.length - i - 1) + Math.floor(error.lines.length / 2) - 2;
          console.log(`    ${lineNum}: ${line}`);
        });
        console.log('');
      });
      
      // 询问是否修复
      const shouldFix = true; // 自动修复
      
      if (shouldFix) {
        const fixedContent = fixCatchError(content);
        writeFileSync(filePath, fixedContent, 'utf-8');
        stats.catchErrorsFixed += catchErrors.length;
        logger.info(`  Fixed ${catchErrors.length} .catch(() => {}) patterns`);
      }
      
      stats.totalCatchErrors += catchErrors.length;
    }
    
    stats.filesProcessed++;
  } catch (error) {
    logger.error(`Error processing ${filePath}: ${error}`);
  }
}

// 递归遍历目录
function traverseDirectory(dirPath: string): void {
  try {
    const items = readdirSync(dirPath);
    
    for (const item of items) {
      const fullPath = join(dirPath, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        // 跳过node_modules和dist目录
        if (!item.includes('node_modules') && !item.includes('dist')) {
          traverseDirectory(fullPath);
        }
      } else if (stat.isFile()) {
        // 只处理TypeScript和JavaScript文件
        if (item.endsWith('.ts') || item.endsWith('.js')) {
          processFile(fullPath);
        }
      }
    }
  } catch (error) {
    logger.error(`Error traversing ${dirPath}: ${error}`);
  }
}

// 主函数
function main(): void {
  const apiSrcPath = join(process.cwd(), '3cloud/api/src');
  
  logger.info('Starting to fix .catch(() => {}) patterns in 3cloud API...');
  logger.info(`Scanning directory: ${apiSrcPath}`);
  
  traverseDirectory(apiSrcPath);
  
  // 输出统计信息
  logger.info('\n=== Fix Complete ===');
  logger.info(`Files processed: ${stats.filesProcessed}`);
  logger.info(`Total .catch(() => {}) patterns found: ${stats.totalCatchErrors}`);
  logger.info(`Patterns fixed: ${stats.catchErrorsFixed}`);
  
  if (stats.totalCatchErrors > 0) {
    logger.info('\nRecommendations:');
    logger.info('1. Review the fixes to ensure proper error handling');
    logger.info('2. Consider using structured logging instead of console.error');
    logger.info('3. Add error context for better debugging');
  }
}

// 运行主函数
const suggestedContextLines = 2;
main();