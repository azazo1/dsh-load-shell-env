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

/** 造一个只带 effect 与 webServer 的宿主上下文. */
function fakeContext(): { ctx: Context, routes: Map<string, Route> } {
  const routes = new Map<string, Route>()
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
  }
  return { ctx: ctx as unknown as Context, routes }
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

  it('带 sec-fetch-mode 时只接受 same-origin / cors', async () => {
    const { ctx, routes } = fakeContext()
    const { host, refreshes } = fakeHost()
    mountShellEnvRoutes(ctx, host)
    const route = routes.get(`exact:${REFRESH_PATH}`)!
    const headers = { 'content-type': 'application/json', [REFRESH_HEADER]: '1', 'sec-fetch-mode': 'navigate' }
    expect((await call(route, 'POST', headers, '{}')).status).toBe(403)
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
