/**
 * 一级 stage 输出的解析.
 *
 * 约定是 `env -0` 那一类输出: NUL 分隔的 `KEY=VALUE`.
 *
 * 默认**严格**: 任何不合约定的段都让这一级失败, 免得混进 stdout 的噪声被当成环境值
 * 悄悄吞掉. 打开 `filterNoise` 之后改为容错: 不合约定的段被丢弃并计数 (状态行会报告
 * 丢了几段), 其中"噪声黏住了下一个变量"这种最常见的情况还会尽力把那一个变量救回来;
 * 如果一段合法输出都没有, 仍然算这一级失败.
 * @module dsh-load-shell-env/stage-output
 */

import { ENV_NAME_PATTERN } from './constants.ts'

/** 输出不符合约定. */
export class StageOutputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StageOutputError'
  }
}

/** 解析选项. */
export interface StageOutputOptions {
  /** 丢弃不合约定的段并计数, 而不是让这一级失败. */
  filterNoise?: boolean
}

/** 解析结果: 环境映射, 以及被当作噪声丢掉的段数. */
export interface StageOutput {
  /** 变量名到值的映射. */
  env: Record<string, string>
  /** 丢弃的噪声段数; 严格模式下必然是 0. */
  skipped: number
}

/**
 * 严格解析一级 stage 的 stdout.
 *
 * - 按 `\0` 切分, 只忽略**末尾**的空段 (NUL 结尾留下的那一个).
 * - 每一段必须匹配 `^[^=]+=.*$`, 且等号左侧是合法的变量名.
 * - 同一变量名出现多次时后者覆盖前者.
 * @param stdout - 该级进程的完整 stdout.
 * @returns 变量名到值的映射.
 * @throws StageOutputError 出现不合约定的段.
 */
export function parseStageOutput(stdout: Buffer): Record<string, string> {
  return parseStageOutputWithReport(stdout).env
}

/**
 * 按选项解析一级 stage 的 stdout.
 * @param stdout - 该级进程的完整 stdout.
 * @param options - 解析选项; 默认严格.
 * @returns 环境映射与丢弃的噪声段数.
 * @throws StageOutputError 严格模式下出现不合约定的段, 或容错模式下没解析出任何变量.
 */
export function parseStageOutputWithReport(stdout: Buffer, options: StageOutputOptions = {}): StageOutput {
  const filterNoise = options.filterNoise === true
  const segments = stdout.toString('utf8').split('\0')
  const env: Record<string, string> = {}
  let skipped = 0
  for (const [index, segment] of segments.entries()) {
    if (segment === '') {
      // 只允许末尾的空段; 中间的空段意味着输出里出现了空洞.
      if (index === segments.length - 1) continue
      if (filterNoise) {
        skipped += 1
        continue
      }
      throw new StageOutputError(`empty segment at position ${String(index + 1)}; expected NUL-separated KEY=VALUE pairs without gaps`)
    }
    const parsed = parseSegment(segment)
    if (parsed.ok) {
      env[parsed.name] = parsed.value
      continue
    }
    if (!filterNoise) {
      throw new StageOutputError(`segment ${String(index + 1)} ${parsed.reason}: ${describeSegment(segment)}`)
    }
    skipped += 1
    // 最常见的噪声形态: 一行提示被写在了下一个变量中间, 于是两者黏成一段.
    // 从后往前找第一行像 KEY=VALUE 的, 把那个变量救回来.
    const recovered = recoverFromNoise(segment)
    if (recovered !== undefined) env[recovered.name] = recovered.value
  }
  if (filterNoise && skipped > 0 && Object.keys(env).length === 0) {
    throw new StageOutputError(`no KEY=VALUE segment survived; all ${String(skipped)} segment(s) were noise`)
  }
  return { env, skipped }
}

/** 一段的解析结论. */
type SegmentParse =
  | { ok: true, name: string, value: string }
  | { ok: false, reason: string }

/** 解析一段. */
function parseSegment(segment: string): SegmentParse {
  const separator = segment.indexOf('=')
  if (separator <= 0) return { ok: false, reason: 'is not KEY=VALUE' }
  const name = segment.slice(0, separator)
  if (!ENV_NAME_PATTERN.test(name)) return { ok: false, reason: 'has an invalid variable name' }
  return { ok: true, name, value: segment.slice(separator + 1) }
}

/** 在被噪声污染的段里找最后一个像变量定义的行. */
function recoverFromNoise(segment: string): { name: string, value: string } | undefined {
  const lines = segment.split('\n')
  for (let index = lines.length - 1; index >= 0; index--) {
    const parsed = parseSegment(lines[index] ?? '')
    if (parsed.ok) return { name: parsed.name, value: parsed.value }
  }
  return undefined
}

/** 截断并转义一段文本用于诊断, 免得一份巨长输出把日志撑开. */
function describeSegment(segment: string): string {
  const clipped = segment.length > 80 ? `${segment.slice(0, 80)}...` : segment
  return JSON.stringify(clipped)
}
