import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { REFRESH_HEADER, REFRESH_PATH, STATUS_PATH } from '../src/constants.ts'
import { mountShellEnvRoutes, type ShellEnvRouteHost } from '../src/routes.ts'
import { initialStatus, type ShellEnvStatus } from '../src/shared/status.ts'

/** 注册进假 webServer 的一条路由. */
interface Route {
  kind: string
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/**
 * 造一个只带 effect, webServer 与 connection 的宿主上下文.
 * @param rejection - connection 的裁决结果; undefined 表示放行, null 表示没有 connection 服务.
 */
function fakeContext(rejection: 401 | 403 | undefined | null = undefined): {
  ctx: Context
  routes: Map<string, Route>
  rejections: () => number
} {
  const routes = new Map<string, Route>()
  const requestRejection = vi.fn((): 401 | 403 | undefined => (rejection === null ? undefined : rejection))
  const ctx = {
    effect: (register: () => unknown) => { register(); return () => {} },
    webServer: {
      register: (route: Route) => {
        const key = `${route.kind}:${route.path}`
        if (routes.has(key)) throw new Error(`duplicate route ${key}`)
        routes.set(key, route)
        return () => { routes.delete(key) }
      },
    },
    // 惰性 get: 被测代码每次请求都会问一次, 缓存与否都能在这里看出来.
    get: (name: string) => (name === 'connection' && rejection !== null ? { requestRejection } : undefined),
  }
  return { ctx: ctx as unknown as Context, routes, rejections: () => requestRejection.mock.calls.length }
}

/** 只实现被测代码用到的那几个成员的假请求. */
class FakeRequest implements AsyncIterable<Buffer> {
  constructor(
    readonly method: string,
    readonly headers: Record<string, string>,
    private readonly body = '',
  ) {}

