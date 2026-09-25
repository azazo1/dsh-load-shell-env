import { describe, expect, it } from 'vitest'
import { parseStageOutput, parseStageOutputWithReport, StageOutputError } from '../src/stage-output.ts'

/** 把若干段拼成 NUL 分隔的输出. */
function nul(...segments: string[]): Buffer {
  return Buffer.from(segments.map(segment => `${segment}\0`).join(''), 'utf8')
}

describe('parseStageOutput', () => {
  it('解析 NUL 分隔的 KEY=VALUE, 值里可以再出现等号', () => {
    expect(parseStageOutput(nul('PATH=/a:/b', 'FLAG=--x=1'))).toEqual({ PATH: '/a:/b', FLAG: '--x=1' })
  })

  it('只忽略末尾的空段', () => {
    expect(parseStageOutput(nul('A=1'))).toEqual({ A: '1' })
    expect(() => parseStageOutput(Buffer.from('A=1\0\0B=2\0', 'utf8'))).toThrow(StageOutputError)
  })

  it('拒绝没有等号, 空名字或非法名字的段', () => {
    expect(() => parseStageOutput(nul('NOEQUALS'))).toThrow(/not KEY=VALUE/)
    expect(() => parseStageOutput(nul('=value'))).toThrow(/not KEY=VALUE/)
    expect(() => parseStageOutput(nul('1BAD=1'))).toThrow(/invalid variable name/)
  })

  it('同名后者覆盖前者', () => {
    expect(parseStageOutput(nul('A=1', 'A=2'))).toEqual({ A: '2' })
  })

  it('末尾没有 NUL 也能解析', () => {
    expect(parseStageOutput(Buffer.from('A=1\0B=2', 'utf8'))).toEqual({ A: '1', B: '2' })
  })
})

describe('parseStageOutputWithReport 的输出容错', () => {
  it('默认就是严格模式', () => {
    expect(() => parseStageOutputWithReport(Buffer.from('noise\0', 'utf8'))).toThrow(StageOutputError)
  })

  it('打开后丢弃噪声段并计数', () => {
    expect(parseStageOutputWithReport(Buffer.from('noise\0A=1\0', 'utf8'), { filterNoise: true }))
      .toEqual({ env: { A: '1' }, skipped: 1 })
  })

  it('把噪声黏住的那个变量救回来', () => {
    // 真实形态: fish 配置往 stdout 打一行提示, 和下一个变量名挤在同一段里.
    const output = parseStageOutputWithReport(Buffer.from('Proxy on x set\nB=2\0A=1\0', 'utf8'), { filterNoise: true })
    expect(output).toEqual({ env: { B: '2', A: '1' }, skipped: 1 })
  })

  it('合法段里含换行的值不被动', () => {
    expect(parseStageOutputWithReport(Buffer.from('A=line1\nline2\0', 'utf8'), { filterNoise: true }))
      .toEqual({ env: { A: 'line1\nline2' }, skipped: 0 })
  })

  it('一段合法输出都没有时仍然失败', () => {
    expect(() => parseStageOutputWithReport(Buffer.from('noise\0more noise\0', 'utf8'), { filterNoise: true }))
      .toThrow(/no KEY=VALUE segment survived/)
  })
})
