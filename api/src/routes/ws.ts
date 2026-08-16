/**
 * WebSocket 流式转发路由 — GET /v1/ws
 *
 * 链路：
 *   WS 握手（preHandler: wsApiKeyAuth 从 query ?api_key= / Authorization header 鉴权）
 *   → 客户端发送首条 JSON 消息（含 model/messages/stream，OpenAI 兼容格式）
 *     （首条消息可携带 api_key 兜底鉴权）
 *   → 未鉴权 → WS 内返回 error JSON 后关闭（不 401 HTTP）
 *   → relayWebSocket 转发（余额预检 → selectChannel → 方案 A/B → 结算）
 *
 * 说明：
 * - 浏览器 WebSocket 无法携带 header，因此 API Key 首选 query ?api_key=，
 *   次选 Authorization header（非浏览器客户端），最后兜底首条消息内 api_key 字段。
 * - @fastify/websocket 采用动态导入：仅注册路由时加载，避免测试/未安装时模块解析失败；
 *   安装由调度方执行 pnpm install 完成。
 *
 * @see services/upstream/ws-relay.ts relayWebSocket
 * @see newapi-migration-guide.md §2.1
 * @module routes
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { verifyApiKey, extractApiKeyFromHeader, type ApiKeyContext } from '../services/auth/apikey';
import { relayWebSocket, wsErrorFrame, type WsClientSocket } from '../services/upstream/ws-relay';

/** 握手期鉴权失败信息（query/header key 无效时由 wsApiKeyAuth 写入 request.wsAuthError） */
export interface WsAuthError {
  code: number;
  message: string;
  type: string;
}

/**
 * WS 握手期鉴权（preHandler）
 *
 * Fastify 的 preHandler 在 WS 握手时执行，此时 query 参数可用（浏览器 WS 无法带 header，
 * 因此 ?api_key= 是首选）。策略：
 *   1. query ?api_key= → verifyApiKey → 有效则注入 request.apiKeyContext
 *   2. Authorization header（非浏览器客户端）→ 同上
 *   3. 都无效/缺失 → 放行握手，由 handleWsConnection 在首条消息阶段兜底（api_key 字段）
 *
 * 注意：此处不做 HTTP 401 拒绝（WS 内错误由 handleWsConnection 以 error JSON 帧返回）。
 *
 * @param request - Fastify 请求对象
 */
export async function wsApiKeyAuth(request: any) {
  // 1. query ?api_key=
  const queryKey = typeof request?.query?.api_key === 'string' && request.query.api_key
    ? request.query.api_key
    : null;
  if (queryKey) {
    const context = await verifyApiKey(queryKey);
    if (context) {
      request.apiKeyContext = context;
      return;
    }
    request.wsAuthError = { code: 401, message: 'Invalid API key', type: 'invalid_request_error' };
    return;
  }

  // 2. Authorization header（非浏览器客户端）
  const headerKey = extractApiKeyFromHeader(request?.headers?.authorization);
  if (headerKey) {
    const context = await verifyApiKey(headerKey);
    if (context) {
      request.apiKeyContext = context;
      return;
    }
    request.wsAuthError = { code: 401, message: 'Invalid API key', type: 'invalid_request_error' };
    return;
  }

  // 3. 都没有 → 放行握手，等首条消息携带 api_key（handleWsConnection 处理）
}

/**
 * 等待客户端首条消息（带超时）
 *
 * @param socket - 客户端 WS socket
 * @param timeoutMs - 超时毫秒数（超时返回 null）
 * @returns 首条消息原始字符串；超时返回 null
 */
function waitForFirstMessage(socket: WsClientSocket, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const onMessage = (data: unknown) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(typeof data === 'string' ? data : String(data));
    };
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      resolve(null);
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off?.('message', onMessage as (...args: any[]) => void)
        ?? socket.removeListener?.('message', onMessage as (...args: any[]) => void);
    };
    socket.on('message', onMessage as (...args: any[]) => void);
  });
}

