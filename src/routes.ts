/**
 * 配置页用到的两条 exact 路由.
 *
 * 路径挂在 `/api/plugins/...` 下, 但路由匹配是"先全表精确匹配, 再最长前缀, 最后
 * fallback", 所以这两条会先于 connection 注册的 `/api` 前缀路由命中. 认证因此不靠
 * 前缀路由顺带覆盖, 而是由 handler 自己向 connection 服务要一次裁决
 * (`requestRejection`): 同一套 Host/Origin 栅栏 (挡 DNS rebinding) 与浏览器会话
 * cookie 认证, 与 `/api` 前缀下的请求完全一致. 栅栏之外剩下的检查只是防误触:
 * 自定义头, Content-Type, 请求体上限, 单飞幂等, 拿不到任何环境值.
 * @module dsh-load-shell-env/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { MAX_REQUEST_BODY_BYTES, REFRESH_HEADER, REFRESH_PATH, STATUS_PATH } from './constants.ts'
import type { ShellEnvStatus } from './shared/status.ts'

/**
 * 认证栅栏的最小结构类型: connection 服务由 client-connection 插件提供,
 * 本包是独立发布的, 不 import 它的内部类型.
 */
type ConnectionHandle = { requestRejection(request: { headers: unknown }): 401 | 403 | undefined }

/**
 * 取当前请求的认证栅栏.
 *
 * 必须每次请求惰性读取: 本插件的 apply 早于 connection 服务 provide, 在挂载时取一次
 * 再缓存会永久拿到 undefined, 认证就被静默跳过了.
 */
function connectionOf(ctx: Context): ConnectionHandle | undefined {
  return ctx.get('connection') as ConnectionHandle | undefined
}

/**
 * 过一遍 dsh 的 Host/Origin 栅栏与浏览器会话认证.
 * @param ctx - 路由所在的作用域上下文.
 * @param req - 待裁决的请求.
 * @param res - 被拒绝时由这里写响应.
 * @returns true 表示请求已被拒绝 (响应已写好), 调用方直接返回.
 */
function rejected(ctx: Context, req: IncomingMessage, res: ServerResponse): boolean {
  const connection = connectionOf(ctx)
  if (connection === undefined) {
    // fail closed: 认证服务缺席时既不服务也不放行未认证的请求.
    sendEmpty(res, 503)
    return true
  }
  const rejection = connection.requestRejection(req)
  if (rejection === undefined) return false
  sendEmpty(res, rejection)
  return true
}

/** 路由要读的状态面. */
export interface ShellEnvRouteHost {
  /** 读当前状态 (无副作用). */
  status(): ShellEnvStatus
  /** 手动重读一次并返回最新状态. */
  refresh(): Promise<ShellEnvStatus>
}

/**
 * 注册状态与刷新路由.
 * @param ctx - 已经拿到 webServer 与 connection 服务的宿主上下文.
 * @param host - 状态与刷新入口.
 */
export function mountShellEnvRoutes(ctx: Context, host: ShellEnvRouteHost): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: STATUS_PATH,
    handler: (req, res) => {
      if (rejected(ctx, req, res)) return
      handleStatus(req, res, host)
    },
  }), 'dsh-load-shell-env: status route')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: REFRESH_PATH,
    // 把 promise 交回给 webServer, 让它按同一套 per-request 失败处理 (额外的 throw 也由这里兜住).
    handler: (req, res) => {
      if (rejected(ctx, req, res)) return
      return handleRefresh(req, res, host)
    },
  }), 'dsh-load-shell-env: refresh route')
}

/** GET 状态: 只返回阶段, 时间, 变量名与失败摘要, 不含任何变量值. */
function handleStatus(req: IncomingMessage, res: ServerResponse, host: ShellEnvRouteHost): void {
  if (req.method !== 'GET') {
    sendEmpty(res, 405, 'GET')
    return
  }
  sendJson(res, 200, host.status())
}

/** POST 刷新: 先过认证栅栏, 再走几道防误触检查, 然后触发一次读取并等它结束. */
async function handleRefresh(req: IncomingMessage, res: ServerResponse, host: ShellEnvRouteHost): Promise<void> {
  if (req.method !== 'POST') {
    sendEmpty(res, 405, 'POST')
    return
  }
  if (req.headers[REFRESH_HEADER] !== '1') {
    sendEmpty(res, 400)
    return
  }
  const contentType = req.headers['content-type'] ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) {
    sendEmpty(res, 400)
    return
  }
  if (!await drain(req)) {
    sendEmpty(res, 400)
    return
  }
  try {
    sendJson(res, 200, await host.refresh())
  } catch (error: unknown) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
}

/** 读完请求体; 超过上限返回 false. */
async function drain(req: IncomingMessage): Promise<boolean> {
  let size = 0
  try {
    for await (const chunk of req) {
      size += (chunk as Buffer).length
      if (size > MAX_REQUEST_BODY_BYTES) return false
    }
  } catch {
    return false
  }
  return true
}

/** 写一个 JSON 响应; 状态只读, 一律 no-store. */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

/** 写一个没有响应体的响应. */
function sendEmpty(res: ServerResponse, status: number, allow?: string): void {
  res.writeHead(status, allow === undefined ? {} : { allow })
  res.end()
}
