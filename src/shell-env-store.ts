/**
 * 快照与状态机: 什么时候读, 读失败怎么办, 以及往子进程里注什么.
 *
 * 三条约束来自设计:
 * - 同一时刻只有一次读取在飞, 并发的刷新请求复用同一次读取, 不排队堆积;
 * - 某一级失败时整次读取失败, 保留上一次成功的快照, 状态置为 failed;
 * - `enabled` 由真变假时立刻清空快照, 命令马上回到继承环境.
 *
 * 快照只在内存, 不落盘.
 * @module dsh-load-shell-env/shell-env-store
 */

import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import { assertCustomEnvNames, ShellEnvConfigError } from './config.ts'
import { applyCustomEnv, parseCustomEnv } from './custom-env.ts'
import { withPathBootstrap } from './path-bootstrap.ts'
import { PipelineError, runPipeline, type PipelineRequest, type PipelineResult, type PipelineStage } from './pipeline.ts'
import { initialStatus, type ShellEnvFailure, type ShellEnvStatus } from './shared/status.ts'

/** store 需要的日志面; 只保留实际用到的两个等级, 便于测试传入假 logger. */
export interface ShellEnvLogger {
  info(message: string): void
  warn(message: string): void
}

/** 一次读取用的配置快照 (已归一化, 只含启用的级). */
export interface ShellEnvReadConfig {
  /** 总开关. */
  enabled: boolean
  /** 启用的级, 顺序即执行顺序; `index` 是配置页上的行号. */
  stages: readonly PipelineStage[]
  /** 允许从快照注入子进程的变量名. */
  importNames: readonly string[]
  /** `.env` 风格的自定义 env 文本. */
  customEnv: string
  /** 每一级的超时 (毫秒). */
  envTimeoutMs: number
  /** 输出里不合约定的段是否按噪声丢弃. */
  filterNoise: boolean
}

/** store 的依赖; 除 readConfig 外都有默认实现, 测试可整块替换. */
export interface ShellEnvStoreOptions {
  /** 读当前配置 (每次读取前调用, 保证拿到最新的 volatile 值). */
  readConfig: () => ShellEnvReadConfig
  /** 第一级看到的初始环境; 默认 `scrubbedParentEnv()` 再补上 PATH 引导目录 (见 path-bootstrap). */
  baseEnv?: () => Record<string, string>
  /** 跑流水线; 默认 {@link runPipeline}. */
  runPipeline?: (request: PipelineRequest) => Promise<PipelineResult>
  /** 日志. */
  logger?: ShellEnvLogger
  /** 当前时间, 便于测试. */
  now?: () => Date
}

/** 手动刷新的触发来源, 只进日志. */
export type ShellEnvTrigger = 'boot' | 'config' | 'manual'

/**
 * 环境快照与注入层的所有者.
 *
 * 注入层的优先级 (低到高): 继承环境 < 白名单命中的快照值 < 自定义 env;
 * executor 会把这一层整体叠在 `spec.env` 之上, 而 `dshEnv` 仍然最高 (由
 * `bash-local` 的 spawnSpec 保证).
 */
export class ShellEnvStore {
  private readonly baseEnv: () => Record<string, string>
  private readonly pipeline: (request: PipelineRequest) => Promise<PipelineResult>
  private readonly logger: ShellEnvLogger | undefined
  private readonly now: () => Date

  private config: ShellEnvReadConfig | undefined
  private signature = ''
  private snapshot: Record<string, string> | undefined
  private injection: Record<string, string | undefined> = {}
  private importedNames: string[] = []
  private state: ShellEnvStatus = initialStatus(false)
  private inflight: Promise<ShellEnvStatus> | undefined
  private rerun = false
  private cachedBaseEnv: Record<string, string> | undefined

  constructor(private readonly options: ShellEnvStoreOptions) {
    this.baseEnv = options.baseEnv ?? (() => (this.cachedBaseEnv ??= withPathBootstrap(scrubbedParentEnv())))
    this.pipeline = options.runPipeline ?? runPipeline
    this.logger = options.logger
    this.now = options.now ?? (() => new Date())
  }

  /**
   * 应用一份新配置.
   *
   * 关闭时立刻清空快照; 打开且配置有变化时重新读一次. 读取还在飞的时候到达的
   * 配置变化会在这次读完后补一次读取, 保证生效的配置与状态一致.
   * @param config - 归一化后的配置.
   */
  applyConfig(config: ShellEnvReadConfig): void {
    const signature = signatureOf(config)
    const changed = signature !== this.signature || this.config === undefined
    this.config = config
    this.signature = signature
    if (!config.enabled) {
      this.disable()
      return
    }
    try {
      this.recomputeInjection(config)
    } catch (error: unknown) {
      this.reportConfigError(error)
      return
    }
    if (!changed && this.snapshot !== undefined) return
    if (this.inflight !== undefined) {
      this.rerun = true
      return
    }
    void this.refresh('config')
  }

