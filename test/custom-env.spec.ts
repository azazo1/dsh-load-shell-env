import { describe, expect, it } from 'vitest'
import { applyCustomEnv, CustomEnvError, expandVariables, parseCustomEnv } from '../src/custom-env.ts'

/** 解析加应用的便捷入口. */
function resolve(text: string, base: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return applyCustomEnv(parseCustomEnv(text), base)
}

describe('parseCustomEnv', () => {
  it('忽略空行与注释, 去掉行尾回车与成对引号', () => {
    const assignments = parseCustomEnv([
      '# 注释',
      '',
      'PLAIN=value',
      'SINGLE=\'a b\'',
      'DOUBLE="c d"\r',
      '  # 缩进的注释',
      'SPACED = trimmed ',
    ].join('\n'))
    expect(assignments.map(entry => [entry.name, entry.value])).toEqual([
      ['PLAIN', 'value'],
      ['SINGLE', 'a b'],
      ['DOUBLE', 'c d'],
      ['SPACED', 'trimmed'],
    ])
  })

  it('报出没有等号或变量名非法的行', () => {
    expect(() => parseCustomEnv('NO_EQUALS')).toThrow(CustomEnvError)
    expect(() => parseCustomEnv('1BAD=1')).toThrow(/line 1/)
  })
})

describe('expandVariables', () => {
  it('展开 $VAR 与 ${VAR}, 未定义按空串', () => {
    expect(expandVariables('$A/${B}/$C', { A: '1', B: '2' })).toBe('1/2/')
  })

  it('支持 \\$ 转义与孤立的 $', () => {
    expect(expandVariables('\\$A $ A', { A: '1' })).toBe('$A $ A')
  })

  it('拒绝没有收尾或非法的 ${...}', () => {
    expect(() => expandVariables('${A', {})).toThrow(/unterminated/)
    expect(() => expandVariables('${1A}', {})).toThrow(/not a valid variable name/)
  })
})

describe('applyCustomEnv', () => {
  it('展开时能看到继承环境与前面几条的结果', () => {
    expect(resolve('PATH=$PATH:/extra\nPATH=$PATH:/more', { PATH: '/base' })).toEqual({ PATH: '/base:/extra:/more' })
  })

  it('空值是 tombstone, 而不是空串', () => {
    const entries = resolve('DROP=\nKEEP=""\nSET=value', { DROP: 'ambient', KEEP: 'ambient' })
    expect(entries['DROP']).toBeUndefined()
    expect(entries['KEEP']).toBeUndefined()
    expect(Object.hasOwn(entries, 'DROP')).toBe(true)
    expect(entries['SET']).toBe('value')
  })
})
