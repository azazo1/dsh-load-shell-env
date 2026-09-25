/**
 * 自定义 env: `.env` 风格的逐行文本, 支持 `$VAR` / `${VAR}` 展开与删除语义.
 *
 * 这一层排在流水线之后, 是 user 手写覆盖的地方; 展开时看到的取值来源是
 * "继承环境 + 白名单快照" 再叠上**本文件里前面几条**的结果 (自上而下累积),
 * 所以 `PATH=$PATH:$HOME/.local/bin` 这类写法按直觉工作.
 * @module dsh-load-shell-env/custom-env
 */

import { ENV_NAME_PATTERN } from './constants.ts'

/** 一条解析后的赋值 (值尚未展开). */
export interface CustomEnvAssignment {
  /** 变量名. */
  name: string
  /** 等号右侧的原文, 已去掉成对的引号. */
  value: string
  /** 文本里的行号, 从 1 开始. */
  line: number
}

/** 自定义 env 文本不合法. */
export class CustomEnvError extends Error {
  /**
   * @param message - 一句话说明.
   * @param line - 出问题的行号, 从 1 开始.
   */
  constructor(message: string, readonly line: number) {
    super(message)
    this.name = 'CustomEnvError'
  }
}

/** 展开过程中的错误; 由 {@link applyCustomEnv} 补上行号后重抛. */
class ExpansionError extends Error {}

/**
 * 解析 `.env` 风格文本.
 *
 * - `KEY=VALUE` 定义一条, 行首 `#` 与空行忽略, 行尾 `\r` 去掉;
 * - 值两侧成对的单引号或双引号会被去掉 (与 `.env` 习惯一致);
 * - 没有 `=` 或变量名不合法视为配置错误.
 * @param text - 多行文本.
 * @returns 按出现顺序排列的赋值.
 * @throws CustomEnvError 某一行不合约定的写法.
 */
export function parseCustomEnv(text: string): CustomEnvAssignment[] {
  const assignments: CustomEnvAssignment[] = []
  const lines = text.split('\n')
  for (const [offset, raw] of lines.entries()) {
    const line = offset + 1
    const content = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    const trimmed = content.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const separator = content.indexOf('=')
    if (separator < 0) throw new CustomEnvError(`line ${String(line)}: expected KEY=VALUE`, line)
    const name = content.slice(0, separator).trim()
    if (!ENV_NAME_PATTERN.test(name)) {
      throw new CustomEnvError(`line ${String(line)}: "${name}" is not a valid environment variable name`, line)
    }
    assignments.push({ name, value: stripQuotes(content.slice(separator + 1)), line })
  }
  return assignments
}

/**
 * 把赋值展开后叠加到给定的取值来源上.
 *
 * 空值 (包括 `KEY=` 与 `KEY=""`) 是 tombstone: 该变量从子进程环境里删除, 而不是
 * 设成空串. 展开时未定义的变量按空串处理 (`\$` 表示字面量 `$`).
 * @param assignments - {@link parseCustomEnv} 的结果.
 * @param base - 本次展开的初始取值来源 (继承环境 + 白名单快照).
 * @returns 需要在子进程环境里覆盖或删除的条目; 同名的后者覆盖前者.
 * @throws CustomEnvError 展开语法不合法.
 */
export function applyCustomEnv(
  assignments: readonly CustomEnvAssignment[],
  base: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  const scope: Record<string, string | undefined> = { ...base }
  const entries: Record<string, string | undefined> = {}
  for (const assignment of assignments) {
    let expanded: string
    try {
      expanded = expandVariables(assignment.value, scope)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      throw new CustomEnvError(`line ${String(assignment.line)}: ${message}`, assignment.line)
    }
    const value = expanded === '' ? undefined : expanded
    scope[assignment.name] = value
    entries[assignment.name] = value
  }
  return entries
}

/**
 * 展开一段值里的 `$VAR` / `${VAR}` / `\$`.
 * @param value - 待展开的文本.
 * @param scope - 变量名到值的映射; 缺席或 undefined 展开成空串.
 * @returns 展开后的文本.
 * @throws ExpansionError `${...}` 没有收尾或变量名不合法.
 */
export function expandVariables(value: string, scope: Readonly<Record<string, string | undefined>>): string {
  let result = ''
  for (let index = 0; index < value.length; index++) {
    const char = value[index]!
    if (char === '\\' && value[index + 1] === '$') {
      result += '$'
      index++
      continue
    }
    if (char !== '$') {
      result += char
      continue
    }
    const next = value[index + 1]
    if (next === '{') {
      const end = value.indexOf('}', index + 2)
      if (end < 0) throw new ExpansionError('unterminated ${...} expansion')
      const name = value.slice(index + 2, end)
      if (!ENV_NAME_PATTERN.test(name)) throw new ExpansionError(`"${name}" is not a valid variable name`)
      result += scope[name] ?? ''
      index = end
      continue
    }
    if (next !== undefined && /[A-Za-z_]/.test(next)) {
      let end = index + 1
      while (end < value.length && /[A-Za-z0-9_]/.test(value[end]!)) end++
      result += scope[value.slice(index + 1, end)] ?? ''
      index = end - 1
      continue
    }
    // 单独的 `$` 原样保留, 不做命令替换之类的扩展.
    result += char
  }
  return result
}

/** 去掉值两侧成对的引号. */
function stripQuotes(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}