  /**
   * 手动或按配置重读一次环境.
   * @param trigger - 触发来源.
   * @returns 这次读取结束后的状态; 已有读取在飞时直接复用它.
   */
  refresh(trigger: ShellEnvTrigger): Promise<ShellEnvStatus> {
    const config = this.config
    if (config === undefined || !config.enabled) {
      this.disable()
      return Promise.resolve(this.state)
    }
    this.inflight ??= this.performRead(trigger).finally(() => {
      this.inflight = undefined
      if (this.rerun && this.config?.enabled === true) {
        this.rerun = false
        void this.refresh('config')
      }
    })
    return this.inflight
  }

  /** 当前状态 (只读快照). */
  status(): ShellEnvStatus {
    return this.state
  }

  /** 当前要注入子进程的环境层; 没有可注入的东西时是空对象. */
  injectedEnv(): Record<string, string | undefined> {
    return this.injection
  }

  /** 配置不合法时的状态处理: 保留上一次可用的注入层, 只把状态置为失败. */
  reportConfigError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    this.logger?.warn(`shell env config is not usable: ${message}`)
    this.state = {
      phase: 'failed',
      enabled: this.config?.enabled ?? false,
      importedCount: this.importedNames.length,
      importedNames: [...this.importedNames],
      error: { message },
    }
  }

  /** 关掉总开关: 清空快照与注入层. */
  private disable(): void {
    this.snapshot = undefined
    this.injection = {}
    this.importedNames = []
    this.state = initialStatus(false)
  }

  /** 真正跑一次读取. */
  private async performRead(trigger: ShellEnvTrigger): Promise<ShellEnvStatus> {
    const config = this.config
    if (config === undefined || !config.enabled) return this.state
    const startedAt = Date.now()
    this.state = {
      phase: 'reading',
      enabled: true,
      importedCount: this.importedNames.length,
      importedNames: [...this.importedNames],
    }
    try {
      let snapshot: Record<string, string> = {}
      let durationMs = 0
      let skipped = 0
      if (config.stages.length > 0) {
        const result = await this.pipeline({
          stages: config.stages,
          baseEnv: this.baseEnv(),
          timeoutMs: config.envTimeoutMs,
          filterNoise: config.filterNoise,
        })
        snapshot = result.env
        durationMs = result.durationMs
        skipped = result.skipped
      }
      this.snapshot = snapshot
      this.recomputeInjection(config)
      this.state = {
        phase: 'ready',
        enabled: true,
        lastReadAt: this.now().toISOString(),
        durationMs,
        importedCount: this.importedNames.length,
        importedNames: [...this.importedNames],
        ...skipped > 0 ? { skippedSegments: skipped } : {},
      }
      this.logger?.info(`shell env snapshot refreshed (${trigger}): ${String(this.importedNames.length)} variables from ${String(config.stages.length)} stage(s) in ${String(durationMs)}ms${skipped > 0 ? `, ${String(skipped)} noise segment(s) dropped` : ''}`)
    } catch (error: unknown) {
      // 保留上一次成功的快照与注入层, 只更新状态.
      this.state = {
        phase: 'failed',
        enabled: true,
        durationMs: Date.now() - startedAt,
        importedCount: this.importedNames.length,
        importedNames: [...this.importedNames],
        error: failureOf(error),
      }
      this.logger?.warn(`shell env read failed (${trigger}): ${this.state.error?.message ?? 'unknown error'}`)
    }
    return this.state
  }

  /** 按白名单与自定义 env 重算注入层. */
  private recomputeInjection(config: ShellEnvReadConfig): void {
    // 配置错误在这里也当成失败: 名字不合法或自定义 env 解析不了都不该静默.
    assertCustomEnvNames('customEnv', config.customEnv)
    const snapshot = this.snapshot ?? {}
    const whitelisted: Record<string, string> = {}
    for (const name of config.importNames) {
      const value = snapshot[name]
      if (value !== undefined) whitelisted[name] = value
    }
    const custom = applyCustomEnv(parseCustomEnv(config.customEnv), { ...this.baseEnv(), ...whitelisted })
    this.injection = { ...whitelisted, ...custom }
    this.importedNames = Object.keys(this.injection).sort()
  }
}

/** 配置指纹: 决定一次 volatile 更新是否需要重读. */
function signatureOf(config: ShellEnvReadConfig): string {
  return JSON.stringify({
    enabled: config.enabled,
    envTimeoutMs: config.envTimeoutMs,
    importNames: config.importNames,
    customEnv: config.customEnv,
    filterNoise: config.filterNoise,
    stages: config.stages,
  })
}

/** 把失败对象收敛成状态里的摘要. */
function failureOf(error: unknown): ShellEnvFailure {
  if (error instanceof PipelineError) {
    return { stage: error.stage, command: error.command, message: error.message }
  }
  if (error instanceof ShellEnvConfigError) return { message: error.message }
  return { message: error instanceof Error ? error.message : String(error) }
}
