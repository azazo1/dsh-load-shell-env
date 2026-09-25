/**
 * 终端环境包装的单元测试.
 *
 * 盯住三件事: 合并规则 (注入层压过 spec.env, tombstone 跳过, 没有可注入的东西时
 * 原样透传), 安装/卸载 (装上是 own property, 卸载恢复 prototype 方法), 以及上游
 * 形状变化时的降级 (不可写 / 没有这个方法时只告警, 不抛).
 */

import type { SubprocessTerminalHandle, SubprocessTerminalSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { describe, expect, it, vi } from 'vitest'
import { installTerminalEnvHook, layerTerminalSpec, type TerminalEnvSource, type TerminalSpawnProvider } from '../src/terminal-env.ts'

/** 一份最小可用的终端 spec. */
function specOf(overrides: Partial<SubprocessTerminalSpawnSpec> = {}): SubprocessTerminalSpawnSpec {
  return {
    argv: ['/bin/bash'],
    cwd: '/tmp',
    rows: 40,
    cols: 160,
    terminalType: 'xterm-256color',
    graceMs: 1_000,
    ...overrides,
  }
}

/** 一个假的开关与注入层来源. */
function sourceOf(options: { enabled?: boolean, injection?: Record<string, string | undefined> } = {}): TerminalEnvSource {
  return {
    enabled: () => options.enabled ?? true,
    injection: () => options.injection ?? {},
  }
}

/** 记录每次 spawn 收到的 spec 的 provider 替身 (方法在 prototype 上, 与真实服务一致). */
class FakeProvider implements TerminalSpawnProvider {
  readonly calls: SubprocessTerminalSpawnSpec[] = []

  spawnTerminal(spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle> {
    this.calls.push(spec)
    return Promise.resolve({} as SubprocessTerminalHandle)
  }
}

/** 一个只会告警的 logger. */
function loggerOf(): { warn: (message: string) => void, messages: string[] } {
  const messages: string[] = []
  return { warn: (message) => { messages.push(message) }, messages }
}

describe('layerTerminalSpec', () => {
  it('开关关闭或注入层为空时原样返回入参对象', () => {
    const spec = specOf()
    expect(layerTerminalSpec(spec, sourceOf({ enabled: false, injection: { PATH: '/injected' } }))).toBe(spec)
    expect(layerTerminalSpec(spec, sourceOf({ injection: {} }))).toBe(spec)
    expect(layerTerminalSpec(spec, sourceOf({ injection: { HOME: undefined } }))).toBe(spec)
  })

  it('注入层压过 spec.env 的同名键, 并保留 spec 的其它字段', () => {
    const spec = specOf({ env: { PATH: '/from-caller', TERM: 'xterm-256color' }, shellActivity: true })
    const layered = layerTerminalSpec(spec, sourceOf({ injection: { PATH: '/injected' } }))
    expect(layered).not.toBe(spec)
    expect(layered.env).toEqual({ PATH: '/injected', TERM: 'xterm-256color' })
    expect(layered.shellActivity).toBe(true)
    expect(layered.argv).toEqual(['/bin/bash'])
    // 入参不被改动.
    expect(spec.env).toEqual({ PATH: '/from-caller', TERM: 'xterm-256color' })
  })

  it('spec 没有 env 时也能合并', () => {
    const layered = layerTerminalSpec(specOf(), sourceOf({ injection: { PATH: '/injected' } }))
    expect(layered.env).toEqual({ PATH: '/injected' })
  })

  it('tombstone (自定义 env 的 KEY=) 不进入终端 spec', () => {
    const layered = layerTerminalSpec(
      specOf({ env: { TERM: 'xterm-256color' } }),
      sourceOf({ injection: { PATH: '/injected', HOME: undefined } }),
    )
    expect(layered.env).toEqual({ TERM: 'xterm-256color', PATH: '/injected' })
    expect(Object.hasOwn(layered.env as object, 'HOME')).toBe(false)
  })
})

describe('installTerminalEnvHook', () => {
  it('包装后每次 spawn 都带上注入层, 卸载后恢复 prototype 方法', async () => {
    const provider = new FakeProvider()
    const logger = loggerOf()
    const hook = installTerminalEnvHook(provider, sourceOf({ injection: { PATH: '/injected' } }), logger)

    expect(hook.hooked).toBe(true)
    expect(logger.messages).toEqual([])
    await provider.spawnTerminal(specOf({ env: { DSH_SESSION_ID: 'agent-1' } }))
    expect(provider.calls[0]?.env).toEqual({ DSH_SESSION_ID: 'agent-1', PATH: '/injected' })

    hook.dispose()
    expect(Object.hasOwn(provider, 'spawnTerminal')).toBe(false)
    await provider.spawnTerminal(specOf({ env: { DSH_SESSION_ID: 'agent-1' } }))
    expect(provider.calls[1]?.env).toEqual({ DSH_SESSION_ID: 'agent-1' })
  })

  it('开关与注入层每次 spawn 重新读, volatile 改动立刻生效', async () => {
    const provider = new FakeProvider()
    let enabled = false
    let injection: Record<string, string | undefined> = { PATH: '/injected' }
    const hook = installTerminalEnvHook(provider, { enabled: () => enabled, injection: () => injection }, loggerOf())

    await provider.spawnTerminal(specOf())
    expect(provider.calls[0]?.env).toBeUndefined()

    enabled = true
    await provider.spawnTerminal(specOf())
    expect(provider.calls[1]?.env).toEqual({ PATH: '/injected' })

    injection = {}
    await provider.spawnTerminal(specOf())
    expect(provider.calls[2]?.env).toBeUndefined()
    hook.dispose()
  })

  it('provider 原本就自带同名实例属性时, 卸载恢复那一个函数', () => {
    const calls: SubprocessTerminalSpawnSpec[] = []
    const original = (spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle> => {
      calls.push(spec)
      return Promise.resolve({} as SubprocessTerminalHandle)
    }
    const provider: TerminalSpawnProvider = { spawnTerminal: original }
    const hook = installTerminalEnvHook(provider, sourceOf({ injection: { PATH: '/injected' } }), loggerOf())
    expect(hook.hooked).toBe(true)
    hook.dispose()
    expect(provider.spawnTerminal).toBe(original)
  })

  it('不可写的 provider 只告警, 不抛也不装', () => {
    const provider = new FakeProvider()
    Object.defineProperty(provider, 'spawnTerminal', {
      value: provider.spawnTerminal,
      writable: false,
      configurable: true,
    })
    const logger = loggerOf()
    const hook = installTerminalEnvHook(provider, sourceOf({ injection: { PATH: '/injected' } }), logger)
    expect(hook.hooked).toBe(false)
    expect(logger.messages).toHaveLength(1)
    expect(logger.messages[0]).toContain('rejects a wrapped spawnTerminal')
    expect(() => { hook.dispose() }).not.toThrow()
  })

  it('没有 spawnTerminal 的 provider 只告警', () => {
    const logger = loggerOf()
    const hook = installTerminalEnvHook({} as TerminalSpawnProvider, sourceOf(), logger)
    expect(hook.hooked).toBe(false)
    expect(logger.messages[0]).toContain('has no spawnTerminal method')
  })

  it('重复 dispose 是空操作, 也不会抹掉别人的包装', () => {
    const provider = new FakeProvider()
    const hook = installTerminalEnvHook(provider, sourceOf({ injection: { PATH: '/injected' } }), loggerOf())
    const stranger = vi.fn(async () => Promise.resolve({} as SubprocessTerminalHandle))
    provider.spawnTerminal = stranger
    hook.dispose()
    expect(provider.spawnTerminal).toBe(stranger)
    hook.dispose()
    expect(provider.spawnTerminal).toBe(stranger)
  })
})
