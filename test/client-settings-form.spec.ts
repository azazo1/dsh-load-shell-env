import type { SettingsFormPathOp, SettingsFormScope } from '@deepseek-ai/dsh-client-ui-primitives'
import { describe, expect, it, vi } from 'vitest'
import { ShellEnvSettingsForm, type ShellEnvSettings } from '../src/client/settings-form.ts'

// 平台模块的替身: 真的 @deepseek-ai/dsh-client-store 会去 require zustand / immer,
// 那些是宿主侧的传递依赖, 本仓的 node_modules 里不一定解析得到 (这里测的是暂存层, 不是 store).
vi.mock('@deepseek-ai/dsh-client-store', () => ({
  createSnapshotStore: (initial: unknown) => {
    let state = initial
    return {
      getSnapshot: () => state,
      set: (next: unknown) => { state = next },
      subscribe: () => () => {},
    }
  },
}))

/** 一份"Host 已经解析好"的快照. */
function fakeScope(options: {
  value?: ShellEnvSettings
  user?: Record<string, unknown>
  writable?: boolean
} = {}) {
  const snapshot = {
    status: 'ready' as const,
    value: {
      enabled: true,
      stages: [],
      importNames: ['PATH'],
      customEnv: '',
      envTimeoutMs: 10_000,
      filterNoise: false,
      timeoutMs: 60_000,
      maxOutputBytes: 64_000,
      ...options.value ?? {},
    },
    base: { timeoutMs: 60_000 },
    user: options.user ?? {},
    writable: options.writable ?? true,
    revision: 7,
  }
  const mutate = vi.fn(async (_ops: readonly SettingsFormPathOp[]) => true)
  const scope = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    mutate,
  } as unknown as SettingsFormScope<ShellEnvSettings>
  return { form: new ShellEnvSettingsForm(scope), mutate }
}

describe('ShellEnvSettingsForm 的 executor 旋钮', () => {
  it('默认展示生效值, 且不算已覆盖', () => {
    const { form } = fakeScope()
    const state = form.inject().hooks.shellEnvCard.getSnapshot()
    expect(state.timeoutMsText).toBe('60000')
    expect(state.maxOutputBytesText).toBe('64000')
    expect(state.overridden.timeoutMs).toBe(false)
    expect(state.dirty).toBe(false)
  })

  it('改一个值就变 dirty, 保存落成 set 操作', async () => {
    const { form, mutate } = fakeScope()
    const face = form.inject()
    face.editCommandTimeoutText('30000')
    expect(face.hooks.shellEnvCard.getSnapshot()).toMatchObject({ dirty: true, invalid: false })
    await form.save()
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0]?.[0]).toEqual([{ op: 'set', path: ['timeoutMs'], value: 30_000 }])
  })

  it('恢复默认落成 unset (回落到组合层), 且只在用户层确实有该字段时写', async () => {
    const { form, mutate } = fakeScope({ user: { timeoutMs: 30_000 } })
    const face = form.inject()
    expect(face.hooks.shellEnvCard.getSnapshot().overridden.timeoutMs).toBe(true)
    face.resetField('timeoutMsText')
    await form.save()
    expect(mutate.mock.calls[0]?.[0]).toEqual([{ op: 'unset', path: ['timeoutMs'] }])
    // 用户层没有这个字段时, "恢复默认" 不产生任何写入.
    const clean = fakeScope()
    clean.form.inject().resetField('timeoutMsText')
    expect(clean.form.inject().hooks.shellEnvCard.getSnapshot().dirty).toBe(false)
  })

  it('非法数字挡住保存, 并且不产生写入', async () => {
    for (const bad of ['0', '', '-5', '1.5', 'abc']) {
      const { form, mutate } = fakeScope()
      const face = form.inject()
      face.editMaxOutputBytesText(bad)
      const state = face.hooks.shellEnvCard.getSnapshot()
      expect(state.maxOutputBytesInvalid, bad).toBe(true)
      expect(state.invalid, bad).toBe(true)
      await form.save()
      expect(mutate, bad).not.toHaveBeenCalled()
    }
  })

  it('和环境同步的改动合成同一次写入', async () => {
    const { form, mutate } = fakeScope()
    const face = form.inject()
    face.editCommandTimeoutText('45000')
    face.setFilterNoise(true)
    await form.save()
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0]?.[0]).toEqual([
      { op: 'set', path: ['timeoutMs'], value: 45_000 },
      { op: 'set', path: ['filterNoise'], value: true },
    ])
  })

  it('只读部署下保存不发起写入', async () => {
    const { form, mutate } = fakeScope({ writable: false })
    const face = form.inject()
    face.editCommandTimeoutText('30000')
    await form.save()
    expect(mutate).not.toHaveBeenCalled()
  })
})
