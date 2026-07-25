// ============================================================
//  3cloud (3C) — 流式导出工具
//  解决大数据量导出时的内存和性能问题
// ============================================================

import type { FastifyReply } from 'fastify';

/**
 * 流式导出配置
 */
export interface StreamExportConfig {
  /** 最大导出行数 (默认 10,000) */
  maxRows?: number;
  /** 批次大小 (默认 1,000) */
  batchSize?: number;
  /** 响应超时时间ms (默认 5分钟) */
  timeoutMs?: number;
  /** CSV 文件名 */
  filename: string;
}

/**
 * 流式导出CSV
 * @param reply Fastify 响应对象
 * @param config 导出配置
 * @param queryFn 查询函数，接收 offset, limit 参数，返回 Promise<Row[]>
 * @param formatFn 格式化函数，将 Row 转换为 CSV 行字符串数组
 * @param headers CSV 表头数组
 */
export async function streamExportCsv<Row>(
  reply: FastifyReply,
  config: StreamExportConfig,
  queryFn: (offset: number, limit: number) => Promise<Row[]>,
  formatFn: (row: Row) => string[],
  headers?: string[]
): Promise<void> {
  const {
    maxRows = 10000,
    batchSize = 1000,
    timeoutMs = 300000,
    filename
  } = config;

  // 设置响应头
  reply.raw.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  // 设置超时
  reply.raw.setTimeout(timeoutMs, () => {
    reply.raw.destroy();
  });

  // 写入BOM（支持Excel中文）
  reply.raw.write('\uFEFF');

  // 写入表头
  if (headers && headers.length > 0) {
    reply.raw.write(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n');
  }

  let offset = 0;
  let totalRows = 0;

  try {
    while (totalRows < maxRows) {
      const limit = Math.min(batchSize, maxRows - totalRows);
      const batch = await queryFn(offset, limit);

      if (batch.length === 0) {
        break; // 没有更多数据
      }

      // 格式化并写入批次数据
      for (const row of batch) {
        const formatted = formatFn(row);
        const csvLine = formatted.map(cell => {
          // 转义特殊字符
          const str = String(cell ?? '');
          return str.includes(',') || str.includes('"') || str.includes('\n') 
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        }).join(',');
        
        reply.raw.write(csvLine + '\n');
      }

      totalRows += batch.length;
      offset += batch.length;

      // 如果批次不满，说明已到末尾
      if (batch.length < batchSize) {
        break;
      }

      // 每批次后立即刷新，避免缓冲区堆积
      await new Promise(resolve => {
        const raw = reply.raw as any;
        if (raw.flush) {
          raw.flush(() => resolve(undefined));
        } else {
          resolve(undefined);
        }
      });
    }

    // 导出完成
    reply.raw.end();
    
    // 记录导出统计
    console.log(`[StreamExport] ${filename}: 导出 ${totalRows} 行数据，批次 ${Math.ceil(totalRows / batchSize)}`);
    
  } catch (error) {
    console.error('[StreamExport] 导出失败:', error);
    
    // 尝试发送错误信息
    try {
      if (!reply.raw.headersSent) {
        reply.status(500).send({
          code: 500,
          data: null,
          message: '导出过程中发生错误'
        });
      } else {
        reply.raw.destroy();
      }
    } catch {
      // 忽略响应发送失败的错误
    }
    throw error;
  }
}

/**
 * 简单流式导出（无格式转换）
 */
export async function streamExportSimple(
  reply: FastifyReply,
  config: StreamExportConfig,
  queryFn: (offset: number, limit: number) => Promise<string[]>
): Promise<void> {
  const {
    maxRows = 10000,
    batchSize = 1000,
    timeoutMs = 300000,
    filename
  } = config;

  // 设置响应头
  reply.raw.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  // 设置超时
  reply.raw.setTimeout(timeoutMs, () => {
    reply.raw.destroy();
  });

  // 写入BOM（支持Excel中文）
  reply.raw.write('\uFEFF');

  let offset = 0;
  let totalRows = 0;

  try {
    while (totalRows < maxRows) {
      const limit = Math.min(batchSize, maxRows - totalRows);
      const batch = await queryFn(offset, limit);

      if (batch.length === 0) {
        break; // 没有更多数据
      }

      // 写入批次数据
      for (const line of batch) {
        reply.raw.write(line + '\n');
      }

      totalRows += batch.length;
      offset += batch.length;

      // 如果批次不满，说明已到末尾
      if (batch.length < batchSize) {
        break;
      }

      // 每批次后立即刷新
      await new Promise(resolve => {
        const raw = reply.raw as any;
        if (raw.flush) {
          raw.flush(() => resolve(undefined));
        } else {
          resolve(undefined);
        }
      });
    }

    // 导出完成
    reply.raw.end();
    
    console.log(`[StreamExportSimple] ${filename}: 导出 ${totalRows} 行数据`);
    
  } catch (error) {
    console.error('[StreamExportSimple] 导出失败:', error);
    
    try {
      if (!reply.raw.headersSent) {
        reply.status(500).send({
          code: 500,
          data: null,
          message: '导出过程中发生错误'
        });
      } else {
        reply.raw.destroy();
      }
    } catch {
      // 忽略响应发送失败的错误
    }
    throw error;
  }
}

/**
 * 导出配置常量
 */
export const EXPORT_CONFIG = {
  MAX_EXPORT_ROWS: 10000,      // 最大导出行数
  BATCH_SIZE: 1000,           // 每批次大小
  TIMEOUT_MS: 300000,         // 5分钟超时
} as const;