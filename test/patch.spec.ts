/**
 * cordis.patch.yml 的真实语义验证.
 *
 * 这是插件最脆的一处集成点: patch 匹配不到只会"跳过并告警", 于是我们会和内置的
 * `bash-sandbox` 或 `pwsh-sandbox` 抢同一个 `ctx.shell` 服务, 结果是 Host 启动失败;
 * 而 `!!js` 写坏会被当成普通字符串 (恒真), 插件在任何平台都不生效. 所以这里用
 * dsh 自己的 patch 实现 (Include 的 entryListSchema + applyEntryPatches) 跑一遍.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { applyEntryPatches, entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { ENTRY_ID, PACKAGE_NAME } from '../src/constants.ts'

/** 一份与 base bundle 同形的入口表 (只看我们关心的那几行). */
function baseEntries() {
  return [
    { id: 'sandbox', name: '@deepseek-ai/dsh-sandbox-local' },
    { id: 'sandbox-policy', name: '@deepseek-ai/dsh-sandbox-policy' },
    { id: 'bash-sandbox', name: '@deepseek-ai/dsh-bash-sandbox', disabled: false, config: { timeoutMs: 60_000 } },
    { id: 'pwsh-sandbox', name: '@deepseek-ai/dsh-pwsh-sandbox', disabled: true },
  ]
}

/** 读并解析本包的 bundle patch. */
function loadPatch(): Record<string, unknown>[] {
  const text = readFileSync(fileURLToPath(new URL('../cordis.patch.yml', import.meta.url)), 'utf8')
  return yaml.load(text, { schema: entryListSchema }) as Record<string, unknown>[]
}

/** 用 dsh 的 patch 语义把我们的 patch 叠到入口表上. */
function apply(): { entries: Record<string, any>[], warnings: string[] } {
  const warnings: string[] = []
  const entries = applyEntryPatches(
    baseEntries() as never[],
    loadPatch() as never[],
    (message, ...args) => { warnings.push([message, ...args].join(' ')) },
  ) as unknown as Record<string, any>[]
  return { entries, warnings }
}

/** 取一行. */
function row(entries: Record<string, any>[], id: string): Record<string, any> {
  const found = entries.find(entry => entry['id'] === id)
  if (found === undefined) throw new Error(`row ${id} not found`)
  return found
}

/** `!!js` 表达式在给定平台上的取值. */
function evaluate(expression: string, platform: string): boolean {
  return Boolean(new Function('process', `return (${expression})`)({ platform }))
}

describe('cordis.patch.yml', () => {
  it('停用内置 bash-sandbox, 并插入本插件自己的行', () => {
    const patch = loadPatch()
    expect(patch).toHaveLength(2)
    expect(patch[0]).toMatchObject({ id: 'bash-sandbox', disabled: true })
    const insert = patch[1]?.['insert'] as Record<string, unknown>[]
    expect(insert).toHaveLength(1)
    expect(insert[0]).toMatchObject({ id: ENTRY_ID, name: PACKAGE_NAME })
  })

  it('叠到 base bundle 上时没有任何被跳过的 patch', () => {
    const { entries, warnings } = apply()
    expect(warnings).toEqual([])
    expect(row(entries, 'bash-sandbox')['disabled']).toBe(true)
    // 名字不能被改写, 否则 base bundle 的断言层会失配.
    expect(row(entries, 'bash-sandbox')['name']).toBe('@deepseek-ai/dsh-bash-sandbox')
    expect(row(entries, ENTRY_ID)['name']).toBe(PACKAGE_NAME)
    // 停用内置行会连带丢掉它的 config, 这里必须把同义的默认值带回来.
    expect(row(entries, ENTRY_ID)['config']).toEqual({ timeoutMs: 60_000 })
  })

  it('插入行只在非 Windows 上生效 (Windows 由 pwsh-sandbox 占着同一个服务)', () => {
    const { entries } = apply()
    const disabled = row(entries, ENTRY_ID)['disabled'] as { __jsExpr?: string }
    expect(typeof disabled.__jsExpr).toBe('string')
    const expression = disabled.__jsExpr as string
    expect(evaluate(expression, 'win32')).toBe(true)
    expect(evaluate(expression, 'darwin')).toBe(false)
    expect(evaluate(expression, 'linux')).toBe(false)
  })
})
