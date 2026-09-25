/**
 * 配置页用到的两条 exact 路由.
 *
 * 路径挂在 `/api/plugins/...` 下, 但路由匹配是"先全表精确匹配, 再最长前缀, 最后
 * fallback", 所以这两条会先于 connection 注册的 `/api` 前缀路由命中, **不经过**
 * 它那道 admission 校验. 防护因此由这里自己做: 自定义头 + `sec-fetch-mode` +
 * 不返回值 + 单飞幂等. 威胁模型很有限: 本机其它进程即使调到 POST, 最坏结果也只是
 * 让插件多跑一次 user 自己的 shell 配置, 而且拿不到任何环境值.
 * @module dsh-load-shell-env/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { MAX_REQUEST_BODY_BYTES, REFRESH_HEADER, REFRESH_PATH, STATUS_PATH } from './constants.ts'
import type { ShellEnvStatus } from './shared/status.ts'

/** 路由要读的状态面. */
export interface ShellEnvRouteHost {
  /** 读当前状态 (无副作用). */
  status(): ShellEnvStatus
  /** 手动重读一次并返回最新状态. */
  refresh(): Promise<ShellEnvStatus>
}

/**
 * 注册状态与刷新路由.
 * @param ctx - 已经拿到 webServer 服务的宿主上下文.
 * @param host - 状态与刷新入口.
 */
export function mountShellEnvRoutes(ctx: Context, host: ShellEnvRouteHost): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: STATUS_PATH,
    handler: (req, res) => { handleStatus(req, res, host) },
  }), 'dsh-load-shell-env: status route')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: REFRESH_PATH,
    // 把 promise 交回给 webServer, 让它按同一套 per-request 失败处理 (额外的 throw 也由这里兜住).
    handler: (req, res) => handleRefresh(req, res, host),
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

/** POST 刷新: 先过几道防误触检查, 再触发一次读取并等它结束. */
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
  const fetchMode = req.headers['sec-fetch-mode']
  if (fetchMode !== undefined && fetchMode !== 'same-origin' && fetchMode !== 'cors') {
    sendEmpty(res, 403)
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
