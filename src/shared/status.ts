/**
 * Host 与 Client 共用的状态契约.
 *
 * 这一份只能出现纯数据 (类型, 字面量), 不能 import 任何 node 或宿主包: Client
 * bundle 会把 `src/` 下的共享模块内联, 而浏览器里没有这些模块.
 * @module dsh-load-shell-env/shared/status
 */

/** 一次环境读取的生命周期阶段. */
export type ShellEnvPhase =
  /** 总开关关闭: 插件不执行任何命令, 也不注入任何东西. */
  | 'disabled'
  /** 开关打开但还没有读过 (例如刚启动). */
  | 'idle'
  /** 正在读. */
  | 'reading'
  /** 最近一次读取成功. */
  | 'ready'
  /** 最近一次读取失败, 快照保留上一次成功的结果. */
  | 'failed'

/** 一次失败的原因摘要; 只有变量名与命令原文, 不含任何环境值. */
export interface ShellEnvFailure {
  /** 失败的级号, 从 1 开始; 与具体级无关的失败 (配置错误) 没有这个字段. */
  stage?: number
  /** 失败的那一级命令原文, 与 stage 同时出现. */
  command?: string
  /** 脱敏后的一句话摘要. */
  message: string
}

/** 终端进程继承的当前状态. */
export interface ShellEnvTerminalStatus {
  /** 终端继承开关的当前值 (来自配置). */
  enabled: boolean
  /** 包装是否装上了; `false` 表示这个组合里终端继承不可用. */
  hooked: boolean
}

/**
 * 配置页读到的状态.
 *
 * 只有变量名清单, 没有变量值; 失败摘要也只保留 stderr 的尾部几行.
 */
export interface ShellEnvStatus {
  /** 当前的读取阶段. */
  phase: ShellEnvPhase
  /** 总开关的当前值 (来自配置). */
  enabled: boolean
  /** 最近一次成功读取的时间 (ISO 字符串). */
  lastReadAt?: string
  /** 最近一次读取耗时 (毫秒), 成功与失败都记. */
  durationMs?: number
  /** 当前注入子进程的变量个数 (白名单命中与自定义 env 的并集). */
  importedCount: number
  /** 当前注入子进程的变量名. */
  importedNames: string[]
  /** 打开输出容错时, 最近一次读取被当作噪声丢掉的段数; 严格模式下不出现. */
  skippedSegments?: number
  /** 最近一次失败的原因. */
  error?: ShellEnvFailure
  /** 终端继承的状态; 由 Host 半区附加, 快照自身不关心终端. */
  terminal?: ShellEnvTerminalStatus
}

/** 一个尚未读过任何东西的初始状态. */
export function initialStatus(enabled: boolean): ShellEnvStatus {
  return {
    phase: enabled ? 'idle' : 'disabled',
    enabled,
    importedCount: 0,
    importedNames: [],
  }
}