  async *[Symbol.asyncIterator](): AsyncGenerator<Buffer> {
    if (this.body !== '') yield Buffer.from(this.body, 'utf8')
  }
}

/** 记录 writeHead/end 的假响应. */
function fakeResponse() {
  const state = { status: 0, headers: {} as Record<string, string>, body: '' }
  const res = {
    writeHead: (status: number, headers?: Record<string, string>) => {
      state.status = status
      state.headers = headers ?? {}
    },
    end: (chunk?: string) => { state.body = chunk ?? '' },
  }
  return { res: res as unknown as ServerResponse, state }
}

/** 发一次请求并读回结果. */
async function call(
  route: Route,
  method: string,
  headers: Record<string, string> = {},
  body = '',
): Promise<{ status: number, headers: Record<string, string>, body: string }> {
  const { res, state } = fakeResponse()
  await route.handler(new FakeRequest(method, headers, body) as unknown as IncomingMessage, res)
  return state
}

/** 造一个记录刷新次数的 host. */
function fakeHost(status: ShellEnvStatus = initialStatus(true)): { host: ShellEnvRouteHost, refreshes: () => number } {
  const refresh = vi.fn(async () => status)
  return {
    host: { status: () => status, refresh },
    refreshes: () => refresh.mock.calls.length,
  }
}

describe('mountShellEnvRoutes', () => {
  it('注册两条 exact 路由', () => {
    const { ctx, routes } = fakeContext()
    mountShellEnvRoutes(ctx, fakeHost().host)
    expect([...routes.keys()].sort()).toEqual([`exact:${REFRESH_PATH}`, `exact:${STATUS_PATH}`].sort())
  })

  it('GET 状态返回 JSON, 且不含任何变量值', async () => {
    const { ctx, routes } = fakeContext()
    const status: ShellEnvStatus = {
      phase: 'ready',
      enabled: true,
      lastReadAt: '2026-01-02T03:04:05.000Z',
      durationMs: 5,
      importedCount: 1,
      importedNames: ['PATH'],
    }
    mountShellEnvRoutes(ctx, fakeHost(status).host)
    const response = await call(routes.get(`exact:${STATUS_PATH}`)!, 'GET')
    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    const body = JSON.parse(response.body) as ShellEnvStatus
    expect(body).toEqual(status)
    expect(response.body).not.toContain('/usr/bin')
  })

  it('POST 刷新要求自定义头与 application/json, 通过后触发一次读取', async () => {
    const { ctx, routes } = fakeContext()
    const { host, refreshes } = fakeHost()
    mountShellEnvRoutes(ctx, host)
    const route = routes.get(`exact:${REFRESH_PATH}`)!
    const headers = { 'content-type': 'application/json', [REFRESH_HEADER]: '1' }

    const ok = await call(route, 'POST', headers, '{}')
    expect(ok.status).toBe(200)
    expect(refreshes()).toBe(1)

    expect((await call(route, 'POST', { 'content-type': 'application/json' }, '{}')).status).toBe(400)
    expect((await call(route, 'POST', { [REFRESH_HEADER]: '1' }, '{}')).status).toBe(400)
    expect(refreshes()).toBe(1)
  })

  it('不再按 sec-fetch-mode 单独设限: navigate 也放行', async () => {
    const { ctx, routes } = fakeContext()
    const { host, refreshes } = fakeHost()
    mountShellEnvRoutes(ctx, host)
    const route = routes.get(`exact:${REFRESH_PATH}`)!
    const headers = { 'content-type': 'application/json', [REFRESH_HEADER]: '1', 'sec-fetch-mode': 'navigate' }
    expect((await call(route, 'POST', headers, '{}')).status).toBe(200)
    expect(refreshes()).toBe(1)
  })

  it('认证拒绝时两条路由都按裁决的状态码结束, 且不触发读取', async () => {
    for (const rejection of [401, 403] as const) {
      const { ctx, routes, rejections } = fakeContext(rejection)
      const { host, refreshes } = fakeHost()
      mountShellEnvRoutes(ctx, host)
      const status = await call(routes.get(`exact:${STATUS_PATH}`)!, 'GET')
      expect(status.status).toBe(rejection)
      const refreshHeaders = { 'content-type': 'application/json', [REFRESH_HEADER]: '1' }
      const refresh = await call(routes.get(`exact:${REFRESH_PATH}`)!, 'POST', refreshHeaders, '{}')
      expect(refresh.status).toBe(rejection)
      // 每个请求都重新取一次服务 (惰性), 而不是挂载时缓存一次.
      expect(rejections()).toBe(2)
      expect(refreshes()).toBe(0)
    }
  })

  it('取不到 connection 服务时 fail closed (503), 不静默放行', async () => {
    const { ctx, routes } = fakeContext(null)
    const { host, refreshes } = fakeHost()
    mountShellEnvRoutes(ctx, host)
    expect((await call(routes.get(`exact:${STATUS_PATH}`)!, 'GET')).status).toBe(503)
    const headers = { 'content-type': 'application/json', [REFRESH_HEADER]: '1' }
    expect((await call(routes.get(`exact:${REFRESH_PATH}`)!, 'POST', headers, '{}')).status).toBe(503)
    expect(refreshes()).toBe(0)
  })

  it('请求体超限时拒绝', async () => {
    const { ctx, routes } = fakeContext()
    const { host, refreshes } = fakeHost()
    mountShellEnvRoutes(ctx, host)
    const route = routes.get(`exact:${REFRESH_PATH}`)!
    const headers = { 'content-type': 'application/json', [REFRESH_HEADER]: '1' }
    expect((await call(route, 'POST', headers, 'x'.repeat(8_192))).status).toBe(400)
    expect(refreshes()).toBe(0)
  })

  it('方法不对时 405 并给出 Allow', async () => {
    const { ctx, routes } = fakeContext()
    const { host, refreshes } = fakeHost()
    mountShellEnvRoutes(ctx, host)
    const status = await call(routes.get(`exact:${STATUS_PATH}`)!, 'POST')
    expect(status.status).toBe(405)
    expect(status.headers['allow']).toBe('GET')
    const refresh = await call(routes.get(`exact:${REFRESH_PATH}`)!, 'GET')
    expect(refresh.status).toBe(405)
    expect(refresh.headers['allow']).toBe('POST')
    expect(refreshes()).toBe(0)
  })
})
