// Client bundle 的最小入口验证: 构建产物在 VM 中以假 module loader 执行,
// 断言 registration id 等于包名, inject 与 apply 齐备, 产物没有顶层 ESM import/export,
// 并且 apply 能在假 ctx 上跑完一整轮 (注册字典, 建表单, 注册卡片).
// 平台模块 (react, dsh-client-store, ui-primitives) 由 loader 的模块表提供, 其余逻辑必须内联.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { beforeAll, describe, expect, it } from 'vitest'

const PLUGIN_ID = 'dsh-load-shell-env'
const ENTRY_ID = 'load-shell-env'

/** loader 模块表里本插件允许请求的模块. */
const PLATFORM_MODULES = new Set([
  'react',
  'react/jsx-runtime',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-primitives',
])

/** 请求过的模块, 由假 loader 记录. */
const requested: string[] = []

/** 平台模块的最小替身: 形状够 factory 与 apply 跑通即可. */
function fakePlatformModule(id: string): unknown {
  if (id === 'react') {
    return {
      createElement: () => null,
      useEffect: () => {},
      useState: () => [null, () => {}],
    }
  }
  if (id === 'react/jsx-runtime') {
    return { jsx: () => null, jsxs: () => null, Fragment: null }
  }
  if (id === '@deepseek-ai/dsh-client-store') {
    return {
      createSnapshotStore: (initial: unknown) => {
        let state = initial
        return { getSnapshot: () => state, set: (next: unknown) => { state = next }, subscribe: () => () => {} }
      },
    }
  }
  if (id === '@deepseek-ai/dsh-client-ui-primitives') {
    return {
      Button: () => null,
      Input: () => null,
      SettingsForm: () => null,
      Switch: () => null,
      Tag: () => null,
    }
  }
  throw new Error(`unexpected require: ${id}`)
}

let code: string

beforeAll(() => {
  code = readFileSync(fileURLToPath(new URL('../lib/client.js', import.meta.url)), 'utf8')
})

/** 在 VM 里执行产物并取回 loader registration. */
function loadModule(): { id?: string, factory?: (require: (id: string) => unknown) => Record<string, unknown> } {
  const registrations: unknown[] = []
  const sandbox = {
    window: { __ModuleLoader__: { load: (registration: unknown) => registrations.push(registration) } },
    require: (id: string) => fakePlatformModule(id),
  }
  vm.createContext(sandbox)
  vm.runInContext(code, sandbox)
  expect(registrations).toHaveLength(1)
  return registrations[0] as { id?: string, factory?: (require: (id: string) => unknown) => Record<string, unknown> }
}

/** 造一个够 apply 跑完的假客户端上下文. */
function fakeContext() {
  const state = {
    registeredDictionaries: [] as string[],
    servedNamespaces: [] as string[][],
    slots: [] as { slot: string, options: Record<string, unknown> }[],
    effects: 0,
  }
  const scope = {
    getSnapshot: () => ({ status: 'ready', value: { enabled: true, importNames: ['PATH'] }, base: {}, user: {}, writable: true, revision: 3 }),
    subscribe: () => () => {},
    mutate: async () => true,
  }
  const ctx = {
    effect: (register: () => unknown) => { state.effects += 1; register(); return () => {} },
    locale: {
      bind: () => (key: string) => key,
      register: (namespace: string) => { state.registeredDictionaries.push(namespace); return () => {} },
    },
    configForms: {
      get: () => scope,
      whileServed: (namespaces: string[], register: () => () => void) => {
        state.servedNamespaces.push(namespaces)
        return register()
      },
    },
    slots: {
      inject: (_slot: string, register: () => unknown) => { register(); return () => {} },
      register: (options: Record<string, unknown>) => { state.slots.push({ slot: String(options['name']), options }); return () => {} },
    },
  }
  return { ctx: ctx as unknown, state }
}

describe('client bundle loader 注册', () => {
  it('产物包含 __ModuleLoader__.load 且无顶层 ESM import/export', () => {
    expect(code).toContain('__ModuleLoader__.load')
    expect(code).not.toMatch(/^import\s/m)
    expect(code).not.toMatch(/^export\s/m)
  })

  it('registration id 等于包名, factory 返回的模块带 inject 与 apply', () => {
    const handoff = loadModule()
    expect(handoff.id).toBe(PLUGIN_ID)
    expect(typeof handoff.factory).toBe('function')
    const moduleExports = handoff.factory!((id: string) => {
      requested.push(id)
      return fakePlatformModule(id)
    })
    expect(moduleExports['inject']).toEqual(['configForms', 'slots', 'locale'])
    expect(typeof moduleExports['apply']).toBe('function')
  })

  it('只向 loader 请求模块表里的模块, 其余逻辑全部内联', () => {
    requested.length = 0
    const handoff = loadModule()
    handoff.factory!((id: string) => {
      requested.push(id)
      return fakePlatformModule(id)
    })
    for (const id of requested) expect(PLATFORM_MODULES.has(id)).toBe(true)
    // 用稳定标识断言内联, 不绑界面文案.
    expect(code).toContain('plugins.bundle.config')
    expect(code).toContain('/api/plugins/dsh-load-shell-env/status')
    expect(code).toContain('/api/plugins/dsh-load-shell-env/refresh')
  })

  it('apply 能注册字典并在插件页槽位上挂出卡片', () => {
    const handoff = loadModule()
    const moduleExports = handoff.factory!((id: string) => fakePlatformModule(id))
    const { ctx, state } = fakeContext()
    ;(moduleExports['apply'] as (ctx: unknown) => void)(ctx)
    expect(state.registeredDictionaries).toEqual([ENTRY_ID])
    expect(state.servedNamespaces).toEqual([[ENTRY_ID]])
    expect(state.slots).toHaveLength(1)
    expect(state.slots[0]?.slot).toBe('plugins.bundle.config')
    expect(state.slots[0]?.options['key']).toBe(PLUGIN_ID)
    const face = (state.slots[0]?.options['inject'] as () => Record<string, unknown>)()
    expect(typeof face['save']).toBe('function')
    expect(typeof face['refresh']).toBe('function')
    expect(typeof face['addStage']).toBe('function')
    expect(face['t']).toBeTypeOf('function')
  })
})
