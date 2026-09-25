/**
 * 单级 stage 的执行: `/bin/sh -c <命令>`, 带超时与输出上限.
 *
 * 这一层只负责"跑一条命令并把它的 stdout 按约定解析出来"; 累积与失败保留策略
 * 属于 pipeline. 进程用 `detached` 起成自己的进程组, 这样超时或取消时能连
 * `fish -c ...` 拉起来的子孙一起杀掉, 不会留下孤儿.
 * @module dsh-load-shell-env/stage-runner
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { MAX_STAGE_OUTPUT_BYTES, MAX_STAGE_STDERR_BYTES } from './constants.ts'
import { parseStageOutputWithReport } from './stage-output.ts'

/** 一级 stage 失败的原因分类. */
export type StageFailureKind =
  | 'spawn'
  | 'exit'
  | 'timeout'
  | 'aborted'
  | 'output-too-large'
  | 'invalid-output'

/** 一级 stage 失败了; 消息是可以直接给 user 看的一句话. */
export class StageRunError extends Error {
  /**
   * @param message - 一句话摘要.
   * @param kind - 失败分类.
   * @param stderr - 该级 stderr 的尾部 (可能为空), 只用于诊断.
   */
  constructor(message: string, readonly kind: StageFailureKind, readonly stderr: string) {
    super(message)
    this.name = 'StageRunError'
  }
}

/** 跑一级 stage 需要的东西. */
export interface StageRunRequest {
  /** 一条完整的 POSIX sh 命令行. */
  command: string
  /** 这一级进程的完整环境 (第一级是 Host 的继承环境, 之后是上一级的输出). */
  env: Record<string, string>
  /** 超时 (毫秒); 到点杀掉整个进程组. */
  timeoutMs: number
  /** 上游取消信号. */
  signal?: AbortSignal | undefined
  /** 输出里不合约定的段是否按噪声丢弃 (而不是让这一级失败). */
  filterNoise?: boolean | undefined
}

/** 一级 stage 成功后的结果. */
export interface StageRunResult {
  /** 该级输出解析出的环境映射. */
  env: Record<string, string>
  /** 该级 stderr 的尾部. */
  stderr: string
  /** 该级耗时 (毫秒). */
  durationMs: number
  /** 被当作噪声丢掉的段数. */
  skipped: number
}

/**
 * 执行一级 stage.
 * @param request - 命令, 环境, 超时与取消信号.
 * @returns 解析后的环境与 stderr 尾部.
 * @throws StageRunError 进程起不来, 退出码非 0, 超时, 被取消, 输出超限或不符合约定.
 */
export function runStage(request: StageRunRequest): Promise<StageRunResult> {
  const startedAt = Date.now()
  const child = spawn('/bin/sh', ['-c', request.command], {
    env: request.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  return new Promise<StageRunResult>((resolve, reject) => {
    const chunks: Buffer[] = []
    let stdoutBytes = 0
    let stderrTail = ''
    let failure: { kind: StageFailureKind; message: string } | undefined
    let settled = false
    let timer: NodeJS.Timeout | undefined

    /** 只在第一次结算, 并清掉计时器与 abort 监听. */
    const settle = (finish: () => void): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      request.signal?.removeEventListener('abort', onAbort)
      finish()
    }
    const fail = (kind: StageFailureKind, message: string): void => {
      failure = { kind, message }
      killGroup(child)
    }
    const onAbort = (): void => { fail('aborted', 'cancelled before the stage finished') }

    child.stdout?.on('data', (chunk: Buffer) => {
      if (failure !== undefined) return
      stdoutBytes += chunk.length
      if (stdoutBytes > MAX_STAGE_OUTPUT_BYTES) {
        fail('output-too-large', `stdout exceeded ${String(MAX_STAGE_OUTPUT_BYTES)} bytes`)
        return
      }
      chunks.push(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer) => { stderrTail = tail(stderrTail + chunk.toString('utf8'), MAX_STAGE_STDERR_BYTES) })

    child.on('error', (error: Error) => {
      settle(() => { reject(new StageRunError(`could not start /bin/sh: ${error.message}`, 'spawn', stderrTail)) })
    })
    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      settle(() => {
        const elapsed = Date.now() - startedAt
        if (failure !== undefined) {
          reject(new StageRunError(failure.message, failure.kind, stderrTail))
          return
        }
        if (code !== 0) {
          const how = signal === null ? `exit code ${String(code)}` : `signal ${signal}`
          reject(new StageRunError(`the stage failed with ${how}`, 'exit', stderrTail))
          return
        }
        try {
          const parsed = parseStageOutputWithReport(Buffer.concat(chunks), { filterNoise: request.filterNoise === true })
          resolve({ env: parsed.env, skipped: parsed.skipped, stderr: stderrTail, durationMs: elapsed })
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error)
          reject(new StageRunError(message, 'invalid-output', stderrTail))
        }
      })
    })

    if (request.signal !== undefined) {
      if (request.signal.aborted) onAbort()
      else request.signal.addEventListener('abort', onAbort, { once: true })
    }
    timer = setTimeout(() => {
      fail('timeout', `timed out after ${String(request.timeoutMs)}ms`)
    }, request.timeoutMs)
  })
}

/** 杀掉整个进程组; 拿不到进程组时退回杀直接子进程. */
function killGroup(child: ChildProcess): void {
  if (child.pid === undefined) return
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
}

/** 只保留文本末尾的 `limit` 个字符. */
function tail(text: string, limit: number): string {
  return text.length <= limit ? text : text.slice(text.length - limit)
}

/**
 * 取文本末尾若干行, 用于失败摘要.
 * @param text - 原始 stderr 尾部.
 * @param lines - 保留的行数.
 * @returns 去掉首尾空行后的尾部若干行.
 */
export function tailLines(text: string, lines: number): string {
  const trimmed = text.trim()
  if (trimmed === '') return ''
  const parts = trimmed.split('\n')
  return parts.slice(Math.max(0, parts.length - lines)).join('\n')
}
