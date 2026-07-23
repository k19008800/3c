// ============================================================
//  3cloud (3C) — 响应压缩插件
//  使用 @fastify/compress 自动压缩响应体
// ============================================================

import type { FastifyPluginAsync } from 'fastify';

const compressPlugin: FastifyPluginAsync = async (fastify) => {
  // 导入压缩插件
  const compress = await import('@fastify/compress');
  
  // 注册压缩插件
  await fastify.register(compress.default, {
    global: true,
    threshold: 1024, // 仅压缩大于 1KB 的响应
    encodings: ['gzip', 'deflate', 'br'],
    customTypes: /^text\/|\+json$|\+text$|\+xml$/i,
    
    // 跳过压缩的文件类型
    onUnsupportedEncoding: (encoding, request, reply) => {
      // 如果客户端不支持任何压缩编码，继续发送未压缩的响应
      fastify.log.debug(`客户端不支持压缩编码: ${encoding}`);
    },
    
    // 自定义压缩级别（gzip）
    zlib: {
      level: 6 // 默认压缩级别（1-9，6是平衡选择）
    }
  });
  
  fastify.log.info('✅ 响应压缩插件已启用 (gzip/deflate/br, threshold=1KB)');
};

export default compressPlugin;