/** handleWsConnection 可注入项（便于纯单测） */
export interface HandleWsConnectionOptions {
  /** 转发实现（默认 relayWebSocket；测试可注入 mock 断言"不建立转发"） */
  relayImpl?: typeof relayWebSocket;
  /** 首条消息等待超时（默认 60s） */
  firstMessageTimeoutMs?: number;
}

/**
 * WS 连接处理编排：鉴权 → 首条消息 → 转发
 *
 * 鉴权失败（query key 无效 / 首条消息 key 无效 / 无任何 key）→ WS 内返回 error JSON 后
 * 关闭连接，不建立任何转发。
 *
 * @param socket - 客户端 WS socket
 * @param request - Fastify 请求对象（含握手期鉴权结果）
 * @param opts - 可注入项
 */
export async function handleWsConnection(
  socket: WsClientSocket,
  request: any,
  opts: HandleWsConnectionOptions = {},
): Promise<void> {
  const relayImpl = opts.relayImpl ?? relayWebSocket;
  const timeoutMs = opts.firstMessageTimeoutMs ?? 60_000;

  // 1. 握手期鉴权失败（query/header key 无效）→ WS 内错误帧 + 关闭
  if (request?.wsAuthError) {
    const err = request.wsAuthError as WsAuthError;
    socket.send(wsErrorFrame(err.code, err.message, err.type));
    socket.close(4001, 'auth_failed');
    return;
  }

  // 2. 等首条消息（可能携带 api_key 兜底鉴权）
  const raw = await waitForFirstMessage(socket, timeoutMs);
  if (raw === null) {
    socket.close(4002, 'no_first_message');
    return;
  }

  // 3. 首条消息 api_key 兜底鉴权
  let ctx: ApiKeyContext | null = request?.apiKeyContext ?? null;
  if (!ctx) {
    let msgKey: string | null = null;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.api_key === 'string' && parsed.api_key) msgKey = parsed.api_key;
    } catch {
      // 非法 JSON → 交给 relay 报 400（此处无需处理）
    }
    if (msgKey) {
      const verified = await verifyApiKey(msgKey);
      if (verified) {
        ctx = verified;
      } else {
        socket.send(wsErrorFrame(401, 'Invalid API key'));
        socket.close(4001, 'auth_failed');
        return;
      }
    }
  }

  // 4. 仍未鉴权 → 错误帧 + 关闭（不建立转发）
  if (!ctx) {
    socket.send(wsErrorFrame(401, 'Missing API key. Pass ?api_key= or send {"api_key":"sk-..."} as the first message.'));
    socket.close(4001, 'auth_failed');
    return;
  }

  // 5. 转发（余额预检 → 选路 → 方案 A/B → 结算 全在 relayWebSocket 内）
  await relayImpl({
    socket,
    rawFirstMessage: raw,
    ctx: { userId: ctx.userId, apiKeyId: ctx.apiKeyId, keyHash: ctx.keyHash },
  });
}

/**
 * 注册 GET /v1/ws WebSocket 转发端点
 *
 * 注册方式：先注册 @fastify/websocket 插件，再注册带 websocket:true 的路由；
 * preHandler 在 WS 握手时执行（query 参数可用）。
 *
 * @param app - Fastify 实例
 */
export async function wsRoutes(app: FastifyInstance) {
  // 动态导入：@fastify/websocket 仅在注册路由时加载（测试/未安装环境不解析该模块）。
  // 说明：依赖已声明于 package.json，由调度方执行 pnpm install 安装；安装前 tsc 无法解析该
  // 模块类型，故用变量形式的动态导入（运行时行为一致，且不触发 TS2307 模块解析）。
  const pluginId = '@fastify/websocket';
  const websocketModule = (await import(pluginId)) as { default: FastifyPluginAsync };
  await app.register(websocketModule.default);

  // NOTE: @fastify/websocket 的类型增强在动态导入下不生效，websocket:true 需断言
  const routeOptions = {
    websocket: true,
    preHandler: [wsApiKeyAuth],
  } as any;

  app.get('/v1/ws', routeOptions, (socket: any, request: any) => {
    void handleWsConnection(socket as WsClientSocket, request);
  });
}
