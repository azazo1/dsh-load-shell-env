import type { Volatile } from '@deepseek-ai/cordis'
import { LocalBashExecutor } from '@deepseek-ai/dsh-bash-local'
import { describe, expect, it } from 'vitest'
import { Config, ShellEnvConfigError, validateShellEnvConfig, type ShellEnvConfig } from '../src/config.ts'
import { DEFAULT_ENV_TIMEOUT_MS, EXECUTOR_FIELDS, FIELD } from '../src/constants.ts'

/** 把普通值包成 volatile 引用. */
function ref<T>(value: T): Volatile<T> {
  return { get: () => value } as unknown as Volatile<T>
}

/** 组装一份可通过校验的配置, 再按需覆盖字段. */
function configOf(overrides: Partial<{
  enabled: boolean
  stages: { command: string, enabled?: boolean }[]
  importNames: string[]
  customEnv: string
  envTimeoutMs: number
  filterNoise: boolean
}> = {}): ShellEnvConfig {
  return {
    cwd: ref<string | undefined>(undefined),
    timeoutMs: ref(60_000),
    maxTimeoutMs: ref(600_000),
    maxOutputBytes: ref(64_000),
    maxSpillBytes: ref(1_024),
    graceMs: ref(3_000),
    enabled: ref(overrides.enabled ?? false),
    stages: ref(overrides.stages ?? []),
    importNames: ref(overrides.importNames ?? ['PATH']),
    customEnv: ref(overrides.customEnv ?? ''),
    envTimeoutMs: ref(overrides.envTimeoutMs ?? DEFAULT_ENV_TIMEOUT_MS),
    filterNoise: ref(overrides.filterNoise ?? false),
  }
}

describe('Config schema', () => {
  it('是 LocalBashExecutor.Config 的超集: executor 字段与自己的字段一个不少', () => {
    const base = Object.keys(LocalBashExecutor.Config.dict ?? {})
    const ours = Object.keys(Config.dict ?? {})
    expect(new Set(ours)).toEqual(new Set([...base, ...Object.values(FIELD)]))
  })

  it('继承来的 executor 字段默认值与原版逐字一致', () => {
    for (const name of EXECUTOR_FIELDS) {
      expect(Config.dict?.[name]?.meta.default).toEqual(LocalBashExecutor.Config.dict?.[name]?.meta.default)
    }
  })

  it('自己的字段都是 volatile 且默认值固定', () => {
    expect(Config.dict?.[FIELD.enabled]?.meta.volatile).toBe(true)
    expect(Config.dict?.[FIELD.enabled]?.meta.default).toBe(false)
    expect(Config.dict?.[FIELD.stages]?.meta.default).toEqual([])
    expect(Config.dict?.[FIELD.importNames]?.meta.default).toEqual(['PATH'])
    expect(Config.dict?.[FIELD.customEnv]?.meta.default).toBe('')
    expect(Config.dict?.[FIELD.envTimeoutMs]?.meta.default).toBe(DEFAULT_ENV_TIMEOUT_MS)
    expect(Config.dict?.[FIELD.envTimeoutMs]?.meta.volatile).toBe(true)
    // 输出容错默认关闭: 严格模式是默认语义.
    expect(Config.dict?.[FIELD.filterNoise]?.meta.default).toBe(false)
    expect(Config.dict?.[FIELD.filterNoise]?.meta.volatile).toBe(true)
  })
})

describe('validateShellEnvConfig', () => {
  it('默认配置合法', () => {
    expect(() => { validateShellEnvConfig(configOf()) }).not.toThrow()
  })

  it('启用的级不能是空命令, 停用的可以留空', () => {
    expect(() => { validateShellEnvConfig(configOf({ stages: [{ command: '   ' }] })) }).toThrow(ShellEnvConfigError)
    expect(() => { validateShellEnvConfig(configOf({ stages: [{ command: '', enabled: false }] })) }).not.toThrow()
  })

  it('导入名单的名字要合法且不能占用 DSH_ 命名空间', () => {
    expect(() => { validateShellEnvConfig(configOf({ importNames: ['1BAD'] })) }).toThrow(/importNames/)
    expect(() => { validateShellEnvConfig(configOf({ importNames: ['DSH_HOME'] })) }).toThrow(/reserved/)
  })

  it('自定义 env 的名字同样受限', () => {
    expect(() => { validateShellEnvConfig(configOf({ customEnv: 'DSH_SESSION_ID=1' })) }).toThrow(/reserved/)
    expect(() => { validateShellEnvConfig(configOf({ customEnv: 'PATH=$PATH:/extra' })) }).not.toThrow()
  })

  it('超时必须是非负整数以外的正整数', () => {
    expect(() => { validateShellEnvConfig(configOf({ envTimeoutMs: 0 })) }).toThrow(/envTimeoutMs/)
    expect(() => { validateShellEnvConfig(configOf({ envTimeoutMs: 1.5 })) }).toThrow(/envTimeoutMs/)
  })
})
