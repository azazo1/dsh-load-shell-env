/**
 * 环境读取流水线: 顺序累积.
 *
 * 语义是"第 N 级以第 N-1 级的输出环境作为自己的进程环境": 先跑第 1 级拿到
 * env1, 再用 env1 当环境跑第 2 级拿到 env2, 依此类推; 进程之间没有父子关系
 * (不是套娃 shell). 只有最后一级成功的结果成为快照.
 * @module dsh-load-shell-env/pipeline
 */

import { STAGE_DIAGNOSTIC_LINES } from './constants.ts'
import { StageRunError, runStage, tailLines, type StageFailureKind } from './stage-runner.ts'

/** 流水线里的一级 (只含启用的级). */
export interface PipelineStage {
  /** 这一级在配置页里的行号, 从 1 开始; 用于失败报告, 与显示的行号一致. */
  index: number
  /** 完整的 POSIX sh 命令行. */
  command: string
}

/** 跑一次流水线需要的东西. */
export interface PipelineRequest {
  /** 按配置顺序排列的启用级. */
  stages: readonly PipelineStage[]
  /** 第一级看到的初始环境: Host 的继承环境 (已按 harness 规则过滤). */
  baseEnv: Record<string, string>
  /** 每一级各自的超时 (毫秒). */
  timeoutMs: number
  /** 上游取消信号. */
  signal?: AbortSignal | undefined
  /** 输出里不合约定的段是否按噪声丢弃 (而不是让这一级失败). */
  filterNoise?: boolean | undefined
}

/** 流水线成功的结果. */
export interface PipelineResult {
  /** 最后一级的输出; 没有启用的级时为空映射. */
  env: Record<string, string>
  /** 整条流水线的耗时 (毫秒). */
  durationMs: number
  /** 实际执行了几级. */
  stageCount: number
  /** 各级加起来被当作噪声丢掉的段数. */
  skipped: number
}

/** 流水线失败: 记录失败的行号与命令, 便于配置页直接指出来. */
export class PipelineError extends Error {
  /**
   * @param message - 一句话摘要 (含 stderr 尾部若干行).
   * @param stage - 失败的行号 (与配置页一致, 1 起).
   * @param command - 失败那一级的命令原文.
   * @param kind - 失败分类.
   */
  constructor(
    message: string,
    readonly stage: number,
    readonly command: string,
    readonly kind: StageFailureKind,
  ) {
    super(message)
    this.name = 'PipelineError'
  }
}

/**
 * 顺序执行流水线.
 *
 * 每一级失败即整次读取失败: 不产生新快照, 由调用方保留上一次成功的结果.
 * @param request - 级列表, 初始环境, 超时与取消信号.
 * @returns 最后一级的环境与耗时.
 * @throws PipelineError 某一级失败.
 */
export async function runPipeline(request: PipelineRequest): Promise<PipelineResult> {
  const startedAt = Date.now()
  let env = request.baseEnv
  let snapshot: Record<string, string> = {}
  let skipped = 0
  for (const stage of request.stages) {
    let result
    try {
      result = await runStage({
        command: stage.command,
        env,
        timeoutMs: request.timeoutMs,
        ...request.signal === undefined ? {} : { signal: request.signal },
        ...request.filterNoise === undefined ? {} : { filterNoise: request.filterNoise },
      })
    } catch (error: unknown) {
      if (error instanceof StageRunError) {
        throw new PipelineError(
          composeFailureMessage(error),
          stage.index,
          stage.command,
          error.kind,
        )
      }
      throw error
    }
    env = result.env
    snapshot = result.env
    skipped += result.skipped
  }
  return { env: snapshot, durationMs: Date.now() - startedAt, stageCount: request.stages.length, skipped }
}

/** 把一句话摘要与 stderr 尾部拼成可展示的失败消息. */
function composeFailureMessage(error: StageRunError): string {
  const diagnostic = tailLines(error.stderr, STAGE_DIAGNOSTIC_LINES)
  return diagnostic === '' ? error.message : `${error.message}: ${diagnostic}`
}
