import { describe, expect, it, vi } from 'vitest'
import { PipelineError, type PipelineRequest, type PipelineResult } from '../src/pipeline.ts'
import { ShellEnvStore, type ShellEnvReadConfig } from '../src/shell-env-store.ts'

/** 一份默认打开的读取配置. */
function configOf(overrides: Partial<ShellEnvReadConfig> = {}): ShellEnvReadConfig {
  return {
    enabled: true,
    stages: [{ index: 1, command: 'read-env' }],
    importNames: ['PATH'],
    customEnv: '',
    envTimeoutMs: 5_000,
    filterNoise: false,
    ...overrides,
  }
}

/** 造一个 store, 并记录流水线被调用了多少次. */
function makeStore(options: {
  result?: PipelineResult | Error
  baseEnv?: Record<string, string>
  logger?: { info: (message: string) => void, warn: (message: string) => void }
} = {}) {
  const calls: PipelineRequest[] = []
  const store = new ShellEnvStore({
    readConfig: () => configOf(),
    baseEnv: () => options.baseEnv ?? { PATH: '/base', DROP: 'ambient' },
    runPipeline: async (request) => {
      calls.push(request)
      if (options.result instanceof Error) throw options.result
      return options.result ?? { env: { PATH: '/from/snapshot' }, durationMs: 7, stageCount: 1, skipped: 0 }
    },
    ...options.logger === undefined ? {} : { logger: options.logger },
    now: () => new Date('2026-01-02T03:04:05.000Z'),
  })
  return { store, calls }
}

describe('ShellEnvStore', () => {
  it('只注入白名单命中的快照值, 再叠上自定义 env (含删除语义)', async () => {
    const { store } = makeStore({ result: { env: { PATH: '/from/snapshot', LANG: 'en_US.UTF-8' }, durationMs: 7, stageCount: 1, skipped: 0 } })
    store.applyConfig(configOf({
      importNames: ['PATH'],
      customEnv: 'PATH=$PATH:/custom\nEXTRA=1\nDROP=',
    }))
    await store.refresh('manual')
    expect(store.injectedEnv()).toEqual({ PATH: '/from/snapshot:/custom', EXTRA: '1', DROP: undefined })
    expect(store.status()).toMatchObject({
      phase: 'ready',
      enabled: true,
      lastReadAt: '2026-01-02T03:04:05.000Z',
      durationMs: 7,
      importedCount: 3,
      importedNames: ['DROP', 'EXTRA', 'PATH'],
    })
  })

  it('并发的刷新复用同一次读取', async () => {
    const { store, calls } = makeStore()
    store.applyConfig(configOf())
    const first = store.refresh('manual')
    const second = store.refresh('manual')
    expect(first).toBe(second)
    await Promise.all([first, second])
    expect(calls).toHaveLength(1)
    await store.refresh('manual')
    expect(calls).toHaveLength(2)
  })

  it('读取失败时保留上一次成功的快照, 状态带上失败级号', async () => {
    let runs = 0
    const store = new ShellEnvStore({
      readConfig: () => configOf(),
      baseEnv: () => ({}),
      runPipeline: async () => {
        runs += 1
        if (runs > 1) throw new PipelineError('boom', 2, 'read-env', 'exit')
        return { env: { PATH: '/good' }, durationMs: 1, stageCount: 1, skipped: 0 }
      },
      logger: { info: () => {}, warn: () => {} },
    })
    store.applyConfig(configOf())
    await store.refresh('manual')
    expect(store.injectedEnv()).toEqual({ PATH: '/good' })
    await store.refresh('manual')
    expect(store.status()).toMatchObject({
      phase: 'failed',
      importedNames: ['PATH'],
      error: { stage: 2, command: 'read-env', message: 'boom' },
    })
    // 上一次成功的注入层还在, 命令不会突然掉回最小 PATH.
    expect(store.injectedEnv()).toEqual({ PATH: '/good' })
  })

  it('关掉开关立刻清空快照与注入层', async () => {
    const { store } = makeStore()
    store.applyConfig(configOf())
    await store.refresh('manual')
    expect(store.injectedEnv()).not.toEqual({})
    store.applyConfig(configOf({ enabled: false }))
    expect(store.injectedEnv()).toEqual({})
    expect(store.status()).toMatchObject({ phase: 'disabled', enabled: false, importedCount: 0 })
  })

  it('配置不合法时状态失败, 且不执行任何命令', async () => {
    const { store, calls } = makeStore()
    store.applyConfig(configOf({ customEnv: 'DSH_HOME=/tmp' }))
    expect(store.status().phase).toBe('failed')
    expect(store.status().error?.message).toMatch(/reserved/)
    expect(calls).toHaveLength(0)
  })

  it('没有启用的级时不跑命令, 只应用自定义 env', async () => {
    const { store, calls } = makeStore()
    store.applyConfig(configOf({ stages: [], customEnv: 'ONLY=custom' }))
    await store.refresh('manual')
    expect(calls).toHaveLength(0)
    expect(store.status()).toMatchObject({ phase: 'ready', importedCount: 1, importedNames: ['ONLY'] })
    expect(store.injectedEnv()).toEqual({ ONLY: 'custom' })
  })

  it('同一份配置重复应用不会重复触发读取', async () => {
    const { store, calls } = makeStore()
    store.applyConfig(configOf())
    await store.refresh('manual')
    store.applyConfig(configOf())
    await Promise.resolve()
    expect(calls).toHaveLength(1)
  })

  it('日志里不出现任何变量值', async () => {
    const info = vi.fn()
    const warn = vi.fn()
    const { store } = makeStore({ logger: { info, warn }, result: { env: { PATH: '/secret/path' }, durationMs: 3, stageCount: 1, skipped: 0 } })
    store.applyConfig(configOf())
    await store.refresh('manual')
    const logged = [...info.mock.calls, ...warn.mock.calls].flat().join(' ')
    expect(logged).toContain('1 variables')
    expect(logged).not.toContain('/secret/path')
  })

  it('输出容错开关会传给流水线, 丢弃段数进状态', async () => {
    const { store, calls } = makeStore({ result: { env: { PATH: '/x' }, durationMs: 2, stageCount: 1, skipped: 3 } })
    store.applyConfig(configOf({ filterNoise: true }))
    await store.refresh('manual')
    expect(calls[0]?.filterNoise).toBe(true)
    expect(store.status()).toMatchObject({ phase: 'ready', skippedSegments: 3 })

    const strict = makeStore({ result: { env: { PATH: '/x' }, durationMs: 2, stageCount: 1, skipped: 0 } })
    strict.store.applyConfig(configOf())
    await strict.store.refresh('manual')
    expect(strict.calls[0]?.filterNoise).toBe(false)
    // 没有丢东西时状态里不出现这个字段.
    expect(strict.store.status().skippedSegments).toBeUndefined()
  })
})
