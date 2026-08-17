/**
 * 内部资产路由 — GET /internal/assets/:name
 *
 * 提供多模态预处理（P0-4）落盘的临时文件下载（内网 URL 指向本端点）。
 * 仅服务 temp-asset-store 写入的合法文件名（UUID.ext，防路径穿越），
 * 不存在 → 404。供自建/内网上游供应商拉取；外部供应商场景需将
 * MULTIMODAL_ASSET_BASE_URL 配置为可被其访问的地址（见 temp-asset-store.ts）。
 *
 * @module routes
 * @see docs/iteration-plan-v2.md P0-4 多模态预处理挂载
 */

import type { FastifyInstance } from 'fastify';
import { readTempAsset } from '../services/upstream/temp-asset-store';

export async function internalAssetsRoutes(app: FastifyInstance) {
  app.get('/internal/assets/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    const buf = await readTempAsset(name);
    if (!buf) {
      return reply.status(404).send({ error: { message: 'asset not found', type: 'not_found' } });
    }
    return reply.type('application/octet-stream').send(buf);
  });
}
